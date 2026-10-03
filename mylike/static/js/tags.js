let allDimensions = [];
let selectedDimId = null;
let tagModalMode = 'create';
let tagEditId = null;
let dimModalMode = 'create';
let dimEditId = null;


function loadDimensions() {
    fetch('/api/tag-dimensions').then(r => r.json()).then(data => {
        allDimensions = data.dimensions || [];
        renderDimensionsList();
        if (selectedDimId) renderTagsDetail(selectedDimId);
    });
}


function renderDimensionsList() {
    const container = document.getElementById('dimensions-list');
    const fixedDims = allDimensions.filter(d => d.type === 'fixed');
    sortDimensions(fixedDims);
    const customDims = allDimensions.filter(d => d.type === 'custom');
    let html = '';
    fixedDims.forEach(dim => {
        const active = dim.id === selectedDimId;
        html += '<div class="dim-item dim-item-fixed' + (active ? ' active' : '') + '"'
            + ' onclick="selectDimension(' + dim.id + ')">';
        html += '<div class="dim-item-info">';
        html += '<span class="dim-name">' + escapeHtml(dim.name) + '</span>';
        html += '<span class="dim-count">' + (dim.tags || []).length + '个标签</span>';
        html += '</div>';
        html += '</div>';
    });
    customDims.forEach(dim => {
        const active = dim.id === selectedDimId;
        html += '<div class="dim-item dim-draggable' + (active ? ' active' : '') + '"'
            + ' data-dim-id="' + dim.id + '"'
            + ' draggable="true" ondragstart="onDimDragStart(event,' + dim.id + ')" ondragend="onDimDragEnd(event)"'
            + ' onclick="selectDimension(' + dim.id + ')"'
            + '>';
        html += '<div class="dim-item-info">';
        html += '<span class="dim-name dim-name-editable" onclick="event.stopPropagation();showRenameDimension(' + dim.id + ',\'' + escapeHtml(dim.name).replace(/'/g, "\\'") + '\')">' + escapeHtml(dim.name) + '</span>';
        html += '<span class="dim-count">' + (dim.tags || []).length + '个标签</span>';
        html += '</div>';
        html += '<span class="dim-drag-handle dim-drag-handle-hidden">&#9776;</span>';
        html += '</div>';
    });
    container.innerHTML = html || '<div class="empty">暂无维度</div>';
    initDimDragDrop();
}


let _dragDimId = null;


function onDimDragStart(e, dimId) {
    _dragDimId = dimId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
    e.target.querySelector('.dim-drag-handle')?.classList.remove('dim-drag-handle-hidden');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) zone.style.display = 'flex';
}


function _clearDimDragOver() {
    document.querySelectorAll('.dim-item').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-bottom');
    });
}


function initDimDragDrop() {
    var container = document.getElementById('dimensions-list');
    if (!container || container._dimDragInit) return;
    container._dimDragInit = true;

    container.addEventListener('dragover', function (e) {
        if (_dragDimId === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        _clearDimDragOver();
        var items = container.querySelectorAll('.dim-draggable');
        if (items.length === 0) return;
        var target = e.target.closest('.dim-draggable');
        if (target && target.dataset.dimId != _dragDimId) {
            var rect = target.getBoundingClientRect();
            var insertAfter = (e.clientY - rect.top) > rect.height / 2;
            target.classList.add(insertAfter ? 'drag-over-bottom' : 'drag-over');
        } else if (!target) {
            var firstItem = items[0];
            var lastItem = items[items.length - 1];
            var firstRect = firstItem.getBoundingClientRect();
            var lastRect = lastItem.getBoundingClientRect();
            if (e.clientY < firstRect.top + firstRect.height / 2 && firstItem.dataset.dimId != _dragDimId) {
                firstItem.classList.add('drag-over');
            } else if (e.clientY > lastRect.top + lastRect.height / 2 && lastItem.dataset.dimId != _dragDimId) {
                lastItem.classList.add('drag-over-bottom');
            }
        }
    });

    container.addEventListener('drop', function (e) {
        if (_dragDimId === null) return;
        e.preventDefault();
        e.stopPropagation();
        _clearDimDragOver();
        var customDims = allDimensions.filter(d => d.type === 'custom');
        var fromIdx = customDims.findIndex(d => d.id === _dragDimId);
        if (fromIdx < 0) return;
        var items = container.querySelectorAll('.dim-draggable');
        if (items.length === 0) return;
        var target = e.target.closest('.dim-draggable');
        var moved = customDims.splice(fromIdx, 1)[0];
        if (target && target.dataset.dimId != _dragDimId) {
            var targetId = parseInt(target.dataset.dimId);
            var toIdx = customDims.findIndex(d => d.id === targetId);
            if (toIdx < 0) { customDims.splice(fromIdx, 0, moved); return; }
            var rect = target.getBoundingClientRect();
            var insertAfter = (e.clientY - rect.top) > rect.height / 2;
            var adjustedTo = toIdx;
            if (fromIdx < toIdx) adjustedTo = toIdx - 1;
            if (insertAfter) adjustedTo += 1;
            customDims.splice(adjustedTo, 0, moved);
        } else if (!target) {
            var firstItem = items[0];
            var lastItem = items[items.length - 1];
            var firstRect = firstItem.getBoundingClientRect();
            var lastRect = lastItem.getBoundingClientRect();
            if (e.clientY < firstRect.top + firstRect.height / 2) {
                if (firstItem.dataset.dimId == _dragDimId) { customDims.splice(fromIdx, 0, moved); return; }
                customDims.unshift(moved);
            } else if (e.clientY > lastRect.top + lastRect.height / 2) {
                if (lastItem.dataset.dimId == _dragDimId) { customDims.splice(fromIdx, 0, moved); return; }
                customDims.push(moved);
            } else {
                customDims.splice(fromIdx, 0, moved);
                return;
            }
        } else {
            customDims.splice(fromIdx, 0, moved);
            return;
        }
        var ids = customDims.map(d => d.id);
        fetch('/api/tag-dimensions/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dim_ids: ids })
        }).then(() => loadDimensions());
    });
}


function onDimDragEnd(e) {
    document.querySelectorAll('.dim-item').forEach(el => {
        el.classList.remove('dragging', 'drag-over', 'drag-over-bottom');
        var handle = el.querySelector('.dim-drag-handle');
        if (handle) handle.classList.add('dim-drag-handle-hidden');
    });
    _dragDimId = null;
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
}


function selectDimension(id) {
    selectedDimId = id;
    renderDimensionsList();
    renderTagsDetail(id);
}


function renderTagsDetail(dimId) {
    const dim = allDimensions.find(d => d.id === dimId);
    if (!dim) return;
    document.getElementById('tags-title').textContent = dim.name;
    let actionsHtml = '';
    if (dim.type === 'custom') {
        actionsHtml += '<button class="btn btn-sm btn-primary" onclick="showCreateTag(' + dimId + ')">+ 新增标签</button>';
    }
    document.getElementById('tags-actions').innerHTML = actionsHtml;
    const container = document.getElementById('tags-detail');
    var tags = dim.tags || [];

    if (tags.length === 0) {
        container.innerHTML = '<div class="empty">暂无标签</div>';
        return;
    }

    if (dim.name === '作者') {
        var starredTags = tags.filter(t => t.starred);
        var otherTags = tags.filter(t => !t.starred);
        var html = '';

        if (starredTags.length > 0) {
            html += '<div class="tags-section tags-section-starred">';
            html += '<div class="tags-section-header"><i class="fas fa-star"></i> 星标作者</div>';
            html += '<div class="tags-chips" id="tags-chips-starred" data-starred="1">';
            starredTags.forEach(tag => { html += renderTagChip(tag, dim); });
            html += '</div>';
            html += '</div>';
        }

        if (otherTags.length > 0) {
            html += '<div class="tags-section tags-section-other">';
            if (starredTags.length > 0) html += '<div class="tags-section-header">其他作者</div>';
            html += '<div class="tags-chips" id="tags-chips-other" data-starred="0">';
            otherTags.forEach(tag => { html += renderTagChip(tag, dim); });
            html += '</div>';
            html += '</div>';
        }

        container.innerHTML = html;
    } else {
        let html = '<div class="tags-chips" id="tags-chips-container">';
        tags.forEach(tag => { html += renderTagChip(tag, dim); });
        html += '</div>';
        container.innerHTML = html;
    }
    initTagDragDrop();
}


function renderTagChip(tag, dim) {
    var isStarred = tag.starred === 1 || tag.starred === true;
    var isEmpty = !tag.work_count || tag.work_count === 0;
    var html = '<div class="tag-chip tag-chip-draggable' + (isStarred ? ' tag-chip-starred' : '') + (isEmpty ? ' tag-chip-empty' : '') + '"'
        + ' data-tag-id="' + tag.id + '"'
        + ' draggable="true" ondragstart="onTagDragStart(event,' + tag.id + ')" ondragend="onTagDragEnd(event)"'
        + '>';
    if (dim.name === '作者') {
        html += '<span class="tag-chip-star' + (isStarred ? ' active' : '') + '" onclick="event.stopPropagation();toggleTagStar(' + tag.id + ')"><i class="' + (isStarred ? 'fas' : 'far') + ' fa-star"></i></span>';
    }
    if (dim.type === 'custom') {
        html += '<span class="tag-chip-name" onclick="showRenameTag(' + tag.id + ',\'' + escapeHtml(tag.name).replace(/'/g, "\\'") + '\')">' + escapeHtml(tag.name) + '</span>';
    } else {
        html += '<span class="tag-chip-name">' + escapeHtml(tag.name) + '</span>';
    }
    if (isEmpty) {
        html += '</div>';
    } else {
        html += '<span class="tag-chip-count">' + tag.work_count + '</span>';
        html += '</div>';
    }
    return html;
}


function toggleTagStar(tagId) {
    fetch('/api/tags/' + tagId + '/star', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.error) { alert(data.error); return; }
            loadDimensions();
        });
}


let _dragTagId = null;


function onTagDragStart(e, tagId) {
    _dragTagId = tagId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) zone.style.display = 'flex';
}


function _clearTagDragOver() {
    document.querySelectorAll('.tag-chip-draggable').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-right');
    });
}


function initTagDragDrop() {
    document.querySelectorAll('.tags-chips').forEach(function (container) {
        if (container._tagDragInit) return;
        container._tagDragInit = true;

        container.addEventListener('dragover', function (e) {
            if (_dragTagId === null) return;
            var draggedInThisContainer = container.querySelector('.tag-chip-draggable[data-tag-id="' + _dragTagId + '"]');
            if (!draggedInThisContainer) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            _clearTagDragOver();
            var chip = e.target.closest('.tag-chip-draggable');
            if (chip && chip.dataset.tagId != _dragTagId) {
                var rect = chip.getBoundingClientRect();
                var insertAfter = (e.clientX - rect.left) > rect.width / 2;
                chip.classList.add(insertAfter ? 'drag-over-right' : 'drag-over');
            } else if (!chip) {
                var chips = container.querySelectorAll('.tag-chip-draggable');
                if (chips.length === 0) return;
                var firstChip = chips[0];
                var lastChip = chips[chips.length - 1];
                var firstRect = firstChip.getBoundingClientRect();
                var lastRect = lastChip.getBoundingClientRect();
                if (e.clientX < firstRect.left + firstRect.width / 2 && firstChip.dataset.tagId != _dragTagId) {
                    firstChip.classList.add('drag-over');
                } else if (e.clientX > lastRect.left + lastRect.width / 2 && lastChip.dataset.tagId != _dragTagId) {
                    lastChip.classList.add('drag-over-right');
                }
            }
        });

        container.addEventListener('drop', function (e) {
            if (_dragTagId === null) return;
            var chip = e.target.closest('.tag-chip-draggable');
            if (chip && chip.dataset.tagId == _dragTagId) return;
            e.preventDefault();
            e.stopPropagation();
            _clearTagDragOver();
            var dim = allDimensions.find(d => d.id === selectedDimId);
            if (!dim) return;
            var isStarredContainer = container.dataset.starred === '1';
            var tags;
            if (dim.name === '作者') {
                tags = (dim.tags || []).filter(function (t) { return isStarredContainer ? t.starred : !t.starred; });
            } else {
                tags = (dim.tags || []).slice();
            }
            var fromIdx = tags.findIndex(t => t.id === _dragTagId);
            if (fromIdx < 0) return;
            var moved = tags.splice(fromIdx, 1)[0];
            if (chip) {
                var targetId = parseInt(chip.dataset.tagId);
                var toIdx = tags.findIndex(t => t.id === targetId);
                if (toIdx < 0) { tags.splice(fromIdx, 0, moved); return; }
                var rect = chip.getBoundingClientRect();
                var insertAfter = (e.clientX - rect.left) > rect.width / 2;
                var adjustedTo = toIdx;
                if (insertAfter) adjustedTo += 1;
                tags.splice(adjustedTo, 0, moved);
            } else {
                var chips = container.querySelectorAll('.tag-chip-draggable');
                if (chips.length === 0) { tags.splice(fromIdx, 0, moved); return; }
                var firstChip = chips[0];
                var lastChip = chips[chips.length - 1];
                var firstRect = firstChip.getBoundingClientRect();
                var lastRect = lastChip.getBoundingClientRect();
                if (e.clientX < firstRect.left + firstRect.width / 2) {
                    tags.unshift(moved);
                } else if (e.clientX > lastRect.left + lastRect.width / 2) {
                    tags.push(moved);
                } else {
                    tags.splice(fromIdx, 0, moved);
                    return;
                }
            }
            var ids = tags.map(t => t.id);
            fetch('/api/tags/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_ids: ids })
            }).then(() => loadDimensions());
        });
    });
}


function onTagDragEnd(e) {
    document.querySelectorAll('.tag-chip-draggable').forEach(el => {
        el.classList.remove('dragging', 'drag-over', 'drag-over-right');
    });
    _dragTagId = null;
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
}


function showCreateDimension() {
    dimModalMode = 'create';
    dimEditId = null;
    document.getElementById('dim-modal-title').textContent = '新增维度';
    document.getElementById('dim-name-input').value = '';
    document.getElementById('dim-modal').style.display = 'flex';
    document.getElementById('dim-name-input').focus();
}


function showRenameDimension(id, name) {
    dimModalMode = 'edit';
    dimEditId = id;
    document.getElementById('dim-modal-title').textContent = '重命名维度';
    document.getElementById('dim-name-input').value = name;
    document.getElementById('dim-modal').style.display = 'flex';
    document.getElementById('dim-name-input').focus();
}


function closeDimModal() {
    document.getElementById('dim-modal').style.display = 'none';
}


let _submitting = false;


function confirmDimModal() {
    if (_submitting) return;
    const name = document.getElementById('dim-name-input').value.trim();
    if (!name) { alert('请输入维度名称'); return; }
    _submitting = true;
    if (dimModalMode === 'create') {
        fetch('/api/tag-dimensions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closeDimModal();
            loadDimensions();
        }).finally(() => { _submitting = false; });
    } else {
        fetch('/api/tag-dimensions/' + dimEditId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closeDimModal();
            loadDimensions();
        }).finally(() => { _submitting = false; });
    }
}


function confirmDeleteDimension(id, name) {
    showConfirmTags('删除维度', '确定要删除维度「' + name + '」吗？关联的标签将被解除，但不会删除作品和素材。', function () {
        fetch('/api/tag-dimensions/' + id, { method: 'DELETE' }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            if (selectedDimId === id) selectedDimId = null;
            loadDimensions();
        });
    });
}


function showCreateTag(dimId) {
    tagModalMode = 'create';
    tagEditId = null;
    document.getElementById('tag-modal-title').textContent = '新增标签';
    document.getElementById('tag-name-input').value = '';
    document.getElementById('tag-name-input').dataset.dimId = dimId;
    document.getElementById('tag-modal').style.display = 'flex';
    document.getElementById('tag-name-input').focus();
}


function showRenameTag(id, name) {
    tagModalMode = 'edit';
    tagEditId = id;
    document.getElementById('tag-modal-title').textContent = '重命名标签';
    document.getElementById('tag-name-input').value = name;
    document.getElementById('tag-modal').style.display = 'flex';
    document.getElementById('tag-name-input').focus();
}


function closeTagModal() {
    document.getElementById('tag-modal').style.display = 'none';
}


function confirmTagModal() {
    if (_submitting) return;
    const name = document.getElementById('tag-name-input').value.trim();
    if (!name) { alert('请输入标签名称'); return; }
    _submitting = true;
    if (tagModalMode === 'create') {
        const dimId = document.getElementById('tag-name-input').dataset.dimId;
        fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimension_id: parseInt(dimId), name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closeTagModal();
            loadDimensions();
        }).finally(() => { _submitting = false; });
    } else {
        fetch('/api/tags/' + tagEditId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closeTagModal();
            loadDimensions();
        }).finally(() => { _submitting = false; });
    }
}


function confirmDeleteTag(id, name) {
    showConfirmTags('删除标签', '确定要删除标签「' + name + '」吗？关联将被解除，但不会删除作品和素材。', function () {
        fetch('/api/tags/' + id, { method: 'DELETE' }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            loadDimensions();
        });
    });
}


function showConfirmTags(title, message, callback) {
    showConfirmDialog('confirm-modal-tags', 'confirm-tags-title', 'confirm-tags-message', 'confirm-tags-yes', title, message, callback);
    document.getElementById('confirm-tags-yes').focus();
}


function closeConfirmTags() {
    document.getElementById('confirm-modal-tags').style.display = 'none';
}


document.getElementById('dim-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmDimModal(); });
document.getElementById('tag-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmTagModal(); });


function isModalVisible(id) {
    return document.getElementById(id).style.display !== 'none';
}


function getVisibleModal() {
    var ids = ['confirm-modal-tags', 'tag-modal', 'dim-modal'];
    for (var i = 0; i < ids.length; i++) {
        if (isModalVisible(ids[i])) return document.getElementById(ids[i]);
    }
    return null;
}


function getFocusable(modal) {
    return modal.querySelectorAll('input:not([type="hidden"]), button:not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])');
}


document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (isModalVisible('confirm-modal-tags')) { closeConfirmTags(); return; }
        if (isModalVisible('tag-modal')) { closeTagModal(); return; }
        if (isModalVisible('dim-modal')) { closeDimModal(); return; }
    }
    if (isModalVisible('confirm-modal-tags') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        document.getElementById('confirm-tags-yes').click();
    }
    if (e.key === 'Tab') {
        var modal = getVisibleModal();
        if (!modal) return;
        var focusable = getFocusable(modal);
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (!modal.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
            return;
        }
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
});


['dim-modal', 'tag-modal', 'confirm-modal-tags'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function (e) {
        if (e.target === this) {
            if (id === 'dim-modal') closeDimModal();
            else if (id === 'tag-modal') closeTagModal();
            else closeConfirmTags();
        }
    });
});


loadDimensions();


(function initDimDragDeleteZone() {
    var zone = document.getElementById('drag-delete-zone');
    if (!zone || zone._dimDeleteInit) return;
    zone._dimDeleteInit = true;
    zone.addEventListener('dragover', function (e) {
        if (_dragDimId === null && _dragTagId === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (_dragDimId !== null) _clearDimDragOver();
        if (_dragTagId !== null) _clearTagDragOver();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function (e) {
        zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        if (_dragDimId !== null) {
            var dim = allDimensions.find(function (d) { return d.id === _dragDimId; });
            var dimId = _dragDimId;
            var dimName = dim ? dim.name : '';
            _dragDimId = null;
            zone.style.display = 'none';
            confirmDeleteDimension(dimId, dimName);
        } else if (_dragTagId !== null) {
            var tagDim = allDimensions.find(d => d.id === selectedDimId);
            var tag = tagDim ? (tagDim.tags || []).find(t => t.id === _dragTagId) : null;
            var tagId = _dragTagId;
            var tagName = tag ? tag.name : '';
            _dragTagId = null;
            zone.style.display = 'none';
            confirmDeleteTag(tagId, tagName);
        }
    });
})();
