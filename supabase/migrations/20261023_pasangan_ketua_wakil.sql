-- Migration: 20261023_pasangan_ketua_wakil.sql
-- Description:
--   1. Tambah kolom wakil_nama, wakil_foto_url ke candidates
--      (format pasangan Ketua + Wakil Ketua OSIS Angkatan 35)
--   2. Tambah kolom angkatan ke election_settings
--   3. Update RPC get_public_results — sertakan wakil & angkatan
--   4. Update RPC get_admin_dashboard_stats — sertakan wakil_nama
-- Idempotent: aman dijalankan berulang

-- 1. Kolom baru
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

-- 2. get_public_results — untuk halaman hasil (akses publik / anon)
--    Kandidat diurutkan ASC suara → JS reveal terkecil dulu, terbesar terakhir
CREATE OR REPLACE FUNCTION public.get_public_results()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_settings RECORD;
    v_candidates JSONB;
    v_total_ballots BIGINT;
    v_voted_students BIGINT;
    v_guru_count BIGINT;
    v_tamu_count BIGINT;
    v_total_students BIGINT;
    v_participation_pct NUMERIC;
BEGIN
    SELECT election_name, logo_url, angkatan, status
    INTO v_settings FROM public.election_settings LIMIT 1;

    SELECT COUNT(*) INTO v_total_ballots FROM public.ballots;
    SELECT COUNT(*) INTO v_voted_students
        FROM public.students WHERE has_voted=TRUE AND kategori='SISWA';
    SELECT COUNT(*) INTO v_guru_count
        FROM public.students WHERE has_voted=TRUE AND kategori='GURU';
    SELECT COUNT(*) INTO v_tamu_count
        FROM public.students WHERE has_voted=TRUE AND kategori='TAMU';
    SELECT COUNT(*) INTO v_total_students
        FROM public.students WHERE kategori='SISWA';

    v_participation_pct := CASE WHEN v_total_students>0
        THEN ROUND((v_voted_students::NUMERIC/v_total_students)*100,1)
        ELSE 0 END;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_suara ASC),'[]'::jsonb)
    INTO v_candidates
    FROM (
        SELECT c.id, c.nomor_urut, c.nama, c.wakil_nama,
               c.foto_url, c.wakil_foto_url, c.visi,
               COUNT(b.id)::INT AS total_suara
        FROM public.candidates c
        LEFT JOIN public.ballots b ON b.candidate_id=c.id
        WHERE c.active=TRUE
        GROUP BY c.id,c.nomor_urut,c.nama,c.wakil_nama,
                 c.foto_url,c.wakil_foto_url,c.visi
    ) t;

    RETURN jsonb_build_object(
        'success',true,
        'election_name',v_settings.election_name,
        'angkatan',v_settings.angkatan,
        'logo_url',v_settings.logo_url,
        'total_ballots',v_total_ballots,
        'voted_students',v_voted_students,
        'guru_count',v_guru_count,
        'tamu_count',v_tamu_count,
        'total_students',v_total_students,
        'participation_pct',v_participation_pct,
        'candidates',v_candidates
    );
END; $$;

-- 3. get_admin_dashboard_stats — update sertakan wakil_nama
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_students BIGINT; v_voted_students BIGINT; v_not_voted BIGINT;
    v_participation_pct NUMERIC; v_election_status TEXT;
    v_guest_total BIGINT; v_guest_voted BIGINT;
    v_candidate_tally JSONB; v_class_stats JSONB;
    v_guest_stats JSONB; v_rooms JSONB;
BEGIN
    SELECT status INTO v_election_status FROM public.election_settings LIMIT 1;
    SELECT COUNT(*) INTO v_total_students FROM public.students WHERE kategori='SISWA';
    SELECT COUNT(*) INTO v_voted_students FROM public.students WHERE kategori='SISWA' AND has_voted=TRUE;
    v_not_voted := v_total_students - v_voted_students;
    v_participation_pct := CASE WHEN v_total_students>0
        THEN ROUND((v_voted_students::NUMERIC/v_total_students)*100,1) ELSE 0 END;
    SELECT COUNT(*) INTO v_guest_total FROM public.students WHERE kategori IN ('TAMU','GURU');
    SELECT COUNT(*) INTO v_guest_voted FROM public.students WHERE kategori IN ('TAMU','GURU') AND has_voted=TRUE;
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.nomor_urut),'[]'::jsonb)
    INTO v_candidate_tally
    FROM (
        SELECT c.nomor_urut, c.nama, c.wakil_nama, COUNT(b.id)::INT AS total_suara
        FROM public.candidates c
        LEFT JOIN public.ballots b ON b.candidate_id=c.id
        WHERE c.active=TRUE
        GROUP BY c.nomor_urut,c.nama,c.wakil_nama
    ) t;
    SELECT COALESCE(jsonb_agg(row_to_json(k) ORDER BY k.kelas),'[]'::jsonb)
    INTO v_class_stats
    FROM (
        SELECT kelas, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE has_voted=TRUE) AS voted,
               COUNT(*) FILTER (WHERE has_voted=FALSE) AS not_voted
        FROM public.students WHERE kategori='SISWA' GROUP BY kelas
    ) k;
    SELECT COALESCE(jsonb_agg(row_to_json(g) ORDER BY g.kelas),'[]'::jsonb)
    INTO v_guest_stats
    FROM (
        SELECT kelas, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE has_voted=TRUE) AS voted,
               COUNT(*) FILTER (WHERE has_voted=FALSE) AS not_voted
        FROM public.students WHERE kategori IN ('TAMU','GURU') GROUP BY kelas
    ) g;
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.room_code),'[]'::jsonb)
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
        'total_students',    v_total_students,
        'voted_students',    v_voted_students,
        'not_voted_students',v_not_voted,
        'participation_pct', v_participation_pct,
        'election_status',   v_election_status,
        'guest_total',       v_guest_total,
        'guest_voted',       v_guest_voted,
        'candidate_tally',   v_candidate_tally,
        'class_stats',       v_class_stats,
        'guest_stats',       v_guest_stats,
        'rooms',             v_rooms
    );
END; $$;

-- 4. Grant execute
GRANT EXECUTE ON FUNCTION public.get_public_results() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO anon, authenticated, service_role;
