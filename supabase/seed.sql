-- Seed data for OSIS Candra Kirana SPENASIX Divisi 9 E-Voting System

-- 1. Initial Election Settings
INSERT INTO public.election_settings (id, election_name, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Pemilihan OSIS Candra Kirana SPENASIX Divisi 9',
    'OPEN'
) ON CONFLICT (id) DO UPDATE SET status = 'OPEN';

-- 2. Initial Candidates
INSERT INTO public.candidates (nomor_urut, nama, foto_url, visi, misi, active)
VALUES 
(
    1,
    'Ahmad Fulan & Partner',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'Wujudkan OSIS Candra Kirana SPENASIX Divisi 9 yang inovatif, inklusif, berintegritas, serta menjadi wadah aspirasi siswa yang responsif.',
    ARRAY[
        'Mengembangkan program kerja unggulan berbasis keahlian siswa Divisi 9.',
        'Meningkatkan kolaborasi antar kelas dalam kegiatan akademik dan non-akademik.',
        'Mengoptimalkan pemanfaatan teknologi digital dalam penyampaian informasi OSIS.'
    ],
    TRUE
),
(
    2,
    'Budi Santoso & Partner',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'Membangun karakter kepemimpinan siswa SPENASIX Divisi 9 yang berbudaya, berprestasi, berdaya saing, dan berjiwa sosial tinggi.',
    ARRAY[
        'Meningkatkan kedisiplinan dan jiwa gotong royong di lingkungan sekolah.',
        'Menyelenggarakan perlombaan kreatif secara rutin antar kelas.',
        'Memperkuat hubungan kemitraan dengan organisasi intra sekolah lainnya.'
    ],
    TRUE
),
(
    3,
    'Citra Lestari & Partner',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    'Menjadikan OSIS Candra Kirana sebagai pelopor gerakan peduli lingkungan, kepemimpinan siswa yang adaptif, dan berwawasan luas.',
    ARRAY[
        'Menggalakkan aksi lingkungan hidup bersih dan hijau (Green SPENASIX).',
        'Mewadahi bakat seni, olahraga, dan sains siswa secara aktif.',
        'Menyediakan forum terbuka penyampaian kritik dan saran secara kontinyu.'
    ],
    TRUE
)
ON CONFLICT (nomor_urut) DO NOTHING;

-- 3. Initial Voting Rooms with SHA-256 hashed PINs
-- BILIK-01 -> PIN: 583214
-- BILIK-02 -> PIN: 741926
-- BILIK-03 -> PIN: 315807
-- BILIK-04 -> PIN: 862451
INSERT INTO public.voting_rooms (room_code, pin_hash, status)
VALUES 
('BILIK-01', encode(digest('583214', 'sha256'), 'hex'), 'OFFLINE'),
('BILIK-02', encode(digest('741926', 'sha256'), 'hex'), 'OFFLINE'),
('BILIK-03', encode(digest('315807', 'sha256'), 'hex'), 'OFFLINE'),
('BILIK-04', encode(digest('862451', 'sha256'), 'hex'), 'OFFLINE')
ON CONFLICT (room_code) DO NOTHING;

-- 4. Initial Sample Students (NIS 4 Digits)
INSERT INTO public.students (nis, nama, kelas, has_voted, voting_status)
VALUES 
('1234', 'Ahmad Fulan', '9A', FALSE, 'NOT_VOTED'),
('1235', 'Budi Santoso', '9A', FALSE, 'NOT_VOTED'),
('1236', 'Citra Lestari', '9B', FALSE, 'NOT_VOTED'),
('1237', 'Dewa Pratama', '9B', FALSE, 'NOT_VOTED'),
('1238', 'Eka Rahmawati', '9C', FALSE, 'NOT_VOTED'),
('1239', 'Farhan Rizky', '9C', FALSE, 'NOT_VOTED'),
('1240', 'Gita Gutawa', '9D', FALSE, 'NOT_VOTED'),
('1241', 'Hendra Setiawan', '9D', FALSE, 'NOT_VOTED')
ON CONFLICT (nis) DO NOTHING;
