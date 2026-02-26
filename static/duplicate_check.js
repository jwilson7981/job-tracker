/* ─── Duplicate File Detection UI ─────────────────────────────── */

(function () {
    'use strict';

    // Create duplicate warning modal (appended to body once)
    var dupModal = document.createElement('div');
    dupModal.className = 'dup-modal-backdrop';
    dupModal.style.display = 'none';
    dupModal.innerHTML =
        '<div class="dup-modal">' +
            '<div class="dup-modal-header">' +
                '<h3 id="dupTitle">Duplicate Detected</h3>' +
            '</div>' +
            '<div class="dup-modal-body">' +
                '<div id="dupMessage" class="dup-message"></div>' +
                '<div id="dupMatches" class="dup-matches"></div>' +
            '</div>' +
            '<div class="dup-modal-footer">' +
                '<button class="btn" id="dupSkipBtn">Skip</button>' +
                '<button class="btn btn-primary" id="dupUploadBtn">Upload as New</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(dupModal);

    var dupTitle = document.getElementById('dupTitle');
    var dupMessage = document.getElementById('dupMessage');
    var dupMatches = document.getElementById('dupMatches');
    var dupSkipBtn = document.getElementById('dupSkipBtn');
    var dupUploadBtn = document.getElementById('dupUploadBtn');

    var currentResolve = null;

    function hideDupModal() {
        dupModal.style.display = 'none';
        if (currentResolve) {
            currentResolve(false); // skip by default
            currentResolve = null;
        }
    }

    dupSkipBtn.addEventListener('click', function () {
        dupModal.style.display = 'none';
        if (currentResolve) {
            var r = currentResolve;
            currentResolve = null;
            r(false); // skip
        }
    });

    dupUploadBtn.addEventListener('click', function () {
        dupModal.style.display = 'none';
        if (currentResolve) {
            var r = currentResolve;
            currentResolve = null;
            r(true); // upload as new
        }
    });

    dupModal.addEventListener('click', function (e) {
        if (e.target === dupModal) hideDupModal();
    });

    /**
     * Show duplicate warning modal.
     * Returns a Promise that resolves to:
     *   true  = proceed with upload
     *   false = skip this file
     */
    window.showDuplicateWarning = function (file, dupData, docType, jobId) {
        return new Promise(function (resolve) {
            currentResolve = resolve;

            var matchType = dupData.match_type;
            if (matchType === 'exact') {
                dupTitle.textContent = 'Exact Duplicate Found';
                dupMessage.innerHTML = '<strong>' + escapeHtml(file.name) + '</strong> is an exact match of an existing file.';
            } else {
                dupTitle.textContent = 'Possible Duplicate Found';
                dupMessage.innerHTML = '<strong>' + escapeHtml(file.name) + '</strong> appears similar to existing file(s).';
            }

            // Show matches
            dupMatches.innerHTML = '';
            if (dupData.matches && dupData.matches.length > 0) {
                dupData.matches.forEach(function (m) {
                    var div = document.createElement('div');
                    div.className = 'dup-match-item';
                    div.innerHTML = '<span class="dup-match-badge">' +
                        (matchType === 'exact' ? 'Exact Match' : 'Similar') +
                        '</span> ' + escapeHtml(m.name || 'ID: ' + m.id);
                    dupMatches.appendChild(div);
                });
            }

            dupModal.style.display = 'flex';
        });
    };

    /**
     * Check a file for duplicates via API.
     */
    window.checkFileDuplicate = function (file, docType) {
        var formData = new FormData();
        formData.append('file', file);
        formData.append('doc_type', docType);

        return fetch('/api/files/check-duplicate', {
            method: 'POST',
            body: formData
        })
        .then(function (r) { return r.json(); });
    };

    function escapeHtml(text) {
        var d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }
})();
