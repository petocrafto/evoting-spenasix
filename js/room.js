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
}

/**
 * "Keluar Mode Bilik" action.
 * Revokes the device token on the backend (room -> OFFLINE), clears local
 * credentials and returns the terminal to the activation screen.
 */
async function exitRoomMode() {
    const label = roomCode ? ` (${roomCode})` : '';
    if (!confirm(`Keluar dari Mode Bilik${label} pada perangkat ini?\n\nBilik akan diubah ke status OFFLINE dan harus diaktivasi ulang menggunakan PIN.`)) {
        return;
    }

    const btn = document.getElementById('btnExitRoomMode');
    if (btn) btn.disabled = true;

    try {
        if (deviceToken) {
            const response = await callRpc('deactivate_room', { p_device_token: deviceToken });
            if (response && response.success) {
                showToast(response.message || 'Mode bilik berhasil dikeluarkan.', 'info');
            } else {
                showToast((response && response.message) || 'Perangkat tidak dikenali, kredensial lokal tetap dihapus.', 'warning');
            }
        }
    } catch (err) {
        console.error('Exit room mode error:', err);
        showToast('Terjadi kesalahan, namun kredensial lokal tetap dihapus.', 'warning');
    } finally {
        teardownRoomRealtime();
        clearRoomCredentials();
        if (btn) btn.disabled = false;
        showActivationScreen();
    }
}


function resetRoomStateToStandby() {
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    activeSession = null;
    activeStudent = null;
    roomSelectedCandidateId = null;

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
        await fetchAndStartSession(roomData.current_session_id);
    } else {
        resetRoomStateToStandby();
    }
}

async function fetchAndStartSession(sessionId) {
    const client = getSupabaseClient();

    const { data: session, error } = await client
        .from('voting_sessions')
        .select('*, students(*)')
        .eq('id', sessionId)
        .single();

    if (error || !session || session.status !== 'ACTIVE') {
        resetRoomStateToStandby();
        return;
    }

    activeSession = session;
    activeStudent = session.students;

    // Render Student Welcome & Candidate Selection Screen
    renderStudentVotingInterface();
}

function renderStudentVotingInterface() {
    if (!activeStudent || !activeSession) return;

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
            showToast('Sesi voting telah berakhir (timeout).', 'warning');
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

            document.getElementById('roomVotingScreen').style.display = 'none';
            document.getElementById('roomSuccessScreen').style.display = 'block';

            // Auto Reset after 5 seconds back to STANDBY screen
            let countdownSeconds = 5;
            const resetCounterEl = document.getElementById('autoResetCountdownText');
            if (resetCounterEl) resetCounterEl.textContent = countdownSeconds;

            const resetInterval = setInterval(() => {
                countdownSeconds--;
                if (resetCounterEl) resetCounterEl.textContent = countdownSeconds;
                if (countdownSeconds <= 0) {
                    clearInterval(resetInterval);
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
                if (newRoom.current_session_id && newRoom.status === 'WAITING') {
                    await fetchAndStartSession(newRoom.current_session_id);
                } else if (!newRoom.current_session_id && (newRoom.status === 'READY' || newRoom.status === 'OFFLINE')) {
                    resetRoomStateToStandby();
                }
            }
        })
        .subscribe();
}
