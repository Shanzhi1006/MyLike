(function () {
    var raw = localStorage.getItem('plannerPreview');
    if (!raw) {
        document.getElementById('preview-content').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">无预览数据</div>';
        return;
    }
    var state = JSON.parse(raw);


    state = migratePlannerState(state);
    var content = document.getElementById('preview-content');


    var borderTotal = 4;
    var gap = 4;
    var gridPadding = 20;


    function getCellWidthFromDOM(sectionEl, columns) {
        if (!sectionEl || sectionEl.clientWidth === 0) return 200;
        return (sectionEl.clientWidth - gridPadding - (columns - 1) * gap) / columns;
    }


    function getRowHeight(row, cellWidth, activeCols) {
        if (row.height !== null && row.height !== undefined) {
            if (row.heightRatio != null && cellWidth > 0) {
                return Math.max(50, Math.round(row.heightRatio * cellWidth));
            }
            return row.height;
        }
        var contentWidth = cellWidth - borderTotal;
        if (row.snapAspectRatio != null && row.snapAspectRatio > 0) {
            return Math.max(50, Math.ceil(contentWidth / row.snapAspectRatio + borderTotal));
        }
        if (!activeCols || activeCols.length === 0) {
            return Math.round(contentWidth + borderTotal);
        }
        var maxHeight = 0;
        activeCols.forEach(function (colIndex) {
            var cell = row.cells[colIndex];
            if (cell && cell.aspectRatio && cell.aspectRatio > 0) {
                var h = contentWidth / cell.aspectRatio;
                if (h > maxHeight) maxHeight = h;
            }
        });
        if (maxHeight === 0) maxHeight = contentWidth;
        return Math.ceil(maxHeight + borderTotal);
    }


    function getActiveColumns(table) {
        var activeCols = [];
        for (var c = 0; c < table.columns; c++) {
            var hasImage = false;
            for (var r = 0; r < table.rows.length; r++) {
                if (table.rows[r].cells[c]) {
                    hasImage = true;
                    break;
                }
            }
            if (hasImage) activeCols.push(c);
        }
        return activeCols;
    }


    function renderTable(table, tableIndex) {
        var activeCols = getActiveColumns(table);
        if (activeCols.length === 0) return '';


        var hasAnyImage = table.rows.some(function (row) {
            return row.cells.some(function (c) { return c !== null; });
        });
        if (!hasAnyImage) return '';


        var html = '';
        html += '<div class="preview-table-section" data-table-index="' + tableIndex + '">';
        html += '<div class="preview-table-header">';
        html += '<span class="preview-table-title">' + escapeHtml(table.title || '未命名表格') + '</span>';
        html += '</div>';
        if (table.remark && table.remark.trim()) {
            html += '<div class="preview-table-remark">' + escapeHtml(table.remark.trim()) + '</div>';
        }
        html += '<div class="preview-table-grid">';


        table.rows.forEach(function (row, rowIndex) {
            var hasImages = activeCols.some(function (ci) {
                return row.cells[ci] !== null && row.cells[ci] !== undefined;
            });
            if (!hasImages) return;


            var cellWidth = 200;
            var height = getRowHeight(row, cellWidth, activeCols);
            html += '<div class="preview-row" data-row-index="' + rowIndex + '" style="height:' + height + 'px;">';


            activeCols.forEach(function (colIndex) {
                var cell = row.cells[colIndex];
                if (cell) {
                    html += '<div class="preview-cell has-image">';
                    html += '<img src="' + (cell.mediumUrl || cell.url) + '" data-original-src="' + cell.url + '" onerror="this.onerror=null;this.src=\'' + cell.url + '\'">';
                    html += '</div>';
                } else {
                    html += '<div class="preview-cell">';
                    html += '<i class="fas fa-image preview-cell-empty-icon"></i>';
                    html += '</div>';
                }
            });


            html += '</div>';
        });


        html += '</div></div>';
        return html;
    }


    var html = '';
    state.tables.forEach(function (table, tableIndex) {
        html += renderTable(table, tableIndex);
    });
    content.innerHTML = html;


    function recalcSection(sectionEl) {
        var tableIndex = parseInt(sectionEl.dataset.tableIndex);
        var table = state.tables[tableIndex];
        if (!table) return;


        var activeCols = getActiveColumns(table);
        if (activeCols.length === 0) return;


        var cellWidth = getCellWidthFromDOM(sectionEl, activeCols.length);


        var rowEls = sectionEl.querySelectorAll('.preview-row');
        var ri = 0;
        table.rows.forEach(function (row, rowIndex) {
            var hasImages = activeCols.some(function (ci) {
                return row.cells[ci] !== null && row.cells[ci] !== undefined;
            });
            if (!hasImages) return;


            var height = getRowHeight(row, cellWidth, activeCols);
            if (rowEls[ri]) rowEls[ri].style.height = height + 'px';
            ri++;
        });
    }


    document.querySelectorAll('.preview-table-section').forEach(function (sectionEl) {
        recalcSection(sectionEl);
    });


    document.querySelectorAll('.preview-cell img').forEach(function (img) {
        if (img.complete && img.naturalWidth > 0) {
            handleImgLoad(img);
        } else {
            img.addEventListener('load', function () { handleImgLoad(img); });
            img.addEventListener('error', function () { handleImgError(img); });
        }
    });


    function handleImgError(img) {
        var section = img.closest('.preview-table-section');
        if (!section) return;
        var tableIndex = parseInt(section.dataset.tableIndex);
        var table = state.tables[tableIndex];
        if (!table) return;


        var rowEl = img.closest('.preview-row');
        if (!rowEl) return;
        var rowIndex = parseInt(rowEl.dataset.rowIndex);
        var row = table.rows[rowIndex];
        if (!row) return;


        var activeCols = getActiveColumns(table);
        var rowImgs = rowEl.querySelectorAll('img');
        var imgIdx = 0;
        activeCols.forEach(function (colIndex) {
            var cell = row.cells[colIndex];
            if (cell) {
                if (rowImgs[imgIdx] === img && !cell.aspectRatio) {
                    cell.aspectRatio = 1;
                }
                imgIdx++;
            }
        });
        recalcSection(section);
    }


    function handleImgLoad(img) {
        var section = img.closest('.preview-table-section');
        if (!section) return;
        var tableIndex = parseInt(section.dataset.tableIndex);
        var table = state.tables[tableIndex];
        if (!table) return;


        var activeCols = getActiveColumns(table);


        var rowEl = img.closest('.preview-row');
        if (!rowEl) return;
        var rowIndex = parseInt(rowEl.dataset.rowIndex);
        var row = table.rows[rowIndex];
        if (!row) return;


        if (row.height === null || row.height === undefined) {
            var rowImgs = rowEl.querySelectorAll('img');
            var imgIdx = 0;
            activeCols.forEach(function (colIndex) {
                var cell = row.cells[colIndex];
                if (cell) {
                    if (!cell.aspectRatio && rowImgs[imgIdx] && rowImgs[imgIdx].naturalWidth > 0) {
                        cell.aspectRatio = rowImgs[imgIdx].naturalWidth / rowImgs[imgIdx].naturalHeight;
                    }
                    imgIdx++;
                }
            });
        }


        recalcSection(section);
    }


    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            document.querySelectorAll('.preview-table-section').forEach(function (sectionEl) {
                recalcSection(sectionEl);
            });
        }, 200);
    });


    setTimeout(function () {
        document.querySelectorAll('.preview-table-section').forEach(function (sectionEl) {
            recalcSection(sectionEl);
        });
        var toolbar = document.getElementById('preview-toolbar');
        if (toolbar && content.innerHTML.trim()) {
            toolbar.style.display = '';
        }
    }, 500);
})();


function _showExportOverlay(text) {
    document.getElementById('preview-export-text').textContent = text;
    document.getElementById('preview-export-overlay').classList.add('active');
}


function _hideExportOverlay() {
    document.getElementById('preview-export-overlay').classList.remove('active');
}


function _waitForImages() {
    var imgs = document.querySelectorAll('.preview-cell img');
    var pending = [];
    imgs.forEach(function (img) {
        if (!img.complete) {
            pending.push(new Promise(function (resolve) {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            }));
        }
    });
    return Promise.all(pending);
}


function _getCaptureScale() {
    var pageEl = document.querySelector('.preview-page');
    var pageHeight = pageEl ? pageEl.scrollHeight : 0;
    var maxCanvasHeight = 16000;
    var scale = 2;
    if (pageHeight * scale > maxCanvasHeight) {
        scale = Math.max(1, Math.floor(maxCanvasHeight / pageHeight * 10) / 10);
    }
    return scale;
}


function _swapToOriginalImages() {
    var imgs = document.querySelectorAll('.preview-cell img[data-original-src]');
    imgs.forEach(function (img) {
        img.dataset.previewSrc = img.src;
        img.src = img.dataset.originalSrc;
    });
}


function _restorePreviewImages() {
    var imgs = document.querySelectorAll('.preview-cell img[data-preview-src]');
    imgs.forEach(function (img) {
        img.src = img.dataset.previewSrc;
        delete img.dataset.previewSrc;
    });
}


function _capturePreview() {
    var toolbar = document.getElementById('preview-toolbar');
    toolbar.style.display = 'none';


    _swapToOriginalImages();

    var pageEl = document.querySelector('.preview-page');
    if (pageEl) pageEl.classList.add('exporting');

    return _waitForImages().then(function () {
        return new Promise(function (resolve) { setTimeout(resolve, 300); });
    }).then(function () {
        var scale = _getCaptureScale();
        return html2canvas(pageEl, {
            scale: scale,
            useCORS: true,
            backgroundColor: '#f0f0f0',
            logging: false
        });
    }).then(function (canvas) {
        if (pageEl) pageEl.classList.remove('exporting');
        _restorePreviewImages();
        toolbar.style.display = '';
        return canvas;
    }).catch(function (err) {
        if (pageEl) pageEl.classList.remove('exporting');
        _restorePreviewImages();
        toolbar.style.display = '';
        throw err;
    });
}


function previewExportPNG() {
    _showExportOverlay('正在生成长图...');
    setTimeout(function () {
        _capturePreview().then(function (canvas) {
            canvas.toBlob(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = '策划预览.png';
                a.click();
                URL.revokeObjectURL(url);
                _hideExportOverlay();
            }, 'image/png');
        }).catch(function (err) {
            _hideExportOverlay();
            alert('生成失败: ' + (err.message || err));
        });
    }, 100);
}


function previewExportPDF() {
    _showExportOverlay('正在生成PDF...');
    setTimeout(function () {
        _capturePreview().then(function (canvas) {
            var pdfWidth = 595.28;
            var pdfHeight = 841.89;
            var pageHeightPx = Math.floor(canvas.width * pdfHeight / pdfWidth);
            var offset = 0;
            var pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });


            while (offset < canvas.height) {
                var sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
                var tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = sliceHeight;
                tempCanvas.getContext('2d').drawImage(
                    canvas, 0, offset, canvas.width, sliceHeight,
                    0, 0, canvas.width, sliceHeight
                );
                var sliceData = tempCanvas.toDataURL('image/jpeg', 0.92);
                var sliceDisplayHeight = pdfWidth * sliceHeight / canvas.width;
                if (offset > 0) pdf.addPage();
                pdf.addImage(sliceData, 'JPEG', 0, 0, pdfWidth, sliceDisplayHeight);
                offset += sliceHeight;
            }


            pdf.save('策划预览.pdf');
            _hideExportOverlay();
        }).catch(function (err) {
            _hideExportOverlay();
            alert('生成失败: ' + (err.message || err));
        });
    }, 100);
}

