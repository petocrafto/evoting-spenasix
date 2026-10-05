/**
 * Main Utilities and Global Logic
 * OSIS Candra Kirana SPENASIX Divisi 9
 */

document.addEventListener('DOMContentLoaded', () => {
    initHeaderIdentity();
});

function initHeaderIdentity() {
    const titles = document.querySelectorAll('.brand-title');
    const sub1 = document.querySelectorAll('.brand-sub1');
    const sub2 = document.querySelectorAll('.brand-sub2');

    titles.forEach(el => el.textContent = CONFIG.SYSTEM_TITLE);
    sub1.forEach(el => el.textContent = CONFIG.SUB_IDENTITY_1);
    sub2.forEach(el => el.textContent = CONFIG.SUB_IDENTITY_2);
}

/**
 * Custom Toast Notification System (No heavy dependencies)
 */
function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '🔔';

    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-text">${escapeHtml(message)}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
