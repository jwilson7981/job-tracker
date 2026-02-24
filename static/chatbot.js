/* ─── Chatbot Module ──────────────────────────────────────── */

let currentSessionId = null;

document.addEventListener('DOMContentLoaded', loadSessions);

async function loadSessions() {
    const res = await fetch('/api/chatbot/sessions');
    const sessions = await res.json();
    const list = document.getElementById('sessionList');

    if (!sessions.length) {
        list.innerHTML = '<p class="text-muted" style="padding:12px;">No sessions yet.</p>';
        return;
    }

    list.innerHTML = sessions.map(s => `
        <div class="chat-session-item ${s.id === currentSessionId ? 'active' : ''}"
             onclick="loadSession(${s.id})">
            <div class="chat-session-title">${escapeHtml(s.title)}</div>
            <div class="chat-session-date">${s.created_at}</div>
        </div>
    `).join('');
}

async function newSession() {
    const res = await fetch('/api/chatbot/sessions', { method: 'POST' });
    const data = await res.json();
    currentSessionId = data.id;
    await loadSessions();
    clearMessages();
    showWelcome();
}

async function loadSession(id) {
    currentSessionId = id;
    await loadSessions();

    const res = await fetch(`/api/chatbot/sessions/${id}/messages`);
    const messages = await res.json();

    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    if (!messages.length) {
        showWelcome();
        return;
    }

    messages.forEach(m => {
        appendMessage(m.role, m.content);
    });
    scrollToBottom();
}

function showWelcome() {
    const container = document.getElementById('chatMessages');
    const existing = container.querySelector('.chat-welcome');
    if (existing) return;
    container.innerHTML = `
        <div class="chat-welcome">
            <h2>Construction Management Assistant</h2>
            <p>I can help you look up code sections, check warranty status, find open service calls, search how-to articles, and review bid summaries.</p>
            <p style="margin-top:8px;">Type <strong>help</strong> for a list of commands, or just ask a question!</p>
        </div>
    `;
}

function clearMessages() {
    document.getElementById('chatMessages').innerHTML = '';
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // Create session if none exists
    if (!currentSessionId) {
        const res = await fetch('/api/chatbot/sessions', { method: 'POST' });
        const data = await res.json();
        currentSessionId = data.id;
    }

    // Remove welcome screen
    const welcome = document.getElementById('chatMessages').querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Show user message
    appendMessage('user', message);
    input.value = '';
    scrollToBottom();

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-message assistant';
    typing.innerHTML = '<div class="chat-bubble assistant"><span class="typing-dots">...</span></div>';
    document.getElementById('chatMessages').appendChild(typing);
    scrollToBottom();

    try {
        const res = await fetch(`/api/chatbot/sessions/${currentSessionId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
        const data = await res.json();

        // Remove typing indicator
        typing.remove();

        // Show bot response
        appendMessage('assistant', data.response);
        scrollToBottom();

        // Refresh session list (title may have updated)
        loadSessions();
    } catch (err) {
        typing.remove();
        appendMessage('assistant', 'Sorry, something went wrong. Please try again.');
        scrollToBottom();
    }
}

function appendMessage(role, content) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    // Simple markdown-like rendering for bold
    let html = escapeHtml(content)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="chat-link">$1</a>')
        .replace(/\n/g, '<br>');

    div.innerHTML = `<div class="chat-bubble ${role}">${html}</div>`;
    container.appendChild(div);
}

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
