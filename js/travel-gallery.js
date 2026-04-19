(function () {
  var grid = document.getElementById('travelGalleryGrid');
  var prevBtn = document.getElementById('travelGalleryPrev');
  var nextBtn = document.getElementById('travelGalleryNext');
  var info = document.getElementById('travelGalleryInfo');
  if (!grid || !prevBtn || !nextBtn || !info) return;

  var pageSize = 10;
  var currentPage = 1;
  var items = [];
  var sharedUI = window.PhotoMapSharedUI || null;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatShotTime(shotTime) {
    if (!shotTime) return '';
    var d = new Date(shotTime);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatExposure(value) {
    var num = Number(value);
    if (!isFinite(num) || num <= 0) return '';
    if (num >= 1) return num.toFixed(1).replace(/\.0$/, '') + 's';
    var inv = Math.round(1 / num);
    if (inv > 0) return '1/' + inv + 's';
    return num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 's';
  }

  function formatFNumber(value) {
    var num = Number(value);
    if (!isFinite(num) || num <= 0) return '';
    return 'f/' + num.toFixed(1).replace(/\.0$/, '');
  }

  function formatFocalLength(value) {
    var num = Number(value);
    if (!isFinite(num) || num <= 0) return '';
    return num.toFixed(1).replace(/\.0$/, '') + 'mm';
  }

  function getMetaText(photo) {
    if (sharedUI && typeof sharedUI.buildMetaText === 'function') {
      return sharedUI.buildMetaText(photo || {});
    }
    var parts = [];
    var shot = formatShotTime(photo.shot_time);
    var camera = photo.camera_model || '';
    var lens = formatFocalLength(photo.focal_length);
    var fNumber = formatFNumber(photo.f_number);
    var exposure = formatExposure(photo.exposure_time);
    var iso = photo.iso ? 'ISO ' + photo.iso : '';

    if (shot) parts.push(shot);
    if (camera) parts.push(camera);
    if (lens) parts.push(lens);
    if (fNumber) parts.push(fNumber);
    if (exposure) parts.push(exposure);
    if (iso) parts.push(iso);

    return parts.join(' | ');
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPage(page) {
    var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);

    var start = (currentPage - 1) * pageSize;
    var end = Math.min(start + pageSize, items.length);
    var pageItems = items.slice(start, end);

    grid.innerHTML = pageItems.map(function (photo) {
      var cardHtml = '';
      if (sharedUI && typeof sharedUI.buildPhotoFrameHtml === 'function') {
        cardHtml = sharedUI.buildPhotoFrameHtml(photo, { imgLoading: 'lazy', imgDecoding: 'async' });
      }
      if (!cardHtml) {
        var title = photo.name || 'photo';
        var place = photo.place_name || 'Unknown place';
        var src = photo.photo_src || '';
        var meta = getMetaText(photo);
        cardHtml =
          '<div class="photo-map-frame">' +
            '<img class="photo-map-img" loading="lazy" decoding="async" src="' + escapeHtml(src) + '" alt="' + escapeHtml(title) + '">' +
            '<p class="photo-map-place">' + escapeHtml(place) + '</p>' +
            '<p class="photo-map-meta">' + escapeHtml(meta) + '</p>' +
          '</div>';
      }
      return (
        '<article class="travel-gallery-item" data-photo-id="' + escapeHtml(photo.id) + '">' +
          cardHtml +
        '</article>'
      );
    }).join('');

    info.textContent = 'Page ' + currentPage + ' / ' + totalPages;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  prevBtn.addEventListener('click', function () {
    renderPage(currentPage - 1);
  });

  nextBtn.addEventListener('click', function () {
    renderPage(currentPage + 1);
  });

  grid.addEventListener('click', function (evt) {
    var item = evt.target && evt.target.closest ? evt.target.closest('.travel-gallery-item') : null;
    if (!item) return;
    var id = Number(item.getAttribute('data-photo-id'));
    if (!isFinite(id)) return;
    var photo = items.find(function (entry) {
      return Number(entry && entry.id) === id;
    });
    if (!photo) return;
    if (sharedUI && typeof sharedUI.showModalHtml === 'function' && typeof sharedUI.buildPhotoFrameHtml === 'function') {
      var html = '<div class="photo-map-cluster-item photo-map-cluster-item-card">' + sharedUI.buildPhotoFrameHtml(photo, { layout: 'card' }) + '</div>';
      sharedUI.showModalHtml(html);
      return;
    }
  });

  fetch('/assets/maps/locations.json', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load locations.json');
      return res.json();
    })
    .then(function (data) {
      var list = Array.isArray(data && data.locations) ? data.locations : [];
      items = list.slice().sort(function (a, b) {
        var ta = a && a.shot_time ? new Date(a.shot_time).getTime() : 0;
        var tb = b && b.shot_time ? new Date(b.shot_time).getTime() : 0;
        return tb - ta;
      });
      renderPage(1);
    })
    .catch(function () {
      grid.innerHTML = '<p class="photo-map-empty">Failed to load gallery data.</p>';
      info.textContent = 'Page 0 / 0';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    });
})();
