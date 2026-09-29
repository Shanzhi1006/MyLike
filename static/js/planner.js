var pSortOrder = 'desc';
var pAllMaterials = [];


var pViewer = createImageViewer({
    overlayImgId: 'p-overlay-img',
    thumbImgPrefix: 'p-search-img-',
    navFn: 'pNavImage',
    rotateFn: 'pRotateImage',
    closeFn: 'pCloseImageOverlay',
    onRotate: function (materialId, newUrl, newThumbUrl) {
        pUpdateGridImageUrl(materialId, newUrl, newThumbUrl);
        var mat = pAllMaterials.find(function (m) { return m.id === materialId; });
        if (mat) {
            mat.url = newUrl;
            if (newThumbUrl) mat.thumb_url = newThumbUrl;
            if (mat.aspectRatio) mat.aspectRatio = 1 / mat.aspectRatio;
        }
    }
});


function pOpenImage(url) { pViewer.open(url); }
function pNavImage(direction) { pViewer.nav(direction); }
function pRotateImage(direction) { pViewer.rotate(direction); }
function pCloseImageOverlay() { pViewer.close(); }


var pFilterBar = createFilterBar({
    prefix: 'p-',
    fnPrefix: 'p',
    dimensionsContainerId: 'p-filter-dimensions',
    chipsBarId: 'p-filter-chips-bar',
    skipDimensions: ['类型', '平台'],
    onChange: pLoadMaterials,
    onStarToggle: function (tagId, starred) {
        pLoadDimensions().then(function () {
            var dims = pFilterBar.getDimensions();
            var authorDim = dims.find(function (d) { return d.name === '作者'; });
            if (authorDim) pFilterBar.toggleDropdown(authorDim.id);
        });
    }
});


function pToggleDropdown(dimId) { pCloseLayoutMenu(); pFilterBar.toggleDropdown(dimId); }
function pFilterDropdownSearch(dimId, query) { pFilterBar.filterDropdownSearch(dimId, query); }
function pToggleFilter(dimId, tagId) { pFilterBar.toggleFilter(dimId, tagId); }
function pRemoveFilter(dimId, tagId) { pFilterBar.removeFilter(dimId, tagId); }
function pToggleTagStar(tagId) { pFilterBar.toggleTagStar(tagId); }
function pClearFilters() { pFilterBar.clearFilters(); }


function pMakeDefaultTable(title) {
    return {
        title: title || '',
        remark: null,
        columns: 4,
        rows: [
            { height: null, cells: [null, null, null, null] }
        ]
    };
}


var plannerState = {
    tables: [pMakeDefaultTable('')]
};
var pCurrentLayoutId = null;
var pDragData = null;


function pMigrateState(oldState) {
    var result = migratePlannerState(oldState);
    if (!result.tables || result.tables.length === 0) {
        return { tables: [pMakeDefaultTable('')] };
    }
    return result;
}


function pToggleSortOrder() {
    pSortOrder = pSortOrder === 'desc' ? 'asc' : 'desc';
    var icon = document.getElementById('p-sort-order-icon');
    if (pSortOrder === 'desc') {
        icon.innerHTML = '<i class="fas fa-arrow-down-wide-short"></i>';
    } else {
        icon.innerHTML = '<i class="fas fa-arrow-up-wide-short"></i>';
    }
    pLoadMaterials();
}


function pLoadDimensions() {
    return fetch('/api/tag-dimensions').then(r => r.json()).then(data => {
        var dims = data.dimensions || [];
        sortDimensions(dims);
        pFilterBar.setDimensions(dims);
    }).catch(function (err) {
        console.error('加载维度失败:', err);
    });
}


function pLoadMaterials() {
    var params = [];
    var activeFilters = pFilterBar.getActiveFilters();
    if (Object.keys(activeFilters).length > 0) params.push('tag_filter=' + encodeURIComponent(JSON.stringify(activeFilters)));
    params.push('sort_order=' + pSortOrder);
    params.push('per_page=0');
    var qs = '?' + params.join('&');
    fetch('/api/materials' + qs).then(r => r.json()).then(function (data) {
        pRenderMaterials(data.materials || []);
    }).catch(function (err) {
        console.error('加载素材失败:', err);
        document.getElementById('planner-search-results').innerHTML = '<div class="empty">加载失败，请检查网络连接</div>';
    });
}


function pRenderMaterials(materials) {
    pAllMaterials = materials.filter(function (m) { return m.type === 'image'; });
    pViewer.setGallery(pAllMaterials.map(function (m) { return { url: m.url, materialId: m.id }; }));
    var container = document.getElementById('planner-search-results');
    if (pAllMaterials.length === 0) {
        container.innerHTML = '<div class="empty">暂无图片素材</div>';
        return;
    }
    var html = '<div class="planner-search-grid">';
    pAllMaterials.forEach(function (m) {
        html += '<div class="planner-search-item" data-material-id="' + m.id + '" draggable="true" ondragstart="pOnDragStartMaterial(event,' + m.id + ')" onclick="pOpenImage(\'' + m.url.replace(/'/g, "\\'") + '\')">';
        html += '<img src="' + (m.thumb_url || m.url) + '" loading="lazy" id="p-search-img-' + m.id + '" onerror="this.onerror=null;this.src=\'' + m.url + '\'">';
        html += '<span class="planner-used-badge"><i class="fas fa-check"></i></span>';
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;


    pAllMaterials.forEach(function (m) {
        var img = document.getElementById('p-search-img-' + m.id);
        if (img) {
            if (img.complete && img.naturalWidth > 0) {
                m.aspectRatio = img.naturalWidth / img.naturalHeight;
            } else {
                img.onload = function () {
                    m.aspectRatio = img.naturalWidth / img.naturalHeight;
                    pUpdateGridImageAspectRatio(m.id, m.aspectRatio);
                };
            }
        }
    });

    pUpdateUsedIndicators();
}


function pOnDragStartMaterial(event, materialId) {
    if (pIsMaterialUsed(materialId)) { event.preventDefault(); return; }
    var m = pAllMaterials.find(function (x) { return x.id === materialId; });
    if (!m) return;
    pDragData = { type: 'new', material: m };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', String(materialId));
    document.getElementById('planner-grid').classList.add('dragging');
}


function pOnDragStartGridImage(event, tableIndex, rowIndex, cellIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var row = table.rows[rowIndex];
    if (!row || !row.cells[cellIndex]) return;
    pDragData = { type: 'move', tableIndex: tableIndex, rowIndex: rowIndex, cellIndex: cellIndex };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tableIndex + ',' + rowIndex + ',' + cellIndex);
    document.getElementById('planner-grid').classList.add('dragging');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) zone.style.display = 'flex';
}


function pOnDragOverCell(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = pDragData && pDragData.type === 'move' ? 'move' : 'copy';
}


function pOnDragEnterCell(event, el) {
    event.preventDefault();
    el.classList.add('drag-over');
}


function pOnDragLeaveCell(event, el) {
    el.classList.remove('drag-over');
}


function pOnDropCell(event, tableIndex, rowIndex, cellIndex) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!pDragData) return;


    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var row = table.rows[rowIndex];
    if (!row) return;


    if (pDragData.type === 'new') {
        var m = pDragData.material;
        if (pIsMaterialUsed(m.id)) { pDragData = null; return; }
        row.cells[cellIndex] = {
            materialId: m.id,
            url: m.url,
            thumbUrl: m.thumb_url || null,
            mediumUrl: m.medium_url || null,
            aspectRatio: m.aspectRatio || null
        };
        if (!m.aspectRatio) {
            pFetchAspectRatio(m.thumb_url || m.url, function (ratio) {
                m.aspectRatio = ratio;
                row.cells[cellIndex].aspectRatio = ratio;
                pRenderGrid();
            });
        }
    } else if (pDragData.type === 'move') {
        var srcTable = plannerState.tables[pDragData.tableIndex];
        if (srcTable) {
            var srcRow = srcTable.rows[pDragData.rowIndex];
            if (srcRow) {
                var tmp = row.cells[cellIndex];
                row.cells[cellIndex] = srcRow.cells[pDragData.cellIndex];
                srcRow.cells[pDragData.cellIndex] = tmp;
                row.height = null;
                row.heightRatio = null;
                row.snapAspectRatio = null;
                srcRow.height = null;
                srcRow.heightRatio = null;
                srcRow.snapAspectRatio = null;
            }
        }
    }


    pDragData = null;
    var grid = document.getElementById('planner-grid');
    if (grid) grid.classList.remove('dragging');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
    pRenderGrid();
}


function pFetchAspectRatio(url, callback) {
    var img = new Image();
    img.onload = function () {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            callback(img.naturalWidth / img.naturalHeight);
        } else {
            callback(1);
        }
    };
    img.onerror = function () { callback(1); };
    img.src = url;
}


function pRemoveCellImage(tableIndex, rowIndex, cellIndex) {
    event.stopPropagation();
    var table = plannerState.tables[tableIndex];
    if (table && table.rows[rowIndex]) {
        table.rows[rowIndex].cells[cellIndex] = null;
        table.rows[rowIndex].height = null;
        table.rows[rowIndex].heightRatio = null;
        table.rows[rowIndex].snapAspectRatio = null;
    }
    pRenderGrid();
}


function pUpdateGridImageUrl(materialId, newUrl, newThumbUrl) {
    var needRender = false;
    plannerState.tables.forEach(function (table) {
        table.rows.forEach(function (row) {
            row.cells.forEach(function (cell) {
                if (cell && cell.materialId === materialId) {
                    cell.url = newUrl;
                    if (newThumbUrl) cell.thumbUrl = newThumbUrl;
                    if (cell.aspectRatio) cell.aspectRatio = 1 / cell.aspectRatio;
                    needRender = true;
                }
            });
        });
    });
    if (needRender) pRenderGrid();
}


function pUpdateGridImageAspectRatio(materialId, ratio) {
    var needRender = false;
    plannerState.tables.forEach(function (table) {
        table.rows.forEach(function (row) {
            row.cells.forEach(function (cell) {
                if (cell && cell.materialId === materialId && !cell.aspectRatio) {
                    cell.aspectRatio = ratio;
                    needRender = true;
                }
            });
        });
    });
    if (needRender) pRenderGrid();
}


function pGetCellWidth(tableIndex) {
    var tableEl = document.getElementById('planner-table-' + tableIndex);
    if (!tableEl || tableEl.clientWidth === 0) return 200;
    var table = plannerState.tables[tableIndex];
    var gap = 4;
    var gridPadding = 20;
    return (tableEl.clientWidth - gridPadding - (table.columns - 1) * gap) / table.columns;
}


function pGetRowHeight(tableIndex, row) {
    if (row.height !== null && row.height !== undefined) {
        if (row.heightRatio != null) {
            var cw = pGetCellWidth(tableIndex);
            if (cw > 0) return Math.max(50, Math.round(row.heightRatio * cw));
        }
        return row.height;
    }
    var cellWidth = pGetCellWidth(tableIndex);
    var borderTotal = 4;
    var contentWidth = cellWidth - borderTotal;
    if (row.snapAspectRatio != null && row.snapAspectRatio > 0) {
        return Math.max(50, Math.ceil(contentWidth / row.snapAspectRatio + borderTotal));
    }
    var images = row.cells.filter(function (c) { return c !== null; });
    if (images.length === 0) {
        return Math.round(contentWidth + borderTotal);
    }
    var maxHeight = 0;
    images.forEach(function (img) {
        if (img.aspectRatio && img.aspectRatio > 0) {
            var naturalHeight = contentWidth / img.aspectRatio;
            if (naturalHeight > maxHeight) maxHeight = naturalHeight;
        }
    });
    if (maxHeight === 0) maxHeight = contentWidth;
    return Math.ceil(maxHeight + borderTotal);
}


function pGetSnapHeights(tableIndex, row) {
    var cellWidth = pGetCellWidth(tableIndex);
    var borderTotal = 4;
    var contentWidth = cellWidth - borderTotal;
    var snaps = [];
    row.cells.forEach(function (cell) {
        if (cell && cell.aspectRatio && cell.aspectRatio > 0) {
            snaps.push({
                height: Math.ceil(contentWidth / cell.aspectRatio + borderTotal),
                aspectRatio: cell.aspectRatio
            });
        }
    });
    return snaps;
}


function pIsMaterialUsed(materialId) {
    for (var ti = 0; ti < plannerState.tables.length; ti++) {
        var table = plannerState.tables[ti];
        for (var i = 0; i < table.rows.length; i++) {
            for (var j = 0; j < table.rows[i].cells.length; j++) {
                var c = table.rows[i].cells[j];
                if (c && c.materialId === materialId) return true;
            }
        }
    }
    return false;
}


function pUpdateUsedIndicators() {
    document.querySelectorAll('.planner-search-item').forEach(function (el) {
        var mid = parseInt(el.dataset.materialId);
        el.classList.toggle('used', pIsMaterialUsed(mid));
    });
}


function pRenderGrid() {
    var container = document.getElementById('planner-grid');
    var html = '';


    plannerState.tables.forEach(function (table, tableIndex) {
        html += '<div class="planner-table-section" id="planner-table-' + tableIndex + '">';


        html += '<div class="planner-table-header">';
        html += '<input type="text" class="planner-table-title-input" value="' + escapeHtml(table.title) + '" placeholder="表格标题" oninput="pUpdateTableTitle(' + tableIndex + ', this.value)" onkeydown="pOnInputEnterSave(event)">';
        html += '<div class="planner-table-controls">';
        html += '<span style="font-size:13px;color:var(--text-muted);">列</span>';
        html += '<button class="btn btn-sm btn-secondary" onclick="pChangeColumns(' + tableIndex + ',-1)"><i class="fas fa-minus"></i></button>';
        html += '<span class="planner-cols-display">' + table.columns + '</span>';
        html += '<button class="btn btn-sm btn-secondary" onclick="pChangeColumns(' + tableIndex + ',1)"><i class="fas fa-plus"></i></button>';
        html += '<span style="width:10px;"></span>';
        html += '<span style="font-size:13px;color:var(--text-muted);">行</span>';
        html += '<button class="btn btn-sm btn-secondary" onclick="pChangeRows(' + tableIndex + ',-1)"><i class="fas fa-minus"></i></button>';
        html += '<span class="planner-cols-display">' + table.rows.length + '</span>';
        html += '<button class="btn btn-sm btn-secondary" onclick="pChangeRows(' + tableIndex + ',1)"><i class="fas fa-plus"></i></button>';
        html += '<span style="width:10px;"></span>';
        var _isFirst = tableIndex === 0;
        var _isLast = tableIndex === plannerState.tables.length - 1;
        html += '<button class="btn btn-sm planner-move-btn"' + (_isFirst ? ' disabled' : '') + ' onclick="pMoveTable(' + tableIndex + ',-1)" title="上移表格"><i class="fas fa-arrow-up"></i></button>';
        html += '<button class="btn btn-sm planner-move-btn"' + (_isLast ? ' disabled' : '') + ' onclick="pMoveTable(' + tableIndex + ',1)" title="下移表格"><i class="fas fa-arrow-down"></i></button>';
        if (table.remark == null) {
            html += '<button class="btn btn-sm planner-action-btn planner-add-remark-btn" onclick="pAddRemark(' + tableIndex + ')" title="添加备注"><i class="fas fa-comment-dots"></i></button>';
        }
        html += '<button class="btn btn-sm btn-danger planner-action-btn" onclick="pRemoveTable(' + tableIndex + ')" title="删除表格"><i class="fas fa-trash"></i></button>';
        html += '</div>';
        html += '</div>';


        if (table.remark != null) {
            html += '<div class="planner-table-remark-section">';
            html += '<textarea class="planner-table-remark-input" data-remark-ta="' + tableIndex + '" placeholder="备注（可选）" oninput="pUpdateTableRemark(' + tableIndex + ', this.value); pAutoResizeTextarea(this)">' + escapeHtml(table.remark) + '</textarea>';
            html += '<button class="planner-table-remark-remove" onclick="pRemoveRemark(' + tableIndex + ')" title="移除备注"><i class="fas fa-times"></i></button>';
            html += '</div>';
        }


        html += '<div class="planner-table-grid" style="--cols:' + table.columns + ';">';


        html += '<div class="planner-row-gap-top" onclick="pInsertRow(' + tableIndex + ',0)" title="在此插入行">';
        html += '<div class="planner-gap-btn"></div>';
        html += '</div>';


        table.rows.forEach(function (row, rowIndex) {
            var height = pGetRowHeight(tableIndex, row);
            html += '<div class="planner-row" style="height:' + height + 'px;" data-table="' + tableIndex + '" data-row="' + rowIndex + '">';


            row.cells.forEach(function (cell, cellIndex) {
                if (cell) {
                    html += '<div class="planner-cell has-image" ';
                    html += 'ondragover="pOnDragOverCell(event)" ';
                    html += 'ondragenter="pOnDragEnterCell(event, this)" ';
                    html += 'ondragleave="pOnDragLeaveCell(event, this)" ';
                    html += 'ondrop="pOnDropCell(event,' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')" ';
                    html += 'oncontextmenu="pOnCellContextMenu(event,' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')">';
                    html += '<img src="' + (cell.thumbUrl || cell.url) + '" draggable="true" ';
                    html += 'onerror="this.onerror=null;this.src=\'' + cell.url + '\'" ';
                    html += 'ondragstart="pOnDragStartGridImage(event,' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')" ';
                    html += 'onclick="pOpenGridImage(' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')">';
                    html += '<button class="planner-cell-remove" onclick="pRemoveCellImage(' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')">&times;</button>';
                    html += '</div>';
                } else {
                    html += '<div class="planner-cell" ';
                    html += 'ondragover="pOnDragOverCell(event)" ';
                    html += 'ondragenter="pOnDragEnterCell(event, this)" ';
                    html += 'ondragleave="pOnDragLeaveCell(event, this)" ';
                    html += 'ondrop="pOnDropCell(event,' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')" ';
                    html += 'oncontextmenu="pOnCellContextMenu(event,' + tableIndex + ',' + rowIndex + ',' + cellIndex + ')">';
                    html += '<i class="fas fa-image planner-cell-empty-icon"></i>';
                    html += '</div>';
                }
            });


            for (var ci = 0; ci <= table.columns; ci++) {
                html += '<div class="planner-col-insert-zone" style="--col-index:' + ci + ';" onclick="pInsertColumn(' + tableIndex + ',' + ci + ')" title="在此插入列"></div>';
            }


            html += '</div>';


            html += '<div class="planner-row-gap" data-table="' + tableIndex + '" data-row="' + rowIndex + '" onmousedown="pStartRowResize(event,' + tableIndex + ',' + rowIndex + ')" title="拖拽调整行高">';
            html += '<div class="planner-gap-btn" onclick="event.stopPropagation();pInsertRow(' + tableIndex + ',' + (rowIndex + 1) + ')" title="在此插入行"></div>';
            html += '</div>';
        });


        html += '</div>';
        html += '</div>';
    });


    container.innerHTML = html;


    plannerState.tables.forEach(function (table, tableIndex) {
        table.rows.forEach(function (row, rowIndex) {
            var height = pGetRowHeight(tableIndex, row);
            var rowEl = document.querySelector('.planner-row[data-table="' + tableIndex + '"][data-row="' + rowIndex + '"]');
            if (rowEl) rowEl.style.height = height + 'px';
        });
    });


    pUpdateUsedIndicators();


    document.querySelectorAll('.planner-table-remark-input').forEach(function (ta) {
        pAutoResizeTextarea(ta);
    });

    var _tm = document.getElementById('planner-table-menu');
    if (_tm && _tm.style.display !== 'none') pRenderTableMenu();
}


function pAutoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}


function pOpenGridImage(tableIndex, rowIndex, cellIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var cell = table.rows[rowIndex] && table.rows[rowIndex].cells[cellIndex];
    if (!cell) return;
    var galleryList = [];
    for (var ti = 0; ti < plannerState.tables.length; ti++) {
        var t = plannerState.tables[ti];
        for (var i = 0; i < t.rows.length; i++) {
            for (var j = 0; j < t.rows[i].cells.length; j++) {
                var c = t.rows[i].cells[j];
                if (c) galleryList.push({ url: c.url, materialId: c.materialId });
            }
        }
    }
    if (galleryList.length === 0) return;
    pViewer.setGallery(galleryList);
    var idx = galleryList.findIndex(function (item) {
        return item.materialId === cell.materialId;
    });
    if (idx < 0) idx = 0;
    pViewer.setGalleryIndex(idx);
    pViewer.showOverlay();
}


function pAddTable() {
    plannerState.tables.push(pMakeDefaultTable(''));
    pRenderGrid();
}


function pRemoveTable(tableIndex) {
    if (plannerState.tables.length <= 1) {
        plannerState.tables[0] = pMakeDefaultTable('');
    } else {
        plannerState.tables.splice(tableIndex, 1);
    }
    pRenderGrid();
}


function pMoveTable(tableIndex, delta) {
    var newIndex = tableIndex + delta;
    if (newIndex < 0 || newIndex >= plannerState.tables.length) return;

    var oldPositions = {};
    plannerState.tables.forEach(function (t, i) {
        var el = document.getElementById('planner-table-' + i);
        if (el) oldPositions[i] = el.getBoundingClientRect().top;
    });

    var tmp = plannerState.tables[tableIndex];
    plannerState.tables[tableIndex] = plannerState.tables[newIndex];
    plannerState.tables[newIndex] = tmp;

    pRenderGrid();

    var animatedEls = [];
    plannerState.tables.forEach(function (t, i) {
        var el = document.getElementById('planner-table-' + i);
        if (!el || oldPositions[i] === undefined) return;
        var newTop = el.getBoundingClientRect().top;
        var dy = oldPositions[i] - newTop;
        if (dy === 0) return;
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + dy + 'px)';
        animatedEls.push(el);
    });

    if (animatedEls.length > 0) {
        document.getElementById('planner-grid').offsetHeight;
        animatedEls.forEach(function (el) {
            el.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = '';
        });
        setTimeout(function () {
            animatedEls.forEach(function (el) {
                el.style.transition = '';
                el.style.transform = '';
            });
            var movedEl = document.getElementById('planner-table-' + newIndex);
            if (movedEl) {
                movedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                movedEl.classList.add('planner-table-highlight');
                setTimeout(function () {
                    movedEl.classList.remove('planner-table-highlight');
                }, 800);
            }
        }, 320);
    } else {
        var movedEl = document.getElementById('planner-table-' + newIndex);
        if (movedEl) movedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}


var _pDragTableIdx = null;


function pToggleTableMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('planner-table-menu');
    var isOpen = menu.style.display !== 'none';
    if (isOpen) {
        menu.style.display = 'none';
    } else {
        pRenderTableMenu();
        var wrapper = document.getElementById('planner-table-menu-wrapper');
        var previewBtn = document.querySelector('.planner-preview-btn');
        if (wrapper && previewBtn) {
            var wRect = wrapper.getBoundingClientRect();
            var pRect = previewBtn.getBoundingClientRect();
            var available = pRect.top - wRect.bottom - 8;
            menu.style.maxHeight = Math.max(120, available) + 'px';
        }
        menu.style.display = '';
    }
}


function pCloseTableMenu() {
    var menu = document.getElementById('planner-table-menu');
    if (menu) menu.style.display = 'none';
}


function pRenderTableMenu() {
    var container = document.getElementById('planner-table-menu');
    if (!container) return;
    if (plannerState.tables.length === 0) {
        container.innerHTML = '<div class="planner-table-menu-empty">暂无表格</div>';
        return;
    }
    var html = '';
    plannerState.tables.forEach(function (table, idx) {
        var title = table.title || ('\u8868\u683c ' + (idx + 1));
        html += '<div class="planner-table-menu-item"'
            + ' data-table-idx="' + idx + '"'
            + ' draggable="true"'
            + ' ondragstart="pOnTableDragStart(event,' + idx + ')"'
            + ' ondragend="pOnTableDragEnd(event)"'
            + ' onclick="pScrollToTable(' + idx + ')"'
            + '>';
        html += '<span class="planner-table-menu-item-title">' + escapeHtml(title) + '</span>';
        html += '<span class="planner-table-menu-item-handle">&#9776;</span>';
        html += '</div>';
    });
    container.innerHTML = html;
    pInitTableMenuDragDrop();
}


function pScrollToTable(idx) {
    pCloseTableMenu();
    var tableEl = document.getElementById('planner-table-' + idx);
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function pOnTableDragStart(e, idx) {
    _pDragTableIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) zone.style.display = 'flex';
}


function pOnTableDragEnd(e) {
    document.querySelectorAll('.planner-table-menu-item').forEach(function (el) {
        el.classList.remove('dragging', 'drag-over', 'drag-over-bottom');
    });
    _pDragTableIdx = null;
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
}


function _pClearTableDragOver() {
    document.querySelectorAll('.planner-table-menu-item').forEach(function (el) {
        el.classList.remove('drag-over', 'drag-over-bottom');
    });
}


function pInitTableMenuDragDrop() {
    var container = document.getElementById('planner-table-menu');
    if (!container || container._tableMenuDragInit) return;
    container._tableMenuDragInit = true;

    container.addEventListener('dragover', function (e) {
        if (_pDragTableIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        _pClearTableDragOver();
        var items = container.querySelectorAll('.planner-table-menu-item');
        if (items.length === 0) return;
        var target = e.target.closest('.planner-table-menu-item');
        if (target && parseInt(target.dataset.tableIdx) !== _pDragTableIdx) {
            var rect = target.getBoundingClientRect();
            var insertAfter = (e.clientY - rect.top) > rect.height / 2;
            target.classList.add(insertAfter ? 'drag-over-bottom' : 'drag-over');
        } else if (!target) {
            var firstItem = items[0];
            var lastItem = items[items.length - 1];
            var firstRect = firstItem.getBoundingClientRect();
            var lastRect = lastItem.getBoundingClientRect();
            if (e.clientY < firstRect.top + firstRect.height / 2 && parseInt(firstItem.dataset.tableIdx) !== _pDragTableIdx) {
                firstItem.classList.add('drag-over');
            } else if (e.clientY > lastRect.top + lastRect.height / 2 && parseInt(lastItem.dataset.tableIdx) !== _pDragTableIdx) {
                lastItem.classList.add('drag-over-bottom');
            }
        }
    });

    container.addEventListener('drop', function (e) {
        if (_pDragTableIdx === null) return;
        e.preventDefault();
        e.stopPropagation();
        _pClearTableDragOver();
        var fromIdx = _pDragTableIdx;
        var items = container.querySelectorAll('.planner-table-menu-item');
        if (items.length === 0) return;
        var target = e.target.closest('.planner-table-menu-item');
        var moved = plannerState.tables.splice(fromIdx, 1)[0];
        if (target && parseInt(target.dataset.tableIdx) !== fromIdx) {
            var targetIdx = parseInt(target.dataset.tableIdx);
            var reducedTargetIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
            var rect = target.getBoundingClientRect();
            var insertAfter = (e.clientY - rect.top) > rect.height / 2;
            var adjustedTo = insertAfter ? reducedTargetIdx + 1 : reducedTargetIdx;
            plannerState.tables.splice(adjustedTo, 0, moved);
        } else if (!target) {
            var firstItem = items[0];
            var lastItem = items[items.length - 1];
            var firstRect = firstItem.getBoundingClientRect();
            var lastRect = lastItem.getBoundingClientRect();
            if (e.clientY < firstRect.top + firstRect.height / 2) {
                if (parseInt(firstItem.dataset.tableIdx) === fromIdx) { plannerState.tables.splice(fromIdx, 0, moved); return; }
                plannerState.tables.unshift(moved);
            } else if (e.clientY > lastRect.top + lastRect.height / 2) {
                if (parseInt(lastItem.dataset.tableIdx) === fromIdx) { plannerState.tables.splice(fromIdx, 0, moved); return; }
                plannerState.tables.push(moved);
            } else {
                plannerState.tables.splice(fromIdx, 0, moved);
                return;
            }
        } else {
            plannerState.tables.splice(fromIdx, 0, moved);
            return;
        }
        _pDragTableIdx = null;
        pRenderGrid();
    });
}


function pUpdateTableTitle(tableIndex, value) {
    if (plannerState.tables[tableIndex]) {
        plannerState.tables[tableIndex].title = value;
    }
}


function pUpdateTableRemark(tableIndex, value) {
    if (plannerState.tables[tableIndex]) {
        plannerState.tables[tableIndex].remark = value;
    }
}


function pAddRemark(tableIndex) {
    if (plannerState.tables[tableIndex]) {
        plannerState.tables[tableIndex].remark = '';
        pRenderGrid();
        var ta = document.querySelector('.planner-table-remark-input[data-remark-ta="' + tableIndex + '"]');
        if (ta) ta.focus();
    }
}


function pRemoveRemark(tableIndex) {
    if (plannerState.tables[tableIndex]) {
        plannerState.tables[tableIndex].remark = null;
        pRenderGrid();
    }
}



function pAddRow(tableIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var cells = [];
    for (var i = 0; i < table.columns; i++) cells.push(null);
    table.rows.push({ height: null, cells: cells });
    pRenderGrid();
}


function pInsertRow(tableIndex, rowIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var cells = [];
    for (var i = 0; i < table.columns; i++) cells.push(null);
    table.rows.splice(rowIndex, 0, { height: null, cells: cells });
    pRenderGrid();
}


function pInsertColumn(tableIndex, colIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    table.rows.forEach(function (row) {
        row.cells.splice(colIndex, 0, null);
    });
    table.columns++;
    pRenderGrid();
}


function pChangeRows(tableIndex, delta) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    if (delta > 0) {
        for (var i = 0; i < delta; i++) pAddRow(tableIndex);
    } else if (delta < 0) {
        var removeCount = Math.abs(delta);
        for (var i = 0; i < removeCount; i++) {
            if (table.rows.length <= 1) break;
            table.rows.pop();
        }
        pRenderGrid();
    }
}


function pChangeColumns(tableIndex, delta) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var newCols = Math.max(1, table.columns + delta);
    if (newCols === table.columns) return;


    if (delta > 0) {
        table.rows.forEach(function (row) {
            for (var i = 0; i < delta; i++) row.cells.push(null);
        });
    } else {
        var removeCount = Math.abs(delta);
        table.rows.forEach(function (row) {
            for (var i = 0; i < removeCount; i++) {
                row.cells.pop();
            }
        });
    }


    table.columns = newCols;
    pRenderGrid();
}


function pDeleteRow(tableIndex, rowIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    if (table.rows.length <= 1) {
        var row = table.rows[rowIndex];
        if (!row) return;
        for (var i = 0; i < row.cells.length; i++) row.cells[i] = null;
        row.height = null;
        row.heightRatio = null;
        row.snapAspectRatio = null;
        pRenderGrid();
        return;
    }
    table.rows.splice(rowIndex, 1);
    table.rows.forEach(function (row, i) {
        row.height = null;
        row.heightRatio = null;
        row.snapAspectRatio = null;
    });
    pRenderGrid();
}


function pDeleteColumn(tableIndex, colIndex) {
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    if (table.columns <= 1) {
        table.rows.forEach(function (row) {
            if (row.cells[colIndex]) row.cells[colIndex] = null;
            row.height = null;
            row.heightRatio = null;
            row.snapAspectRatio = null;
        });
        pRenderGrid();
        return;
    }
    table.rows.forEach(function (row) {
        row.cells.splice(colIndex, 1);
        row.height = null;
        row.heightRatio = null;
        row.snapAspectRatio = null;
    });
    table.columns--;
    pRenderGrid();
}


function pOnCellContextMenu(event, tableIndex, rowIndex, cellIndex) {
    event.preventDefault();
    event.stopPropagation();


    var table = plannerState.tables[tableIndex];
    if (!table) return;


    var items = [];
    items.push({ label: '在此前插入行', icon: 'fa-arrow-up', action: function () { pInsertRow(tableIndex, rowIndex); } });
    items.push({ label: '在此后插入行', icon: 'fa-arrow-down', action: function () { pInsertRow(tableIndex, rowIndex + 1); } });
    items.push({ label: '删除此行', iconStack: { base: 'fa-trash', overlay: 'fa-left-right' }, danger: true, action: function () { pDeleteRow(tableIndex, rowIndex); } });
    items.push({ divider: true });
    items.push({ label: '在此前插入列', icon: 'fa-arrow-left', action: function () { pInsertColumn(tableIndex, cellIndex); } });
    items.push({ label: '在此后插入列', icon: 'fa-arrow-right', action: function () { pInsertColumn(tableIndex, cellIndex + 1); } });
    items.push({ label: '删除此列', iconStack: { base: 'fa-trash', overlay: 'fa-up-down' }, danger: true, action: function () { pDeleteColumn(tableIndex, cellIndex); } });


    pShowContextMenu(event.clientX, event.clientY, items);
}


function pShowContextMenu(x, y, items) {
    pCloseContextMenu();


    var menu = document.createElement('div');
    menu.className = 'planner-context-menu';
    menu.id = 'planner-context-menu';


    items.forEach(function (item) {
        if (item.divider) {
            var hr = document.createElement('hr');
            hr.className = 'planner-context-divider';
            menu.appendChild(hr);
            return;
        }
        var btn = document.createElement('button');
        btn.className = 'planner-context-item' + (item.danger ? ' danger' : '');
        if (item.iconStack) {
            var wrap = document.createElement('span');
            wrap.className = 'ctx-icon-stack';
            var baseIcon = document.createElement('i');
            baseIcon.className = 'fas ' + item.iconStack.base;
            wrap.appendChild(baseIcon);
            var ovIcon = document.createElement('i');
            ovIcon.className = 'fas ' + item.iconStack.overlay + ' ctx-icon-overlay' + (item.iconStack.overlayClass ? ' ' + item.iconStack.overlayClass : '');
            wrap.appendChild(ovIcon);
            btn.appendChild(wrap);
        } else {
            var icon = document.createElement('i');
            icon.className = 'fas ' + item.icon;
            btn.appendChild(icon);
        }
        var span = document.createElement('span');
        span.textContent = item.label;
        btn.appendChild(span);
        btn.onclick = function () {
            item.action();
            pCloseContextMenu();
        };
        menu.appendChild(btn);
    });


    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);


    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (y - rect.height) + 'px';
    }
}


function pCloseContextMenu() {
    var existing = document.getElementById('planner-context-menu');
    if (existing) existing.remove();
}


document.addEventListener('click', function (e) {
    if (!e.target.closest('.planner-context-menu')) {
        pCloseContextMenu();
    }
});
document.addEventListener('scroll', pCloseContextMenu, true);
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (document.getElementById('planner-confirm-modal').style.display !== 'none') {
            pCloseConfirm();
            return;
        }
        var _tm = document.getElementById('planner-table-menu');
        if (_tm && _tm.style.display !== 'none') {
            pCloseTableMenu();
            return;
        }
        pCloseContextMenu();
    }
});


document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && document.getElementById('planner-confirm-modal').style.display !== 'none') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (pConfirmCallback) { pConfirmCallback(); pConfirmCallback = null; }
        pCloseConfirm();
    }
});


function pStartRowResize(event, tableIndex, rowIndex) {
    if (event.target.closest('.planner-gap-btn')) return;
    event.preventDefault();
    var table = plannerState.tables[tableIndex];
    if (!table) return;
    var row = table.rows[rowIndex];
    if (!row) return;
    var startHeight = pGetRowHeight(tableIndex, row);
    var startY = event.clientY;
    var rowEl = document.querySelector('.planner-row[data-table="' + tableIndex + '"][data-row="' + rowIndex + '"]');
    var snapHeights = pGetSnapHeights(tableIndex, row);
    var snapThreshold = 10;
    var wasSnapped = false;
    var snappedAspectRatio = null;


    function onMove(e) {
        var dy = e.clientY - startY;
        var newHeight = Math.max(50, startHeight + dy);
        var snapped = false;
        snappedAspectRatio = null;


        for (var i = 0; i < snapHeights.length; i++) {
            if (Math.abs(newHeight - snapHeights[i].height) < snapThreshold) {
                newHeight = snapHeights[i].height;
                snapped = true;
                snappedAspectRatio = snapHeights[i].aspectRatio;
                break;
            }
        }


        wasSnapped = snapped;
        row.height = Math.round(newHeight);
        if (rowEl) {
            rowEl.style.height = row.height + 'px';
            if (snapped) {
                rowEl.classList.add('snapped');
            } else {
                rowEl.classList.remove('snapped');
            }
        }
    }


    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (rowEl) rowEl.classList.remove('snapped');
        if (wasSnapped) {
            row.height = null;
            row.heightRatio = null;
            row.snapAspectRatio = snappedAspectRatio;
        } else {
            row.snapAspectRatio = null;
            var cw = pGetCellWidth(tableIndex);
            row.heightRatio = cw > 0 ? row.height / cw : null;
        }
        pRenderGrid();
    }


    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}


function pLoadLayouts() {
    return fetch('/api/planner/layouts').then(r => r.json()).then(function (data) {
        var menu = document.getElementById('planner-layout-menu');
        var label = document.getElementById('planner-layout-label');
        var layouts = data.layouts || [];
        var html = '<label class="dd-radio' + (!pCurrentLayoutId ? ' active' : '') + '" onclick="pLoadSelectedLayout(0)">'
            + '<span>-- 新建策划 --</span>'
            + (!pCurrentLayoutId ? '<i class="fas fa-check dd-check-icon"></i>' : '')
            + '</label>';
        layouts.forEach(function (l) {
            var active = pCurrentLayoutId === l.id;
            html += '<label class="dd-radio' + (active ? ' active' : '') + '" onclick="pLoadSelectedLayout(' + l.id + ')">'
                + '<span>' + escapeHtml(l.name) + '</span>'
                + (active ? '<i class="fas fa-check dd-check-icon"></i>' : '')
                + '</label>';
        });
        menu.innerHTML = html;
        var current = layouts.find(function (l) { return l.id === pCurrentLayoutId; });
        label.textContent = current ? current.name : '-- 新建策划 --';
        document.getElementById('planner-delete-btn').style.display = pCurrentLayoutId ? '' : 'none';
    });
}


function pToggleLayoutDropdown(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('planner-layout-menu');
    var isOpen = menu.style.display !== 'none';
    pCloseAllDropdowns();
    if (!isOpen) menu.style.display = '';
}


function pCloseAllDropdowns() {
    var menu = document.getElementById('planner-layout-menu');
    if (menu) menu.style.display = 'none';
    if (typeof pFilterBar !== 'undefined' && pFilterBar) pFilterBar.closeAllDropdowns();
}


function pCloseLayoutMenu() {
    var menu = document.getElementById('planner-layout-menu');
    if (menu) menu.style.display = 'none';
}


function pLoadSelectedLayout(layoutId) {
    pCloseLayoutMenu();
    layoutId = parseInt(layoutId) || 0;
    if (!layoutId) {
        pNewLayout();
        pLoadLayouts();
        return;
    }
    fetch('/api/planner/layouts').then(r => r.json()).then(function (data) {
        var layout = (data.layouts || []).find(function (l) { return l.id === layoutId; });
        if (layout) {
            var config = layout.config;
            plannerState = pMigrateState(config);
            if (!plannerState.tables || plannerState.tables.length === 0) {
                plannerState = { tables: [pMakeDefaultTable('')] };
            }
            pCurrentLayoutId = layout.id;
            localStorage.setItem('plannerCurrentLayoutId', String(pCurrentLayoutId));
            document.getElementById('planner-delete-btn').style.display = '';
            document.getElementById('planner-layout-name').value = layout.name;
            pRenderGrid();
            pLoadLayouts();
        }
    });
}


function pNewLayout() {
    plannerState = { tables: [pMakeDefaultTable('')] };
    pCurrentLayoutId = null;
    localStorage.removeItem('plannerCurrentLayoutId');
    document.getElementById('planner-delete-btn').style.display = 'none';
    document.getElementById('planner-layout-name').value = '未命名策划';
    pRenderGrid();
}


function pEnrichAspectRatio(config) {
    config.tables.forEach(function (table) {
        table.rows.forEach(function (row) {
            row.cells.forEach(function (cell) {
                if (cell && !cell.aspectRatio) {
                    var mat = pAllMaterials.find(function (m) { return m.id === cell.materialId; });
                    if (mat && mat.aspectRatio) cell.aspectRatio = mat.aspectRatio;
                }
            });
        });
    });
    return config;
}


function pOpenPreview() {
    var config = JSON.parse(JSON.stringify(plannerState));
    config = pEnrichAspectRatio(config);
    localStorage.setItem('plannerPreview', JSON.stringify(config));
    window.open('/planner/preview', '_blank');
}


function pShowToast(msg, type) {
    var existing = document.getElementById('planner-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'planner-toast';
    toast.className = 'capture-toast capture-toast-' + (type || 'info');
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i> ' + escapeHtml(msg);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
}


function pConfirmSave() {
    var name = document.getElementById('planner-layout-name').value.trim();
    if (!name) { pShowToast('请输入策划名称', 'error'); return; }


    var config = JSON.parse(JSON.stringify(plannerState));
    config = pEnrichAspectRatio(config);


    if (pCurrentLayoutId) {
        fetch('/api/planner/layouts/' + pCurrentLayoutId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, config: config })
        }).then(r => r.json()).then(function () {
            localStorage.setItem('plannerCurrentLayoutId', String(pCurrentLayoutId));
            pLoadLayouts();
            pShowToast('保存成功', 'success');
        }).catch(function () {
            pShowToast('保存失败，请重试', 'error');
        });
    } else {
        fetch('/api/planner/layouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, config: config })
        }).then(r => r.json()).then(function (data) {
            if (data.error) { pShowToast(data.error, 'error'); return; }
            pCurrentLayoutId = data.id;
            localStorage.setItem('plannerCurrentLayoutId', String(pCurrentLayoutId));
            pLoadLayouts();
            pShowToast('保存成功', 'success');
        }).catch(function () {
            pShowToast('保存失败，请重试', 'error');
        });
    }
}


function pConfirmDeleteLayout() {
    if (!pCurrentLayoutId) return;
    pShowConfirm('删除策划', '确定要删除当前策划吗？', function () {
        fetch('/api/planner/layouts/' + pCurrentLayoutId, { method: 'DELETE' })
            .then(r => r.json())
            .then(function () { pNewLayout(); pLoadLayouts(); });
    });
}


var pConfirmCallback = null;


function pShowConfirm(title, message, callback) {
    pConfirmCallback = callback;
    showConfirmDialog('planner-confirm-modal', 'planner-confirm-title', 'planner-confirm-message', 'planner-confirm-yes', title, message, function () {
        if (pConfirmCallback) { pConfirmCallback(); pConfirmCallback = null; }
    });
}


function pCloseConfirm() {
    document.getElementById('planner-confirm-modal').style.display = 'none';
    pConfirmCallback = null;
}


function pOnInputEnterSave(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
        pConfirmSave();
    }
}


document.getElementById('planner-layout-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
        pConfirmSave();
    }
});


document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        pConfirmSave();
    }
});


var pResizeTimer = null;
window.addEventListener('resize', function () {
    if (pResizeTimer) clearTimeout(pResizeTimer);
    pResizeTimer = setTimeout(function () {
        pRenderGrid();
        var _tm = document.getElementById('planner-table-menu');
        if (_tm && _tm.style.display !== 'none') {
            var wrapper = document.getElementById('planner-table-menu-wrapper');
            var previewBtn = document.querySelector('.planner-preview-btn');
            if (wrapper && previewBtn) {
                var wRect = wrapper.getBoundingClientRect();
                var pRect = previewBtn.getBoundingClientRect();
                _tm.style.maxHeight = Math.max(120, pRect.top - wRect.bottom - 8) + 'px';
            }
        }
    }, 200);
});


document.addEventListener('dragend', function () {
    var grid = document.getElementById('planner-grid');
    if (grid) grid.classList.remove('dragging');
    var zone = document.getElementById('drag-delete-zone');
    if (zone) { zone.style.display = 'none'; zone.classList.remove('drag-over'); }
    if (_pDragTableIdx !== null) {
        document.querySelectorAll('.planner-table-menu-item').forEach(function (el) {
            el.classList.remove('dragging', 'drag-over', 'drag-over-bottom');
        });
        _pDragTableIdx = null;
    }
});


(function initPlannerDragDeleteZone() {
    var zone = document.getElementById('drag-delete-zone');
    if (!zone || zone._plannerDeleteInit) return;
    zone._plannerDeleteInit = true;
    zone.addEventListener('dragover', function (e) {
        if ((!pDragData || pDragData.type !== 'move') && _pDragTableIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function (e) {
        zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        if (_pDragTableIdx !== null) {
            var tableIdx = _pDragTableIdx;
            _pDragTableIdx = null;
            zone.style.display = 'none';
            pRemoveTable(tableIdx);
            return;
        }
        if (!pDragData || pDragData.type !== 'move') return;
        var table = plannerState.tables[pDragData.tableIndex];
        if (table && table.rows[pDragData.rowIndex]) {
            table.rows[pDragData.rowIndex].cells[pDragData.cellIndex] = null;
            table.rows[pDragData.rowIndex].height = null;
            table.rows[pDragData.rowIndex].heightRatio = null;
            table.rows[pDragData.rowIndex].snapAspectRatio = null;
        }
        pDragData = null;
        zone.style.display = 'none';
        pRenderGrid();
    });
})();


document.addEventListener('click', function (e) {
    var dd = document.getElementById('planner-layout-dropdown');
    if (dd && !dd.contains(e.target)) {
        pCloseLayoutMenu();
    }
    var tm = document.getElementById('planner-table-menu-wrapper');
    if (tm && !tm.contains(e.target)) {
        pCloseTableMenu();
    }
});


window.addEventListener('beforeunload', function () {
    if (!pCurrentLayoutId) return;
    var name = document.getElementById('planner-layout-name').value.trim();
    if (!name) return;
    var config = JSON.parse(JSON.stringify(plannerState));
    config = pEnrichAspectRatio(config);
    fetch('/api/planner/layouts/' + pCurrentLayoutId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, config: config }),
        keepalive: true
    });
});


pLoadDimensions().then(function () {
    pLoadMaterials();
});
pRenderGrid();
pLoadLayouts().then(function () {
    var savedId = localStorage.getItem('plannerCurrentLayoutId');
    if (savedId) {
        var id = parseInt(savedId);
        if (id) pLoadSelectedLayout(id);
    }
});

