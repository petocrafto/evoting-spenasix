-- Patch: 20261023b_fix_angkatan_periode.sql
-- Update nilai kolom angkatan dari '35' ke '2026-2027' di election_settings
-- Jalankan HANYA jika migration 20261023 sudah pernah dijalankan sebelumnya
-- dengan nilai default '35'. Aman dijalankan berulang (idempotent).

UPDATE public.election_settings
SET angkatan = '2026-2027'
WHERE angkatan = '35';

-- Pastikan default column juga diperbarui
ALTER TABLE public.election_settings
    ALTER COLUMN angkatan SET DEFAULT '2026-2027';
