/**
 * hasil.js - Cinematic Announcement Engine
 * OSIS Candra Kirana SPENASIX - Periode 2026-2027
 * Otomatis, kecuali SPASI di Ketegangan & setiap Reveal. 10 layar (fase 0-9).
 */
'use strict';

// ═══ STATE ═══
var _data = null;        // hasil dari Supabase
var _sorted = [];        // kandidat sorted terkecil -> terbesar
var _logoDataUrl = null; // logo dari localStorage
var _muted = false;
var _vol = 0.8;

// ═══ SOUND ENGINE ═══
var SOUND_SLOTS = {
  intro:    { label:'Intro/Pembukaan', url:'', audio:null, loop:false },
  drumroll: { label:'Drumroll/Ketegangan', url:'', audio:null, loop:true },
  tick:     { label:'Tick/Hitung', url:'', audio:null, loop:false },
  reveal:   { label:'Reveal/Pengumuman', url:'', audio:null, loop:false },
  menang:   { label:'Pemenang/Victory', url:'', audio:null, loop:false },
  applause: { label:'Tepuk Tangan', url:'', audio:null, loop:true }
};

async function initSoundSystem() {
  try {
    var res = await fetch('sounds/sounds.json');
    var cfg = await res.json();
    // Isi URL & loop dari sounds.json ke SOUND_SLOTS
    for (var key in cfg) {
      if (SOUND_SLOTS[key]) {
        SOUND_SLOTS[key].url = cfg[key].url || '';
        if (typeof cfg[key].loop === 'boolean') SOUND_SLOTS[key].loop = cfg[key].loop;
        if (cfg[key].label) SOUND_SLOTS[key].label = cfg[key].label;
      }
    }
    // Muat URL yang tersimpan di localStorage (override sounds.json)
    for (var k in SOUND_SLOTS) {
      var saved = localStorage.getItem('sound_url_' + k);
      if (saved) SOUND_SLOTS[k].url = saved;
    }
    renderSoundSlots();
  } catch(e) {
    setSoundStatus('Gagal muat sounds.json: ' + e.message);
    renderSoundSlots();
  }
}

function renderSoundSlots() {
  var wrap = document.getElementById('soundSlots');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (var key in SOUND_SLOTS) {
    (function(k){
      var slot = SOUND_SLOTS[k];
      var loopBadge = slot.loop ? ' <span style="font-size:.65rem;background:rgba(212,175,55,.2);border:1px solid var(--gold);padding:1px 5px;border-radius:4px;color:var(--gold);font-weight:700;">LOOP</span>' : '';
      var div = document.createElement('div');
      div.className = 'sound-slot';
      div.id = 'slot_' + k;
      div.innerHTML =
        '<div class="slot-name"><span class="slot-status" id="sts_'+k+'"></span>' + slot.label + loopBadge + '</div>'
        + '<input type="url" class="slot-select" id="url_'+k+'" placeholder="Paste URL audio (mp3/ogg/wav)..." value="'+escapeHtml(slot.url || '')+'" onchange="onSlotUrlChange(\''+k+'\')" style="font-size:.78rem;" />'
        + '<div class="slot-btns">'
        + '<button class="slot-btn" onclick="previewSound(\''+k+'\')">▶ Test</button>'
        + '<button class="slot-btn" onclick="stopSlot(\''+k+'\')">■ Stop</button>'
        + '<button class="slot-btn" onclick="clearSlotUrl(\''+k+'\')">✕</button>'
        + '</div>';
      wrap.appendChild(div);
    })(key);
  }
}

function onSlotUrlChange(key) {
  var input = document.getElementById('url_' + key);
  if (!input) return;
  var url = input.value.trim();
  SOUND_SLOTS[key].url = url;
  SOUND_SLOTS[key].audio = null;
  // Simpan ke localStorage agar persist antar sesi
  if (url) localStorage.setItem('sound_url_' + key, url);
  else localStorage.removeItem('sound_url_' + key);
  updateSlotStatus(key, '');
}

function clearSlotUrl(key) {
  var input = document.getElementById('url_' + key);
  if (input) input.value = '';
  SOUND_SLOTS[key].url = '';
  SOUND_SLOTS[key].audio = null;
  localStorage.removeItem('sound_url_' + key);
  updateSlotStatus(key, '');
  setSoundStatus('URL audio ' + SOUND_SLOTS[key].label + ' dihapus.');
}

function updateSlotStatus(key, state) {
  var el = document.getElementById('sts_' + key);
  if (!el) return;
  el.className = 'slot-status' + (state ? ' ' + state : '');
}

async function preloadAllSounds() {
  var status = document.getElementById('soundPreloadStatus');
  if (status) status.textContent = 'Memuat suara dari URL...';
  var keys = Object.keys(SOUND_SLOTS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var slot = SOUND_SLOTS[k];
    if (!slot.url) { updateSlotStatus(k, ''); continue; }
    updateSlotStatus(k, 'loading');
    try {
      var audio = new Audio(slot.url);
      // crossOrigin hanya perlu untuk URL eksternal (CDN lain);
      // file lokal / same-origin (GitHub+Vercel) tidak perlu.
      if (slot.url.startsWith('http')) audio.crossOrigin = 'anonymous';
      await new Promise(function(resolve, reject) {
        audio.oncanplaythrough = resolve;
        audio.onerror = reject;
        audio.load();
        setTimeout(resolve, 5000); // timeout fallback (URL bisa lambat)
      });
      slot.audio = audio;
      updateSlotStatus(k, 'loaded');
    } catch(e) {
      updateSlotStatus(k, 'error');
    }
  }
  if (status) status.textContent = 'Semua suara siap.';
}

function playSlot(key, loop) {
  var slot = SOUND_SLOTS[key];
  if (!slot || !slot.audio || _muted) return;
  // loop parameter dari pemanggil; jika tidak di-pass, pakai default slot
  slot.audio.loop = (typeof loop === 'boolean') ? loop : !!slot.loop;
  slot.audio.volume = _vol;
  slot.audio.currentTime = 0;
  slot.audio.play().catch(function(){});
}

function stopSlot(key) {
  var slot = SOUND_SLOTS[key];
  if (!slot || !slot.audio) return;
  slot.audio.pause();
  slot.audio.currentTime = 0;
}

function stopAll() {
  for (var k in SOUND_SLOTS) stopSlot(k);
}

function previewSound(key) {
  stopAll();
  playSlot(key, false);
}

function toggleMute() {
  _muted = !_muted;
  var btn = document.querySelector('[onclick="toggleMute()"]');
  if (btn) btn.textContent = _muted ? 'Unmute' : 'Mute';
  if (_muted) stopAll();
}

document.addEventListener('DOMContentLoaded', function() {
  var vol = document.getElementById('masterVolume');
  if (vol) vol.addEventListener('input', function(){ _vol = parseFloat(this.value); });
  // Tab switching
  document.querySelectorAll('.cp-tab').forEach(function(btn){
    btn.addEventListener('click', function(){
      var tab = this.dataset.tab;
      document.querySelectorAll('.cp-tab').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.cp-tabcontent').forEach(function(c){ c.classList.remove('active'); });
      this.classList.add('active');
      var el = document.getElementById(tab);
      if (el) el.classList.add('active');
    }.bind(btn));
  });
  loadLogoFromStorage();
  initSoundSystem();
  loadDataAndPreview();
});

// ═══ LOGO ═══
function handleLogoUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    _logoDataUrl = e.target.result;
    localStorage.setItem('hasilLogo', _logoDataUrl);
    renderLogoPreview();
    document.getElementById('logoStatus').textContent = 'Logo tersimpan.';
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  _logoDataUrl = null;
  localStorage.removeItem('hasilLogo');
  renderLogoPreview();
  document.getElementById('logoStatus').textContent = 'Logo dihapus.';
}

function loadLogoFromStorage() {
  _logoDataUrl = localStorage.getItem('hasilLogo') || null;
  renderLogoPreview();
}

function renderLogoPreview() {
  var wrap = document.getElementById('logoPreview');
  if (!wrap) return;
  wrap.innerHTML = _logoDataUrl
    ? '<img src="' + _logoDataUrl + '" alt="Logo">'
    : '';
}

function setSoundStatus(msg) {
  var el = document.getElementById('soundStatusMsg');
  if (el) el.textContent = msg;
}

function reloadSoundList() {
  for (var k in SOUND_SLOTS) { stopSlot(k); SOUND_SLOTS[k].audio = null; }
  initSoundSystem();
  setSoundStatus('Daftar suara dimuat ulang.');
}

// ═══ DATA LOAD ═══
async function loadDataAndPreview() {
  try {
    var client = getSupabaseClient();
    if (!client) return;
    var res = await client.rpc('get_public_results');
    if (res.error || !res.data || !res.data.success) {
      console.warn('get_public_results error', res.error);
      return;
    }
    _data = res.data;
    var total = Number(_data.total_ballots) || 0;
    if (total === 0) {
      var warn = document.getElementById('zeroVoteWarning');
      if (warn) warn.style.display = 'block';
    }
    buildSortedCandidates();
    renderKandidatTab();
  } catch(e) {
    console.error('loadDataAndPreview', e);
  }
}

function buildSortedCandidates() {
  if (!_data || !_data.candidates) return;
  _sorted = _data.candidates.slice().sort(function(a,b){
    return Number(a.total_suara) - Number(b.total_suara);
  });
}

function renderKandidatTab() {
  var wrap = document.getElementById('kandidatPreviewList');
  if (!wrap || !_data || !_data.candidates) return;
  wrap.innerHTML = '';
  _data.candidates.forEach(function(c){
    var div = document.createElement('div');
    div.className = 'kand-prev-card';
    var foto = c.foto_url
      ? '<img src="'+escapeHtml(c.foto_url)+'" class="kand-prev-foto" onerror="this.outerHTML=\'<div class=kand-prev-foto-ph>&#128101;</div>\'" alt="Foto">'
      : '<div class="kand-prev-foto-ph">&#128101;</div>';
    var wakil = c.wakil_nama ? '<div class="kand-prev-wakil">&amp; ' + escapeHtml(c.wakil_nama) + '</div>' : '';
    div.innerHTML = foto
      + '<div class="kand-prev-no">PASLON ' + String(c.nomor_urut).padStart(2,'0') + '</div>'
      + '<div class="kand-prev-nama">' + escapeHtml(c.nama) + '</div>'
      + wakil;
    wrap.appendChild(div);
  });
}

// ═══ UTILS ═══
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

function showScreen(id) {
  document.querySelectorAll('.space-hint.dyn').forEach(function(h){ h.remove(); });
  document.querySelectorAll('.hscreen').forEach(function(s){ s.classList.remove('active'); });
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

async function typewriter(elId, text, speed) {
  speed = speed || 55;
  var el = document.getElementById(elId);
  if (!el) return;
  el.textContent = '';
  for (var i = 0; i < text.length; i++) {
    el.textContent += text[i];
    await sleep(speed);
  }
}

function countUp(el, target, duration) {
  return new Promise(function(resolve) {
    var start = 0;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
      else { el.textContent = target; resolve(); }
    }
    requestAnimationFrame(step);
  });
}

// ═══ PETA FASE (sesuai urutan screen di hasil.html) ═══
// 0  screenLoading    -> (data dimuat dari Supabase)
// 1  screenOpening    runPhaseOpening()     -> otomatis
// 2  screenPerkenalan runPhasePerkenalan()  -> otomatis
// 3  screenKetegangan runPhaseKetegangan()  -> SPASI
// 4  screenReveal     runPhaseReveal(i)     -> SPASI per peringkat (terkecil -> terbesar)
// 5  screenBuildup    runPhaseBuildup()     -> otomatis
// 6  screenPemenang   runPhasePemenang()    -> otomatis (seri -> runPhaseSeri)
// 7  screenUcapan     runPhaseUcapan()      -> otomatis
// 8  screenHasil      runPhaseHasil()       -> otomatis
// 9  screenPenutup    runPhasePenutup()     -> akhir (tombol Ulangi / Keluar)
// (screenSeri: cabang khusus jika ada suara tertinggi yang sama)

// ═══ MAIN ENTRY ═══
function startPengumuman() {
  if (!_data) { alert('Data belum dimuat. Tunggu sebentar dan coba lagi.'); return; }
  buildSortedCandidates();
  stopSpaceListener();
  // Reset hints
  var kh = document.getElementById('ketSpaceHint');
  var rh = document.getElementById('revealSpaceHint');
  if (kh) kh.style.opacity = '0';
  if (rh) rh.style.opacity = '0';
  var stage = document.getElementById('hasilStage');
  stage.classList.add('fullscreen-active');
  var el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(function(){});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  preloadAllSounds().then(runPhaseOpening);
}

function exitFS() {
  var stage = document.getElementById('hasilStage');
  stage.classList.remove('fullscreen-active');
  stopAll();
  stopSpaceListener();
  if (document.exitFullscreen) document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

document.addEventListener('fullscreenchange', function(){
  if (!document.fullscreenElement) {
    var stage = document.getElementById('hasilStage');
    if (stage) stage.classList.remove('fullscreen-active');
    stopAll();
  }
});

// ═══ FASE 1: OPENING ═══
async function runPhaseOpening() {
  showScreen('screenOpening');
  // Isi logo
  var logoWrap = document.getElementById('openingLogoWrap');
  var logoUrl = _logoDataUrl || (_data && _data.logo_url) || null;
  if (logoWrap) {
    logoWrap.innerHTML = logoUrl
      ? '<img src="'+logoUrl+'" class="opening-logo" onerror="this.outerHTML=\'<div class=logo-ph>&#127979;</div>\'" alt="Logo">'
      : '<div class="logo-ph" style="width:96px;height:96px;border-radius:50%;border:3px solid var(--gold);background:var(--brown-mid);display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin:0 auto">&#127979;</div>';
  }
  stopAll(); playSlot('intro', false);
  await sleep(800);
  await typewriter('openingTypewriter', 'Saatnya mengumumkan hasil pemilihan... Selamat menyaksikan!', 45);
  await sleep(1200);
  showSpaceHint('screenOpening', 'Tekan <kbd>SPASI</kbd> untuk memperkenalkan pasangan calon');
  waitForSpace(runPhasePerkenalan);
}

// ═══ FASE 2: PERKENALAN PASLON ═══
async function runPhasePerkenalan() {
  showScreen('screenPerkenalan');
  var wrap = document.getElementById('perkenalanCards');
  if (wrap && _data && _data.candidates) {
    wrap.innerHTML = '';
    _data.candidates.forEach(function(c, i) {
      var div = document.createElement('div');
      div.className = 'perk-card';
      div.style.animationDelay = (i * 0.18) + 's';
      var foto = c.foto_url
        ? '<img src="'+escapeHtml(c.foto_url)+'" class="perk-foto" onerror="this.outerHTML=\'<div class=perk-foto-ph>&#128101;</div>\'" alt="Foto">'
        : '<div class="perk-foto-ph">&#128101;</div>';
      div.innerHTML = foto
        + '<div class="perk-no">PASLON ' + String(c.nomor_urut).padStart(2,'0') + '</div>'
        + '<div class="perk-nama">' + escapeHtml(c.nama) + '</div>'
        + (c.wakil_nama ? '<div class="perk-wakil">&amp; ' + escapeHtml(c.wakil_nama) + '</div>' : '');
      wrap.appendChild(div);
    });
  }
  await sleep(1200 + (_data.candidates ? _data.candidates.length * 300 : 0));
  showSpaceHint('screenPerkenalan', 'Tekan <kbd>SPASI</kbd> untuk mulai penghitungan suara');
  waitForSpace(runPhaseKetegangan);
}

// ═══ FASE 3: KETEGANGAN - HITUNG SUARA ═══
async function runPhaseKetegangan() {
  showScreen('screenKetegangan');
  stopAll(); playSlot('drumroll', true);
  var total = Number(_data.total_ballots) || 0;
  var numEl = document.getElementById('ketNumberEl');
  var barEl = document.getElementById('ketBarFill');
  var glowEl = document.getElementById('ketBarGlow');
  var pctEl = document.getElementById('ketPctEl');
  var totEl = document.getElementById('ketTotalEl');
  if (totEl) totEl.textContent = 'dari ' + total + ' suara sah';
  var duration = 4000;
  var startTime = null;
  await new Promise(function(resolve) {
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      var cur = Math.round(ease * total);
      if (numEl) numEl.textContent = cur;
      if (barEl) barEl.style.width = (ease * 100) + '%';
      if (glowEl) glowEl.style.width = (ease * 100) + '%';
      if (pctEl) pctEl.textContent = Math.round(ease * 100) + '%';
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  stopSlot('drumroll');
  // Petunjuk: tekan SPASI untuk mulai reveal urutan
  var hint = document.getElementById('ketSpaceHint');
  if (hint) hint.style.opacity = '1';
  await sleep(400);
  waitForSpace(function() { runPhaseReveal(0); });
}

// === SPACE KEY LISTENER ===
var _spaceCallback = null;
var _spaceListening = false;

function waitForSpace(cb) {
  _spaceCallback = cb;
  if (!_spaceListening) {
    _spaceListening = true;
    document.addEventListener('keydown', onSpaceKey);
  }
}

function onSpaceKey(e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (e.repeat) return; // SPASI yang ditahan tidak melompati layar
    document.querySelectorAll('.space-hint.dyn').forEach(function(h){ h.remove(); });
    if (_spaceCallback) {
      var fn = _spaceCallback;
      _spaceCallback = null;
      fn();
    }
  }
}

function stopSpaceListener() { _spaceCallback = null; }

// Petunjuk SPASI dinamis: ditampilkan di layar aktif, dihapus saat SPASI ditekan
function showSpaceHint(screenId, html) {
  var scr = document.getElementById(screenId);
  if (!scr) return;
  document.querySelectorAll('.space-hint.dyn').forEach(function(h){ h.remove(); });
  var h = document.createElement('div');
  h.className = 'space-hint dyn';
  h.innerHTML = html || 'Tekan <kbd>SPASI</kbd> untuk lanjut';
  scr.appendChild(h);
}


// ═══ FASE 4: REVEAL (terkecil -> terbesar) ═══
async function runPhaseReveal(index) {
  if (index >= _sorted.length) {
    runPhaseBuildup();
    return;
  }
  showScreen('screenReveal');
  var c = _sorted[index];
  var total = Number(_data.total_ballots) || 1;
  var isWinner = (index === _sorted.length - 1);
  var isLast = isWinner;
  var pct = total > 0 ? (Number(c.total_suara) / total * 100).toFixed(1) : '0.0';
  var rank = _sorted.length - index; // 3,2,1...
  // Label
  var posEl = document.getElementById('revealPosLabel');
  if (posEl) {
    if (isWinner) posEl.textContent = 'PERINGKAT 1 - PEMENANG!';
    else if (rank === 2) posEl.textContent = 'PERINGKAT KE-2';
    else posEl.textContent = 'PERINGKAT KE-' + rank;
  }
  // Progress dots
  var dots = document.getElementById('revealProgressDots');
  if (dots) {
    dots.innerHTML = '';
    for (var d = 0; d < _sorted.length; d++) {
      var dot = document.createElement('div');
      dot.className = 'r-dot' + (d < index ? ' done' : (d === index ? ' current' : ''));
      dots.appendChild(dot);
    }
  }
  // Build card
  var cardWrap = document.getElementById('revealCardWrap');
  if (cardWrap) {
    var foto = c.foto_url
      ? '<img src="'+escapeHtml(c.foto_url)+'" class="rc-foto" onerror="this.outerHTML=\'<div class=rc-foto-ph>&#128101;</div>\'" alt="Foto">'
      : '<div class="rc-foto-ph">&#128101;</div>';
    var wakil = c.wakil_nama
      ? '<div class="rc-wakil-label">Wakil Ketua</div><div class="rc-wakil">' + escapeHtml(c.wakil_nama) + '</div>'
      : '';
    cardWrap.innerHTML =
      '<div class="reveal-card' + (isWinner ? ' winner-card' : '') + '" id="revealCard">'
      + foto
      + '<div class="rc-no">PASANGAN CALON NO. ' + String(c.nomor_urut).padStart(2,'0') + '</div>'
      + '<div class="rc-ketua-label">Ketua</div>'
      + '<div class="rc-nama">' + escapeHtml(c.nama) + '</div>'
      + wakil
      + '<div class="rc-org">OSIS Candra Kirana Periode 2026-2027 SPENASIX</div>'
      + '<div class="rc-bar-wrap"><div class="rc-bar-fill" id="rcBar"></div></div>'
      + '<div class="rc-suara-num" id="rcNum">0</div>'
      + '<div class="rc-suara-label">suara (' + pct + '%)</div>'
      + '</div>';
  }
  // Sound
  stopAll();
  if (isWinner) playSlot('reveal', false);
  else playSlot('tick', false);
  await sleep(150);
  // Animate card in
  var card = document.getElementById('revealCard');
  if (card) card.classList.add('visible');
  // Count up suara
  var numEl = document.getElementById('rcNum');
  var barEl = document.getElementById('rcBar');
  var suara = Number(c.total_suara);
  var countDur = Math.min(2200, 800 + suara * 5);
  var pctWidth = total > 0 ? (suara / total * 100) : 0;
  await sleep(400);
  if (barEl) {
    barEl.style.transition = 'width ' + (countDur/1000).toFixed(1) + 's cubic-bezier(.22,1,.36,1)';
    barEl.style.width = pctWidth + '%';
  }
  if (numEl) await countUp(numEl, suara, countDur);
  if (isWinner) {
    stopAll(); playSlot('menang', false);
    launchFireworks(3000);
    launchConfetti(80);
  }
  // Tampilkan petunjuk SPASI
  var revealHint = document.getElementById('revealSpaceHint');
  if (revealHint) {
    revealHint.textContent = isWinner ? 'Tekan SPASI untuk lanjut ke Pemenang' : 'Tekan SPASI untuk urutan berikutnya';
    revealHint.style.opacity = '1';
  }
  // Tunggu minimal 1.5 detik lalu buka SPACE listener
  var minPause = isWinner ? 3000 : 1800;
  await sleep(minPause);
  waitForSpace(function() {
    if (revealHint) revealHint.style.opacity = '0';
    if (index + 1 >= _sorted.length) {
      runPhaseBuildup();
    } else {
      runPhaseReveal(index + 1);
    }
  });
}

// ═══ FASE 5: BUILD-UP DRAMATIS ═══
async function runPhaseBuildup() {
  showScreen('screenBuildup');
  stopAll(); playSlot('drumroll', true);

  // Reset teks reveal (penting saat "Ulangi")
  var revReset = document.getElementById('buildupRevealText');
  if (revReset) { revReset.classList.remove('visible'); revReset.textContent = ''; }

  // Restart animasi CSS dengan clone trick
  var crown = document.getElementById('buildupCrown');
  if (crown) {
    crown.style.animation = 'none';
    crown.offsetWidth; // reflow
    crown.style.animation = '';
  }

  // Teks reveal muncul setelah jeda dramatic
  await sleep(3200);
  stopSlot('drumroll');
  await sleep(400);

  var revText = document.getElementById('buildupRevealText');
  if (revText) {
    revText.textContent = '✦ ADALAH... ✦';
    revText.classList.add('visible');
  }
  await sleep(1500);
  showSpaceHint('screenBuildup', 'Tekan <kbd>SPASI</kbd> untuk mengumumkan pemenang');
  waitForSpace(runPhasePemenang);
}

// ═══ FASE 7: UCAPAN & HARAPAN ═══
async function runPhaseUcapan() {
  showScreen('screenUcapan');
  stopAll(); playSlot('applause', true);

  // Logo
  var logoWrap = document.getElementById('ucapanLogoWrap');
  var logoUrl = _logoDataUrl || (_data && _data.logo_url) || null;
  if (logoWrap) {
    logoWrap.innerHTML = logoUrl
      ? '<img src="' + logoUrl + '" alt="Logo">'
      : '<div class="ucapan-logo-ph">🏫</div>';
  }

  // Kartu pesan harapan
  var MESSAGES = [
    { icon: '🌟', text: 'Semoga kepemimpinanmu menjadi cahaya yang menerangi seluruh warga SPENASIX.', from: '— Seluruh Warga Sekolah' },
    { icon: '💪', text: 'Jadilah pemimpin yang mendengar, memahami, dan bertindak dengan penuh integritas.', from: '— Panitia Pemilihan' },
    { icon: '🤝', text: 'Bersama kita wujudkan OSIS yang solid, aspiratif, dan membawa perubahan nyata.', from: '— Dewan Guru SPENASIX' },
    { icon: '🎯', text: 'Amanah ini adalah kepercayaan tertinggi — emban dengan hati yang tulus dan penuh semangat!', from: '— Angkatan 35' }
  ];

  var msgWrap = document.getElementById('ucapanMessages');
  if (msgWrap) {
    msgWrap.innerHTML = '';
    MESSAGES.forEach(function(m) {
      var card = document.createElement('div');
      card.className = 'ucapan-msg-card';
      card.innerHTML =
        '<span class="ucapan-msg-icon">' + m.icon + '</span>'
        + '<div class="ucapan-msg-text">' + m.text + '</div>'
        + '<div class="ucapan-msg-from">' + m.from + '</div>';
      msgWrap.appendChild(card);
    });

    // Animasi kartu masuk satu per satu
    var cards = msgWrap.querySelectorAll('.ucapan-msg-card');
    for (var i = 0; i < cards.length; i++) {
      await sleep(320);
      cards[i].classList.add('visible');
    }
  }

  await sleep(1000);
  stopSlot('applause');
  showSpaceHint('screenUcapan', 'Tekan <kbd>SPASI</kbd> untuk melihat rekap akhir');
  waitForSpace(runPhaseHasil);
}

// ═══ FASE 8: HASIL LENGKAP (rekap akhir) ═══
async function runPhaseHasil() {
  showScreen('screenHasil');
  stopAll(); playSlot('applause', false);
  var total = Number(_data.total_ballots) || 1;
  // Tabel
  var tbody = document.getElementById('hasilTbody');
  if (tbody) {
    tbody.innerHTML = '';
    // sorted descending (winner first)
    var desc = _sorted.slice().reverse();
    var COLORS = ['#d4af37','#c8956c','#6b3a1f','#5c4033','#78909c','#90a4ae'];
    desc.forEach(function(c, i){
      var pct = total > 0 ? (Number(c.total_suara) / total * 100).toFixed(1) : '0.0';
      var foto = c.foto_url
        ? '<img src="'+escapeHtml(c.foto_url)+'" class="hasil-tbl-foto" onerror="this.style.display=\'none\'" alt="">'
        : '<div class="hasil-tbl-foto-ph">&#128101;</div>';
      var nama = escapeHtml(c.nama) + (c.wakil_nama ? ' &amp; ' + escapeHtml(c.wakil_nama) : '');
      var tr = document.createElement('tr');
      if (i === 0) tr.className = 'winner-row';
      tr.innerHTML =
        '<td>' + (i === 0 ? '<span class="hasil-rank-1">&#127942;</span>' : (i+1)) + '</td>'
        + '<td>' + foto + '</td>'
        + '<td style="text-align:left">' + nama + '</td>'
        + '<td>' + c.total_suara + '</td>'
        + '<td>' + pct + '%</td>';
      tbody.appendChild(tr);
    });
  }
  // Stats row
  var statsRow = document.getElementById('hasilStatsRow');
  if (statsRow) {
    var chips = [
      { num: _data.total_ballots||0, label:'Total Suara' },
      { num: _data.voted_students||0, label:'Siswa' },
      { num: (_data.guru_count||0) + (_data.tamu_count||0), label:'Guru+Tamu' },
      { num: (_data.participation_pct||0) + '%', label:'Partisipasi' }
    ];
    statsRow.innerHTML = chips.map(function(ch){
      return '<div class="stat-chip"><span class="stat-chip-num">'+ch.num+'</span><span class="stat-chip-label">'+ch.label+'</span></div>';
    }).join('');
  }
  // Donut chart
  drawDonut();
  await sleep(800);
  showSpaceHint('screenHasil', 'Tekan <kbd>SPASI</kbd> untuk penutup');
  waitForSpace(runPhasePenutup);
}

// ═══ FASE 6: PEMENANG ═══
async function runPhasePemenang() {
  var winner = _sorted[_sorted.length - 1];
  // Cek seri
  if (_sorted.length >= 2) {
    var top1 = Number(_sorted[_sorted.length-1].total_suara);
    var top2 = Number(_sorted[_sorted.length-2].total_suara);
    if (top1 === top2) { runPhaseSeri(); return; }
  }
  showScreen('screenPemenang');
  stopAll(); playSlot('menang', false);
  launchFireworks(5000);
  launchConfetti(120);

  // Isi konten dasar
  var nomEl = document.getElementById('pemenangNomor');
  if (nomEl) nomEl.textContent = 'PASANGAN NO. ' + String(winner.nomor_urut).padStart(2,'0');
  var namaEl = document.getElementById('pemenangNama');
  if (namaEl) namaEl.textContent = winner.nama + (winner.wakil_nama ? ' & ' + winner.wakil_nama : '');
  var total = Number(_data.total_ballots) || 1;
  var pct = total > 0 ? (Number(winner.total_suara)/total*100).toFixed(1) : '0.0';
  var suaraEl = document.getElementById('pemenangSuara');
  if (suaraEl) suaraEl.textContent = winner.total_suara + ' suara (' + pct + '%)';
  var fotoWrap = document.getElementById('pemenangFotoWrap');
  if (fotoWrap) {
    fotoWrap.innerHTML = winner.foto_url
      ? '<img src="'+escapeHtml(winner.foto_url)+'" class="pemenang-foto" onerror="this.outerHTML=\'<div class=pemenang-foto-ph>&#128081;</div>\'" alt="Foto">'
      : '<div class="pemenang-foto-ph">&#128081;</div>';
  }

  // Elemen baru: quote inspiratif
  var quoteEl = document.getElementById('pemenangQuote');
  if (quoteEl) {
    quoteEl.textContent = '"Pemimpin sejati bukan yang paling banyak dilayani, tetapi yang paling banyak melayani."';
  }

  await sleep(1200);
  showSpaceHint('screenPemenang', 'Tekan <kbd>SPASI</kbd> untuk pesan &amp; harapan');
  waitForSpace(runPhaseUcapan);
}

// ═══ SERI ═══
async function runPhaseSeri() {
  showScreen('screenSeri');
  stopAll();
  var wrap = document.getElementById('seriCardsWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  _sorted.forEach(function(c) {
    var top = Number(_sorted[_sorted.length-1].total_suara);
    if (Number(c.total_suara) !== top) return;
    var div = document.createElement('div');
    div.className = 'perk-card';
    div.innerHTML = '<div class="perk-no">PASLON ' + String(c.nomor_urut).padStart(2,'0') + '</div>'
      + '<div class="perk-nama">' + escapeHtml(c.nama) + '</div>'
      + (c.wakil_nama ? '<div class="perk-wakil">& ' + escapeHtml(c.wakil_nama) + '</div>' : '')
      + '<div class="perk-no" style="margin-top:.4rem">' + c.total_suara + ' suara</div>';
    wrap.appendChild(div);
  });
  await sleep(800);
  showSpaceHint('screenSeri', 'Tekan <kbd>SPASI</kbd> untuk penutup');
  waitForSpace(runPhasePenutup);
}

// ═══ FASE 9: PENUTUP ═══
async function runPhasePenutup() {
  var winner = _sorted.length > 0 ? _sorted[_sorted.length - 1] : null;
  showScreen('screenPenutup');
  stopAll();
  launchFireworks(6000);
  launchConfetti(80);
  playSlot('menang', false);

  // Logo
  var logoWrap = document.getElementById('penutupLogoWrap');
  var logoUrl = _logoDataUrl || (_data && _data.logo_url) || null;
  if (logoWrap) {
    logoWrap.innerHTML = logoUrl
      ? '<img src="'+logoUrl+'" alt="Logo">'
      : '';
  }

  // Nama pemenang di penutup
  var winNameEl = document.getElementById('penutupWinnerName');
  if (winNameEl && winner) {
    winNameEl.textContent = winner.nama + (winner.wakil_nama ? ' & ' + winner.wakil_nama : '');
  }

  // Rekap mini
  var rekap = document.getElementById('penutupRekap');
  if (rekap && winner) {
    var total = Number(_data.total_ballots) || 0;
    rekap.innerHTML =
      '<div class="stat-chip"><span class="stat-chip-num">'+(winner.total_suara)+'</span><span class="stat-chip-label">Suara Pemenang</span></div>'
      + '<div class="stat-chip"><span class="stat-chip-num">'+total+'</span><span class="stat-chip-label">Total Suara Sah</span></div>'
      + '<div class="stat-chip"><span class="stat-chip-num">'+(_data.participation_pct||0)+'%</span><span class="stat-chip-label">Partisipasi</span></div>';
  }
}

// ═══ DONUT CHART ═══
function drawDonut() {
  var canvas = document.getElementById('donutCanvas');
  if (!canvas || !_sorted.length) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var cx = W/2, cy = H/2, r = Math.min(W,H)/2 - 16, inner = r * 0.52;
  var total = Number(_data.total_ballots) || 1;
  var COLORS = ['#d4af37','#c8956c','#6b3a1f','#5c4033','#78909c','#90a4ae','#bdbdbd'];
  ctx.clearRect(0,0,W,H);
  var sorted_desc = _sorted.slice().reverse();
  var angle = -Math.PI / 2;
  sorted_desc.forEach(function(c, i) {
    var share = Number(c.total_suara) / total;
    var slice = share * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    angle += slice;
  });
  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI*2);
  ctx.fillStyle = '#0d0705';
  ctx.fill();
  // Center text
  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold ' + Math.round(r*0.22) + 'px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total + ' suara', cx, cy);
  // Legend
  var legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = sorted_desc.map(function(c, i){
      var pct = (Number(c.total_suara)/total*100).toFixed(1);
      return '<div class="donut-legend-item">'
        + '<div class="donut-swatch" style="background:'+COLORS[i%COLORS.length]+'"></div>'
        + '<span>No.'+c.nomor_urut+' '+escapeHtml(c.nama)+' - '+pct+'%</span>'
        + '</div>';
    }).join('');
  }
}

// ═══ FIREWORKS CANVAS ═══
var _fwRunning = false;
var _fwParticles = [];

function launchFireworks(duration) {
  var canvas = document.getElementById('fireworkCanvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var ctx = canvas.getContext('2d');
  _fwRunning = true;
  var end = Date.now() + duration;
  var COLORS = ['#d4af37','#f0d060','#c8956c','#ffffff','#22c55e','#ef4444'];
  function burst() {
    if (!_fwRunning || Date.now() > end) { ctx.clearRect(0,0,canvas.width,canvas.height); _fwRunning=false; return; }
    var x = Math.random() * canvas.width;
    var y = Math.random() * canvas.height * 0.6;
    var count = 32 + Math.floor(Math.random() * 24);
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 / count) * i;
      var speed = 2 + Math.random() * 4;
      _fwParticles.push({
        x:x, y:y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        alpha:1, color: COLORS[Math.floor(Math.random()*COLORS.length)],
        size: 2 + Math.random()*2
      });
    }
    setTimeout(burst, 350 + Math.random()*400);
  }
  burst();
  function draw() {
    if (!_fwRunning) return;
    ctx.fillStyle = 'rgba(13,7,5,0.18)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    _fwParticles = _fwParticles.filter(function(p){ return p.alpha > 0.02; });
    _fwParticles.forEach(function(p){
      p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.98; p.alpha -= 0.015;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
  setTimeout(function(){
    _fwRunning = false;
    setTimeout(function(){ ctx.clearRect(0,0,canvas.width,canvas.height); }, 1000);
  }, duration);
}

// ═══ CONFETTI ═══
var _confettiColors = ['#d4af37','#f0d060','#c8956c','#ffffff','#22c55e','#ef4444','#60a5fa'];

function launchConfetti(count) {
  count = count || 60;
  for (var i = 0; i < count; i++) {
    (function(delay){
      setTimeout(function(){
        var el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = (Math.random()*100) + 'vw';
        el.style.background = _confettiColors[Math.floor(Math.random()*_confettiColors.length)];
        el.style.animationDuration = (2 + Math.random()*3) + 's';
        el.style.animationDelay = (Math.random()*.3) + 's';
        el.style.width = (5 + Math.random()*8) + 'px';
        el.style.height = el.style.width;
        document.getElementById('hasilStage').appendChild(el);
        setTimeout(function(){ el.remove(); }, 5500);
      }, delay);
    })(i * 25);
  }
}
