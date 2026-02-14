import React, { useState, useEffect, useCallback, useRef } from 'react';
import TVPlayer from './TVChannel/TVPlayer';
import { NewsItem, MediaFile, AdminMessage, ListenerReport } from '../../types';
import { dbService } from '../../services/dbService';
import { CHANNEL_INTRO, DESIGNER_NAME, APP_NAME } from '../../constants';

interface ListenerViewProps {
  stationState: any;
  news: NewsItem[];
  adminMessages: AdminMessage[];
  reports: ListenerReport[];
  onPlayTrack: (track: MediaFile) => void;
  onPlayVideo: (video: MediaFile) => void;
  activeVideo: MediaFile | null;
  isNewsPlaying: boolean;
  isTvActive: boolean;
  allVideos: MediaFile[];
  isRadioPlaying: boolean;
  onRadioToggle: (play: boolean) => void;
  onTvToggle: (active: boolean) => void;
  onReport?: (report: ListenerReport) => Promise<void>;
}

const ListenerView: React.FC<ListenerViewProps> = ({
  stationState,
  news,
  adminMessages = [],
  reports,
  onPlayTrack,
  onPlayVideo,
  activeVideo,
  isNewsPlaying,
  isTvActive,
  allVideos,
  isRadioPlaying,
  onRadioToggle,
  onTvToggle,
  onReport
}) => {
  const [location, setLocation] = useState<string>('Syncing...');
  const [localTime, setLocalTime] = useState<string>('');
  const [reportText, setReportText] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const [shareFeedback, setShareFeedback] = useState('');
  const [isTvPlaying, setIsTvPlaying] = useState(false);

  const timerRef = useRef<number | null>(null);

  const nextAd = useCallback(() => {
    if (allVideos.length > 0) {
      setAdIndex((prev) => (prev + 1) % allVideos.length);
    }
  }, [allVideos.length]);

  useEffect(() => {
    if (allVideos.length > 0) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        nextAd();
      }, 20000);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [adIndex, allVideos.length, nextAd]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => setLocation(`Node: ${pos.coords.latitude.toFixed(1)}, ${pos.coords.longitude.toFixed(1)}`), () => setLocation('Global Diaspora'));
    }
    const timer = setInterval(() => setLocalTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleShare = async () => {
    const text = "📻 Tune in to Nigeria Diaspora Radio (NDR)! The voice of Nigerians abroad. Live news and culture. Listen here: ";
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Nigeria Diaspora Radio', text, url });
        setShareFeedback('Shared!');
      } else {
        await navigator.clipboard.writeText(`${text}${url}`);
        setShareFeedback('Link Copied!');
      }
    } catch (err) {
      console.warn("Share failed", err);
    } finally {
      setTimeout(() => setShareFeedback(''), 3000);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    const reportData = {
      id: Math.random().toString(36).substring(2, 9),
      reporterName: 'Listener',
      location,
      content: reportText,
      timestamp: Date.now()
    };
    if (onReport) {
      await onReport(reportData);
    } else {
      await dbService.addReport(reportData);
    }
    setReportText('');
    setIsReporting(false);
    setShareFeedback('Report Sent!');
    setTimeout(() => setShareFeedback(''), 3000);
  };

  const currentAd = allVideos[adIndex];

  return (
    <div className="flex-grow flex flex-col space-y-6 pt-2 pb-8 px-4 text-[#008751]">
      {/* 1. STATUS BAR */}
      <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-green-100 shadow-sm relative overflow-hidden shrink-0">
        <div className="flex flex-col z-10">
          <span className="text-[9px] font-black uppercase tracking-widest text-green-600">{location}</span>
          <span className="text-[10px] font-mono text-green-900 font-black">{localTime}</span>
        </div>
        <button
          onClick={handleShare}
          className="relative z-10 bg-[#008751] hover:bg-green-700 text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all flex items-center space-x-1"
        >
          <i className="fas fa-paper-plane text-[10px]"></i>
          <span>{shareFeedback || 'Invite Friends'}</span>
        </button>
      </div>

      {/* 2. NEWS TICKER (RADIO ONLY) */}
      <section className={`bg-green-50/30 rounded-xl border border-green-100/50 h-10 flex items-center overflow-hidden shrink-0 transition-opacity duration-500 ${isRadioPlaying ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`flex whitespace-nowrap items-center ${isRadioPlaying ? 'animate-marquee' : ''}`}>
          <span className="text-xs font-black text-green-800 uppercase px-12 tracking-widest inline-block">{CHANNEL_INTRO}</span>
          {adminMessages.map((msg, i) => (
            <span key={`admin-${i}`} className="text-xs text-red-600 font-black uppercase px-12 flex items-center inline-block">
              <i className="fas fa-bullhorn mr-2"></i> {msg.text}
              <span className="ml-12 text-green-200">|</span>
            </span>
          ))}
          {news.map((n, i) => (
            <span key={`ticker-${i}`} className="text-xs text-green-700 font-bold uppercase px-12 flex items-center inline-block">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse"></span>
              {n.title}
              <span className="ml-12 text-green-200">|</span>
            </span>
          ))}
        </div>
      </section>

      {/* 3. TV SECTION (Square Corners) */}
      <section className="shrink-0">
        <div className="bg-black border border-green-900/10 shadow-2xl aspect-video mx-auto overflow-hidden">
          <TVPlayer
            activeVideo={activeVideo}
            allVideos={allVideos.filter(v => v.type === 'video')}
            news={news}
            adminMessages={adminMessages}
            onPlayStateChange={(playing) => {
              setIsTvPlaying(playing);
              if (playing) {
                onRadioToggle(false);
                onTvToggle(true);
              }
            }}
            isNewsPlaying={isNewsPlaying}
            isActive={isTvActive}
          />
        </div>
      </section>

      {/* 4. ADS - SPACIOUS */}
      <section className="shrink-0 bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center justify-between overflow-hidden shadow-sm">
        <div className="flex flex-col">
          <span className="text-xs font-black text-gray-800 uppercase leading-none">Global Nigeria Fashion</span>
          <span className="text-[10px] text-gray-400 font-medium mt-1">Authentic styles from Lagos.</span>
        </div>
        <button className="bg-blue-600 text-white text-[10px] px-6 py-2.5 rounded-full font-black uppercase shadow-lg">Shop Now</button>
      </section>

      {/* 5. GLOBAL FEED */}
      <section className="flex flex-col space-y-3">
        <h3 className="text-[10px] font-black uppercase text-green-700/60 tracking-widest px-1">Global Community Feed</h3>
        <div className="bg-white/40 border border-green-50 rounded-2xl p-4 shadow-inner flex flex-col">
          {reports.length > 0 ? (
            <div className="space-y-1.5 overflow-y-auto no-scrollbar">
              {reports.slice(0, 4).map((r) => (
                <div key={r.id} className="bg-white/80 p-4 rounded-2xl border border-green-50/50 shadow-md">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-green-900 uppercase flex items-center">
                      <i className="fas fa-map-marker-alt mr-2 text-red-500"></i> {r.location}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-green-950 leading-relaxed font-medium italic">"{r.content}"</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-20">
              <span className="text-[5px] font-black uppercase tracking-widest">Feed syncing...</span>
            </div>
          )}
        </div>
      </section>

      {/* 6. JOURNALIST HQ */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase text-green-700/60 tracking-widest px-1">Journalist HQ</h3>
        <div className="bg-white/40 border border-dashed border-green-200/50 rounded-2xl p-4 shadow-sm">
          {!isReporting ? (
            <button
              onClick={() => setIsReporting(true)}
              className="w-full py-4 text-[10px] font-black text-green-800 uppercase tracking-widest flex items-center justify-center bg-white/80 rounded-2xl border border-green-50 shadow-md active:scale-95 transition-all"
            >
              <i className="fas fa-microphone-alt mr-3 text-red-500 text-[10px]"></i> Report City Happenings
            </button>
          ) : (
            <form onSubmit={handleReport} className="flex flex-col space-y-3 animate-scale-in">
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="What's happening?..."
                className="bg-green-50/50 border border-green-100 rounded-2xl p-4 text-xs h-32 outline-none focus:border-green-400 font-medium resize-none shadow-inner"
              />
              <div className="flex space-x-3">
                <button type="submit" className="flex-1 bg-green-800 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl">
                  Broadcast
                </button>
                <button type="button" onClick={() => setIsReporting(false)} className="px-6 bg-white text-green-900 py-3 rounded-xl text-[10px] font-black border border-green-100">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="text-center pb-8 mt-4 flex flex-col space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-green-950/40">{APP_NAME}</p>
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold text-green-800 uppercase tracking-widest">Designed by Thompson Obosa</span>
          <span className="text-[8px] text-green-600/60 font-mono mt-0.5">© 2026 Nigeria Diaspora Radio</span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: inline-flex; animation: marquee 50s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default ListenerView;
