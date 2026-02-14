
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ListenerView from './components/Listener/ListenerView';
import AdminView from './components/Admin/AdminView';
import PasswordModal from './components/Shared/PasswordModal';
import RadioPlayer from './components/Listener/RadioPlayer';
import { dbService } from './services/dbService';
import { scanNigerianNewspapers } from './services/newsAIService';
import { getDetailedBulletinAudio, getNewsAudio, getJingleAudio } from './services/aiDjService';
import { UserRole, MediaFile, AdminMessage, AdminLog, NewsItem, ListenerReport } from './types';
import { DESIGNER_NAME, APP_NAME, JINGLE_1, JINGLE_2, NEWS_BGM_VOLUME, NEWSCASTER_NAME } from './constants';
import { generateNewsBackgroundMusicAsync } from './services/backgroundMusicService';
import { generatePodcastScript, generatePodcastAudio } from './services/podcastService';
import NDRTVEngine from './components/Admin/NewsRoom/NDRTVEngine';
import ThompsonEngine from './components/Admin/NewsRoom/ThompsonEngine';
import FavourEngine from './components/Admin/NewsRoom/FavourEngine';
import { supabase } from './services/supabaseClient';
import TVPlayer from './components/Listener/TVChannel/TVPlayer';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>(UserRole.LISTENER);
  const [showAuth, setShowAuth] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [sponsoredMedia, setSponsoredMedia] = useState<MediaFile[]>([]);
  const [audioPlaylist, setAudioPlaylist] = useState<MediaFile[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [reports, setReports] = useState<ListenerReport[]>([]);
  const [allMedia, setAllMedia] = useState<MediaFile[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState<string>('');
  const [manualScript, setManualScript] = useState<string>('');
  const [newsHistory, setNewsHistory] = useState<NewsItem[]>([]);

  const [isPlaying, setIsPlaying] = useState(false); // Radio Play State (Admin broadcast)
  const [radioCurrentTime, setRadioCurrentTime] = useState(0); // LIVE POSITION
  const [listenerHasPlayed, setListenerHasPlayed] = useState(false); // Listener play button state
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeTrackUrl, setActiveTrackUrl] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState<string>('Station Standby');
  const [isShuffle, setIsShuffle] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [audioStatus, setAudioStatus] = useState<string>('Ready');
  const [isTvActive, setIsTvActive] = useState(false); // TV Active State
  const [lastError, setLastError] = useState<string>('');
  const [isDuckingNDR, setIsDuckingNDR] = useState(false);
  const [isDuckingThompson, setIsDuckingThompson] = useState(false);
  const [isDuckingFavour, setIsDuckingFavour] = useState(false);
  const isDucking = isDuckingNDR || isDuckingThompson || isDuckingFavour;
  const [currentLocation, setCurrentLocation] = useState<string>("Global");
  const [newsTriggerCount, setNewsTriggerCount] = useState(0);
  const [manualNewsTriggerCount, setManualNewsTriggerCount] = useState(0);
  const [stopTriggerCount, setStopTriggerCount] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false); // Global station play state
  const [cloudStatus, setCloudStatus] = useState<string>('Initializing Satellite...');
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [adminConflict, setAdminConflict] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  const isTvActiveRef = useRef(isTvActive);
  const activeTrackIdRef = useRef(activeTrackId);
  const currentTrackNameRef = useRef(currentTrackName);
  const activeTrackUrlRef = useRef(activeTrackUrl);
  const activeVideoIdRef = useRef(activeVideoId);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isTvActiveRef.current = isTvActive; }, [isTvActive]);
  useEffect(() => { activeTrackIdRef.current = activeTrackId; }, [activeTrackId]);
  useEffect(() => { currentTrackNameRef.current = currentTrackName; }, [currentTrackName]);
  useEffect(() => { activeTrackUrlRef.current = activeTrackUrl; }, [activeTrackUrl]);
  useEffect(() => { activeVideoIdRef.current = activeVideoId; }, [activeVideoId]);

  const aiAudioContextRef = useRef<AudioContext | null>(null);
  const isSyncingRef = useRef(false);
  const pendingAudioRef = useRef<Uint8Array | null>(null);
  const lastBroadcastMarkerRef = useRef<string>("");
  const activeAiAudioRef = useRef<HTMLAudioElement | null>(null);
  const aiPlaybackResolverRef = useRef<(() => void) | null>(null);

  const mediaUrlCache = useRef<Map<string, string>>(new Map());
  const playlistRef = useRef<MediaFile[]>([]);
  const allMediaRef = useRef<MediaFile[]>([]); // SYNC LOCK


  const preCacheJingles = useCallback(async () => {
    console.log("⚡ Pre-caching jingles for instant playback...");
    await getJingleAudio(JINGLE_1);
    await getJingleAudio(JINGLE_2);
  }, []);

  const cleanTrackName = (name: string) => {
    return name.replace(/\.(mp3|wav|m4a|aac|ogg|flac|webm|wma)$/i, '');
  };

  // Optimized Track URL Setter
  const updateTrackUrl = useCallback((id: string | null, url: string | null, name: string) => {
    setActiveTrackId(prevId => {
      if (prevId === id) return prevId;
      return id;
    });
    setActiveTrackUrl(prevUrl => {
      if (prevUrl === url) return prevUrl;
      return url;
    });
    setCurrentTrackName(prevName => {
      if (prevName === name) return prevName;
      return name;
    });
  }, []);

  const hasInitialSyncRef = useRef(false);

  const fetchData = useCallback(async (forceScan: boolean = false) => {
    try {
      if (forceScan) {
        setBroadcastStatus(`📡 Manual Satellite Re-Sync...`);
        const wire = await scanNigerianNewspapers(currentLocation, true);
        if (wire.news?.length) {
          setNews(prev => {
            const combined = [...prev, ...wire.news];
            const unique = combined.filter((item, index, self) => index === self.findIndex(n => n.id === item.id));
            const final = unique.slice(0, 50);
            dbService.saveNews(final);
            return final;
          });
        }
      }

      const [l, m, msg, rep, cloudNews, sState] = await Promise.all([
        dbService.getLogs(),
        dbService.getMediaCloud(),
        dbService.getAdminMessagesCloud(),
        dbService.getReportsCloud(),
        dbService.getNewsFromCloud(),
        dbService.getStationState()
      ]);

      setNews(cloudNews || []);

      const mediaItems = m || [];
      const processedMedia = mediaItems.map(item => {
        if (item.file) {
          let url = mediaUrlCache.current.get(item.id);
          if (!url) {
            url = URL.createObjectURL(item.file);
            mediaUrlCache.current.set(item.id, url);
          }
          return { ...item, url: item.url || url };
        }
        return item;
      });

      setLogs(l || []);
      setAllMedia(processedMedia);
      allMediaRef.current = processedMedia;
      setSponsoredMedia(processedMedia.filter(item => item.type === 'video' || item.type === 'image'));
      setAudioPlaylist(processedMedia.filter(item => item.type === 'audio'));
      setAdminMessages(msg || []);
      setReports(rep || []);

      // Apply initial station state for sync
      if (sState) {
        // STATE GUARD: Only apply remote state if:
        // 1. We are a listener (listeners must follow the station)
        // 2. OR we are an admin but have NOT done our initial sync yet
        const isActuallyNone = !activeTrackIdRef.current && !activeTrackUrlRef.current;
        const shouldApplySync = (role === UserRole.LISTENER) || (role === UserRole.ADMIN && !hasInitialSyncRef.current && isActuallyNone);

        if (shouldApplySync) {
          console.log("🔄 [App] Syncing Initial Station State...");
          setIsPlaying(sState.is_playing);
          setIsTvActive(sState.is_tv_active);
          updateTrackUrl(sState.current_track_id, sState.current_track_url, sState.current_track_name || 'Station Standby');
          setRadioCurrentTime(sState.current_offset || 0);

          if (role === UserRole.ADMIN) {
            hasInitialSyncRef.current = true;
          }
        }
      }

      const ms = await dbService.getManualScript();
      setManualScript(ms || '');

      const history = await dbService.getNewsHistory();
      setNewsHistory(history || []);

      if (activeTrackIdRef.current && !activeTrackUrlRef.current) {
        const activeTrack = processedMedia.find(t => t.id === activeTrackIdRef.current);
        if (activeTrack) updateTrackUrl(activeTrack.id, activeTrack.url, activeTrack.name);
      }
    } catch (err) {
      console.error("Data fetch error", err);
    }
  }, [role, updateTrackUrl, currentLocation]); // Removed activeTrackId/Url to break loop

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // LIVE OFFSET TRACKING REF
  const radioCurrentTimeRef = useRef(0);
  useEffect(() => {
    radioCurrentTimeRef.current = radioCurrentTime;
  }, [radioCurrentTime]);

  useEffect(() => {
    if (role === UserRole.ADMIN) {
      console.log("👔 [App] Admin logged in, refreshing media library...");
      fetchData();
    }
  }, [role, fetchData]);

  const handleResetSync = useCallback(() => {
    console.log("🔄 [App] Hard Resetting Station Sync...");
    hasInitialSyncRef.current = false;
    fetchData();
  }, [fetchData]);

  // --- SUPABASE REAL-TIME SYNC ---
  useEffect(() => {
    if (!supabase) return;

    console.log("🔥 [Supabase] Initializing Real-time Subscriptions...");

    // 1. Station State Subscription
    const stateChannel = supabase
      .channel('station_state_changes')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'station_state' }, (payload: any) => {
        const newState = payload.new;
        if (role === UserRole.LISTENER) {
          console.log("📻 [Supabase] Remote State Update:", newState);
          setIsPlaying(newState.is_playing);
          setIsTvActive(newState.is_tv_active);

          if (newState.current_video_id) {
            setActiveVideoId(newState.current_video_id);
          }

          if (newState.current_offset !== undefined) {
            // COMPENSATED SYNC: Add lag compensation (Now - LastUpdated)
            // timestamp is in ms, offset is in seconds
            const lastUpdated = newState.timestamp || Date.now();
            const latencyInSeconds = (Date.now() - lastUpdated) / 1000;
            const compensatedOffset = newState.current_offset + latencyInSeconds;

            // Only update if it's statistically significant to avoid micro-jitters
            console.log(`⏱️ [Sync] Base: ${newState.current_offset}s | Latency: ${latencyInSeconds.toFixed(2)}s | Target: ${compensatedOffset.toFixed(2)}s`);
            setRadioCurrentTime(compensatedOffset);
          }

          if (newState.current_track_id) {
            console.log("🎯 [App] Listener Syncing Track:", newState.current_track_name);
            updateTrackUrl(newState.current_track_id, newState.current_track_url, newState.current_track_name);

            // Re-sync URL from library if the cloud URL is missing but ID is present
            if (!newState.current_track_url && allMediaRef.current.length > 0 && newState.current_track_id !== 'jingle') {
              const track = allMediaRef.current.find(m => m.id === newState.current_track_id);
              if (track && track.url) {
                console.log("🔗 [App] Resolved URL from local library:", track.url);
                updateTrackUrl(newState.current_track_id, track.url, newState.current_track_name);
              }
            }
          }

          // Force join prompt if not played yet and station is live
          if (newState.is_playing && !listenerHasPlayed) {
            setShowJoinPrompt(true);
            setCloudStatus('📡 BROADCAST LIVE - TAP TO JOIN');
          } else if (newState.is_playing) {
            setCloudStatus(`🎵 Live: ${newState.current_track_name || 'Music'}`);
          } else {
            setCloudStatus('📡 Station Standby');
          }
          setIsPlayingState(newState.is_playing);

          // Conflict Detection: If someone else is pulsing as Admin with a different sessionId
          if (role === UserRole.ADMIN && newState.timestamp > (Date.now() - 30000)) {
            // If the state was updated recently by someone else (id logic needs schema update, for now we use name or just warn)
            // Ideally we'd have broad_caster_id in schema
          }
        }
      })
      .subscribe((status) => {
        console.log("🔥 [Supabase] Subscription Status:", status);
        if (status === 'SUBSCRIBED') setCloudStatus('✅ Satellite Connected');
        else if (status === 'CHANNEL_ERROR') setCloudStatus('❌ Satellite Error');
      });

    // 2. News Subscription
    const newsChannel = supabase
      .channel('news_changes')
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'news_items' }, () => {
        fetchData();
      })
      .subscribe();

    // 3. Admin Messages Subscription
    const msgChannel = supabase
      .channel('admin_msg_changes')
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'admin_messages' }, () => {
        fetchData();
      })
      .subscribe();

    // 4. Media Files Subscription (CRITICAL for Listener Sync)
    const mediaChannel = supabase
      .channel('media_files_changes')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'media_files' }, (payload: any) => {
        console.log("🎵 [Supabase] Media Library Update:", payload.eventType);
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(newsChannel);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(mediaChannel);
    };
  }, [role, fetchData]); // fetchData is stable from useCallback

  // --- ADMIN MASTER SYNC & PULSE ---
  useEffect(() => {
    if (role === UserRole.ADMIN && supabase) {
      const syncStation = () => {
        const urlToSync = activeTrackUrlRef.current;
        const isUrl = urlToSync && (urlToSync.startsWith('http') || urlToSync.startsWith('https'));
        const isCloudUrl = isUrl && !urlToSync?.startsWith('blob:');
        const isJingle = activeTrackIdRef.current === 'jingle' || (!isUrl && urlToSync && urlToSync.toLowerCase().includes('.mp3'));

        console.log("📤 [App] Admin Pulsing State...", isCloudUrl ? "Cloud" : isJingle ? "Jingle" : "None");

        dbService.updateStationState({
          is_playing: isPlayingRef.current,
          is_tv_active: isTvActiveRef.current,
          current_track_id: activeTrackIdRef.current,
          current_track_name: currentTrackNameRef.current,
          current_track_url: isCloudUrl ? urlToSync : (isJingle ? urlToSync : null),
          current_video_id: activeVideoIdRef.current,
          current_offset: radioCurrentTimeRef.current,
          timestamp: Date.now()
        }).catch(err => console.error("❌ Station Sync error", err));
      };

      // Initial sync on change
      syncStation();

      // HEARTBEAT: Pulse every 8 seconds
      const pulseInterval = setInterval(syncStation, 8000);
      return () => clearInterval(pulseInterval);
    }
  }, [role, supabase]); // Only depends on role/client presence

  const handleLogAdd = useCallback((action: string) => {
    // We'll keep logs local for now, but AdminMessages should be cloud
    dbService.addLog({
      id: Date.now().toString(),
      action,
      timestamp: Date.now()
    }).then(() => fetchData());
  }, [fetchData]);

  const handlePushBroadcast = useCallback(async (text: string) => {
    const msg: AdminMessage = {
      id: Date.now().toString(),
      text,
      timestamp: Date.now()
    };
    await dbService.addAdminMessageCloud(msg);
    handleLogAdd(`Broadcast Alert: ${text}`);
  }, [handleLogAdd]);

  const handleStopNews = useCallback(() => {
    setStopTriggerCount(prev => prev + 1);
    setBroadcastStatus('');
  }, []);

  const handleClearNews = useCallback(async () => {
    setNews([]);
    await dbService.saveNews([]);
    // In a multi-user environment, we should probably clear cloud too
    // But for now let's keep it simple
    handleLogAdd("Newsroom purged by Admin locally.");
  }, [handleLogAdd]);

  const handlePlayNext = useCallback(() => {
    if (isTvActive) {
      console.log('🚫 [App] handlePlayNext blocked (TV is active)');
      return;
    }
    console.log('⏭️ [App] handlePlayNext triggered. Role:', role);
    // Use stable ref for media library to avoid stale closures
    const audioFiles = allMediaRef.current.filter(m => m.type === 'audio');
    if (audioFiles.length === 0) {
      console.warn('⚠️ No audio files found for playlist.');
      setActiveTrackId(null);
      setActiveTrackUrl(null);
      setCurrentTrackName('Station Standby');
      return;
    }

    const currentIndex = audioFiles.findIndex(t => t.id === activeTrackId);
    let nextIndex = isShuffle ? Math.floor(Math.random() * audioFiles.length) : (currentIndex + 1) % audioFiles.length;

    // Safety: If it's the same index and not shuffle, try to force next
    if (!isShuffle && nextIndex === currentIndex && audioFiles.length > 1) {
      nextIndex = (currentIndex + 1) % audioFiles.length;
    }

    const track = audioFiles[nextIndex];
    if (track) {
      console.log('🎵 [App] Advancing to next track:', track.name, 'URL:', track.url);
      updateTrackUrl(track.id, track.url, cleanTrackName(track.name));
      setIsPlaying(true);

      // UNIVERSAL: Keep listener playback alive on track transition
      if (role === UserRole.LISTENER) {
        setListenerHasPlayed(true);
        console.log('🔄 [App] Listener auto-advancing to next track:', track.name);
      }

      // CRITICAL: Push to cloud IMMEDIATELY so listeners don't wait for pulse
      if (role === UserRole.ADMIN && supabase) {
        const isUrl = track.url && (track.url.startsWith('http') || track.url.startsWith('https'));
        const isCloudUrl = isUrl && !track.url?.startsWith('blob:');

        dbService.updateStationState({
          is_playing: true,
          current_track_id: track.id,
          current_track_name: track.name,
          current_track_url: isCloudUrl ? track.url : null,
          current_offset: 0, // Reset for new track
          timestamp: Date.now()
        }).catch(err => console.error("❌ Immediate Advancement Sync Fail:", err));
      }
    }
  }, [activeTrackId, isShuffle, role, supabase, isTvActive]); // activeTrackId is needed to find current index



  const handlePlayAll = useCallback((force = false) => {
    if (isTvActive && !force) {
      console.log('🚫 [App] handlePlayAll blocked (TV is active)');
      return;
    }
    setHasInteracted(true);
    // Use stable ref for media library
    const audioFiles = allMediaRef.current.filter(m => m.type === 'audio');

    if (audioFiles.length === 0) {
      // No media files, use default stream
      console.warn('No audio files in media library');
      handleLogAdd?.('No audio files found - Please upload music to the media menu');
      return;
    }
    const track = isShuffle ? audioFiles[Math.floor(Math.random() * audioFiles.length)] : audioFiles[0];
    updateTrackUrl(track.id, track.url, cleanTrackName(track.name));
    setIsPlaying(true);

    // CRITICAL: Force cloud sync immediately
    if (role === UserRole.ADMIN && supabase) {
      dbService.updateStationState({
        is_playing: true,
        is_tv_active: false,
        current_track_id: track.id,
        current_track_name: track.name,
        current_track_url: track.url,
        current_offset: 0,
        timestamp: Date.now()
      }).catch(err => console.error("❌ Play All Sync Error", err));
    }
  }, [isShuffle, isTvActive, role, supabase, handleLogAdd]);


  useEffect(() => {
    playlistRef.current = audioPlaylist;
    // Try to get precise location for weather
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        // We'll use coordinates for weather search grounding
        setCurrentLocation(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`);
      });
    }
  }, [audioPlaylist]);


  const handleManualBroadcast = useCallback(async (item: NewsItem) => {
    setBroadcastStatus(`🎙️ Manual: ${NEWSCASTER_NAME} reading archived story...`);
    setIsDuckingNDR(true);

    try {
      const audio = await getNewsAudio(item.content);
      if (audio) {
        // We use a simplified version of playBuffer here or trigger via engine
        // For now, let's just use the existing broadcast channel
        const engineTrigger = document.getElementById('manual-story-trigger') as any;
        if (engineTrigger) {
          engineTrigger.value = JSON.stringify(item);
          engineTrigger.click();
        }
      }
    } catch (e) {
      console.error("Manual broadcast failed", e);
    } finally {
      setIsDuckingNDR(false);
      setBroadcastStatus('');
    }
  }, []);

  const handleAddNewsToHistory = useCallback(async (item: NewsItem) => {
    const history = [item, ...newsHistory];
    setNewsHistory(history.slice(0, 200));
    await dbService.saveNews(history); // This appends in dbService logic
    handleLogAdd(`Manual news added: ${item.title}`);
  }, [newsHistory, handleLogAdd]);

  const handleUpdateNewsInHistory = useCallback(async (item: NewsItem) => {
    await dbService.updateNewsInHistory(item);
    const history = await dbService.getNewsHistory();
    setNewsHistory(history);
    handleLogAdd(`Manual news updated: ${item.title}`);
  }, [handleLogAdd]);

  const handleDeleteNewsFromHistory = useCallback(async (id: string) => {
    await dbService.deleteNewsFromHistory(id);
    const history = await dbService.getNewsHistory();
    setNewsHistory(history);
    handleLogAdd(`News item deleted from bucket.`);
  }, [handleLogAdd]);

  const handlePlayJingle = useCallback(async (index: 1 | 2) => {
    try {
      if (index === 2) {
        const instrumental = allMedia.find(m => m.name.toLowerCase().includes('instrumentals (1)'));
        if (instrumental) {
          const audio = new Audio(instrumental.url);
          audio.volume = 1.0; // Set full volume for admin audio
          audio.play().catch(e => console.error("Jingle Playback Error", e));
          return;
        }
      }

      // Fallback for Jingle 1 or if Instrumental not found
      const jText = index === 1 ? JINGLE_1 : JINGLE_2;
      const jAudio = await getJingleAudio(jText);
      if (jAudio) {
        // Correct casting for BlobPart
        const blob = new Blob([jAudio as BlobPart], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 1.0; // Set full volume for admin audio
        audio.play().catch(e => console.error("TTS Jingle Playback Error", e));
      }
    } catch (e) {
      console.error("Jingle failed", e);
    }
  }, [allMedia]);

  const handleRadioToggle = useCallback((play: boolean) => {
    console.log(`📻 Radio Master Control: ${play ? 'ON' : 'OFF'}`);
    handleStopNews(); // Stop any pending news on toggle

    if (play) {
      setIsTvActive(false);
      handlePlayAll(true); // Pass force=true to bypass batching block
    } else {
      setIsPlaying(false);
      setListenerHasPlayed(false);
      // Sync STOP state to cloud
      if (role === UserRole.ADMIN && supabase) {
        dbService.updateStationState({
          is_playing: false,
          timestamp: Date.now()
        }).catch(err => console.error("❌ Radio Stop Sync error", err));
      }
    }
  }, [handleStopNews, handlePlayAll, role, supabase]);

  const handleVideoToggle = useCallback((active: boolean) => {
    setIsTvActive(active);
    if (active) {
      setIsPlaying(false);
      setListenerHasPlayed(false);
    }
    // Broadcaster sync
    if (role === UserRole.ADMIN && supabase) {
      dbService.updateStationState({
        is_tv_active: active,
        is_playing: active ? false : isPlaying,
        timestamp: Date.now()
      }).catch(err => console.error("❌ Video Toggle Sync error", err));
    }
  }, [role, isPlaying, supabase]);

  const handlePlayVideo = useCallback((track: MediaFile | number) => {
    handleStopNews(); // Ensure news stops

    let video: MediaFile | undefined;
    const videoFiles = allMediaRef.current.filter(v => v.type === 'video');

    if (typeof track === 'number') {
      video = videoFiles[track];
    } else {
      video = track;
    }

    if (!video) return;

    setActiveVideoId(video.id);
    handleRadioToggle(false); // Master stop radio
    setIsTvActive(true);

    // Explicitly update cloud so listeners switch
    if (role === UserRole.ADMIN && supabase) {
      dbService.updateStationState({
        is_playing: false,
        is_tv_active: true,
        current_video_id: video.id,
        timestamp: Date.now()
      }).catch(err => console.error("❌ TV Sync error", err));
    }
    handleLogAdd(`TV Feed: Now Broadcasting ${video.name}`);
  }, [handleRadioToggle, handleLogAdd, handleStopNews, role]);

  return (
    <div className="min-h-[100dvh] bg-[#f0fff4] text-[#008751] flex flex-col max-w-md mx-auto relative shadow-2xl border-x border-green-100/30 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* NDRTV Automation Engine - Sara Obosa Lead Anchor */}
      <NDRTVEngine
        currentLocation={currentLocation}
        onStatusChange={setBroadcastStatus}
        onNewsUpdate={(newsAction) => {
          setNews(prev => {
            const next = typeof newsAction === 'function' ? newsAction(prev) : newsAction;
            dbService.syncNewsToCloud(next);
            return next;
          });
        }}
        onLogAdd={handleLogAdd}
        currentNewsFeed={news}
        manualTrigger={newsTriggerCount}
        stopSignal={stopTriggerCount}
        mediaFiles={allMedia}
        onDuckingChange={setIsDuckingNDR}
        isAllowedToPlay={role === UserRole.ADMIN ? isPlaying : listenerHasPlayed}
      />

      <ThompsonEngine
        manualTriggerCount={manualNewsTriggerCount}
        onStatusChange={setBroadcastStatus}
        onNewsUpdate={(newsAction) => {
          setNews(prev => {
            const next = typeof newsAction === 'function' ? newsAction(prev) : newsAction;
            dbService.syncNewsToCloud(next);
            return next;
          });
        }}
        onLogAdd={handleLogAdd}
        stopSignal={stopTriggerCount}
        onDuckingChange={setIsDuckingThompson}
        isAllowedToPlay={role === UserRole.ADMIN ? isPlaying : listenerHasPlayed}
        mediaFiles={allMedia}
      />

      <FavourEngine
        currentLocation={currentLocation}
        triggerCount={manualNewsTriggerCount}
        onStatusChange={setBroadcastStatus}
        onNewsUpdate={(newsAction) => {
          setNews(prev => {
            const next = typeof newsAction === 'function' ? newsAction(prev) : newsAction;
            dbService.syncNewsToCloud(next);
            return next;
          });
        }}
        onLogAdd={handleLogAdd}
        currentNewsFeed={news}
        stopSignal={stopTriggerCount}
        onDuckingChange={setIsDuckingFavour}
        isAllowedToPlay={role === UserRole.ADMIN ? isPlaying : listenerHasPlayed}
        mediaFiles={allMedia}
        isOnline={supabase}
      />

      {/* DEBUG BANNER - TEMPORARY */}
      <div className="bg-yellow-400 text-black text-[10px] font-black text-center py-1 uppercase tracking-widest sticky top-0 z-50">
        ⚠️ DEBUG MODE: V2.3.1 - If you see this, update worked! ⚠️
      </div>

      <header className="p-4 sticky top-4 z-40 bg-white/90 backdrop-blur-md flex justify-between items-center border-b border-green-50 shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-[10px] font-black uppercase leading-none text-green-950 whitespace-nowrap tracking-tight">{APP_NAME}</h1>
          <span className="text-[6px] font-black text-green-700/50 uppercase tracking-[0.3em] mt-0.5">V2.3.0-LIVE</span>
        </div>
        <div className="flex items-center space-x-2">
          {role === UserRole.LISTENER && (
            <span className="text-[7px] bg-green-950/80 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-green-800/30 shadow-sm whitespace-nowrap">
              {cloudStatus}
            </span>
          )}
          {/* {!supabase && <span className="text-[7px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-black uppercase animate-pulse">Cloud Offline</span>} - REMOVED AS REQUESTED */}
          {isDucking && <span className="text-[7px] font-black uppercase text-red-500 animate-pulse bg-red-50 px-1 rounded shadow-sm border border-red-100">Live Broadcast</span>}
          <button
            onClick={role === UserRole.ADMIN ? () => { setRole(UserRole.LISTENER); setListenerHasPlayed(false); } : () => setShowAuth(true)}
            className="px-4 py-1.5 rounded-full border border-green-950 text-[10px] font-black uppercase text-green-950 hover:bg-green-50 transition-colors"
          >
            {role === UserRole.ADMIN ? 'Exit Admin' : 'Admin Login'}
          </button>
          <div className={`w-3 h-3 rounded-full ${supabase ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]'}`} title={supabase ? "System Online" : "System Offline"}></div>
          {audioStatus !== 'Ready' && <span className="text-[10px] text-green-700 font-bold ml-1">{audioStatus}</span>}
          {lastError && <span className="text-[7px] bg-red-600 text-white px-1.5 py-0.5 rounded ml-2 font-black uppercase animate-bounce">{lastError}</span>}
        </div>
      </header>

      {/* ADMIN TV SYNC ENGINE (Invisible) */}
      {role === UserRole.ADMIN && (
        <div className="hidden">
          <TVPlayer
            activeVideo={allMediaRef.current.find(m => m.id === activeVideoId) || null}
            allVideos={allMedia.filter(v => v.type === 'video')}
            news={[]}
            adminMessages={[]}
            onVideoAdvance={handlePlayVideo}
            isNewsPlaying={false}
            isActive={isTvActive}
            isAdmin={true}
          />
        </div>
      )}

      <main className="flex-grow pt-1 px-1.5">
        <RadioPlayer
          onStateChange={(playing) => {
            if (role === UserRole.ADMIN) {
              setIsPlaying(playing);
            } else {
              setListenerHasPlayed(playing);
              if (playing) setShowJoinPrompt(false);
            }
            if (playing) {
              setIsTvActive(false); // Mutual Exclusivity
            }
          }}
          onTimeUpdate={(time) => {
            if (role === UserRole.ADMIN) setRadioCurrentTime(time);
          }}
          startTime={role === UserRole.LISTENER ? radioCurrentTime : 0}
          activeTrackUrl={activeTrackUrl}
          currentTrackName={currentTrackName}
          onTrackEnded={handlePlayNext}
          activeTrackId={activeTrackId}
          isDucking={isDucking}
          forcePlaying={role === UserRole.ADMIN ? isPlaying : (isPlayingState && listenerHasPlayed && !isTvActive)}
          isAdmin={role === UserRole.ADMIN}
          showPlayButton={role !== UserRole.ADMIN}
        />

        {/* Join Broadcast Overlay for Listeners */}
        {role === UserRole.LISTENER && showJoinPrompt && !listenerHasPlayed && isPlayingState && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-scale-in">
            <div className="bg-white rounded-3xl p-8 max-w-[80%] text-center shadow-2xl border border-green-100">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(0,135,81,0.5)] animate-pulse">
                <i className="fas fa-play text-white text-3xl ml-1"></i>
              </div>
              <h2 className="text-xl font-black text-green-900 mb-2 uppercase tracking-tight">Station is LIVE</h2>
              <p className="text-xs text-green-700/70 mb-8 font-medium">The broadcast is currently active. Tap below to join now.</p>
              <button
                onClick={() => {
                  setListenerHasPlayed(true);
                  setShowJoinPrompt(false);
                  setHasInteracted(true);
                  if ((window as any).resumeRadioAudioContext) {
                    (window as any).resumeRadioAudioContext();
                  }
                }}
                className="w-full bg-[#008751] text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                Join Broadcast
              </button>
            </div>
          </div>
        )}

        {/* LISTENER VIEW (Always mounted to keep TV/Audio alive) */}
        <div className={role === UserRole.LISTENER ? 'block' : 'hidden'}>
          <ListenerView
            stationState={{
              location: currentLocation,
              localTime: new Date().toLocaleTimeString(),
              is_playing: isPlaying,
              current_track_name: currentTrackName
            }}
            news={news}
            adminMessages={adminMessages}
            reports={reports}
            onPlayTrack={(t) => {
              handleStopNews(); // Ensure news stops
              setHasInteracted(true);
              updateTrackUrl(t.id, t.url, cleanTrackName(t.name));
              setListenerHasPlayed(true);
              setIsTvActive(false);
            }}
            onPlayVideo={handlePlayVideo}
            onVideoAdvance={(idx) => handlePlayVideo(idx)}
            activeVideo={allMediaRef.current.find(m => m.id === activeVideoId) || null}
            isNewsPlaying={isDucking}
            isTvActive={isTvActive}
            allVideos={allMedia}
            isRadioPlaying={listenerHasPlayed}
            onRadioToggle={handleRadioToggle}
            onTvToggle={handleVideoToggle}
            isAdmin={role === UserRole.ADMIN}
            onReport={async (report) => {
              await dbService.addReportCloud(report);
              fetchData();
            }}
          />
        </div>

        {/* ADMIN VIEW */}
        {role === UserRole.ADMIN && (
          <AdminView
            onRefreshData={fetchData} logs={logs} onPlayTrack={(t) => {
              console.log('▶️ Play Track Clicked:', t.name, t.url);
              setHasInteracted(true); updateTrackUrl(t.id, t.url, cleanTrackName(t.name)); setIsPlaying(true);
              setIsTvActive(false);
            }}
            isRadioPlaying={isPlaying} onToggleRadio={() => setIsPlaying(!isPlaying)}
            currentTrackName={currentTrackName} isShuffle={isShuffle} onToggleShuffle={() => setIsShuffle(!isShuffle)}
            onPlayAll={handlePlayAll} onSkipNext={handlePlayNext}
            onPushBroadcast={handlePushBroadcast} onPlayJingle={handlePlayJingle}
            news={news}
            onTriggerFullBulletin={() => setNewsTriggerCount(prev => prev + 1)}
            onTriggerManualBroadcast={() => setManualNewsTriggerCount(prev => prev + 1)}
            onPlayPodcastFile={() => { }}
            onPlayDirectTTS={() => { }}
            onSaveManualScript={async (s) => {
              await dbService.saveManualScript(s);
              setManualScript(s);
            }}
            manualScript={manualScript}
            mediaFiles={allMedia}
            status={broadcastStatus}
            onRefreshWire={() => fetchData(true)}
            onClearNews={handleClearNews}
            onStopNews={handleStopNews}
            newsHistory={newsHistory}
            onManualBroadcast={handleManualBroadcast}
            onAddNews={handleAddNewsToHistory}
            onUpdateNews={handleUpdateNewsInHistory}
            onDeleteNews={handleDeleteNewsFromHistory}
            onDeleteMedia={async (id, fileName) => {
              await dbService.deleteMediaCloud(id, fileName);
              fetchData();
            }}
            activeVideoId={activeVideoId}
            onPlayVideo={handlePlayVideo}
            isTvActive={isTvActive}
            onToggleTv={handleVideoToggle}
            onResetSync={handleResetSync}
            reports={reports}
          />
        )}
      </main>

      {showAuth && <PasswordModal onClose={() => setShowAuth(false)} onSuccess={() => { setRole(UserRole.ADMIN); setShowAuth(false); }} />}
    </div>
  );
};

export default App;
