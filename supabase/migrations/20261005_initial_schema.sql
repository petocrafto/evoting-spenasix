-- Migration: 20261005_initial_schema.sql
-- Description: Schema and RPC functions for OSIS Candra Kirana SPENASIX Divisi 9 E-Voting System

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. TABLES
-- ==========================================

-- Table: election_settings
CREATE TABLE IF NOT EXISTS public.election_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_name TEXT NOT NULL DEFAULT 'Pemilihan OSIS Candra Kirana SPENASIX Divisi 9',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: students
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nis VARCHAR(4) NOT NULL UNIQUE CHECK (nis ~ '^[0-9]{4}$'),
    nama TEXT NOT NULL,
    kelas TEXT NOT NULL,
    has_voted BOOLEAN NOT NULL DEFAULT FALSE,
    voting_status TEXT NOT NULL CHECK (voting_status IN ('NOT_VOTED', 'IN_PROGRESS', 'VOTED')) DEFAULT 'NOT_VOTED',
    voted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick search by NIS and Kelas
CREATE INDEX IF NOT EXISTS idx_students_nis ON public.students(nis);
CREATE INDEX IF NOT EXISTS idx_students_kelas ON public.students(kelas);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(voting_status);

-- Table: candidates
CREATE TABLE IF NOT EXISTS public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_urut INT NOT NULL UNIQUE CHECK (nomor_urut > 0),
    nama TEXT NOT NULL,
    foto_url TEXT,
    visi TEXT NOT NULL,
    misi TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for candidate order
CREATE INDEX IF NOT EXISTS idx_candidates_nomor_urut ON public.candidates(nomor_urut);

-- Table: ballots (STRICT ANONYMITY: NO STUDENT_ID COLUMN!)
CREATE TABLE IF NOT EXISTS public.ballots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ballot_identifier UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ballots_candidate ON public.ballots(candidate_id);

-- Table: voting_rooms
CREATE TABLE IF NOT EXISTS public.voting_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OFFLINE', 'READY', 'WAITING', 'VOTING', 'COMPLETED')) DEFAULT 'OFFLINE',
    device_token TEXT UNIQUE,
    current_session_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_rooms_code ON public.voting_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_voting_rooms_device_token ON public.voting_rooms(device_token);

-- Table: voting_sessions
CREATE TABLE IF NOT EXISTS public.voting_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.voting_rooms(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('QR', 'BILIK')) DEFAULT 'BILIK',
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')) DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_sessions_student ON public.voting_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_room ON public.voting_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON public.voting_sessions(status);

-- Table: audit_logs (NO STUDENT -> CANDIDATE MAPPING ALLOWED)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL DEFAULT 'ADMIN', -- 'ADMIN', 'SYSTEM', 'ROOM'
    actor_id TEXT,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ==========================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.election_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Election Settings Policies
CREATE POLICY "Public read election status" ON public.election_settings
    FOR SELECT USING (true);
CREATE POLICY "Admin write election settings" ON public.election_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- Students Policies
-- Public/Anon can lookup basic info by exact NIS for validation during QR voting or room session
CREATE POLICY "Anon lookup student by NIS" ON public.students
    FOR SELECT USING (true);
CREATE POLICY "Admin full access students" ON public.students
    FOR ALL USING (auth.role() = 'authenticated');

-- Candidates Policies
CREATE POLICY "Public read active candidates" ON public.candidates
    FOR SELECT USING (active = true OR auth.role() = 'authenticated');
CREATE POLICY "Admin write candidates" ON public.candidates
    FOR ALL USING (auth.role() = 'authenticated');

-- Ballots Policies (NO PUBLIC SELECT TO PREVENT STUDENT FROM VIEWING RESULTS)
CREATE POLICY "Admin read ballots tally" ON public.ballots
    FOR SELECT USING (auth.role() = 'authenticated');
-- Insert is restricted to RPC functions with SECURITY DEFINER

-- Voting Rooms Policies
CREATE POLICY "Public read room status" ON public.voting_rooms
    FOR SELECT USING (true);
CREATE POLICY "Admin write voting rooms" ON public.voting_rooms
    FOR ALL USING (auth.role() = 'authenticated');

-- Voting Sessions Policies
CREATE POLICY "Public read active sessions" ON public.voting_sessions
    FOR SELECT USING (true);
CREATE POLICY "Admin write voting sessions" ON public.voting_sessions
    FOR ALL USING (auth.role() = 'authenticated');

-- Audit Logs Policies
CREATE POLICY "Admin read audit logs" ON public.audit_logs
    FOR SELECT USING (auth.role() = 'authenticated');

-- ==========================================
-- 3. STORED PROCEDURES / RPC FUNCTIONS
-- ==========================================

-- A. Verify Election Open Status Helper
CREATE OR REPLACE FUNCTION public.check_election_is_open()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.election_settings LIMIT 1;
    IF v_status IS NULL OR v_status != 'OPEN' THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;

-- B. Activate Voting Room via 6-digit PIN
CREATE OR REPLACE FUNCTION public.activate_room(
    p_room_code TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
    v_input_hash TEXT;
    v_new_token TEXT;
BEGIN
    -- Hash input PIN using SHA-256
    v_input_hash := encode(digest(p_pin, 'sha256'), 'hex');

    SELECT * INTO v_room FROM public.voting_rooms WHERE room_code = UPPER(TRIM(p_room_code));

    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'ID Bilik tidak ditemukan.');
    END IF;

    IF v_room.pin_hash != v_input_hash THEN
        RETURN jsonb_build_object('success', false, 'message', 'PIN aktivasi bilik salah.');
    END IF;

    -- Generate secure random device token
    v_new_token := encode(gen_random_bytes(24), 'hex');

    UPDATE public.voting_rooms
    SET device_token = v_new_token,
        status = 'READY',
        updated_at = NOW()
    WHERE id = v_room.id;

    -- Audit log
    INSERT INTO public.audit_logs (actor_type, actor_id, action, details)
    VALUES ('ROOM', v_room.room_code, 'ROOM_ACTIVATED', jsonb_build_object('room_code', v_room.room_code));

    RETURN jsonb_build_object(
        'success', true,
        'room_code', v_room.room_code,
        'device_token', v_new_token,
        'message', 'Bilik berhasil diaktifkan.'
    );
END;
$$;

-- C. Assign Student to Room (Admin Only)
CREATE OR REPLACE FUNCTION public.assign_student_to_room(
    p_student_id UUID,
    p_room_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_room public.voting_rooms%ROWTYPE;
    v_session_id UUID;
BEGIN
    -- Validate election status
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau sudah ditutup.');
    END IF;

    -- Lock student row
    SELECT * INTO v_student FROM public.students WHERE id = p_student_id FOR UPDATE;
    IF v_student.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Data siswa tidak ditemukan.');
    END IF;

    IF v_student.has_voted OR v_student.voting_status = 'VOTED' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Siswa ini sudah memberikan suara.');
    END IF;

    -- Lock room row
    SELECT * INTO v_room FROM public.voting_rooms WHERE room_code = UPPER(TRIM(p_room_code)) FOR UPDATE;
    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bilik tidak ditemukan.');
    END IF;

    IF v_room.status IN ('OFFLINE') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bilik sedang offline. Silakan aktifkan bilik terlebih dahulu.');
    END IF;

    IF v_room.status IN ('WAITING', 'VOTING') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bilik sedang digunakan oleh siswa lain.');
    END IF;

    -- Cancel any existing active sessions for this student or room
    UPDATE public.voting_sessions
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE (student_id = p_student_id OR room_id = v_room.id) AND status = 'ACTIVE';

    -- Create new session (10 min expiry)
    INSERT INTO public.voting_sessions (room_id, student_id, mode, status, expires_at)
    VALUES (v_room.id, v_student.id, 'BILIK', 'ACTIVE', NOW() + INTERVAL '10 minutes')
    RETURNING id INTO v_session_id;

    -- Update student status
    UPDATE public.students
    SET voting_status = 'IN_PROGRESS', updated_at = NOW()
    WHERE id = v_student.id;

    -- Update room status
    UPDATE public.voting_rooms
    SET status = 'WAITING',
        current_session_id = v_session_id,
        updated_at = NOW()
    WHERE id = v_room.id;

    -- Audit Log (No candidate link)
    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'STUDENT_ASSIGNED', jsonb_build_object(
        'student_id', v_student.id,
        'nis', v_student.nis,
        'nama', v_student.nama,
        'kelas', v_student.kelas,
        'room_code', v_room.room_code,
        'session_id', v_session_id
    ));

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'room_code', v_room.room_code,
        'student_name', v_student.nama,
        'student_kelas', v_student.kelas,
        'message', 'Siswa berhasil ditugaskan ke ' || v_room.room_code
    );
END;
$$;

-- D. Cancel / Reset Room Session (Admin or Timeout)
CREATE OR REPLACE FUNCTION public.cancel_room_session(p_room_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
    v_session public.voting_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_room FROM public.voting_rooms WHERE room_code = UPPER(TRIM(p_room_code)) FOR UPDATE;
    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bilik tidak ditemukan.');
    END IF;

    IF v_room.current_session_id IS NOT NULL THEN
        SELECT * INTO v_session FROM public.voting_sessions WHERE id = v_room.current_session_id FOR UPDATE;
        IF v_session.id IS NOT NULL THEN
            UPDATE public.voting_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE id = v_session.id;
            
            -- Revert student status if not voted
            UPDATE public.students 
            SET voting_status = 'NOT_VOTED', updated_at = NOW() 
            WHERE id = v_session.student_id AND has_voted = FALSE;
        END IF;
    END IF;

    UPDATE public.voting_rooms
    SET status = 'READY', current_session_id = NULL, updated_at = NOW()
    WHERE id = v_room.id;

    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'SESSION_CANCELLED', jsonb_build_object('room_code', v_room.room_code));

    RETURN jsonb_build_object('success', true, 'message', 'Sesi bilik telah dibatalkan.');
END;
$$;

-- E. Submit Vote via QR / NIS (Method A)
CREATE OR REPLACE FUNCTION public.submit_vote_qr(
    p_nis VARCHAR(4),
    p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_candidate public.candidates%ROWTYPE;
BEGIN
    -- 1. Validate Election OPEN
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau telah ditutup.');
    END IF;

    -- 2. Validate Candidate
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id AND active = TRUE;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid atau tidak aktif.');
    END IF;

    -- 3. Lock Student Row to prevent concurrent voting / race conditions
    SELECT * INTO v_student FROM public.students WHERE nis = TRIM(p_nis) FOR UPDATE;
    IF v_student.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Data siswa dengan NIS tersebut tidak ditemukan.');
    END IF;

    IF v_student.has_voted OR v_student.voting_status = 'VOTED' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Suara untuk siswa ini sudah tercatat sebelumnya.');
    END IF;

    -- 4. Insert Anonymous Ballot (NO STUDENT_ID)
    INSERT INTO public.ballots (candidate_id) VALUES (v_candidate.id);

    -- 5. Atomic Update Student Status
    UPDATE public.students
    SET has_voted = TRUE,
        voting_status = 'VOTED',
        voted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_student.id;

    -- 6. Audit Log (No student-candidate relation)
    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('SYSTEM', 'VOTE_SUBMITTED', jsonb_build_object('mode', 'QR', 'kelas', v_student.kelas));

    RETURN jsonb_build_object('success', true, 'message', 'Suara berhasil dicatat!');
END;
$$;

-- F. Submit Vote via Bilik / Room (Method B)
CREATE OR REPLACE FUNCTION public.submit_vote_room(
    p_device_token TEXT,
    p_session_id UUID,
    p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
    v_session public.voting_sessions%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_candidate public.candidates%ROWTYPE;
BEGIN
    -- 1. Validate Election status
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau telah ditutup.');
    END IF;

    -- 2. Validate Room Credential
    SELECT * INTO v_room FROM public.voting_rooms WHERE device_token = TRIM(p_device_token);
    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Perangkat bilik tidak terverifikasi.');
    END IF;

    -- 3. Lock Session Row
    SELECT * INTO v_session FROM public.voting_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_session.id IS NULL OR v_session.room_id != v_room.id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sesi bilik tidak valid.');
    END IF;

    IF v_session.status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sesi voting telah berakhir atau dibatalkan.');
    END IF;

    IF NOW() > v_session.expires_at THEN
        UPDATE public.voting_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE id = v_session.id;
        UPDATE public.voting_rooms SET status = 'READY', current_session_id = NULL, updated_at = NOW() WHERE id = v_room.id;
        RETURN jsonb_build_object('success', false, 'message', 'Sesi voting telah kadaluarsa (timeout).');
    END IF;

    -- 4. Lock Candidate
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id AND active = TRUE;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid.');
    END IF;

    -- 5. Lock Student Row
    SELECT * INTO v_student FROM public.students WHERE id = v_session.student_id FOR UPDATE;
    IF v_student.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Data siswa tidak ditemukan.');
    END IF;

    IF v_student.has_voted OR v_student.voting_status = 'VOTED' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Suara siswa sudah pernah tercatat.');
    END IF;

    -- 6. Record Anonymous Ballot (STRICTLY NO STUDENT ID ATTACHED)
    INSERT INTO public.ballots (candidate_id) VALUES (v_candidate.id);

    -- 7. Update Student Status
    UPDATE public.students
    SET has_voted = TRUE,
        voting_status = 'VOTED',
        voted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_student.id;

    -- 8. Complete Session & Reset Room to READY
    UPDATE public.voting_sessions
    SET status = 'COMPLETED', updated_at = NOW()
    WHERE id = v_session.id;

    UPDATE public.voting_rooms
    SET status = 'COMPLETED', -- briefly completed, then frontend resets to READY
        current_session_id = NULL,
        updated_at = NOW()
    WHERE id = v_room.id;

    -- 9. Audit Log
    INSERT INTO public.audit_logs (actor_type, actor_id, action, details)
    VALUES ('ROOM', v_room.room_code, 'VOTE_SUBMITTED', jsonb_build_object('mode', 'BILIK', 'room_code', v_room.room_code, 'kelas', v_student.kelas));

    RETURN jsonb_build_object('success', true, 'message', 'Suara berhasil dicatat!');
END;
$$;

-- G. Periodic Session Expire Maintenance Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT s.id AS session_id, s.student_id, s.room_id, r.room_code
        FROM public.voting_sessions s
        JOIN public.voting_rooms r ON s.room_id = r.id
        WHERE s.status = 'ACTIVE' AND s.expires_at < NOW()
    LOOP
        -- Mark session expired
        UPDATE public.voting_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE id = r.session_id;

        -- Revert student status if not voted
        UPDATE public.students SET voting_status = 'NOT_VOTED', updated_at = NOW() WHERE id = r.student_id AND has_voted = FALSE;

        -- Reset room to READY
        UPDATE public.voting_rooms SET status = 'READY', current_session_id = NULL, updated_at = NOW() WHERE id = r.room_id;

        -- Log timeout
        INSERT INTO public.audit_logs (actor_type, action, details)
        VALUES ('SYSTEM', 'SESSION_EXPIRED', jsonb_build_object('room_code', r.room_code, 'session_id', r.session_id));
    END LOOP;
END;
$$;

-- H. Admin Dashboard Statistics RPC (AGGREGATED ONLY)
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
BEGIN
    SELECT status INTO v_election_status FROM public.election_settings LIMIT 1;
    IF v_election_status IS NULL THEN
        v_election_status := 'DRAFT';
    END IF;

    SELECT COUNT(*) INTO v_total_students FROM public.students;
    SELECT COUNT(*) INTO v_voted_students FROM public.students WHERE has_voted = TRUE;
    v_not_voted_students := v_total_students - v_voted_students;

    IF v_total_students > 0 THEN
        v_participation := ROUND((v_voted_students::NUMERIC / v_total_students::NUMERIC) * 100, 1);
    ELSE
        v_participation := 0;
    END IF;

    -- Class statistics breakdown
    SELECT jsonb_agg(c) INTO v_class_stats
    FROM (
        SELECT 
            kelas,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE has_voted = TRUE) AS voted,
            COUNT(*) FILTER (WHERE has_voted = FALSE) AS not_voted
        FROM public.students
        GROUP BY kelas
        ORDER BY kelas ASC
    ) c;

    -- Candidate tally (ADMIN ONLY AGGREGATE)
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

    RETURN jsonb_build_object(
        'election_status', v_election_status,
        'total_students', v_total_students,
        'voted_students', v_voted_students,
        'not_voted_students', v_not_voted_students,
        'participation_pct', v_participation,
        'class_stats', COALESCE(v_class_stats, '[]'::jsonb),
        'candidate_tally', COALESCE(v_candidate_tally, '[]'::jsonb),
        'rooms', COALESCE(v_room_list, '[]'::jsonb)
    );
END;
$$;
