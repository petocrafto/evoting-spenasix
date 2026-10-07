-- Migration: 20261008_guest_vote.sql
-- Description: Menambahkan "kode rahasia" (default: 0000) agar pemilih yang
--              belum / tidak terdaftar tetap dapat memberikan suara sebagai
--              TAMU pada halaman Voting ID Card (vote.html).
--
-- Cara pakai: Pada kolom "Masukkan NIS 4 Digit" di vote.html, ketik kode
--             rahasia (default: 0000). Sistem akan melewati validasi data
--             siswa dan mencatat suara secara ANONIM (tanpa identitas sama
--             sekali), persis seperti mekanisme QR biasa pada tabel ballots.
--
-- CATATAN KEAMANAN:
--   Kode ini bersifat rahasia panitia. Suara tamu TIDAK dikaitkan dengan
--   identitas manapun dan tidak membatasi jumlah pemilih, sehingga panitia
--   harus menjaga kerahasiaan kode ini. Seluruh suara tamu tetap terhapus
--   oleh RPC reset (reset_votes_only / reset_total_election) karena tersimpan
--   pada tabel ballots yang sama.

-- ==========================================
-- A. Submit Vote via Kode Rahasia / Tamu (Method C)
-- ==========================================
CREATE OR REPLACE FUNCTION public.submit_vote_guest(
    p_code TEXT,
    p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Kode rahasia panitia untuk pemilih yang belum/tidak terdaftar.
    v_secret_code CONSTANT TEXT := '0000';
    v_candidate   public.candidates%ROWTYPE;
BEGIN
    -- 1. Validate Election OPEN
    IF NOT public.check_election_is_open() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voting belum dibuka atau telah ditutup.');
    END IF;

    -- 2. Validate Secret Code (dibandingkan di sisi server, bukan hanya di klien)
    IF TRIM(p_code) IS DISTINCT FROM v_secret_code THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kode rahasia tidak valid.');
    END IF;

    -- 3. Validate Candidate
    SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id AND active = TRUE;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kandidat tidak valid atau tidak aktif.');
    END IF;

    -- 4. Insert Anonymous Ballot (STRICTLY NO STUDENT_ID — suara tamu tanpa identitas)
    INSERT INTO public.ballots (candidate_id) VALUES (v_candidate.id);

    -- 5. Audit Log (No identity: hanya mencatat bahwa ada suara mode TAMU masuk)
    INSERT INTO public.audit_logs (actor_type, action, details)
    VALUES ('SYSTEM', 'VOTE_SUBMITTED', jsonb_build_object('mode', 'GUEST'));

    RETURN jsonb_build_object('success', true, 'message', 'Suara tamu berhasil dicatat!');
END;
$$;

-- Hak akses eksekusi untuk peran aplikasi (konsisten dengan RPC lain)
GRANT EXECUTE ON FUNCTION public.submit_vote_guest(TEXT, UUID) TO anon, authenticated, service_role;
