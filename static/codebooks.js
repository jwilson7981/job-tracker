/* Code Books JS */
let allSections = [];
let bookmarkedIds = new Set();
let expandedIds = new Set();
let selectedId = null;

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
            <a href="/codebooks/${s.book_id}" class="search-result-item" style="text-decoration:none;color:inherit;cursor:pointer;">
                <span class="badge">${s.book_code}</span>
                <strong>${s.section_number}</strong> - ${s.title}
            </a>
        `).join('');
    }, 300);
}

async function loadSections() {
    const res = await fetch(`/api/codebooks/${window.BOOK_ID}/sections`);
    allSections = await res.json();
    renderSections();
}

function filterSections() {
    renderSections();
}

function getChildren(parentId) {
    return allSections.filter(s => s.parent_section_id === parentId);
}

function hasChildren(sectionId) {
    return allSections.some(s => s.parent_section_id === sectionId);
}

function renderSections() {
    const query = (document.getElementById('sectionSearch')?.value || '').toLowerCase();
    const tree = document.getElementById('sectionTree');

    if (query) {
        // When searching, show flat filtered results
        const filtered = allSections.filter(s =>
            s.section_number.toLowerCase().includes(query) ||
            s.title.toLowerCase().includes(query) ||
            (s.content && s.content.toLowerCase().includes(query))
        );
        if (!filtered.length) {
            tree.innerHTML = '<p class="text-muted">No sections found.</p>';
            return;
        }
        tree.innerHTML = filtered.map(s => renderSectionItem(s, true)).join('');
    } else {
        // Hierarchical tree view — start with top-level (depth 0)
        const topLevel = allSections.filter(s => s.depth === 0);
        if (!topLevel.length) {
            tree.innerHTML = '<p class="text-muted">No sections found.</p>';
            return;
        }
        let html = '';
        for (const section of topLevel) {
            html += renderTreeNode(section);
        }
        tree.innerHTML = html;
    }
}

function renderTreeNode(section) {
    const children = getChildren(section.id);
    const isExpanded = expandedIds.has(section.id);
    const isSelected = selectedId === section.id;
    const hasKids = children.length > 0;
    const isBookmarked = bookmarkedIds.has(section.id);
    const indent = section.depth * 16;

    let html = `<div class="tree-node">`;
    html += `<div class="section-item depth-${section.depth} ${isSelected ? 'selected' : ''}" style="padding-left:${indent + 8}px;" data-id="${section.id}">`;

    // Expand/collapse toggle
    if (hasKids) {
        html += `<button class="tree-toggle" onclick="event.stopPropagation(); toggleExpand(${section.id})">${isExpanded ? '&#9660;' : '&#9654;'}</button>`;
    } else {
        html += `<span class="tree-toggle-spacer"></span>`;
    }

    html += `<span class="section-number">${section.section_number}</span>`;
    html += `<span class="section-title" onclick="selectSection(${section.id})">${section.title}</span>`;
    html += `<button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${section.id})" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">`;
    html += isBookmarked ? '&#9733;' : '&#9734;';
    html += `</button>`;
    html += `</div>`;

    // Children
    if (hasKids && isExpanded) {
        html += `<div class="tree-children">`;
        for (const child of children) {
            html += renderTreeNode(child);
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderSectionItem(section, flat) {
    const isSelected = selectedId === section.id;
    const isBookmarked = bookmarkedIds.has(section.id);
    const depthLabel = section.depth === 0 ? 'chapter' : section.depth === 1 ? 'section' : 'subsection';

    return `<div class="section-item ${isSelected ? 'selected' : ''}" data-id="${section.id}" onclick="selectSection(${section.id})">
        <span class="tree-toggle-spacer"></span>
        <span class="section-number">${section.section_number}</span>
        <span class="section-title">${section.title}</span>
        <span class="depth-badge">${depthLabel}</span>
        <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleBookmark(${section.id})" title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
            ${isBookmarked ? '&#9733;' : '&#9734;'}
        </button>
    </div>`;
}

function toggleExpand(sectionId) {
    if (expandedIds.has(sectionId)) {
        expandedIds.delete(sectionId);
    } else {
        expandedIds.add(sectionId);
    }
    renderSections();
}

function expandAll() {
    allSections.forEach(s => {
        if (hasChildren(s.id)) expandedIds.add(s.id);
    });
    renderSections();
}

function collapseAll() {
    expandedIds.clear();
    renderSections();
}

function selectSection(sectionId) {
    selectedId = sectionId;
    const section = allSections.find(s => s.id === sectionId);
    if (!section) return;

    // Auto-expand if it has children
    if (hasChildren(sectionId)) {
        expandedIds.add(sectionId);
    }

    renderSections();
    showContent(section);
}

function showContent(section) {
    const panel = document.getElementById('contentPanel');
    const children = getChildren(section.id);
    const parent = section.parent_section_id ? allSections.find(s => s.id === section.parent_section_id) : null;

    let breadcrumb = '';
    if (parent) {
        const grandparent = parent.parent_section_id ? allSections.find(s => s.id === parent.parent_section_id) : null;
        if (grandparent) {
            breadcrumb += `<a onclick="selectSection(${grandparent.id})" class="breadcrumb-link">${grandparent.section_number}</a> &rsaquo; `;
        }
        breadcrumb += `<a onclick="selectSection(${parent.id})" class="breadcrumb-link">${parent.section_number} ${parent.title}</a> &rsaquo; `;
    }

    let html = `<div class="content-header">`;
    if (breadcrumb) html += `<div class="content-breadcrumb">${breadcrumb}</div>`;
    html += `<h2>${section.section_number} &mdash; ${section.title}</h2>`;
    html += `</div>`;

    if (section.content) {
        // Render content with paragraph breaks
        const paragraphs = section.content.split('\n').filter(p => p.trim());
        html += `<div class="content-body">`;
        for (const p of paragraphs) {
            html += `<p>${p}</p>`;
        }
        html += `</div>`;
    }

    // Show child sections inline
    if (children.length) {
        html += `<div class="content-subsections">`;
        html += `<h3>Subsections</h3>`;
        for (const child of children) {
            html += `<div class="content-subsection-item" onclick="selectSection(${child.id})">`;
            html += `<strong>${child.section_number}</strong> &mdash; ${child.title}`;
            if (child.content) {
                const preview = child.content.substring(0, 200);
                html += `<p class="subsection-preview">${preview}${child.content.length > 200 ? '...' : ''}</p>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    }

    if (!section.content && !children.length) {
        html += `<p class="text-muted">No detailed content available for this section.</p>`;
    }

    panel.innerHTML = html;
    panel.scrollTop = 0;
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
            <div class="bookmark-item" onclick="jumpToBookmark(${b.section_id})">
                <span class="badge">${b.book_code}</span>
                <strong>${b.section_number}</strong> - ${b.title}
                <button class="bookmark-remove" onclick="event.stopPropagation(); toggleBookmark(${b.section_id})">&times;</button>
            </div>
        `).join('');
    }

    if (allSections.length) renderSections();
}

function jumpToBookmark(sectionId) {
    const section = allSections.find(s => s.id === sectionId);
    if (!section) return;

    // Expand all ancestors
    let current = section;
    while (current.parent_section_id) {
        expandedIds.add(current.parent_section_id);
        current = allSections.find(s => s.id === current.parent_section_id);
        if (!current) break;
    }

    selectSection(sectionId);

    // Scroll the tree to show the selected item
    setTimeout(() => {
        const el = document.querySelector(`.section-item[data-id="${sectionId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
}

async function toggleBookmark(sectionId) {
    await fetch('/api/codebooks/bookmarks', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ section_id: sectionId })
    });
    loadBookmarks();
}
