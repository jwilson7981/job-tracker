/* Dashboard JS */
const STAGE_COLORS = {
    'Needs Bid':    { bg: '#DBEAFE', text: '#1E40AF', chart: '#3B82F6' },
    'Bid Complete': { bg: '#E0E7FF', text: '#3730A3', chart: '#6366F1' },
    'In Progress':  { bg: '#FEF3C7', text: '#92400E', chart: '#F59E0B' },
    'Complete':     { bg: '#DCFCE7', text: '#166534', chart: '#22C55E' },
};

function fmt(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadDashboard() {
    const res = await fetch('/api/dashboard');
    const data = await res.json();
    document.getElementById('dashboardLoading').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';

    // KPIs
    const kpis = [
        { label: 'Total Jobs', value: data.total_jobs, color: '#3B82F6' },
        { label: 'Active Jobs', value: data.active_jobs, color: '#F59E0B' },
        { label: 'Completed', value: data.completed_jobs, color: '#22C55E' },
        { label: 'Est. Materials', value: fmt(data.estimated_material_cost), color: '#6366F1' },
        { label: 'Actual Materials', value: fmt(data.actual_material_cost), color: '#2563EB' },
        { label: 'Total Expenses', value: fmt(data.total_expenses), color: '#EF4444' },
        { label: 'Invoiced (Paid)', value: fmt(data.total_invoiced), color: '#22C55E' },
        { label: 'Open Service Calls', value: data.open_service_calls, color: '#F59E0B' },
        { label: 'Pending Hours', value: data.pending_hours + 'h', color: '#8B5CF6' },
    ];
    document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
        <div class="kpi-card" style="border-left: 4px solid ${k.color};">
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-label">${k.label}</div>
        </div>
    `).join('');

    // Stage doughnut chart
    const stages = Object.keys(data.stage_counts);
    const dCtx = document.getElementById('stageChart').getContext('2d');
    new Chart(dCtx, {
        type: 'doughnut',
        data: {
            labels: stages,
            datasets: [{
                data: stages.map(s => data.stage_counts[s]),
                backgroundColor: stages.map(s => STAGE_COLORS[s]?.chart || '#999'),
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // Finance bar chart
    const fCtx = document.getElementById('financeChart').getContext('2d');
    new Chart(fCtx, {
        type: 'bar',
        data: {
            labels: ['Est. Materials', 'Actual Materials', 'Expenses', 'Invoiced', 'Payments'],
            datasets: [{
                data: [data.estimated_material_cost, data.actual_material_cost, data.total_expenses, data.total_invoiced, data.total_payments],
                backgroundColor: ['#6366F1', '#2563EB', '#EF4444', '#22C55E', '#8B5CF6'],
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
        }
    });
}

async function loadUpcomingFollowups() {
    try {
        const res = await fetch('/api/followups/upcoming');
        if (!res.ok) return; // user may not have permission
        const followups = await res.json();
        const card = document.getElementById('followupsCard');
        const tbody = document.getElementById('dashFollowupsBody');
        if (!followups.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No upcoming follow-ups</td></tr>';
            return;
        }
        card.style.display = '';
        tbody.innerHTML = followups.map(f => `<tr>
            <td>${f.followup_date || '-'}</td>
            <td><a href="/bids/${f.bid_id}" class="link">${f.bid_name || '-'}</a></td>
            <td>${f.job_name || '-'}</td>
            <td>${f.followup_type || '-'}</td>
            <td>${f.assigned_name || '-'}</td>
            <td><span class="status-badge status-in-progress">${f.status}</span></td>
        </tr>`).join('');
    } catch (e) { /* silently ignore for roles without access */ }
}

document.addEventListener('DOMContentLoaded', () => { loadDashboard(); loadUpcomingFollowups(); });
