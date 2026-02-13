
import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_STREAM_URL, JINGLE_1, JINGLE_2 } from '../../constants';
const SILENT_FALLBACK_URL = "https://stream.zeno.fm/u9mphfk604zuv"; // Silent fallback if cloud fails
import { getJingleAudio } from '../../services/aiDjService';
import Logo from '../Shared/Logo';

interface RadioPlayerProps {
  onStateChange: (isPlaying: boolean) => void;
  activeTrackUrl?: string | null;
  currentTrackName?: string;
  forcePlaying?: boolean;
  onTrackEnded?: () => void;
  isAdmin?: boolean;
  isDucking?: boolean;
}

const RadioPlayer: React.FC<RadioPlayerProps> = ({
  onStateChange,
  activeTrackUrl,
  currentTrackName = 'Live Stream',
  forcePlaying = false,
  onTrackEnded,
  isAdmin = false,
  isDucking = false
}) => {
  const [isPlaying, setIsPlaying] = useState(forcePlaying);
  const [volume, setVolume] = useState(1.0);
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PLAYING' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isStreamRef = useRef<boolean>(false);

  const onTrackEndedRef = useRef(onTrackEnded);
  useEffect(() => {
    onTrackEndedRef.current = onTrackEnded;
  }, [onTrackEnded]);

  const initAudioContext = () => {
    try {
      if (!audioRef.current) return;

      // Don't create audio context for live streams initially
      // Some streams have issues with MediaElementSource
      if (isStreamRef.current) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.warn);
      }

      if (!gainNodeRef.current) {
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gainNodeRef.current = gain;
      }

      if (!sourceRef.current) {
        try {
          sourceRef.current = ctx.createMediaElementSource(audioRef.current);
          const newAnalyser = ctx.createAnalyser();
          newAnalyser.fftSize = 256;

          sourceRef.current.connect(newAnalyser);
          newAnalyser.connect(gainNodeRef.current!);
          setAnalyser(newAnalyser);
        } catch (err) {
          console.warn("MediaElementSource creation failed:", err);
          // Continue without visualizer for streams
        }
      }
    } catch (e) {
      console.error("Audio Initialization Failure:", e);
    }
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handlePlay = () => {
      setStatus('PLAYING');
      setIsPlaying(true);
      onStateChange(true);
      setErrorMessage('');
    };

    const handlePause = () => {
      setStatus('IDLE');
      setIsPlaying(false);
      onStateChange(false);
    };

    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;

      // Ignore errors if we are in transition or have no source intentionally
      if (!target.src || target.src === '' || target.src === window.location.href) {
        return;
      }

      let message = 'Playback error';
      if (target.error) {
        switch (target.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            message = 'Playback aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            message = 'Network error - Check your connection';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = 'Audio format not supported';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = 'Stream URL not accessible or invalid';
            break;
        }
      }

      console.error("Audio Playback Error:", message, target.error, "URL:", target.src);

      // Only set error status if it's a real failure while we SHOULD be playing
      if (status !== 'IDLE') {
        setErrorMessage(message);
        setStatus('ERROR');
        setIsPlaying(false);
        onStateChange(false);
      }
    };

    const handleCanPlay = () => {
      console.log("Stream ready to play");
      if (status === 'LOADING') {
        setStatus('IDLE');
      }
    };

    const handleLoadStart = () => {
      console.log("Loading stream...");
      setStatus('LOADING');
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', () => setStatus('LOADING'));
    audio.addEventListener('playing', handlePlay);
    audio.addEventListener('ended', () => onTrackEndedRef.current?.());
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadstart', handleLoadStart);

    const setupSource = (src: string | null | undefined) => {
      const targetSrc = src || DEFAULT_STREAM_URL;

      // Validation: If no source provided and no default stream, put in Standby
      if (!targetSrc || targetSrc === '' || targetSrc === window.location.href) {
        console.log('📡 [RadioPlayer] Station in Standby Mode - No active source.');
        audio.src = "";
        setStatus('IDLE');
        return;
      }

      audio.src = targetSrc;
      isStreamRef.current = !audio.src.startsWith('blob:') && !audio.src.startsWith('data:');

      // CRITICAL FIX: Don't set crossOrigin for live streams
      if (audio.src.startsWith('blob:') || audio.src.startsWith('data:')) {
        audio.crossOrigin = null;
      } else {
        audio.removeAttribute('crossorigin');
      }

      if (targetSrc) {
        audio.preload = 'metadata';
        audio.load();
      }
    };

    setupSource(activeTrackUrl);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeAttribute('src');
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      const targetSrc = activeTrackUrl || DEFAULT_STREAM_URL;

      // Validation: If no source provided and no default stream, put in Standby
      if (!targetSrc || targetSrc === '' || targetSrc === window.location.href) {
        console.log('📡 [RadioPlayer] Switching to Standby Mode.');
        audioRef.current.pause();
        audioRef.current.removeAttribute('src'); // Better than src = ""
        audioRef.current.load(); // Force reset state
        setStatus('IDLE');
        return;
      }

      console.log('📻 RadioPlayer received URL:', targetSrc);
      if (audioRef.current.src !== targetSrc) {
        const isLocal = targetSrc.startsWith('blob:') || targetSrc.startsWith('data:');
        isStreamRef.current = !isLocal;

        if (isLocal) {
          audioRef.current.crossOrigin = null;
        } else {
          audioRef.current.removeAttribute('crossorigin');
        }

        // Robust transition: pause and clear before loading new src
        audioRef.current.pause();
        audioRef.current.src = targetSrc;
        audioRef.current.load();

        if (isPlaying || forcePlaying) {
          // Only init audio context for local files
          if (!isStreamRef.current) {
            initAudioContext();
          }

          audioRef.current.play().catch(err => {
            console.warn("Autoplay blocked or stream error:", err);
            // If it was a track failing, try falling back to silent stream
            if (!isStreamRef.current && SILENT_FALLBACK_URL) {
              console.log("🔄 Playback failed, falling back to silent stream...");
              audioRef.current!.src = SILENT_FALLBACK_URL;
              audioRef.current!.load();
              audioRef.current!.play().catch(e => console.error("Final fallback failed:", e));
            }
            setStatus('IDLE');
          });
        }
      }
    }
  }, [activeTrackUrl]);

  // Jingle Scheduler Refs
  const lastJingleTimeRef = useRef<number>(Date.now());
  const jingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const isJinglePlayingRef = useRef<boolean>(false);

  // Initialize Jingle Audio
  useEffect(() => {
    jingleAudioRef.current = new Audio();
    jingleAudioRef.current.volume = 1.0;
    return () => {
      if (jingleAudioRef.current) {
        jingleAudioRef.current.pause();
        jingleAudioRef.current = null;
      }
    };
  }, []);

  // Jingle Playback Logic
  const playJingleOverlay = async () => {
    if (isJinglePlayingRef.current || isDucking || !isPlaying) return;

    try {
      console.log("🎵 Triggering Anti-Copyright Jingle Overlay...");
      isJinglePlayingRef.current = true;

      // select random jingle
      // Using JINGLE_1 predominantly for voiceover, Jingle 2 is instrumental which might clash
      const jingleText = Math.random() > 0.7 ? JINGLE_2 : JINGLE_1;

      const audioData = await getJingleAudio(jingleText);
      if (!audioData || !jingleAudioRef.current) {
        isJinglePlayingRef.current = false;
        return;
      }

      // Create Blob URL
      const blob = new Blob([audioData as any], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);

      // Duck Main Audio
      const originalVolume = volume;
      const duckedVolume = volume * 0.3; // Drop to 30%

      // Apply Ducking
      if (audioRef.current) audioRef.current.volume = duckedVolume;
      if (gainNodeRef.current && audioContextRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(duckedVolume, audioContextRef.current.currentTime, 0.5);
      }

      // Play Jingle
      jingleAudioRef.current.src = url;
      jingleAudioRef.current.onended = () => {
        console.log("🎵 Jingle Ended - Restoring Volume");
        // Restore Volume
        if (audioRef.current) audioRef.current.volume = originalVolume;
        if (gainNodeRef.current && audioContextRef.current) {
          gainNodeRef.current.gain.setTargetAtTime(originalVolume, audioContextRef.current.currentTime, 0.5);
        }
        isJinglePlayingRef.current = false;
        lastJingleTimeRef.current = Date.now(); // Reset timer
      };

      await jingleAudioRef.current.play();

    } catch (e) {
      console.error("Jingle Overlay Failed:", e);
      isJinglePlayingRef.current = false;
      // Ensure volume is restored if error
      if (audioRef.current) audioRef.current.volume = volume;
    }
  };

  // Scheduler Check Loop
  useEffect(() => {
    if (!isPlaying || isDucking) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLast = now - lastJingleTimeRef.current;

      // Trigger every 45-75 seconds (randomized)
      const threshold = 45000 + (Math.random() * 30000);

      if (timeSinceLast > threshold && !isJinglePlayingRef.current && !isDucking) {
        playJingleOverlay();
      }
    }, 5000); // Check every 5s

    return () => clearInterval(interval);
  }, [isPlaying, isDucking, volume]);

  useEffect(() => {
    if (audioRef.current) {
      // FIX: Don't pause music during ducking, just let the volume attenuation handle it
      // This allows the "Background Bed" effect the user wants
      const shouldBePlaying = forcePlaying;

      // Validate audio source before attempting to play
      if (shouldBePlaying && audioRef.current.paused) {
        // Check if we have a valid source
        if (!audioRef.current.src || audioRef.current.src === '' || audioRef.current.src === window.location.href) {
          console.warn('📡 [RadioPlayer] No valid audio source, skipping auto-play');
          return;
        }

        console.log('📡 [RadioPlayer] Attempting Playback of:', audioRef.current.src);

        // Only init audio context for local files
        if (!isStreamRef.current) {
          initAudioContext();
        }

        audioRef.current.play().catch((err) => {
          console.error("❌ [RadioPlayer] Play failed:", err.message, "URL:", audioRef.current?.src);
          // If it's a "no supported sources" or 403, we keep the previous status or set error
          if (err.name !== 'AbortError') {
            setStatus('ERROR');
            setErrorMessage('Playback Error: Check Cloud Connection');
          }
        });
      } else if (!shouldBePlaying && !audioRef.current.paused) {
        console.log('📡 [RadioPlayer] Pausing playback.');
        audioRef.current.pause();
      }
    }
  }, [forcePlaying, isDucking]); // Keeping isDucking in deps to respond to changes if needed, but logic currently ignores it for pausing

  useEffect(() => {
    // Apply volume settings
    const targetGain = isDucking ? volume * 0.15 : volume;
    if (gainNodeRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      gainNodeRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.1);
    } else if (audioRef.current) {
      audioRef.current.volume = targetGain;
      audioRef.current.muted = false;
    }
  }, [volume, isDucking]);

  const handlePlayPause = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      setStatus('LOADING');
      setErrorMessage('');

      // Only init audio context for local files
      if (!isStreamRef.current) {
        initAudioContext();
      }

      try {
        if (isDucking) {
          setErrorMessage("Cannot play during News Broadcast");
          setStatus('IDLE');
          return;
        }
        await audioRef.current.play();
      } catch (err: any) {
        console.error("Play error:", err);
        setStatus('ERROR');
        setErrorMessage(err.message || 'Failed to play stream');
      }
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-0 w-full">
      <Logo
        size="lg"
        analyser={analyser}
        isPlaying={isPlaying}
        status={status}
        onTogglePlayback={handlePlayPause}
        showPlayButton={true}
      />

      <div className="w-full px-8 mt-6 relative z-20">
        <div className="h-1.5 w-full bg-green-100/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/20">
          <div className="h-full bg-[#008751] transition-all duration-300 shadow-[0_0_10px_rgba(0,135,81,0.5)]" style={{ width: `${progress}%` }}></div>
        </div>
        {duration > 0 && isFinite(duration) && (
          <div className="flex justify-between mt-0.5 px-1">
            <span className="text-[6px] font-black uppercase text-green-800 tracking-tighter">{formatTime(currentTime)}</span>
            <span className="text-[6px] font-black uppercase text-green-800 tracking-tighter">{formatTime(duration)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center space-y-4 mt-8 relative z-20 w-full px-8">
        {/* Track Info Display */}
        <div className="bg-white/40 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/60 w-full overflow-hidden shadow-lg flex items-center justify-center text-center">
          <span className="text-xs font-black uppercase text-green-900 tracking-[0.2em] line-clamp-1">
            NOW PLAYING: {currentTrackName}
          </span>
        </div>

        {isDucking && (
          <div className="flex items-center space-x-2 animate-bounce">
            <div className="w-3 h-3 bg-red-600 rounded-full"></div>
            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Live Bulletin</span>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50/80 backdrop-blur-sm px-6 py-2 rounded-xl border border-red-200/50 w-full shadow-sm">
            <p className="text-[10px] font-black text-red-600 text-center uppercase tracking-tight">{errorMessage}</p>
          </div>
        )}

        <div className="w-64 flex items-center space-x-4 bg-white/30 backdrop-blur-sm p-2 rounded-full border border-white/40 shadow-inner">
          <i className="fas fa-volume-down text-green-800 text-xs"></i>
          <input
            type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-grow h-1.5 bg-green-100/50 rounded-lg appearance-none accent-[#008751] cursor-pointer"
          />
          <i className="fas fa-volume-up text-green-800 text-xs"></i>
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;
