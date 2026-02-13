import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validation: Ensure URL is present, not a placeholder, and starts with https://
const isValidUrl = supabaseUrl &&
    !supabaseUrl.includes('REPLACE') &&
    supabaseUrl.startsWith('https://');

if (!isValidUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase credentials missing or invalid format. Real-time sync disabled.');
}

export const supabase = (isValidUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
