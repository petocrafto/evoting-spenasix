-- Migration: 20261010_guest_code_2513_and_room_autorefresh.sql
-- Description: Menyempurnakan 3 hal sekaligus:
--   1. KODE RAHASIA PEMILIH TAMU  ->  '2513'
--      (menggantikan '0000'; wajib sama dengan CONFIG.GUEST_VOTE_CODE di js/config.js)
--      Fungsi submit_vote_guest didefinisikan ULANG sehingga migrasi ini AMAN
--      dijalankan baik sebelum maupun sesudah 20261009_guest_manual_voter.sql.
--   2. ANTI DATA GANDA (Double Vote / Double Row)
--      - Baris identitas pemilih tamu di-UPSERT (dipakai ulang), bukan di-INSERT
--        ulang, sehingga nama yang sama tidak pernah menghasilkan dua baris data.
--      - Unique index parsial (nama + kelas, case-insensitive) sebagai pengaman
--        terakhir di level database.
--      - Row lock `pg_advisory_xact_lock` + `FOR UPDATE` membuat dua submit
--        bersamaan (dua perangkat sekaligus) dievaluasi berurutan: hanya satu
--        yang berhasil, yang kedua ditolak TANPA menambah surat suara.
--   3. AUTO REFRESH TERMINAL BILIK (voting-room.html)
--      Supabase Realtime mensyaratkan tabel terdaftar pada publication
--      `supabase_realtime`. Migrasi ini mendaftarkan tabel yang dibutuhkan
--      (voting_rooms, voting_sessions, students, ballots) + REPLICA IDENTITY FULL
--      agar perubahan penugasan siswa langsung dikirim ke terminal bilik maupun
--      dashboard admin TANPA refresh manual. (Polling cadangan 3 detik di sisi
--      klien tetap berjalan sebagai jaring pengaman bila Realtime tidak aktif.)
--   4. PENGUATAN KERAHASIAAN: policy SELECT pada tabel ballots dibatasi hanya
--      untuk admin terotentikasi (sebelumnya ikut terbuka untuk role anon),
--      sehingga siswa tidak dapat membaca/menghitung suara lewat API/Realtime.
--
-- Sifat migrasi: IDEMPOTENT (aman dijalankan berulang).
-- Urutan eksekusi: 20261005 -> 20261006 -> 20261007 -> 20261008 -> 20261009 -> 20261010

-- ==========================================
-- 1. RPC Submit Vote Pemilih Tamu (kode baru: 2513)
-- ==========================================
-- Signature lama 2 argumen (dari 20261008) dihapus agar tidak meninggalkan
-- overload fungsi yang tidak terpakai.
DROP FUNCTION IF EXISTS public.submit_vote_guest(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.submit_vote_guest(
    p_code TEXT,
    p_candidate_id UUID,
    p_nama TEXT,
    p_kelas TEXT,
    p_tipe TEXT DEFAULT 'TAMU'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Kode rahasia panitia. HARUS sama dengan CONFIG.GUEST_VOTE_CODE di js/config.js
    v_secret_code CONSTANT TEXT := '2513';
    v_candidate public.candidates%ROWTYPE;
    v_existing  public.students%ROWTYPE;
    v_nama   TEXT;
    v_detail TEXT;
    v_kelas  TEXT;
    v_tipe   TEXT;
BEGIN
    -- 1. Validasi status pemilihan (harus OPEN)
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau telah ditutup.');
    END IF;

    -- 2. Validasi kode rahasia DI SISI SERVER (bukan hanya di klien)
    IF TRIM(COALESCE(p_code, '')) IS DISTINCT FROM v_secret_code THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kode akses pemilih tamu tidak valid.');
    END IF;

    -- 3. Validasi data manual pemilih tamu
    v_nama := TRIM(COALESCE(p_nama, ''));
    IF LENGTH(v_nama) < 3 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nama pemilih tamu minimal 3 karakter.');
    END IF;

    v_detail := TRIM(COALESCE(p_kelas, ''));
    IF v_detail = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kelas / keterangan pemilih tamu wajib diisi.');
    END IF;

    v_tipe := UPPER(TRIM(COALESCE(p_tipe, 'TAMU')));
    IF v_tipe NOT IN ('SISWA', 'GURU', 'TAMU') THEN
        v_tipe := 'TAMU';
    END IF;

    -- Kelas pemilih tamu SELALU diberi prefiks 'TAMU - ' agar tidak pernah
    -- tercampur dengan kelas siswa asli pada rekap dashboard maupun filter admin.
    v_kelas := 'TAMU - ' || v_detail;

    -- 4. Validasi kandidat aktif
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id AND active = TRUE;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid atau tidak aktif.');
    END IF;

    -- 5. Kunci transaksi per pemilih (nama + kelas/keterangan, dinormalisasi)
    --    agar submit ganda dari dua perangkat berbeda tetap dievaluasi satu per
    --    satu (atomik) dan tidak pernah menghasilkan data/suara ganda.
    PERFORM pg_advisory_xact_lock(hashtext('guest_vote_' || LOWER(v_nama) || '|' || LOWER(v_kelas)));

    -- 6. Cari baris identitas pemilih tamu yang SAMA (abaikan beda huruf
    --    besar/kecil dan spasi berlebih) lalu kunci barisnya.
    SELECT * INTO v_existing
    FROM public.students
    WHERE kategori = 'TAMU'
      AND LOWER(TRIM(nama)) = LOWER(v_nama)
      AND LOWER(TRIM(kelas)) = LOWER(v_kelas)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        -- 6a. Sudah pernah memberikan suara -> TOLAK, tidak ada surat suara kedua
        IF v_existing.has_voted OR v_existing.voting_status = 'VOTED' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Pemilih tamu dengan nama & kelas tersebut sudah tercatat memberikan suara.'
            );
        END IF;

        -- 6b. Sudah terdaftar sebagai tamu namun belum voting -> pakai baris yang
        --     SAMA (UPDATE, bukan INSERT) sehingga tidak ada baris identitas ganda.
        UPDATE public.students
        SET nama = v_nama,
            has_voted = TRUE,
            voting_status = 'VOTED',
            voted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_existing.id;
    ELSE
        -- 7. Identitas pemilih tamu BARU: disimpan tepat satu baris
        --    (kategori 'TAMU', nis NULL agar tidak bentrok dengan NIS siswa).
        INSERT INTO public.students (nis, nama, kelas, kategori, has_voted, voting_status, voted_at)
        VALUES (NULL, v_nama, v_kelas, 'TAMU', TRUE, 'VOTED', NOW());
    END IF;

    -- 8. Surat suara TETAP ANONIM (tanpa student_id / NIS) dan tepat SATU kali.
    INSERT INTO public.ballots (candidate_id) VALUES (v_candidate.id);

    -- 9. Audit log TANPA identitas pemilih: nama tidak dicatat agar pilihan
    --    suara tidak dapat dikorelasikan dengan pemilih tertentu.
    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('SYSTEM', 'VOTE_SUBMITTED', jsonb_build_object('mode', 'GUEST', 'tipe', v_tipe));

    RETURN jsonb_build_object(
        'success', true,
        'nama', v_nama,
        'kelas', v_kelas,
        'message', 'Suara pemilih tamu berhasil dicatat!'
    );
END;
$$;

-- Hak akses eksekusi untuk peran aplikasi (konsisten dengan RPC lain)
GRANT EXECUTE ON FUNCTION public.submit_vote_guest(TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ==========================================
-- 2. Pengaman Anti Data Ganda (Pemilih Tamu)
-- ==========================================
-- Unique index parsial: satu kombinasi nama + kelas/keterangan hanya boleh
-- memiliki SATU baris pemilih tamu. Bila data lama sudah terlanjur mengandung
-- duplikat, index dilewati (dengan pesan NOTICE) supaya migrasi tetap selesai
-- dan daftar ganda bisa dibersihkan lebih dulu dari tab Kelola & Impor Siswa.
DO $$
BEGIN
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_students_guest_unique_identity
            ON public.students (LOWER(TRIM(nama)), LOWER(TRIM(kelas)))
            WHERE kategori = 'TAMU' AND nis IS NULL;

        RAISE NOTICE 'Pengaman anti data ganda pemilih tamu aktif (idx_students_guest_unique_identity).';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Indeks unik pemilih tamu DILEWATI: masih ada data pemilih tamu ganda. Hapus duplikatnya di tab "Kelola & Impor Siswa" (filter Kategori: Pemilih Tamu), lalu jalankan ulang migrasi ini.';
    END;
END;
$$;

-- ==========================================
-- 3. Auto Refresh Terminal Bilik (Supabase Realtime)
-- ==========================================
-- REPLICA IDENTITY FULL: menyertakan seluruh kolom pada data lama (OLD) sehingga
-- filter Realtime berbasis kolom non-primary-key (mis. room_code) tetap bekerja.
ALTER TABLE public.voting_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.voting_sessions REPLICA IDENTITY FULL;

-- Daftarkan tabel ke publication Realtime (idempotent).
-- Tanpa langkah ini, perubahan penugasan siswa TIDAK dikirim ke browser sehingga
-- terminal bilik maupun dashboard admin harus di-refresh manual.
DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY['voting_rooms', 'voting_sessions', 'students', 'ballots'];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'Publication "supabase_realtime" tidak ditemukan. Aktifkan Realtime lewat Supabase Dashboard -> Database -> Replication, lalu jalankan ulang migrasi ini. (Auto refresh tetap berjalan memakai polling 3 detik.)';
        RETURN;
    END IF;

    FOREACH v_table IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = v_table
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
            RAISE NOTICE 'Tabel public.% ditambahkan ke Realtime.', v_table;
        END IF;
    END LOOP;
END;
$$;

-- ==========================================
-- 4. Penguatan Kerahasiaan Tabel ballots
-- ==========================================
-- Sebelumnya policy SELECT mengizinkan role anon membaca tabel ballots, padahal
-- siswa tidak pernah membutuhkannya (hasil agregat hanya diambil admin melalui
-- RPC SECURITY DEFINER get_admin_dashboard_stats). Batasi hanya admin login.
DROP POLICY IF EXISTS "Admin read ballots tally" ON public.ballots;
CREATE POLICY "Admin read ballots tally" ON public.ballots
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ==========================================
-- 5. Pemeriksaan Akhir
-- ==========================================
-- Verifikasi cepat: harus muncul tepat satu baris fungsi submit_vote_guest
-- dengan 5 argumen (TEXT, UUID, TEXT, TEXT, TEXT).
SELECT p.proname AS fungsi,
       pg_get_function_identity_arguments(p.oid) AS argumen
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('submit_vote_guest', 'submit_vote_qr', 'submit_vote_room')
ORDER BY p.proname;
