-- Migration: 20261006_room_vote_management.sql
-- Description: Additional RPC functions for OSIS Candra Kirana SPENASIX Divisi 9 E-Voting System
--              - deactivate_room   : Keluar dari Mode Bilik pada satu perangkat terminal (revoke device token)
--              - delete_voting_room: Hapus bilik dari daftar (dengan validasi tidak sedang digunakan)
--              - reset_votes_only  : Reset seluruh suara tanpa mematikan perangkat bilik

-- ==========================================
-- K. Deactivate a single room from its terminal ("Keluar Mode Bilik")
--    Revokes the device token, cancels any active session and forces the room OFFLINE.
-- ==========================================
CREATE OR REPLACE FUNCTION public.deactivate_room(p_device_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
BEGIN
    SELECT * INTO v_room
    FROM public.voting_rooms
    WHERE device_token = TRIM(p_device_token)
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Perangkat bilik tidak ditemukan atau sudah dinonaktifkan.');
    END IF;

    -- Cancel the currently linked session (if any)
    IF v_room.current_session_id IS NOT NULL THEN
        UPDATE public.voting_sessions
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = v_room.current_session_id;
    END IF;

    -- Cancel every remaining active session for this room
    UPDATE public.voting_sessions
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE room_id = v_room.id AND status = 'ACTIVE';

    -- Return students who were still IN_PROGRESS (not yet voted) to NOT_VOTED
    UPDATE public.students
    SET voting_status = 'NOT_VOTED', updated_at = NOW()
    WHERE has_voted = FALSE
      AND voting_status = 'IN_PROGRESS'
      AND id IN (
          SELECT student_id FROM public.voting_sessions WHERE room_id = v_room.id
      );

    -- Force OFFLINE and revoke the device token (forces re-activation with PIN)
    UPDATE public.voting_rooms
    SET status = 'OFFLINE',
        device_token = NULL,
        current_session_id = NULL,
        updated_at = NOW()
    WHERE id = v_room.id;

    INSERT INTO public.audit_logs (actor_type, actor_id, action, details)
    VALUES ('ROOM', v_room.room_code, 'ROOM_DEACTIVATED', jsonb_build_object('room_code', v_room.room_code));

    RETURN jsonb_build_object(
        'success', true,
        'room_code', v_room.room_code,
        'message', 'Mode bilik ' || v_room.room_code || ' berhasil dikeluarkan dan diubah ke OFFLINE.'
    );
END;
$$;

-- ==========================================
-- L. Delete a Voting Room from the registry (Admin Only)
--    Refuses to delete a room that is currently WAITING/VOTING or has an active session.
--    Related voting_sessions are removed via ON DELETE CASCADE.
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_voting_room(p_room_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
    v_active_sessions INT;
BEGIN
    SELECT * INTO v_room
    FROM public.voting_rooms
    WHERE room_code = UPPER(TRIM(p_room_code))
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bilik tidak ditemukan.');
    END IF;

    SELECT COUNT(*) INTO v_active_sessions
    FROM public.voting_sessions
    WHERE room_id = v_room.id AND status = 'ACTIVE';

    IF v_active_sessions > 0 OR v_room.status IN ('WAITING', 'VOTING') THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bilik sedang digunakan. Batalkan/reset sesi bilik terlebih dahulu sebelum menghapus.'
        );
    END IF;

    DELETE FROM public.voting_rooms WHERE id = v_room.id;

    INSERT INTO public.audit_logs (actor_type, actor_id, action, details)
    VALUES ('ADMIN', v_room.room_code, 'ROOM_DELETED', jsonb_build_object('room_code', v_room.room_code));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Bilik ' || v_room.room_code || ' berhasil dihapus dari daftar.'
    );
END;
$$;

-- ==========================================
-- M. Reset Votes Only (Admin Only)
--    Clears all ballots, sessions and voting statuses but KEEPS the student master data.
--    Activated rooms stay activated (device tokens preserved) and return to READY.
-- ==========================================
CREATE OR REPLACE FUNCTION public.reset_votes_only()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Clear all ballots
    DELETE FROM public.ballots;

    -- 2. Clear all voting sessions
    DELETE FROM public.voting_sessions;

    -- 3. Reset all students back to NOT_VOTED (keep NIS/nama/kelas)
    UPDATE public.students
    SET has_voted = FALSE,
        voting_status = 'NOT_VOTED',
        voted_at = NULL,
        updated_at = NOW();

    -- 4. Keep room activation intact; only clear the per-session pointer
    UPDATE public.voting_rooms
    SET status = CASE WHEN device_token IS NOT NULL THEN 'READY' ELSE 'OFFLINE' END,
        current_session_id = NULL,
        updated_at = NOW();

    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'RESET_VOTES_ONLY', jsonb_build_object('message', 'Seluruh suara di-reset; perangkat bilik tetap aktif.'));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Seluruh suara berhasil di-reset. Data siswa & perangkat bilik tetap aktif.'
    );
END;
$$;
