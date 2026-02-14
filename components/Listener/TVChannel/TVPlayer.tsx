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
    isNewsPlaying: boolean;
    isActive: boolean;
}

const TVPlayer: React.FC<TVPlayerProps> = ({
    activeVideo,
    allVideos,
    news,
    adminMessages,
    onPlayStateChange,
    isNewsPlaying,
    isActive
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
            hideTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
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

    // 1. Sync Play State to Parent
    useEffect(() => {
        onPlayStateChange?.(isPlaying);
    }, [isPlaying, onPlayStateChange]);

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
    const handleEnded = () => {
        if (allVideos.length > 0) {
            // Video ended -> Show Stinger -> (Then Stinger onComplete triggers next video)
            setShowStinger(true);
        }
    };

    const handleStingerComplete = () => {
        setShowStinger(false);
        // Advance to next video
        setCurrentIndex((prev) => (prev + 1) % allVideos.length);
        setIsPlaying(true);
    };

    const togglePlay = () => {
        const newIsPlaying = !isPlaying;
        setIsPlaying(newIsPlaying);
        if (newIsPlaying && isMuted) {
            setIsMuted(false); // Force unmute on manual play interaction
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const currentTrack = allVideos[currentIndex] || activeVideo;

    if (!currentTrack) {
        return (
            <div className="relative aspect-video bg-black overflow-hidden group select-none shadow-2xl">
                {/* OFFLINE MODE: Loop, Controls Visible, Controlled Mute */}
                <TVStinger
                    variant="loop"
                    isMuted={isMuted}
                    onToggleMute={toggleMute}
                    showControls={true}
                />

                {/* Optional minimal offline status overlay */}
                <div className="absolute top-4 right-4 z-50">
                    <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-[8px] font-bold text-white/80 uppercase tracking-widest">Signal Offline</span>
                    </div>
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
                className="absolute inset-0 z-0 cursor-pointer"
                onClick={resetHideTimer}
                onMouseMove={resetHideTimer}
            />
        </div>
    );
};

export default TVPlayer;
