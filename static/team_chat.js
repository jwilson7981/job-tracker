/* ─── Team Chat ─────────────────────────────────────────────── */
(function() {
    'use strict';

    // State
    let tcChannels = [];
    let tcDMConversations = [];
    let tcCurrentView = null; // { type: 'channel'|'dm', id: number }
    let tcMessages = [];
    let tcPollingInterval = null;
    let tcLastMessageId = 0;
    let tcSelectedFile = null;
    let tcAllUsers = [];

    // ─── Init ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function() {
        await loadChannels();
        await loadDMConversations();
        await loadAllUsers();

        // Deep-link from URL params
        const params = new URLSearchParams(window.location.search);
        if (params.get('channel')) {
            openChannel(parseInt(params.get('channel')));
        } else if (params.get('dm')) {
            openDM(parseInt(params.get('dm')));
        }
    });

    // ─── Channels ───────────────────────────────────────────
    async function loadChannels() {
        try {
            const res = await fetch('/api/team-chat/channels');
            if (!res.ok) return;
            tcChannels = await res.json();
            renderChannelList();
        } catch(e) { console.error('loadChannels', e); }
    }

    function renderChannelList() {
        const el = document.getElementById('tcChannelList');
        if (!el) return;
        el.innerHTML = tcChannels.map(ch => {
            const active = tcCurrentView && tcCurrentView.type === 'channel' && tcCurrentView.id === ch.id ? ' active' : '';
            const badge = ch.unread_count > 0 ? `<span class="tc-unread-badge">${ch.unread_count}</span>` : '';
            return `<div class="tc-sidebar-item${active}" onclick="window._tcOpenChannel(${ch.id})">
                <span class="tc-sidebar-item-name"># ${escapeHtml(ch.name)}</span>${badge}
            </div>`;
        }).join('');
    }

    async function openChannel(id) {
        tcCurrentView = { type: 'channel', id: id };
        renderChannelList();
        renderDMList();

        const ch = tcChannels.find(c => c.id === id);
        const headerName = document.getElementById('tcHeaderName');
        const headerDesc = document.getElementById('tcHeaderDesc');
        headerName.textContent = ch ? '# ' + ch.name : '# channel';
        headerDesc.textContent = ch ? (ch.description || '') : '';

        showChatArea();
        await loadMessages();
        startPolling();

        // Update URL without reload
        history.replaceState(null, '', '/team-chat?channel=' + id);
    }
    window._tcOpenChannel = openChannel;

    // ─── Direct Messages ────────────────────────────────────
    async function loadDMConversations() {
        try {
            const res = await fetch('/api/team-chat/dm/conversations');
            if (!res.ok) return;
            tcDMConversations = await res.json();
            renderDMList();
        } catch(e) { console.error('loadDMConversations', e); }
    }

    function renderDMList() {
        const el = document.getElementById('tcDMList');
        if (!el) return;
        el.innerHTML = tcDMConversations.map(dm => {
            const active = tcCurrentView && tcCurrentView.type === 'dm' && tcCurrentView.id === dm.peer_id ? ' active' : '';
            const badge = dm.unread_count > 0 ? `<span class="tc-unread-badge">${dm.unread_count}</span>` : '';
            return `<div class="tc-sidebar-item${active}" onclick="window._tcOpenDM(${dm.peer_id})">
                <span class="tc-sidebar-item-name">${escapeHtml(dm.display_name)}</span>${badge}
            </div>`;
        }).join('');
    }

    async function openDM(peerId) {
        tcCurrentView = { type: 'dm', id: peerId };
        renderChannelList();
        renderDMList();

        // Find peer name
        let peerName = 'User';
        const dm = tcDMConversations.find(d => d.peer_id === peerId);
        if (dm) peerName = dm.display_name;
        else {
            const u = tcAllUsers.find(u => u.id === peerId);
            if (u) peerName = u.display_name || u.username;
        }

        document.getElementById('tcHeaderName').textContent = peerName;
        document.getElementById('tcHeaderDesc').textContent = 'Direct Message';

        showChatArea();
        await loadMessages();
        startPolling();

        history.replaceState(null, '', '/team-chat?dm=' + peerId);
    }
    window._tcOpenDM = openDM;

    // ─── Messages ───────────────────────────────────────────
    async function loadMessages(beforeId) {
        if (!tcCurrentView) return;
        let url;
        if (tcCurrentView.type === 'channel') {
            url = `/api/team-chat/channels/${tcCurrentView.id}/messages`;
        } else {
            url = `/api/team-chat/dm/${tcCurrentView.id}/messages`;
        }
        if (beforeId) url += '?before_id=' + beforeId;

        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const msgs = await res.json();
            if (!beforeId) {
                tcMessages = msgs;
            } else {
                tcMessages = msgs.concat(tcMessages);
            }
            renderMessages();

            // Mark as read
            if (tcMessages.length > 0) {
                const lastId = tcMessages[tcMessages.length - 1].id;
                tcLastMessageId = lastId;
                markRead(lastId);
            }
        } catch(e) { console.error('loadMessages', e); }
    }

    function renderMessages() {
        const el = document.getElementById('tcMessages');
        if (!el) return;

        if (tcMessages.length === 0) {
            el.innerHTML = '<div class="tc-no-messages">No messages yet. Start the conversation!</div>';
            return;
        }

        let html = '';
        let lastDate = '';

        tcMessages.forEach(msg => {
            const msgDate = formatDate(msg.created_at);
            if (msgDate !== lastDate) {
                html += `<div class="tc-date-separator"><span>${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            if (msg.is_system) {
                html += `<div class="tc-system-message">${escapeHtml(msg.content)}</div>`;
                return;
            }

            const initials = getInitials(msg.sender_name || 'U');
            const isOwn = msg.sender_id === currentUserId;
            html += `<div class="tc-message${isOwn ? ' tc-message-own' : ''}">
                <div class="tc-message-avatar" title="${escapeHtml(msg.sender_name || '')}">${initials}</div>
                <div class="tc-message-body">
                    <div class="tc-message-meta">
                        <span class="tc-message-sender">${escapeHtml(msg.sender_name || 'Unknown')}</span>
                        <span class="tc-message-time">${formatTime(msg.created_at)}</span>
                    </div>
                    ${msg.content ? `<div class="tc-message-text">${formatMessageText(msg.content)}</div>` : ''}
                    ${renderFileAttachment(msg)}
                </div>
            </div>`;
        });

        el.innerHTML = html;
        el.scrollTop = el.scrollHeight;
    }

    function renderFileAttachment(msg) {
        if (!msg.file_name) return '';
        const fileUrl = `/api/team-chat/files/${msg.id}`;
        if (msg.file_type && msg.file_type.startsWith('image/')) {
            return `<div class="tc-message-image"><img src="${fileUrl}" alt="${escapeHtml(msg.file_name)}" onclick="window.open('${fileUrl}','_blank')"></div>`;
        }
        return `<a href="${fileUrl}" class="tc-file-link" target="_blank">&#128206; ${escapeHtml(msg.file_name)}</a>`;
    }

    // ─── Send Message ───────────────────────────────────────
    async function sendMessage() {
        const input = document.getElementById('tcMessageInput');
        const content = input.value.trim();
        if (!content && !tcSelectedFile) return;
        if (!tcCurrentView) return;

        const formData = new FormData();
        if (content) formData.append('content', content);
        if (tcSelectedFile) formData.append('file', tcSelectedFile);

        let url;
        if (tcCurrentView.type === 'channel') {
            url = `/api/team-chat/channels/${tcCurrentView.id}/messages`;
        } else {
            url = `/api/team-chat/dm/${tcCurrentView.id}/messages`;
        }

        input.value = '';
        clearFileAttachment();

        try {
            const res = await fetch(url, { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to send message');
                return;
            }
            await loadMessages();
            // Refresh DM list if it's a new conversation
            if (tcCurrentView.type === 'dm') {
                await loadDMConversations();
            }
        } catch(e) { console.error('sendMessage', e); }
    }
    window.sendMessage = sendMessage;

    // ─── File Handling ──────────────────────────────────────
    function handleFileSelect(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
            alert('File too large. Max 25MB.');
            input.value = '';
            return;
        }
        tcSelectedFile = file;
        const preview = document.getElementById('tcFilePreview');
        preview.style.display = 'flex';
        preview.innerHTML = `<span class="tc-file-preview-name">&#128206; ${escapeHtml(file.name)}</span>
            <button class="tc-file-preview-remove" onclick="window._tcClearFile()">&times;</button>`;
        input.value = '';
    }
    window.handleFileSelect = handleFileSelect;

    function clearFileAttachment() {
        tcSelectedFile = null;
        const preview = document.getElementById('tcFilePreview');
        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
    }
    window._tcClearFile = clearFileAttachment;

    // ─── Polling ────────────────────────────────────────────
    function startPolling() {
        stopPolling();
        tcPollingInterval = setInterval(pollNewMessages, 5000);
    }

    function stopPolling() {
        if (tcPollingInterval) {
            clearInterval(tcPollingInterval);
            tcPollingInterval = null;
        }
    }

    async function pollNewMessages() {
        if (!tcCurrentView) return;
        let url;
        if (tcCurrentView.type === 'channel') {
            url = `/api/team-chat/channels/${tcCurrentView.id}/messages`;
        } else {
            url = `/api/team-chat/dm/${tcCurrentView.id}/messages`;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const msgs = await res.json();
            if (msgs.length > 0) {
                const newLastId = msgs[msgs.length - 1].id;
                if (newLastId > tcLastMessageId) {
                    tcMessages = msgs;
                    renderMessages();
                    tcLastMessageId = newLastId;
                    markRead(newLastId);
                    // Refresh sidebar counts
                    loadChannels();
                    loadDMConversations();
                }
            }
        } catch(e) { /* ignore */ }
    }

    // ─── Mark Read ──────────────────────────────────────────
    async function markRead(messageId) {
        if (!tcCurrentView) return;
        let url;
        if (tcCurrentView.type === 'channel') {
            url = `/api/team-chat/channels/${tcCurrentView.id}/read`;
        } else {
            url = `/api/team-chat/dm/${tcCurrentView.id}/read`;
        }
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ last_message_id: messageId })
            });
        } catch(e) { /* ignore */ }
    }

    // ─── Channel / DM Creation ──────────────────────────────
    function showCreateChannel() {
        document.getElementById('newChannelName').value = '';
        document.getElementById('newChannelDesc').value = '';
        document.getElementById('createChannelModal').style.display = 'flex';
        document.getElementById('newChannelName').focus();
    }
    window.showCreateChannel = showCreateChannel;

    async function createChannel() {
        const name = document.getElementById('newChannelName').value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const desc = document.getElementById('newChannelDesc').value.trim();
        if (!name) { alert('Channel name is required'); return; }

        try {
            const res = await fetch('/api/team-chat/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to create channel');
                return;
            }
            const data = await res.json();
            document.getElementById('createChannelModal').style.display = 'none';
            await loadChannels();
            openChannel(data.id);
        } catch(e) { console.error('createChannel', e); }
    }
    window.createChannel = createChannel;

    async function loadAllUsers() {
        try {
            const res = await fetch('/api/team-chat/users');
            if (res.ok) {
                const users = await res.json();
                tcAllUsers = users.filter(u => u.id !== currentUserId);
            }
        } catch(e) { /* ignore */ }
    }

    function showNewDM() {
        const sel = document.getElementById('newDMUser');
        sel.innerHTML = '<option value="">-- Select user --</option>' +
            tcAllUsers.map(u => `<option value="${u.id}">${escapeHtml(u.display_name || u.username)}</option>`).join('');
        document.getElementById('newDMModal').style.display = 'flex';
    }
    window.showNewDM = showNewDM;

    function startDM() {
        const sel = document.getElementById('newDMUser');
        const peerId = parseInt(sel.value);
        if (!peerId) { alert('Please select a user'); return; }
        document.getElementById('newDMModal').style.display = 'none';
        openDM(peerId);
    }
    window.startDM = startDM;

    // ─── UI Helpers ─────────────────────────────────────────
    function showChatArea() {
        document.getElementById('tcPlaceholder').style.display = 'none';
        document.getElementById('tcHeader').style.display = 'flex';
        document.getElementById('tcMessages').style.display = 'flex';
        document.getElementById('tcInputBar').style.display = 'block';

        // Mobile: show main, hide sidebar
        const sidebar = document.getElementById('tcSidebar');
        const main = document.getElementById('tcMain');
        const backBtn = document.getElementById('tcMobileBack');
        if (window.innerWidth < 768) {
            sidebar.classList.add('tc-sidebar-hidden');
            main.classList.add('tc-main-active');
            backBtn.style.display = 'block';
        }
    }

    function closeMobileChat() {
        const sidebar = document.getElementById('tcSidebar');
        const main = document.getElementById('tcMain');
        const backBtn = document.getElementById('tcMobileBack');
        sidebar.classList.remove('tc-sidebar-hidden');
        main.classList.remove('tc-main-active');
        backBtn.style.display = 'none';
    }
    window.closeMobileChat = closeMobileChat;

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    }

    function formatTime(dateStr) {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch(e) { return dateStr; }
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
        } catch(e) { return dateStr; }
    }

    function formatMessageText(text) {
        // Escape HTML first then handle line breaks and URLs
        let safe = escapeHtml(text);
        // URLs
        safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        // Newlines
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }
})();
