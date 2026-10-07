# Sistem E-Voting OSIS Candra Kirana SPENASIX Divisi 9

Sistem E-Voting resmi, ringan, modern, aman, dan *mobile-first* untuk Pemilihan OSIS **Candra Kirana SPENASIX Divisi 9** (kapasitas 500–1.000 siswa).

Sistem dirancang khusus untuk memenuhi standar kerahasiaan pemilihan sekolah, bebas dari elemen desain berlebihan (*no glow, no glassmorphic, no 3D, no heavy animation*), serta dilengkapi dengan **Dua Metode Akses Voting**:
1. **Metode ID Card / QR Code:** Siswa melakukan scan QR NIS 4 digit pada ID Card fisik (kartu absen asli) menggunakan kamera HP. Mengakses web (halaman awal `index.html`) akan **langsung menampilkan animasi loading singkat lalu otomatis membuka halaman voting** (`vote.html`) dengan **kamera otomatis aktif secara default**.
2. **Mode Bilik Voting:** Panitia menetapkan siswa yang tidak membawa ID Card ke komputer bilik (`BILIK-01`, `BILIK-02`, dst.) yang menerima *assignment* secara *realtime* tanpa perlu input NIS/password di layar bilik.

---

## 🚀 Teknologi Utama

- **Frontend:** HTML5, CSS3 Custom Properties, Vanilla JavaScript (ES6 Modules/Scripts), HTML5-QRCode Scanner.
- **Backend & Database:** PostgreSQL via Supabase.
- **Authentication Admin:** Supabase Auth.
- **Realtime Updates:** Supabase Realtime (WebSockets).
- **Security:** Row Level Security (RLS) & PostgreSQL Atomic RPC Stored Procedures.
- **Hosting Frontend:** Vercel / GitHub Pages.

---

## 📂 Struktur Project

```text
/
├── index.html               # Splash screen ringan + auto-redirect ke vote.html saat web dibuka
├── portal.html              # Menu portal (Voting, Bilik, Admin, Cetak ID Card)
├── vote.html                # Halaman Voting QR Code (Kamera Aktif Default)
├── voting-room.html         # Terminal Komputer Bilik Voting
├── admin.html               # Portal Admin Panitia & Dashboard Realtime
├── id-cards.html            # Generator & Printable ID Card Siswa + QR Code
├── data_siswa_contoh.csv    # File CONTOH SPREADSHEET Data Siswa
├── data_siswa_spenasix.csv  # Data SIAP IMPOR semua siswa (ekspor Dapodik, 763 siswa)
├── data_siswa_7AB.csv       # Pasangan 7A + 7B (64 siswa)
├── data_siswa_7CD.csv       # Pasangan 7C + 7D (64 siswa)
├── data_siswa_7EF.csv       # Pasangan 7E + 7F (64 siswa)
├── data_siswa_7GH.csv       # Pasangan 7G + 7H (64 siswa)
├── data_siswa_8AB.csv       # Pasangan 8A + 8B (64 siswa)
├── data_siswa_8CD.csv       # Pasangan 8C + 8D (64 siswa)
├── data_siswa_8EF.csv       # Pasangan 8E + 8F (64 siswa)
├── data_siswa_8GH.csv       # Pasangan 8G + 8H (63 siswa)
├── data_siswa_9AB.csv       # Pasangan 9A + 9B (64 siswa)
├── data_siswa_9CD.csv       # Pasangan 9C + 9D (64 siswa)
├── data_siswa_9EF.csv       # Pasangan 9E + 9F (64 siswa)
├── data_siswa_9GH.csv       # Pasangan 9G + 9H (60 siswa)
│
├── css/
│   ├── style.css            # Base design system & official school identity
│   ├── vote.css             # Grid kandidat, konfirmasi & halaman berhasil
│   ├── admin.css            # Tab navigation, data tables, import preview
│   └── room.css             # Terminal bilik, PIN activation, countdown timer
│
├── js/
│   ├── config.js            # Konfigurasi Supabase URL & Anon Key
│   ├── supabase-client.js   # Wrapper SDK Supabase & RPC caller
│   ├── main.js              # Utility global (Escaping, Toast, Date)
│   ├── vote.js              # Logika voting QR, camera scanner & atomic submission
│   ├── room.js              # Logika terminal bilik, PIN activation & Realtime
│   └── admin.js             # Dashboard admin, candidate CRUD, assign bilik, import Excel & Auth
│
├── scripts/
│   ├── generate-qr.js       # Script Node.js pembentuk QR Code PNG (NIS 4 digit)
│   └── import-students.js   # CLI validator data siswa sebelum diimpor
│
├── supabase/
│   ├── migrations/
│   │   └── 20261005_initial_schema.sql  # Schema, RLS & Stored Procedures (RPC)
│   └── seed.sql             # Data kandidat awal, bilik & contoh siswa
│
├── .env.example             # Template variabel lingkungan
├── .gitignore
└── README.md
```

---

## 🧭 Alur Navigasi Halaman

```text
Buka web (index.html)
        │  splash loading ±1,6 detik (kunjungan ulang ±0,5 detik)
        ▼
   vote.html  ← halaman default: kamera QR langsung aktif
        │
        │  tombol "☰ Menu" / selesai voting
        ▼
   portal.html ← menu alternatif: Mode Bilik, Admin, Cetak ID Card
```

Catatan performa (dioptimalkan untuk perangkat kelas bawah / "HP kentang"):
- Splash `index.html` dibuat murni CSS tanpa gambar & tanpa Supabase JS, serta `prefetch` ke `vote.html`, `css/style.css`, dan `css/vote.css` agar halaman voting terasa instan.
- Semua animasi hanya memakai `transform`/`opacity` (ramah GPU), tanpa `blur`/`backdrop-filter`, dan otomatis nonaktif bila pengguna mengaktifkan **Reduce Motion** di sistemnya.
- Scanner QR memakai mode `disableFlip` serta `BarcodeDetector` bawaan browser bila didukung (jauh lebih hemat CPU/baterai).
- Foto kandidat dimuat `lazy` + `decoding="async"` sehingga halaman tidak berat saat dibuka.

---

## 📊 Format Spreadsheet Data Siswa (Excel / CSV)

Untuk mengunggah data siswa di Portal Admin (`admin.html`), buat file spreadsheet dengan format **3 Kolom Utama** berikut:

### Contoh Struktur Kolom (`data_siswa_contoh.csv`):
```csv
NIS,Nama Lengkap,Kelas
1234,Ahmad Fulan,9A
1235,Budi Santoso,9A
1236,Citra Lestari,9B
1237,Dewa Pratama,9B
1238,Eka Rahmawati,9C
1239,Farhan Rizky,9C
1240,Gita Gutawa,9D
1241,Hendra Setiawan,9D
```

> 💡 **Unduh Template:** Di halaman `admin.html` tab **"👥 Kelola & Impor Siswa"**, tersedia tombol **"📥 Unduh Format Excel Contoh"** untuk langsung mendownload file `.xlsx` template resmi.

> 📄 **Data Siap Impor dari Ekspor Dapodik:** File `data_siswa_spenasix.csv` berisi **763 data siswa** hasil konversi dari ekspor *Daftar Peserta Didik* sekolah. Dari file ekspor tersebut hanya dipakai 3 kolom: **NIPD** (dipetakan sebagai kolom `NIS` 4 digit), **Nama** (menjadi `Nama Lengkap`), dan **Rombel Saat Ini** (menjadi `Kelas`). Kolom `No`, `JK`, dan `NISN` tidak dipakai.

> 🗂️ **Versi Terpisah Per 2 Rombel:** Data yang sama juga tersedia terpecah menjadi **12 file** (tiap file = 2 rombel berurutan), mis. `data_siswa_7AB.csv` (7A+7B), `data_siswa_7CD.csv` (7C+7D), dan seterusnya hingga `data_siswa_9GH.csv` (9G+9H). Semua file memakai format kolom & encoding yang persis sama, jumlah total tetap **763 siswa**, dan dapat diimpor satu per satu melalui tab **"👥 Kelola & Impor Siswa"**.

> 🗑️ **Hapus Massal Siswa (multi-select):** Pada tabel **Daftar Siswa**, centang kolom paling kiri untuk memilih beberapa baris (atau centang kotak pada baris header untuk memilih semua). Bilah aksi **"Hapus Terpilih"** akan muncul menampilkan jumlah data terpilih, lalu klik **[ 🗑️ Hapus Terpilih ]** untuk menghapus beberapa data NIS sekaligus tanpa perlu satu per satu.

---

## 🗳️ Pengelolaan Kandidat di Admin Web

Admin panitia memiliki hak akses penuh untuk mengelola calon ketua OSIS di `admin.html` tab **"🗳️ Kelola Kandidat"**:

- **Foto Kandidat:** Gunakan link/URL gambar publik (contoh: `https://domain.com/foto.jpg` atau dari Supabase Storage).
- **Visi & Misi:** Visi diisi dalam kotak teks, dan Misi diisi per-baris (sistem otomatis mengubah baris baru menjadi poin-poin misi).
- **Satu Halaman Surat Suara:** Seluruh kandidat yang berstatus **AKTIF** akan otomatis ditampilkan bersamaan dalam 1 Halaman Grid Surat Suara pada saat siswa melakukan voting.
- **Hapus Massal Kandidat (multi-select):** Centang **"Pilih semua kandidat"** atau centang kotak **"Pilih kandidat ini"** pada beberapa kartu, lalu klik **[ 🗑️ Hapus Terpilih ]**. Kandidat yang sudah memperoleh suara tidak dapat dihapus — reset suara terlebih dahulu di tab **⚙️ Pengaturan Election**.

---

## 🛠️ Langkah Instalasi & Konfigurasi Supabase

### 1. Cloning Repository & Environment
```bash
git clone https://github.com/username/evoting-spenasix-divisi9.git
cd evoting-spenasix-divisi9
```

### 2. Konfigurasi Proyek Supabase
1. Buat proyek baru di [Supabase Dashboard](https://supabase.com).
2. Salin **Project URL** dan **Anon API Key** dari menu `Project Settings -> API`.
3. Buka file `js/config.js` dan perbarui nilainya:
   ```javascript
   const CONFIG = {
       SUPABASE_URL: 'https://xxx.supabase.co',
       SUPABASE_ANON_KEY: 'eyJhbGciOiJKV1QiLCJhbGci...'
   };
   ```

### 3. Eksekusi Database Migration & RPC
1. Masuk ke **SQL Editor** di Supabase Dashboard.
2. Salin dan jalankan seluruh isi file `supabase/migrations/20261005_initial_schema.sql`.
3. Skrip ini akan membuat tabel (`students`, `candidates`, `ballots`, `election_settings`, `voting_rooms`, `voting_sessions`, `audit_logs`), mengaktifkan RLS, serta memasang fungsi RPC atomik (`submit_vote_qr`, `submit_vote_room`, `activate_room`, `assign_student_to_room`, `get_admin_dashboard_stats`).
4. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261006_room_vote_management.sql`.** File ini menambahkan RPC manajemen bilik: `deactivate_room` (Keluar Mode Bilik dari terminal), `delete_voting_room` (Hapus bilik dari daftar), dan `reset_votes_only` (Reset seluruh suara tanpa mematikan perangkat bilik).
5. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261007_bulk_delete.sql`.** File ini menambahkan RPC **hapus massal (multi-select)** pada tab Kelola Siswa & Kelola Kandidat: `delete_students_batch` (Hapus banyak siswa sekaligus, sesi voting ikut terhapus via CASCADE) dan `delete_candidates_batch` (Hapus banyak kandidat sekaligus dengan validasi tidak boleh menghapus kandidat yang sudah punya suara).
6. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261008_guest_vote.sql`.** File ini menambahkan RPC **`submit_vote_guest`** — **kode rahasia** panitia (default **`0000`**) yang memungkinkan pemilih **belum/tidak terdaftar** tetap memberikan suara sebagai **Tamu** pada halaman Voting ID Card (`vote.html`). Suara tamu dicatat **anonim** tanpa identitas (hanya tersimpan pada tabel `ballots`).

### 4. Eksekusi Seed Data Awal
1. Di SQL Editor Supabase, salin dan jalankan isi file `supabase/seed.sql`.
2. Ini akan mendaftarkan 3 Kandidat Ketua OSIS, 4 Bilik (`BILIK-01` s/d `BILIK-04`), dan data contoh siswa NIS 4 digit (`1234`, `1235`, dst.).

### 5. Membuat Akun Admin Panitia
1. Masuk ke menu **Authentication -> Users** di Supabase Dashboard.
2. Klik **Add User -> Create User**.
3. Masukkan Email (misal: `admin@spenasix.sch.id`) dan Password. Akun ini yang digunakan untuk login di `admin.html`.

### 6. Troubleshooting Migrasi

Beberapa error umum saat menjalankan migrasi beserta solusinya:

- **`42710: policy "..." already exists`** — Terjadi bila `20261005` dijalankan ulang. File sudah dibuat idempotent (`DROP POLICY IF EXISTS` sebelum setiap `CREATE POLICY`), jadi cukup jalankan ulang seluruh file dari awal.
- **`DELETE requires a WHERE clause` / `UPDATE requires a WHERE clause`** — Muncul saat memakai tombol **Reset Suara Saja** / **Reset Total**. Ini berasal dari guard extension **`pg_safeupdate`** milik Supabase yang menolak `DELETE`/`UPDATE` tanpa `WHERE`, termasuk di dalam fungsi `SECURITY DEFINER`. Fungsi `reset_votes_only()`, `reset_all_rooms()`, dan `reset_total_election()` sudah diberi `WHERE TRUE` agar lolos guard. **Jalankan ulang** `20261005_initial_schema.sql` dan `20261006_room_vote_management.sql` agar fungsi ter-`CREATE OR REPLACE` dengan versi terbaru.
- **`function public.xxx() does not exist` / `PGRST202`** — Fungsi RPC belum terpasang karena migrasi yang mendefinisikannya belum dijalankan (atau berhenti di tengah karena error). Jalankan migrasi sesuai urutan `20261005` → `20261006` → `20261007` → `20261008`.
- **`could not find the function ... in the schema cache`** — PostgREST sedang menyegarkan cache skema. Tunggu ±10 detik lalu ulangi; jika tetap muncul, gunakan tombol *Reload schema cache* pada Supabase Dashboard → *Settings* → *API*.

---

## 🖥️ Panduan Operasional Hari Pemilihan

### 1. Menjalankan Election (Buka Pemilihan)
1. Buka `admin.html` dan login menggunakan email admin.
2. Buka tab **⚙️ Pengaturan Election**.
3. Tekan **Set OPEN (Buka Voting)**. Sistem sekarang siap menerima suara.

### 2. Voting ID Card Fisik / QR Code (Metode A)
1. Pemilih cukup membuka alamat utama web (mis. `https://domain-sekolah/`). Halaman `index.html` menampilkan **animasi loading splash** lalu **otomatis berpindah ke `vote.html`** (kunjungan berikutnya di tab yang sama hanya butuh ±0,5 detik). Tombol "Buka Voting ID Card Sekarang" tersedia sebagai jalan pintas manual.
2. **Kamera scanner otomatis aktif secara default.** Gunakan dropdown **📷 Kamera** untuk memilih perangkat kamera. Sistem otomatis memprioritaskan **kamera depan (webcam)** sehingga berjalan juga di **PC All-in-One (AIO) / laptop**. Tombol **🔄 Refresh Kamera** berguna bila kamera baru dicolok/diaktifkan. (Browser akan meminta izin akses kamera pada saat pertama kali — pilih **Allow/Izinkan**.)
3. Arahkan kamera ke QR Code ID Card fisik (kartu absen) siswa.
4. Sistem membaca NIS 4-digit secara otomatis, menutup kamera, dan **langsung menampilkan 1 Halaman Surat Suara Kandidat**.
5. Siswa memilih kandidat, meninjau modal konfirmasi, dan menekan **[ KONFIRMASI SUARA ]**.
6. Setelah suara tercatat, layar menampilkan **"SUARA BERHASIL TERCATAT"** beserta **hitung mundur ±5 detik**, lalu **otomatis kembali ke langkah Verifikasi/Scan** sehingga pemilih berikutnya dapat langsung scan tanpa memuat ulang halaman. Tersedia pula tombol **📷 Scan Siswa Berikutnya** (kembali seketika) dan **☰ Kembali ke Menu** (ke portal). Durasi hitung mundur dapat diubah lewat `SCAN_RESET_DELAY_MS` pada `js/config.js`.
7. **Kode Rahasia untuk Pemilih Belum/Tidak Terdaftar (Tamu).** Bila NIS pemilih tidak ditemukan di basis data, panitia dapat meminta pemilih mengetikkan **kode rahasia** (default **`0000`**) pada kolom *Masukkan NIS 4 Digit*. Sistem akan melewati validasi data siswa dan pemilih lanjut memilih sebagai **"Pemilih Tamu"**; suara tetap tersimpan **anonim**. Kode dapat diubah pada `GUEST_VOTE_CODE` di `js/config.js` **dan harus sama** dengan `v_secret_code` di dalam fungsi `submit_vote_guest` pada `supabase/migrations/20261008_guest_vote.sql` (validasi dilakukan di sisi server).

### 3. Mengaktifkan Komputer Bilik Voting (Metode B)
1. Di setiap komputer bilik, buka URL `/voting-room.html`.
2. Masukkan ID Bilik dan PIN 6 Digit awal:
   - `BILIK-01` → PIN: `583214`
   - `BILIK-02` → PIN: `741926`
   - `BILIK-03` → PIN: `315807`
   - `BILIK-04` → PIN: `862451`
3. Tekan **Aktifkan Bilik Ini**. Komputer bilik akan menampilkan status `BILIK-01 | SIAP | Menunggu penugasan siswa...`.
4. Untuk **mengakhiri Mode Bilik** pada satu perangkat (mis. ganti komputer / komputer dipindah fungsi), tekan tombol **🔓 Keluar Mode Bilik** pada status bar terminal. Bilik akan dinonaktifkan (`OFFLINE`), token perangkat dihapus, dan perangkat wajib diaktivasi ulang memakai PIN.

### 4. Menugaskan Siswa Tanpa ID Card (Mode Bilik)
1. Panitia di meja pendaftaran membuka `admin.html` tab **🖥️ Mode Bilik Voting**.
2. Pilih kelas siswa atau cari berdasarkan nama/NIS.
3. Klik tombol **Tugaskan Ke Bilik**, pilih bilik `BILIK-01` (READY), lalu klik **[ TUGASKAN KE BILIK ]**.
4. Komputer `BILIK-01` secara otomatis (via Supabase Realtime) berganti ke layar *Selamat Datang [Nama Siswa]*. Siswa memilih kandidat di bilik tanpa perlu input data apapun.

---

## 🔒 Privasi & Keamanan (Security Matrix)

1. **Pemisahan Identitas & Suara (Strict Anonymity):**
   Tabel `ballots` hanya menyimpan `candidate_id` dan `created_at`. Tidak ada kolom `student_id` maupun NIS pada tabel suara. Panitia hanya dapat mengetahui siswa mana yang `SUDAH VOTING`, tetapi **tidak bisa** mengetahui kandidat mana yang dipilih oleh siswa tersebut.
2. **Atomic Voting Procedure (Concurrency Protection):**
   Fungsi database `submit_vote_qr` dan `submit_vote_room` menggunakan perintah `FOR UPDATE` (row lock) dan transaksi atomik. Jika ada 2 request bersamaan untuk 1 NIS yang sama, request pertama akan `SUCCESS` dan request kedua otomatis `REJECTED`.
3. **Pemberhentian Akses Hasil untuk Siswa:**
   Row Level Security (RLS) melarang role anonim/siswa melakukan query pada tabel `ballots` atau agregat kandidat. Hasil suara kandidat hanya tersedia untuk admin terotentikasi.
4. **Kode Rahasia Pemilih Tamu (Guest):**
   RPC `submit_vote_guest` memvalidasi kode rahasia **di sisi server** (bukan hanya di klien), sehingga hanya pemegang kode yang dapat memicu pencatatan suara tamu. Suara tamu disimpan **sepenuhnya anonim** pada tabel `ballots` (tanpa entri pada tabel `students`, tanpa `student_id`). Karena satu kode dapat dipakai berkali-kali oleh pemilih berbeda, **panitia wajib menjaga kerahasiaan kode ini**; seluruh suara tamu tetap terhapus oleh Reset Suara/Reset Total.

---

## 📄 Lisensi
Hak Cipta &copy; 2026 **OSIS Candra Kirana SPENASIX Divisi 9**. Hak cipta dilindungi undang-undang.
