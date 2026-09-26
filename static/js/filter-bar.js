function createFilterBar(opts) {
    opts = opts || {};
    var prefix = opts.prefix || '';
    var fnPrefix = opts.fnPrefix || '';
    var dimensionsContainerId = opts.dimensionsContainerId || 'filter-dimensions';
    var chipsBarId = opts.chipsBarId || 'filter-chips-bar';
    var skipDimensions = opts.skipDimensions || [];
    var onChange = opts.onChange || function () { };


    var dimensions = [];
    var activeFilters = {};
    var openDropdownId = null;


    function setDimensions(dims) {
        dimensions = dims;
        render();
    }


    function getDimensions() { return dimensions; }
    function getActiveFilters() { return activeFilters; }


    function clearFilters() {
        activeFilters = {};
        render();
        onChange();
    }


    function render() {
        var container = document.getElementById(dimensionsContainerId);
        container.innerHTML = '';
        dimensions.forEach(function (dim) {
            if (skipDimensions.indexOf(dim.name) >= 0) return;
            var selected = activeFilters[dim.id] || [];
            var count = selected.length;
            var wrapper = document.createElement('div');
            wrapper.className = 'filter-dropdown';
            wrapper.id = prefix + 'dd-' + dim.id;


            var html = '<button class="filter-dropdown-btn' + (count > 0 ? ' has-selection' : '') + '" onclick="' + fnPrefix + 'ToggleDropdown(' + dim.id + ')">';
            html += '<span class="dd-label">' + escapeHtml(dim.name) + '</span>';
            if (count > 0) html += '<span class="dd-count">' + count + '</span>';
            html += '<span class="dd-arrow">&#9662;</span>';
            html += '</button>';


            html += '<div class="filter-dropdown-menu" id="' + prefix + 'dd-menu-' + dim.id + '" style="display:none;">';
            if (dim.name === '作者' && (dim.tags || []).length > 10) {
                html += '<div class="dd-search-box">';
                html += '<input type="text" class="dd-search-input" placeholder="搜索作者..." oninput="' + fnPrefix + 'FilterDropdownSearch(' + dim.id + ', this.value)">';
                html += '</div>';
            }
            (dim.tags || []).forEach(function (tag) {
                var checked = selected.indexOf(tag.id) >= 0;
                html += '<label class="dd-checkbox' + (checked ? ' checked' : '') + '" data-tag-name="' + escapeHtml(tag.name.toLowerCase()) + '">';
                html += '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="' + fnPrefix + 'ToggleFilter(' + dim.id + ',' + tag.id + ')">';
                html += '<span>' + escapeHtml(tag.name) + '</span>';
                html += '</label>';
            });
            html += '</div>';


            wrapper.innerHTML = html;
            container.appendChild(wrapper);
        });
        renderFilterChips();
    }


    function toggleDropdown(dimId) {
        var menu = document.getElementById(prefix + 'dd-menu-' + dimId);
        if (!menu) return;
        var isOpen = menu.style.display !== 'none';
        closeAllDropdowns();
        if (!isOpen) {
            menu.style.display = '';
            openDropdownId = dimId;
        }
    }


    function closeAllDropdowns() {
        var container = document.getElementById(dimensionsContainerId);
        container.querySelectorAll('.filter-dropdown-menu').forEach(function (m) { m.style.display = 'none'; });
        openDropdownId = null;
    }


    function filterDropdownSearch(dimId, query) {
        var menu = document.getElementById(prefix + 'dd-menu-' + dimId);
        if (!menu) return;
        query = (query || '').trim().toLowerCase();
        menu.querySelectorAll('.dd-checkbox').forEach(function (label) {
            var name = label.dataset.tagName || '';
            label.style.display = (!query || name.indexOf(query) >= 0) ? '' : 'none';
        });
    }


    function toggleFilter(dimId, tagId) {
        if (!activeFilters[dimId]) activeFilters[dimId] = [];
        var idx = activeFilters[dimId].indexOf(tagId);
        if (idx >= 0) activeFilters[dimId].splice(idx, 1);
        else activeFilters[dimId].push(tagId);
        if (activeFilters[dimId].length === 0) delete activeFilters[dimId];
        render();
        var menu = document.getElementById(prefix + 'dd-menu-' + dimId);
        if (menu) { menu.style.display = ''; openDropdownId = dimId; }
        onChange();
    }


    function renderFilterChips() {
        var bar = document.getElementById(chipsBarId);
        var chips = [];
        for (var dimIdStr in activeFilters) {
            var dimId = parseInt(dimIdStr);
            var dim = dimensions.find(function (d) { return d.id === dimId; });
            if (!dim) continue;
            activeFilters[dimId].forEach(function (tagId) {
                var tag = (dim.tags || []).find(function (t) { return t.id === tagId; });
                if (tag) {
                    chips.push('<span class="filter-chip">' + escapeHtml(dim.name) + ': ' + escapeHtml(tag.name)
                        + '<button class="chip-remove" onclick="' + fnPrefix + 'RemoveFilter(' + dimId + ',' + tagId + ')">&times;</button></span>');
                }
            });
        }
        if (chips.length > 0) {
            bar.innerHTML = chips.join('');
            bar.style.display = '';
        } else {
            bar.style.display = 'none';
        }
    }


    function removeFilter(dimId, tagId) {
        if (activeFilters[dimId]) {
            var idx = activeFilters[dimId].indexOf(tagId);
            if (idx >= 0) activeFilters[dimId].splice(idx, 1);
            if (activeFilters[dimId].length === 0) delete activeFilters[dimId];
        }
        render();
        onChange();
    }


    document.addEventListener('click', function (e) {
        if (openDropdownId !== null) {
            var wrapper = document.getElementById(prefix + 'dd-' + openDropdownId);
            if (wrapper && !wrapper.contains(e.target)) {
                closeAllDropdowns();
            }
        }
    });


    return {
        setDimensions: setDimensions,
        getDimensions: getDimensions,
        getActiveFilters: getActiveFilters,
        clearFilters: clearFilters,
        render: render,
        toggleDropdown: toggleDropdown,
        closeAllDropdowns: closeAllDropdowns,
        filterDropdownSearch: filterDropdownSearch,
        toggleFilter: toggleFilter,
        removeFilter: removeFilter,
        renderFilterChips: renderFilterChips
    };
}

