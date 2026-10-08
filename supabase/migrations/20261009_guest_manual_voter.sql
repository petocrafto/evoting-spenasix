-- Migration: 20261009_guest_manual_voter.sql
-- Description: Mengubah mode "Pemilih Tamu" (dipicu kode rahasia, default: 2513)
--              pada halaman Voting ID Card (vote.html) dari sekadar suara anonim
--              menjadi INPUT DATA MANUAL (nama + tipe pemilih + kelas/keterangan),
--              yaitu cara pengisian data yang sama seperti data siswa, namun
--              diketik manual oleh pemilih/panitia.
--
--              Data pemilih tamu disimpan pada tabel public.students dengan:
--                kategori = 'TAMU'  -> kategori TERPISAH, mudah difilter di admin
--                nis      = NULL    -> tamu tidak punya NIS (tidak bentrok NIS siswa)
--                kelas    = 'TAMU - <keterangan>' -> selalu beda dari kelas siswa asli
--              Sedangkan PILIHAN suara tetap anonim pada tabel public.ballots
--              (tanpa student_id), konsisten dengan alur QR/NIS biasa.
--
--              Dengan pemisahan ini, statistik siswa terdaftar tidak lagi
--              tercampur dengan pemilih tamu.
--
-- Isi migrasi ini:
--   1. Kolom baru public.students.kategori ('SISWA' | 'TAMU') + index.
--   2. public.students.nis dibuat boleh NULL (khusus pemilih tamu).
--   3. RPC public.submit_vote_guest(p_code, p_candidate_id, p_nama, p_kelas, p_tipe).
--   4. public.get_admin_dashboard_stats() diperbarui: statistik siswa terdaftar
--      hanya menghitung kategori 'SISWA', plus ringkasan khusus pemilih TAMU.
--
-- Urutan eksekusi: 20261005 -> 20261006 -> 20261007 -> 20261008 -> 20261009

-- ==========================================
-- 1. Kategori Pemilih pada Tabel Students
-- ==========================================
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS kategori TEXT NOT NULL DEFAULT 'SISWA';

-- Constraint dibuat idempotent agar migrasi aman dijalankan ulang.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'students_kategori_check'
          AND conrelid = 'public.students'::regclass
    ) THEN
        ALTER TABLE public.students
            ADD CONSTRAINT students_kategori_check CHECK (kategori IN ('SISWA', 'TAMU'));
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_students_kategori ON public.students(kategori);

-- Pemilih tamu tidak memiliki NIS, sehingga kolom nis boleh NULL.
-- Catatan: UNIQUE constraint tetap aman karena PostgreSQL mengizinkan banyak NULL.
ALTER TABLE public.students ALTER COLUMN nis DROP NOT NULL;

-- ==========================================
-- 2. RPC Submit Vote Pemilih Tamu (Input Data Manual)
-- ==========================================
-- Signature lama (p_code, p_candidate_id) dihapus lebih dulu agar tidak
-- meninggalkan overload fungsi dengan jumlah argumen berbeda.
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

    -- 5. Kunci transaksi per pemilih (nama + keterangan) agar submit ganda
    --    dari dua perangkat berbeda tetap dievaluasi satu per satu (atomik).
    PERFORM pg_advisory_xact_lock(hashtext('guest_vote_' || LOWER(v_nama) || '|' || LOWER(v_kelas)));

    -- 6. Satu pemilih tamu (nama + kelas/keterangan sama) hanya boleh 1 suara
    IF EXISTS (
        SELECT 1 FROM public.students
        WHERE kategori = 'TAMU'
          AND LOWER(nama) = LOWER(v_nama)
          AND LOWER(kelas) = LOWER(v_kelas)
          AND has_voted = TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Pemilih tamu dengan nama & kelas tersebut sudah tercatat memberikan suara.'
        );
    END IF;

    -- 7. Simpan data pemilih tamu (identitas manual, kategori tersendiri)
    INSERT INTO public.students (nis, nama, kelas, kategori, has_voted, voting_status, voted_at)
    VALUES (NULL, v_nama, v_kelas, 'TAMU', TRUE, 'VOTED', NOW());

    -- 8. Simpan surat suara ANONIM (tanpa student_id / NIS)
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
-- 3. Dashboard Stats: Pisahkan Siswa Terdaftar vs Pemilih Tamu
--    (menggantikan versi 20261005 dengan tambahan ringkasan kategori TAMU)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_students INT;
    v_voted_students INT;
    v_not_voted_students INT;
    v_participation NUMERIC;
    v_class_stats JSONB;
    v_candidate_tally JSONB;
    v_room_list JSONB;
    v_election_status TEXT;
    v_guest_total INT;
    v_guest_voted INT;
    v_guest_not_voted INT;
    v_guest_stats JSONB;
    v_total_ballots INT;
BEGIN
    SELECT status INTO v_election_status FROM public.election_settings LIMIT 1;
    IF v_election_status IS NULL THEN
        v_election_status := 'DRAFT';
    END IF;

    -- Statistik SISWA TERDAFTAR (hanya kategori 'SISWA', pemilih tamu dipisah)
    SELECT COUNT(*) INTO v_total_students FROM public.students WHERE kategori = 'SISWA';
    SELECT COUNT(*) INTO v_voted_students FROM public.students WHERE kategori = 'SISWA' AND has_voted = TRUE;
    v_not_voted_students := v_total_students - v_voted_students;

    IF v_total_students > 0 THEN
        v_participation := ROUND((v_voted_students::NUMERIC / v_total_students::NUMERIC) * 100, 1);
    ELSE
        v_participation := 0;
    END IF;

    -- Statistik PEMILIH TAMU (data manual via kode rahasia)
    SELECT COUNT(*) INTO v_guest_total FROM public.students WHERE kategori = 'TAMU';
    SELECT COUNT(*) INTO v_guest_voted FROM public.students WHERE kategori = 'TAMU' AND has_voted = TRUE;
    v_guest_not_voted := v_guest_total - v_guest_voted;

    -- Class statistics breakdown (siswa terdaftar saja)
    SELECT jsonb_agg(c) INTO v_class_stats
    FROM (
        SELECT 
            kelas,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE has_voted = TRUE) AS voted,
            COUNT(*) FILTER (WHERE has_voted = FALSE) AS not_voted
        FROM public.students
        WHERE kategori = 'SISWA'
        GROUP BY kelas
        ORDER BY kelas ASC
    ) c;

    -- Rekap pemilih tamu per kelas/keterangan (mis. 'TAMU - 8C', 'TAMU - GURU')
    SELECT jsonb_agg(g) INTO v_guest_stats
    FROM (
        SELECT
            kelas,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE has_voted = TRUE) AS voted,
            COUNT(*) FILTER (WHERE has_voted = FALSE) AS not_voted
        FROM public.students
        WHERE kategori = 'TAMU'
        GROUP BY kelas
        ORDER BY kelas ASC
    ) g;

    -- Candidate tally (ADMIN ONLY AGGREGATE) — mencakup suara siswa & tamu
    SELECT jsonb_agg(t) INTO v_candidate_tally
    FROM (
        SELECT 
            c.id,
            c.nomor_urut,
            c.nama,
            c.foto_url,
            COUNT(b.id) AS total_suara
        FROM public.candidates c
        LEFT JOIN public.ballots b ON b.candidate_id = c.id
        WHERE c.active = TRUE
        GROUP BY c.id, c.nomor_urut, c.nama, c.foto_url
        ORDER BY c.nomor_urut ASC
    ) t;

    -- Voting rooms status
    SELECT jsonb_agg(rm) INTO v_room_list
    FROM (
        SELECT 
            r.id,
            r.room_code,
            r.status,
            s.nama AS active_student_nama,
            s.kelas AS active_student_kelas
        FROM public.voting_rooms r
        LEFT JOIN public.voting_sessions vs ON r.current_session_id = vs.id AND vs.status = 'ACTIVE'
        LEFT JOIN public.students s ON vs.student_id = s.id
        ORDER BY r.room_code ASC
    ) rm;

    -- Total surat suara masuk (siswa + tamu) untuk validasi silang
    SELECT COUNT(*) INTO v_total_ballots FROM public.ballots;

    RETURN jsonb_build_object(
        'election_status', v_election_status,
        'total_students', v_total_students,
        'voted_students', v_voted_students,
        'not_voted_students', v_not_voted_students,
        'participation_pct', v_participation,
        'guest_total', v_guest_total,
        'guest_voted', v_guest_voted,
        'guest_not_voted', v_guest_not_voted,
        'total_ballots', v_total_ballots,
        'class_stats', COALESCE(v_class_stats, '[]'::jsonb),
        'guest_stats', COALESCE(v_guest_stats, '[]'::jsonb),
        'candidate_tally', COALESCE(v_candidate_tally, '[]'::jsonb),
        'rooms', COALESCE(v_room_list, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO anon, authenticated, service_role;
