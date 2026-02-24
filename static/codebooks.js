/* Code Books JS */
let allSections = [];
let bookmarkedIds = new Set();

// List page
if (document.getElementById('bookGrid')) {
    loadBooks();
}

// Browse page
if (window.BOOK_ID) {
    loadSections();
    loadBookmarks();
}

async function loadBooks() {
    const res = await fetch('/api/codebooks');
    const books = await res.json();
    const grid = document.getElementById('bookGrid');
    grid.innerHTML = books.map(b => `
        <a href="/codebooks/${b.id}" class="codebook-card">
            <div class="codebook-code">${b.code}</div>
            <div class="codebook-name">${b.name}</div>
            <div class="codebook-edition">${b.edition}</div>
        </a>
    `).join('');
}

let searchTimer;
function searchCodes() {
    clearTimeout(searchTimer);
    const q = document.getElementById('codeSearch').value.trim();
    if (!q) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }
    searchTimer = setTimeout(async () => {
        const res = await fetch(`/api/codebooks/search?q=${encodeURIComponent(q)}`);
        const results = await res.json();
        const container = document.getElementById('searchResultsList');
        document.getElementById('searchResults').style.display = 'block';
        if (!results.length) {
            container.innerHTML = '<p class="text-muted">No matching sections found.</p>';
            return;
        }
        container.innerHTML = results.map(s => `
            <div class="search-result-item">
                <span class="badge">${s.book_code}</span>
                <strong>${s.section_number}</strong> - ${s.title}
            </div>
        `).join('');
    }, 300);
}

async function loadSections() {
    const res = await fetch(`/api/codebooks/${BOOK_ID}/sections`);
    allSections = await res.json();
    renderSections();
}

function filterSections() {
    renderSections();
}

function renderSections() {
    const query = (document.getElementById('sectionSearch')?.value || '').toLowerCase();
    let filtered = allSections;
    if (query) {
        filtered = allSections.filter(s =>
            s.section_number.toLowerCase().includes(query) ||
            s.title.toLowerCase().includes(query)
        );
    }

    const tree = document.getElementById('sectionTree');
    if (!filtered.length) {
        tree.innerHTML = '<p class="text-muted">No sections found.</p>';
        return;
    }

    tree.innerHTML = filtered.map(s => {
        const isBookmarked = bookmarkedIds.has(s.id);
        return `<div class="section-item" style="padding-left:${s.depth * 20 + 12}px;">
            <div class="section-number">${s.section_number}</div>
            <div class="section-title">${s.title}</div>
            <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleBookmark(${s.id}, this)" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
                ${isBookmarked ? '&#9733;' : '&#9734;'}
            </button>
        </div>`;
    }).join('');
}

async function loadBookmarks() {
    const res = await fetch('/api/codebooks/bookmarks');
    const bookmarks = await res.json();
    bookmarkedIds = new Set(bookmarks.map(b => b.section_id));

    const list = document.getElementById('bookmarkList');
    if (!bookmarks.length) {
        list.innerHTML = '<p class="text-muted">No bookmarks yet. Click the star next to a section to bookmark it.</p>';
    } else {
        list.innerHTML = bookmarks.map(b => `
            <div class="bookmark-item">
                <span class="badge">${b.book_code}</span>
                <strong>${b.section_number}</strong> - ${b.title}
                <button class="bookmark-remove" onclick="toggleBookmark(${b.section_id})">&times;</button>
            </div>
        `).join('');
    }

    // Re-render sections if loaded
    if (allSections.length) renderSections();
}

async function toggleBookmark(sectionId, btn) {
    await fetch('/api/codebooks/bookmarks', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ section_id: sectionId })
    });
    loadBookmarks();
}
