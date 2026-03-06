/* ─── Job Photos ──────────────────────────────────────────────── */

var photosList = [];
var lightboxIndex = 0;
var albumsList = [];
var currentAlbum = null;   // null = top-level view, number = inside album
var movePhotoId = null;    // photo being moved

/* ─── Client-side image compression ──────────────────────────── */
function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 1600;
    quality = quality || 0.8;
    return new Promise(function(resolve) {
        if (!file.type.startsWith('image/')) { resolve(file); return; }
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
            URL.revokeObjectURL(url);
            var w = img.width, h = img.height;
            if (w <= maxWidth) {
                // already small enough — still re-encode as JPEG for consistency
                var c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0);
                c.toBlob(function(blob) {
                    resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
                }, 'image/jpeg', quality);
                return;
            }
            var ratio = maxWidth / w;
            var newW = maxWidth, newH = Math.round(h * ratio);
            var c = document.createElement('canvas');
            c.width = newW; c.height = newH;
            c.getContext('2d').drawImage(img, 0, 0, newW, newH);
            c.toBlob(function(blob) {
                resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            }, 'image/jpeg', quality);
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

function loadJobs() {
    fetch('/api/jobs')
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var opts = '<option value="">All Jobs</option>';
            var opts2 = '<option value="">Select Job...</option>';
            jobs.forEach(function(j) {
                opts += '<option value="' + j.id + '">' + j.name + '</option>';
                opts2 += '<option value="' + j.id + '">' + j.name + '</option>';
            });
            document.getElementById('photoJobFilter').innerHTML = opts;
            document.getElementById('uploadJob').innerHTML = opts2;
            document.getElementById('cameraJob').innerHTML = opts2;
        });
}

function onJobFilterChange() {
    currentAlbum = null;
    document.getElementById('albumBreadcrumb').style.display = 'none';
    var jobId = document.getElementById('photoJobFilter').value;
    document.getElementById('btnNewAlbum').style.display = jobId ? '' : 'none';
    if (jobId) {
        loadAlbums();
    } else {
        albumsList = [];
        document.getElementById('albumCards').style.display = 'none';
        document.getElementById('unAlbumedLabel').style.display = 'none';
    }
    loadPhotos();
}

function loadPhotos() {
    var jobId = document.getElementById('photoJobFilter').value;
    var category = document.getElementById('photoCategoryFilter').value;
    var url = '/api/photos?';
    if (jobId) url += 'job_id=' + jobId + '&';
    if (category) url += 'category=' + category + '&';
    if (currentAlbum) {
        url += 'album_id=' + currentAlbum;
    } else if (jobId && albumsList.length > 0) {
        // On top-level job view with albums, show only un-albumed photos
        url += 'album_id=none';
    }
    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(photos) {
            photosList = photos;
            renderGallery();
        });
}

function renderGallery() {
    var gallery = document.getElementById('photoGallery');
    var jobId = document.getElementById('photoJobFilter').value;
    var showLabel = document.getElementById('unAlbumedLabel');
    // Show "Other Photos" label when viewing top-level with albums
    if (jobId && !currentAlbum && albumsList.length > 0) {
        showLabel.style.display = '';
    } else {
        showLabel.style.display = 'none';
    }
    if (!photosList.length) {
        var msg = currentAlbum ? 'No photos in this album yet.' : 'No photos yet. Upload some!';
        gallery.innerHTML = '<p style="text-align:center;color:#6B7280;padding:40px;grid-column:1/-1;">' + msg + '</p>';
        return;
    }
    var html = '';
    photosList.forEach(function(p, i) {
        html += '<div class="card" style="padding:0;overflow:hidden;cursor:pointer;position:relative;" onclick="openLightbox(' + i + ')">';
        html += '<img src="/api/photos/' + p.id + '/file" style="width:100%;height:180px;object-fit:cover;" loading="lazy">';
        html += '<div style="padding:8px;">';
        html += '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (p.caption || p.job_name || '') + '</div>';
        html += '<div style="font-size:11px;color:#6B7280;">' + p.category + ' — ' + (p.taken_date || '') + '</div>';
        html += '</div>';
        // Move button (only when a job is selected)
        if (jobId) {
            html += '<button onclick="event.stopPropagation();showMovePhoto(' + p.id + ')" title="Move to album" style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.5);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;"><i class="fas fa-folder-open"></i></button>';
        }
        html += '<button onclick="event.stopPropagation();deletePhoto(' + p.id + ')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;">&times;</button>';
        html += '</div>';
    });
    gallery.innerHTML = html;
}

/* ─── Albums ─────────────────────────────────────────────────── */

function loadAlbums() {
    var jobId = document.getElementById('photoJobFilter').value;
    if (!jobId) { albumsList = []; renderAlbums(); return; }
    fetch('/api/photos/albums?job_id=' + jobId)
        .then(function(r) { return r.json(); })
        .then(function(albums) {
            albumsList = albums;
            renderAlbums();
        });
}

function renderAlbums() {
    var container = document.getElementById('albumCards');
    var grid = document.getElementById('albumGrid');
    if (!albumsList.length || currentAlbum) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';
    var html = '';
    albumsList.forEach(function(a) {
        var coverStyle = 'background:#E5E7EB;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:32px;';
        var coverHtml = '<div style="width:100%;height:120px;' + coverStyle + '"><i class="fas fa-folder"></i></div>';
        if (a.cover_photo_id) {
            coverHtml = '<img src="/api/photos/' + a.cover_photo_id + '/file" style="width:100%;height:120px;object-fit:cover;" loading="lazy">';
        }
        html += '<div class="card" style="padding:0;overflow:hidden;cursor:pointer;position:relative;" onclick="openAlbum(' + a.id + ',\'' + a.name.replace(/'/g, "\\'") + '\')">';
        html += coverHtml;
        html += '<div style="padding:8px;text-align:center;">';
        html += '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="fas fa-folder" style="margin-right:4px;color:#F59E0B;"></i>' + a.name + '</div>';
        html += '<div style="font-size:11px;color:#6B7280;">' + a.photo_count + ' photo' + (a.photo_count !== 1 ? 's' : '') + '</div>';
        html += '</div>';
        // Edit/Delete buttons
        html += '<div style="position:absolute;top:4px;right:4px;display:flex;gap:4px;">';
        html += '<button onclick="event.stopPropagation();editAlbum(' + a.id + ',\'' + a.name.replace(/'/g, "\\'") + '\')" title="Rename" style="background:rgba(0,0,0,0.5);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:11px;"><i class="fas fa-pen"></i></button>';
        html += '<button onclick="event.stopPropagation();deleteAlbum(' + a.id + ',\'' + a.name.replace(/'/g, "\\'") + '\')" title="Delete album" style="background:rgba(0,0,0,0.5);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;">&times;</button>';
        html += '</div>';
        html += '</div>';
    });
    grid.innerHTML = html;
}

function openAlbum(id, name) {
    currentAlbum = id;
    document.getElementById('albumBreadcrumb').style.display = '';
    document.getElementById('albumBreadcrumbName').textContent = name;
    document.getElementById('albumCards').style.display = 'none';
    document.getElementById('unAlbumedLabel').style.display = 'none';
    loadPhotos();
}

function closeAlbum() {
    currentAlbum = null;
    document.getElementById('albumBreadcrumb').style.display = 'none';
    loadAlbums();
    loadPhotos();
}

function showNewAlbumModal() {
    document.getElementById('newAlbumName').value = '';
    document.getElementById('newAlbumModal').style.display = 'flex';
    document.getElementById('newAlbumName').focus();
}

function saveAlbum(e) {
    e.preventDefault();
    var jobId = document.getElementById('photoJobFilter').value;
    var name = document.getElementById('newAlbumName').value.trim();
    if (!jobId || !name) return;
    fetch('/api/photos/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, name: name })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.ok) {
            document.getElementById('newAlbumModal').style.display = 'none';
            loadAlbums();
            loadPhotos();
        }
    });
}

function editAlbum(id, currentName) {
    var newName = prompt('Rename album:', currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
    fetch('/api/photos/albums/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.ok) loadAlbums();
    });
}

function deleteAlbum(id, name) {
    if (!confirm('Delete album "' + name + '"? Photos will NOT be deleted, just moved out of the album.')) return;
    fetch('/api/photos/albums/' + id, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok) {
                loadAlbums();
                loadPhotos();
            }
        });
}

/* ─── Move Photo ─────────────────────────────────────────────── */

function showMovePhoto(photoId) {
    movePhotoId = photoId;
    var jobId = document.getElementById('photoJobFilter').value;
    // Load albums for the move dropdown
    fetch('/api/photos/albums?job_id=' + jobId)
        .then(function(r) { return r.json(); })
        .then(function(albums) {
            var sel = document.getElementById('movePhotoAlbum');
            var html = '<option value="">No Album (remove from album)</option>';
            albums.forEach(function(a) {
                html += '<option value="' + a.id + '">' + a.name + '</option>';
            });
            sel.innerHTML = html;
            document.getElementById('movePhotoModal').style.display = 'flex';
        });
}

function confirmMovePhoto() {
    var albumId = document.getElementById('movePhotoAlbum').value || null;
    fetch('/api/photos/' + movePhotoId + '/move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: albumId ? parseInt(albumId) : null })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.ok) {
            document.getElementById('movePhotoModal').style.display = 'none';
            loadAlbums();
            loadPhotos();
        }
    });
}

/* ─── Album Dropdown for Upload/Camera Modals ────────────────── */

function loadAlbumDropdown(selectId, jobId) {
    var sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">No Album</option>';
    if (!jobId) return;
    fetch('/api/photos/albums?job_id=' + jobId)
        .then(function(r) { return r.json(); })
        .then(function(albums) {
            var html = '<option value="">No Album</option>';
            albums.forEach(function(a) {
                html += '<option value="' + a.id + '">' + a.name + '</option>';
            });
            sel.innerHTML = html;
        });
}

/* ─── Upload / Camera ────────────────────────────────────────── */

function showUploadModal() {
    // Pre-select job and album if we're viewing one
    var jobId = document.getElementById('photoJobFilter').value;
    if (jobId) {
        document.getElementById('uploadJob').value = jobId;
        loadAlbumDropdown('uploadAlbum', jobId);
        // Pre-select current album if inside one
        if (currentAlbum) {
            setTimeout(function() {
                document.getElementById('uploadAlbum').value = currentAlbum;
            }, 200);
        }
    }
    document.getElementById('uploadModal').style.display = 'flex';
}

function uploadPhotos(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button[type="submit"]');
    var origText = btn.textContent;
    btn.textContent = 'Uploading...';
    btn.disabled = true;

    var files = document.getElementById('uploadFiles').files;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
        promises.push(compressImage(files[i]));
    }
    Promise.all(promises).then(function(compressed) {
        var formData = new FormData();
        formData.append('job_id', document.getElementById('uploadJob').value);
        formData.append('category', document.getElementById('uploadCategory').value);
        formData.append('caption', document.getElementById('uploadCaption').value);
        var albumId = document.getElementById('uploadAlbum').value;
        if (albumId) formData.append('album_id', albumId);
        compressed.forEach(function(f) { formData.append('files', f); });
        return fetch('/api/photos', { method: 'POST', body: formData });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        btn.textContent = origText;
        btn.disabled = false;
        if (data.ok) {
            document.getElementById('uploadModal').style.display = 'none';
            loadAlbums();
            loadPhotos();
        }
    })
    .catch(function() {
        btn.textContent = origText;
        btn.disabled = false;
        alert('Upload failed. Please try again.');
    });
}

function showCameraModal() {
    document.getElementById('cameraFile').value = '';
    document.getElementById('cameraCaption').value = '';
    // Pre-select job and album if we're viewing one
    var jobId = document.getElementById('photoJobFilter').value;
    if (jobId) {
        document.getElementById('cameraJob').value = jobId;
        loadAlbumDropdown('cameraAlbum', jobId);
        if (currentAlbum) {
            setTimeout(function() {
                document.getElementById('cameraAlbum').value = currentAlbum;
            }, 200);
        }
    }
    document.getElementById('cameraModal').style.display = 'flex';
}

function takePhoto(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button[type="submit"]');
    var origText = btn.textContent;
    btn.textContent = 'Uploading...';
    btn.disabled = true;

    var file = document.getElementById('cameraFile').files[0];
    compressImage(file).then(function(compressed) {
        var formData = new FormData();
        formData.append('job_id', document.getElementById('cameraJob').value);
        formData.append('category', document.getElementById('cameraCategory').value);
        formData.append('caption', document.getElementById('cameraCaption').value);
        var albumId = document.getElementById('cameraAlbum').value;
        if (albumId) formData.append('album_id', albumId);
        formData.append('files', compressed);
        return fetch('/api/photos', { method: 'POST', body: formData });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        btn.textContent = origText;
        btn.disabled = false;
        if (data.ok) {
            document.getElementById('cameraModal').style.display = 'none';
            loadAlbums();
            loadPhotos();
        }
    })
    .catch(function() {
        btn.textContent = origText;
        btn.disabled = false;
        alert('Upload failed. Please try again.');
    });
}

/* ─── Delete / Lightbox ──────────────────────────────────────── */

function deletePhoto(id) {
    if (!confirm('Delete this photo?')) return;
    fetch('/api/photos/' + id, { method: 'DELETE' })
        .then(function() {
            loadAlbums();
            loadPhotos();
        });
}

function openLightbox(index) {
    lightboxIndex = index;
    var p = photosList[index];
    document.getElementById('lbImage').src = '/api/photos/' + p.id + '/file';
    document.getElementById('lbCaption').textContent = (p.caption || '') + ' — ' + (p.job_name || '') + ' — ' + p.category;
    document.getElementById('lightbox').style.display = 'flex';
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
}

function navLightbox(dir) {
    lightboxIndex = (lightboxIndex + dir + photosList.length) % photosList.length;
    openLightbox(lightboxIndex);
}

document.addEventListener('keydown', function(e) {
    if (document.getElementById('lightbox').style.display !== 'flex') return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navLightbox(-1);
    if (e.key === 'ArrowRight') navLightbox(1);
});

document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
    loadPhotos();
});
