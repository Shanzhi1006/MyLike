function createImageViewer(opts) {
    opts = opts || {};
    var galleryList = [];
    var galleryIndex = 0;
    var overlay = null;
    var rotating = false;
    var overlayImgId = opts.overlayImgId || 'overlay-img';
    var thumbImgPrefix = opts.thumbImgPrefix || 'thumb-img-';
    var navFn = opts.navFn || 'navImage';
    var rotateFn = opts.rotateFn || 'rotateImage';
    var closeFn = opts.closeFn || 'closeImageOverlay';


    function open(url) {
        galleryIndex = galleryList.findIndex(function (item) {
            return item.url === url || item.url.split('?')[0] === url.split('?')[0];
        });
        if (galleryIndex < 0) {
            galleryList = [{ url: url, materialId: null }];
            galleryIndex = 0;
        }
        showOverlay();
    }


    function setGallery(list) {
        galleryList = list;
    }


    function setGalleryIndex(idx) {
        galleryIndex = idx;
    }


    function showOverlay() {
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.className = 'image-overlay';


        var item = galleryList[galleryIndex];
        var url = item.url;
        var html = '<img src="' + url + '" id="' + overlayImgId + '">';
        if (galleryList.length > 1) {
            html += '<button class="img-nav-btn img-nav-left" onclick="event.stopPropagation();' + navFn + '(-1)">&#10094;</button>';
            html += '<button class="img-nav-btn img-nav-right" onclick="event.stopPropagation();' + navFn + '(1)">&#10095;</button>';
            html += '<div class="img-nav-counter">' + (galleryIndex + 1) + ' / ' + galleryList.length + '</div>';
        }
        if (item.materialId) {
            html += '<div class="img-rotate-bar">';
            html += '<button class="img-rotate-btn" title="逆时针旋转" onclick="event.stopPropagation();' + rotateFn + '(\'ccw\')"><i class="fas fa-rotate-left"></i></button>';
            html += '<button class="img-rotate-btn" title="顺时针旋转" onclick="event.stopPropagation();' + rotateFn + '(\'cw\')"><i class="fas fa-rotate-right"></i></button>';
            html += '</div>';
        }


        overlay.innerHTML = html;
        overlay.onclick = function (e) { if (e.target === overlay) close(); };
        document.body.appendChild(overlay);
    }


    function nav(direction) {
        var n = galleryList.length;
        if (n <= 1) return;
        galleryIndex = (galleryIndex + direction + n) % n;
        showOverlay();
    }


    function rotate(direction) {
        if (rotating) return;
        var item = galleryList[galleryIndex];
        if (!item || !item.materialId) return;
        rotating = true;
        fetch('/api/materials/' + item.materialId + '/rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: direction })
        }).then(r => r.json()).then(function (data) {
            rotating = false;
            if (data.error) { alert(data.error); return; }
            var newUrl = data.url;
            var newThumbUrl = data.thumb_url;
            galleryList[galleryIndex].url = newUrl;
            var overlayImg = document.getElementById(overlayImgId);
            if (overlayImg) overlayImg.src = newUrl;
            var thumbImg = document.getElementById(thumbImgPrefix + item.materialId);
            if (thumbImg) thumbImg.src = newThumbUrl || newUrl;
            if (opts.onRotate) opts.onRotate(item.materialId, newUrl, newThumbUrl);
        }).catch(function () { rotating = false; });
    }


    function close() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }


    document.addEventListener('keydown', function (e) {
        if (!overlay) return;
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });


    return {
        open: open,
        setGallery: setGallery,
        setGalleryIndex: setGalleryIndex,
        showOverlay: showOverlay,
        nav: nav,
        rotate: rotate,
        close: close
    };
}

