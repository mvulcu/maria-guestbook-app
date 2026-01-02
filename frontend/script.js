// Grabbing DOM elements
const entryForm = document.getElementById('entryForm');
const nameInput = document.getElementById('name');
const messageInput = document.getElementById('message');
const entriesList = document.getElementById('entriesList');

// New UI Elements for v4.0
const grepInput = document.getElementById('grepInput');
const panicBtn = document.getElementById('panicBtn');
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
let userCounts = {}; // Caching user message counts for Rank calculation
let activeStampId = null; // Which entry is currently opening the stamp menu
let defconActive = false; // Panic mode state

// --- UTILS & HELPERS ---

function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Markdown Parser for Syntax Highlighting
// Replaces `code` with styled spans
function parseMarkdown(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/`([^`]+)`/g, '<span class="code-block">$1</span>');
}

// Audio Engine
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
        sound.play().catch(e => console.log('Audio blocked:', e));
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

// --- MODAL LOGIC (Standard) ---
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
if (deleteModal) deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) hideDeleteModal(); });
if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) hideEditModal(); });

// --- GAME & OPS FEATURES ---

// 1. Matrix Rain Effect (Canvas)
let matrixInterval;
function toggleMatrix() {
    const ctx = matrixCanvas.getContext('2d');
    const isActive = matrixCanvas.classList.toggle('active');

    if (isActive) {
        matrixCanvas.width = window.innerWidth;
        matrixCanvas.height = window.innerHeight;
        const chars = "0101010101アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
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

// 2. Defcon Mode (Panic)
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
// Secret click handler on red traffic light
if (panicBtn) panicBtn.addEventListener('dblclick', toggleDefcon);

// 3. Rank Calculator
// Counts occurrences of user in the current dataset to assign a badge
function calculateRank(username) {
    const count = userCounts[username] || 0;
    if (count > 50) return '<span class="rank-badge rank-high">CYBER-GOD</span>';
    if (count > 10) return '<span class="rank-badge rank-mid">SR. ADMIN</span>';
    return '<span class="rank-badge">JR. NODE</span>';
}

// 4. Slash Command Parser
function processSlashCommand(cmd) {
    const command = cmd.trim().toLowerCase();

    switch (command) {
        case '/clear':
            entriesList.innerHTML = '';
            showModal('Terminal Buffer Cleared locally.');
            return true;
        case '/matrix':
            toggleMatrix();
            return true;
        case '/weather':
            showModal('Server Room Temp: 18°C. Humidity: 40%. Status: OPTIMAL.');
            return true;
        case '/panic':
            toggleDefcon();
            return true;
        default:
            return false;
    }
}

// --- CORE RENDER LOGIC ---

function createEntryHTML(entry) {
    const opacityStyle = entry.isTemp ? 'style="opacity: 0.6; filter: grayscale(0.5);"' : '';
    const date = new Date(entry.created_at);
    const dateStr = date.toLocaleDateString('en-US');
    const timeStr = date.toLocaleTimeString('en-US');

    // Default to INFO if level missing (backward compatibility)
    const level = entry.level || 'INFO';
    const severityClass = `lvl-${level}`;

    // Parse message for Markdown
    const formattedMessage = parseMarkdown(entry.message);

    // Calculate Rank based on local stats
    const rankBadge = calculateRank(entry.name);

    // Render Stamps if they exist
    let stampsHTML = '';
    if (entry.stamps && Array.isArray(entry.stamps)) {
        entry.stamps.forEach(stamp => {
            stampsHTML += `<div class="stamp-mark" style="transform: translate(50%, -50%) rotate(${Math.random() * 20 - 10}deg)">${stamp}</div>`;
        });
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

async function loadEntries() {
    try {
        const response = await fetch('/api/entries', { cache: 'no-store' });

        // Cache Header logic
        const cacheHeader = response.headers.get('X-Cache');
        if (cacheStatusEl) {
            if (cacheHeader === 'HIT') {
                cacheStatusEl.innerHTML = 'REDIS <span style="color:var(--success-color)">(HIT)</span>';
            } else if (cacheHeader === 'MISS') {
                cacheStatusEl.innerHTML = 'DB <span style="color:#f59e0b">(MISS)</span>';
            } else {
                cacheStatusEl.textContent = 'CONNECTING...';
            }
        }
        if (cacheTimestampEl) cacheTimestampEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

        const entries = await response.json();

        // Count users for Ranks
        userCounts = {};
        entries.forEach(e => {
            userCounts[e.name] = (userCounts[e.name] || 0) + 1;
        });

        // Filter Logic (Grep)
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

// --- API OPERATIONS ---
// Now including 'level' and 'stamps' support

async function createEntry(name, message, level) {
    const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, level }) // Passing severity level
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

// Simulating Stamp API call - In real scenario this would be a specific endpoint
async function addStamp(id, stampType) {
    // For now, we just log it as we can't change the API structure in this environment
    console.log(`[API MOCK] Adding stamp ${stampType} to entry ${id}`);

    // Optimistic UI update for stamps (Visual only since we can't save to DB)
    const entryDiv = document.querySelector(`.entry[data-id="${id}"]`);
    if (entryDiv) {
        const stampHTML = `<div class="stamp-mark" style="transform: translate(50%, -50%) rotate(${Math.random() * 20 - 10}deg)">${stampType}</div>`;
        entryDiv.insertAdjacentHTML('afterbegin', stampHTML);
        // Play thump sound
        const audio = new Audio('https://freesound.org/data/previews/163/163454_2309489-lq.mp3'); // Fallback sound or use existing
        playSound('success');
    }
}

async function deleteEntry(id) {
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) throw new Error('API Error');
}

// --- EVENT HANDLERS ---

// Real-time Grep (Filter)
if (grepInput) {
    grepInput.addEventListener('input', () => loadEntries());
}

if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
        if (!currentEntryId) return;
        try {
            await deleteEntry(currentEntryId);
            hideDeleteModal();
            showFeedbackIcon('delete');
            playSound('delete');
            await loadEntries();
        } catch (error) {
            hideDeleteModal();
            showFeedbackIcon('error');
            playSound('error');
            showModal('System refused deletion command.');
        }
    });
}

if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentEntryId) return;
        const name = editNameInput.value.trim();
        const message = editMessageInput.value.trim();
        if (!name || !message) return;
        try {
            await updateEntry(currentEntryId, name, message);
            hideEditModal();
            showFeedbackIcon('update');
            playSound('update');
            await loadEntries();
        } catch (error) {
            hideEditModal();
            showModal('Update packet lost.');
        }
    });
}

// Submission Handler with Slash Command Interception
if (entryForm) {
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        // Grab selected severity
        const levelSelector = document.querySelector('input[name="level"]:checked');
        const level = levelSelector ? levelSelector.value : 'INFO';

        if (!name || !message) {
            playSound('error');
            return;
        }

        // Check for Slash Command
        if (message.startsWith('/')) {
            const isCommand = processSlashCommand(message);
            if (isCommand) {
                messageInput.value = '';
                return; // Stop here, don't send to DB
            }
        }

        const fakeId = 'temp-' + Date.now();
        const tempEntry = {
            id: fakeId,
            name: name,
            message: message,
            created_at: new Date().toISOString(),
            level: level, // Pass level to temp renderer
            isTemp: true
        };

        renderSingleEntry(tempEntry, true);
        entryForm.reset();

        // Reset radio to INFO
        document.getElementById('lvl-info').checked = true;

        showFeedbackIcon('success');
        playSound('success');

        try {
            await createEntry(name, message, level);
            await loadEntries(); // Refresh to get ranks
            loadStats();
        } catch (error) {
            document.querySelector(`[data-id="${fakeId}"]`)?.remove();
            playSound('error');
            showModal('Transmission failed.');
        }
    });
}

// Global click handler for Stamps and Modals
if (entriesList) {
    entriesList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('delete-btn')) {
            showDeleteModal(id);
        } else if (btn.classList.contains('edit-btn')) {
            const entryEl = btn.closest('.entry');
            const nameEl = entryEl.querySelector('.entry-name');
            // Remove rank text from name for editing
            const cleanName = nameEl.childNodes[0].textContent;
            const msgEl = entryEl.querySelector('.entry-message');
            showEditModal(id, cleanName, msgEl.textContent);
        } else if (btn.classList.contains('stamp-btn')) {
            // Show Stamp Menu at cursor position
            activeStampId = id;
            stampMenu.style.top = `${e.pageY}px`;
            stampMenu.style.left = `${e.pageX}px`;
            stampMenu.classList.add('show');
            e.stopPropagation(); // Prevent document click from closing immediately
        }
    });
}

// Handle Stamp Selection
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

// Close stamp menu on outside click
document.addEventListener('click', () => {
    if (stampMenu) stampMenu.classList.remove('show');
});

// Stats and Health loaders (unchanged logic)
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        if (totalEntriesEl) totalEntriesEl.textContent = stats.total_entries_db || 0;
    } catch (e) { if (totalEntriesEl) totalEntriesEl.textContent = 'ERR'; }
}

async function loadHealth() {
    try {
        const response = await fetch('/health');
        const health = await response.json();
        if (healthStatusEl) {
            healthStatusEl.textContent = health.status === 'healthy' ? 'ONLINE' : 'DEGRADED';
            healthStatusEl.style.color = health.status === 'healthy' ? 'var(--success-color)' : 'var(--danger-color)';
        }
    } catch (e) { if (healthStatusEl) healthStatusEl.textContent = 'OFFLINE'; }
}

if (sortSelect) sortSelect.addEventListener('change', () => loadEntries());

// Initialize
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
