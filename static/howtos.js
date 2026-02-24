/* How To's JS */
let allArticles = [];

// List page
if (document.getElementById('articlesList')) {
    loadArticles();
}

async function loadArticles() {
    const res = await fetch('/api/howtos');
    allArticles = await res.json();
    renderArticles();
}

function filterArticles() {
    renderArticles();
}

function renderArticles() {
    const query = (document.getElementById('howtoSearch')?.value || '').toLowerCase();
    let filtered = allArticles;
    if (query) {
        filtered = allArticles.filter(a =>
            (a.title || '').toLowerCase().includes(query) ||
            (a.category || '').toLowerCase().includes(query) ||
            (a.tags || '').toLowerCase().includes(query)
        );
    }

    const container = document.getElementById('articlesList');
    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state">No articles found.</div>';
        return;
    }

    container.innerHTML = filtered.map(a => `
        <a href="/howtos/${a.id}" class="article-card">
            <div class="article-card-header">
                <h3>${escapeHtml(a.title)}</h3>
                ${a.category ? `<span class="badge">${escapeHtml(a.category)}</span>` : ''}
            </div>
            ${a.tags ? `<div class="article-card-tags">${escapeHtml(a.tags)}</div>` : ''}
            <div class="article-card-date">Updated ${a.updated_at}</div>
        </a>
    `).join('');
}

// Edit page
if (window.ARTICLE_ID !== undefined) {
    // Edit or create mode - saveArticle is called from form
}

async function saveArticle(e) {
    e.preventDefault();
    const payload = {
        title: document.getElementById('artTitle').value,
        category: document.getElementById('artCategory').value,
        tags: document.getElementById('artTags').value,
        content: document.getElementById('artContent').value,
    };

    if (ARTICLE_ID) {
        await fetch(`/api/howtos/${ARTICLE_ID}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        window.location.href = `/howtos/${ARTICLE_ID}`;
    } else {
        const res = await fetch('/api/howtos', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        window.location.href = `/howtos/${data.id}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
