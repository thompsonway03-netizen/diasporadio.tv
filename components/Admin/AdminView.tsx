
import React, { useState, useRef } from 'react';
import { AdminLog, MediaFile, AdminMessage, NewsItem, ListenerReport } from '../../types';
import { dbService } from '../../services/dbService';
import { NEWSCASTER_NAME } from '../../constants';
import ModularNewsUI from './NewsRoom/ModularNewsUI';

interface AdminViewProps {
  onRefreshData: () => void;
  logs: AdminLog[];
  onPlayTrack: (track: MediaFile) => void;
  isRadioPlaying: boolean;
  onToggleRadio: () => void;
  currentTrackName: string;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  onPlayAll: () => void;
  onSkipNext: () => void;
  onPushBroadcast: (text: string) => Promise<void>;
  onPlayJingle?: (index: 1 | 2) => Promise<void>;
  news?: NewsItem[];
  onTriggerFullBulletin?: () => Promise<void>;
  onTriggerManualBroadcast?: () => Promise<void>;
  onTriggerPodcast?: (text: string) => Promise<void>; // Deprecated but kept for compatibility
  onPlayPodcastFile?: (file: File) => Promise<void>; // New
  onPlayDirectTTS?: (text: string) => Promise<void>; // New
  onSaveManualScript?: (script: string) => Promise<void>; // New
  onClearNews?: () => void; // New
  onStopNews?: () => void; // New
  manualScript?: string; // New
  newsHistory?: NewsItem[]; // New
  onManualBroadcast?: (item: NewsItem) => void; // New
  onAddNews?: (item: NewsItem) => void; // New
  onUpdateNews?: (item: NewsItem) => void; // New
  onDeleteNews?: (id: string) => void; // New
  mediaFiles: MediaFile[];
  status?: string;
  activeVideoId?: string | null;
  onPlayVideo?: (track: MediaFile) => void;
  reports?: ListenerReport[];
}

type Tab = 'command' | 'bulletin' | 'manual' | 'media' | 'inbox' | 'logs' | 'podcast';
type MediaSubTab = 'audio' | 'video';

const AdminView: React.FC<AdminViewProps> = ({
  onRefreshData,
  logs,
  onPlayTrack,
  isRadioPlaying,
  onToggleRadio,
  currentTrackName,
  isShuffle,
  onToggleShuffle,
  onPlayAll,
  onSkipNext,
  onPushBroadcast,
  onPlayJingle,
  news = [],
  onTriggerFullBulletin,
  onTriggerManualBroadcast,
  onTriggerPodcast,
  onPlayPodcastFile,
  onPlayDirectTTS,
  onSaveManualScript,
  onClearNews,
  onStopNews,
  manualScript = '',
  newsHistory = [],
  onManualBroadcast,
  onAddNews,
  onUpdateNews,
  onDeleteNews,
  mediaFiles = [], status, onRefreshWire, activeVideoId, onPlayVideo, onDeleteMedia, reports
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('command');
  const [mediaSubTab, setMediaSubTab] = useState<MediaSubTab>('audio');
  const [isProcessing, setIsProcessing] = useState(false);
  const [internalStatus, setInternalStatus] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [podcastText, setPodcastText] = useState('');
  const [manualText, setManualText] = useState(manualScript);
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ title: '', content: '', category: 'Manual' });
  const [selectedJingleUrl, setSelectedJingleUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-sync manualText when prop changes
  React.useEffect(() => {
    setManualText(manualScript);
  }, [manualScript]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, isFolder: boolean = false) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setInternalStatus(`Uploading ${files.length} items...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let type: 'audio' | 'video' | 'image' = 'audio';
        if (file.type.startsWith('video')) type = 'video';
        else if (file.type.startsWith('image')) type = 'image';

        const folder = type === 'audio' ? 'music' : type === 'video' ? 'videos' : 'images';
        setInternalStatus(`Uploading ${file.name}...`);

        const publicUrl = await dbService.uploadMediaToCloud(file, folder);

        if (!publicUrl) {
          throw new Error(`Upload failed for ${file.name}.`);
        }

        const newMedia: MediaFile = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: publicUrl,
          type: type,
          timestamp: Date.now(),
          likes: 0
        };

        await dbService.addMediaCloud(newMedia);
      }
      onRefreshData();
      setInternalStatus('✅ Cloud Upload complete!');
    } catch (error: any) {
      console.error('❌ Upload failed:', error);
      setInternalStatus(`❌ Error: ${error.message || 'Upload failed'}`);
    } finally {
      setIsProcessing(false);
      // Keep error message visible longer if it failed
      setTimeout(() => setInternalStatus(''), internalStatus.includes('❌') ? 10000 : 2000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLiveBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setIsProcessing(true);
    setInternalStatus('Broadcasting...');
    try {
      await onPushBroadcast(broadcastText);
      setBroadcastText('');
      setInternalStatus('Broadcast Sent!');
    } catch (e) {
      setInternalStatus('Error broadcasting');
    }
    setIsProcessing(false);
    setTimeout(() => setInternalStatus(''), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-green-50/50">
      {/* Navigation */}
      <nav className="flex flex-wrap items-center justify-between bg-white/80 backdrop-blur-sm p-1.5 rounded-lg border border-green-100 shadow-sm mb-3 mt-1 gap-1">
        <button
          onClick={() => setActiveTab('command')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'command' ? 'bg-green-600 text-white shadow-inner' : 'bg-white text-green-800 hover:bg-green-50'}`}
        >
          Studio v2.1
        </button>
        <button
          onClick={() => setActiveTab('bulletin')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'bulletin' ? 'bg-red-600 text-white shadow-inner' : 'bg-white text-red-800 hover:bg-red-50'}`}
        >
          Newsroom
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'manual' ? 'bg-orange-600 text-white shadow-inner' : 'bg-white text-orange-800 hover:bg-orange-50'}`}
        >
          Manual
        </button>
        <button
          onClick={() => setActiveTab('podcast')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'podcast' ? 'bg-indigo-600 text-white shadow-inner' : 'bg-white text-indigo-800 hover:bg-indigo-50'}`}
        >
          Podcast
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'media' ? 'bg-green-600 text-white shadow-inner' : 'bg-white text-green-800 hover:bg-green-50'}`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'inbox' ? 'bg-green-600 text-white shadow-inner' : 'bg-white text-green-800 hover:bg-green-50'}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 min-w-[50px] py-2 text-center text-[7px] font-bold uppercase transition-colors rounded ${activeTab === 'logs' ? 'bg-green-600 text-white shadow-inner' : 'bg-white text-green-800 hover:bg-green-50'}`}
        >
          Logs
        </button>
        <button
          onClick={onToggleRadio}
          className={`px-3 py-2 text-[8px] font-black uppercase rounded shadow-sm transition-all ${isRadioPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-[#008751] text-white hover:bg-green-700'}`}
          title={isRadioPlaying ? 'Stop Broadcast' : 'Start Broadcast'}
        >
          <i className={`fas ${isRadioPlaying ? 'fa-stop' : 'fa-play'}`}></i>
        </button>
      </nav>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-green-100 p-3 flex-grow overflow-hidden">

        {/* COMMAND STUDIO */}
        {activeTab === 'command' && (
          <div className="space-y-4 animate-fadeIn overflow-y-auto h-full pr-1 custom-scrollbar">
            <div className="bg-green-50 p-3 rounded-lg border border-green-100 relative overflow-hidden">
              {/* Visual Monitor for Admin (Uses Active Video ID) */}
              {activeVideoId ? (
                <div className="absolute top-2 right-2 w-20 aspect-video bg-black rounded border border-green-500 shadow-lg z-10 overflow-hidden">
                  {/* Muted video mirror for admin confirmation */}
                  <video
                    src={mediaFiles.find(m => m.id === activeVideoId)?.url}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-white text-[5px] font-black text-center">LIVE FEED</div>
                </div>
              ) : null}

              <div className="flex justify-between items-center mb-2">
                <h3 className="text-[8px] font-black uppercase text-green-800">Master Control</h3>
                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${isRadioPlaying ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-500'}`}>
                  {isRadioPlaying ? 'ON AIR' : 'OFF AIR'}
                </span>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <button
                  onClick={onToggleRadio}
                  className={`flex-1 py-3 rounded-lg text-white font-black text-[10px] uppercase shadow-md transition-transform active:scale-95 ${isRadioPlaying ? 'bg-red-500 hover:bg-red-600 border-red-400' : 'bg-green-500 hover:bg-green-600 border-green-400'} border-b-2`}
                >
                  {isRadioPlaying ? 'Stop Broadcast' : 'Start Broadcast'}
                </button>

                <button
                  onClick={onSkipNext}
                  className="px-4 py-3 bg-white text-green-700 rounded-lg shadow-sm border border-green-200 hover:bg-green-50 transition-colors"
                >
                  <i className="fas fa-forward"></i>
                </button>
              </div>

              <div className="flex items-center justify-between mt-3 text-[8px] font-bold text-green-700 bg-white/50 p-2 rounded border border-green-100">
                <div className="flex items-center space-x-2">
                  <button onClick={onToggleShuffle} className={`${isShuffle ? 'text-green-600' : 'text-gray-400'}`}>
                    <i className="fas fa-random"></i>
                  </button>
                  <span className="truncate max-w-[150px]">{currentTrackName}</span>
                </div>
                <button onClick={onPlayAll} className="text-green-600 hover:underline text-[7px]">Play All</button>
              </div>
            </div>

            {/* Quick Jingle Deck */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onPlayJingle?.(1)}
                disabled={isProcessing}
                className="bg-yellow-400 text-yellow-900 py-2 rounded-lg text-[7.5px] font-black uppercase shadow-sm border-b-2 border-yellow-500 hover:bg-yellow-300 active:scale-95 transition-all"
              >
                Jingle 1
              </button>
              <button
                onClick={() => {
                  const instrumental = mediaFiles.find(m => m.name.toLowerCase().includes('instrumentals (1)'));
                  if (instrumental) {
                    const audio = new Audio(instrumental.url);
                    audio.play().catch(e => console.error("Instrumental Jingle failed", e));
                  } else {
                    onPlayJingle?.(2);
                  }
                }}
                disabled={isProcessing}
                className="bg-orange-400 text-orange-900 py-2 rounded-lg text-[7.5px] font-black uppercase shadow-sm border-b-2 border-orange-500 hover:bg-orange-300 active:scale-95 transition-all"
              >
                Jingle 2
              </button>
            </div>

            {/* Text-to-Speech Broadcast */}
            <div className="border border-green-100 rounded-lg p-2 bg-white">
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="Type urgent alert message..."
                className="w-full h-16 text-[8px] p-2 bg-gray-50 rounded border border-gray-100 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none mb-2"
              />
              <button
                onClick={handleLiveBroadcast}
                disabled={isProcessing || !broadcastText}
                className={`w-full py-2 rounded-lg text-[8px] font-black uppercase text-white shadow-sm transition-colors ${isProcessing || !broadcastText ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 border-b-2 border-red-700'}`}
              >
                {isProcessing ? 'Transmitting...' : 'Push Live Alert'}
              </button>
            </div>
          </div>
        )}

        {/* NEWSROOM (MODULAR REBUILD) */}
        {activeTab === 'bulletin' && (
          <ModularNewsUI
            news={news}
            status={status || internalStatus}
            isProcessing={isProcessing}
            manualText={manualText}
            onManualTextChange={setManualText}
            onSaveManualScript={async () => {
              setIsProcessing(true);
              try {
                await onSaveManualScript?.(manualText);
                setInternalStatus('SCHEDULE UPDATED ✅');
              } catch (e) {
                setInternalStatus('SAVE FAILED ❌');
              }
              setIsProcessing(false);
              setTimeout(() => setInternalStatus(''), 2000);
            }}
            onTriggerFavour={() => {
              const hub = document.getElementById('favour-engine-trigger');
              if (hub) hub.click();
              onTriggerFullBulletin?.();
            }}
            onTriggerThompson={() => {
              const hub = document.getElementById('thompson-engine-trigger');
              if (hub) hub.click();
              onTriggerManualBroadcast?.();
            }}
            onRefreshWire={onRefreshWire || onRefreshData}
            onClearNews={onClearNews || (() => { })}
            onStop={onStopNews || (() => { })}
          />
        )}

        {/* MANUAL OVERRIDE (NEWS BUCKET) */}
        {activeTab === 'manual' && (
          <div className="h-full flex flex-col animate-fadeIn overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[9px] font-black uppercase text-orange-900 flex items-center">
                <i className="fas fa-bullhorn mr-2"></i> Manual Broadcast Station
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-3 py-1 bg-green-600 text-white text-[7px] font-black uppercase rounded-full hover:bg-green-700 shadow-sm transition-colors"
                >
                  + Add News
                </button>
              </div>
            </div>

            {/* Jingle Selector */}
            <div className="bg-orange-50 p-2 rounded-lg border border-orange-100 mb-3 flex items-center space-x-2">
              <select
                value={selectedJingleUrl}
                onChange={(e) => setSelectedJingleUrl(e.target.value)}
                className="flex-1 text-[8px] p-1 bg-white border border-orange-200 rounded font-bold uppercase outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Select MP3 Jingle...</option>
                {mediaFiles.filter(m => m.type === 'audio').map(m => (
                  <option key={m.id} value={m.url}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedJingleUrl) return;
                  const audio = new Audio(selectedJingleUrl);
                  audio.play().catch(e => console.error("MP3 Jingle failed", e));
                }}
                disabled={!selectedJingleUrl}
                className={`px-3 py-2 rounded text-[7px] font-black uppercase shadow-sm transition-all ${selectedJingleUrl ? 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                Play Jingle
              </button>
            </div>

            {/* Add/Edit Form Overlay */}
            {(showAddForm || editingItem) && (
              <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-xs rounded-xl shadow-2xl overflow-hidden border border-orange-200 animate-slideUp">
                  <div className="bg-orange-600 p-3 flex justify-between items-center">
                    <h4 className="text-white text-[9px] font-black uppercase">
                      {editingItem ? 'Edit News Story' : 'Create New Manual Story'}
                    </h4>
                    <button onClick={() => { setShowAddForm(false); setEditingItem(null); }} className="text-white/80 hover:text-white transition-colors">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-[7px] font-black uppercase text-gray-400 mb-1">Category</label>
                      <input
                        type="text"
                        value={editingItem ? editingItem.category : newItem.category}
                        onChange={(e) => editingItem ? setEditingItem({ ...editingItem, category: e.target.value }) : setNewItem({ ...newItem, category: e.target.value })}
                        className="w-full text-[9px] p-2 bg-gray-50 border border-gray-100 rounded focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[7px] font-black uppercase text-gray-400 mb-1">Headline</label>
                      <input
                        type="text"
                        value={editingItem ? editingItem.title : newItem.title}
                        onChange={(e) => editingItem ? setEditingItem({ ...editingItem, title: e.target.value }) : setNewItem({ ...newItem, title: e.target.value })}
                        className="w-full text-[9px] p-2 bg-gray-50 border border-gray-100 rounded focus:ring-1 focus:ring-orange-500 outline-none font-bold transition-all"
                        placeholder="Enter headline..."
                      />
                    </div>
                    <div>
                      <label className="block text-[7px] font-black uppercase text-gray-400 mb-1">Content</label>
                      <textarea
                        value={editingItem ? editingItem.content : newItem.content}
                        onChange={(e) => editingItem ? setEditingItem({ ...editingItem, content: e.target.value }) : setNewItem({ ...newItem, content: e.target.value })}
                        className="w-full h-24 text-[9px] p-2 bg-gray-50 border border-gray-100 rounded focus:ring-1 focus:ring-orange-500 outline-none resize-none transition-all"
                        placeholder="Write the full news report here..."
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (editingItem) {
                          onUpdateNews?.(editingItem);
                          setEditingItem(null);
                        } else {
                          onAddNews?.({
                            id: 'man-' + Date.now(),
                            title: newItem.title,
                            content: newItem.content,
                            category: newItem.category,
                            source: 'Manual entry',
                            timestamp: Date.now(),
                            priority: 100
                          });
                          setShowAddForm(false);
                          setNewItem({ title: '', content: '', category: 'Manual' });
                        }
                      }}
                      className="w-full py-2.5 bg-green-600 text-white text-[9px] font-black uppercase rounded shadow-lg hover:bg-green-700 transition-all border-b-2 border-green-800"
                    >
                      {editingItem ? 'Update Story' : 'Save & Add to Bucket'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">
              {(!newsHistory || newsHistory.length === 0) ? (
                <div className="text-center py-10 text-gray-400 text-[8px] italic">No archived news yet. News will drop here as it's fetched.</div>
              ) : (
                newsHistory.map((item) => (
                  <div key={item.id} className="p-3 bg-white border border-orange-100 rounded-lg shadow-sm hover:border-orange-300 transition-all group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded-full">{item.category}</span>
                      <div className="flex space-x-2">
                        <button onClick={() => setEditingItem(item)} className="text-gray-400 hover:text-blue-600 text-[8px] transition-colors"><i className="fas fa-edit"></i></button>
                        <button onClick={() => onDeleteNews?.(item.id)} className="text-gray-400 hover:text-red-600 text-[8px] transition-colors"><i className="fas fa-trash"></i></button>
                      </div>
                    </div>
                    <h4 className="text-[8px] font-black text-gray-800 mb-1 leading-tight">{item.title}</h4>
                    <p className="text-[7px] text-gray-600 line-clamp-2 mb-2 leading-relaxed">{item.content}</p>
                    <button
                      onClick={() => onManualBroadcast?.(item)}
                      className="w-full py-1.5 bg-orange-600 text-white text-[7px] font-black uppercase rounded shadow-sm hover:bg-orange-700 active:scale-95 transition-all flex items-center justify-center space-x-2"
                    >
                      <i className="fas fa-bullhorn"></i>
                      <span>Broadcast Story Now</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PODCAST STUDIO */}
        {activeTab === 'podcast' && (
          <div className="flex flex-col h-full space-y-3 animate-fadeIn overflow-y-auto pr-1">
            {/* SECTION 1: UPLOAD AUDIO */}
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex-shrink-0">
              <h3 className="text-[9px] font-black uppercase text-indigo-900 mb-2">
                <i className="fas fa-cloud-upload-alt mr-1"></i> Upload Live Audio
              </h3>
              <input
                type="file"
                accept="audio/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  setIsProcessing(true);
                  setInternalStatus('Broadcasting file...');
                  try {
                    // Use destructured prop directly
                    await onPlayPodcastFile?.(file);
                    setInternalStatus('Now Playing: ' + file.name);
                  } catch (error: any) {
                    console.error('File broadcast failed:', error);
                    setInternalStatus('Error: ' + error.message);
                  }
                  setIsProcessing(false);
                  setTimeout(() => setInternalStatus(''), 3000);
                  e.target.value = ''; // Reset input
                }}
                disabled={isProcessing}
                className="block w-full text-[8px] text-indigo-700
                  file:mr-2 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-[8px] file:font-semibold
                  file:bg-indigo-100 file:text-indigo-700
                  hover:file:bg-indigo-200 cursor-pointer"
              />
            </div>

            {/* SECTION 2: DIRECT TEXT-TO-SPEECH (ELEVENLABS) */}
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex-col flex min-h-[200px]">
              <h3 className="text-[9px] font-black uppercase text-indigo-900 mb-1">
                <i className="fas fa-microphone-alt mr-1"></i> Direct News Reader
              </h3>
              <p className="text-[7px] text-indigo-700 mb-2 leading-tight">
                Paste any text below. The AI Host will read it immediately (using ElevenLabs).
                <strong>No Script Generation (Uses strictly what you type).</strong>
              </p>
              <textarea
                value={podcastText}
                onChange={(e) => setPodcastText(e.target.value)}
                placeholder="Type or paste the exact text you want read on air..."
                className="w-full flex-grow h-32 p-2 text-[9px] border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none bg-white text-gray-800 placeholder-indigo-300 mb-2"
              />

              <button
                onClick={async () => {
                  if (!podcastText.trim()) return;
                  setIsProcessing(true);
                  setInternalStatus('Generating Speech (ElevenLabs)...');
                  try {
                    // Use destructured prop directly
                    await onPlayDirectTTS?.(podcastText);
                    setInternalStatus('Broadcasting Text!');
                  } catch (error) {
                    console.error('TTS error:', error);
                    setInternalStatus('Error: TTS failed');
                  }
                  setTimeout(() => setInternalStatus(''), 3000);
                  setIsProcessing(false);
                }}
                disabled={isProcessing || !podcastText.trim()}
                className={`w-full bg-indigo-600 text-white py-3 rounded-xl text-[8px] font-black uppercase flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-colors shadow-md border border-indigo-500 flex-shrink-0 ${isProcessing || !podcastText.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <i className={`fas ${isProcessing ? 'fa-spinner fa-spin' : 'fa-bullhorn'}`}></i>
                <span>{isProcessing ? 'Reading...' : 'Read Text On Air'}</span>
              </button>
            </div>

            {internalStatus && (
              <div className="text-center text-[8px] font-bold text-indigo-600 animate-pulse mt-1">
                {internalStatus}
              </div>
            )}
          </div>
        )}

        {/* MEDIA LIBRARY */}
        {activeTab === 'media' && (
          <div className="h-full flex flex-col animate-fadeIn">
            <div className="flex space-x-2 mb-3 bg-gray-50 p-1 rounded-lg flex-shrink-0">
              <button
                onClick={() => setMediaSubTab('audio')}
                className={`flex-1 py-1 text-[7px] font-bold uppercase rounded ${mediaSubTab === 'audio' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}
              >
                Music
              </button>
              <button
                onClick={() => setMediaSubTab('video')}
                className={`flex-1 py-1 text-[7px] font-bold uppercase rounded ${mediaSubTab === 'video' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}
              >
                Videos
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <input
                  type="file"
                  id="media-upload"
                  multiple
                  accept={mediaSubTab === 'audio' ? "audio/*" : "video/*"}
                  onChange={(e) => handleFileUpload(e, false)}
                  className="hidden"
                  ref={fileInputRef}
                />
                <label
                  htmlFor="media-upload"
                  className="block w-full text-center py-2 border-2 border-dashed border-green-200 rounded-lg text-[8px] font-bold text-green-600 hover:bg-green-50 cursor-pointer transition-colors"
                >
                  <i className="fas fa-file-upload mr-1"></i> Upload {mediaSubTab === 'audio' ? 'Tracks' : 'Videos'}
                </label>
              </div>
              <div>
                <input
                  type="file"
                  id="folder-upload"
                  multiple
                  {...({ webkitdirectory: "" } as any)}
                  accept={mediaSubTab === 'audio' ? "audio/*" : "video/*"}
                  onChange={(e) => handleFileUpload(e, true)}
                  className="hidden"
                />
                <label
                  htmlFor="folder-upload"
                  className="block w-full text-center py-2 border-2 border-dashed border-green-200 rounded-lg text-[7px] font-bold text-green-600 hover:bg-green-50 cursor-pointer transition-colors"
                >
                  <i className="fas fa-folder-open mr-1"></i> {mediaSubTab === 'audio' ? 'Music' : 'Video'} Folder
                </label>
              </div>
            </div>

            {/* Master Play All Button */}
            {mediaSubTab === 'audio' && mediaFiles.filter(m => m.type === 'audio').length > 0 && (
              <button
                onClick={onPlayAll}
                className="w-full mb-3 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[9px] font-black uppercase shadow-md transition-all active:scale-95 flex items-center justify-center space-x-2"
              >
                <i className="fas fa-play-circle"></i>
                <span>Play All Tracks</span>
              </button>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1 min-h-[200px]">
              {/* This would need to filter by MediaSubTab but simplifying for now */}
              {(mediaSubTab === 'audio' ? mediaFiles.filter(m => m.type === 'audio') : mediaFiles.filter(m => m.type !== 'audio')).map(file => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-white border border-gray-100 rounded group hover:border-green-200">
                  <div className="flex items-center space-x-2 overflow-hidden">
                    <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center text-green-600 text-[10px]">
                      <i className={`fas ${file.type === 'audio' ? 'fa-music' : 'fa-video'}`}></i>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] font-bold text-gray-700 truncate">{file.name}</span>
                      <span className="text-[7px] text-gray-400">{new Date(file.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        if (file.type === 'audio') {
                          onPlayTrack(file);
                        } else {
                          onPlayVideo?.(file);
                        }
                      }}
                      className="w-6 h-6 rounded-full bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center transition-colors"
                      title="Play Globally"
                    >
                      <i className="fas fa-play text-[8px]"></i>
                    </button>
                    {onDeleteMedia && (
                      <button
                        onClick={async () => {
                          if (window.confirm('Delete this file from cloud?')) {
                            setIsProcessing(true);
                            const folder = file.type === 'audio' ? 'music' : file.type === 'video' ? 'videos' : 'images';
                            await onDeleteMedia(file.id, `${folder}/${file.name}`);
                            onRefreshData();
                            setIsProcessing(false);
                          }
                        }}
                        title="Delete from Cloud"
                        className="w-6 h-6 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors"
                      >
                        <i className="fas fa-trash text-[8px]"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INBOX (MESSAGES) */}
        {activeTab === 'inbox' && (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1 animate-fadeIn">
            <h3 className="text-[10px] font-black uppercase text-green-900 mb-2">Listener Reports</h3>
            <div className="space-y-2">
              {reports && reports.length > 0 ? reports.map((report) => (
                <div key={report.id} className="p-3 bg-gray-50 border border-gray-100 rounded-lg shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[8px] font-black text-green-800 uppercase">{report.reporterName}</span>
                    <span className="text-[7px] text-gray-400">{new Date(report.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-[7px] text-blue-600 font-bold mb-1"><i className="fas fa-map-marker-alt mr-1"></i>{report.location}</div>
                  <p className="text-[9px] text-gray-700 leading-tight italic">"{report.content}"</p>
                </div>
              )) : (
                <div className="text-center py-4 text-gray-400 text-[8px]">No new reports from listeners.</div>
              )}
            </div>
          </div>
        )}

        {/* LOGS */}
        {activeTab === 'logs' && (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1 animate-fadeIn">
            <h3 className="text-[10px] font-black uppercase text-green-900 mb-2">System Logs</h3>
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="text-[7px] font-mono p-1 bg-gray-50 border-l-2 border-green-300">
                  <span className="text-gray-400 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-gray-700">{log.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {internalStatus && !activeTab.includes('command') && !activeTab.includes('podcast') && (
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <span className="bg-black/70 text-white px-2 py-1 rounded text-[7px] backdrop-blur-sm">{internalStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminView;
