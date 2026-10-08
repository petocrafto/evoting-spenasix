-- Migration: 20261011_room_exit_pin_lock.sql
-- Description: MENGUNCI tombol "Keluar Mode Bilik" dengan PIN 6 digit bilik.
--   Sebelumnya RPC deactivate_room(p_device_token) hanya membutuhkan token
--   perangkat, sehingga siapa pun yang memegang komputer bilik (mis. siswa yang
--   penasaran) dapat mengeluarkan bilik (room -> OFFLINE) tanpa sepengetahuan
--   panitia. Sekarang PIN bilik WAJIB dan diverifikasi di sisi SERVER:
--
--     1. deactivate_room(p_device_token, p_pin) -> PIN diperiksa memakai hash
--        SHA-256 (digest) terhadap kolom voting_rooms.pin_hash, PERSIS seperti
--        activate_room. PIN mentah tidak pernah disimpan ke database.
--     2. Versi lama deactivate_room(p_device_token) DIPERTAHANKAN namun SELALU
--        MENOLAK (error PIN_REQUIRED), supaya perangkat/browser yang masih
--        memuat cache js/room.js lama tidak bisa mengeluarkan bilik tanpa PIN.
--        Pesannya dibuat jelas, bukan "function does not exist".
--     3. Percobaan keluar dengan PIN salah / PIN kosong dicatat ke audit_logs
--        (action ROOM_EXIT_REJECTED) agar bisa diaudit panitia.
--
--   Jalankan SETELAH 20261006_room_vote_management.sql.
--   Idempotent: aman dijalankan berulang.
-- ==========================================

-- ==========================================
-- M. Deactivate a room from its terminal — WAJIB PIN 6 DIGIT BILIK
--    (Keluar Mode Bilik). Revokes the device token, cancels any active session
--    and forces the room OFFLINE, hanya bila PIN bilik benar.
-- ==========================================
CREATE OR REPLACE FUNCTION public.deactivate_room(p_device_token TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room public.voting_rooms%ROWTYPE;
    v_input_hash TEXT;
BEGIN
    -- 1. PIN wajib ada (validasi dasar; di klien sudah dicek 6 digit angka)
    IF p_pin IS NULL OR TRIM(p_pin) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PIN_REQUIRED',
            'message', 'PIN bilik 6 digit wajib diisi untuk keluar dari Mode Bilik.'
        );
    END IF;

    SELECT * INTO v_room
    FROM public.voting_rooms
    WHERE device_token = TRIM(p_device_token)
    FOR UPDATE;

    IF v_room.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ROOM_NOT_FOUND',
            'message', 'Perangkat bilik tidak ditemukan atau sudah dinonaktifkan.'
        );
    END IF;

    -- 2. Verifikasi PIN bilik (SHA-256, sama seperti activate_room)
    v_input_hash := encode(digest(TRIM(p_pin), 'sha256'), 'hex');

    IF v_room.pin_hash IS DISTINCT FROM v_input_hash THEN
        INSERT INTO public.audit_logs (actor_type, actor_id, action, details)
        VALUES ('ROOM', v_room.room_code, 'ROOM_EXIT_REJECTED',
                jsonb_build_object('room_code', v_room.room_code, 'reason', 'INVALID_PIN'));

        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_PIN',
            'message', 'PIN bilik salah. Keluar Mode Bilik dibatalkan.'
        );
    END IF;

    -- 3. PIN benar -> proses keluar (sama seperti perilaku sebelumnya)
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
    VALUES ('ROOM', v_room.room_code, 'ROOM_DEACTIVATED',
            jsonb_build_object('room_code', v_room.room_code, 'verified_by', 'ROOM_PIN'));

    RETURN jsonb_build_object(
        'success', true,
        'room_code', v_room.room_code,
        'message', 'Mode bilik ' || v_room.room_code || ' berhasil dikeluarkan dan diubah ke OFFLINE.'
    );
END;
$$;

-- ==========================================
-- N. Versi lama (1 argumen) -> SELALU MENOLAK
--    Tanpa fungsi ini, perangkat dengan cache js/room.js lama akan mendapat
--    error "function does not exist" yang membingungkan; dengan fungsi ini
--    bilik TETAP tidak bisa dikeluarkan tanpa PIN dan pesannya informatif.
-- ==========================================
CREATE OR REPLACE FUNCTION public.deactivate_room(p_device_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'PIN_REQUIRED',
        'message', 'PIN bilik 6 digit wajib diisi untuk keluar dari Mode Bilik. Muat ulang (refresh) halaman terminal bilik agar kolom PIN tampil.'
    );
END;
$$;

COMMENT ON FUNCTION public.deactivate_room(TEXT, TEXT) IS
    'Keluar Mode Bilik dari terminal. WAJIB PIN 6 digit bilik (diverifikasi SHA-256 terhadap voting_rooms.pin_hash).';
COMMENT ON FUNCTION public.deactivate_room(TEXT) IS
    'Kedaluwarsa & selalu menolak (PIN_REQUIRED). Gunakan deactivate_room(p_device_token, p_pin).';

-- ==========================================
-- VERIFIKASI: harus muncul DUA baris untuk deactivate_room
--   (1 argumen -> penolakan, 2 argumen -> aktif / security definer = true)
-- ==========================================
SELECT p.proname AS fungsi,
       pg_get_function_identity_arguments(p.oid) AS argumen,
       p.prosecdef AS security_definer,
       obj_description(p.oid, 'pg_proc') AS keterangan
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('deactivate_room', 'activate_room')
ORDER BY p.proname, argumen;
