/**
 * Configuration for OSIS Candra Kirana SPENASIX Divisi 9 E-Voting System
 * Supabase project credentials.
 * Replace with your actual Supabase URL and Anon Key.
 */
const CONFIG = {
    // Default Supabase project URL & Anon Key (Replace with your actual Supabase credentials)
    SUPABASE_URL: window.ENV_SUPABASE_URL || 'https://wozimqyucwdosbugygmc.supabase.co',
    SUPABASE_ANON_KEY: window.ENV_SUPABASE_ANON_KEY || 'sb_publishable_zWajLtN4iaQUSlvk_pM2Cg_BI15wR8m',
    
    // Identity constants
    SYSTEM_TITLE: 'OSIS Candra Kirana',
    SUB_IDENTITY_1: 'SPENASIX',
    SUB_IDENTITY_2: 'Divisi 9',
    
    // Voting Session Expiry (in seconds)
    SESSION_EXPIRY_SECONDS: 600, // 10 minutes
    
    // Auto Reset Delay after voting complete on Bilik (in milliseconds)
    ROOM_RESET_DELAY_MS: 5000
};

// Check if credentials are placeholders
function checkSupabaseConfig() {
    if (CONFIG.SUPABASE_URL.includes('your-supabase-project') || CONFIG.SUPABASE_ANON_KEY.includes('your-supabase-anon-key')) {
        console.warn('⚠️ Supabase configuration is set to default placeholder. Please update js/config.js or set localStorage values.');
        return false;
    }
    return true;
}
