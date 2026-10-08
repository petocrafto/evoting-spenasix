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
    ROOM_RESET_DELAY_MS: 5000,

    // Auto Return Delay after voting complete on QR Scan page (in milliseconds)
    // Setelah sukses, layar otomatis kembali ke mode scan untuk pemilih berikutnya.
    SCAN_RESET_DELAY_MS: 5000,

    // Auto Refresh Terminal Bilik (voting-room.html), dalam milidetik.
    // Supabase Realtime tetap dipakai sebagai kanal utama; polling ini adalah
    // kanal cadangan (auto-refresh) supaya penugasan siswa baru langsung tampil
    // di layar bilik TANPA perlu menyegarkan (refresh) halaman secara manual.
    ROOM_POLL_INTERVAL_MS: 3000,

    // Auto Refresh Dashboard Admin (admin.html), dalam milidetik.
    // Dashboard hanya disegarkan saat tab Dashboard sedang aktif & halaman terlihat.
    DASHBOARD_REFRESH_INTERVAL_MS: 5000,

    // Kode rahasia panitia (secret code).
    // Pemilih yang belum / tidak terdaftar dapat tetap memberikan suara sebagai
    // "Pemilih Tamu" dengan mengetikkan kode ini pada kolom NIS di vote.html,
    // lalu mengisi data secara MANUAL (nama + tipe pemilih + kelas/keterangan).
    // Data tersebut tercatat dengan kategori 'TAMU' (lihat menu admin), sedangkan
    // pilihan suara tetap anonim. Harap dirahasiakan; ubah bila perlu.
    // Harus 4 digit angka agar lolos validasi input NIS (pattern \d{4}) dan
    // harus sama dengan v_secret_code pada migrasi terbaru
    // (supabase/migrations/20261010_guest_code_2513_and_room_autorefresh.sql).
    GUEST_VOTE_CODE: '2513'
};

// Check if credentials are placeholders
function checkSupabaseConfig() {
    if (CONFIG.SUPABASE_URL.includes('your-supabase-project') || CONFIG.SUPABASE_ANON_KEY.includes('your-supabase-anon-key')) {
        console.warn('⚠️ Supabase configuration is set to default placeholder. Please update js/config.js or set localStorage values.');
        return false;
    }
    return true;
}
