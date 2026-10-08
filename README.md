# Sistem E-Voting OSIS Candra Kirana SPENASIX Divisi 9

Sistem E-Voting resmi, ringan, modern, aman, dan *mobile-first* untuk Pemilihan OSIS **Candra Kirana SPENASIX Divisi 9** (kapasitas 500–1.000 siswa).

Sistem dirancang khusus untuk memenuhi standar kerahasiaan pemilihan sekolah, bebas dari elemen desain berlebihan (*no glow, no glassmorphic, no 3D, no heavy animation*), serta dilengkapi dengan **Dua Metode Akses Voting**:
1. **Metode ID Card / QR Code:** Siswa melakukan scan QR NIS 4 digit pada ID Card fisik (kartu absen asli) menggunakan kamera HP. Mengakses web (halaman awal `index.html`) akan **langsung menampilkan animasi loading singkat lalu otomatis membuka halaman voting** (`vote.html`) dengan **kamera otomatis aktif secara default**.
2. **Mode Bilik Voting:** Panitia menetapkan siswa yang tidak membawa ID Card ke komputer bilik (`BILIK-01`, `BILIK-02`, dst.) yang menerima *assignment* secara *realtime* **sekaligus auto-refresh tiap 3 detik** (layar bilik tersinkron sendiri, tanpa perlu di-refresh manual) tanpa perlu input NIS/password di layar bilik. Aksi **🔓 Keluar Mode Bilik** pada terminal juga **dikunci PIN 6 digit bilik** (diverifikasi server) supaya perangkat bilik tidak bisa dikeluarkan sembarang orang.

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
│   └── room.css             # Terminal bilik, PIN activation, modal PIN keluar & countdown timer
│
├── js/
│   ├── config.js            # Konfigurasi Supabase URL, Anon Key & interval auto-refresh
│   ├── supabase-client.js   # Wrapper SDK Supabase & RPC caller
│   ├── main.js              # Utility global (Escaping, Toast, Date)
│   ├── vote.js              # Logika voting QR, camera scanner & atomic submission
│   ├── room.js              # Logika terminal bilik, PIN activation, PIN keluar bilik, Realtime & auto-refresh 3 detik
│   └── admin.js             # Dashboard admin (hasil suara lingkaran + auto-refresh), CRUD kandidat, assign bilik, import Excel & Auth
│
├── scripts/
│   ├── generate-qr.js       # Script Node.js pembentuk QR Code PNG (NIS 4 digit)
│   └── import-students.js   # CLI validator data siswa sebelum diimpor
│
├── supabase/
│   ├── migrations/
│   │   ├── 20261005_initial_schema.sql        # Schema, RLS & Stored Procedures (RPC)
│   │   ├── 20261006_room_vote_management.sql  # RPC manajemen bilik & reset suara
│   │   ├── 20261007_bulk_delete.sql           # RPC hapus massal siswa & kandidat
│   │   ├── 20261008_guest_vote.sql            # RPC kode rahasia pemilih tamu (versi awal)
│   │   ├── 20261009_guest_manual_voter.sql    # Kategori TAMU & data manual pemilih tamu
│   │   ├── 20261010_guest_code_2513_and_room_autorefresh.sql  # Kode 2513, anti data ganda & Realtime bilik
│   │   └── 20261011_room_exit_pin_lock.sql    # Keluar Mode Bilik wajib PIN bilik (kunci di server)
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

## 📈 Monitoring & Hasil Suara di Dashboard Admin

Tab **📊 Dashboard** pada `admin.html` menampilkan hasil pemilihan secara **langsung (auto-refresh tiap 5 detik)** sehingga panitia **tidak perlu menekan refresh atau berpindah tab** untuk melihat data terbaru:

- **Hasil Perolehan Suara Kandidat** disajikan sebagai **diagram lingkaran (donut)** pembagian suara seluruh kandidat dengan angka **Total Suara** di tengah lingkaran, dilengkapi **tabel perolehan suara** per kandidat: nomor urut, nama, jumlah suara, dan **persentase berbentuk lingkaran** pada tiap baris.
- **Kartu statistik:** Total Siswa, Sudah Voting, Belum Voting, Partisipasi, dan **Pemilih Tamu** (kategori `TAMU`).
- **Status Komputer Bilik:** menunjukkan bilik mana yang sedang dipakai oleh siswa mana.
- Statistik siswa terdaftar **tidak tercampur** dengan pemilih tamu karena dihitung dari kategori `SISWA` saja.

Interval auto-refresh dapat diubah pada `DASHBOARD_REFRESH_INTERVAL_MS` di `js/config.js` (bawaan 5000 ms). Untuk pengumuman hasil akhir, tutup pemilihan lebih dahulu di tab **⚙️ Pengaturan Election**.

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
4. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261006_room_vote_management.sql`.** File ini menambahkan RPC manajemen bilik: `deactivate_room` (Keluar Mode Bilik dari terminal — **wajib PIN bilik** sejak langkah 9), `delete_voting_room` (Hapus bilik dari daftar), dan `reset_votes_only` (Reset seluruh suara tanpa mematikan perangkat bilik).
5. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261007_bulk_delete.sql`.** File ini menambahkan RPC **hapus massal (multi-select)** pada tab Kelola Siswa & Kelola Kandidat: `delete_students_batch` (Hapus banyak siswa sekaligus, sesi voting ikut terhapus via CASCADE) dan `delete_candidates_batch` (Hapus banyak kandidat sekaligus dengan validasi tidak boleh menghapus kandidat yang sudah punya suara).
6. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261008_guest_vote.sql`.** File ini menambahkan RPC **`submit_vote_guest`** — **kode rahasia** panitia (default **`0000`**) yang memungkinkan pemilih **belum/tidak terdaftar** tetap memberikan suara sebagai **Tamu** pada halaman Voting ID Card (`vote.html`).
7. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261009_guest_manual_voter.sql`.** File ini **menyempurnakan alur Pemilih Tamu** menjadi **pengisian data manual**: saat kode rahasia (`2513`) diketik pada kolom NIS, pemilih mengisi **Nama Lengkap + Tipe Pemilih (Siswa / Guru / Tamu) + Kelas atau Keterangan**, yaitu cara pengisian data yang sama seperti data siswa namun diketik manual. Datanya disimpan pada tabel `students` dengan **kategori `TAMU`** (kolom baru `kategori`, `nis` NULL, `kelas` berprefiks `TAMU - `), sehingga tampil sebagai **kategori tersendiri** di menu admin; pilihan suara tetap **anonim** pada tabel `ballots`. File ini juga memperbarui `get_admin_dashboard_stats()` agar statistik siswa terdaftar tidak tercampur dengan pemilih tamu.
8. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261010_guest_code_2513_and_room_autorefresh.sql`.** File ini **mengganti kode rahasia pemilih tamu dari `0000` menjadi `2513`**, menambahkan **pengaman anti data ganda** (baris identitas pemilih tamu dipakai ulang, bukan dibuat baru, plus unique index nama + kelas), **mengaktifkan Supabase Realtime** untuk tabel `voting_rooms`, `voting_sessions`, `students`, dan `ballots` (wajib agar terminal bilik & dashboard admin **ter-update otomatis tanpa refresh manual**), serta membatasi policy `ballots` hanya untuk admin login. Migrasi ini **idempotent** dan aman dijalankan walau `20261009` belum/telah dijalankan.
9. **[TAMBAHAN] Jalankan juga file `supabase/migrations/20261011_room_exit_pin_lock.sql`.** File ini **mengunci tombol 🔓 Keluar Mode Bilik dengan PIN 6 digit bilik**: RPC `deactivate_room` kini **wajib** menerima `p_device_token` **dan `p_pin`**, dan PIN itu diverifikasi **di sisi server** (hash SHA-256 terhadap `voting_rooms.pin_hash`, mekanisme yang sama seperti `activate_room`). Versi lama yang hanya memerlukan token perangkat tetap disediakan namun **selalu menolak** (`PIN_REQUIRED`), sehingga perangkat/browser yang masih memuat cache `js/room.js` versi lama pun **tidak bisa** mengeluarkan bilik tanpa PIN. Percobaan keluar dengan PIN salah dicatat ke `audit_logs` (action `ROOM_EXIT_REJECTED`). Tanpa migrasi ini, tombol keluar bilik akan gagal verifikasi (pesan *Gagal memverifikasi PIN ke server*).

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
- **`function public.xxx() does not exist` / `PGRST202`** — Fungsi RPC belum terpasang karena migrasi yang mendefinisikannya belum dijalankan (atau berhenti di tengah karena error). Jalankan migrasi sesuai urutan `20261005` → `20261006` → `20261007` → `20261008` → `20261009` → `20261010`.
- **`column students.kategori does not exist`** (atau gagal menyimpan pemilih tamu) — Migrasi `20261009_guest_manual_voter.sql` belum dijalankan. Fitur **Pemilih Tamu (input data manual)** membutuhkan kolom `kategori` serta kolom `nis` yang boleh NULL, jadi jalankan file migrasi tersebut di SQL Editor dan tunggu ±10 detik hingga skema PostgREST tersegarkan.
- **`could not find the function ... in the schema cache`** — PostgREST sedang menyegarkan cache skema. Tunggu ±10 detik lalu ulangi; jika tetap muncul, gunakan tombol *Reload schema cache* pada Supabase Dashboard → *Settings* → *API*.
- **Penugasan siswa atau hasil suara tidak muncul otomatis di layar bilik/dashboard (harus refresh manual)** — Tabel belum terdaftar pada publication Realtime. Jalankan `20261010_guest_code_2513_and_room_autorefresh.sql`, lalu pastikan **Realtime** aktif pada Supabase Dashboard → *Database* → *Replication* (`voting_rooms`, `voting_sessions`, `students`, `ballots`). Tanpa Realtime pun sistem tetap berjalan karena terminal bilik memakai **auto-refresh (polling) tiap 3 detik** dan dashboard admin tiap 5 detik.
- **`Kode akses pemilih tamu tidak valid` padahal kode sudah benar** — Nilai `CONFIG.GUEST_VOTE_CODE` pada `js/config.js` berbeda dengan `v_secret_code` di fungsi `submit_vote_guest`. Samakan keduanya (bawaan **`2513`**) lalu jalankan ulang `20261010_guest_code_2513_and_room_autorefresh.sql`.
- **NOTICE `Indeks unik pemilih tamu DILEWATI`** — Masih ada data pemilih tamu ganda (nama + kelas sama). Hapus duplikatnya di tab **👥 Kelola & Impor Siswa** (filter **Kategori: Pemilih Tamu**), lalu jalankan ulang migrasi `20261010` supaya pengaman anti data ganda aktif.
- **`function public.deactivate_room(p_device_token, p_pin) does not exist` / tombol Keluar Mode Bilik menampilkan pesan *Gagal memverifikasi PIN ke server*** — Migrasi `20261011_room_exit_pin_lock.sql` belum dijalankan. Jalankan file tersebut di SQL Editor, tunggu ±10 detik (cache skema PostgREST), lalu coba lagi.
- **Pesan `PIN bilik 6 digit wajib diisi untuk keluar dari Mode Bilik`** — Halaman terminal bilik masih memuat cache `js/room.js` versi lama (belum ada form PIN). Lakukan **hard refresh** (`Ctrl + F5`) pada komputer bilik lalu ulangi.
- **Lupa PIN bilik sehingga tidak bisa keluar dari Mode Bilik** — PIN tidak pernah disimpan dalam bentuk teks (hanya hash SHA-256), jadi tidak dapat dibaca dari database. Solusinya: di `admin.html` tab **🖥️ Mode Bilik Voting**, hapus bilik tersebut (**Hapus Bilik**) lalu buat ulang dengan **ID Bilik yang sama** dan PIN baru (tombol 🎲 untuk acak), kemudian aktivasi ulang terminal memakai PIN baru tersebut.

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
7. **Kode Rahasia untuk Pemilih Belum/Tidak Terdaftar (Pemilih Tamu — Input Data Manual).** Bila NIS pemilih tidak ditemukan di basis data, panitia dapat meminta pemilih mengetikkan **kode rahasia** (default **`2513`**) pada kolom *Masukkan NIS 4 Digit*. Sistem menampilkan **form data pemilih tamu** dengan isian:
   - **Nama Lengkap** (wajib, minimal 3 karakter),
   - **Tipe Pemilih**: `Siswa (memakai kelas)`, `Guru / Staff Sekolah`, atau `Tamu / Umum` (mengisi keterangan secara otomatis, tetap dapat diubah),
   - **Kelas / Keterangan** (mis. `8C`, `GURU / STAFF`, `UMUM`).

   Setelah data diisi, pemilih memilih kandidat seperti biasa. Datanya tercatat sebagai **kategori `TAMU`** (`nis` NULL, `kelas` berprefiks `TAMU - `) sehingga **terpisah** dari siswa terdaftar dan **tidak** mengubah rekap per kelas siswa; pilihan suara tetap **anonim** di tabel `ballots`. Cek hasilnya di `admin.html`:
   - Tab **📊 Dashboard** → kartu **Pemilih Tamu** + tabel **Rekap Pemilih Tamu (Kategori TAMU)**.
   - Tab **👥 Kelola & Impor Siswa** → filter **Kategori: Pemilih Tamu (Manual)** untuk melihat/ menghapus daftar nama pemilih tamu, atau tombol **🗑️ Hapus Semua Pemilih Tamu**.

   Kode dapat diubah pada `GUEST_VOTE_CODE` di `js/config.js` **dan harus sama** dengan `v_secret_code` di dalam fungsi `submit_vote_guest` pada file migrasi **terbaru** (`supabase/migrations/20261010_guest_code_2513_and_room_autorefresh.sql`); validasi dilakukan di sisi server. Satu pemilih tamu (nama + kelas/keterangan sama) hanya dapat memberikan suara **1 kali**.

### 3. Mengaktifkan Komputer Bilik Voting (Metode B)
1. Di setiap komputer bilik, buka URL `/voting-room.html`.
2. Masukkan ID Bilik dan PIN 6 Digit awal:
   - `BILIK-01` → PIN: `583214`
   - `BILIK-02` → PIN: `741926`
   - `BILIK-03` → PIN: `315807`
   - `BILIK-04` → PIN: `862451`
3. Tekan **Aktifkan Bilik Ini**. Komputer bilik akan menampilkan status `BILIK-01 | SIAP | Menunggu penugasan siswa...`. Pada status bar tersedia badge **`⟳ jam`** — ini adalah **waktu sinkronisasi terakhir**; klik badge tersebut untuk **sinkron manual** bila diperlukan.
4. Untuk **mengakhiri Mode Bilik** pada satu perangkat (mis. ganti komputer / komputer dipindah fungsi), tekan tombol **🔓 Keluar Mode Bilik** pada status bar terminal. Muncul **konfirmasi berisi kolom PIN** — masukkan **PIN 6 digit bilik tersebut** (PIN yang sama seperti saat aktivasi). PIN diverifikasi **oleh server**, bukan hanya oleh browser: bila PIN salah, bilik **tidak** dikeluarkan, terminal tetap siap menerima penugasan siswa, dan aksi ini tidak bisa dipakai siswa secara bebas. Bila PIN benar, bilik akan dinonaktifkan (`OFFLINE`), token perangkat dihapus, dan perangkat wajib diaktivasi ulang memakai PIN. Setiap percobaan keluar dengan PIN salah tercatat pada `audit_logs` (`ROOM_EXIT_REJECTED`) sehingga bisa diperiksa panitia.

### 4. Menugaskan Siswa Tanpa ID Card (Mode Bilik)
1. Panitia di meja pendaftaran membuka `admin.html` tab **🖥️ Mode Bilik Voting**.
2. Pilih kelas siswa atau cari berdasarkan nama/NIS.
3. Klik tombol **Tugaskan Ke Bilik**, pilih bilik `BILIK-01` (READY), lalu klik **[ TUGASKAN KE BILIK ]**.
4. Komputer `BILIK-01` berganti sendiri ke layar *Selamat Datang [Nama Siswa]* — lewat **Supabase Realtime** sekaligus **auto-refresh berkala** (bawaan tiap 3 detik, diatur pada `ROOM_POLL_INTERVAL_MS` di `js/config.js`), sehingga layar bilik **tidak perlu di-refresh manual**. Siswa memilih kandidat di bilik tanpa perlu input data apapun.

---

## 🔒 Privasi & Keamanan (Security Matrix)

1. **Pemisahan Identitas & Suara (Strict Anonymity):**
   Tabel `ballots` hanya menyimpan `candidate_id` dan `created_at`. Tidak ada kolom `student_id` maupun NIS pada tabel suara. Panitia hanya dapat mengetahui siswa mana yang `SUDAH VOTING`, tetapi **tidak bisa** mengetahui kandidat mana yang dipilih oleh siswa tersebut.
2. **Atomic Voting Procedure (Concurrency Protection):**
   Fungsi database `submit_vote_qr` dan `submit_vote_room` menggunakan perintah `FOR UPDATE` (row lock) dan transaksi atomik. Jika ada 2 request bersamaan untuk 1 NIS yang sama, request pertama akan `SUCCESS` dan request kedua otomatis `REJECTED`. Alur pemilih tamu (`submit_vote_guest`) memakai `pg_advisory_xact_lock` + `FOR UPDATE` + **unique index nama & kelas**, sehingga nama yang sama **tidak pernah** menghasilkan dua baris data identitas maupun dua surat suara.
3. **Pemberhentian Akses Hasil untuk Siswa:**
   Row Level Security (RLS) melarang role anonim/siswa melakukan query pada tabel `ballots` atau agregat kandidat. Hasil suara kandidat hanya tersedia untuk admin terotentikasi. Sejak migrasi `20261010`, policy SELECT tabel `ballots` dibatasi hanya untuk peran `authenticated` (admin yang sudah login), sehingga penghitungan suara mentah tidak dapat dibaca/dihitung sendiri dari perangkat siswa — baik melalui REST API maupun kanal Realtime.
4. **Kode Rahasia Pemilih Tamu (Input Data Manual):**
   RPC `submit_vote_guest` memvalidasi kode rahasia **di sisi server** (bukan hanya di klien), sehingga hanya pemegang kode yang dapat memicu pencatatan pemilih tamu. Berbeda dari alur QR/NIS, pemilih tamu **mengisi data sendiri secara manual** (nama, tipe, kelas/keterangan). Data identitas tersebut disimpan pada tabel `students` dengan **kategori `TAMU`** (`nis` NULL, `kelas` berprefiks `TAMU - `) sehingga terpisah dari data siswa terdaftar, sementara **pilihan suara tetap anonim** pada tabel `ballots` (tanpa `student_id`) dan `audit_logs` **tidak** mencatat nama pemilih — jadi panitia bisa tahu *siapa saja* yang masuk kategori tamu, tetapi **tidak bisa** menghubungkan nama tersebut dengan kandidat yang dipilih. Satu pemilih tamu dengan nama & kelas/keterangan yang sama hanya dapat voting **1 kali** (validasi + row lock `pg_advisory_xact_lock`). Karena satu kode dapat dipakai berkali-kali oleh pemilih berbeda, **panitia wajib menjaga kerahasiaan kode ini**; seluruh suara tamu tetap terhapus oleh Reset Suara/Reset Total, dan daftar pemilih tamu dapat dihapus dari tab **Kelola & Impor Siswa**.
5. **Auto Refresh Tanpa Refresh Manual (Realtime + Polling Cadangan):**
   Penugasan siswa pada Mode Bilik dikirim melalui **Supabase Realtime** (`voting_rooms`, `voting_sessions`) dan diperkuat **polling cadangan tiap 3 detik** pada setiap terminal bilik, sedangkan Dashboard Admin menyegarkan dirinya **tiap 5 detik** saat tab Dashboard aktif. Kedua kanal tersebut hanya membaca **status penugasan dan angka agregat**, tidak pernah membawa identitas pemilih beserta pilihan suaranya.

6. **Keluar Mode Bilik Dikunci PIN Bilik (Anti-Sabotase Terminal):**
   Mengeluarkan bilik dari terminal (`room -> OFFLINE` + token perangkat dicabut) berdampak besar pada jalannya pemilihan, sehingga sejak migrasi `20261011` aksi **🔓 Keluar Mode Bilik** mewajibkan **PIN 6 digit bilik tersebut** yang diverifikasi **di sisi server** (`deactivate_room(p_device_token, p_pin)` memakai hash SHA-256 terhadap `voting_rooms.pin_hash`). Siapa pun yang memegang komputer bilik tanpa PIN **tidak dapat** mengeluarkan bilik: terminal tetap siap menerima penugasan siswa, PIN salah hanya memunculkan pesan kesalahan, dan setiap percobaan gagal dicatat ke `audit_logs` (`ROOM_EXIT_REJECTED`). Bila server tidak dapat dihubungi, kredensial bilik **tidak dihapus** supaya bilik tidak bisa "keluar" hanya dengan memutus koneksi internet.

---

## 📄 Lisensi
Hak Cipta &copy; 2026 **OSIS Candra Kirana SPENASIX Divisi 9**. Hak cipta dilindungi undang-undang.
