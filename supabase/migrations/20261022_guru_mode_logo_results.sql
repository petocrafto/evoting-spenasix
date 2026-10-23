-- Migration: 20261022_guru_mode_logo_results.sql
-- Description: 
--   1. Tambah kolom logo_url, cooldown_seconds, thankyou_message ke election_settings
--   2. RPC update_election_settings, submit_vote_guru, get_public_results
--   3. RPC generate_test_data, simulate_test_votes, cleanup_test_data
-- Idempotent: aman dijalankan berulang

-- 1. Tambah kolom baru ke election_settings
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='students' 
                   AND column_name='kategori') THEN
        ALTER TABLE public.students ADD COLUMN kategori TEXT NOT NULL DEFAULT 'SISWA'
            CHECK (kategori IN ('SISWA','GURU','TAMU'));
    END IF;
END $$;

-- 2. update_election_settings — admin simpan pengaturan (nama, logo, cooldown)
CREATE OR REPLACE FUNCTION public.update_election_settings(
    p_election_name TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_cooldown_seconds INT DEFAULT NULL,
    p_thankyou_message TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.election_settings LIMIT 1;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success',false,'message','Data election settings tidak ditemukan.');
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
    VALUES ('ADMIN','UPDATE_ELECTION_SETTINGS',jsonb_build_object(
        'logo_url',p_logo_url,'cooldown_seconds',p_cooldown_seconds,'status',p_status));
    RETURN jsonb_build_object('success',true,'message','Pengaturan pemilihan berhasil diperbarui.');
END; $$;

-- 3. submit_vote_guru — guru pilih kandidat dengan input nama saja
CREATE OR REPLACE FUNCTION public.submit_vote_guru(
    p_nama_guru TEXT,
    p_candidate_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_status TEXT;
    v_cand_ok BOOLEAN;
BEGIN
    SELECT status INTO v_status FROM public.election_settings LIMIT 1;
    IF v_status IS NULL OR v_status != 'OPEN' THEN
        RETURN jsonb_build_object('success',false,'message','Pemilihan sedang tidak dibuka.');
    END IF;
    IF p_nama_guru IS NULL OR LENGTH(TRIM(p_nama_guru)) < 3 THEN
        RETURN jsonb_build_object('success',false,'message','Nama guru minimal 3 karakter.');
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.candidates WHERE id=p_candidate_id AND active=true) INTO v_cand_ok;
    IF NOT v_cand_ok THEN
        RETURN jsonb_build_object('success',false,'message','Kandidat tidak valid atau tidak aktif.');
    END IF;
    INSERT INTO public.students (nis, nama, kelas, has_voted, voting_status, voted_at, kategori)
    VALUES (NULL, TRIM(p_nama_guru), 'GURU', TRUE, 'VOTED', NOW(), 'GURU');
    INSERT INTO public.ballots (candidate_id) VALUES (p_candidate_id);
    RETURN jsonb_build_object('success',true,'message','Suara guru berhasil tercatat!');
END; $$;

-- 4. get_public_results — hasil kandidat diurutkan suara terkecil→terbesar
CREATE OR REPLACE FUNCTION public.get_public_results()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_election RECORD; v_tally JSONB;
    v_total_ballots BIGINT; v_total_students BIGINT; v_voted_students BIGINT;
    v_guru_count BIGINT; v_tamu_count BIGINT;
BEGIN
    SELECT * INTO v_election FROM public.election_settings LIMIT 1;
    SELECT jsonb_agg(
        jsonb_build_object('id',c.id,'nomor_urut',c.nomor_urut,'nama',c.nama,
            'foto_url',c.foto_url,'visi',c.visi,'total_suara',COALESCE(b.jumlah,0))
        ORDER BY COALESCE(b.jumlah,0) ASC, c.nomor_urut ASC
    ) INTO v_tally
    FROM public.candidates c
    LEFT JOIN (SELECT candidate_id, COUNT(*) as jumlah FROM public.ballots GROUP BY candidate_id) b
        ON b.candidate_id = c.id WHERE c.active = TRUE;
    SELECT COUNT(*) INTO v_total_ballots FROM public.ballots;
    SELECT COUNT(*) INTO v_total_students FROM public.students WHERE nis IS NOT NULL AND kelas NOT LIKE 'TEST-%';
    SELECT COUNT(*) INTO v_voted_students FROM public.students WHERE has_voted=TRUE AND nis IS NOT NULL AND kelas NOT LIKE 'TEST-%';
    SELECT COUNT(*) INTO v_guru_count FROM public.students WHERE kelas='GURU' AND has_voted=TRUE;
    SELECT COUNT(*) INTO v_tamu_count FROM public.students WHERE nis IS NULL AND kelas!='GURU' AND has_voted=TRUE;
    RETURN jsonb_build_object('success',true,'election_name',v_election.election_name,
        'logo_url',v_election.logo_url,'thankyou_message',v_election.thankyou_message,
        'status',v_election.status,'candidates',COALESCE(v_tally,'[]'::jsonb),
        'total_ballots',v_total_ballots,'total_students',v_total_students,
        'voted_students',v_voted_students,'guru_count',v_guru_count,'tamu_count',v_tamu_count,
        'participation_pct', CASE WHEN v_total_students>0
            THEN ROUND((v_voted_students::numeric/v_total_students::numeric)*100,1) ELSE 0 END);
END; $$;

-- 5. generate_test_data — 700 siswa dummy kelas TEST-xx
CREATE OR REPLACE FUNCTION public.generate_test_data()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INT := 0; v_nis TEXT; v_nama TEXT; v_kelas TEXT;
    v_klases TEXT[] := ARRAY['7A','7B','7C','7D','8A','8B','8C','8D','9A','9B','9C','9D'];
    v_depan TEXT[] := ARRAY['Ahmad','Budi','Citra','Dian','Eka','Farhan','Gita','Hendra','Indah','Joko',
                             'Kiki','Lina','Mira','Nanda','Oki','Putri','Reza','Sari','Toni','Wahyu'];
    v_belakang TEXT[] := ARRAY['Santoso','Lestari','Pratama','Rahmawati','Rizky','Gutawa','Setiawan',
                                'Kurniawan','Wijaya','Susanto','Hidayat','Permana','Saputra','Febrianto',
                                'Anggraini','Nugroho','Purnama','Ramadhan','Kusuma','Nurdiana'];
    i INT;
BEGIN
    DELETE FROM public.students WHERE kelas LIKE 'TEST-%';
    FOR i IN 1..700 LOOP
        v_nis := LPAD((4000+i)::TEXT,4,'0');
        v_nama := v_depan[1+((i-1)%array_length(v_depan,1))]||' '||v_belakang[1+((i-1)%array_length(v_belakang,1))];
        v_kelas := 'TEST-'||v_klases[1+((i-1)%array_length(v_klases,1))];
        INSERT INTO public.students (nis,nama,kelas,has_voted,voting_status)
        VALUES (v_nis,v_nama,v_kelas,FALSE,'NOT_VOTED')
        ON CONFLICT (nis) DO UPDATE SET nama=EXCLUDED.nama,kelas=EXCLUDED.kelas,
            has_voted=FALSE,voting_status='NOT_VOTED',voted_at=NULL,updated_at=NOW();
        v_count := v_count + 1;
    END LOOP;
    INSERT INTO public.audit_logs (actor_type,action,details)
    VALUES ('ADMIN','GENERATE_TEST_DATA',jsonb_build_object('count',v_count));
    RETURN jsonb_build_object('success',true,'count',v_count,
        'message','Berhasil membuat '||v_count||' siswa dummy (kelas TEST-xx).');
END; $$;

-- 6. simulate_test_votes
CREATE OR REPLACE FUNCTION public.simulate_test_votes()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_student RECORD; v_candidates UUID[]; v_n INT; v_picked UUID; v_count INT := 0;
BEGIN
    SELECT ARRAY_AGG(id) INTO v_candidates FROM public.candidates WHERE active=TRUE;
    v_n := array_length(v_candidates,1);
    IF v_n IS NULL OR v_n=0 THEN
        RETURN jsonb_build_object('success',false,'message','Tidak ada kandidat aktif.');
    END IF;
    FOR v_student IN SELECT id FROM public.students WHERE kelas LIKE 'TEST-%' AND has_voted=FALSE LOOP
        v_picked := v_candidates[1+(FLOOR(RANDOM()*v_n))::INT];
        INSERT INTO public.ballots (candidate_id) VALUES (v_picked);
        UPDATE public.students SET has_voted=TRUE,voting_status='VOTED',voted_at=NOW(),updated_at=NOW()
        WHERE id=v_student.id;
        v_count := v_count + 1;
    END LOOP;
    INSERT INTO public.audit_logs (actor_type,action,details)
    VALUES ('ADMIN','SIMULATE_TEST_VOTES',jsonb_build_object('count',v_count));
    RETURN jsonb_build_object('success',true,'count',v_count,
        'message','Berhasil mensimulasikan '||v_count||' suara dummy.');
END; $$;

-- 7. cleanup_test_data
CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_del INT;
BEGIN
    SELECT COUNT(*) INTO v_del FROM public.students WHERE kelas LIKE 'TEST-%';
    DELETE FROM public.students WHERE kelas LIKE 'TEST-%';
    INSERT INTO public.audit_logs (actor_type,action,details)
    VALUES ('ADMIN','CLEANUP_TEST_DATA',jsonb_build_object('students_deleted',v_del));
    RETURN jsonb_build_object('success',true,'students_deleted',v_del,
        'message','Hapus '||v_del||' siswa dummy. Gunakan Reset Suara untuk membersihkan ballot.');
END; $$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.update_election_settings(TEXT,TEXT,TEXT,INT,TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_vote_guru(TEXT,UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_results() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_test_data() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_test_votes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_test_data() TO anon, authenticated, service_role;
