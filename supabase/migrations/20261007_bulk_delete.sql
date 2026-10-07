-- Migration: 20261007_bulk_delete.sql
-- Description: Bulk (multi-select) delete RPC functions for OSIS Candra Kirana SPENASIX Divisi 9
--              - delete_students_batch   : Hapus banyak siswa (NIS) sekaligus dalam satu transaksi atomik.
--              - delete_candidates_batch : Hapus banyak kandidat sekaligus (dengan validasi sudah ada suara).
--
-- Catatan keamanan:
--   * Kedua fungsi memakai SECURITY DEFINER (seperti RPC lain di sistem ini) sehingga admin
--     terotentikasi dapat menghapus banyak baris dalam satu request tanpa round-trip per baris.
--   * Setiap penghapusan selalu dicatat ke public.audit_logs.

-- ==========================================
-- N. Bulk Delete Students (Admin Only)
--    Menghapus banyak data siswa sekaligus berdasarkan array UUID.
--    Sesi voting siswa terkait otomatis ikut terhapus (FK voting_sessions.student_id ON DELETE CASCADE).
--    Siswa yang sedang dalam proses voting (IN_PROGRESS) DITOLAK agar tidak menyisakan sesi menggantung.
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_students_batch(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ids UUID[];
    v_deleted INT := 0;
    v_in_progress INT := 0;
BEGIN
    IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tidak ada data siswa yang dipilih.');
    END IF;

    -- Pertahankan hanya id unik yang benar-benar ada di tabel
    SELECT array_agg(DISTINCT id) INTO v_ids
    FROM public.students
    WHERE id = ANY(p_ids);

    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Data siswa yang dipilih tidak ditemukan.');
    END IF;

    -- Tolak bila ada siswa yang sedang IN_PROGRESS (agar tidak menyisakan sesi bilik menggantung)
    SELECT COUNT(*) INTO v_in_progress
    FROM public.students
    WHERE id = ANY(v_ids) AND voting_status = 'IN_PROGRESS';

    IF v_in_progress > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', v_in_progress || ' siswa sedang dalam proses voting. Selesaikan / batalkan sesi bilik terlebih dahulu.'
        );
    END IF;

    DELETE FROM public.students WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'STUDENTS_BULK_DELETED',
            jsonb_build_object('count', v_deleted, 'ids', to_jsonb(v_ids)));

    RETURN jsonb_build_object(
        'success', true,
        'deleted', v_deleted,
        'message', v_deleted || ' data siswa berhasil dihapus.'
    );
END;
$$;

-- ==========================================
-- O. Bulk Delete Candidates (Admin Only)
--    Menghapus banyak kandidat sekaligus. Kandidat yang sudah memiliki suara (ballots)
--    DITOLAK karena ballots.candidate_id memakai ON DELETE RESTRICT (menjaga integritas suara).
--    Untuk menghapusnya, reset suara terlebih dahulu (tab Pengaturan Election).
-- ==========================================
CREATE OR REPLACE FUNCTION public.delete_candidates_batch(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ids UUID[];
    v_deleted INT := 0;
    v_has_ballots INT := 0;
BEGIN
    IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tidak ada kandidat yang dipilih.');
    END IF;

    SELECT array_agg(DISTINCT id) INTO v_ids
    FROM public.candidates
    WHERE id = ANY(p_ids);

    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat yang dipilih tidak ditemukan.');
    END IF;

    SELECT COUNT(*) INTO v_has_ballots
    FROM public.ballots
    WHERE candidate_id = ANY(v_ids);

    IF v_has_ballots > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Ada kandidat yang sudah memiliki suara. Reset suara terlebih dahulu sebelum menghapus.'
        );
    END IF;

    DELETE FROM public.candidates WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('ADMIN', 'CANDIDATES_BULK_DELETED',
            jsonb_build_object('count', v_deleted, 'ids', to_jsonb(v_ids)));

    RETURN jsonb_build_object(
        'success', true,
        'deleted', v_deleted,
        'message', v_deleted || ' kandidat berhasil dihapus.'
    );
END;
$$;

-- Hak akses eksekusi untuk peran aplikasi (konsisten dengan RPC lain)
GRANT EXECUTE ON FUNCTION public.delete_students_batch(UUID[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_candidates_batch(UUID[]) TO anon, authenticated, service_role;
