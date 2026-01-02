// Grabbing DOM elements
const entryForm = document.getElementById('entryForm');
const nameInput = document.getElementById('name');
const messageInput = document.getElementById('message');
const entriesList = document.getElementById('entriesList');

// UI Elements v4.2
const grepInput = document.getElementById('grepInput');
const mainPanicBtn = document.getElementById('mainPanicBtn');
const stampMenu = document.getElementById('stampMenu');
const matrixCanvas = document.getElementById('matrixCanvas');

// Stats elements
const totalEntriesEl = document.getElementById('totalEntries');
const cacheStatusEl = document.getElementById('cacheStatus');
const cacheTimestampEl = document.getElementById('cacheTimestamp');
const healthStatusEl = document.getElementById('healthStatus');

// UI Controls
const sortSelect = document.getElementById('sortOrder');
const feedbackIcon = document.getElementById('feedback-icon');

// Modals
const modalOverlay = document.getElementById('validationModal');
const modalText = document.getElementById('modalText');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const deleteModal = document.getElementById('deleteConfirmModal');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editNameInput = document.getElementById('editName');
const editMessageInput = document.getElementById('editMessage');
const editCancelBtn = document.getElementById('editCancelBtn');

// State management
let currentEntryId = null;
let currentSound = null;
let userCounts = {};
let activeStampId = null;
let defconActive = false;

// --- UTILS ---

function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

function parseMarkdown(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/`([^`]+)`/g, '<span class="code-block">$1</span>');
}

function playSound(type) {
    const soundMap = {
        'success': 'success-sound',
        'error': 'error-sound',
        'update': 'update-sound',
        'delete': 'delete-sound'
    };
    const soundId = soundMap[type];
    if (!soundId) return;

    if (currentSound && currentSound.id !== 'siren-sound') {
        currentSound.pause();
        currentSound.currentTime = 0;
    }
    const sound = document.getElementById(soundId);
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => { });
        currentSound = sound;
    }
}

function showFeedbackIcon(type) {
    if (!feedbackIcon) return;
    const imageMap = {
        'success': 'success.png',
        'error': 'error.png',
        'update': 'update.png',
        'delete': 'delete.png'
    };
    feedbackIcon.src = imageMap[type] || 'error.png';
    feedbackIcon.classList.add('show');
    setTimeout(() => { feedbackIcon.classList.remove('show'); }, 2000);
}

// --- MODALS ---
function showModal(message) {
    if (!modalOverlay || !modalText) return;
    modalText.textContent = message;
    modalOverlay.classList.add('show');
}
if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => modalOverlay.classList.remove('show'));
if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('show'); });

function showDeleteModal(id) { currentEntryId = id; if (deleteModal) deleteModal.classList.add('show'); }
function hideDeleteModal() { if (deleteModal) deleteModal.classList.remove('show'); currentEntryId = null; }
function showEditModal(id, name, msg) { currentEntryId = id; if (editNameInput) editNameInput.value = name; if (editMessageInput) editMessageInput.value = msg; if (editModal) editModal.classList.add('show'); }
function hideEditModal() { if (editModal) editModal.classList.remove('show'); if (editForm) editForm.reset(); currentEntryId = null; }

if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDeleteModal);
if (editCancelBtn) editCancelBtn.addEventListener('click', hideEditModal);

// --- FEATURES ---

let matrixInterval;
function toggleMatrix() {
    const ctx = matrixCanvas.getContext('2d');
    const isActive = matrixCanvas.classList.toggle('active');

    if (isActive) {
        matrixCanvas.width = window.innerWidth;
        matrixCanvas.height = window.innerHeight;
        const chars = "0101010101XYZ";
        const fontSize = 16;
        const columns = matrixCanvas.width / fontSize;
        const drops = Array(Math.floor(columns)).fill(1);

        matrixInterval = setInterval(() => {
            ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
            ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
            ctx.fillStyle = "#0F0";
            ctx.font = fontSize + "px monospace";
            for (let i = 0; i < drops.length; i++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > matrixCanvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }, 33);
        playSound('success');
    } else {
        clearInterval(matrixInterval);
        ctx.clearRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    }
}

function toggleDefcon() {
    defconActive = !defconActive;
    const body = document.body;
    const overlay = document.getElementById('defconOverlay');
    const siren = document.getElementById('siren-sound');

    if (defconActive) {
        body.classList.add('defcon-active');
        overlay.style.display = 'block';
        if (siren) siren.play();
    } else {
        body.classList.remove('defcon-active');
        overlay.style.display = 'none';
        if (siren) {
            siren.pause();
            siren.currentTime = 0;
        }
    }
}
if (mainPanicBtn) mainPanicBtn.addEventListener('click', toggleDefcon);

document.querySelectorAll('.command-hints .cmd').forEach(cmd => {
    cmd.addEventListener('click', () => {
        messageInput.value = cmd.textContent;
        messageInput.focus();
    });
});

function calculateRank(username) {
    const count = userCounts[username] || 0;
    if (count > 5) return '<span class="rank-badge rank-high">CYBER-GOD</span>';
    if (count > 2) return '<span class="rank-badge rank-mid">SR. ADMIN</span>';
    return '<span class="rank-badge">JR. NODE</span>';
}

function processSlashCommand(cmd) {
    const command = cmd.trim().toLowerCase();
    switch (command) {
        case '/clear': entriesList.innerHTML = ''; return true;
        case '/matrix': toggleMatrix(); return true;
        case '/panic': toggleDefcon(); return true;
        default: return false;
    }
}

// --- RENDER ---

function createEntryHTML(entry) {
    const opacityStyle = entry.isTemp ? 'style="opacity: 0.6; filter: grayscale(0.5);"' : '';
    const date = new Date(entry.created_at);
    const dateStr = date.toLocaleDateString('en-US');
    const timeStr = date.toLocaleTimeString('en-US');
    const level = entry.level || 'INFO';
    const severityClass = `lvl-${level}`;
    const formattedMessage = parseMarkdown(entry.message);
    const rankBadge = calculateRank(entry.name);

    // Stamps Logic (Fixed Position)
    let stampsHTML = '';
    if (entry.stamps && Array.isArray(entry.stamps) && entry.stamps.length > 0) {
        // Take only the last stamp to avoid clutter in the center,
        // or remove [entry.stamps.length - 1] if we want all (but they will overlap).
        // It's more logical to show the last one placed.
        const lastStamp = entry.stamps[entry.stamps.length - 1];
        stampsHTML = `<div class="stamp-mark">${escapeHtml(lastStamp)}</div>`;
    }

    return `
        <div class="entry ${severityClass}" data-id="${entry.id}" ${opacityStyle}>
            ${stampsHTML}
            <div class="entry-header">
                <div>
                    <span class="entry-name">${escapeHtml(entry.name)} ${rankBadge}</span>
                    <span class="entry-date">[${dateStr} // ${timeStr}]</span>
                </div>
                <div class="entry-actions">
                    <button class="entry-btn stamp-btn" data-id="${entry.id}" ${entry.isTemp ? 'disabled' : ''}>STAMP</button>
                    <button class="entry-btn edit-btn" data-id="${entry.id}" ${entry.isTemp ? 'disabled' : ''}>EDIT</button>
                    <button class="entry-btn delete-btn" data-id="${entry.id}" ${entry.isTemp ? 'disabled' : ''}>PURGE</button>
                </div>
            </div>
            <div class="entry-message">${formattedMessage}</div>
        </div>
    `;
}

function renderSingleEntry(entry, prepend = true) {
    const html = createEntryHTML(entry);
    const order = sortSelect ? sortSelect.value : 'desc';
    if (prepend && order === 'desc') {
        entriesList.insertAdjacentHTML('afterbegin', html);
    } else {
        entriesList.insertAdjacentHTML('beforeend', html);
    }
}

// --- API ---

async function loadEntries() {
    try {
        const response = await fetch('/api/entries', { cache: 'no-store' });
        const cacheHeader = response.headers.get('X-Cache');
        if (cacheStatusEl) {
            cacheStatusEl.innerHTML = (cacheHeader === 'HIT')
                ? 'REDIS <span style="color:var(--success-color)">(HIT)</span>'
                : 'DB <span style="color:#f59e0b">(MISS)</span>';
        }
        if (cacheTimestampEl) cacheTimestampEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

        const entries = await response.json();

        // Recalculate ranks
        userCounts = {};
        entries.forEach(e => { userCounts[e.name] = (userCounts[e.name] || 0) + 1; });

        // Apply Grep
        const filterVal = grepInput.value.toLowerCase();
        const filteredEntries = entries.filter(e =>
            e.name.toLowerCase().includes(filterVal) ||
            e.message.toLowerCase().includes(filterVal)
        );

        const order = sortSelect ? sortSelect.value : 'desc';
        filteredEntries.sort((a, b) => {
            const da = new Date(a.created_at);
            const db = new Date(b.created_at);
            return order === 'desc' ? db - da : da - db;
        });

        if (!filteredEntries.length) {
            entriesList.innerHTML = filterVal ? '<div class="loading">Grep found 0 matches.</div>' : '<div class="loading">System memory empty.</div>';
            return;
        }

        const htmlString = filteredEntries.map(entry => createEntryHTML(entry)).join('');
        if (entriesList.innerHTML !== htmlString) {
            entriesList.innerHTML = htmlString;
        }

    } catch (error) {
        entriesList.innerHTML = '<div class="loading" style="color:var(--danger-color)">CRITICAL ERROR: Backend Unreachable</div>';
    }
}

async function createEntry(name, message, level) {
    const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, level })
    });
    if (!response.ok) throw new Error('API Error');
}

async function updateEntry(id, name, message) {
    const response = await fetch(`/api/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message })
    });
    if (!response.ok) throw new Error('API Error');
}

// REAL STAMP API CALL
async function addStamp(id, stampType) {
    const response = await fetch(`/api/entries/${id}/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stamp: stampType })
    });
    if (!response.ok) throw new Error('Failed to stamp');

    // Play sound and refresh data to show the stamp permanently
    const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');
    audio.play().catch(e => { });
    loadEntries();
}

async function deleteEntry(id) {
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) throw new Error('API Error');
}

// --- HANDLERS ---

if (grepInput) grepInput.addEventListener('input', () => loadEntries());

if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
        if (!currentEntryId) return;
        try {
            await deleteEntry(currentEntryId);
            hideDeleteModal();
            showFeedbackIcon('delete');
            playSound('delete');
            loadEntries();
        } catch (e) {
            hideDeleteModal();
            playSound('error');
            showModal('Delete failed.');
        }
    });
}

if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentEntryId) return;
        const name = editNameInput.value.trim();
        const message = editMessageInput.value.trim();
        try {
            await updateEntry(currentEntryId, name, message);
            hideEditModal();
            showFeedbackIcon('update');
            playSound('update');
            loadEntries();
        } catch (e) {
            hideEditModal();
            showModal('Update failed.');
        }
    });
}

if (entryForm) {
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const message = messageInput.value.trim();
        const levelSelector = document.querySelector('input[name="level"]:checked');
        const level = levelSelector ? levelSelector.value : 'INFO';

        if (!name || !message) { playSound('error'); return; }

        if (message.startsWith('/')) {
            if (processSlashCommand(message)) {
                messageInput.value = '';
                return;
            }
        }

        // Optimistic UI
        const fakeId = 'temp-' + Date.now();
        const tempEntry = { id: fakeId, name, message, level, created_at: new Date().toISOString(), isTemp: true };
        renderSingleEntry(tempEntry, true);
        entryForm.reset();
        showFeedbackIcon('success');
        playSound('success');

        try {
            await createEntry(name, message, level);
            loadEntries();
            loadStats();
        } catch (e) {
            document.querySelector(`[data-id="${fakeId}"]`)?.remove();
            playSound('error');
            showModal('Send failed.');
        }
    });
}

if (entriesList) {
    entriesList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('stamp-btn')) {
            activeStampId = id;
            stampMenu.style.top = `${e.pageY}px`;
            stampMenu.style.left = `${e.pageX}px`;
            stampMenu.classList.add('show');
            e.stopPropagation();
        } else if (btn.classList.contains('delete-btn')) {
            showDeleteModal(id);
        } else if (btn.classList.contains('edit-btn')) {
            const entryEl = btn.closest('.entry');
            const nameEl = entryEl.querySelector('.entry-name');
            const cleanName = nameEl.childNodes[0].textContent.trim();
            const msgEl = entryEl.querySelector('.entry-message');
            showEditModal(id, cleanName, msgEl.textContent);
        }
    });
}

if (stampMenu) {
    stampMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('stamp-option')) {
            const stampType = e.target.dataset.stamp;
            if (activeStampId) addStamp(activeStampId, stampType);
            stampMenu.classList.remove('show');
            activeStampId = null;
        }
    });
}

document.addEventListener('click', () => { if (stampMenu) stampMenu.classList.remove('show'); });

async function loadStats() {
    try {
        const r = await fetch('/api/stats');
        const s = await r.json();
        if (totalEntriesEl) totalEntriesEl.textContent = s.total_entries_db || 0;
    } catch (e) { }
}

async function loadHealth() {
    try {
        const r = await fetch('/health');
        const h = await r.json();
        if (healthStatusEl) {
            healthStatusEl.textContent = h.status === 'healthy' ? 'ONLINE' : 'DEGRADED';
            healthStatusEl.style.color = h.status === 'healthy' ? 'var(--success-color)' : 'var(--danger-color)';
        }
    } catch (e) { if (healthStatusEl) healthStatusEl.textContent = 'OFFLINE'; }
}

if (sortSelect) sortSelect.addEventListener('change', () => loadEntries());

document.addEventListener('DOMContentLoaded', () => {
    loadEntries();
    loadStats();
    loadHealth();
});

setInterval(() => {
    loadEntries();
    loadStats();
    loadHealth();
}, 10000);
