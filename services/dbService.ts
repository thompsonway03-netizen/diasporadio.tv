import { NewsItem, DjScript, AdminLog, MediaFile, AdminMessage, ListenerReport } from '../types';
import { supabase } from './supabaseClient';

export interface StationState {
  is_playing: boolean;
  is_tv_active: boolean;
  current_track_id: string | null;
  current_track_name: string;
  current_track_url: string | null;
  current_video_id: string | null;
  timestamp: number;
  last_updated: number;
}

const DB_NAME = 'NDN_RADIO_DB';
const MEDIA_STORE = 'media_files'; // Store 1
const CACHE_STORE = 'cached_audio'; // Store 2
const DB_VERSION = 2;

class DBService {
  private STORAGE_KEYS = {
    NEWS: 'ndn_radio_news',
    SCRIPTS: 'ndn_radio_scripts',
    LOGS: 'ndn_radio_logs',
    ADMIN_MSGS: 'ndn_radio_admin_msgs',
    REPORTS: 'ndn_radio_reports',
    LAST_SYNC: 'ndn_radio_last_sync',
    MANUAL_SCRIPT: 'ndn_manual_news_script',
    NEWS_HISTORY: 'ndn_radio_news_history'
  };

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearCache(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      // ONLY use stores that actually exist in IDB
      const stores = [CACHE_STORE];
      if (db.objectStoreNames.contains(MEDIA_STORE)) stores.push(MEDIA_STORE);

      const transaction = db.transaction(stores, 'readwrite');

      transaction.objectStore(CACHE_STORE).clear();

      // Clear LocalStorage keys
      localStorage.removeItem(this.STORAGE_KEYS.NEWS);
      localStorage.removeItem(this.STORAGE_KEYS.LAST_SYNC);
      localStorage.removeItem(this.STORAGE_KEYS.SCRIPTS);
      localStorage.removeItem(this.STORAGE_KEYS.LOGS);
      localStorage.removeItem(this.STORAGE_KEYS.MANUAL_SCRIPT);

      transaction.oncomplete = () => {
        console.log('🧹 [dbService] System Cache Purged.');
        resolve();
      };

      transaction.onerror = () => {
        console.error('❌ [dbService] Cache purge failed:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getCachedAudio(key: string): Promise<Uint8Array | null> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(CACHE_STORE, 'readonly');
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async setCachedAudio(key: string, data: Uint8Array): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(CACHE_STORE);
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getNews(): Promise<NewsItem[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.NEWS);
    const news: NewsItem[] = data ? JSON.parse(data) : [];
    // Strict 48-hour filter (Current News Only)
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    return news.filter(n => n.timestamp > fortyEightHoursAgo);
  }

  async cleanupOldNews(): Promise<void> {
    const news = await this.getNews();
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const freshNews = news.filter(n => n.timestamp > fortyEightHoursAgo);
    localStorage.setItem(this.STORAGE_KEYS.NEWS, JSON.stringify(freshNews));
  }

  async saveNews(news: NewsItem[]): Promise<void> {
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    const freshOnly = news.filter(n => n.timestamp > fortyEightHoursAgo);
    localStorage.setItem(this.STORAGE_KEYS.NEWS, JSON.stringify(freshOnly));
    localStorage.setItem(this.STORAGE_KEYS.LAST_SYNC, Date.now().toString());

    // Also append to history bucket
    await this.addToHistory(news);
  }

  private async addToHistory(news: NewsItem[]): Promise<void> {
    const historyData = localStorage.getItem(this.STORAGE_KEYS.NEWS_HISTORY);
    let history: NewsItem[] = historyData ? JSON.parse(historyData) : [];

    // Merge unique by title/content to avoid duplicates
    const seen = new Set(history.map(h => h.title));
    news.forEach(item => {
      if (!seen.has(item.title)) {
        history.push(item);
        seen.add(item.title);
      }
    });

    // Keep last 200 items in bucket
    localStorage.setItem(this.STORAGE_KEYS.NEWS_HISTORY, JSON.stringify(history.slice(-200)));
  }

  async getNewsHistory(): Promise<NewsItem[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.NEWS_HISTORY);
    return data ? JSON.parse(data) : [];
  }

  async updateNewsInHistory(item: NewsItem): Promise<void> {
    const history = await this.getNewsHistory();
    const index = history.findIndex(h => h.id === item.id);
    if (index !== -1) {
      history[index] = item;
      localStorage.setItem(this.STORAGE_KEYS.NEWS_HISTORY, JSON.stringify(history));
    }
  }

  async deleteNewsFromHistory(id: string): Promise<void> {
    const history = await this.getNewsHistory();
    const filtered = history.filter(h => h.id !== id);
    localStorage.setItem(this.STORAGE_KEYS.NEWS_HISTORY, JSON.stringify(filtered));
  }

  async getLastSyncTime(): Promise<number> {
    const time = localStorage.getItem(this.STORAGE_KEYS.LAST_SYNC);
    return time ? parseInt(time, 10) : 0;
  }

  async addScript(script: DjScript): Promise<void> {
    const scripts = await this.getScripts();
    scripts.unshift(script);
    localStorage.setItem(this.STORAGE_KEYS.SCRIPTS, JSON.stringify(scripts.slice(0, 50)));
  }

  async getScripts(): Promise<DjScript[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.SCRIPTS);
    return data ? JSON.parse(data) : [];
  }

  async addMedia(file: MediaFile): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MEDIA_STORE, 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      if (!file.likes) file.likes = 0;
      const request = store.put(file);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMedia(): Promise<MediaFile[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MEDIA_STORE, 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result as MediaFile[];
        resolve(results.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMedia(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MEDIA_STORE, 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAdminMessages(): Promise<AdminMessage[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.ADMIN_MSGS);
    return data ? JSON.parse(data) : [];
  }

  async clearAdminMessages(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEYS.ADMIN_MSGS);
  }

  async addAdminMessage(msg: AdminMessage): Promise<void> {
    const msgs = await this.getAdminMessages();
    msgs.unshift(msg);
    // Keep only recent messages to prevent ticker bloat
    localStorage.setItem(this.STORAGE_KEYS.ADMIN_MSGS, JSON.stringify(msgs.slice(0, 5)));
  }

  async addReport(report: ListenerReport): Promise<void> {
    const reports = await this.getReports();
    reports.unshift(report);
    localStorage.setItem(this.STORAGE_KEYS.REPORTS, JSON.stringify(reports.slice(0, 50)));
  }

  async getReports(): Promise<ListenerReport[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.REPORTS);
    return data ? JSON.parse(data) : [];
  }

  async addLog(log: AdminLog): Promise<void> {
    const logs = await this.getLogs();
    logs.unshift(log);
    localStorage.setItem(this.STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(0, 100)));
  }

  async getLogs(): Promise<AdminLog[]> {
    const data = localStorage.getItem(this.STORAGE_KEYS.LOGS);
    return data ? JSON.parse(data) : [];
  }

  async getManualScript(): Promise<string> {
    return localStorage.getItem(this.STORAGE_KEYS.MANUAL_SCRIPT) || '';
  }

  async saveManualScript(script: string): Promise<void> {
    localStorage.setItem(this.STORAGE_KEYS.MANUAL_SCRIPT, script);
  }

  // --- SUPABASE REAL-TIME METHODS ---

  async getStationState(): Promise<StationState | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('station_state')
      .select('*')
      .single();

    if (error) {
      console.warn('⚠️ Error fetching station state:', error.message);
      return null;
    }
    return data;
  }

  async updateStationState(state: Partial<StationState>): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('station_state')
      .upsert({ id: 1, ...state, last_updated: Date.now() }); // Always row ID 1

    if (error) console.error('❌ Error updating station state:', error.message);
  }

  async syncNewsToCloud(news: NewsItem[]): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('news_items')
      .upsert(news.map(n => ({ ...n, synced_at: Date.now() })));

    if (error) console.error('❌ Error syncing news to cloud:', error.message);
  }

  async getNewsFromCloud(): Promise<NewsItem[]> {
    if (!supabase) return this.getNews();
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('⚠️ Error fetching cloud news:', error.message);
      return this.getNews();
    }
    return data || [];
  }

  async addAdminMessageCloud(msg: AdminMessage): Promise<void> {
    if (!supabase) {
      await this.addAdminMessage(msg);
      return;
    }
    const { error } = await supabase
      .from('admin_messages')
      .insert([msg]);

    if (error) console.error('❌ Error adding cloud message:', error.message);
  }

  async getAdminMessagesCloud(): Promise<AdminMessage[]> {
    if (!supabase) return this.getAdminMessages();
    const { data, error } = await supabase
      .from('admin_messages')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) return this.getAdminMessages();
    return data || [];
  }

  async addReportCloud(report: ListenerReport): Promise<void> {
    if (!supabase) {
      await this.addReport(report);
      return;
    }
    const { error } = await supabase
      .from('listener_reports')
      .insert([report]);

    if (error) console.error('❌ Error adding cloud report:', error.message);
  }

  async getReportsCloud(): Promise<ListenerReport[]> {
    if (!supabase) return this.getReports();
    const { data, error } = await supabase
      .from('listener_reports')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) return this.getReports();
    return data || [];
  }

  // --- SUPABASE STORAGE (PHASE 2) ---

  async uploadMediaToCloud(file: File, folder: string): Promise<string | null> {
    if (!supabase) return null;
    const fileName = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    const { data, error } = await supabase.storage
      .from('media')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Cloud Upload Error:', error.message);
      throw new Error(`Cloud Upload Error: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('media')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  async addMediaCloud(fileInfo: MediaFile): Promise<void> {
    if (!supabase) {
      await this.addMedia(fileInfo);
      return;
    }
    const { error } = await supabase
      .from('media_files')
      .upsert([fileInfo]);

    if (error) console.error('❌ Error saving cloud media record:', error.message);
  }

  async getMediaCloud(): Promise<MediaFile[]> {
    if (!supabase) return this.getMedia();
    const { data, error } = await supabase
      .from('media_files')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.warn('⚠️ Error fetching cloud media:', error.message);
      return this.getMedia();
    }
    return data || [];
  }

  async deleteMediaCloud(id: string, fileName?: string): Promise<void> {
    if (!supabase) {
      await this.deleteMedia(id);
      return;
    }

    // Delete record
    const { error: dbError } = await supabase
      .from('media_files')
      .delete()
      .eq('id', id);

    if (dbError) console.error('❌ Error deleting cloud record:', dbError.message);

    // Delete file from storage if path provided
    if (fileName) {
      const { error: storageError } = await supabase.storage
        .from('media')
        .remove([fileName]);
      if (storageError) console.warn('⚠️ Storage deletion failed:', storageError.message);
    }
  }
}

export const dbService = new DBService();
