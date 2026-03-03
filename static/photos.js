/* ─── Job Photos ──────────────────────────────────────────────── */

var photosList = [];
var lightboxIndex = 0;

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
        });
}

function loadPhotos() {
    var jobId = document.getElementById('photoJobFilter').value;
    var category = document.getElementById('photoCategoryFilter').value;
    var url = '/api/photos?';
    if (jobId) url += 'job_id=' + jobId + '&';
    if (category) url += 'category=' + category;
    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(photos) {
            photosList = photos;
            renderGallery();
        });
}

function renderGallery() {
    var gallery = document.getElementById('photoGallery');
    if (!photosList.length) {
        gallery.innerHTML = '<p style="text-align:center;color:#6B7280;padding:40px;grid-column:1/-1;">No photos yet. Upload some!</p>';
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
        html += '<button onclick="event.stopPropagation();deletePhoto(' + p.id + ')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;">&times;</button>';
        html += '</div>';
    });
    gallery.innerHTML = html;
}

function showUploadModal() {
    document.getElementById('uploadModal').style.display = 'flex';
}

function uploadPhotos(e) {
    e.preventDefault();
    var formData = new FormData();
    formData.append('job_id', document.getElementById('uploadJob').value);
    formData.append('category', document.getElementById('uploadCategory').value);
    formData.append('caption', document.getElementById('uploadCaption').value);
    var files = document.getElementById('uploadFiles').files;
    for (var i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    fetch('/api/photos', { method: 'POST', body: formData })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok) {
                document.getElementById('uploadModal').style.display = 'none';
                loadPhotos();
            }
        });
}

function deletePhoto(id) {
    if (!confirm('Delete this photo?')) return;
    fetch('/api/photos/' + id, { method: 'DELETE' })
        .then(function() { loadPhotos(); });
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
