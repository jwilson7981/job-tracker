/* ─── Floating Chat Widget ────────────────────────────────────── */

(function () {
    const widget = document.getElementById('chatWidget');
    const header = document.getElementById('chatWidgetHeader');
    const body = document.getElementById('chatWidgetBody');
    const toggle = document.getElementById('chatWidgetToggle');
    const input = document.getElementById('widgetInput');
    const sendBtn = document.getElementById('widgetSendBtn');
    const messagesEl = document.getElementById('widgetMessages');

    if (!widget) return;

    let expanded = false;
    let sessionId = null;
    let sending = false;

    header.addEventListener('click', function () {
        expanded = !expanded;
        widget.classList.toggle('expanded', expanded);
        toggle.innerHTML = expanded ? '&#9660;' : '&#9650;';
        if (expanded) input.focus();
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') send();
    });
    sendBtn.addEventListener('click', send);

    async function ensureSession() {
        if (sessionId) return;
        const res = await fetch('/api/chatbot/sessions', { method: 'POST' });
        const data = await res.json();
        sessionId = data.id;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    function formatContent(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="chat-link">$1</a>')
            .replace(/\n/g, '<br>');
    }

    function appendMsg(role, content) {
        // Remove welcome
        const welcome = messagesEl.querySelector('.chat-widget-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.className = 'chat-message ' + role;
        div.innerHTML = '<div class="chat-bubble ' + role + '">' + formatContent(content) + '</div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /**
     * Check for [NAV:/path] prefix in bot response.
     * If found, show the message and navigate after a short delay.
     * Returns the display text (with marker stripped).
     */
    function checkNavigation(response) {
        const navMatch = response.match(/^\[NAV:(\/[^\]]+)\]\s*/);
        if (navMatch) {
            const url = navMatch[1];
            const displayText = response.replace(navMatch[0], '');
            setTimeout(function () {
                window.location.href = url;
            }, 800);
            return displayText;
        }
        return response;
    }

    async function send() {
        const msg = input.value.trim();
        if (!msg || sending) return;
        sending = true;

        await ensureSession();
        appendMsg('user', msg);
        input.value = '';

        // Typing indicator
        const typing = document.createElement('div');
        typing.className = 'chat-message assistant';
        typing.innerHTML = '<div class="chat-bubble assistant"><span class="typing-dots">...</span></div>';
        messagesEl.appendChild(typing);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            const res = await fetch('/api/chatbot/sessions/' + sessionId + '/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: msg })
            });
            const data = await res.json();
            typing.remove();
            const displayText = checkNavigation(data.response);
            appendMsg('assistant', displayText);
        } catch (err) {
            typing.remove();
            appendMsg('assistant', 'Sorry, something went wrong.');
        }
        sending = false;
    }
})();
