/* ─── Global Drag & Drop File Upload ──────────────────────────── */

(function () {
    'use strict';

    if (!document.body.dataset.role) return;

    var dragCounter = 0;
    var overlay = null;
    var modal = null;
    var droppedFiles = [];
    var fileStates = [];  // {file, dupResult, selected}

    var DOC_TYPE_LABELS = {
        plan:           { label: 'Plan',             dest: '/plans',           icon: 'Plans' },
        submittal:      { label: 'Submittal',        dest: '/submittals',      icon: 'Submittal Library' },
        supplier_quote: { label: 'Supplier Quote',   dest: '/supplier-quotes', icon: 'Supplier Quotes' },
        contract:       { label: 'Contract',         dest: '/contracts',       icon: 'Contracts' },
        license:        { label: 'License',          dest: '/licenses',        icon: 'Licenses' },
        closeout:       { label: 'Closeout Document',dest: '/documents',       icon: 'Documents' }
    };

    // ─── Create Overlay ─────────────────────────────────────────
    overlay = document.createElement('div');
    overlay.className = 'drag-drop-overlay';
    overlay.innerHTML = '<div class="drag-drop-overlay-content">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        '<p>Drop files to upload</p></div>';
    document.body.appendChild(overlay);

    // ─── Create Modal ───────────────────────────────────────────
    modal = document.createElement('div');
    modal.className = 'drag-drop-modal-backdrop';
    modal.style.display = 'none';
    modal.innerHTML =
        '<div class="drag-drop-modal">' +
            '<div class="drag-drop-modal-header">' +
                '<h3>Upload Files</h3>' +
                '<button class="drag-drop-modal-close" id="ddModalClose">&times;</button>' +
            '</div>' +
            '<div class="drag-drop-modal-body">' +
                // File list with per-file dup status (shows first, before options)
                '<div id="ddFileList" class="dd-file-list"></div>' +
                '<div id="ddBulkActions" class="dd-bulk-actions" style="display:none">' +
                    '<button class="btn btn-small" id="ddSelectNew">New Only</button>' +
                    '<button class="btn btn-small" id="ddSelectAll">Select All</button>' +
                    '<button class="btn btn-small" id="ddDeselectAll">Deselect All</button>' +
                '</div>' +
                // Options below file list
                '<div class="dd-upload-options" style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Document Type</label>' +
                        '<select id="ddDocType" class="form-select">' +
                            '<option value="plan">Plan</option>' +
                            '<option value="submittal">Submittal</option>' +
                            '<option value="supplier_quote">Supplier Quote</option>' +
                            '<option value="contract">Contract</option>' +
                            '<option value="license">License</option>' +
                            '<option value="closeout">Closeout Document</option>' +
                        '</select>' +
                    '</div>' +
                    '<div id="ddDestInfo" class="dd-dest-info">Files will be uploaded to <strong>Plans</strong></div>' +
                    '<div class="form-group" id="ddJobGroup" style="margin-top:8px">' +
                        '<label class="form-label">Job</label>' +
                        '<select id="ddJobSelect" class="form-select">' +
                            '<option value="">Loading jobs...</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div id="ddProgress" class="dd-progress" style="display:none">' +
                    '<div class="dd-progress-bar"><div class="dd-progress-bar-inner" id="ddProgressBar"></div></div>' +
                    '<span id="ddProgressText" class="dd-progress-text">Uploading...</span>' +
                '</div>' +
            '</div>' +
            '<div class="drag-drop-modal-footer">' +
                '<button class="btn" id="ddCancelBtn">Cancel</button>' +
                '<button class="btn btn-primary" id="ddUploadBtn">Upload Selected</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);

    // Toast
    var toast = document.createElement('div');
    toast.className = 'dd-toast';
    toast.style.display = 'none';
    document.body.appendChild(toast);

    var ddFileList = document.getElementById('ddFileList');
    var ddDocType = document.getElementById('ddDocType');
    var ddJobSelect = document.getElementById('ddJobSelect');
    var ddJobGroup = document.getElementById('ddJobGroup');
    var ddDestInfo = document.getElementById('ddDestInfo');
    var ddBulkActions = document.getElementById('ddBulkActions');
    var ddProgress = document.getElementById('ddProgress');
    var ddProgressBar = document.getElementById('ddProgressBar');
    var ddProgressText = document.getElementById('ddProgressText');
    var ddUploadBtn = document.getElementById('ddUploadBtn');
    var ddCancelBtn = document.getElementById('ddCancelBtn');
    var ddModalClose = document.getElementById('ddModalClose');

    // ─── Load Jobs ──────────────────────────────────────────────
    var jobsCache = null;
    function loadJobs() {
        if (jobsCache) return Promise.resolve(jobsCache);
        return fetch('/api/jobs/list')
            .then(function (r) { return r.json(); })
            .then(function (jobs) { jobsCache = jobs; return jobs; });
    }
    function populateJobSelect(jobs) {
        ddJobSelect.innerHTML = '<option value="">-- Select Job --</option>';
        jobs.forEach(function (j) {
            var opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.name;
            ddJobSelect.appendChild(opt);
        });
        if (jobs.length === 1) ddJobSelect.value = jobs[0].id;
    }

    ddDocType.addEventListener('change', function () {
        var dt = ddDocType.value;
        var info = DOC_TYPE_LABELS[dt] || {};
        ddJobGroup.style.display = (dt === 'license') ? 'none' : 'block';
        ddDestInfo.innerHTML = 'Files will be uploaded to <strong>' + (info.icon || dt) + '</strong>';
    });

    // ─── Drag Events ────────────────────────────────────────────
    document.addEventListener('dragenter', function (e) {
        e.preventDefault(); e.stopPropagation();
        dragCounter++;
        if (dragCounter === 1) overlay.classList.add('visible');
    });
    document.addEventListener('dragleave', function (e) {
        e.preventDefault(); e.stopPropagation();
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('visible'); }
    });
    document.addEventListener('dragover', function (e) {
        e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        dragCounter = 0;
        overlay.classList.remove('visible');
        var files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        droppedFiles = Array.from(files);
        // Check for BillTrust CSV before showing normal modal
        detectBillTrustImport(droppedFiles).then(function (isBillTrust) {
            if (!isBillTrust) showModal();
        });
    });

    // ─── Duplicate Check (runs immediately on drop, no doc_type needed) ──
    function runDuplicateChecks() {
        // Init all as "checking"
        fileStates = droppedFiles.map(function (f) {
            return { file: f, dupResult: null, selected: true, checking: true };
        });
        renderFileList();

        // Send each file to check endpoint with NO doc_type — checks all tables
        var checks = droppedFiles.map(function (file, i) {
            var formData = new FormData();
            formData.append('file', file);
            // No doc_type → backend checks ALL tables for hash match
            return fetch('/api/files/check-duplicate', { method: 'POST', body: formData })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    fileStates[i].dupResult = data;
                    fileStates[i].checking = false;
                })
                .catch(function () {
                    fileStates[i].dupResult = { is_duplicate: false, match_type: null, matches: [] };
                    fileStates[i].checking = false;
                });
        });

        Promise.all(checks).then(function () {
            // Auto-deselect exact duplicates
            var hasDups = false;
            fileStates.forEach(function (fs) {
                if (fs.dupResult && fs.dupResult.is_duplicate) {
                    hasDups = true;
                    if (fs.dupResult.match_type === 'exact') {
                        fs.selected = false;
                    }
                }
            });
            ddBulkActions.style.display = hasDups ? 'flex' : 'none';
            renderFileList();
            updateUploadBtnText();
        });
    }

    function renderFileList() {
        ddFileList.innerHTML = '';
        fileStates.forEach(function (fs, i) {
            var f = fs.file;
            var size = f.size < 1024 * 1024
                ? (f.size / 1024).toFixed(1) + ' KB'
                : (f.size / (1024 * 1024)).toFixed(1) + ' MB';

            var row = document.createElement('div');
            row.className = 'dd-file-row' + (fs.selected ? '' : ' deselected');

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = fs.selected;
            cb.className = 'dd-file-cb';
            cb.addEventListener('change', (function (idx, rowEl) {
                return function () {
                    fileStates[idx].selected = this.checked;
                    rowEl.classList.toggle('deselected', !this.checked);
                    updateUploadBtnText();
                };
            })(i, row));
            row.appendChild(cb);

            var info = document.createElement('div');
            info.className = 'dd-file-info';
            info.innerHTML = '<span class="dd-file-name">' + escapeHtml(f.name) + '</span>' +
                '<span class="dd-file-size">' + size + '</span>';

            var badge = document.createElement('span');
            badge.className = 'dd-file-badge';

            if (fs.checking) {
                badge.className += ' checking';
                badge.textContent = 'Checking...';
            } else if (fs.dupResult && fs.dupResult.is_duplicate) {
                var matchName = fs.dupResult.matches.length > 0 ? fs.dupResult.matches[0].name : '';
                var matchSource = fs.dupResult.matches.length > 0 && fs.dupResult.matches[0].source
                    ? ' (' + fs.dupResult.matches[0].source.replace('_', ' ') + ')'
                    : '';
                if (fs.dupResult.match_type === 'exact') {
                    badge.className += ' exact';
                    badge.textContent = 'Duplicate';
                } else {
                    badge.className += ' near';
                    badge.textContent = 'Possible Match';
                }
                if (matchName) {
                    var matchInfo = document.createElement('div');
                    matchInfo.className = 'dd-file-match';
                    matchInfo.innerHTML = 'Matches <em>' + escapeHtml(matchName) + '</em>' + escapeHtml(matchSource);
                    info.appendChild(matchInfo);
                }
            } else if (fs.dupResult) {
                badge.className += ' new-file';
                badge.textContent = 'New';
            }

            row.appendChild(info);
            row.appendChild(badge);
            ddFileList.appendChild(row);
        });
    }

    function updateUploadBtnText() {
        var count = fileStates.filter(function (fs) { return fs.selected; }).length;
        ddUploadBtn.textContent = count > 0 ? 'Upload ' + count + ' File' + (count > 1 ? 's' : '') : 'No Files Selected';
        ddUploadBtn.disabled = count === 0;
    }

    // Bulk actions
    document.getElementById('ddSelectNew').addEventListener('click', function () {
        fileStates.forEach(function (fs) {
            var isDup = fs.dupResult && fs.dupResult.is_duplicate && fs.dupResult.match_type === 'exact';
            fs.selected = !isDup;
        });
        renderFileList(); updateUploadBtnText();
    });
    document.getElementById('ddSelectAll').addEventListener('click', function () {
        fileStates.forEach(function (fs) { fs.selected = true; });
        renderFileList(); updateUploadBtnText();
    });
    document.getElementById('ddDeselectAll').addEventListener('click', function () {
        fileStates.forEach(function (fs) { fs.selected = false; });
        renderFileList(); updateUploadBtnText();
    });

    // ─── Modal Logic ────────────────────────────────────────────
    function showModal() {
        ddProgress.style.display = 'none';
        ddBulkActions.style.display = 'none';
        ddProgressBar.style.width = '0%';
        ddUploadBtn.disabled = false;
        ddUploadBtn.textContent = 'Upload Selected';
        ddDocType.value = 'plan';
        ddJobGroup.style.display = 'block';
        ddDestInfo.innerHTML = 'Files will be uploaded to <strong>Plans</strong>';
        loadJobs().then(populateJobSelect);
        modal.style.display = 'flex';

        // Run duplicate checks IMMEDIATELY — no doc_type needed for hash check
        runDuplicateChecks();
    }

    function hideModal() {
        modal.style.display = 'none';
        droppedFiles = [];
        fileStates = [];
    }

    function showToast(message, link, duration) {
        toast.innerHTML = message + (link ? ' <a href="' + link + '">View &rarr;</a>' : '');
        toast.style.display = 'block';
        toast.classList.add('visible');
        setTimeout(function () {
            toast.classList.remove('visible');
            setTimeout(function () { toast.style.display = 'none'; }, 300);
        }, duration || 4000);
    }

    ddCancelBtn.addEventListener('click', hideModal);
    ddModalClose.addEventListener('click', hideModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) hideModal(); });

    // ─── Upload Routes ──────────────────────────────────────────
    var UPLOAD_ROUTES = {
        plan: {
            url: '/api/plans',
            fields: function (f, jobId) {
                return { job_id: jobId, title: f.name.replace(/\.[^.]+$/, ''), plan_type: 'Mechanical' };
            }
        },
        submittal: {
            url: '/api/submittal-library',
            fields: function (f) {
                return { title: f.name.replace(/\.[^.]+$/, '') };
            }
        },
        supplier_quote: {
            url: '/api/supplier-quotes',
            fields: function (f, jobId) {
                return { job_id: jobId, supplier_name: f.name.replace(/\.[^.]+$/, ''), status: 'Received' };
            }
        },
        contract: {
            url: '/api/contracts',
            fields: function (f, jobId) {
                return { job_id: jobId, title: f.name.replace(/\.[^.]+$/, ''), contract_type: 'Prime' };
            }
        },
        license: {
            url: '/api/licenses',
            fields: function (f) {
                return { license_type: 'Trade', license_name: f.name.replace(/\.[^.]+$/, '') };
            }
        },
        closeout: {
            url: '/api/documents/checklist',
            fields: function (f, jobId) {
                return { job_id: jobId, item_name: f.name.replace(/\.[^.]+$/, ''), item_type: 'Other' };
            }
        }
    };

    // ─── Upload ─────────────────────────────────────────────────
    ddUploadBtn.addEventListener('click', function () {
        var docType = ddDocType.value;
        var jobId = ddJobSelect.value;

        if (docType !== 'license' && !jobId) {
            alert('Please select a job.');
            return;
        }

        var route = UPLOAD_ROUTES[docType];
        if (!route || !route.url) return;

        var toUpload = fileStates.filter(function (fs) { return fs.selected; });
        if (toUpload.length === 0) return;

        ddUploadBtn.disabled = true;
        ddUploadBtn.textContent = 'Uploading...';
        ddProgress.style.display = 'flex';

        var total = toUpload.length;
        var uploaded = 0;
        var errors = [];

        function uploadNext(index) {
            if (index >= total) {
                ddProgressBar.style.width = '100%';
                var info = DOC_TYPE_LABELS[docType] || {};
                if (errors.length > 0) {
                    ddProgressText.textContent = uploaded + ' uploaded, ' + errors.length + ' failed';
                    setTimeout(function () {
                        hideModal();
                        if (uploaded > 0) showToast(uploaded + ' file(s) uploaded to <strong>' + (info.icon || docType) + '</strong>.', info.dest);
                    }, 1500);
                } else {
                    ddProgressText.textContent = uploaded + ' file(s) uploaded!';
                    hideModal();
                    showToast(uploaded + ' file(s) uploaded to <strong>' + (info.icon || docType) + '</strong>.', info.dest);
                }
                return;
            }

            var fs = toUpload[index];
            var pct = Math.round(((index + 0.5) / total) * 100);
            ddProgressBar.style.width = pct + '%';
            ddProgressText.textContent = 'Uploading ' + (index + 1) + ' of ' + total + '...';

            var formData = new FormData();
            formData.append('file', fs.file);
            var fields = route.fields(fs.file, jobId);
            for (var key in fields) {
                formData.append(key, fields[key]);
            }

            fetch(route.url, { method: 'POST', body: formData })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.error) { errors.push(fs.file.name + ': ' + data.error); }
                    else { uploaded++; }
                    uploadNext(index + 1);
                })
                .catch(function (err) {
                    errors.push(fs.file.name + ': ' + err.message);
                    uploadNext(index + 1);
                });
        }
        uploadNext(0);
    });

    function escapeHtml(text) {
        var d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    // ─── BillTrust CSV+PDF Import ───────────────────────────────
    var btModal = null;

    function createBtModal() {
        if (btModal) return;
        btModal = document.createElement('div');
        btModal.className = 'drag-drop-modal-backdrop';
        btModal.style.display = 'none';
        btModal.innerHTML =
            '<div class="drag-drop-modal" style="max-width:640px">' +
                '<div class="drag-drop-modal-header">' +
                    '<h3>BillTrust Invoice Import</h3>' +
                    '<button class="drag-drop-modal-close" id="btModalClose">&times;</button>' +
                '</div>' +
                '<div class="drag-drop-modal-body">' +
                    '<div id="btDetectedFiles" style="margin-bottom:12px"></div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Supplier</label>' +
                        '<select id="btSupplier" class="form-select">' +
                            '<option value="Locke Supply">Locke Supply</option>' +
                            '<option value="Plumb Supply">Plumb Supply</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-top:8px">' +
                        '<label class="form-label">Job</label>' +
                        '<select id="btJobSelect" class="form-select">' +
                            '<option value="">Loading jobs...</option>' +
                        '</select>' +
                    '</div>' +
                    '<div id="btProgress" style="display:none;margin-top:12px">' +
                        '<div class="dd-progress-bar"><div class="dd-progress-bar-inner" id="btProgressBar" style="width:0%"></div></div>' +
                        '<span id="btProgressText" class="dd-progress-text">Preparing...</span>' +
                    '</div>' +
                    '<div id="btResults" style="display:none;margin-top:14px"></div>' +
                '</div>' +
                '<div class="drag-drop-modal-footer">' +
                    '<button class="btn" id="btCancelBtn">Cancel</button>' +
                    '<button class="btn btn-primary" id="btImportBtn">Import Invoices</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(btModal);

        document.getElementById('btModalClose').addEventListener('click', hideBtModal);
        document.getElementById('btCancelBtn').addEventListener('click', hideBtModal);
        btModal.addEventListener('click', function (e) { if (e.target === btModal) hideBtModal(); });
        document.getElementById('btImportBtn').addEventListener('click', runBtImport);
    }

    function hideBtModal() {
        if (btModal) btModal.style.display = 'none';
        droppedFiles = [];
    }

    function detectBillTrustImport(files) {
        // Find CSV and PDF files
        var csvFiles = [];
        var pdfFiles = [];
        for (var i = 0; i < files.length; i++) {
            var name = files[i].name.toLowerCase();
            if (name.endsWith('.csv')) csvFiles.push(files[i]);
            else if (name.endsWith('.pdf')) pdfFiles.push(files[i]);
        }

        // Path 1: CSV present — check header for BillTrust columns
        if (csvFiles.length > 0) {
            return new Promise(function (resolve) {
                var reader = new FileReader();
                reader.onload = function () {
                    var header = reader.result || '';
                    if (header.indexOf('INVOICE_NUMBER') !== -1 && header.indexOf('TOTAL_DUE') !== -1) {
                        showBtModal(csvFiles, pdfFiles);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                };
                reader.onerror = function () { resolve(false); };
                reader.readAsText(csvFiles[0].slice(0, 1024));
            });
        }

        // Path 2: PDF only — ask server to check first page for supplier names
        if (pdfFiles.length > 0 && pdfFiles.length <= 2) {
            var formData = new FormData();
            formData.append('pdf_file', pdfFiles[0]);
            return fetch('/api/billtrust/detect-pdf', { method: 'POST', body: formData })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.is_billtrust) {
                        showBtModal([], pdfFiles, data.supplier_name || '');
                        return true;
                    }
                    return false;
                })
                .catch(function () { return false; });
        }

        return Promise.resolve(false);
    }

    function showBtModal(csvFiles, pdfFiles, detectedSupplier) {
        createBtModal();
        var det = document.getElementById('btDetectedFiles');
        var badges = '';
        csvFiles.forEach(function (f) {
            badges += '<span style="display:inline-block;padding:4px 10px;border-radius:4px;background:#e0f2fe;color:#0369a1;font-size:13px;margin:2px 4px 2px 0">' +
                escapeHtml(f.name) + ' (CSV)</span>';
        });
        pdfFiles.forEach(function (f) {
            badges += '<span style="display:inline-block;padding:4px 10px;border-radius:4px;background:#fce7f3;color:#be185d;font-size:13px;margin:2px 4px 2px 0">' +
                escapeHtml(f.name) + ' (PDF)</span>';
        });
        if (csvFiles.length === 0) {
            badges += '<span style="display:inline-block;padding:4px 10px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:13px;margin:2px 4px 2px 0">No CSV — headers from PDF only</span>';
        }
        if (pdfFiles.length === 0) {
            badges += '<span style="display:inline-block;padding:4px 10px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:13px;margin:2px 4px 2px 0">No PDF — line items will be skipped</span>';
        }
        det.innerHTML = '<div style="font-size:13px;color:#6b7280;margin-bottom:4px">Detected BillTrust export files:</div>' + badges;

        // Auto-select supplier if detected from PDF
        if (detectedSupplier) {
            var sel = document.getElementById('btSupplier');
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === detectedSupplier) { sel.selectedIndex = i; break; }
            }
        }

        // Store references for import
        btModal._csvFiles = csvFiles;
        btModal._pdfFiles = pdfFiles;

        // Reset state
        document.getElementById('btProgress').style.display = 'none';
        document.getElementById('btResults').style.display = 'none';
        document.getElementById('btImportBtn').disabled = false;
        document.getElementById('btImportBtn').textContent = 'Import Invoices';
        document.getElementById('btProgressBar').style.width = '0%';

        // Populate job selector
        var btJobSel = document.getElementById('btJobSelect');
        loadJobs().then(function (jobs) {
            btJobSel.innerHTML = '<option value="">-- Select Job --</option>';
            jobs.forEach(function (j) {
                var opt = document.createElement('option');
                opt.value = j.id;
                opt.textContent = j.name;
                btJobSel.appendChild(opt);
            });
            if (jobs.length === 1) btJobSel.value = jobs[0].id;
        });

        btModal.style.display = 'flex';
    }

    function runBtImport() {
        var importBtn = document.getElementById('btImportBtn');
        var progressDiv = document.getElementById('btProgress');
        var progressBar = document.getElementById('btProgressBar');
        var progressText = document.getElementById('btProgressText');
        var resultsDiv = document.getElementById('btResults');

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        progressDiv.style.display = 'flex';
        resultsDiv.style.display = 'none';

        // Animate progress
        progressBar.style.width = '15%';
        progressText.textContent = 'Uploading files...';

        var btJobId = document.getElementById('btJobSelect').value;
        if (!btJobId) {
            alert('Please select a job for these invoices.');
            importBtn.disabled = false;
            importBtn.textContent = 'Import Invoices';
            progressDiv.style.display = 'none';
            return;
        }

        var formData = new FormData();
        if (btModal._csvFiles.length > 0) {
            formData.append('csv_file', btModal._csvFiles[0]);
        }
        if (btModal._pdfFiles.length > 0) {
            formData.append('pdf_file', btModal._pdfFiles[0]);
        }
        formData.append('supplier_name', document.getElementById('btSupplier').value);
        formData.append('job_id', btJobId);

        // Animate progress while waiting
        var pct = 15;
        var animTimer = setInterval(function () {
            if (pct < 85) {
                pct += Math.random() * 8;
                progressBar.style.width = Math.min(pct, 85) + '%';
                if (pct > 30 && pct < 60) progressText.textContent = 'Extracting PDF line items with AI...';
                else if (pct >= 60) progressText.textContent = 'Running AI review...';
            }
        }, 800);

        fetch('/api/billtrust/import', { method: 'POST', body: formData })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                clearInterval(animTimer);
                progressBar.style.width = '100%';

                if (data.error) {
                    progressText.textContent = 'Error: ' + data.error;
                    importBtn.textContent = 'Retry';
                    importBtn.disabled = false;
                    return;
                }

                progressText.textContent = 'Complete!';
                importBtn.style.display = 'none';
                renderBtResults(data, resultsDiv);
            })
            .catch(function (err) {
                clearInterval(animTimer);
                progressText.textContent = 'Error: ' + err.message;
                importBtn.textContent = 'Retry';
                importBtn.disabled = false;
            });
    }

    function renderBtResults(data, container) {
        container.style.display = 'block';
        var stats = data.stats || {};
        var invoices = data.invoices || [];
        var flags = data.ai_flags || [];
        var jobLinks = data.job_links || {};

        var html = '';

        // Summary
        html += '<div style="padding:10px 14px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;margin-bottom:10px">' +
            '<strong>' + (stats.new || 0) + ' new</strong>, ' +
            '<strong>' + (stats.updated || 0) + ' updated</strong>, ' +
            (stats.errors ? '<span style="color:#dc2626">' + stats.errors + ' errors</span>' : '0 errors') +
            ' &mdash; ' + (stats.total || 0) + ' invoices processed</div>';

        // Job links
        var linkKeys = Object.keys(jobLinks);
        if (linkKeys.length > 0) {
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px">Auto-linked to jobs:</div>';
            linkKeys.forEach(function (invNum) {
                html += '<div style="font-size:13px;padding:2px 0"><code>' + escapeHtml(invNum) + '</code> &rarr; <strong>' + escapeHtml(jobLinks[invNum]) + '</strong></div>';
            });
            html += '</div>';
        }

        // AI Review Flags
        if (flags.length > 0) {
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px">AI Review Flags:</div>';
            flags.forEach(function (flag) {
                var color, bg;
                if (flag.severity === 'error') { color = '#dc2626'; bg = '#fef2f2'; }
                else if (flag.severity === 'warning') { color = '#d97706'; bg = '#fffbeb'; }
                else { color = '#2563eb'; bg = '#eff6ff'; }
                html += '<div style="padding:6px 10px;margin-bottom:4px;border-radius:4px;background:' + bg + ';font-size:13px;border-left:3px solid ' + color + '">' +
                    '<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + color + ';color:#fff;font-size:11px;margin-right:6px">' +
                    escapeHtml(flag.severity) + '</span>' +
                    '<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:#e5e7eb;color:#374151;font-size:11px;margin-right:6px">' +
                    escapeHtml(flag.category || '') + '</span>' +
                    (flag.invoice_number ? '<code style="font-size:12px;margin-right:6px">' + escapeHtml(flag.invoice_number) + '</code>' : '') +
                    escapeHtml(flag.message || '') +
                    '</div>';
            });
            html += '</div>';
        }

        // Invoice table
        if (invoices.length > 0) {
            html += '<div style="max-height:200px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px">';
            html += '<table style="width:100%;font-size:13px;border-collapse:collapse">';
            html += '<thead><tr style="background:#f9fafb;position:sticky;top:0">' +
                '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb">Invoice #</th>' +
                '<th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">Total</th>' +
                '<th style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">Items</th>' +
                '<th style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">Status</th>' +
                '</tr></thead><tbody>';
            invoices.forEach(function (inv) {
                var badge = inv.is_new
                    ? '<span style="padding:1px 6px;border-radius:3px;background:#dcfce7;color:#166534;font-size:11px">New</span>'
                    : '<span style="padding:1px 6px;border-radius:3px;background:#e0f2fe;color:#0369a1;font-size:11px">Updated</span>';
                html += '<tr>' +
                    '<td style="padding:5px 8px;border-bottom:1px solid #f3f4f6"><code>' + escapeHtml(inv.invoice_number) + '</code></td>' +
                    '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">$' + (inv.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</td>' +
                    '<td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f3f4f6">' + (inv.line_item_count || 0) + '</td>' +
                    '<td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f3f4f6">' + badge + '</td>' +
                    '</tr>';
            });
            html += '</tbody></table></div>';
        }

        // View All link
        html += '<div style="text-align:center;margin-top:12px">' +
            '<a href="/invoices" class="btn btn-primary" style="font-size:13px">View All Invoices</a>' +
            '</div>';

        container.innerHTML = html;
    }

})();
