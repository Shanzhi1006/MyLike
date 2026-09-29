var currentTab = localStorage.getItem('library-tab') || 'works';
var sortOrder = 'desc';
var tagPickerCallback = null;
var tagPickerSelected = [];
var tagPickerDisabled = new Set();
var pickerCreateMode = null;
var pickerCreateDimId = null;


var pagination = {
    works: { page: 1, pageSize: 20, total: 0 },
    materials: { page: 1, pageSize: 10, total: 0, cols: 0 }
};


var WORKS_PAGE_SIZES = [20, 40, 60, 100];
var MATERIALS_ROW_OPTIONS = [10, 20, 50];
var MATERIALS_MIN_COL_WIDTH = 220;
var MATERIALS_GRID_GAP = 18;


var viewer = createImageViewer({
    navFn: 'navImage',
    rotateFn: 'rotateImage',
    closeFn: 'closeImageOverlay'
});


function openImage(url) { viewer.open(url); }
function navImage(direction) { viewer.nav(direction); }
function rotateImage(direction) { viewer.rotate(direction); }
function closeImageOverlay() { viewer.close(); }


var filterBar = createFilterBar({
    onChange: function () { pagination[currentTab].page = 1; loadData(); },
    onStarToggle: function (tagId, starred) {
        loadDimensions().then(function () {
            var dims = filterBar.getDimensions();
            var authorDim = dims.find(function (d) { return d.name === '作者'; });
            if (authorDim) filterBar.toggleDropdown(authorDim.id);
        });
    }
});


function ToggleDropdown(dimId) { closePageSizeMenu(); filterBar.toggleDropdown(dimId); }
function FilterDropdownSearch(dimId, query) { filterBar.filterDropdownSearch(dimId, query); }
function ToggleFilter(dimId, tagId) { filterBar.toggleFilter(dimId, tagId); }
function RemoveFilter(dimId, tagId) { filterBar.removeFilter(dimId, tagId); }
function ToggleTagStar(tagId) { filterBar.toggleTagStar(tagId); }
function clearFilters() { filterBar.clearFilters(); }


function switchTab(tab) {
    currentTab = tab;
    localStorage.setItem('library-tab', tab);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('works-view').style.display = tab === 'works' ? '' : 'none';
    document.getElementById('materials-view').style.display = tab === 'materials' ? '' : 'none';
    document.getElementById('uploads-view').style.display = tab === 'uploads' ? '' : 'none';
    document.getElementById('works-pagination').style.display = tab === 'works' ? '' : 'none';
    document.getElementById('materials-pagination').style.display = tab === 'materials' ? '' : 'none';
    var filterBarEl = document.querySelector('.filter-bar');
    if (filterBarEl) filterBarEl.style.display = tab === 'uploads' ? 'none' : '';
    var chipsBar = document.getElementById('filter-chips-bar');
    if (chipsBar) chipsBar.style.display = 'none';
    if (tab === 'uploads') {
        loadPersonalUploads();
    } else {
        updatePageSizeSelector();
        pagination[tab].page = 1;
        loadData();
    }
}


function toggleSortOrder() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    var icon = document.getElementById('sort-order-icon');
    var label = document.getElementById('sort-order-label');
    if (sortOrder === 'desc') {
        icon.innerHTML = '<i class="fas fa-arrow-down-wide-short"></i>';
        label.textContent = '倒序';
    } else {
        icon.innerHTML = '<i class="fas fa-arrow-up-wide-short"></i>';
        label.textContent = '正序';
    }
    pagination[currentTab].page = 1;
    loadData();
}


function updatePageSizeSelector() {
    var label = document.getElementById('page-size-label');
    var menu = document.getElementById('page-size-menu');
    if (!label || !menu) return;
    var options, currentVal, unit;
    if (currentTab === 'works') {
        options = WORKS_PAGE_SIZES;
        currentVal = pagination.works.pageSize;
        unit = '条';
    } else {
        options = MATERIALS_ROW_OPTIONS;
        currentVal = pagination.materials.pageSize;
        unit = '行';
    }
    label.textContent = '每页 ' + currentVal + unit;
    menu.innerHTML = options.map(function (v) {
        var active = v === currentVal;
        return '<label class="dd-radio' + (active ? ' active' : '') + '" onclick="onPageSizeChange(' + v + ')">'
            + '<span>' + v + unit + '</span>'
            + (active ? '<i class="fas fa-check dd-check-icon"></i>' : '')
            + '</label>';
    }).join('');
}


function togglePageSizeDropdown(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('page-size-menu');
    var isOpen = menu.style.display !== 'none';
    closeAllFilterDropdowns();
    if (!isOpen) menu.style.display = '';
}


function closeAllFilterDropdowns() {
    var menu = document.getElementById('page-size-menu');
    if (menu) menu.style.display = 'none';
    if (typeof filterBar !== 'undefined' && filterBar) filterBar.closeAllDropdowns();
}


function closePageSizeMenu() {
    var menu = document.getElementById('page-size-menu');
    if (menu) menu.style.display = 'none';
}


function onPageSizeChange(val) {
    val = parseInt(val);
    if (currentTab === 'works') {
        pagination.works.pageSize = val;
    } else {
        pagination.materials.pageSize = val;
    }
    pagination[currentTab].page = 1;
    closeAllFilterDropdowns();
    updatePageSizeSelector();
    loadData();
}


function detectMaterialColumns() {
    var container = document.getElementById('materials-view');
    if (!container) return 1;
    var width = container.clientWidth;
    var cols = Math.floor((width + MATERIALS_GRID_GAP) / (MATERIALS_MIN_COL_WIDTH + MATERIALS_GRID_GAP));
    return Math.max(1, cols);
}


function getMaterialsPerPage() {
    var cols = detectMaterialColumns();
    if (cols !== pagination.materials.cols && pagination.materials.cols > 0) {
        pagination.materials.page = 1;
    }
    pagination.materials.cols = cols;
    return pagination.materials.pageSize * cols;
}


function loadDimensions() {
    return fetch('/api/tag-dimensions').then(r => r.json()).then(data => {
        var dims = data.dimensions || [];
        sortDimensions(dims);
        filterBar.setDimensions(dims);
    }).catch(function (err) {
        console.error('加载维度失败:', err);
    });
}


function loadData() {
    var params = [];
    var activeFilters = filterBar.getActiveFilters();
    if (Object.keys(activeFilters).length > 0) params.push('tag_filter=' + encodeURIComponent(JSON.stringify(activeFilters)));
    params.push('sort_order=' + sortOrder);
    var p = pagination[currentTab];
    params.push('page=' + p.page);
    if (currentTab === 'works') {
        params.push('per_page=' + p.pageSize);
    } else {
        params.push('per_page=' + getMaterialsPerPage());
    }
    var qs = '?' + params.join('&');
    if (currentTab === 'works') {
        fetch('/api/works' + qs).then(r => r.json()).then(data => {
            pagination.works.total = data.total || 0;
            renderWorks(data.works || []);
            renderPagination('works');
        }).catch(function (err) {
            console.error('加载作品失败:', err);
            document.getElementById('works-view').innerHTML = '<div class="empty">加载失败，请检查网络连接</div>';
        });
    } else {
        fetch('/api/materials' + qs).then(r => r.json()).then(data => {
            pagination.materials.total = data.total || 0;
            renderMaterials(data.materials || []);
            renderPagination('materials');
        }).catch(function (err) {
            console.error('加载素材失败:', err);
            document.getElementById('materials-view').innerHTML = '<div class="empty">加载失败，请检查网络连接</div>';
        });
    }
}


function renderWorks(works) {
    const container = document.getElementById('works-view');
    if (works.length === 0) {
        container.innerHTML = '<div class="empty">暂无作品</div>';
        return;
    }
    var galleryList = [];
    let html = '';
    works.forEach(w => {
        html += '<div class="work-row" data-id="' + w.id + '">';
        html += '<button class="row-delete-btn" onclick="confirmDeleteWork(' + w.id + ',\'' + escapeHtml(w.title).replace(/'/g, "\\'") + '\')"><i class="fas fa-times"></i></button>';
        html += '<div class="work-info">';
        if (w.original_url) {
            html += '<div class="work-title"><a href="' + escapeHtml(w.original_url) + '" target="_blank" rel="noopener noreferrer" class="work-title-link">' + escapeHtml(w.title) + '</a></div>';
        } else {
            html += '<div class="work-title work-title-editable" onclick="editWorkTitle(' + w.id + ', this)" title="点击编辑标题">' + escapeHtml(w.title) + '</div>';
        }
        html += '<div class="work-meta">';
        var authorClass = 'badge-author-manual';
        if (w.platform_display === '抖音') authorClass = 'badge-author-douyin';
        else if (w.platform_display === '小红书') authorClass = 'badge-author-xhs';
        html += '<span class="badge ' + authorClass + '">' + escapeHtml(w.author_name) + '</span>';
        html += '</div>';
        html += '<div class="work-custom-tags">';
        (w.tags || []).forEach(t => {
            if (t.dimension_type === 'custom') {
                html += '<span class="badge badge-tag">' + escapeHtml(t.name) + '</span>';
            }
        });
        html += '<button class="tag-add-btn" onclick="openTagPicker(\'work\',' + w.id + ')"><i class="fas fa-plus-circle"></i></button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="work-materials" data-work-id="' + w.id + '">';
        (w.materials || []).forEach(m => {
            if (m.type === 'image') {
                galleryList.push({ url: m.url, materialId: m.id });
                html += '<div class="thumb thumb-image" draggable="true" data-material-id="' + m.id + '"><img id="thumb-img-' + m.id + '" src="' + (m.thumb_url || m.url) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + m.url + '\'" onclick="openImage(\'' + m.url + '\')"><span class="thumb-badge badge-image">图</span></div>';
            } else {
                html += '<div class="thumb thumb-video" draggable="true" data-material-id="' + m.id + '"><img id="thumb-img-' + m.id + '" src="' + (m.thumb_url || m.url) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + m.url + '\'" onclick="openVideo(\'' + m.url + '\', ' + m.id + ')"><span class="video-icon">&#9658;</span><span class="thumb-badge badge-video">视</span></div>';
            }
        });
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
    html = '<div class="batch-bar" id="batch-bar" style="display:none;"><span id="selected-count"></span><button class="btn btn-sm btn-primary" onclick="openBatchTagPicker()">批量标签</button><button class="btn btn-sm btn-danger" onclick="confirmBatchDelete()">批量删除</button><button class="btn btn-sm btn-secondary" onclick="clearSelection()">取消选中</button></div>';
    container.innerHTML += html;
    viewer.setGallery(galleryList);
    addSelection();
    updateWorkMaterialsScroll();
    initMaterialDragDrop();
}


function updateWorkMaterialsScroll() {
    document.querySelectorAll('.work-materials').forEach(el => {
        el.classList.toggle('has-scroll', el.scrollWidth > el.clientWidth);
    });
}


var _dragSrcThumb = null;


function _clearThumbDragOver() {
    document.querySelectorAll('.thumb.drag-over, .thumb.drag-over-right').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-right');
    });
}


function _showDragDeleteZone() {
    var zone = document.getElementById('drag-delete-zone');
    if (zone) zone.style.display = 'flex';
}


function _hideDragDeleteZone() {
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
}


function initDragDeleteZone() {
    var zone = document.getElementById('drag-delete-zone');
    if (!zone || zone._dragDeleteInit) return;
    zone._dragDeleteInit = true;
    zone.addEventListener('dragover', function (e) {
        if (!_dragSrcThumb && !_dragSrcMaterialThumb) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        _clearThumbDragOver();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function (e) {
        zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        if (_dragSrcThumb) {
            var materialId = parseInt(_dragSrcThumb.dataset.materialId);
            _dragSrcThumb = null;
            _hideDragDeleteZone();
            confirmDeleteMaterial(materialId);
        } else if (_dragSrcMaterialThumb) {
            var mid = parseInt(_dragSrcMaterialThumb.dataset.materialId);
            _dragSrcMaterialThumb = null;
            _hideDragDeleteZone();
            confirmDeleteMaterial(mid);
        }
    });
}


function initMaterialDragDrop() {
    document.querySelectorAll('.work-materials').forEach(container => {
        var thumbs = container.querySelectorAll('.thumb');
        thumbs.forEach(thumb => {
            thumb.addEventListener('dragstart', function (e) {
                _dragSrcThumb = this;
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', this.dataset.materialId);
                var imgEl = this.querySelector('img');
                createDragImage(imgEl, this, e);
                clearSelection();
                _showDragDeleteZone();
            });
            thumb.addEventListener('dragend', function (e) {
                this.classList.remove('dragging');
                _dragSrcThumb = null;
                _clearThumbDragOver();
                _hideDragDeleteZone();
            });
            thumb.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (this === _dragSrcThumb) return;
                _clearThumbDragOver();
                var rect = this.getBoundingClientRect();
                var insertAfter = (e.clientX - rect.left) > rect.width / 2;
                this.classList.add(insertAfter ? 'drag-over-right' : 'drag-over');
            });
            thumb.addEventListener('dragleave', function (e) {
                this.classList.remove('drag-over', 'drag-over-right');
            });
            thumb.addEventListener('drop', function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.remove('drag-over', 'drag-over-right');
                if (!_dragSrcThumb || _dragSrcThumb === this) return;
                if (_dragSrcThumb.parentNode !== container) return;
                var rect = this.getBoundingClientRect();
                var insertAfter = (e.clientX - rect.left) > rect.width / 2;
                if (insertAfter) {
                    container.insertBefore(_dragSrcThumb, this.nextSibling);
                } else {
                    container.insertBefore(_dragSrcThumb, this);
                }
                saveMaterialOrder(container);
            });
        });
        container.addEventListener('dragover', function (e) {
            if (!_dragSrcThumb || _dragSrcThumb.parentNode !== container) return;
            var target = e.target.closest('.thumb');
            if (target) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            _clearThumbDragOver();
            var firstThumb = container.querySelector('.thumb:first-child');
            var lastThumb = container.querySelector('.thumb:last-child');
            if (!firstThumb || !lastThumb) return;
            if (_dragSrcThumb === firstThumb && _dragSrcThumb === lastThumb) return;
            var firstRect = firstThumb.getBoundingClientRect();
            var lastRect = lastThumb.getBoundingClientRect();
            if (e.clientX < firstRect.left + firstRect.width / 2 && _dragSrcThumb !== firstThumb) {
                firstThumb.classList.add('drag-over');
            } else if (e.clientX > lastRect.left + lastRect.width / 2 && _dragSrcThumb !== lastThumb) {
                lastThumb.classList.add('drag-over-right');
            }
        });
        container.addEventListener('drop', function (e) {
            if (!_dragSrcThumb || _dragSrcThumb.parentNode !== container) return;
            var target = e.target.closest('.thumb');
            if (target) return;
            e.preventDefault();
            e.stopPropagation();
            _clearThumbDragOver();
            var firstThumb = container.querySelector('.thumb:first-child');
            var lastThumb = container.querySelector('.thumb:last-child');
            if (!firstThumb || !lastThumb) return;
            var firstRect = firstThumb.getBoundingClientRect();
            var lastRect = lastThumb.getBoundingClientRect();
            if (e.clientX < firstRect.left + firstRect.width / 2 && _dragSrcThumb !== firstThumb) {
                container.insertBefore(_dragSrcThumb, firstThumb);
                saveMaterialOrder(container);
            } else if (e.clientX > lastRect.left + lastRect.width / 2 && _dragSrcThumb !== lastThumb) {
                container.insertBefore(_dragSrcThumb, lastThumb.nextSibling);
                saveMaterialOrder(container);
            }
        });
    });
    initDragDeleteZone();
}


var _dragSrcMaterialThumb = null;


function initMaterialThumbDragDrop() {
    document.querySelectorAll('.material-thumb[draggable="true"]').forEach(function (thumb) {
        if (thumb._mtDragInit) return;
        thumb._mtDragInit = true;
        thumb.addEventListener('dragstart', function (e) {
            _dragSrcMaterialThumb = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.materialId);
            var imgEl = this.querySelector('img');
            createDragImage(imgEl, this, e);
            clearSelection();
            _showDragDeleteZone();
        });
        thumb.addEventListener('dragend', function (e) {
            _dragSrcMaterialThumb = null;
            _hideDragDeleteZone();
        });
    });
    initDragDeleteZone();
}


function saveMaterialOrder(container) {
    var workId = container.dataset.workId;
    var materialIds = Array.from(container.querySelectorAll('.thumb')).map(t => parseInt(t.dataset.materialId));
    fetch('/api/works/' + workId + '/materials/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_ids: materialIds })
    }).then(r => r.json()).then(data => {
        if (data.error) showToast(data.error, 'error');
    }).catch(function () {
        showToast('排序保存失败', 'error');
    });
}


function renderMaterials(materials) {
    const container = document.getElementById('materials-view');
    if (materials.length === 0) {
        container.innerHTML = '<div class="empty">暂无素材</div>';
        return;
    }
    var galleryList = [];
    let html = '<div class="materials-grid">';
    materials.forEach(m => {
        html += '<div class="material-card" data-id="' + m.id + '">';
        html += '<button class="row-delete-btn" onclick="confirmDeleteMaterial(' + m.id + ')"><i class="fas fa-times"></i></button>';
        if (m.type === 'image') {
            galleryList.push({ url: m.url, materialId: m.id });
            html += '<div class="material-thumb" draggable="true" data-material-id="' + m.id + '" onclick="openImage(\'' + m.url + '\')"><img id="thumb-img-' + m.id + '" src="' + (m.thumb_url || m.url) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + m.url + '\'"><span class="thumb-badge badge-image">图</span></div>';
        } else {
            html += '<div class="material-thumb" draggable="true" data-material-id="' + m.id + '" onclick="openVideo(\'' + m.url + '\', ' + m.id + ')"><img id="thumb-img-' + m.id + '" src="' + (m.thumb_url || m.url) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + m.url + '\'"><span class="video-icon">&#9658;</span><span class="thumb-badge badge-video">视</span></div>';
        }
        html += '<div class="material-info">';
        html += '<div class="material-title">' + escapeHtml(m.work_title) + '</div>';
        html += '<div class="material-tags">';
        let _platformName = '';
        (m.tags || []).forEach(t => {
            if (t.dimension_name === '平台') _platformName = t.name;
        });
        (m.tags || []).forEach(t => {
            if (t.dimension_name === '类型') return;
            if (t.dimension_name === '平台') return;
            if (t.dimension_name === '作者') {
                var ac = 'badge-author-manual';
                if (_platformName === '抖音') ac = 'badge-author-douyin';
                else if (_platformName === '小红书') ac = 'badge-author-xhs';
                html += '<span class="badge ' + ac + '">' + escapeHtml(t.name) + '</span>';
            }
        });
        html += '</div>';
        html += '<div class="material-custom-tags">';
        let _customTags = (m.tags || []).filter(t => t.dimension_name !== '类型' && t.dimension_name !== '平台' && t.dimension_name !== '作者');
        _customTags.sort((a, b) => {
            if (a.source === 'inherited' && b.source !== 'inherited') return -1;
            if (a.source !== 'inherited' && b.source === 'inherited') return 1;
            return 0;
        });
        _customTags.forEach(t => {
            const cls = t.source === 'own' ? 'badge badge-tag-own' : 'badge badge-tag';
            html += '<span class="' + cls + '">' + escapeHtml(t.name) + '</span>';
        });
        html += '<button class="tag-add-btn" onclick="openTagPicker(\'material\',' + m.id + ')"><i class="fas fa-plus-circle"></i></button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '<div class="batch-bar" id="batch-bar" style="display:none;"><span id="selected-count"></span><button class="btn btn-sm btn-primary" onclick="openBatchTagPicker()">批量标签</button><button class="btn btn-sm btn-danger" onclick="confirmBatchDelete()">批量删除</button><button class="btn btn-sm btn-secondary" onclick="clearSelection()">取消选中</button></div>';
    container.innerHTML = html;
    viewer.setGallery(galleryList);
    addSelection();
    initMaterialThumbDragDrop();
}


function renderPagination(tab) {
    var p = pagination[tab];
    var containerId = tab === 'works' ? 'works-pagination' : 'materials-pagination';
    var container = document.getElementById(containerId);
    if (!container) return;


    var perPage = tab === 'works' ? p.pageSize : p.pageSize * (p.cols || 1);
    var totalPages = Math.ceil(p.total / perPage);
    if (totalPages <= 1) {
        container.innerHTML = '<span class="pagination-info">共 ' + p.total + ' 条</span>';
        return;
    }


    var cur = p.page;
    var start = Math.max(1, cur - 2);
    var end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);


    var html = '<span class="pagination-info">共 ' + p.total + ' 条，第 ' + cur + '/' + totalPages + ' 页</span>';
    html += '<div class="pagination-controls">';
    html += '<button class="pagination-btn' + (cur <= 1 ? ' disabled' : '') + '" onclick="goToPage(' + (cur - 1) + ')"' + (cur <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';


    if (start > 1) {
        html += '<button class="pagination-btn" onclick="goToPage(1)">1</button>';
        if (start > 2) html += '<span class="pagination-ellipsis">...</span>';
    }
    for (var i = start; i <= end; i++) {
        html += '<button class="pagination-btn' + (i === cur ? ' active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
    }
    if (end < totalPages) {
        if (end < totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
        html += '<button class="pagination-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
    }


    html += '<button class="pagination-btn' + (cur >= totalPages ? ' disabled' : '') + '" onclick="goToPage(' + (cur + 1) + ')"' + (cur >= totalPages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
    html += '</div>';
    container.innerHTML = html;
}


function goToPage(page) {
    var p = pagination[currentTab];
    var perPage = currentTab === 'works' ? p.pageSize : p.pageSize * (p.cols || 1);
    var totalPages = Math.ceil(p.total / perPage);
    page = Math.max(1, Math.min(totalPages, page));
    if (page === p.page) return;
    p.page = page;
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


function addSelection() {
    const selector = currentTab === 'works' ? '.work-row' : '.material-card';
    document.querySelectorAll(selector).forEach(card => {
        card.addEventListener('click', function (e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.tagName === 'A') return;
            this.classList.toggle('selected');
            updateSelectedCount();
        });
    });
}


function updateSelectedCount() {
    const selector = currentTab === 'works' ? '.work-row.selected' : '.material-card.selected';
    const count = document.querySelectorAll(selector).length;
    const container = currentTab === 'works' ? document.getElementById('works-view') : document.getElementById('materials-view');
    const bar = container.querySelector('#batch-bar');
    const el = container.querySelector('#selected-count');
    if (bar) bar.style.display = count > 0 ? '' : 'none';
    if (el) el.textContent = count > 0 ? '已选 ' + count + ' 个' : '';
}


function clearSelection() {
    document.querySelectorAll('.work-row.selected, .material-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    updateSelectedCount();
}


function getSelectedIds() {
    if (currentTab === 'works') {
        return Array.from(document.querySelectorAll('.work-row.selected')).map(c => parseInt(c.dataset.id));
    }
    return Array.from(document.querySelectorAll('.material-card.selected')).map(c => parseInt(c.dataset.id));
}


function openTagPicker(type, id) {
    const tagsUrl = type === 'work' ? '/api/works/' + id + '/tags' : '/api/materials/' + id + '/tags';
    fetch(tagsUrl).then(r => r.json()).then(data => {
        const tags = data.tags || [];
        tagPickerSelected = tags.map(t => t.id);
        tagPickerDisabled = new Set(
            type === 'material' ? tags.filter(t => t.source === 'inherited').map(t => t.id) : []
        );
        tagPickerCallback = function (tagIds) {
            const url = type === 'work' ? '/api/works/' + id + '/tags' : '/api/materials/' + id + '/tags';
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_ids: tagIds, sync: true })
            }).then(r => r.json()).then(() => { loadData(); });
        };
        showTagPicker(id);
    });
}


function openBatchTagPicker() {
    const ids = getSelectedIds();
    if (ids.length === 0) { alert('请先选择' + (currentTab === 'works' ? '作品' : '素材')); return; }
    tagPickerCallback = function (tagIds) {
        const url = currentTab === 'works' ? '/api/works/batch/tags' : '/api/materials/batch/tags';
        const key = currentTab === 'works' ? 'work_ids' : 'material_ids';
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: ids, tag_ids: tagIds })
        }).then(r => r.json()).then(() => { loadData(); });
    };
    tagPickerSelected = [];
    tagPickerDisabled = new Set();
    showTagPicker(null);
}



function showTagPicker(id) {
    const modal = document.getElementById('tag-picker-modal');
    const body = document.getElementById('tag-picker-body');
    var dims = filterBar.getDimensions();
    let html = '';
    dims.forEach(dim => {
        if (dim.type === 'fixed' && dim.name === '类型') return;
        if (dim.type === 'fixed' && dim.name === '平台') return;
        if (dim.type === 'fixed' && dim.name === '作者') return;
        html += '<div class="tag-picker-group"><label>' + escapeHtml(dim.name) + '</label><div class="tag-picker-tags">';
        (dim.tags || []).forEach(tag => {
            const selected = tagPickerSelected.includes(tag.id);
            const disabled = tagPickerDisabled.has(tag.id);
            const cls = 'tag-pick-btn' + (selected ? ' active' : '') + (disabled ? ' disabled' : '');
            const clickAttr = disabled ? '' : ' onclick="toggleTagPick(' + tag.id + ')"';
            html += '<button class="' + cls + '" data-tag-id="' + tag.id + '"' + clickAttr + '>' + escapeHtml(tag.name) + '</button>';
        });
        html += '<button class="tag-pick-add-btn" onclick="showPickerCreateTag(' + dim.id + ',\'' + escapeHtml(dim.name).replace(/'/g, "\\'") + '\')"><i class="fas fa-plus"></i></button>';
        html += '</div></div>';
    });
    body.innerHTML = html;
    modal.style.display = 'flex';
}


function toggleTagPick(tagId) {
    const idx = tagPickerSelected.indexOf(tagId);
    if (idx >= 0) tagPickerSelected.splice(idx, 1);
    else tagPickerSelected.push(tagId);
    document.querySelectorAll('.tag-pick-btn').forEach(btn => {
        const tid = parseInt(btn.dataset.tagId);
        btn.classList.toggle('active', tagPickerSelected.includes(tid));
    });
}


function confirmTagPicker() {
    const result = tagPickerSelected.filter(id => !tagPickerDisabled.has(id));
    if (tagPickerCallback) tagPickerCallback(result);
    closeTagPicker();
}


function closeTagPicker() {
    document.getElementById('tag-picker-modal').style.display = 'none';
    tagPickerCallback = null;
    tagPickerSelected = [];
    tagPickerDisabled = new Set();
}


function showPickerCreateDimension() {
    pickerCreateMode = 'dimension';
    pickerCreateDimId = null;
    document.getElementById('picker-create-title').textContent = '新增维度';
    document.getElementById('picker-create-input').placeholder = '维度名称（如：场景、风格、主题）';
    document.getElementById('picker-create-input').value = '';
    document.getElementById('picker-create-modal').style.display = 'flex';
    document.getElementById('picker-create-input').focus();
}


function showPickerCreateTag(dimId, dimName) {
    pickerCreateMode = 'tag';
    pickerCreateDimId = dimId;
    document.getElementById('picker-create-title').textContent = '新增标签 - ' + dimName;
    document.getElementById('picker-create-input').placeholder = '标签名称';
    document.getElementById('picker-create-input').value = '';
    document.getElementById('picker-create-modal').style.display = 'flex';
    document.getElementById('picker-create-input').focus();
}


function closePickerCreateModal() {
    document.getElementById('picker-create-modal').style.display = 'none';
}


function confirmPickerCreate() {
    const name = document.getElementById('picker-create-input').value.trim();
    if (!name) { alert('请输入名称'); return; }
    if (pickerCreateMode === 'dimension') {
        fetch('/api/tag-dimensions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closePickerCreateModal();
            loadDimensions().then(() => { showTagPicker(null); });
        });
    } else if (pickerCreateMode === 'tag') {
        fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dimension_id: pickerCreateDimId, name: name })
        }).then(r => r.json()).then(data => {
            if (data.error) { alert(data.error); return; }
            closePickerCreateModal();
            loadDimensions().then(() => { showTagPicker(null); });
        });
    }
}


function confirmDeleteWork(id, title) {
    showConfirm('删除作品', '确定要删除作品「' + title + '」及其所有素材吗？此操作不可恢复。', function () {
        fetch('/api/works/' + id, { method: 'DELETE' }).then(r => r.json()).then(() => loadData());
    });
}


function editWorkTitle(workId, titleEl) {
    var oldTitle = titleEl.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'work-title-input';
    input.value = oldTitle;
    input.onclick = function (e) { e.stopPropagation(); };
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function finish(save) {
        if (done) return;
        done = true;
        if (save) {
            var newTitle = input.value.trim();
            if (!newTitle || newTitle === oldTitle) {
                restore();
                return;
            }
            fetch('/api/works/' + workId + '/title', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            }).then(r => r.json()).then(data => {
                if (data.error) { alert(data.error); restore(); return; }
                var div = document.createElement('div');
                div.className = 'work-title work-title-editable';
                div.title = '点击编辑标题';
                div.onclick = function () { editWorkTitle(workId, div); };
                div.textContent = data.title;
                input.replaceWith(div);
            }).catch(function () { restore(); });
        } else {
            restore();
        }
    }

    function restore() {
        var div = document.createElement('div');
        div.className = 'work-title work-title-editable';
        div.title = '点击编辑标题';
        div.onclick = function () { editWorkTitle(workId, div); };
        div.textContent = oldTitle;
        input.replaceWith(div);
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });
}


function confirmDeleteMaterial(id) {
    showConfirm('删除素材', '确定要删除这个素材吗？此操作不可恢复。', function () {
        fetch('/api/materials/' + id, { method: 'DELETE' }).then(r => r.json()).then(() => loadData());
    });
}


function confirmBatchDelete() {
    const ids = getSelectedIds();
    if (ids.length === 0) { alert('请先选择' + (currentTab === 'works' ? '作品' : '素材')); return; }
    const label = currentTab === 'works' ? '作品' : '素材';
    showConfirm('批量删除', '确定要删除选中的 ' + ids.length + ' 个' + label + '吗？此操作不可恢复。', function () {
        const url = currentTab === 'works' ? '/api/works/batch/delete' : '/api/materials/batch/delete';
        const key = currentTab === 'works' ? 'work_ids' : 'material_ids';
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: ids })
        }).then(r => r.json()).then(() => { clearSelection(); loadData(); });
    });
}


var confirmCallback = null;


function showConfirm(title, message, callback) {
    confirmCallback = callback;
    showConfirmDialog('confirm-modal', 'confirm-title', 'confirm-message', 'confirm-yes', title, message, function () {
        if (confirmCallback) { confirmCallback(); confirmCallback = null; }
    });
}


function closeConfirm() {
    document.getElementById('confirm-modal').style.display = 'none';
    confirmCallback = null;
}


function openVideo(url, materialId) {
    var existing = document.querySelector('.video-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.className = 'video-overlay';


    var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var html = '<div class="video-main">';
    html += '<video src="' + url + '" controls autoplay></video>';
    html += '<div class="video-speed-bar">';
    speeds.forEach(function (s) {
        var label = (s === 1) ? '1x' : s + 'x';
        var cls = (s === 1) ? 'video-speed-btn active' : 'video-speed-btn';
        html += '<button class="' + cls + '" data-rate="' + s + '">' + label + '</button>';
    });
    html += '</div>';
    if (materialId) {
        html += '<div class="video-capture-bar">';
        html += '<button class="video-capture-btn" onclick="event.stopPropagation();captureFrame(' + materialId + ')"><i class="fas fa-camera"></i> 截取画面 <span class="capture-shortcut">C</span></button>';
        html += '</div>';
    }
    html += '</div>';


    if (materialId) {
        html += '<div class="video-sidebar">';
        html += '<div class="capture-list" id="capture-list"><div class="capture-list-empty">暂无截取画面</div></div>';
        html += '</div>';
    }


    overlay.innerHTML = html;


    var video = overlay.querySelector('video');
    var speedBtns = overlay.querySelectorAll('.video-speed-btn');
    var currentRate = 1;

    function setPlaybackRate(rate) {
        currentRate = rate;
        if (video) video.playbackRate = rate;
        speedBtns.forEach(function (btn) {
            btn.classList.toggle('active', parseFloat(btn.dataset.rate) === rate);
        });
    }

    speedBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            setPlaybackRate(parseFloat(btn.dataset.rate));
        });
    });


    function closeOverlay() {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        loadData();
    }


    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeOverlay();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (video) {
                if (video.paused) video.play(); else video.pause();
            }
        } else if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (materialId) captureFrame(materialId);
        } else if (e.key === ',' || e.key === '<') {
            e.preventDefault();
            var idx = speeds.indexOf(currentRate);
            if (idx > 0) setPlaybackRate(speeds[idx - 1]);
        } else if (e.key === '.' || e.key === '>') {
            e.preventDefault();
            var idx2 = speeds.indexOf(currentRate);
            if (idx2 < speeds.length - 1) setPlaybackRate(speeds[idx2 + 1]);
        }
    }


    overlay.onclick = function (e) { if (e.target === overlay) closeOverlay(); };
    var videoMain = overlay.querySelector('.video-main');
    if (videoMain) videoMain.onclick = function (e) { if (e.target === videoMain) closeOverlay(); };
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeydown);


    if (materialId) loadCaptures(materialId);
}


function loadCaptures(materialId) {
    var list = document.getElementById('capture-list');
    if (!list) return;
    list.innerHTML = '<div class="capture-list-empty"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch('/api/materials/' + materialId + '/captures').then(function (r) { return r.json(); }).then(function (data) {
        if (!list || list.parentNode === null) return;
        var captures = data.captures || [];
        if (captures.length === 0) {
            list.innerHTML = '<div class="capture-list-empty">暂无截取画面</div>';
            return;
        }
        captures.sort(function (a, b) {
            return (a.video_offset || 0) - (b.video_offset || 0);
        });
        var total = captures.length;
        var html = '';
        captures.forEach(function (c, idx) {
            var seq = (idx + 1) + '/' + total;
            var time = formatCaptureTime(c.video_offset);
            html += '<div class="capture-list-item" data-id="' + c.id + '" data-material-id="' + materialId + '">';
            html += '<div class="capture-item-info"><span class="capture-seq">' + seq + '</span><span class="capture-time">' + time + '</span></div>';
            html += '<img src="' + c.url + '" loading="lazy" onclick="event.stopPropagation();openImage(\'' + c.url + '\')">';
            html += '<button class="capture-delete-btn" onclick="event.stopPropagation();deleteCapture(' + c.id + ',' + materialId + ')"><i class="fas fa-times"></i></button>';
            html += '</div>';
        });
        list.innerHTML = html;
    }).catch(function () {
        if (list) list.innerHTML = '<div class="capture-list-empty">加载失败</div>';
    });
}


function formatCaptureTime(offsetSec) {
    if (offsetSec == null) return '--:--:--.---';
    var totalSec = Math.max(0, offsetSec);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = Math.floor(totalSec % 60);
    var ms = Math.round((totalSec - Math.floor(totalSec)) * 1000);
    if (ms === 1000) { ms = 0; s += 1; }
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}


function deleteCapture(captureId, materialId) {
    var list = document.getElementById('capture-list');
    var item = list && list.querySelector('.capture-list-item[data-id="' + captureId + '"]');
    if (item) {
        item.classList.add('capture-removing');
        setTimeout(function () { if (item.parentNode) item.remove(); renumberCaptures(list); }, 200);
    }
    fetch('/api/materials/' + captureId, {
        method: 'DELETE'
    }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('已删除', 'success');
    }).catch(function () {
        showToast('删除失败，请重试', 'error');
    });
}


function renumberCaptures(list) {
    if (!list) return;
    var items = list.querySelectorAll('.capture-list-item');
    var total = items.length;
    items.forEach(function (item, idx) {
        var seqEl = item.querySelector('.capture-seq');
        if (seqEl) seqEl.textContent = (idx + 1) + '/' + total;
    });
    if (total === 0) {
        list.innerHTML = '<div class="capture-list-empty">暂无截取画面</div>';
    }
}


function scrollToCaptureCenter(list, item) {
    var listRect = list.getBoundingClientRect();
    var itemRect = item.getBoundingClientRect();
    var itemOffset = item.offsetTop - list.offsetTop;
    var target = itemOffset - (listRect.height - itemRect.height) / 2;
    list.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}


function captureFrame(materialId) {
    var overlay = document.querySelector('.video-overlay');
    if (!overlay) return;
    var video = overlay.querySelector('video');
    if (!video) return;
    if (!video.videoWidth || !video.videoHeight) { showToast('视频尚未加载完成', 'error'); return; }
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        showToast('截帧失败: ' + e.message, 'error');
        return;
    }


    var mainArea = overlay.querySelector('.video-main') || overlay;
    var flash = document.createElement('div');
    flash.className = 'capture-flash';
    mainArea.appendChild(flash);
    setTimeout(function () { if (flash.parentNode) flash.remove(); }, 220);


    var freeze = document.createElement('img');
    freeze.className = 'capture-freeze';
    freeze.src = canvas.toDataURL('image/jpeg', 0.95);
    mainArea.appendChild(freeze);
    requestAnimationFrame(function () {
        freeze.classList.add('show');
        setTimeout(function () {
            freeze.classList.remove('show');
            freeze.classList.add('hide');
            setTimeout(function () { if (freeze.parentNode) freeze.remove(); }, 320);
        }, 200);
    });


    var btn = overlay.querySelector('.video-capture-btn');
    if (btn) btn.disabled = true;


    var videoOffset = video.currentTime;
    var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    var list = document.getElementById('capture-list');
    var emptyEl = list && list.querySelector('.capture-list-empty');
    if (emptyEl) emptyEl.remove();
    var existingCount = list ? list.querySelectorAll('.capture-list-item').length : 0;
    var total = existingCount + 1;
    var time = formatCaptureTime(videoOffset);


    var tempId = 'temp-' + Date.now();
    var itemHtml = '<div class="capture-list-item capture-uploading" data-id="' + tempId + '" data-material-id="' + materialId + '">';
    itemHtml += '<div class="capture-item-info"><span class="capture-seq">' + total + '/' + total + '</span><span class="capture-time">' + time + '</span></div>';
    itemHtml += '<img src="' + dataUrl + '" loading="lazy">';
    itemHtml += '<button class="capture-delete-btn"><i class="fas fa-times"></i></button>';
    itemHtml += '</div>';


    if (list) {
        list.insertAdjacentHTML('beforeend', itemHtml);
        var newItem = list.lastElementChild;
        renumberCaptures(list);
        scrollToCaptureCenter(list, newItem);


        canvas.toBlob(function (blob) {
            if (!blob) {
                showToast('截帧失败: 无法生成图片', 'error');
                if (btn) btn.disabled = false;
                newItem.remove();
                renumberCaptures(list);
                return;
            }
            var formData = new FormData();
            formData.append('frame', blob, 'capture.jpg');
            formData.append('video_offset', String(videoOffset));
            fetch('/api/materials/' + materialId + '/capture-frame', {
                method: 'POST',
                body: formData
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (btn) btn.disabled = false;
                if (data.error) {
                    showToast(data.error, 'error');
                    newItem.remove();
                    renumberCaptures(list);
                    return;
                }
                newItem.classList.remove('capture-uploading');
                newItem.dataset.id = data.material.id;
                var img = newItem.querySelector('img');
                img.src = data.material.url;
                img.onclick = function (e) { e.stopPropagation(); openImage(data.material.url); };
                if (data.material.video_offset != null) {
                    var timeEl = newItem.querySelector('.capture-time');
                    if (timeEl) timeEl.textContent = formatCaptureTime(data.material.video_offset);
                }
                var delBtn = newItem.querySelector('.capture-delete-btn');
                delBtn.onclick = function (e) { e.stopPropagation(); deleteCapture(data.material.id, materialId); };
                showToast('已保存', 'success');
            }).catch(function () {
                if (btn) btn.disabled = false;
                newItem.remove();
                renumberCaptures(list);
                showToast('保存失败，请重试', 'error');
            });
        }, 'image/jpeg', 0.95);
    }
}


function showToast(msg, type) {
    var existing = document.getElementById('capture-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'capture-toast';
    toast.className = 'capture-toast capture-toast-' + (type || 'info');
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i> ' + escapeHtml(msg);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
}


document.addEventListener('wheel', function (e) {
    const container = e.target.closest('.work-materials');
    if (container && e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
    }
}, { passive: false });


var _pickerCreateInput = document.getElementById('picker-create-input');
if (_pickerCreateInput) {
    _pickerCreateInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmPickerCreate(); });
}


function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


window.addEventListener('scroll', function () {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    btn.classList.toggle('visible', window.scrollY > 300);
});


var _resizeTimer = null;
window.addEventListener('resize', function () {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
        if (currentTab === 'materials') {
            var newCols = detectMaterialColumns();
            if (newCols !== pagination.materials.cols) {
                pagination.materials.page = 1;
                loadData();
            }
        }
    }, 250);
});


document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
document.getElementById('works-view').style.display = currentTab === 'works' ? '' : 'none';
document.getElementById('materials-view').style.display = currentTab === 'materials' ? '' : 'none';
document.getElementById('uploads-view').style.display = currentTab === 'uploads' ? '' : 'none';
document.getElementById('works-pagination').style.display = currentTab === 'works' ? '' : 'none';
document.getElementById('materials-pagination').style.display = currentTab === 'materials' ? '' : 'none';
var _initFilterBar = document.querySelector('.filter-bar');
if (_initFilterBar) _initFilterBar.style.display = currentTab === 'uploads' ? 'none' : '';

if (currentTab === 'uploads') {
    loadPersonalUploads();
} else {
    updatePageSizeSelector();
    loadDimensions().then(() => loadData());
}


document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('create-work-modal').style.display !== 'none') {
        closeCreateWorkModal();
        e.preventDefault();
    } else if (document.getElementById('picker-create-modal').style.display !== 'none') {
        closePickerCreateModal();
        e.preventDefault();
    } else if (document.getElementById('tag-picker-modal').style.display !== 'none') {
        closeTagPicker();
        e.preventDefault();
    } else if (document.getElementById('confirm-modal').style.display !== 'none') {
        closeConfirm();
        e.preventDefault();
    } else if (document.querySelector('.work-row.selected, .material-card.selected, .upload-card.selected')) {
        clearSelection();
        clearUploadSelection();
        e.preventDefault();
    }
});


document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && document.getElementById('tag-picker-modal').style.display !== 'none') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            confirmTagPicker();
        }
    }
});


document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && document.getElementById('confirm-modal').style.display !== 'none') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (confirmCallback) { confirmCallback(); confirmCallback = null; }
        closeConfirm();
    }
});


document.addEventListener('click', function (e) {
    var dd = document.getElementById('page-size-dropdown');
    if (dd && !dd.contains(e.target)) {
        var menu = document.getElementById('page-size-menu');
        if (menu) menu.style.display = 'none';
    }
    var cwm = document.getElementById('create-work-modal');
    if (cwm && e.target === cwm) closeCreateWorkModal();
});


var _createWorkInput = document.getElementById('create-work-title');
if (_createWorkInput) {
    _createWorkInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmCreateWork(); });
}


function loadPersonalUploads() {
    fetch('/api/personal-uploads').then(r => r.json()).then(data => {
        renderPersonalUploads(data.uploads || []);
    }).catch(function(err) {
        console.error('加载上传素材失败:', err);
        document.getElementById('uploads-grid').innerHTML = '<div class="empty">加载失败</div>';
    });
}


function renderPersonalUploads(uploads) {
    var container = document.getElementById('uploads-grid');
    if (uploads.length === 0) {
        container.innerHTML = '<div class="empty">暂无上传素材</div>';
        return;
    }
    var galleryList = [];
    var html = '<div class="uploads-grid-inner">';
    uploads.forEach(function(m) {
        html += '<div class="upload-card" data-id="' + m.id + '">';
        html += '<button class="row-delete-btn" onclick="event.stopPropagation();confirmDeleteUpload(' + m.id + ')"><i class="fas fa-times"></i></button>';
        if (m.type === 'image') {
            galleryList.push({ url: m.url, materialId: m.id });
            html += '<div class="upload-thumb"><img src="' + (m.thumb_url || m.url) + '" loading="lazy" onclick="handleUploadClick(event, this, \'' + m.url + '\', \'image\')"><span class="thumb-badge badge-image">图</span></div>';
        } else {
            html += '<div class="upload-thumb"><img src="' + (m.thumb_url || m.url) + '" loading="lazy" onclick="handleUploadClick(event, this, \'' + m.url + '\', \'video\')"><span class="video-icon">&#9658;</span><span class="thumb-badge badge-video">视</span></div>';
        }
        html += '<div class="upload-info"><span class="upload-filename" title="' + escapeHtml(m.original_filename) + '">' + escapeHtml(m.original_filename) + '</span></div>';
        html += '</div>';
    });
    html += '</div>';
    html += '<div class="batch-bar" id="uploads-batch-bar" style="display:none;"><span id="uploads-selected-count"></span><button class="btn btn-sm btn-primary" onclick="showCreateWorkModal()">创建作品</button><button class="btn btn-sm btn-danger" onclick="confirmBatchDeleteUploads()">删除</button><button class="btn btn-sm btn-secondary" onclick="clearUploadSelection()">取消选中</button></div>';
    container.innerHTML = html;
    viewer.setGallery(galleryList);
}


function handleUploadClick(e, imgEl, url, type) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
        var card = imgEl.closest('.upload-card');
        if (card) {
            card.classList.toggle('selected');
            updateUploadSelectionCount();
        }
    } else {
        if (type === 'image') {
            openImage(url);
        } else {
            openVideo(url, null);
        }
    }
}


function updateUploadSelectionCount() {
    var count = document.querySelectorAll('.upload-card.selected').length;
    var bar = document.getElementById('uploads-batch-bar');
    var el = document.getElementById('uploads-selected-count');
    if (bar) bar.style.display = count > 0 ? '' : 'none';
    if (el) el.textContent = count > 0 ? '已选 ' + count + ' 个' : '';
}


function getSelectedUploadIds() {
    return Array.from(document.querySelectorAll('.upload-card.selected')).map(c => parseInt(c.dataset.id));
}


function clearUploadSelection() {
    document.querySelectorAll('.upload-card.selected').forEach(card => card.classList.remove('selected'));
    updateUploadSelectionCount();
}


function handleFileSelect(e) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    uploadFiles(files);
    e.target.value = '';
}


function uploadFiles(files) {
    var formData = new FormData();
    var count = 0;
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            formData.append('files', file);
            count++;
        }
    }
    if (count === 0) {
        showToast('未找到支持的文件类型（仅支持图片和视频）', 'error');
        return;
    }
    var dropzone = document.getElementById('upload-dropzone');
    var progressEl = document.getElementById('upload-progress');
    var progressBar = document.getElementById('upload-progress-bar');
    var progressText = document.getElementById('upload-progress-text');

    if (dropzone) dropzone.classList.add('uploading');
    if (progressEl) progressEl.style.display = '';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/personal-uploads/upload');

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            var percent = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = percent + '%';
            if (progressText) progressText.textContent = percent + '%';
        }
    };

    xhr.upload.onload = function() {
        if (progressBar) progressBar.style.width = '100%';
        if (progressEl) progressEl.classList.add('processing');
        if (progressText) progressText.textContent = '处理中...';
    };

    xhr.onload = function() {
        if (dropzone) dropzone.classList.remove('uploading');
        if (progressEl) { progressEl.style.display = 'none'; progressEl.classList.remove('processing'); }
        if (progressBar) progressBar.style.width = '0%';
        try {
            var data = JSON.parse(xhr.responseText);
            if (data.error) {
                showToast(data.error, 'error');
            } else {
                showToast('上传成功: ' + data.uploads.length + ' 个文件', 'success');
                loadPersonalUploads();
            }
        } catch (e) {
            showToast('上传失败', 'error');
        }
    };

    xhr.onerror = function() {
        if (dropzone) dropzone.classList.remove('uploading');
        if (progressEl) { progressEl.style.display = 'none'; progressEl.classList.remove('processing'); }
        if (progressBar) progressBar.style.width = '0%';
        showToast('上传失败', 'error');
    };

    xhr.send(formData);
}


function initUploadDropzone() {
    var dropzone = document.getElementById('upload-dropzone');
    if (!dropzone || dropzone._init) return;
    dropzone._init = true;
    dropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', function(e) {
        this.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
        }
    });
}


function confirmDeleteUpload(id) {
    showConfirm('删除素材', '确定要删除这个上传素材吗？此操作不可恢复。', function () {
        fetch('/api/personal-uploads/' + id, { method: 'DELETE' }).then(r => r.json()).then(() => loadPersonalUploads());
    });
}


function confirmBatchDeleteUploads() {
    var ids = getSelectedUploadIds();
    if (ids.length === 0) { alert('请先选择素材'); return; }
    showConfirm('批量删除', '确定要删除选中的 ' + ids.length + ' 个素材吗？此操作不可恢复。', function () {
        fetch('/api/personal-uploads/batch/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ upload_ids: ids })
        }).then(r => r.json()).then(() => { clearUploadSelection(); loadPersonalUploads(); });
    });
}


function showCreateWorkModal() {
    var ids = getSelectedUploadIds();
    if (ids.length === 0) { alert('请先选择素材'); return; }
    document.getElementById('create-work-count').textContent = ids.length;
    document.getElementById('create-work-title').value = '';
    document.getElementById('create-work-modal').style.display = 'flex';
    document.getElementById('create-work-title').focus();
}


function closeCreateWorkModal() {
    document.getElementById('create-work-modal').style.display = 'none';
}


function confirmCreateWork() {
    var title = document.getElementById('create-work-title').value.trim();
    if (!title) { alert('请输入作品标题'); return; }
    var ids = getSelectedUploadIds();
    if (ids.length === 0) { alert('请先选择素材'); return; }
    fetch('/api/personal-uploads/create-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, upload_ids: ids })
    }).then(r => r.json()).then(data => {
        if (data.error) { alert(data.error); return; }
        closeCreateWorkModal();
        showToast('作品创建成功', 'success');
        loadPersonalUploads();
    });
}


initUploadDropzone();

