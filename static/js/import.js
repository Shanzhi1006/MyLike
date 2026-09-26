function startImport() {
    const text = document.getElementById('import-textarea').value.trim();
    if (!text) { alert('请输入分享文本'); return; }
    const lines = text.split('\n').map(s => s.trim()).filter(s => s);
    fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: lines })
    })
        .then(r => r.json())
        .then(data => {
            if (data.error) { alert(data.error); return; }
            document.getElementById('import-textarea').value = '';
            autoResizeTextarea(document.getElementById('import-textarea'));
            pollImportStatus(data.task_id);
        })
        .catch(e => alert('请求失败: ' + e));
}


function clearImport() {
    var ta = document.getElementById('import-textarea');
    ta.value = '';
    autoResizeTextarea(ta);
}


function autoResizeTextarea(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}


document.getElementById('import-textarea').addEventListener('input', function () {
    autoResizeTextarea(this);
});


function pollImportStatus(taskId) {
    const container = document.getElementById('import-tasks');
    let taskDiv = document.getElementById('task-' + taskId);
    if (!taskDiv) {
        taskDiv = document.createElement('div');
        taskDiv.id = 'task-' + taskId;
        taskDiv.className = 'import-task';
        container.prepend(taskDiv);
    }


    function update() {
        fetch('/api/import/status/' + taskId)
            .then(r => r.json())
            .then(task => {
                renderTask(taskDiv, task);
                if (task.status === 'running') {
                    setTimeout(update, 1000);
                }
            });
    }
    update();
}


function renderTask(container, task) {
    const statusLabels = {
        pending: '等待中', parsing: '解析中', downloading: '下载中',
        success: '成功', partial_success: '部分成功',
        failed: '失败', exists: '已存在'
    };
    const statusColors = {
        pending: '#999', parsing: '#2196f3', downloading: '#2196f3',
        success: '#4caf50', partial_success: '#ff9800',
        failed: '#f44336', exists: '#9e9e9e'
    };


    let html = '<div class="task-header"><span>导入任务 (' + task.completed + '/' + task.total + ')</span>';
    html += '<span class="task-status" style="color:' + (task.status === 'completed' ? '#4caf50' : '#2196f3') + '">' + (task.status === 'completed' ? '已完成' : '进行中') + '</span></div>';
    html += '<div class="task-items">';
    task.items.forEach(item => {
        const color = statusColors[item.status] || '#999';
        const label = statusLabels[item.status] || item.status;
        html += '<div class="task-item">';
        html += '<div class="task-item-text" title="' + escapeHtml(item.text) + '">' + escapeHtml(item.text.substring(0, 80)) + '</div>';
        html += '<div class="task-item-status" style="color:' + color + '">' + label;
        if (item.message) html += ' - ' + escapeHtml(item.message);
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}


function loadImportHistory() {
    fetch('/api/import/status')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('import-tasks');
            if (data.tasks && data.tasks.length > 0) {
                data.tasks.forEach(task => {
                    let taskDiv = document.getElementById('task-' + task.task_id);
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


loadImportHistory();

