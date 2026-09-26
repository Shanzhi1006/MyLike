function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function sortDimensions(dims) {
    var fixedOrder = ['平台', '类型', '作者'];
    dims.sort(function (a, b) {
        var fa = fixedOrder.indexOf(a.name);
        var fb = fixedOrder.indexOf(b.name);
        if (a.type === 'fixed' && b.type === 'fixed') return fa - fb;
        if (a.type === 'fixed') return -1;
        if (b.type === 'fixed') return 1;
        return 0;
    });
    return dims;
}


function createDragImage(imgEl, thumbEl, e) {
    if (!imgEl || imgEl.naturalWidth <= 0) return;
    var w = thumbEl.offsetWidth, h = thumbEl.offsetHeight;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var scale = Math.max(w / imgEl.naturalWidth, h / imgEl.naturalHeight);
    var dw = imgEl.naturalWidth * scale;
    var dh = imgEl.naturalHeight * scale;
    ctx.drawImage(imgEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
    var grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    var dragImg = document.createElement('img');
    dragImg.src = canvas.toDataURL('image/png');
    dragImg.style.position = 'absolute';
    dragImg.style.top = '-9999px';
    dragImg.style.width = w + 'px';
    dragImg.style.height = h + 'px';
    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, w / 2, h / 2);
    setTimeout(function () { if (dragImg.parentNode) dragImg.parentNode.removeChild(dragImg); }, 0);
}


function showConfirmDialog(modalId, titleId, msgId, yesBtnId, title, message, callback) {
    document.getElementById(titleId).textContent = title;
    document.getElementById(msgId).textContent = message;
    document.getElementById(modalId).style.display = 'flex';
    var cb = callback;
    var yesBtn = document.getElementById(yesBtnId);
    yesBtn.onclick = function () { if (cb) { cb(); cb = null; } document.getElementById(modalId).style.display = 'none'; };
}


function migratePlannerState(oldState) {
    if (oldState && oldState.tables) return oldState;
    if (oldState && oldState.rows) return { tables: [oldState] };
    return { tables: [] };
}

