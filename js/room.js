/**
 * Mode Bilik Voting Terminal Logic
 * OSIS Candra Kirana SPENASIX Divisi 9
 */

let roomCode = localStorage.getItem('evoting_room_code') || null;
let deviceToken = localStorage.getItem('evoting_device_token') || null;

let activeSession = null;
let activeStudent = null;
let roomCandidates = [];
let roomSelectedCandidateId = null;
let realtimeChannel = null;
let sessionTimerInterval = null;
let isRoomSubmitting = false;
// Kunci "Keluar Mode Bilik": true selagi RPC verifikasi PIN diproses
// (mencegah klik ganda / dua request keluar sekaligus).
let isRoomExiting = false;

// --- Auto Refresh Penugasan (kanal cadangan selain Supabase Realtime) ---
let roomPollInterval = null;
let isRoomSyncInFlight = false;
// ID sesi yang sudah dinyatakan tidak valid (kadaluarsa/dibatalkan) agar tidak
// dihidupkan ulang berulang kali oleh auto-refresh.
let ignoredSessionId = null;
// Timer hitung mundur auto-reset layar sukses.
let roomResetTimer = null;
// Fase layar terminal: 'STANDBY' | 'VOTING' | 'SUCCESS'
let roomPhase = 'STANDBY';

document.addEventListener('DOMContentLoaded', () => {
    initRoomTerminal();
});

async function initRoomTerminal() {
    if (roomCode && deviceToken) {
        await verifyAndSetupRoom();
    } else {
        showActivationScreen();
    }
}

function showActivationScreen() {
    document.getElementById('roomActivationCard').style.display = 'block';
    document.getElementById('roomTerminalCard').style.display = 'none';
}

async function submitRoomActivation(event) {
    if (event) event.preventDefault();

    const codeInput = document.getElementById('activationRoomCode').value.trim().toUpperCase();
    const pinInput = document.getElementById('activationPin').value.trim();

    if (!codeInput) {
        showToast('Masukkan ID Bilik (contoh: BILIK-01).', 'error');
        return;
    }
    if (!pinInput || pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
        showToast('PIN harus 6 digit angka.', 'error');
        return;
    }

    const btn = document.getElementById('btnActivateRoom');
    if (btn) btn.disabled = true;

    try {
        const response = await callRpc('activate_room', {
            p_room_code: codeInput,
            p_pin: pinInput
        });

        if (response && response.success) {
            roomCode = response.room_code;
            deviceToken = response.device_token;

            // Securely store token (NEVER STORE RAW PIN)
            localStorage.setItem('evoting_room_code', roomCode);
            localStorage.setItem('evoting_device_token', deviceToken);

            showToast(`Bilik ${roomCode} berhasil diaktifkan!`, 'success');
            await verifyAndSetupRoom();
        } else {
            showToast(response.message || 'Gagal mengaktifkan bilik.', 'error');
        }
    } catch (err) {
        console.error('Activation error:', err);
        showToast('Terjadi kesalahan saat aktivasi bilik.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function verifyAndSetupRoom() {
    const client = getSupabaseClient();
    if (!client) return;

    // Validate room status from backend
    const { data: room, error } = await client
        .from('voting_rooms')
        .select('*')
        .eq('room_code', roomCode)
        .eq('device_token', deviceToken)
        .single();

    if (error || !room) {
        console.warn('Room device token invalid or revoked.');
        teardownRoomRealtime();
        clearRoomCredentials();
        showActivationScreen();
        showToast('Kredensial bilik tidak valid atau telah di-reset.', 'error');
        return;
    }

    // UI Setup
    document.getElementById('roomActivationCard').style.display = 'none';
    document.getElementById('roomTerminalCard').style.display = 'block';
    document.getElementById('displayRoomCode').textContent = room.room_code;

    // Load active candidates once
    await loadRoomCandidates();

    // Check for existing active assignment
    await checkCurrentRoomAssignment(room);

    // Subscribe to Supabase Realtime for instant assignment updates
    setupRoomRealtimeSubscription();

    // Kanal cadangan (auto-refresh): polling ringan ke server agar penugasan
    // siswa baru tetap tampil walau Realtime tidak aktif / koneksi WebSocket
    // sempat terputus, sehingga TIDAK perlu refresh manual lagi.
    startRoomAutoSync();
    await syncRoomStateFromServer();
}

function clearRoomCredentials() {
    localStorage.removeItem('evoting_room_code');
    localStorage.removeItem('evoting_device_token');
    roomCode = null;
    deviceToken = null;
}

/**
 * Stop the realtime subscription and clear the in-memory session state.
 * Used both when leaving Mode Bilik and when the credential is revoked.
 */
function teardownRoomRealtime() {
    stopRoomAutoSync();
    clearRoomResetCountdown();

    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
    }

    if (realtimeChannel) {
        const client = getSupabaseClient();
        if (client) client.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    activeSession = null;
    activeStudent = null;
    roomSelectedCandidateId = null;
    isRoomSubmitting = false;
    ignoredSessionId = null;
    roomPhase = 'STANDBY';
    updateRoomSyncBadge('⟳ Menghubungkan...', false);
}

/**
 * "Keluar Mode Bilik" action — TOMBOL INI HANYA MEMBUKA FORM PIN.
 *
 * Keluar Mode Bilik mengubah bilik menjadi OFFLINE dan mencabut token perangkat
 * (perangkat harus diaktivasi ulang dengan PIN), jadi aksi ini dikunci:
 * hanya panitia yang mengetahui PIN 6 digit bilik ini yang boleh melanjutkan.
 * Verifikasi PIN dilakukan di sisi SERVER (RPC deactivate_room).
 */
function exitRoomMode() {
    if (!roomCode || !deviceToken) {
        showActivationScreen();
        return;
    }

    const labelEl = document.getElementById('roomExitRoomLabel');
    if (labelEl) labelEl.textContent = roomCode;

    resetRoomExitForm();

    const modal = document.getElementById('roomExitModal');
    if (modal) modal.classList.add('active');

    const pinField = document.getElementById('roomExitPin');
    if (pinField) setTimeout(() => pinField.focus(), 60);
}

/** Bersihkan form PIN keluar dari sisa percobaan sebelumnya. */
function resetRoomExitForm() {
    const pinField = document.getElementById('roomExitPin');
    if (pinField) {
        pinField.value = '';
        pinField.classList.remove('is-invalid', 'pin-shake');
    }

    const errorEl = document.getElementById('roomExitError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

function closeRoomExitModal() {
    resetRoomExitForm();

    const modal = document.getElementById('roomExitModal');
    if (modal) modal.classList.remove('active');
}

/** Tampilkan pesan kesalahan PIN di dalam modal keluar (tanpa alert browser). */
function showRoomExitError(message) {
    const errorEl = document.getElementById('roomExitError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    const pinField = document.getElementById('roomExitPin');
    if (pinField) {
        pinField.classList.add('is-invalid');
        void pinField.offsetWidth;
        pinField.classList.add('pin-shake');
        pinField.focus();
        pinField.select();
    }
}

/**
 * Konfirmasi keluar dari Mode Bilik.
 * PIN 6 digit dikirim ke SERVER dan dicocokkan dengan hash PIN bilik ini.
 * Bila PIN salah / server tidak terjangkau, bilik TIDAK dikeluarkan dan modal
 * tetap terbuka (tidak ada kredensial yang dihapus), sehingga tombol ini tidak
 * bisa dipakai untuk keluar secara bebas.
 */
async function confirmRoomExit(event) {
    if (event) event.preventDefault();
    if (isRoomExiting) return;

    const pinField = document.getElementById('roomExitPin');
    const pin = pinField ? pinField.value.trim() : '';

    if (!/^\d{6}$/.test(pin)) {
        showRoomExitError('PIN bilik harus 6 digit angka.');
        showToast('PIN bilik harus 6 digit angka.', 'error');
        return;
    }

    if (!roomCode || !deviceToken) {
        closeRoomExitModal();
        showActivationScreen();
        return;
    }

    isRoomExiting = true;
    const btn = document.getElementById('btnConfirmRoomExit');
    if (btn) btn.disabled = true;

    let bolehKeluar = false;

    try {
        const response = await callRpc('deactivate_room', {
            p_device_token: deviceToken,
            p_pin: pin
        });

        if (response && response.success) {
            bolehKeluar = true;
            showToast(response.message || 'Mode bilik berhasil dikeluarkan.', 'info');
        } else {
            const pesan = (response && response.message)
                || 'PIN bilik salah. Keluar Mode Bilik dibatalkan.';
            showRoomExitError(pesan);
            showToast(pesan, 'error');
        }
    } catch (err) {
        // Gagal menghubungi server: JANGAN hapus kredensial lokal, supaya bilik
        // tidak bisa "keluar" hanya dengan memutus koneksi internet.
        console.error('Exit room mode error:', err);
        const pesan = 'Gagal memverifikasi PIN ke server. Periksa koneksi internet lalu coba lagi.';
        showRoomExitError(pesan);
        showToast(pesan, 'error');
    } finally {
        isRoomExiting = false;
        if (btn) btn.disabled = false;
    }

    // PIN tidak disimpan di memori/kolom input setelah dipakai
    if (pinField) pinField.value = '';

    if (!bolehKeluar) return;

    closeRoomExitModal();
    teardownRoomRealtime();
    clearRoomCredentials();
    showActivationScreen();
}


function resetRoomStateToStandby() {
    clearRoomResetCountdown();

    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
    }

    activeSession = null;
    activeStudent = null;
    roomSelectedCandidateId = null;
    roomPhase = 'STANDBY';

    document.getElementById('roomIndicatorDot').className = 'indicator-dot ready';
    document.getElementById('displayRoomStatusText').textContent = 'SIAP';

    document.getElementById('roomStandbyScreen').style.display = 'block';
    document.getElementById('roomVotingScreen').style.display = 'none';
    document.getElementById('roomSuccessScreen').style.display = 'none';
}

async function loadRoomCandidates() {
    const client = getSupabaseClient();
    const { data: candidates } = await client
        .from('candidates')
        .select('*')
        .eq('active', true)
        .order('nomor_urut', { ascending: true });

    roomCandidates = candidates || [];
}

async function checkCurrentRoomAssignment(roomData) {
    if (roomData && roomData.current_session_id) {
        const started = await fetchAndStartSession(roomData.current_session_id);
        if (!started) {
            // Sesi yang tersimpan pada bilik sudah tidak valid (kadaluarsa/dibatalkan).
            ignoredSessionId = roomData.current_session_id;
        }
    } else {
        resetRoomStateToStandby();
    }
}

/**
 * Ambil detail sesi voting terbaru dari server lalu tampilkan layar voting siswa.
 * @param {string} sessionId ID sesi pada tabel voting_sessions
 * @returns {Promise<boolean>} true bila sesi valid dan layar voting ditampilkan
 */
async function fetchAndStartSession(sessionId) {
    const client = getSupabaseClient();
    if (!client || !sessionId) return false;

    const { data: session, error } = await client
        .from('voting_sessions')
        .select('*, students(*)')
        .eq('id', sessionId)
        .single();

    if (error || !session || session.status !== 'ACTIVE') {
        resetRoomStateToStandby();
        return false;
    }

    // Penugasan baru mengalahkan hitung mundur auto-reset layar sukses
    clearRoomResetCountdown();

    activeSession = session;
    activeStudent = session.students;

    // Render Student Welcome & Candidate Selection Screen
    renderStudentVotingInterface();
    return true;
}

function renderStudentVotingInterface() {
    if (!activeStudent || !activeSession) return;

    roomPhase = 'VOTING';

    document.getElementById('roomIndicatorDot').className = 'indicator-dot voting';
    document.getElementById('displayRoomStatusText').textContent = 'SEDANG VOTING';

    document.getElementById('displayWelcomeStudentName').textContent = activeStudent.nama;
    document.getElementById('displayWelcomeStudentKelas').textContent = activeStudent.kelas;

    // Start Session Countdown Timer
    startSessionTimer(new Date(activeSession.expires_at));

    // Render Candidate Grid
    renderRoomCandidateGrid();

    document.getElementById('roomStandbyScreen').style.display = 'none';
    document.getElementById('roomVotingScreen').style.display = 'block';
    document.getElementById('roomSuccessScreen').style.display = 'none';
}

function startSessionTimer(expiryDate) {
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);

    const timerEl = document.getElementById('sessionCountdownText');

    sessionTimerInterval = setInterval(() => {
        const now = new Date();
        const diffMs = expiryDate - now;

        if (diffMs <= 0) {
            clearInterval(sessionTimerInterval);
            sessionTimerInterval = null;
            showToast('Sesi voting telah berakhir (timeout).', 'warning');
            // Tandai sesi ini agar tidak dihidupkan ulang oleh auto-refresh
            ignoredSessionId = activeSession ? activeSession.id : null;
            resetRoomStateToStandby();
            return;
        }

        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }, 1000);
}

function renderRoomCandidateGrid() {
    const container = document.getElementById('roomCandidateGrid');
    container.innerHTML = '';

    roomCandidates.forEach(c => {
        const card = document.createElement('div');
        card.className = `candidate-card ${roomSelectedCandidateId === c.id ? 'selected' : ''}`;
        card.id = `room-candidate-card-${c.id}`;

        const foto = c.foto_url || 'https://via.placeholder.com/400x300?text=Foto+Kandidat';

        card.innerHTML = `
            <div class="candidate-num-badge">${c.nomor_urut}</div>
            <div class="candidate-img-container">
                <img src="${escapeHtml(foto)}" alt="${escapeHtml(c.nama)}" class="candidate-img" />
            </div>
            <div class="candidate-body">
                <h3 class="candidate-name">${escapeHtml(c.nama)}</h3>
                <p class="candidate-visi"><strong>Visi:</strong> ${escapeHtml(c.visi)}</p>
                <button type="button" class="btn btn-primary btn-block" style="margin-top:auto;" onclick="selectRoomCandidate('${c.id}')">
                    Pilih Kandidat ${c.nomor_urut}
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function selectRoomCandidate(candidateId) {
    roomSelectedCandidateId = candidateId;
    const candidate = roomCandidates.find(c => c.id === candidateId);
    if (!candidate) return;

    document.querySelectorAll('.candidate-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.getElementById(`room-candidate-card-${candidateId}`);
    if (selectedCard) selectedCard.classList.add('selected');

    // Populate Modal
    document.getElementById('roomConfirmCandidateNum').textContent = `Kandidat 0${candidate.nomor_urut}`;
    document.getElementById('roomConfirmCandidateName').textContent = candidate.nama;

    const modal = document.getElementById('roomConfirmationModal');
    modal.classList.add('active');
}

function closeRoomConfirmationModal() {
    const modal = document.getElementById('roomConfirmationModal');
    modal.classList.remove('active');
}

async function confirmRoomVoteSubmission() {
    if (isRoomSubmitting || !activeSession || !roomSelectedCandidateId || !deviceToken) return;

    isRoomSubmitting = true;
    const confirmBtn = document.getElementById('btnConfirmRoomVote');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        const response = await callRpc('submit_vote_room', {
            p_device_token: deviceToken,
            p_session_id: activeSession.id,
            p_candidate_id: roomSelectedCandidateId
        });

        if (response && response.success) {
            closeRoomConfirmationModal();
            showToast('Suara berhasil tercatat!', 'success');

            // Cegah submit ganda: pilihan dibersihkan & sesi lokal dikunci
            roomSelectedCandidateId = null;
            roomPhase = 'SUCCESS';

            document.getElementById('roomVotingScreen').style.display = 'none';
            document.getElementById('roomSuccessScreen').style.display = 'block';

            // Auto Reset ke layar STANDBY setelah sukses (delay dari CONFIG)
            clearRoomResetCountdown();

            let countdownSeconds = Math.max(1, Math.round(getRoomResetDelayMs() / 1000));
            const resetCounterEl = document.getElementById('autoResetCountdownText');
            if (resetCounterEl) resetCounterEl.textContent = countdownSeconds;

            roomResetTimer = setInterval(() => {
                countdownSeconds--;
                if (resetCounterEl) resetCounterEl.textContent = countdownSeconds > 0 ? countdownSeconds : 0;
                if (countdownSeconds <= 0) {
                    clearRoomResetCountdown();
                    resetRoomStateToStandby();
                }
            }, 1000);

        } else {
            showToast(response.message || 'Gagal menyimpan suara.', 'error');
            closeRoomConfirmationModal();
        }
    } catch (err) {
        console.error('Room vote submission error:', err);
        showToast('Terjadi kesalahan saat memproses suara bilik.', 'error');
        closeRoomConfirmationModal();
    } finally {
        isRoomSubmitting = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

function setupRoomRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client || !roomCode) return;

    if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
    }

    realtimeChannel = client
        .channel(`room-channel-${roomCode}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'voting_rooms',
            filter: `room_code=eq.${roomCode}`
        }, async (payload) => {
            console.log('Realtime Room Event:', payload);
            const newRoom = payload.new;
            if (newRoom) {
                await handleRoomRowUpdate(newRoom);
            }
        })
        .subscribe();
}

/**
 * Terapkan perubahan baris `voting_rooms` (dari Supabase Realtime maupun dari
 * auto-refresh/polling) ke layar terminal bilik.
 * @param {{status?: string, current_session_id?: string|null}} roomRow
 */
async function handleRoomRowUpdate(roomRow) {
    if (!roomRow) return;

    const sessionId = roomRow.current_session_id || null;

    if (sessionId && sessionId !== ignoredSessionId && (!activeSession || activeSession.id !== sessionId)) {
        const started = await fetchAndStartSession(sessionId);
        if (!started) ignoredSessionId = sessionId;
        return;
    }

    if (!sessionId) {
        // Sesi sudah selesai/dibatalkan oleh server
        ignoredSessionId = null;
        // Layar sukses dibiarkan menyelesaikan hitung mundur auto-reset-nya
        if (roomPhase !== 'SUCCESS') {
            resetRoomStateToStandby();
        }
    }
}

/* ==========================================
   AUTO REFRESH TERMINAL BILIK
   ========================================== */

/**
 * Interval auto-refresh penugasan siswa (ms) dengan batas aman minimum 1000 ms.
 * @returns {number}
 */
function getRoomPollIntervalMs() {
    const configured = (typeof CONFIG !== 'undefined') ? Number(CONFIG.ROOM_POLL_INTERVAL_MS) : NaN;
    if (!Number.isFinite(configured) || configured < 1000) return 3000;
    return configured;
}

/**
 * Delay auto-reset layar sukses kembali ke layar standby (ms).
 * @returns {number}
 */
function getRoomResetDelayMs() {
    const configured = (typeof CONFIG !== 'undefined') ? Number(CONFIG.ROOM_RESET_DELAY_MS) : NaN;
    if (!Number.isFinite(configured) || configured < 1000) return 5000;
    return configured;
}

/**
 * Tampilkan status sinkronisasi pada status bar terminal bilik.
 * @param {string} message Teks singkat, mis. "⟳ 10:24:31"
 * @param {boolean} isError true bila sinkronisasi gagal
 */
function updateRoomSyncBadge(message, isError = false) {
    const el = document.getElementById('roomSyncStatus');
    if (!el) return;

    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    el.classList.remove('sync-pulse');
    // Paksa browser me-restart animasi kedip singkat sebagai tanda sinkron berhasil
    void el.offsetWidth;
    el.classList.add('sync-pulse');
}

/** Nyalakan auto-refresh terminal bilik (polling cadangan). */
function startRoomAutoSync() {
    stopRoomAutoSync();

    const intervalMs = getRoomPollIntervalMs();
    roomPollInterval = setInterval(() => {
        syncRoomStateFromServer();
    }, intervalMs);

    console.log(`Auto-refresh terminal bilik aktif setiap ${intervalMs} ms.`);
}

/** Hentikan auto-refresh terminal bilik. */
function stopRoomAutoSync() {
    if (roomPollInterval) {
        clearInterval(roomPollInterval);
        roomPollInterval = null;
    }
}

/** Hentikan hitung mundur auto-reset layar sukses (bila sedang berjalan). */
function clearRoomResetCountdown() {
    if (roomResetTimer) {
        clearInterval(roomResetTimer);
        roomResetTimer = null;
    }
}

/**
 * Tombol "⟳ Sinkron" pada status bar: paksa muat data penugasan terbaru.
 */
async function manualRoomSync() {
    if (!roomCode || !deviceToken) return;
    if (isRoomSyncInFlight) return;

    const ok = await syncRoomStateFromServer();

    if (ok === true) {
        showToast('Sinkron bilik berhasil: data penugasan terbaru sudah dimuat.', 'info', 2500);
    } else if (ok === false) {
        showToast('Gagal menyinkronkan bilik. Periksa koneksi internet perangkat ini.', 'warning');
    }
}

/**
 * Sinkronkan status bilik & sesi aktif langsung dari server tanpa menyegarkan
 * halaman. Dipakai oleh auto-refresh berkala dan tombol sinkron manual.
 * @returns {Promise<boolean|null>} true berhasil, false gagal, null dilewati
 */
async function syncRoomStateFromServer() {
    if (!roomCode || !deviceToken || isRoomSyncInFlight) return null;

    const client = getSupabaseClient();
    if (!client) return false;

    isRoomSyncInFlight = true;

    try {
        const { data: room, error } = await client
            .from('voting_rooms')
            .select('room_code, status, current_session_id')
            .eq('room_code', roomCode)
            .eq('device_token', deviceToken)
            .maybeSingle();

        if (error) {
            console.warn('Auto-refresh bilik gagal:', error.message);
            updateRoomSyncBadge('⟳ Gagal sinkron', true);
            return false;
        }

        if (!room) {
            // Token perangkat dicabut / bilik dihapus oleh panitia
            teardownRoomRealtime();
            clearRoomCredentials();
            showActivationScreen();
            showToast('Kredensial bilik tidak valid atau telah di-reset. Silakan aktivasi ulang.', 'error');
            return false;
        }

        const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
        updateRoomSyncBadge(`⟳ ${jam}`, false);

        await handleRoomRowUpdate(room);
        return true;
    } catch (err) {
        console.error('Auto-refresh bilik error:', err);
        updateRoomSyncBadge('⟳ Gagal sinkron', true);
        return false;
    } finally {
        isRoomSyncInFlight = false;
    }
}
