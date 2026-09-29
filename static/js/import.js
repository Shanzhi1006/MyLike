var importItems = [];
var nextItemId = 1;

var blockList = document.getElementById('import-block-list');
var importInput = document.getElementById('import-input');
var emptyHint = document.getElementById('import-block-empty');


function addImportItem(text) {
    text = text.trim();
    if (!text) return;
    importItems.push({ id: nextItemId++, text: text, selected: false, expanded: false });
    renderImportItems();
}

function removeImportItem(id) {
    importItems = importItems.filter(function (item) { return item.id !== id; });
    renderImportItems();
}

function toggleSelectItem(id, multiSelect) {
    var item = importItems.find(function (i) { return i.id === id; });
    if (!item) return;
    if (multiSelect) {
        item.selected = !item.selected;
    } else {
        if (item.selected) {
            item.selected = false;
        } else {
            importItems.forEach(function (i) { i.selected = false; });
            item.selected = true;
        }
    }
    renderImportItems();
}

function deselectAllItems() {
    var changed = false;
    importItems.forEach(function (i) {
        if (i.selected) { i.selected = false; changed = true; }
    });
    if (changed) renderImportItems();
}

function selectAllItems() {
    var allSelected = importItems.length > 0 && importItems.every(function (i) { return i.selected; });
    importItems.forEach(function (i) { i.selected = !allSelected; });
    renderImportItems();
}

function deleteSelectedItems() {
    var count = importItems.filter(function (i) { return i.selected; }).length;
    if (count === 0) return;
    importItems = importItems.filter(function (i) { return !i.selected; });
    renderImportItems();
}

function copySelectedItems() {
    var selected = importItems.filter(function (i) { return i.selected; });
    if (selected.length === 0) return;
    var text = selected.map(function (i) { return i.text; }).join('\n');
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
            showToast('已复制 ' + selected.length + ' 条');
        });
    } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制 ' + selected.length + ' 条');
    }
}

function clearAllItems() {
    importItems = [];
    renderImportItems();
}

function toggleExpandItem(id) {
    var item = importItems.find(function (i) { return i.id === id; });
    if (!item) return;
    item.expanded = !item.expanded;
    renderImportItems();
}

function showToast(msg) {
    var toast = document.querySelector('.import-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'import-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 2000);
}

function renderImportItems() {
    var existingRows = blockList.querySelectorAll('.import-block-row');
    existingRows.forEach(function (r) { r.remove(); });

    if (importItems.length === 0) {
        emptyHint.style.display = '';
        blockList.classList.add('no-items');
    } else {
        emptyHint.style.display = 'none';
        blockList.classList.remove('no-items');
    }

    importItems.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'import-block-row';
        if (item.selected) row.classList.add('selected');
        if (item.expanded) row.classList.add('expanded');
        row.addEventListener('click', function (e) {
            toggleSelectItem(item.id, e.ctrlKey || e.metaKey);
        });

        var text = document.createElement('div');
        text.className = 'import-block-text';
        text.textContent = item.text;
        text.title = item.text;
        row.appendChild(text);

        var actions = document.createElement('div');
        actions.className = 'import-block-actions';

        var expandBtn = document.createElement('button');
        expandBtn.className = 'block-btn block-expand-btn';
        expandBtn.innerHTML = item.expanded ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i>';
        expandBtn.title = item.expanded ? '收起' : '展开';
        expandBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleExpandItem(item.id);
        });
        actions.appendChild(expandBtn);

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'block-btn block-delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeImportItem(item.id);
        });
        actions.appendChild(deleteBtn);

        row.appendChild(actions);
        blockList.insertBefore(row, emptyHint);

        if (!item.expanded && text.scrollWidth <= text.clientWidth) {
            expandBtn.style.display = 'none';
        }
    });

    updateActionButtons();
}

function updateActionButtons() {
    var count = importItems.length;
    var selectedCount = importItems.filter(function (i) { return i.selected; }).length;

    var importBtn = document.getElementById('import-btn');
    importBtn.textContent = count > 0 ? '开始导入 (' + count + ')' : '开始导入';

    var deleteBtn = document.getElementById('delete-selected-btn');
    deleteBtn.textContent = selectedCount > 0 ? '删除选中 (' + selectedCount + ')' : '删除选中';
    deleteBtn.style.display = selectedCount > 0 ? '' : 'none';

    var copyBtn = document.getElementById('copy-selected-btn');
    copyBtn.style.display = selectedCount > 0 ? '' : 'none';
}

function startImport() {
    var inputText = importInput.value.trim();
    if (inputText) {
        var lines = inputText.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        lines.forEach(function (line) { addImportItem(line); });
        importInput.value = '';
    }

    if (importItems.length === 0) {
        alert('请输入分享文本');
        return;
    }

    var lines = importItems.map(function (i) { return i.text; });
    fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: lines })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.error) { alert(data.error); return; }
            clearAllItems();
            pollImportStatus(data.task_id);
        })
        .catch(function (e) { alert('请求失败: ' + e); });
}


importInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        deselectAllItems();
        this.blur();
        return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var text = this.value.trim();
        if (text) {
            var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
            lines.forEach(function (line) { addImportItem(line); });
            this.value = '';
        }
    } else if (e.key === 'Backspace' && this.value === '' && importItems.length > 0) {
        e.preventDefault();
        var selected = importItems.filter(function (i) { return i.selected; });
        if (selected.length > 0) {
            importItems = importItems.filter(function (i) { return !i.selected; });
        } else {
            importItems.pop();
        }
        renderImportItems();
    }
});

importInput.addEventListener('paste', function (e) {
    var pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (pastedText && pastedText.includes('\n')) {
        e.preventDefault();
        var existingText = this.value.trim();
        if (existingText) {
            addImportItem(existingText);
        }
        var lines = pastedText.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        lines.forEach(function (line) { addImportItem(line); });
        this.value = '';
    }
});

blockList.addEventListener('click', function (e) {
    if (e.target === blockList || e.target === emptyHint || emptyHint.contains(e.target)) {
        deselectAllItems();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        deselectAllItems();
        return;
    }

    if (document.activeElement === importInput) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (importItems.length > 0) {
            e.preventDefault();
            selectAllItems();
        }
    }

    if (e.key === 'Delete' && importItems.some(function (i) { return i.selected; })) {
        e.preventDefault();
        deleteSelectedItems();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && importItems.some(function (i) { return i.selected; })) {
        e.preventDefault();
        copySelectedItems();
    }
});


function pollImportStatus(taskId) {
    var container = document.getElementById('import-tasks');
    var taskDiv = document.getElementById('task-' + taskId);
    if (!taskDiv) {
        taskDiv = document.createElement('div');
        taskDiv.id = 'task-' + taskId;
        taskDiv.className = 'import-task';
        container.prepend(taskDiv);
    }

    function update() {
        fetch('/api/import/status/' + taskId)
            .then(function (r) { return r.json(); })
            .then(function (task) {
                renderTask(taskDiv, task);
                if (task.status === 'running') {
                    setTimeout(update, 1000);
                }
            });
    }
    update();
}


function renderTask(container, task) {
    var statusLabels = {
        pending: '等待中', parsing: '解析中', downloading: '下载中',
        success: '成功', partial_success: '部分成功',
        failed: '失败', exists: '已存在', incremental: '增量导入'
    };
    var statusColors = {
        pending: '#999', parsing: '#2196f3', downloading: '#2196f3',
        success: '#4caf50', partial_success: '#ff9800',
        failed: '#f44336', exists: '#9e9e9e', incremental: '#2196f3'
    };

    var html = '<div class="task-header"><span>导入任务 (' + task.completed + '/' + task.total + ')</span>';
    html += '<span class="task-status" style="color:' + (task.status === 'completed' ? '#4caf50' : '#2196f3') + '">' + (task.status === 'completed' ? '已完成' : '进行中') + '</span></div>';
    html += '<div class="task-items">';
    task.items.forEach(function (item) {
        var color = statusColors[item.status] || '#999';
        var label = statusLabels[item.status] || item.status;
        html += '<div class="task-item">';
        html += '<div class="task-item-text" title="' + escapeHtml(item.full_text || item.text) + '">' + escapeHtml(item.full_text || item.text) + '</div>';
        html += '<button class="block-btn block-expand-btn" onclick="toggleTaskItemExpand(this)" title="展开/收起"><i class="fas fa-chevron-down"></i></button>';
        html += '<div class="task-item-right">';
        html += '<span class="task-item-status" style="color:' + color + '">' + label;
        if (item.message) html += ' - ' + escapeHtml(item.message);
        html += '</span>';
        if (item.status === 'failed') {
            html += '<button class="btn btn-retry" onclick="retryImport(\'' + task.task_id + '\', ' + item.index + ')">重试</button>';
        }
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.task-item').forEach(function (el) {
        var text = el.querySelector('.task-item-text');
        var btn = el.querySelector('.block-expand-btn');
        if (text.scrollWidth <= text.clientWidth) {
            btn.style.display = 'none';
        }
    });
}


function toggleTaskItemExpand(btn) {
    var item = btn.closest('.task-item');
    var text = item.querySelector('.task-item-text');
    if (item.classList.contains('expanded')) {
        item.classList.remove('expanded');
        btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        btn.title = '展开';
    } else {
        item.classList.add('expanded');
        btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btn.title = '收起';
    }
}


function retryImport(taskId, itemIndex) {
    fetch('/api/import/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, item_index: itemIndex })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.error) { alert(data.error); return; }
            pollImportStatus(taskId);
        })
        .catch(function (e) { alert('重试请求失败: ' + e); });
}


function loadImportHistory() {
    fetch('/api/import/status')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var container = document.getElementById('import-tasks');
            if (data.tasks && data.tasks.length > 0) {
                data.tasks.forEach(function (task) {
                    var taskDiv = document.getElementById('task-' + task.task_id);
                    if (!taskDiv) {
                        taskDiv = document.createElement('div');
                        taskDiv.id = 'task-' + task.task_id;
                        taskDiv.className = 'import-task';
                        container.appendChild(taskDiv);
                    }
                    renderTask(taskDiv, task);
                    if (task.status === 'running') {
                        pollImportStatus(task.task_id);
                    }
                });
            }
        });
}


renderImportItems();
loadImportHistory();
