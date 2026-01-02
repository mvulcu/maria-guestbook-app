// Grabbing DOM elements - standard stuff
const entryForm = document.getElementById('entryForm');
const nameInput = document.getElementById('name');
const messageInput = document.getElementById('message');
const entriesList = document.getElementById('entriesList');

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

// Helper to prevent XSS attacks when rendering user content
// We create a text node and return the HTML, effectively stripping tags
function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Audio Engine - Handles overlapping sounds gracefully
function playSound(type) {
    const soundMap = {
        'success': 'success-sound',
        'error': 'error-sound',
        'update': 'update-sound',
        'delete': 'delete-sound'
    };

    const soundId = soundMap[type];
    if (!soundId) return;

    // Stop current sound if playing to prevent cacophony
    if (currentSound) {
        currentSound.pause();
        currentSound.currentTime = 0;
    }

    const sound = document.getElementById(soundId);
    if (sound) {
        sound.currentTime = 0;
        // Catch promise errors if user hasn't interacted with page yet
        sound.play().catch(e => console.log('Audio blocked:', e));
        currentSound = sound;

        // Auto-stop sound after 2 seconds to match sticker duration
        setTimeout(() => {
            if (currentSound === sound) {
                sound.pause();
                sound.currentTime = 0;
                currentSound = null;
            }
        }, 2000);
    }
}

// Visual Feedback - The big sticker that pops up
function showFeedbackIcon(type) {
    if (!feedbackIcon) return;

    const imageMap = {
        'success': 'success.png',
        'error': 'error.png',
        'update': 'update.png',
        'delete': 'delete.png'
    };

    const imageSrc = imageMap[type] || 'error.png';
    feedbackIcon.src = imageSrc;

    // Add class for animation triggers
    feedbackIcon.classList.add('show');

    // Hide after 2 seconds
    setTimeout(() => {
        feedbackIcon.classList.remove('show');
    }, 2000);
}

// Modal Logic
function showModal(message) {
    if (!modalOverlay || !modalText) return;
    modalText.textContent = message;
    modalOverlay.classList.add('show');
}

// Close modal handlers
if (modalCloseBtn && modalOverlay) {
    modalCloseBtn.addEventListener('click', () => modalOverlay.classList.remove('show'));
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('show');
    });
}

function showDeleteModal(entryId) {
    currentEntryId = entryId;
    if (deleteModal) deleteModal.classList.add('show');
}

function hideDeleteModal() {
    if (deleteModal) deleteModal.classList.remove('show');
    currentEntryId = null;
}

function showEditModal(entryId, name, message) {
    currentEntryId = entryId;
    if (editNameInput) editNameInput.value = name;
    if (editMessageInput) editMessageInput.value = message;
    if (editModal) editModal.classList.add('show');
}

function hideEditModal() {
    if (editModal) editModal.classList.remove('show');
    if (editForm) editForm.reset();
    currentEntryId = null;
}

// Bind modal buttons
if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDeleteModal);
if (editCancelBtn) editCancelBtn.addEventListener('click', hideEditModal);

// Close on backdrop click
if (deleteModal) {
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) hideDeleteModal();
    });
}
if (editModal) {
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) hideEditModal();
    });
}

// --- CORE LOGIC START ---

// Generates HTML string for a single entry
// Using template literals for readability
function createEntryHTML(entry) {
    const opacityStyle = entry.isTemp ? 'style="opacity: 0.6; filter: grayscale(0.5);"' : '';
    const date = new Date(entry.created_at);
    // Formatting date to look techy
    const dateStr = date.toLocaleDateString('en-US');
    const timeStr = date.toLocaleTimeString('en-US');

    return `
        <div class="entry" data-id="${entry.id}" ${opacityStyle}>
            <div class="entry-header">
                <div>
                    <span class="entry-name">${escapeHtml(entry.name)}</span>
                    <span class="entry-date">[${dateStr} // ${timeStr}]</span>
                </div>
                <div class="entry-actions">
                    <button class="entry-btn edit-btn" data-id="${entry.id}" ${entry.isTemp ? 'disabled' : ''}>EDIT</button>
                    <button class="entry-btn delete-btn" data-id="${entry.id}" ${entry.isTemp ? 'disabled' : ''}>PURGE</button>
                </div>
            </div>
            <div class="entry-message">${escapeHtml(entry.message)}</div>
        </div>
    `;
}

// Renders a specific entry into the DOM immediately
function renderSingleEntry(entry, prepend = true) {
    const html = createEntryHTML(entry);
    const order = sortSelect ? sortSelect.value : 'desc';

    // If order is descending, prepend. If ascending, append.
    if (prepend && order === 'desc') {
        entriesList.insertAdjacentHTML('afterbegin', html);
    } else {
        entriesList.insertAdjacentHTML('beforeend', html);
    }
}

// Fetch and Render all entries
// Optimized to only update DOM if HTML string changes
async function loadEntries() {
    try {
        const response = await fetch('/api/entries', { cache: 'no-store' });
        const cacheHeader = response.headers.get('X-Cache');

        // Update Cache Status UI
        if (cacheStatusEl) {
            if (cacheHeader === 'HIT') {
                cacheStatusEl.innerHTML = 'REDIS <span style="color:var(--success-color)">(HIT)</span>';
            } else if (cacheHeader === 'MISS') {
                cacheStatusEl.innerHTML = 'DB <span style="color:#f59e0b">(MISS)</span>';
            } else {
                cacheStatusEl.textContent = 'CONNECTING...';
            }
        }

        // Update timestamp
        if (cacheTimestampEl) {
            const now = new Date();
            cacheTimestampEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
        }

        const entries = await response.json();
        const order = sortSelect ? sortSelect.value : 'desc';

        // Client-side sorting
        entries.sort((a, b) => {
            const da = new Date(a.created_at);
            const db = new Date(b.created_at);
            return order === 'desc' ? db - da : da - db;
        });

        if (!entries.length) {
            entriesList.innerHTML = '<div class="loading">No logs found in system memory.</div>';
            return;
        }

        // Generate full HTML string
        const htmlString = entries.map(entry => createEntryHTML(entry)).join('');

        // Only touch the DOM if content actually changed to avoid scroll jumping/flickering
        if (entriesList.innerHTML !== htmlString) {
            entriesList.innerHTML = htmlString;
        }

    } catch (error) {
        // Fallback error UI
        entriesList.innerHTML = '<div class="loading" style="color:var(--danger-color)">CRITICAL ERROR: Backend Unreachable</div>';
    }
}

// Stats Fetcher
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        if (totalEntriesEl) {
            totalEntriesEl.textContent = stats.total_entries_db || 0;
        }
    } catch (error) {
        if (totalEntriesEl) totalEntriesEl.textContent = 'ERR';
    }
}

// System Health Check
async function loadHealth() {
    try {
        const response = await fetch('/health');
        const health = await response.json();

        if (healthStatusEl) {
            if (health.status === 'healthy') {
                healthStatusEl.textContent = 'ONLINE';
                healthStatusEl.style.color = 'var(--success-color)';
                healthStatusEl.style.textShadow = '0 0 10px var(--success-color)';
            } else {
                healthStatusEl.textContent = 'DEGRADED';
                healthStatusEl.style.color = 'var(--danger-color)';
            }
        }
    } catch (error) {
        if (healthStatusEl) {
            healthStatusEl.textContent = 'OFFLINE';
            healthStatusEl.style.color = 'var(--danger-color)';
        }
    }
}

// --- API OPERATIONS ---

async function createEntry(name, message) {
    const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message })
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

async function deleteEntry(id) {
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) throw new Error('API Error');
}

// --- EVENT HANDLERS ---

// Handle deletion confirmation
if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
        if (!currentEntryId) return;
        try {
            await deleteEntry(currentEntryId);
            hideDeleteModal();
            showFeedbackIcon('delete');
            playSound('delete');
            // Refresh data immediately
            await loadEntries();
            await loadStats();
        } catch (error) {
            hideDeleteModal();
            showFeedbackIcon('error');
            playSound('error');
            showModal('System refused deletion command.');
        }
    });
}

// Handle edit submission
if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentEntryId) return;

        const name = editNameInput.value.trim();
        const message = editMessageInput.value.trim();

        if (!name || !message) {
            playSound('error');
            showModal('Null payload detected. Aborting.');
            return;
        }

        try {
            await updateEntry(currentEntryId, name, message);
            hideEditModal();
            showFeedbackIcon('update');
            playSound('update');
            await loadEntries();
            await loadStats();
        } catch (error) {
            hideEditModal();
            showFeedbackIcon('error');
            playSound('error');
            showModal('Update packet lost.');
        }
    });
}

// Handle new entry submission (Optimistic UI)
if (entryForm) {
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !message) {
            playSound('error');
            showModal('Identity and Payload required.');
            return;
        }

        // Create temporary fake ID for optimistic render
        const fakeId = 'temp-' + Date.now();
        const tempEntry = {
            id: fakeId,
            name: name,
            message: message,
            created_at: new Date().toISOString(),
            isTemp: true // Flag to style differently
        };

        // Render immediately before network request
        renderSingleEntry(tempEntry, true);
        entryForm.reset();

        // Trigger success feedback instantly
        showFeedbackIcon('success');
        playSound('success');

        try {
            // Actual network request
            await createEntry(name, message);
            // Silent refresh to get real ID and data
            await loadEntries();
            await loadStats();
        } catch (error) {
            // Rollback if failed
            const tempElement = document.querySelector(`[data-id="${fakeId}"]`);
            if (tempElement) tempElement.remove();

            playSound('error');
            showFeedbackIcon('error');
            showModal('Transmission failed. Packet dropped.');
        }
    });
}

// Event Delegation for Edit/Delete buttons in the list
if (entriesList) {
    entriesList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = btn.dataset.id;
        if (!id) return;

        if (btn.classList.contains('delete-btn')) {
            showDeleteModal(id);
        } else if (btn.classList.contains('edit-btn')) {
            const entryEl = btn.closest('.entry');
            if (!entryEl) return;

            const nameEl = entryEl.querySelector('.entry-name');
            const msgEl = entryEl.querySelector('.entry-message');

            const currentName = nameEl ? nameEl.textContent : '';
            const currentMessage = msgEl ? msgEl.textContent : '';

            showEditModal(id, currentName, currentMessage);
        }
    });
}

if (sortSelect) {
    sortSelect.addEventListener('change', () => loadEntries());
}

// Typing effect for the main textarea placeholder
// Adds a nice "hacker" touch
const placeholderText = "echo 'Hello World' && kubectl get pods";
let placeholderIdx = 0;
function typePlaceholder() {
    if (messageInput && placeholderIdx < placeholderText.length) {
        messageInput.setAttribute('placeholder', placeholderText.substring(0, placeholderIdx + 1) + '_');
        placeholderIdx++;
        setTimeout(typePlaceholder, 100);
    }
}

// Initial Boot Sequence
document.addEventListener('DOMContentLoaded', () => {
    loadEntries();
    loadStats();
    loadHealth();
    setTimeout(typePlaceholder, 1000);
});

// Polling interval
setInterval(() => {
    loadEntries();
    loadStats();
    loadHealth();
}, 10000); // 10 seconds seems reasonable for a chat
