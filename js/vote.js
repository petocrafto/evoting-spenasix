/**
 * QR & Direct NIS Voting Page Logic
 * OSIS Candra Kirana SPENASIX Divisi 9
 */

let currentStudent = null;
let activeCandidates = [];
let selectedCandidateId = null;
let isSubmitting = false;
let successResetTimer = null;

let html5QrCode = null;
let cameraDevices = null;
let currentCameraId = null;

document.addEventListener('DOMContentLoaded', () => {
    initVotePage();
});

/**
 * Sinkronkan indikator tahapan voting (1 Verifikasi -> 2 Pilih Kandidat -> 3 Selesai)
 * @param {number} activeStep Langkah yang sedang aktif (1-3)
 */
function updateVoteStep(activeStep) {
    for (let step = 1; step <= 3; step++) {
        const el = document.getElementById('voteStep' + step);
        if (!el) continue;
        el.classList.toggle('is-active', step === activeStep);
        el.classList.toggle('is-done', step < activeStep);
    }
}

/**
 * Perbarui teks petunjuk di bawah area kamera scanner.
 */
function setScannerHint(message, isError = false) {
    const hint = document.getElementById('scannerHint');
    if (!hint) return;
    hint.textContent = message;
    hint.classList.toggle('is-error', !!isError);
}

async function initVotePage() {
    updateVoteStep(1);

    const urlParams = new URLSearchParams(window.location.search);
    const nisParam = urlParams.get('nis');

    if (nisParam) {
        document.getElementById('nisInput').value = nisParam;
        await handleVerifyNis(nisParam);
    } else {
        showNisInputStep();
    }
}

function toggleCameraScanner() {
    const container = document.getElementById('qrCameraScannerContainer');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        startQrScanner();
    } else {
        container.style.display = 'none';
        stopQrScanner();
    }
}

async function startQrScanner() {
    if (typeof Html5Qrcode === 'undefined') {
        showToast('Library scanner kamera sedang dimuat...', 'info');
        return;
    }

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    // Hindari error "already scanning" bila kamera dinyalakan ulang
    await stopQrScanner(true);

    // Deteksi & isi daftar kamera (termasuk kamera depan webcam PC All-in-One)
    await loadCameraDevices();

    const select = document.getElementById('cameraDeviceSelect');
    const chosenId = (select && select.value) || currentCameraId;
    const chosenDevice = (cameraDevices || []).find(c => c.id === chosenId);
    const scanConfig = buildScanConfig(chosenDevice ? chosenDevice.label : '');

    // Utamakan kamera yang dipilih; jika tidak ada, fallback ke kamera belakang
    const cameraConfig = chosenId
        ? { deviceId: { exact: chosenId } }
        : { facingMode: 'environment' };

    try {
        await html5QrCode.start(cameraConfig, scanConfig, onQrScanSuccess, onQrScanError);
        setScannerHint('📷 Arahkan kamera ke QR Code pada ID Card siswa', false);
    } catch (err) {
        console.warn('Gagal membuka kamera terpilih, mencoba kamera alternatif...', err);
        // Fallback: kamera depan (facingMode user) — umum pada webcam PC All-in-One / laptop
        try {
            await html5QrCode.start({ facingMode: 'user' }, buildScanConfig('front'), onQrScanSuccess, onQrScanError);
            setScannerHint('📷 Arahkan kamera ke QR Code pada ID Card siswa', false);
        } catch (err2) {
            console.error('Camera access error:', err2);
            setScannerHint('⚠️ Kamera tidak dapat diakses. Pilih kamera lain atau gunakan input NIS manual.', true);
            showToast('Gagal mengakses kamera. Izinkan akses kamera pada browser Anda.', 'error');
        }
    }
}

/**
 * Bangun konfigurasi pemindaian kamera.
 * Kamera depan menghasilkan gambar bercermin (mirror), sehingga flip harus dibiarkan
 * aktif (disableFlip: false) agar QR Code tetap terbaca. Untuk kamera belakang HP,
 * flip dimatikan demi menghemat beban CPU.
 * @param {string} deviceLabel Label perangkat kamera aktif.
 */
function buildScanConfig(deviceLabel) {
    const isFront = /front|user|depan|webcam|integrated|facetime|aio/i.test(deviceLabel || '');
    return {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        disableFlip: !isFront,
        // Gunakan BarcodeDetector bawaan browser bila tersedia (jauh lebih hemat daya)
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
}

/**
 * Ambil daftar kamera (video input) yang tersedia dan isi dropdown pemilih kamera.
 * Memanggil Html5Qrcode.getCameras() akan memicu izin kamera bila belum diberikan.
 * @param {boolean} forceRefresh Paksa deteksi ulang (mis. tombol Refresh)
 */
async function loadCameraDevices(forceRefresh = false) {
    const select = document.getElementById('cameraDeviceSelect');
    if (typeof Html5Qrcode === 'undefined') return;

    // Pakai cache bila sudah tersedia dan tidak dipaksa refresh
    if (cameraDevices && cameraDevices.length && !forceRefresh) return;

    try {
        cameraDevices = await Html5Qrcode.getCameras();
    } catch (err) {
        console.error('Gagal mendeteksi kamera:', err);
        if (select) select.innerHTML = '<option value="">Kamera tidak tersedia / izin ditolak</option>';
        return;
    }

    if (!select) return;
    select.innerHTML = '';

    if (!cameraDevices || cameraDevices.length === 0) {
        select.innerHTML = '<option value="">Kamera tidak ditemukan</option>';
        return;
    }

    cameraDevices.forEach((cam, idx) => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.label || `Kamera ${idx + 1}`;
        select.appendChild(opt);
    });

    // Prioritas: kamera depan (webcam PC AIO / laptop), ciri labelnya "front"/"user"/"integrated"
    const preferred = cameraDevices.find(c =>
        /front|user|depan|webcam|integrated|facetime|aio/i.test(c.label || '')
    );
    currentCameraId = preferred ? preferred.id : cameraDevices[0].id;
    select.value = currentCameraId;
}

/**
 * Ganti kamera aktif secara manual dari dropdown tanpa reload halaman.
 */
async function onCameraDeviceChange() {
    const select = document.getElementById('cameraDeviceSelect');
    currentCameraId = select ? select.value : null;
    await stopQrScanner(true);
    const container = document.getElementById('qrCameraScannerContainer');
    if (container && container.style.display !== 'none') {
        startQrScanner();
    }
}

/** Callback ketika QR Code berhasil terbaca. */
async function onQrScanSuccess(decodedText) {
    // Extracted raw QR code text or URL
    console.log('Scanned QR:', decodedText);

    // Extract 4-digit NIS from raw text or URL parameter ?nis=1234
    let nis = null;
    if (/^\d{4}$/.test(decodedText.trim())) {
        nis = decodedText.trim();
    } else {
        const match = decodedText.match(/nis=(\d{4})/i);
        if (match) nis = match[1];
    }

    if (nis) {
        await stopQrScanner(true);
        document.getElementById('qrCameraScannerContainer').style.display = 'none';
        document.getElementById('nisInput').value = nis;
        showToast(`QR ID Card Terdeteksi: NIS ${nis}`, 'success');
        await handleVerifyNis(nis);
    } else {
        showToast('QR Code tidak berisi 4-digit NIS valid.', 'warning');
    }
}

/** Callback error saat proses scan (diabaikan karena percobaan baca terus berjalan). */
function onQrScanError(errorMessage) {
    // Silent scanning attempts
}

/**
 * Hentikan pemindaian kamera.
 * @param {boolean} awaitStop Bila true, tunggu proses berhenti selesai (aman sebelum start ulang).
 */
async function stopQrScanner(awaitStop = false) {
    if (!html5QrCode || !html5QrCode.isScanning) return;

    const stopPromise = html5QrCode.stop().catch(err => console.error(err));
    if (awaitStop) {
        await stopPromise;
    }
}

function showNisInputStep() {
    document.getElementById('stepNisInput').style.display = 'block';
    document.getElementById('stepGuestData').style.display = 'none';
    document.getElementById('stepCandidateSelect').style.display = 'none';
    document.getElementById('stepSuccess').style.display = 'none';

    updateVoteStep(1);

    // Auto start camera scanner by default
    setTimeout(() => {
        startQrScanner();
    }, 300);
}

async function submitNisForm(event) {
    if (event) event.preventDefault();
    const nis = document.getElementById('nisInput').value.trim();
    if (!nis || nis.length !== 4 || !/^\d{4}$/.test(nis)) {
        showToast('NIS harus tepat 4 digit angka.', 'error');
        return;
    }
    stopQrScanner();
    await handleVerifyNis(nis);
}

async function handleVerifyNis(nis) {
    stopQrScanner();
    const btn = document.getElementById('btnVerifyNis');
    if (btn) btn.disabled = true;

    try {
        const client = getSupabaseClient();
        if (!client) {
            showToast('Koneksi Supabase belum dikonfigurasi.', 'error');
            return;
        }

        // 1. Check Election Settings Status
        const { data: election, error: electionErr } = await client
            .from('election_settings')
            .select('status')
            .single();

        if (electionErr || !election) {
            showToast('Gagal memuat status pemilihan.', 'error');
            return;
        }

        if (election.status === 'DRAFT') {
            showToast('Voting belum dibuka oleh panitia.', 'warning');
            showNisError('Voting belum dibuka.');
            return;
        }
        if (election.status === 'CLOSED') {
            showToast('Voting telah ditutup.', 'warning');
            showNisError('Voting telah ditutup.');
            return;
        }

        // 2. Fetch Student Data by NIS
        const { data: student, error: studentErr } = await client
            .from('students')
            .select('*')
            .eq('nis', nis)
            .single();

        if (studentErr || !student) {
            // Kode rahasia panitia: pemilih yang belum/tidak terdaftar diarahkan ke
            // form pengisian data MANUAL (nama, tipe, kelas) sebagai "Pemilih Tamu".
            if (nis === getGuestVoteCode()) {
                openGuestDataStep();
                return;
            }

            showToast('Data siswa tidak ditemukan. Silakan hubungi panitia.', 'error');
            showNisError('Data siswa tidak ditemukan.');
            return;
        }

        // 3. Validate Voting Status
        if (student.has_voted || student.voting_status === 'VOTED') {
            showToast('Suara untuk siswa ini sudah tercatat.', 'warning');
            showNisError('Suara untuk siswa ini sudah tercatat.');
            return;
        }

        currentStudent = student;

        // Render Student Info
        document.getElementById('displayStudentName').textContent = student.nama;
        document.getElementById('displayStudentKelas').textContent = student.kelas;
        document.getElementById('displayStudentNis').textContent = student.nis;

        // Load Active Candidates
        await loadCandidates();

        document.getElementById('stepNisInput').style.display = 'none';
        document.getElementById('stepCandidateSelect').style.display = 'block';

        updateVoteStep(2);

    } catch (err) {
        console.error('Error verifying NIS:', err);
        showToast('Terjadi kesalahan saat memverifikasi NIS.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function showNisError(msg) {
    const errorEl = document.getElementById('nisErrorMessage');
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
}

/**
 * Ambil kode rahasia panitia dari konfigurasi.
 * @returns {string} Kode rahasia (fallback '0000').
 */
function getGuestVoteCode() {
    return (typeof CONFIG !== 'undefined' && CONFIG.GUEST_VOTE_CODE)
        ? String(CONFIG.GUEST_VOTE_CODE).trim()
        : '0000';
}

/**
 * Aktifkan mode "Pemilih Tamu": tampilkan form pengisian data MANUAL
 * (nama, tipe pemilih, kelas/keterangan) bagi pemilih yang belum/tidak terdaftar.
 * Data identitas tercatat server-side dengan kategori 'TAMU', sedangkan pilihan
 * suara tetap anonim pada tabel ballots.
 */
function openGuestDataStep() {
    currentStudent = null;
    selectedCandidateId = null;

    const nisInput = document.getElementById('nisInput');
    if (nisInput) nisInput.value = '';

    resetGuestDataForm();
    onGuestTipeChange();

    document.getElementById('stepNisInput').style.display = 'none';
    document.getElementById('stepCandidateSelect').style.display = 'none';
    document.getElementById('stepSuccess').style.display = 'none';
    document.getElementById('stepGuestData').style.display = 'block';

    updateVoteStep(1);

    showToast('Mode Pemilih Tamu aktif. Lengkapi data pemilih.', 'info');

    const nameInput = document.getElementById('guestNameInput');
    if (nameInput) nameInput.focus();
}

/**
 * Keterangan bawaan (auto-fill) untuk tiap tipe pemilih tamu.
 * @param {string} tipe 'SISWA' | 'GURU' | 'TAMU'
 * @returns {string}
 */
function getDefaultGuestKelas(tipe) {
    if (tipe === 'GURU') return 'GURU / STAFF';
    if (tipe === 'SISWA') return '';
    return 'UMUM';
}

/**
 * Sinkronkan label, placeholder, dan nilai awal kolom kelas/keterangan
 * sesuai tipe pemilih yang dipilih.
 */
function onGuestTipeChange() {
    const select = document.getElementById('guestTipeSelect');
    const kelasInput = document.getElementById('guestKelasInput');
    const label = document.getElementById('guestKelasLabel');
    if (!select || !kelasInput) return;

    const tipe = select.value;
    const previousAuto = kelasInput.dataset.autoValue || '';

    if (label) {
        label.textContent = tipe === 'SISWA'
            ? 'Kelas Siswa'
            : (tipe === 'GURU' ? 'Keterangan Guru / Staff' : 'Keterangan Tamu');
    }

    kelasInput.placeholder = tipe === 'SISWA' ? 'Contoh: 8C' : 'Contoh: GURU / STAFF';

    // Isi otomatis hanya bila kolom masih kosong atau masih berisi nilai bawaan sebelumnya.
    if (!kelasInput.value.trim() || kelasInput.value.trim() === previousAuto) {
        const autoValue = getDefaultGuestKelas(tipe);
        kelasInput.value = autoValue;
        kelasInput.dataset.autoValue = autoValue;
    }
}

/** Tampilkan / bersihkan pesan error pada form data pemilih tamu. */
function showGuestDataError(msg) {
    const errorEl = document.getElementById('guestDataErrorMessage');
    if (!errorEl) return;
    errorEl.textContent = msg || '';
    errorEl.style.display = msg ? 'block' : 'none';
}

/** Bersihkan seluruh isian form data pemilih tamu. */
function resetGuestDataForm() {
    const nameInput = document.getElementById('guestNameInput');
    const kelasInput = document.getElementById('guestKelasInput');

    if (nameInput) nameInput.value = '';
    if (kelasInput) {
        kelasInput.value = '';
        delete kelasInput.dataset.autoValue;
    }

    showGuestDataError('');
}

/**
 * Validasi data manual pemilih tamu, lalu lanjut ke langkah pemilihan kandidat.
 * Data dikirim ke server saat konfirmasi suara (RPC submit_vote_guest).
 */
async function submitGuestDataForm(event) {
    if (event) event.preventDefault();

    const nameInput = document.getElementById('guestNameInput');
    const kelasInput = document.getElementById('guestKelasInput');
    const tipeSelect = document.getElementById('guestTipeSelect');

    const nama = (nameInput ? nameInput.value : '').trim();
    const tipe = tipeSelect ? tipeSelect.value : 'TAMU';
    const kelas = (kelasInput ? kelasInput.value : '').trim();

    if (nama.length < 3) {
        showGuestDataError('Nama lengkap minimal 3 karakter.');
        showToast('Nama pemilih tamu minimal 3 karakter.', 'error');
        return;
    }

    if (tipe === 'SISWA' && !kelas) {
        showGuestDataError('Kelas wajib diisi untuk tipe pemilih Siswa.');
        showToast('Kelas wajib diisi untuk tipe pemilih Siswa.', 'error');
        return;
    }

    showGuestDataError('');

    // Data manual pemilih tamu dicatat server-side dengan kategori 'TAMU'.
    currentStudent = {
        isGuest: true,
        nis: null,
        nama: nama,
        tipe: tipe,
        kelas: kelas
    };

    // Render info pemilih tamu pada banner verifikasi
    document.getElementById('displayStudentName').textContent = nama;
    document.getElementById('displayStudentKelas').textContent = ` (Tamu${kelas ? ' - ' + kelas : ''})`;
    document.getElementById('displayStudentNis').textContent = 'TAMU';

    // Muat kandidat aktif
    await loadCandidates();

    document.getElementById('stepGuestData').style.display = 'none';
    document.getElementById('stepCandidateSelect').style.display = 'block';

    updateVoteStep(2);
}

async function loadCandidates() {
    const client = getSupabaseClient();
    const { data: candidates, error } = await client
        .from('candidates')
        .select('*')
        .eq('active', true)
        .order('nomor_urut', { ascending: true });

    if (error || !candidates) {
        showToast('Gagal memuat data kandidat.', 'error');
        return;
    }

    activeCandidates = candidates;
    renderCandidatesGrid(candidates);
}

function renderCandidatesGrid(candidates) {
    const container = document.getElementById('candidateGridContainer');
    container.innerHTML = '';

    candidates.forEach(c => {
        const card = document.createElement('div');
        card.className = `candidate-card ${selectedCandidateId === c.id ? 'selected' : ''}`;
        card.id = `candidate-card-${c.id}`;

        const foto = c.foto_url || 'https://via.placeholder.com/400x300?text=Foto+Kandidat';
        
        let misiHtml = '';
        if (Array.isArray(c.misi) && c.misi.length > 0) {
            misiHtml = `<ul class="candidate-misi-list" id="misi-list-${c.id}">
                ${c.misi.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
            </ul>`;
        }

        card.innerHTML = `
            <div class="candidate-num-badge">${c.nomor_urut}</div>
            <div class="candidate-img-container">
                <img src="${escapeHtml(foto)}" alt="${escapeHtml(c.nama)}" class="candidate-img" loading="lazy" decoding="async" />
            </div>
            <div class="candidate-body">
                <h3 class="candidate-name">${escapeHtml(c.nama)}</h3>
                <p class="candidate-visi"><strong>Visi:</strong> ${escapeHtml(c.visi)}</p>
                ${c.misi && c.misi.length ? `<button type="button" class="candidate-misi-toggle" onclick="toggleMisi('${c.id}')">📋 Lihat Misi ▼</button>` : ''}
                ${misiHtml}
                <button type="button" class="btn btn-primary btn-block" style="margin-top:auto;" onclick="selectCandidate('${c.id}')">
                    Pilih Kandidat ${c.nomor_urut}
                </button>
            </div>
        `;

        container.appendChild(card);
    });
}

function toggleMisi(candidateId) {
    const list = document.getElementById(`misi-list-${candidateId}`);
    if (list) {
        list.classList.toggle('show');
    }
}

function selectCandidate(candidateId) {
    selectedCandidateId = candidateId;
    const candidate = activeCandidates.find(c => c.id === candidateId);
    if (!candidate) return;

    // Highlight selected card
    document.querySelectorAll('.candidate-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.getElementById(`candidate-card-${candidateId}`);
    if (selectedCard) selectedCard.classList.add('selected');

    // Populate Modal
    document.getElementById('confirmCandidateNum').textContent = `Kandidat 0${candidate.nomor_urut}`;
    document.getElementById('confirmCandidateName').textContent = candidate.nama;

    // Show Modal
    const modal = document.getElementById('confirmationModal');
    modal.classList.add('active');
}

function closeConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    modal.classList.remove('active');
}

async function confirmVoteSubmission() {
    if (isSubmitting || !currentStudent || !selectedCandidateId) return;

    isSubmitting = true;
    const confirmBtn = document.getElementById('btnConfirmVote');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        // Pemilih tamu memakai RPC khusus (validasi kode di server + data manual
        // nama/tipe/kelas), sedangkan siswa terdaftar memakai RPC QR/NIS biasa.
        const response = currentStudent.isGuest
            ? await callRpc('submit_vote_guest', {
                p_code: getGuestVoteCode(),
                p_candidate_id: selectedCandidateId,
                p_nama: currentStudent.nama,
                p_kelas: currentStudent.kelas,
                p_tipe: currentStudent.tipe
            })
            : await callRpc('submit_vote_qr', {
                p_nis: currentStudent.nis,
                p_candidate_id: selectedCandidateId
            });

        if (response && response.success) {
            closeConfirmationModal();
            showToast('Suara berhasil tercatat!', 'success');

            document.getElementById('stepCandidateSelect').style.display = 'none';
            document.getElementById('stepSuccess').style.display = 'block';

            updateVoteStep(3);

            // Kembali otomatis ke layar scan untuk pemilih berikutnya
            scheduleReturnToScanStep();
        } else {
            showToast(response.message || 'Gagal menyimpan suara.', 'error');
            closeConfirmationModal();
        }
    } catch (err) {
        console.error('Submit vote error:', err);
        showToast('Terjadi kesalahan saat memproses voting.', 'error');
        closeConfirmationModal();
    } finally {
        isSubmitting = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

/**
 * Jadwalkan kembali otomatis ke layar scan (Step 1) setelah suara tercatat,
 * sehingga bilik siap menerima pemilih berikutnya tanpa menyegarkan halaman.
 * Menampilkan hitung mundur pada elemen #successCountdownText.
 */
function scheduleReturnToScanStep() {
    if (successResetTimer) {
        clearInterval(successResetTimer);
        successResetTimer = null;
    }

    const delayMs = (typeof CONFIG !== 'undefined' && CONFIG.SCAN_RESET_DELAY_MS)
        ? CONFIG.SCAN_RESET_DELAY_MS
        : 5000;

    let secondsLeft = Math.round(delayMs / 1000);
    const counterEl = document.getElementById('successCountdownText');
    if (counterEl) counterEl.textContent = secondsLeft;

    successResetTimer = setInterval(() => {
        secondsLeft--;
        if (counterEl) counterEl.textContent = secondsLeft > 0 ? secondsLeft : 0;
        if (secondsLeft <= 0) {
            clearInterval(successResetTimer);
            successResetTimer = null;
            returnToScanStep();
        }
    }, 1000);
}

/**
 * Bersihkan state voting pemilih sebelumnya dan tampilkan kembali layar scan (Step 1).
 * Dipanggil otomatis lewat hitung mundur, atau manual dari tombol "Scan Siswa Berikutnya".
 */
function returnToScanStep() {
    if (successResetTimer) {
        clearInterval(successResetTimer);
        successResetTimer = null;
    }

    // Bersihkan state sesi pemilih sebelumnya
    currentStudent = null;
    selectedCandidateId = null;
    activeCandidates = [];

    // Bersihkan form data pemilih tamu (bila sebelumnya memakai kode rahasia)
    resetGuestDataForm();

    const grid = document.getElementById('candidateGridContainer');
    if (grid) grid.innerHTML = '';

    const guestPanel = document.getElementById('stepGuestData');
    if (guestPanel) guestPanel.style.display = 'none';

    const nisInput = document.getElementById('nisInput');
    if (nisInput) nisInput.value = '';

    const errorEl = document.getElementById('nisErrorMessage');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    const modal = document.getElementById('confirmationModal');
    if (modal) modal.classList.remove('active');

    // Tampilkan kembali container kamera (sempat disembunyikan saat QR terbaca)
    const scannerContainer = document.getElementById('qrCameraScannerContainer');
    if (scannerContainer) scannerContainer.style.display = 'block';

    // Hapus parameter ?nis= pada URL agar refresh tidak memicu verifikasi ulang
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('nis')) {
            url.searchParams.delete('nis');
            window.history.replaceState({}, '', url);
        }
    } catch (e) {
        /* Abaikan bila URL tidak dapat dimanipulasi */
    }

    // Kembali ke layar scan & nyalakan ulang kamera
    showNisInputStep();
}
