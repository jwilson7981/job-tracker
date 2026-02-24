/* ─── Floating Chat Widget ────────────────────────────────────── */

(function () {
    const widget = document.getElementById('chatWidget');
    const header = document.getElementById('chatWidgetHeader');
    const body = document.getElementById('chatWidgetBody');
    const toggle = document.getElementById('chatWidgetToggle');
    const input = document.getElementById('widgetInput');
    const sendBtn = document.getElementById('widgetSendBtn');
    const micBtn = document.getElementById('widgetMicBtn');
    const messagesEl = document.getElementById('widgetMessages');

    if (!widget) return;

    let expanded = false;
    let sessionId = null;
    let sending = false;

    /* ─── Speech Recognition Setup ───────────────────────────── */
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let listening = false;

    if (SpeechRecognition && micBtn) {
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = function () {
            listening = true;
            micBtn.classList.add('listening');
            input.placeholder = 'Listening...';
        };

        recognition.onresult = function (e) {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            input.value = transcript;
            // Auto-send on final result
            if (e.results[e.results.length - 1].isFinal) {
                stopListening();
                send();
            }
        };

        recognition.onerror = function (e) {
            stopListening();
            if (e.error === 'not-allowed') {
                appendMsg('assistant', 'Microphone access denied. Please allow microphone permissions in your browser settings.');
            }
        };

        recognition.onend = function () {
            stopListening();
        };

        micBtn.addEventListener('click', function () {
            if (listening) {
                recognition.stop();
            } else {
                // Expand widget if collapsed
                if (!expanded) {
                    expanded = true;
                    widget.classList.add('expanded');
                    toggle.innerHTML = '&#9660;';
                }
                recognition.start();
            }
        });
    } else if (micBtn) {
        micBtn.classList.add('unsupported');
    }

    function stopListening() {
        listening = false;
        if (micBtn) {
            micBtn.classList.remove('listening');
        }
        input.placeholder = 'Type or tap mic...';
    }

    /* ─── Core Chat Functions ────────────────────────────────── */

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
