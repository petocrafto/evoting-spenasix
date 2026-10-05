/**
 * Admin Dashboard Logic
 * OSIS Candra Kirana SPENASIX Divisi 9
 */

let currentUser = null;
let activeTab = 'dashboard';
let adminRealtimeChannels = [];
let parsedImportStudents = [];
let allClasses = [];

document.addEventListener('DOMContentLoaded', () => {
    initAdminPage();
});

async function initAdminPage() {
    const client = getSupabaseClient();
    if (!client) {
        showToast('Supabase Client belum dikonfigurasi.', 'error');
        return;
    }

    // Check existing auth session
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        currentUser = session.user;
        showAdminView();
    } else {
        showLoginView();
    }

    // Listen to Auth State Changes
    client.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            showAdminView();
        } else {
            currentUser = null;
            showLoginView();
        }
    });
}

function showLoginView() {
    document.getElementById('adminLoginCard').style.display = 'block';
    document.getElementById('adminDashboardView').style.display = 'none';
}

function showAdminView() {
    document.getElementById('adminLoginCard').style.display = 'none';
    document.getElementById('adminDashboardView').style.display = 'block';
    document.getElementById('displayAdminEmail').textContent = currentUser.email;

    switchTab('dashboard');
    setupAdminRealtimeSubscriptions();
}

async function handleAdminLogin(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!email || !password) {
        showToast('Masukkan email dan password admin.', 'error');
        return;
    }

    const btn = document.getElementById('btnLoginSubmit');
    if (btn) btn.disabled = true;

    try {
        const client = getSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
            showToast(`Login gagal: ${error.message}`, 'error');
        } else {
            showToast('Login berhasil!', 'success');
        }
    } catch (err) {
        console.error('Login error:', err);
        showToast('Terjadi kesalahan saat login.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleAdminLogout() {
    const client = getSupabaseClient();
    await client.auth.signOut();
    showToast('Berhasil logout.', 'info');
}

/* Tab Navigation */
function switchTab(tabName) {
    activeTab = tabName;

    // Toggle Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Toggle Content Panels
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.style.display = pane.id === `tab-${tabName}` ? 'block' : 'none';
    });

    // Load Tab Data
    if (tabName === 'dashboard') loadDashboardStats();
    if (tabName === 'assign') loadAssignBilikPanel();
    if (tabName === 'students') loadStudentsTab();
    if (tabName === 'candidates') loadCandidatesTab();
    if (tabName === 'rooms') loadRoomsTab();
    if (tabName === 'election') loadElectionTab();
    if (tabName === 'audit') loadAuditTab();
}

/* ==========================================
   1. DASHBOARD TAB
   ========================================== */
async function loadDashboardStats() {
    try {
        const stats = await callRpc('get_admin_dashboard_stats');
        if (!stats) return;

        // Render Summary Stats
        document.getElementById('statTotalStudents').textContent = stats.total_students || 0;
        document.getElementById('statVotedStudents').textContent = stats.voted_students || 0;
        document.getElementById('statNotVotedStudents').textContent = stats.not_voted_students || 0;
        document.getElementById('statParticipationPct').textContent = `${stats.participation_pct || 0}%`;

        // Election Status Badge
        const statusBadge = document.getElementById('displayElectionStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = stats.election_status;
            statusBadge.className = `badge badge-${stats.election_status === 'OPEN' ? 'ready' : stats.election_status === 'DRAFT' ? 'waiting' : 'offline'}`;
        }

        // Render Class Breakdown Table
        renderClassBreakdownTable(stats.class_stats);

        // Render Aggregate Candidate Results (ADMIN ONLY)
        renderCandidateTallyCards(stats.candidate_tally);

        // Render Live Bilik Status Cards
        renderLiveRoomCards(stats.rooms);

    } catch (err) {
        console.error('Error loading dashboard stats:', err);
    }
}

function renderClassBreakdownTable(classStats) {
    const tbody = document.getElementById('classBreakdownTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!classStats || classStats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada data siswa.</td></tr>';
        return;
    }

    classStats.forEach(c => {
        const pct = c.total > 0 ? Math.round((c.voted / c.total) * 100) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(c.kelas)}</strong></td>
            <td>${c.total}</td>
            <td><span class="badge badge-voted">${c.voted} Sudah</span></td>
            <td><span class="badge badge-not-voted">${c.not_voted} Belum (${pct}%)</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCandidateTallyCards(tally) {
    const container = document.getElementById('candidateTallyContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!tally || tally.length === 0) {
        container.innerHTML = '<p class="text-muted">Belum ada kandidat terdaftar.</p>';
        return;
    }

    tally.forEach(t => {
        const card = document.createElement('div');
        card.className = 'tally-card';
        card.innerHTML = `
            <div class="tally-num">${t.nomor_urut}</div>
            <div class="tally-details">
                <h4 style="margin:0; font-size:1.05rem;">${escapeHtml(t.nama)}</h4>
                <span class="text-muted" style="font-size:0.85rem;">Kandidat Nomor Urut 0${t.nomor_urut}</span>
            </div>
            <div class="tally-count">${t.total_suara} <span style="font-size:0.85rem; font-weight:normal; color:#64748b;">Suara</span></div>
        `;
        container.appendChild(card);
    });
}

function renderLiveRoomCards(rooms) {
    const container = document.getElementById('adminLiveRoomCards');
    if (!container) return;
    container.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        container.innerHTML = '<p class="text-muted">Belum ada bilik voting yang didaftarkan.</p>';
        return;
    }

    rooms.forEach(r => {
        const card = document.createElement('div');
        card.className = `admin-room-card ${r.status.toLowerCase()}`;
        
        let studentText = 'KOSONG';
        if (r.active_student_nama) {
            studentText = `${escapeHtml(r.active_student_nama)} (${escapeHtml(r.active_student_kelas)})`;
        }

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <strong style="font-size:1.1rem;">${escapeHtml(r.room_code)}</strong>
                <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
            </div>
            <p style="margin:0; font-size:0.875rem; color:#475569;">${studentText}</p>
        `;
        container.appendChild(card);
    });
}

/* ==========================================
   2. ASSIGN BILIK PANEL
   ========================================== */
async function loadAssignBilikPanel() {
    const client = getSupabaseClient();

    // Populate Kelas Dropdown
    const { data: students } = await client.from('students').select('kelas');
    if (students) {
        const uniqueClasses = [...new Set(students.map(s => s.kelas))].sort();
        const select = document.getElementById('assignSelectKelas');
        select.innerHTML = '<option value="">-- Semua Kelas --</option>';
        uniqueClasses.forEach(k => {
            select.innerHTML += `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`;
        });
    }

    // Populate Active Bilik Dropdown
    const { data: rooms } = await client
        .from('voting_rooms')
        .select('*')
        .in('status', ['READY', 'COMPLETED'])
        .order('room_code', { ascending: true });

    const roomSelect = document.getElementById('assignSelectBilik');
    roomSelect.innerHTML = '<option value="">-- Pilih Bilik Ready --</option>';
    if (rooms && rooms.length > 0) {
        rooms.forEach(r => {
            roomSelect.innerHTML += `<option value="${escapeHtml(r.room_code)}">${escapeHtml(r.room_code)} (READY)</option>`;
        });
    }

    await filterAssignStudentList();
}

async function filterAssignStudentList() {
    const client = getSupabaseClient();
    const kelasFilter = document.getElementById('assignSelectKelas').value;
    const searchFilter = document.getElementById('assignSearchStudent').value.trim();

    let query = client.from('students').select('*').order('nama', { ascending: true }).limit(50);

    if (kelasFilter) query = query.eq('kelas', kelasFilter);
    if (searchFilter) query = query.or(`nama.ilike.%${searchFilter}%,nis.ilike.%${searchFilter}%`);

    const { data: students } = await query;

    const tbody = document.getElementById('assignStudentTbody');
    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Siswa tidak ditemukan.</td></tr>';
        return;
    }

    students.forEach(s => {
        const tr = document.createElement('tr');
        const isEligible = !s.has_voted && s.voting_status !== 'VOTED';

        tr.innerHTML = `
            <td><strong>${escapeHtml(s.nis)}</strong></td>
            <td>${escapeHtml(s.nama)}</td>
            <td>${escapeHtml(s.kelas)}</td>
            <td><span class="badge badge-${s.voting_status === 'VOTED' ? 'voted' : s.voting_status === 'IN_PROGRESS' ? 'in-progress' : 'not-voted'}">${s.voting_status}</span></td>
            <td>
                ${isEligible 
                    ? `<button type="button" class="btn btn-sm btn-primary" onclick="prepareAssignModal('${s.id}', '${escapeHtml(s.nama)}', '${escapeHtml(s.nis)}', '${escapeHtml(s.kelas)}')">Tugaskan Ke Bilik</button>`
                    : `<span class="text-muted" style="font-size:0.8rem;">Sudah Voting</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function prepareAssignModal(studentId, name, nis, kelas) {
    document.getElementById('assignModalStudentId').value = studentId;
    document.getElementById('assignModalStudentInfo').textContent = `${name} (${nis} - ${kelas})`;

    const modal = document.getElementById('assignBilikModal');
    modal.classList.add('active');
}

function closeAssignBilikModal() {
    const modal = document.getElementById('assignBilikModal');
    modal.classList.remove('active');
}

async function executeStudentAssignment() {
    const studentId = document.getElementById('assignModalStudentId').value;
    const roomCode = document.getElementById('assignModalRoomCode').value;

    if (!roomCode) {
        showToast('Pilih bilik tujuan terlebih dahulu.', 'error');
        return;
    }

    try {
        const response = await callRpc('assign_student_to_room', {
            p_student_id: studentId,
            p_room_code: roomCode
        });

        if (response && response.success) {
            showToast(response.message, 'success');
            closeAssignBilikModal();
            loadAssignBilikPanel();
            loadDashboardStats();
        } else {
            showToast(response.message || 'Gagal menugaskan siswa.', 'error');
        }
    } catch (err) {
        console.error('Assignment error:', err);
        showToast('Terjadi kesalahan saat menugaskan siswa.', 'error');
    }
}

/* ==========================================
   3. KELOLA SISWA & EXCEL/CSV IMPORTER
   ========================================== */
async function loadStudentsTab() {
    await refreshStudentListTable();
}

async function refreshStudentListTable() {
    const client = getSupabaseClient();
    const { data: students, error } = await client
        .from('students')
        .select('*')
        .order('kelas', { ascending: true })
        .order('nama', { ascending: true });

    const tbody = document.getElementById('studentsListTbody');
    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada data siswa terdaftar.</td></tr>';
        return;
    }

    students.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(s.nis)}</strong></td>
            <td>${escapeHtml(s.nama)}</td>
            <td>${escapeHtml(s.kelas)}</td>
            <td><span class="badge badge-${s.voting_status === 'VOTED' ? 'voted' : 'not-voted'}">${s.voting_status}</span></td>
            <td>
                <button type="button" class="btn btn-sm btn-secondary" onclick="deleteStudent('${s.id}', '${escapeHtml(s.nama)}')">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleExcelFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            processImportRows(jsonRows);
        } catch (err) {
            console.error('File parsing error:', err);
            showToast('Gagal membaca file Excel/CSV.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processImportRows(rows) {
    parsedImportStudents = [];
    const errors = [];
    const nisSet = new Set();

    if (!rows || rows.length < 2) {
        showToast('File kosong atau tidak memiliki baris data.', 'error');
        return;
    }

    // Skip header row if contains letters
    const startIndex = (typeof rows[0][0] === 'string' && isNaN(rows[0][0])) ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[0]) continue; // Skip blank lines

        const nisStr = String(row[0]).trim();
        const namaStr = row[1] ? String(row[1]).trim() : '';
        const kelasStr = row[2] ? String(row[2]).trim() : '';

        const lineNum = i + 1;

        // Validation Rules
        if (!/^\d{4}$/.test(nisStr)) {
            errors.push(`Baris ${lineNum}: NIS '${nisStr}' tidak valid (harus tepat 4 digit angka).`);
            continue;
        }

        if (nisSet.has(nisStr)) {
            errors.push(`Baris ${lineNum}: NIS '${nisStr}' duplikat di dalam file.`);
            continue;
        }

        if (!namaStr) {
            errors.push(`Baris ${lineNum}: Nama siswa wajib diisi.`);
            continue;
        }

        if (!kelasStr) {
            errors.push(`Baris ${lineNum}: Kelas wajib diisi.`);
            continue;
        }

        nisSet.add(nisStr);
        parsedImportStudents.push({ nis: nisStr, nama: namaStr, kelas: kelasStr });
    }

    // Render Preview & Errors
    renderImportPreview(parsedImportStudents, errors);
}

function renderImportPreview(validList, errorList) {
    document.getElementById('importPreviewCard').style.display = 'block';
    document.getElementById('btnConfirmImport').disabled = validList.length === 0;

    const tbody = document.getElementById('importPreviewTbody');
    tbody.innerHTML = '';
    validList.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHtml(s.nis)}</strong></td>
                <td>${escapeHtml(s.nama)}</td>
                <td>${escapeHtml(s.kelas)}</td>
            </tr>
        `;
    });

    const errorContainer = document.getElementById('importErrorsBox');
    if (errorList.length > 0) {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = `<strong>Ditemukan ${errorList.length} Kesalahan:</strong><ul>${errorList.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
    } else {
        errorContainer.style.display = 'none';
    }
}

async function confirmBatchImportStudents() {
    if (parsedImportStudents.length === 0) return;

    const btn = document.getElementById('btnConfirmImport');
    if (btn) btn.disabled = true;

    try {
        const client = getSupabaseClient();
        
        // 1. Try RPC procedure first (SECURITY DEFINER bypasses RLS issues)
        try {
            const res = await callRpc('import_students_batch', { p_students: parsedImportStudents });
            if (res && res.success) {
                showToast(`Berhasil mengimpor ${res.count || parsedImportStudents.length} data siswa!`, 'success');
                document.getElementById('importPreviewCard').style.display = 'none';
                parsedImportStudents = [];
                refreshStudentListTable();
                return;
            }
        } catch (rpcErr) {
            console.warn('RPC import_students_batch fallback to direct upsert:', rpcErr);
        }

        // 2. Direct client upsert fallback
        const { data, error } = await client.from('students').upsert(parsedImportStudents, { onConflict: 'nis' });

        if (error) {
            showToast(`Gagal mengimpor data: ${error.message}`, 'error');
        } else {
            showToast(`Berhasil mengimpor ${parsedImportStudents.length} data siswa!`, 'success');
            document.getElementById('importPreviewCard').style.display = 'none';
            parsedImportStudents = [];
            refreshStudentListTable();
        }
    } catch (err) {
        console.error('Import error:', err);
        showToast('Terjadi kesalahan saat mengimpor data.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteStudent(studentId, name) {
    if (!confirm(`Hapus siswa ${name}?`)) return;

    const client = getSupabaseClient();
    const { error } = await client.from('students').delete().eq('id', studentId);

    if (error) {
        showToast('Gagal menghapus siswa.', 'error');
    } else {
        showToast('Siswa berhasil dihapus.', 'info');
        refreshStudentListTable();
    }
}

function downloadStudentExcelTemplate() {
    const templateData = [
        ["NIS", "Nama Lengkap", "Kelas"],
        ["1234", "Ahmad Fulan", "9A"],
        ["1235", "Budi Santoso", "9A"],
        ["1236", "Citra Lestari", "9B"],
        ["1237", "Dewa Pratama", "9B"],
        ["1238", "Eka Rahmawati", "9C"]
    ];

    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data Siswa");
        XLSX.writeFile(wb, "Format_Data_Siswa_SPENASIX.xlsx");
        showToast('Format Excel berhasil diunduh.', 'success');
    } else {
        // Fallback to CSV format
        let csvContent = "data:text/csv;charset=utf-8," + templateData.map(e => e.join(",")).join("\n");
        let encodedUri = encodeURI(csvContent);
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Format_Data_Siswa_SPENASIX.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Format CSV berhasil diunduh.', 'success');
    }
}

/* ==========================================
   4. KELOLA KANDIDAT (FULL CRUD VIA ADMIN)
   ========================================== */
let allCandidatesData = [];

async function loadCandidatesTab() {
    const client = getSupabaseClient();
    const { data: candidates, error } = await client
        .from('candidates')
        .select('*')
        .order('nomor_urut', { ascending: true });

    const container = document.getElementById('adminCandidatesGrid');
    container.innerHTML = '';

    if (error || !candidates || candidates.length === 0) {
        container.innerHTML = '<p class="text-muted" style="grid-column:1/-1;">Belum ada kandidat terdaftar. Klik <strong>"➕ Tambah Kandidat Baru"</strong> untuk memasukkan kandidat.</p>';
        return;
    }

    allCandidatesData = candidates;

    candidates.forEach(c => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '0';
        
        const foto = c.foto_url || 'https://via.placeholder.com/400x300?text=Foto+Kandidat';
        const misiList = Array.isArray(c.misi) ? c.misi : [];

        card.innerHTML = `
            <div style="position:relative; margin:-1.5rem -1.5rem 1rem -1.5rem; height:200px; overflow:hidden; background:#f1f5f9; border-top-left-radius:var(--radius-md); border-top-right-radius:var(--radius-md);">
                <img src="${escapeHtml(foto)}" alt="${escapeHtml(c.nama)}" style="width:100%; height:100%; object-fit:cover; object-position:top center;" />
                <span class="candidate-num-badge" style="top:10px; left:10px; position:absolute;">${c.nomor_urut}</span>
                <span class="badge badge-${c.active ? 'ready' : 'offline'}" style="position:absolute; top:10px; right:10px;">${c.active ? 'AKTIF' : 'NON-AKTIF'}</span>
            </div>

            <h3 style="font-size:1.15rem; font-weight:700; color:var(--primary-navy); margin-bottom:0.5rem;">Kandidat 0${c.nomor_urut} - ${escapeHtml(c.nama)}</h3>
            <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:0.75rem;"><strong>Visi:</strong> ${escapeHtml(c.visi)}</p>
            
            <div style="font-size:0.825rem; color:var(--secondary-slate); margin-bottom:1.25rem;">
                <strong>Misi (${misiList.length} Poin):</strong>
                <ol style="padding-left:1.1rem; margin-top:0.35rem;">
                    ${misiList.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
                </ol>
            </div>

            <div style="display:flex; gap:0.5rem; margin-top:auto; padding-top:0.75rem; border-top:1px solid var(--border-color);">
                <button type="button" class="btn btn-sm btn-secondary" style="flex:1;" onclick="openCandidateModal('${c.id}')">✏️ Edit Kandidat</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteCandidate('${c.id}', '${escapeHtml(c.nama)}')">🗑️ Hapus</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function openCandidateModal(candidateId = null) {
    const modal = document.getElementById('candidateModal');
    const titleEl = document.getElementById('candidateModalTitle');

    document.getElementById('candFormId').value = candidateId || '';
    document.getElementById('candFormNomor').value = '';
    document.getElementById('candFormNama').value = '';
    document.getElementById('candFormFoto').value = '';
    document.getElementById('candFormVisi').value = '';
    document.getElementById('candFormMisi').value = '';
    document.getElementById('candFormActive').checked = true;

    if (candidateId) {
        titleEl.textContent = 'Edit Data Kandidat';
        const cand = allCandidatesData.find(c => c.id === candidateId);
        if (cand) {
            document.getElementById('candFormNomor').value = cand.nomor_urut;
            document.getElementById('candFormNama').value = cand.nama;
            document.getElementById('candFormFoto').value = cand.foto_url || '';
            document.getElementById('candFormVisi').value = cand.visi || '';
            document.getElementById('candFormMisi').value = Array.isArray(cand.misi) ? cand.misi.join('\n') : '';
            document.getElementById('candFormActive').checked = cand.active !== false;
        }
    } else {
        titleEl.textContent = 'Tambah Kandidat Baru';
        // Auto suggest next nomor urut
        const nextNum = allCandidatesData.length + 1;
        document.getElementById('candFormNomor').value = nextNum;
    }

    modal.classList.add('active');
}

function closeCandidateModal() {
    const modal = document.getElementById('candidateModal');
    modal.classList.remove('active');
}

async function saveCandidateForm(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('candFormId').value;
    const nomor_urut = parseInt(document.getElementById('candFormNomor').value);
    const nama = document.getElementById('candFormNama').value.trim();
    const foto_url = document.getElementById('candFormFoto').value.trim();
    const visi = document.getElementById('candFormVisi').value.trim();
    const misiText = document.getElementById('candFormMisi').value.trim();
    const active = document.getElementById('candFormActive').checked;

    if (!nomor_urut || !nama || !foto_url || !visi) {
        showToast('Nomor urut, Nama, Foto URL, dan Visi wajib diisi.', 'error');
        return;
    }

    // Split misi lines into array
    const misiArray = misiText
        .split('\n')
        .map(line => line.replace(/^\d+[\.\)\-]\s*/, '').trim()) // remove leading numbering if user pasted numbered list
        .filter(line => line.length > 0);

    const btn = document.getElementById('btnSaveCandidate');
    if (btn) btn.disabled = true;

    try {
        const client = getSupabaseClient();
        const payload = {
            nomor_urut,
            nama,
            foto_url,
            visi,
            misi: misiArray,
            active,
            updated_at: new Date().toISOString()
        };

        let resultError = null;

        if (id) {
            // Update existing candidate
            const { error } = await client.from('candidates').update(payload).eq('id', id);
            resultError = error;
        } else {
            // Insert new candidate
            const { error } = await client.from('candidates').insert([payload]);
            resultError = error;
        }

        if (resultError) {
            showToast(`Gagal menyimpan kandidat: ${resultError.message}`, 'error');
        } else {
            showToast('Data kandidat berhasil disimpan!', 'success');
            closeCandidateModal();
            loadCandidatesTab();
            loadDashboardStats();
        }
    } catch (err) {
        console.error('Save candidate error:', err);
        showToast('Terjadi kesalahan saat menyimpan kandidat.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteCandidate(candidateId, candidateName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus ${candidateName}?`)) return;

    try {
        const client = getSupabaseClient();
        const { error } = await client.from('candidates').delete().eq('id', candidateId);

        if (error) {
            showToast('Gagal menghapus kandidat.', 'error');
        } else {
            showToast('Kandidat berhasil dihapus.', 'info');
            loadCandidatesTab();
            loadDashboardStats();
        }
    } catch (err) {
        console.error('Delete candidate error:', err);
        showToast('Terjadi kesalahan saat menghapus kandidat.', 'error');
    }
}

/* ==========================================
   5. KELOLA BILIK
   ========================================== */
async function loadRoomsTab() {
    const client = getSupabaseClient();
    const { data: rooms } = await client.from('voting_rooms').select('*').order('room_code', { ascending: true });

    const tbody = document.getElementById('adminRoomsTbody');
    tbody.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada bilik.</td></tr>';
        return;
    }

    rooms.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(r.room_code)}</strong></td>
            <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
            <td>${r.device_token ? 'TERAKTIVASI' : 'BELUM AKTIF'}</td>
            <td>${formatDate(r.updated_at)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-secondary" onclick="resetBilikRoom('${r.room_code}')">Reset Bilik</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function createNewVotingRoom(event) {
    if (event) event.preventDefault();
    const code = document.getElementById('newRoomCode').value.trim().toUpperCase();
    const pin = document.getElementById('newRoomPin').value.trim();

    if (!code || !pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        showToast('ID Bilik dan PIN 6 digit unik wajib diisi.', 'error');
        return;
    }

    try {
        const client = getSupabaseClient();
        // Compute SHA-256 hash client-side for storing
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const { error } = await client.from('voting_rooms').insert([{
            room_code: code,
            pin_hash: pinHash,
            status: 'OFFLINE'
        }]);

        if (error) {
            showToast(`Gagal membuat bilik: ${error.message}`, 'error');
        } else {
            showToast(`Bilik ${code} dengan PIN ${pin} berhasil dibuat!`, 'success');
            document.getElementById('newRoomCode').value = '';
            document.getElementById('newRoomPin').value = '';
            loadRoomsTab();
        }
    } catch (err) {
        console.error('Create room error:', err);
        showToast('Terjadi kesalahan saat membuat bilik.', 'error');
    }
}

function generateRandomPin() {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('newRoomPin').value = pin;
}

async function resetBilikRoom(roomCode) {
    if (!confirm(`Reset bilik ${roomCode}?`)) return;

    try {
        const res = await callRpc('cancel_room_session', { p_room_code: roomCode });
        if (res && res.success) {
            showToast(res.message, 'success');
            loadRoomsTab();
            loadDashboardStats();
        } else {
            showToast('Gagal membatalkan sesi bilik.', 'error');
        }
    } catch (err) {
        console.error('Reset room error:', err);
    }
}

/* ==========================================
   6. ELECTION SETTINGS
   ========================================== */
async function loadElectionTab() {
    const client = getSupabaseClient();
    const { data: election } = await client.from('election_settings').select('*').single();

    if (election) {
        document.getElementById('electionNameInput').value = election.election_name;
        document.getElementById('displayCurrentStatusText').textContent = election.status;
    }
}

async function updateElectionStatus(newStatus) {
    if (!confirm(`Ubah status election menjadi ${newStatus}?`)) return;

    const client = getSupabaseClient();
    const { error } = await client
        .from('election_settings')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

    if (error) {
        showToast('Gagal mengubah status election.', 'error');
    } else {
        showToast(`Status election berhasil diubah menjadi ${newStatus}.`, 'success');
        loadElectionTab();
        loadDashboardStats();
    }
}

/* ==========================================
   7. AUDIT LOGS
   ========================================== */
async function loadAuditTab() {
    const client = getSupabaseClient();
    const { data: logs } = await client
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

    const tbody = document.getElementById('auditLogsTbody');
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada catatan log.</td></tr>';
        return;
    }

    logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(l.created_at)}</td>
            <td><span class="badge badge-secondary">${escapeHtml(l.actor_type)}</span></td>
            <td><strong>${escapeHtml(l.action)}</strong></td>
            <td><code>${escapeHtml(JSON.stringify(l.details))}</code></td>
        `;
        tbody.appendChild(tr);
    });
}

/* Realtime Subscription for Admin */
function setupAdminRealtimeSubscriptions() {
    const client = getSupabaseClient();
    if (!client) return;

    client
        .channel('admin-global-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
            if (activeTab === 'dashboard') loadDashboardStats();
            if (activeTab === 'assign') filterAssignStudentList();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'voting_rooms' }, () => {
            if (activeTab === 'dashboard') loadDashboardStats();
            if (activeTab === 'rooms') loadRoomsTab();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ballots' }, () => {
            if (activeTab === 'dashboard') loadDashboardStats();
        })
        .subscribe();
}
