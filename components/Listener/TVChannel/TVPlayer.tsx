import React, { useRef, useState, useEffect } from 'react';
import { MediaFile, NewsItem, AdminMessage } from '../../../types';
import TVOverlay from './TVOverlay';
import TVStinger from './TVStinger';

interface TVPlayerProps {
    activeVideo: MediaFile | null;
    allVideos: MediaFile[];
    news: NewsItem[];
    adminMessages: AdminMessage[];
    onPlayStateChange?: (isPlaying: boolean) => void;
    onRadioPlay?: () => void; // Start radio playback from TV play button
    onVideoAdvance?: (index: number) => void; // Sync for Admin
    isNewsPlaying: boolean;
    isActive: boolean;
    isAdmin?: boolean;
}

const TVPlayer: React.FC<TVPlayerProps> = ({
    activeVideo,
    allVideos,
    news,
    adminMessages,
    onPlayStateChange,
    onRadioPlay,
    onVideoAdvance,
    isNewsPlaying,
    isActive,
    isAdmin = false
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showStinger, setShowStinger] = useState(false); // Stinger overlay state
    const [isMuted, setIsMuted] = useState(true); // Default Muted
    const [showControls, setShowControls] = useState(true); // Auto-hide controls
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const resetHideTimer = () => {
        setShowControls(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        if (isPlaying) {
            hideTimeoutRef.current = setTimeout(() => setShowControls(false), 6000); // 6s instead of 3s
        }
    };

    // Auto-hide controls when playing
    useEffect(() => {
        if (isPlaying) {
            resetHideTimer();
        } else {
            setShowControls(true);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        }
        return () => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [isPlaying]);

    const [lastAdvertTimestamp, setLastAdvertTimestamp] = useState(Date.now());
    const [lastStingerTimestamp, setLastStingerTimestamp] = useState(Date.now());
    const [isAdvertPlaying, setIsAdvertPlaying] = useState(false);
    const [originalTrackIndex, setOriginalTrackIndex] = useState(0);

    // 1. Sync Play State to Parent
    useEffect(() => {
        onPlayStateChange?.(isPlaying);
    }, [isPlaying, onPlayStateChange]);

    // TIMER LOGIC: Adverts (10m) and Stingers (15m)
    useEffect(() => {
        if (!isActive || !isPlaying || isNewsPlaying || !isAdmin) return;

        const interval = setInterval(() => {
            const now = Date.now();

            // 1. ADVERT TIMER (10 minutes = 600,000ms)
            if (!isAdvertPlaying && (now - lastAdvertTimestamp >= 600000)) {
                const adverts = allVideos.filter(v => v.category === 'adverts');
                if (adverts.length > 0) {
                    console.log("📺 [TVPlayer] Triggering Advert Rotation...");
                    const randomAd = adverts[Math.floor(Math.random() * adverts.length)];
                    const adIndex = allVideos.findIndex(v => v.id === randomAd.id);
                    if (adIndex !== -1) {
                        setOriginalTrackIndex(currentIndex);
                        setCurrentIndex(adIndex);
                        setIsAdvertPlaying(true);
                        setLastAdvertTimestamp(now);
                        // No stinger for ads, just cut to it
                        if (videoRef.current) {
                            videoRef.current.currentTime = 0;
                        }
                    }
                } else {
                    // Reset timestamp even if no ads to avoid constant checking
                    setLastAdvertTimestamp(now);
                }
            }

            // 2. STINGER TIMER (15 minutes = 900,000ms)
            if (now - lastStingerTimestamp >= 900000) {
                console.log("🎬 [TVPlayer] Triggering Scheduled Stinger...");
                setShowStinger(true);
                setLastStingerTimestamp(now);
            }
        }, 5000); // Check every 5s

        return () => clearInterval(interval);
    }, [isActive, isPlaying, isNewsPlaying, isAdmin, lastAdvertTimestamp, lastStingerTimestamp, isAdvertPlaying, allVideos, currentIndex]);

    // 2. Sync with Admin Broadcast & Active State (Memory Erase & Start Logic)
    useEffect(() => {
        if (!isActive) {
            setIsPlaying(false);
            setShowStinger(false);
        } else if (activeVideo) {
            // "Erase Memory" - Reset queue when starting fresh or new video forced
            const idx = allVideos.findIndex(v => v.id === activeVideo.id);
            if (idx !== -1) {
                // If this is a new broadcast start, play Stinger first
                // We detect "new start" if we weren't playing or if ID changed significantly
                // ideally we just force stinger on new activeVideo
                setCurrentIndex(idx);
                setShowStinger(true); // START WITH STINGER
                setIsPlaying(true);
            }
        }
    }, [activeVideo?.id, allVideos, isActive]);

    // 3. Playback Logic
    useEffect(() => {
        // Pauses video if Stinger is visible
        if (videoRef.current) {
            const shouldPlayVideo = isPlaying && !isNewsPlaying && isActive && !showStinger;
            if (shouldPlayVideo) {
                videoRef.current.play().catch(e => {
                    console.debug("Playback failed", e);
                    setIsPlaying(false);
                });
            } else {
                videoRef.current.pause();
            }
        }
    }, [isPlaying, currentIndex, isNewsPlaying, isActive, showStinger]);

    // 4. Endless Loop & Stinger Transition Logic
    const handleStingerComplete = () => {
        setShowStinger(false);
        // Advance to next video
        const nextIndex = (currentIndex + 1) % allVideos.length;
        setCurrentIndex(nextIndex);
        setIsPlaying(true);

        // ADMIN SYNC: Signal all listeners to advance
        if (isAdmin && onVideoAdvance) {
            onVideoAdvance(nextIndex);
        }
    };

    const handleEnded = () => {
        if (isAdvertPlaying) {
            console.log("📺 [TVPlayer] Advert completed, returning to main sequence...");
            setCurrentIndex(originalTrackIndex);
            setIsAdvertPlaying(false);
            // Show stinger when returning to main sequence for professional feel
            setShowStinger(true);
        } else if (allVideos.length > 0) {
            // Video ended -> Show Stinger -> (Then Stinger onComplete triggers next video)
            setShowStinger(true);
        }
    };

    const togglePlay = () => {
        const newIsPlaying = !isPlaying;
        setIsPlaying(newIsPlaying);
        if (newIsPlaying && isMuted) {
            setIsMuted(false); // Force unmute on manual play interaction
        }
        // Auto-fullscreen on mobile when user taps play
        if (newIsPlaying && containerRef.current && !document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(() => { });
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const currentTrack = allVideos[currentIndex] || activeVideo;

    if (!isActive) {
        return (
            <div ref={containerRef} className="relative bg-black overflow-hidden group select-none shadow-2xl rounded-xl w-full h-full">
                {/* Looping Stinger instead of static "Station Live" */}
                <TVStinger
                    variant="loop"
                    isMuted={isMuted} // Updated to follow player state
                    isPlaying={isPlaying}
                    showControls={false}
                />
                {/* PLAY BUTTON ON TV - NOW TV-ONLY (NO RADIO FALLBACK) */}
                <div className="absolute inset-0 z-40 flex items-center justify-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay(); // Strictly play/pause local loop
                        }}
                        className="w-16 h-16 rounded-full flex items-center justify-center bg-[#008751]/80 hover:bg-[#008751] backdrop-blur-md shadow-2xl transition-all active:scale-90 border-2 border-white/30"
                        style={{ boxShadow: '0 0 30px rgba(0,135,81,0.5)' }}
                    >
                        {/* {isPlaying ? <i className="fas fa-pause text-white text-2xl ml-1"></i> : <i className="fas fa-play text-white text-2xl ml-1"></i>} */}
                        {/* Always show "Play" icon if loop is paused or just to invite interaction */}
                        <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-white text-2xl ml-1`}></i>
                    </button>
                </div>
                {/* PERMANENT CONTROLS - ALWAYS VISIBLE (Z-60) */}
                <div className="absolute bottom-4 right-4 z-[60] flex items-center space-x-3 pointer-events-auto">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="w-10 h-10 bg-black/60 hover:bg-[#008751] backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                    >
                        {isPlaying ? <i className="fas fa-pause text-xs"></i> : <i className="fas fa-play text-xs ml-0.5"></i>}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                        }}
                        className="w-10 h-10 bg-black/60 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                    >
                        <i className="fas fa-expand text-xs"></i>
                    </button>
                </div>
            </div>
        );
    }

    if (!currentTrack) {
        return (
            <div ref={containerRef} className="relative bg-black overflow-hidden group select-none shadow-2xl w-full h-full">
                {/* OFFLINE MODE: Loop, Controls Visible, Controlled Mute */}
                <TVStinger
                    variant="loop"
                    isMuted={isMuted}
                    onToggleMute={toggleMute}
                    showControls={true}
                />

                {/* PLAY BUTTON ON TV - OFFLINE ACTIVE - NOW TV-ONLY */}
                <div className="absolute inset-0 z-40 flex items-center justify-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="w-16 h-16 rounded-full flex items-center justify-center bg-[#008751]/80 hover:bg-[#008751] backdrop-blur-md shadow-2xl transition-all active:scale-90 border-2 border-white/30"
                        style={{ boxShadow: '0 0 30px rgba(0,135,81,0.5)' }}
                    >
                        <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-white text-2xl ml-1`}></i>
                    </button>
                </div>

                {/* Optional minimal offline status overlay */}
                <div className="absolute top-4 right-4 z-50">
                    <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-[8px] font-bold text-white/80 uppercase tracking-widest">Signal Offline</span>
                    </div>
                </div>

                {/* PERMANENT CONTROLS - ALWAYS VISIBLE (Z-60) */}
                <div className="absolute bottom-4 right-4 z-[60] flex items-center space-x-3 pointer-events-auto">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="w-16 h-16 bg-black/60 hover:bg-[#008751] backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                    >
                        {!!activeVideo && isPlaying ? <i className="fas fa-pause text-xs"></i> : <i className="fas fa-play text-xs ml-0.5"></i>}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFullscreen();
                        }}
                        className="w-10 h-10 bg-black/60 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                    >
                        <i className="fas fa-expand text-xs"></i>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative aspect-video bg-black overflow-hidden group select-none shadow-2xl">
            {/* STRICT OVERFLOW CONTROL */}
            <video
                ref={videoRef}
                key={currentTrack.url}
                src={currentTrack.url}
                className="w-full h-full object-cover pointer-events-none"
                autoPlay={false}
                muted={isMuted}
                playsInline
                onEnded={handleEnded}
            />


            {/* Stinger Overlay (ON AIR MODE: Sequence, No Controls, Controlled Mute) */}
            {showStinger && (
                <TVStinger
                    onComplete={handleStingerComplete}
                    variant="sequence"
                    isMuted={isMuted}
                    showControls={false}
                />
            )}

            {/* Overlays (ON AIR MODE: No Mute Controls as requested) */}
            <TVOverlay
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onToggleFullscreen={toggleFullscreen}
                channelName="NDRTV"
                news={news}
                adminMessages={adminMessages}
                isVisible={showControls}
            />

            {/* Tap surface to show controls */}
            <div
                className="absolute inset-0 z-30 cursor-pointer"
                onClick={resetHideTimer}
                onMouseMove={resetHideTimer}
            />

            {/* PERMANENT CONTROLS - ALWAYS VISIBLE (Z-60) */}
            <div className="absolute bottom-4 right-4 z-[60] flex items-center space-x-3 pointer-events-auto">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                    }}
                    className="w-10 h-10 bg-black/60 hover:bg-[#008751] backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                >
                    {isPlaying ? <i className="fas fa-pause text-xs"></i> : <i className="fas fa-play text-xs ml-0.5"></i>}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                    }}
                    className="w-10 h-10 bg-black/60 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-all active:scale-95"
                >
                    <i className="fas fa-expand text-xs"></i>
                </button>
            </div>
        </div>
    );
};

export default TVPlayer;
