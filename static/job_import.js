/* ─── Job Import Tools ────────────────────────────────────────── */

var PIPELINE_STEPS = [
    [1, 'Receive ITB / Invitation to Bid', 'bidding'],
    [2, 'Review Plans & Specifications', 'bidding'],
    [3, 'Perform Takeoff', 'bidding'],
    [4, 'Request Supplier Quotes', 'bidding'],
    [5, 'Build Bid / Estimate', 'bidding'],
    [6, 'Create Proposal', 'bidding'],
    [7, 'Submit Bid', 'bidding'],
    [8, 'Bid Follow-up', 'bidding'],
    [9, 'Contract Execution', 'contract'],
    [10, 'Bonds & Insurance (COI)', 'contract'],
    [11, 'Notice to Proceed', 'contract'],
    [12, 'Set Up Pay App / SOV', 'contract'],
    [13, 'Assign Project Manager', 'contract'],
    [14, 'Submittal Preparation', 'preconstruction'],
    [15, 'Submittal Submission', 'preconstruction'],
    [16, 'Submittal Approval', 'preconstruction'],
    [17, 'Pre-Construction Meeting', 'preconstruction'],
    [18, 'Permits & Inspections', 'preconstruction'],
    [19, 'RFI Resolution', 'preconstruction'],
    [20, 'Material Ordering / Delivery Schedule', 'materials'],
    [21, 'Material Receiving', 'materials'],
    [22, 'Material Shortage Check', 'materials'],
    [23, 'Invoice Verification', 'finance'],
    [24, 'Pay Application Submission', 'finance'],
    [25, 'Material Shipping by Phase', 'construction'],
    [26, 'Rough-In', 'construction'],
    [27, 'Trim Out', 'construction'],
    [28, 'Equipment Start-Up', 'construction'],
    [29, 'Job Photos / Documentation', 'construction'],
    [30, 'Punch List', 'construction'],
    [31, 'Closeout / O&M / Warranty', 'closeout'],
    [32, 'Final Billing / Lien Waiver / COI', 'closeout']
];

var CAT_COLORS = {
    bidding: '#6366F1', contract: '#8B5CF6', preconstruction: '#EC4899',
    materials: '#F59E0B', finance: '#10B981', construction: '#06B6D4', closeout: '#EF4444'
};

function loadCustomers() {
    fetch('/api/customers')
        .then(function(r) { return r.json(); })
        .then(function(customers) {
            var sel = document.getElementById('qaCustomer');
            sel.innerHTML = '<option value="">Select Customer...</option>';
            customers.forEach(function(c) {
                sel.innerHTML += '<option value="' + c.id + '">' + c.name + '</option>';
            });
        })
        .catch(function() {});
}

function renderChecklist() {
    var html = '';
    var lastCat = '';
    PIPELINE_STEPS.forEach(function(s) {
        if (s[2] !== lastCat) {
            lastCat = s[2];
            html += '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:' + CAT_COLORS[s[2]] + ';margin:8px 0 4px;padding-top:4px;border-top:1px solid #F3F4F6;">' + s[2] + '</div>';
        }
        html += '<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:13px;cursor:pointer;">';
        html += '<input type="checkbox" value="' + s[0] + '" class="pipeline-check" style="width:16px;height:16px;">';
        html += '<span style="color:' + CAT_COLORS[s[2]] + ';font-weight:600;width:24px;text-align:right;">' + s[0] + '.</span>';
        html += s[1];
        html += '</label>';
    });
    document.getElementById('pipelineChecklist').innerHTML = html;
}

function importExcel(e) {
    e.preventDefault();
    var btn = document.getElementById('excelBtn');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    var formData = new FormData();
    formData.append('file', document.getElementById('excelFile').files[0]);
    fetch('/api/jobs/import-excel', { method: 'POST', body: formData })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var result = document.getElementById('excelResult');
            result.style.display = '';
            if (data.ok) {
                result.innerHTML = '<div style="padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534;">' +
                    'Successfully imported <strong>' + data.imported + '</strong> job(s). <a href="/workflow">View Pipeline</a></div>';
            } else {
                result.innerHTML = '<div style="padding:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B;">' +
                    'Error: ' + (data.error || 'Unknown error') + '</div>';
            }
        })
        .finally(function() {
            btn.disabled = false;
            btn.textContent = 'Import Projects';
        });
}

function quickAddJob(e) {
    e.preventDefault();
    var completedSteps = [];
    document.querySelectorAll('.pipeline-check:checked').forEach(function(cb) {
        completedSteps.push(parseInt(cb.value));
    });
    fetch('/api/jobs/quick-add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            name: document.getElementById('qaName').value,
            status: document.getElementById('qaStatus').value,
            customer_id: document.getElementById('qaCustomer').value || null,
            city: document.getElementById('qaCity').value,
            state: document.getElementById('qaState').value,
            zip_code: document.getElementById('qaZip').value,
            completed_steps: completedSteps
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        var result = document.getElementById('qaResult');
        result.style.display = '';
        if (data.ok) {
            result.innerHTML = '<div style="padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534;">' +
                'Job created! <a href="/projects/' + data.job_id + '">View Project</a> | <a href="/workflow">View Pipeline</a></div>';
        } else {
            result.innerHTML = '<div style="padding:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B;">' +
                'Error: ' + (data.error || 'Unknown') + '</div>';
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadCustomers();
    renderChecklist();
});
