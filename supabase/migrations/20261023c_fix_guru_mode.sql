-- Migration: 20261023c_fix_guru_mode.sql
-- Description:
--   Fix mode guru tidak bisa submit suara.
--   Root cause: kolom 'kategori' di tabel students dan RPC submit_vote_guru
--   belum tersedia di database (migration 20261022 belum dijalankan).
--   Migration ini idempotent — aman dijalankan berulang.
--
--   Jalankan di Supabase SQL Editor:
--   Project → SQL Editor → New query → paste seluruh isi file ini → Run

-- ─── 1. Pastikan kolom kategori ada di tabel students ───
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'students'
          AND column_name  = 'kategori'
    ) THEN
        ALTER TABLE public.students
            ADD COLUMN kategori TEXT NOT NULL DEFAULT 'SISWA';
    END IF;
END $$;

-- ─── 1b. Drop constraint lama (hanya SISWA,TAMU) lalu buat ulang (SISWA,GURU,TAMU) ───
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_kategori_check;
ALTER TABLE public.students
    ADD CONSTRAINT students_kategori_check CHECK (kategori IN ('SISWA','GURU','TAMU'));

-- ─── 1c. Pastikan kolom nis BOLEH NULL (wajib untuk tamu & guru) ───
-- Tanpa ini, INSERT nis=NULL pada submit_vote_guest/guru SELALU gagal.
ALTER TABLE public.students ALTER COLUMN nis DROP NOT NULL;

-- ─── 2. Pastikan semua siswa lama (nis IS NOT NULL, kelas bukan GURU)
--        sudah punya kategori = 'SISWA' (jika kolom baru saja dibuat) ───
UPDATE public.students
SET kategori = 'SISWA'
WHERE kategori IS NULL
   OR (kategori = 'SISWA' AND nis IS NOT NULL AND kelas NOT IN ('GURU','TAMU'));

-- Pastikan record lama yang kelas='GURU' ikut terklasifikasi
UPDATE public.students
SET kategori = 'GURU'
WHERE kelas = 'GURU' AND kategori != 'GURU';

-- ─── 3. Kolom-kolom lain dari migration 20261022 (logo, cooldown, thankyou) ───
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='election_settings'
                   AND column_name='logo_url') THEN
        ALTER TABLE public.election_settings ADD COLUMN logo_url TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='election_settings'
                   AND column_name='cooldown_seconds') THEN
        ALTER TABLE public.election_settings ADD COLUMN cooldown_seconds INT NOT NULL DEFAULT 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='election_settings'
                   AND column_name='thankyou_message') THEN
        ALTER TABLE public.election_settings ADD COLUMN thankyou_message TEXT
            DEFAULT 'Terima kasih telah berpartisipasi! Silakan menuju tempat selanjutnya.';
    END IF;
END $$;

-- ─── 4. Kolom wakil_nama, wakil_foto_url dari migration 20261023 ───
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='candidates'
                   AND column_name='wakil_nama') THEN
        ALTER TABLE public.candidates ADD COLUMN wakil_nama TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='candidates'
                   AND column_name='wakil_foto_url') THEN
        ALTER TABLE public.candidates ADD COLUMN wakil_foto_url TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='election_settings'
                   AND column_name='angkatan') THEN
        ALTER TABLE public.election_settings
            ADD COLUMN angkatan TEXT NOT NULL DEFAULT '2026-2027';
    END IF;
END $$;

-- ─── 5. RPC submit_vote_guru ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_vote_guru(
    p_nama_guru   TEXT,
    p_candidate_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_status  TEXT;
    v_cand_ok BOOLEAN;
BEGIN
    SELECT status INTO v_status FROM public.election_settings LIMIT 1;
    IF v_status IS NULL OR v_status != 'OPEN' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pemilihan sedang tidak dibuka.');
    END IF;

    IF p_nama_guru IS NULL OR LENGTH(TRIM(p_nama_guru)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nama guru minimal 3 karakter.');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.candidates WHERE id = p_candidate_id AND active = TRUE
    ) INTO v_cand_ok;
    IF NOT v_cand_ok THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid atau tidak aktif.');
    END IF;

    INSERT INTO public.students (nis, nama, kelas, has_voted, voting_status, voted_at, kategori)
    VALUES (NULL, TRIM(p_nama_guru), 'GURU', TRUE, 'VOTED', NOW(), 'GURU');

    INSERT INTO public.ballots (candidate_id) VALUES (p_candidate_id);

    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('GURU', 'SUBMIT_VOTE_GURU', jsonb_build_object(
        'nama_guru', TRIM(p_nama_guru),
        'candidate_id', p_candidate_id
    ));

    RETURN jsonb_build_object('success', true, 'message', 'Suara guru berhasil tercatat!');
END; $$;

-- ─── 5b. RPC submit_vote_guest (5 argumen — mode tamu kode 2513) ─────────
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
    v_secret_code CONSTANT TEXT := '2513';
    v_candidate public.candidates%ROWTYPE;
    v_existing  public.students%ROWTYPE;
    v_nama   TEXT;
    v_detail TEXT;
    v_kelas  TEXT;
    v_tipe   TEXT;
BEGIN
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau telah ditutup.');
    END IF;

    IF TRIM(COALESCE(p_code, '')) IS DISTINCT FROM v_secret_code THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kode akses pemilih tamu tidak valid.');
    END IF;

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

    v_kelas := 'TAMU - ' || v_detail;

    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id AND active = TRUE;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid atau tidak aktif.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('guest_vote_' || LOWER(v_nama) || '|' || LOWER(v_kelas)));

    SELECT * INTO v_existing
    FROM public.students
    WHERE kategori = 'TAMU'
      AND LOWER(TRIM(nama)) = LOWER(v_nama)
      AND LOWER(TRIM(kelas)) = LOWER(v_kelas)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.has_voted OR v_existing.voting_status = 'VOTED' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Pemilih tamu dengan nama & kelas tersebut sudah tercatat memberikan suara.'
            );
        END IF;

        UPDATE public.students
        SET nama = v_nama,
            has_voted = TRUE,
            voting_status = 'VOTED',
            voted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_existing.id;
    ELSE
        INSERT INTO public.students (nis, nama, kelas, kategori, has_voted, voting_status, voted_at)
        VALUES (NULL, v_nama, v_kelas, 'TAMU', TRUE, 'VOTED', NOW());
    END IF;

    INSERT INTO public.ballots (candidate_id) VALUES (v_candidate.id);

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

GRANT EXECUTE ON FUNCTION public.submit_vote_guest(TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ─── 6. RPC update_election_settings ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_election_settings(
    p_election_name    TEXT DEFAULT NULL,
    p_logo_url         TEXT DEFAULT NULL,
    p_status           TEXT DEFAULT NULL,
    p_cooldown_seconds INT  DEFAULT NULL,
    p_thankyou_message TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.election_settings LIMIT 1;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Data election settings tidak ditemukan.');
    END IF;
    UPDATE public.election_settings SET
        election_name    = COALESCE(p_election_name, election_name),
        logo_url         = CASE WHEN p_logo_url IS NOT NULL THEN p_logo_url ELSE logo_url END,
        status           = COALESCE(p_status, status),
        cooldown_seconds = COALESCE(p_cooldown_seconds, cooldown_seconds),
        thankyou_message = COALESCE(p_thankyou_message, thankyou_message),
        updated_at       = NOW()
    WHERE id = v_id;
    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'UPDATE_ELECTION_SETTINGS', jsonb_build_object(
        'logo_url', p_logo_url, 'cooldown_seconds', p_cooldown_seconds, 'status', p_status));
    RETURN jsonb_build_object('success', true, 'message', 'Pengaturan pemilihan berhasil diperbarui.');
END; $$;

-- ─── 7. RPC get_public_results (versi terbaru, sertakan wakil_nama) ────────
CREATE OR REPLACE FUNCTION public.get_public_results()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_settings         RECORD;
    v_candidates       JSONB;
    v_total_ballots    BIGINT;
    v_voted_students   BIGINT;
    v_guru_count       BIGINT;
    v_tamu_count       BIGINT;
    v_total_students   BIGINT;
    v_participation_pct NUMERIC;
BEGIN
    SELECT election_name, logo_url, angkatan, status
    INTO v_settings FROM public.election_settings LIMIT 1;

    SELECT COUNT(*) INTO v_total_ballots FROM public.ballots;
    SELECT COUNT(*) INTO v_voted_students
        FROM public.students WHERE has_voted = TRUE AND kategori = 'SISWA';
    SELECT COUNT(*) INTO v_guru_count
        FROM public.students WHERE has_voted = TRUE AND kategori = 'GURU';
    SELECT COUNT(*) INTO v_tamu_count
        FROM public.students WHERE has_voted = TRUE AND kategori = 'TAMU';
    SELECT COUNT(*) INTO v_total_students
        FROM public.students WHERE kategori = 'SISWA';

    v_participation_pct := CASE WHEN v_total_students > 0
        THEN ROUND((v_voted_students::NUMERIC / v_total_students) * 100, 1)
        ELSE 0 END;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_suara ASC), '[]'::jsonb)
    INTO v_candidates
    FROM (
        SELECT c.id, c.nomor_urut, c.nama, c.wakil_nama,
               c.foto_url, c.wakil_foto_url, c.visi,
               COUNT(b.id)::INT AS total_suara
        FROM public.candidates c
        LEFT JOIN public.ballots b ON b.candidate_id = c.id
        WHERE c.active = TRUE
        GROUP BY c.id, c.nomor_urut, c.nama, c.wakil_nama,
                 c.foto_url, c.wakil_foto_url, c.visi
    ) t;

    RETURN jsonb_build_object(
        'success',          true,
        'election_name',    v_settings.election_name,
        'angkatan',         v_settings.angkatan,
        'logo_url',         v_settings.logo_url,
        'total_ballots',    v_total_ballots,
        'voted_students',   v_voted_students,
        'guru_count',       v_guru_count,
        'tamu_count',       v_tamu_count,
        'total_students',   v_total_students,
        'participation_pct', v_participation_pct,
        'candidates',       v_candidates
    );
END; $$;

-- ─── 8. RPC get_admin_dashboard_stats (versi terbaru) ─────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_students    BIGINT; v_voted_students BIGINT; v_not_voted BIGINT;
    v_participation_pct NUMERIC; v_election_status TEXT;
    v_guest_total       BIGINT; v_guest_voted BIGINT;
    v_candidate_tally   JSONB;  v_class_stats JSONB;
    v_guest_stats       JSONB;  v_rooms JSONB;
BEGIN
    SELECT status INTO v_election_status FROM public.election_settings LIMIT 1;
    SELECT COUNT(*) INTO v_total_students  FROM public.students WHERE kategori = 'SISWA';
    SELECT COUNT(*) INTO v_voted_students  FROM public.students WHERE kategori = 'SISWA' AND has_voted = TRUE;
    v_not_voted         := v_total_students - v_voted_students;
    v_participation_pct := CASE WHEN v_total_students > 0
        THEN ROUND((v_voted_students::NUMERIC / v_total_students) * 100, 1) ELSE 0 END;
    SELECT COUNT(*) INTO v_guest_total FROM public.students WHERE kategori IN ('TAMU','GURU');
    SELECT COUNT(*) INTO v_guest_voted FROM public.students WHERE kategori IN ('TAMU','GURU') AND has_voted = TRUE;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.nomor_urut), '[]'::jsonb)
    INTO v_candidate_tally
    FROM (
        SELECT c.nomor_urut, c.nama, c.wakil_nama, COUNT(b.id)::INT AS total_suara
        FROM public.candidates c
        LEFT JOIN public.ballots b ON b.candidate_id = c.id
        WHERE c.active = TRUE
        GROUP BY c.nomor_urut, c.nama, c.wakil_nama
    ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(k) ORDER BY k.kelas), '[]'::jsonb)
    INTO v_class_stats
    FROM (
        SELECT kelas, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE has_voted = TRUE)  AS voted,
               COUNT(*) FILTER (WHERE has_voted = FALSE) AS not_voted
        FROM public.students WHERE kategori = 'SISWA' GROUP BY kelas
    ) k;

    SELECT COALESCE(jsonb_agg(row_to_json(g) ORDER BY g.kelas), '[]'::jsonb)
    INTO v_guest_stats
    FROM (
        SELECT kelas, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE has_voted = TRUE)  AS voted,
               COUNT(*) FILTER (WHERE has_voted = FALSE) AS not_voted
        FROM public.students WHERE kategori IN ('TAMU','GURU') GROUP BY kelas
    ) g;

    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.room_code), '[]'::jsonb)
    INTO v_rooms
    FROM (
        SELECT vr.id, vr.room_code, vr.status,
               s.nama AS active_student_nama,
               s.kelas AS active_student_kelas
        FROM public.voting_rooms vr
        LEFT JOIN public.voting_sessions vs
            ON vr.current_session_id = vs.id AND vs.status = 'ACTIVE'
        LEFT JOIN public.students s
            ON vs.student_id = s.id
    ) r;

    RETURN jsonb_build_object(
        'total_students',     v_total_students,
        'voted_students',     v_voted_students,
        'not_voted_students', v_not_voted,
        'participation_pct',  v_participation_pct,
        'election_status',    v_election_status,
        'guest_total',        v_guest_total,
        'guest_voted',        v_guest_voted,
        'candidate_tally',    v_candidate_tally,
        'class_stats',        v_class_stats,
        'guest_stats',        v_guest_stats,
        'rooms',              v_rooms
    );
END; $$;

-- ─── 9. Grant semua RPC ke anon/authenticated/service_role ────────────────
GRANT EXECUTE ON FUNCTION public.submit_vote_guru(TEXT, UUID)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_election_settings(TEXT,TEXT,TEXT,INT,TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_results()                      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats()               TO anon, authenticated, service_role;
