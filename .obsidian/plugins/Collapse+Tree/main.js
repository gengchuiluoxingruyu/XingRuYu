const { Plugin, PluginSettingTab, Setting, ItemView, Modal, TFile, TFolder } = require('obsidian');

var VIEW_TYPE_COLLAPSE_TREE = 'collapse-tree-view';

var DEFAULT_SETTINGS = {
    sortOrder: 'name', nodeSize: 8, levelGap: 100, siblingGap: 24, expandedPaths: [],
    lineStyle: 'straight', compactDensity: false, colorMode: 'rainbow',
    enableHoverPreview: false, layoutMode: 'linear'
};

// ═══ Plugin ═══

var CollapseTreePlugin = (function (_super) {
    function CollapseTreePlugin() { var t = _super !== null && _super.apply(this, arguments) || this; t._rebuildTimer = null; return t; }
    CollapseTreePlugin.prototype = Object.create(_super && _super.prototype);
    CollapseTreePlugin.prototype.constructor = CollapseTreePlugin;

    CollapseTreePlugin.prototype.onload = function () {
        var t = this;
        return t.loadSettings().then(function () {
            t.registerView(VIEW_TYPE_COLLAPSE_TREE, function (l) { return new CollapseTreeView(l, t); });
            t.addRibbonIcon('git-branch', 'Collapse Tree', function () { t.activateView(); });
            t.addCommand({ id: 'open-collapse-tree', name: 'Open Collapse Tree', callback: function () { t.activateView(); } });
            t.addSettingTab(new CollapseTreeSettingTab(t.app, t));
            t._boundRefresh = function () { t.refreshView(); };
            t.registerEvent(t.app.vault.on('create', t._boundRefresh));
            t.registerEvent(t.app.vault.on('delete', t._boundRefresh));
            t.registerEvent(t.app.vault.on('rename', t._boundRefresh));
        });
    };

    CollapseTreePlugin.prototype.onunload = function () {
        if (this._rebuildTimer) { clearTimeout(this._rebuildTimer); this._rebuildTimer = null; }
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_COLLAPSE_TREE);
    };

    CollapseTreePlugin.prototype.loadSettings = function () {
        var t = this;
        return t.loadData().then(function (d) { t.settings = Object.assign({}, DEFAULT_SETTINGS, d || {}); });
    };

    CollapseTreePlugin.prototype.saveSettings = function () {
        var t = this;
        return t.saveData(t.settings).then(function () { t.refreshView(); });
    };

    CollapseTreePlugin.prototype.activateView = function () {
        var w = this.app.workspace;
        var e = w.getLeavesOfType(VIEW_TYPE_COLLAPSE_TREE);
        if (e.length) { w.revealLeaf(e[0]); return; }
        var l = w.getRightLeaf(false);
        if (l) { l.setViewState({ type: VIEW_TYPE_COLLAPSE_TREE, active: true }); w.revealLeaf(l); }
    };

    CollapseTreePlugin.prototype.refreshView = function () {
        var t = this;
        if (t._rebuildTimer) clearTimeout(t._rebuildTimer);
        t._rebuildTimer = setTimeout(function () {
            var ls = t.app.workspace.getLeavesOfType(VIEW_TYPE_COLLAPSE_TREE);
            for (var i = 0; i < ls.length; i++) { var v = ls[i].view; if (v instanceof CollapseTreeView) v.rebuild(); }
        }, 300);
    };

    CollapseTreePlugin.prototype.isExcluded = function (n) {
        var p = ['.obsidian', '.trash', '.git', 'node_modules'];
        for (var i = 0; i < p.length; i++) { if (p[i] && n === p[i]) return true; }
        return false;
    };

    return CollapseTreePlugin;
})(Plugin);

// ═══ ItemView ═══

var CollapseTreeView = (function (_super) {
    function CollapseTreeView(leaf, plugin) {
        var t = _super.call(this, leaf) || this;
        t.plugin = plugin;
        t._treeRoot = null;
        t._expanded = new Set();
        t._canvas = null;
        t._ctx = null;
        t._tooltip = null;
        t._hovered = null;
        t._zoom = 1;
        t._searchQuery = '';
        t._searchInput = null;
        t._searchMatchIndex = -1;
        t._currentMatchPath = null;
        // 多选 + 拖拽
        t._selected = new Set();
        t._lastClickedPath = null;
        t._dragging = false;
        t._dragNodes = [];
        t._dragStartWX = 0;
        t._dragStartWY = 0;
        t._dragWorldX = 0;
        t._dragWorldY = 0;
        t._dropTarget = null;
        t._mouseDownNode = null;
        t._mouseDownWX = 0;
        t._mouseDownWY = 0;
        t._selInfoEl = null;
        t._panning = false;
        t._panStartX = 0;
        t._panStartY = 0;
        t._panScrollLeft = 0;
        t._panScrollTop = 0;
        // 工作区感知
        t._openFilePaths = new Set();
        t._wsRefs = [];
        // 搜索增强
        t._searchMode = 'normal'; // 'normal'|'regex'|'ext'|'fm'|'fulltext'
        t._searchHistory = [];
        t._maxSearchHistory = 10;
        t._searchMatchCount = 0;
        t._searchModeBtns = {};
        t._searchCountEl = null;
        t._searchHistEl = null;
        // 悬停预览
        t._hoverPreviewNode = null;
        t._hoverPreviewTimer = null;
        t._hoverLeaf = null;
        t._hoverPrevPos = null;
        // 小地图
        t._minimapVisible = true;
        t._minimapCanvas = null;
        t._minimapSize = 160;
        // 剪切板
        t._clipboardPaths = [];
        // 热力图
        t._heatMinMtime = 0;
        t._heatMaxMtime = 0;
        // Focus Mode
        t._focusMode = false;
        t._focusPath = null;
        t._savedExpanded = null;
        // 性能缓存
        t._cachedTextColor = '';
        t._cachedTextFaint = '';
        return t;
    }

    CollapseTreeView.prototype = Object.create(_super && _super.prototype);
    CollapseTreeView.prototype.constructor = CollapseTreeView;
    CollapseTreeView.prototype.getViewType = function () { return VIEW_TYPE_COLLAPSE_TREE; };
    CollapseTreeView.prototype.getDisplayText = function () { return 'Collapse Tree'; };
    CollapseTreeView.prototype.getIcon = function () { return 'git-branch'; };

    CollapseTreeView.prototype.onOpen = function () {
        var t = this;
        var c = t.containerEl; c.empty();
        c.addClass('collapse-tree-graph-container');
        c.setAttr('tabindex', '0'); // 接收键盘事件

        // ── 工作区感知 ──
        t._trackOpenFiles = function () {
            t._openFilePaths.clear();
            t.app.workspace.iterateAllLeaves(function (leaf) {
                var lv = leaf.view; if (lv && lv.file) t._openFilePaths.add(lv.file.path);
            });
            // ★ Focus Mode: 活跃文件变化时自动重新聚焦
            if (t._focusMode) {
                var af = t.app.workspace.activeLeaf && t.app.workspace.activeLeaf.view && t.app.workspace.activeLeaf.view.file;
                if (af && af.path !== t._focusPath) {
                    t._applyFocus(af.path);
                    return; // _applyFocus 里会 rebuild
                }
            }
            t._redraw();
        };
        t._wsRefs.push(t.app.workspace.on('active-leaf-change', t._trackOpenFiles));
        t._wsRefs.push(t.app.workspace.on('layout-change', function () {
            clearTimeout(t._layoutTimer); t._layoutTimer = setTimeout(t._trackOpenFiles, 150);
        }));
        t._trackOpenFiles();

        // ── 浮动工具栏 ──
        var ftb = c.createDiv('ct-floating-toolbar');
        ftb.innerHTML = '<button class="ct-tool-btn" data-action="toggle-settings" title="设置"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>';
        ftb.addEventListener('click', function (e) {
            var btn = e.target.closest('button');
            if (btn && btn.dataset.action === 'toggle-settings') t.toggleSettingsPanel();
        });

        // 弹出面板按钮
        var popBtn = ftb.createEl('button', { cls: 'ct-tool-btn', attr: { title: '弹出设置面板', id: 'ct-popout-btn' } });
        popBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        popBtn.addEventListener('click', function () { t._popOutSettings(); });
        t._popOutBtn = popBtn;

        // ★ 性能：缓存主题 CSS 变量 / 主题切换时刷新
        t._refreshStyleCache = function () {
            var style = getComputedStyle(document.body);
            t._cachedTextColor = style.getPropertyValue('--text-normal') || '#ddd';
            t._cachedTextFaint = style.getPropertyValue('--text-faint') || '#888';
        };
        t._refreshStyleCache();
        t._styleObserver = new MutationObserver(function () { t._refreshStyleCache(); });
        t._styleObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // ── 设置面板（折叠分区）──
        var panel = c.createDiv('ct-settings-panel');
        panel.style.display = 'none';
        t._settingsPanel = panel;
        t._settingsVisible = false;

        // 隐藏的共享元素（_updateSelInfo/_updateSearchCount 等会引用）
        t._selInfoEl = panel.createEl('span', { text: '' });
        t._selInfoEl.style.cssText = 'display:none;';
        var deselBtn = panel.createEl('button', { text: '清除选择' });
        deselBtn.style.cssText = 'display:none;';
        deselBtn.addEventListener('click', function () { t._clearSelection(); t._updateSelInfo(); t._redraw(); });
        t._deselBtn = deselBtn;
        var batDelBtn = panel.createEl('button', { text: '批量删除' });
        batDelBtn.style.cssText = 'display:none;';
        batDelBtn.addEventListener('click', function () { t._batchDelete(); });
        t._batDelBtn = batDelBtn;

        t._searchCountEl = panel.createEl('span', { text: '' });
        t._searchCountEl.style.cssText = 'display:none;font-size:11px;color:var(--text-muted);margin-left:6px;';

        t._searchInput = panel.createEl('input', { type: 'text', placeholder: '搜索...' });
        t._searchInput.style.cssText = 'padding:4px 8px;font-size:12px;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal);width:100%;box-sizing:border-box;';

        var modeNames = { normal: '普通', regex: '正则', ext: '扩展名', fm: 'FM', fulltext: '全文' };
        var modeContainer = panel.createEl('span');
        modeContainer.style.cssText = 'display:flex;gap:2px;';
        Object.keys(modeNames).forEach(function (k) {
            var btn = modeContainer.createEl('button', { text: modeNames[k] });
            btn.style.cssText = 'padding:2px 6px;font-size:11px;min-width:28px;border-radius:3px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);cursor:pointer;';
            if (k === t._searchMode) { btn.style.background = 'var(--interactive-accent)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--interactive-accent)'; }
            btn.addEventListener('click', function () {
                t._searchMode = k; t._searchMatchIndex = -1; t._currentMatchPath = null;
                t._fulltextMatches = null; t._fulltextCacheKey = null;
                Object.keys(t._searchModeBtns).forEach(function (mk) {
                    var b = t._searchModeBtns[mk];
                    b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
                });
                btn.style.background = 'var(--interactive-accent)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--interactive-accent)';
                t._searchInput.placeholder = k === 'regex' ? '正则 /pattern/i...' : k === 'ext' ? '扩展名 md,canvas...' : k === 'fm' ? 'frontmatter 关键词...' : k === 'fulltext' ? '全文搜索...' : '搜索...';
                t._searchInput.value = ''; t._searchQuery = ''; t._updateSearchCount(); t.render();
            });
            t._searchModeBtns[k] = btn;
        });

        // 搜索历史弹层（面板内绝对定位）
        t._searchHistEl = panel.createDiv('ct-search-hist');
        t._searchHistEl.style.cssText = 'display:none;position:absolute;z-index:210;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;max-height:160px;overflow-y:auto;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        t._searchInput.addEventListener('focus', function () { t._showSearchHistory(); });
        t._searchInput.addEventListener('blur', function () { setTimeout(function () { t._searchHistEl.style.display = 'none'; }, 200); });
        t._searchInput.addEventListener('input', function () {
            t._searchQuery = t._searchInput.value.trim();
            t._searchMatchIndex = -1; t._currentMatchPath = null;
            if (t._searchMode === 'fulltext') {
                t._updateSearchCount(); t.render(); // 先清屏
                t._runFulltextSearch();
            } else {
                t._fulltextMatches = null; t._fulltextCacheKey = null;
                t._updateSearchCount(); t.render();
            }
        });
        t._searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { t._searchInput.value = ''; t._searchQuery = ''; t._searchMatchIndex = -1; t._currentMatchPath = null; t._selected.clear(); t._fulltextMatches = null; t._fulltextCacheKey = null; t._updateSelInfo(); t._updateSearchCount(); t.render(); }
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) t._navigateSearchPrev(); else t._navigateSearch(); }
        });

        // ── 构建面板 HTML ──
        t._buildSettingsPanelHTML = function () {
            var s = t.plugin.settings;
            var sec = function (title, id, body) {
                return '<div class="ct-section"><div class="ct-section-header" data-section="' + id + '"><span class="ct-section-arrow ct-open">▼</span><span>' + title + '</span></div><div class="ct-section-body">' + body + '</div></div>';
            };
            var row = function (label, content) {
                return '<div class="ct-row"><span class="ct-row-label">' + label + '</span>' + content + '</div>';
            };
            var actBtn = function (label, action, iconSvg) {
                return '<button class="ct-act-btn" data-act="' + action + '">' + (iconSvg || '') + label + '</button>';
            };
            // Lucide 图标定义
            var ico = {
                expand: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M12 3v18"/><path d="m5 9 7-7 7 7"/><path d="m5 15 7 7 7-7"/></svg>',
                collapse: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M12 3v18"/><path d="m19 9-7 7-7-7"/><path d="m19 15-7-7-7 7"/></svg>',
                refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
                undo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>',
                trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
                x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
                chevronL: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polyline points="15 18 9 12 15 6"/></svg>',
                chevronR: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polyline points="9 18 15 12 9 6"/></svg>',
                crosshair: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line></svg>',
                target: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
                arrowUp: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><polyline points="18 15 12 9 6 15"/></svg>',
                arrowDown: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><polyline points="6 9 12 15 18 9"/></svg>',
                externalLink: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
            };
            return ''
                + sec('搜索', 'search', ''
                    + '<div style="display:flex;gap:3px;align-items:center;margin-bottom:4px;">'
                    + '<button class="ct-act-btn ct-nav-btn" id="ct-search-prev" title="上一个 (Shift+Enter)" style="flex:0 0 24px;padding:2px 0;font-size:12px;">' + ico.chevronL + '</button>'
                    + '<button class="ct-act-btn ct-nav-btn" id="ct-search-next" title="下一个 (Enter)" style="flex:0 0 24px;padding:2px 0;font-size:12px;">' + ico.chevronR + '</button>'
                    + '<span id="ct-search-count-inline" style="display:none;font-size:11px;color:var(--text-muted);margin-left:4px;"></span>'
                    + '</div>'
                )
                + sec('操作', 'actions', ''
                    + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
                    + actBtn('全部展开', 'expandAll', ico.expand)
                    + actBtn('全部折叠', 'collapseAll', ico.collapse)
                    + actBtn('刷新', 'rebuild', ico.refresh)
                    + '<button class="ct-act-btn" id="ct-undo-btn" style="display:none;color:#ffeb3b;border-color:#ffeb3b;">' + ico.undo + '撤销移动</button>'
                    + '</div>'
                    + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">'
                    + '<button class="ct-act-btn ct-focus-panel-btn" id="ct-focus-panel-btn" data-act="toggleFocus">' + ico.crosshair + 'Focus Mode</button>'
                    + '<button class="ct-act-btn ct-radial-panel-btn" id="ct-radial-panel-btn" data-act="toggleRadial">' + ico.target + '旭日图</button>'
                    + '</div>'
                    + '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;">'
                    + '<button class="ct-act-btn" id="ct-sib-prev" data-act="sibPrev" title="上一个平行节点">' + ico.arrowUp + '上一个</button>'
                    + '<button class="ct-act-btn" id="ct-sib-next" data-act="sibNext" title="下一个平行节点">' + ico.arrowDown + '下一个</button>'
                    + '<button class="ct-act-btn" id="ct-sib-open" data-act="sibOpen" title="打开当前节点" style="background:var(--interactive-accent);color:#fff;border-color:var(--interactive-accent);">' + ico.externalLink + '打开</button>'
                    + '<span id="ct-sib-label" style="font-size:11px;color:var(--text-muted);margin-left:4px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
                    + '</div>'
                )
                + sec('选择', 'selection', ''
                    + '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">'
                    + '<span id="ct-sel-info-inline" style="display:none;font-size:12px;color:var(--text-accent);"></span>'
                    + '<button class="ct-act-btn ct-danger" id="ct-batch-del" style="display:none;">' + ico.trash + '批量删除</button>'
                    + '<button class="ct-act-btn" id="ct-clear-sel" style="display:none;">' + ico.x + '清除选择</button>'
                    + '</div>'
                )
                + sec('视图', 'view', ''
                    + row('排序', '<select class="ct-select" data-key="sortOrder"><option value="name"' + (s.sortOrder==='name'?' selected':'') + '>名称</option><option value="mtime"' + (s.sortOrder==='mtime'?' selected':'') + '>修改时间</option></select>')
                    + row('节点大小', '<input type="range" class="ct-slider" data-key="nodeSize" min="4" max="16" step="1" value="' + s.nodeSize + '"><span class="ct-slider-val">' + s.nodeSize + '</span>')
                    + row('层级间距', '<input type="range" class="ct-slider" data-key="levelGap" min="60" max="200" step="10" value="' + s.levelGap + '"><span class="ct-slider-val">' + s.levelGap + '</span>')
                    + row('兄弟间距', '<input type="range" class="ct-slider" data-key="siblingGap" min="12" max="40" step="2" value="' + s.siblingGap + '"><span class="ct-slider-val">' + s.siblingGap + '</span>')
                    + row('紧凑密度', '<label class="ct-toggle-label"><input type="checkbox" class="ct-toggle" data-key="compactDensity"' + (s.compactDensity?' checked':'') + '><span class="ct-toggle-slider"></span></label>')
                    + row('连线样式', '<select class="ct-select" data-key="lineStyle"><option value="straight"' + (s.lineStyle==='straight'?' selected':'') + '>直线</option><option value="curved"' + (s.lineStyle==='curved'?' selected':'') + '>曲线</option><option value="dashed"' + (s.lineStyle==='dashed'?' selected':'') + '>虚线</option><option value="dotted"' + (s.lineStyle==='dotted'?' selected':'') + '>点线</option></select>')
                    + row('色彩模式', '<select class="ct-select" data-key="colorMode"><option value="rainbow"' + (s.colorMode==='rainbow'?' selected':'') + '>彩虹</option><option value="heatmap"' + (s.colorMode==='heatmap'?' selected':'') + '>热力图</option></select>')
                    + row('布局模式', '<select class="ct-select" data-key="layoutMode"><option value="linear"' + (s.layoutMode==='linear'?' selected':'') + '>线性树</option><option value="radial"' + (s.layoutMode==='radial'?' selected':'') + '>旭日图</option></select>')
                    + row('悬停预览', '<label class="ct-toggle-label"><input type="checkbox" class="ct-toggle" data-key="enableHoverPreview"' + (s.enableHoverPreview?' checked':'') + '><span class="ct-toggle-slider"></span></label>')
                    + row('小地图', '<label class="ct-toggle-label"><input type="checkbox" class="ct-toggle ct-minimap-toggle"' + (s.enableMinimap !== false ? ' checked' : '') + '><span class="ct-toggle-slider"></span></label>')
                )
                + sec('小地图', 'minimap', ''
                    + '<canvas id="ct-minimap-canvas" style="width:100%;height:160px;border-radius:4px;background:transparent;cursor:pointer;display:block;"></canvas>'
                    + '<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">点击跳转 · 拖动视口框导航</div>'
                )
        };

        t.renderSettingsPanel = function () {
            // 保留共享元素
            var keepIds = ['ct-search-input-anchor','ct-search-mode-anchor','ct-search-count-anchor','ct-sel-anchor','ct-act-anchor'];
            // ★ 简化：每次直接重建面板 body
            var body = panel.querySelector('.ct-panel-body');
            if (!body) {
                var header = panel.createDiv('ct-panel-header');
                header.innerHTML = '<span style="font-weight:600;font-size:13px;">目录树设置</span>';
                body = panel.createDiv('ct-panel-body');
            }
            // 保存当前内部元素引用
            var searchInputEl = t._searchInput;
            var modeContainerEl = searchInputEl.parentNode ? searchInputEl.parentNode.parentNode : null;
            var searchCountEl = t._searchCountEl;
            var selInfoEl = t._selInfoEl;
            var deselBtn2 = t._deselBtn;
            var batDelBtn2 = t._batDelBtn;

            body.innerHTML = t._buildSettingsPanelHTML();

            // 插入搜索输入框
            var searchSec = body.querySelector('[data-section="search"] + .ct-section-body');
            if (searchSec) {
                var sr = searchSec.querySelector('div');
                if (sr) {
                    var sw = document.createElement('div');
                    sw.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:6px;';
                    sw.appendChild(searchInputEl);
                    sw.appendChild(searchCountEl);
                    sr.parentNode.insertBefore(sw, sr);
                }
                var mm = document.createElement('div');
                mm.style.cssText = 'display:flex;gap:2px;';
                Object.keys(t._searchModeBtns).forEach(function (k) {
                    mm.appendChild(t._searchModeBtns[k]);
                });
                searchSec.appendChild(mm);
            }

            // 插入选择状态元素
            var selSec = body.querySelector('[data-section="selection"] + .ct-section-body');
            if (selSec) {
                var sd = selSec.querySelector('div');
                if (sd) {
                    sd.insertBefore(selInfoEl, sd.firstChild);
                    sd.appendChild(batDelBtn2);
                    sd.appendChild(deselBtn2);
                }
            }

            // 绑定操作按钮
            body.querySelectorAll('.ct-act-btn[data-act]').forEach(function (btn) {
                var act = btn.dataset.act;
                btn.addEventListener('click', function () {
                    if (act === 'expandAll') t.expandAll();
                    else if (act === 'collapseAll') t.collapseAll();
                    else if (act === 'rebuild') t.rebuild();
                    else if (act === 'toggleFocus') t._toggleFocusMode();
                    else if (act === 'toggleRadial') t._toggleRadialLayout();
                    else if (act === 'sibPrev') t._jumpSiblingFromPanel('prev');
                    else if (act === 'sibNext') t._jumpSiblingFromPanel('next');
                    else if (act === 'sibOpen') t._openCurrentRefNode();
                });
            });
            // ★ 绑定同级导航标签（点击节点时更新）
            t._sibLabelEl = body.querySelector('#ct-sib-label');
            // 绑定撤销按钮
            var undoBtn = body.querySelector('#ct-undo-btn');
            if (undoBtn) {
                t._undoBtn = undoBtn;
                undoBtn.addEventListener('click', function () { t._undo(); });
                // 同步可见性
                if (t._undoStack && t._undoStack.length) undoBtn.style.display = '';
            }

            // 绑定设置控件
            body.querySelectorAll('.ct-select[data-key]').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    var k = sel.dataset.key;
                    t.plugin.settings[k] = sel.value;
                    t.plugin.saveSettings();
                });
            });
            body.querySelectorAll('.ct-slider[data-key]').forEach(function (sl) {
                var valEl = sl.nextElementSibling;
                sl.addEventListener('input', function () {
                    var v = parseInt(sl.value);
                    if (valEl) valEl.textContent = v;
                });
                sl.addEventListener('change', function () {
                    var k = sl.dataset.key;
                    t.plugin.settings[k] = parseInt(sl.value);
                    t.plugin.saveSettings();
                });
            });
            body.querySelectorAll('.ct-toggle[data-key]').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var k = cb.dataset.key;
                    t.plugin.settings[k] = cb.checked;
                    t.plugin.saveSettings();
                });
            });

            // 绑定搜索导航按钮
            var prevBtn = body.querySelector('#ct-search-prev');
            var nextBtn = body.querySelector('#ct-search-next');
            if (prevBtn) prevBtn.addEventListener('click', function () { t._navigateSearchPrev(); });
            if (nextBtn) nextBtn.addEventListener('click', function () { t._navigateSearch(); });

            // 绑定小地图开关
            var mmToggle = body.querySelector('.ct-minimap-toggle');
            if (mmToggle) {
                mmToggle.checked = t._minimapVisible;
                mmToggle.addEventListener('change', function () {
                    t._minimapVisible = mmToggle.checked;
                    var mc = body.querySelector('#ct-minimap-canvas');
                    if (mc) mc.style.display = t._minimapVisible ? '' : 'none';
                });
            }
            // ★ 绑定小地图 canvas（面板内）—— 先移除旧的 window 级监听器避免累积
            if (t._mmMoveHandler) { window.removeEventListener('mousemove', t._mmMoveHandler); }
            if (t._mmUpHandler) { window.removeEventListener('mouseup', t._mmUpHandler); }
            if (t._mmWheelHandler) { window.removeEventListener('wheel', t._mmWheelHandler); }
            var mmCanvas = body.querySelector('#ct-minimap-canvas');
            if (mmCanvas) {
                if (!t._minimapVisible) mmCanvas.style.display = 'none';
                t._minimapCanvas = mmCanvas;
                t._mmDragViewport = false;
                mmCanvas.addEventListener('mousedown', function (e) {
                    if (!t._treeRoot) return;
                    var mx = e.offsetX, my = e.offsetY;
                    var cw = mmCanvas.clientWidth, ch = mmCanvas.clientHeight || 160;
                    var b = t._bounds(t._treeRoot, null);
                    var nw = b.Mx - b.mx, nh = b.My - b.my;
                    if (nw < 10) nw = 10; if (nh < 10) nh = 10;
                    var scale = Math.min(cw / nw, ch / nh) * 0.9;
                    var ox = (cw - nw * scale) / 2 - b.mx * scale;
                    var oy = (ch - nh * scale) / 2 - b.my * scale;
                    var sa = t._scrollArea;
                    // ★ 视口框位置（minimap 坐标）
                    var vx = (sa.scrollLeft / t._zoom) * scale + ox;
                    var vy = (sa.scrollTop / t._zoom) * scale + oy;
                    var vw = Math.max(8, (sa.clientWidth || 1) / t._zoom * scale);
                    var vh = Math.max(8, (sa.clientHeight || 1) / t._zoom * scale);
                    // ★ 记录拖拽初始状态
                    t._mmScrollDown = { left: sa.scrollLeft, top: sa.scrollTop };
                    t._mmMouseDown = { x: mx, y: my };
                    t._mmScaleDown = scale;
                    if (mx >= vx && mx <= vx + vw && my >= vy && my <= vy + vh) {
                        t._mmDragViewport = true;
                        e.preventDefault(); e.stopPropagation();
                        return;
                    }
                    // ★ 点击跳转（非拖拽）：用地道逆变换 → 居中视口
                    var wx = (mx - ox) / scale + b.mx;
                    var wy = (my - oy) / scale + b.my;
                    var tx = Math.max(0, wx * t._zoom - sa.clientWidth / 2);
                    var ty = Math.max(0, wy * t._zoom - sa.clientHeight / 2);
                    sa.scrollTo({ left: tx, top: ty, behavior: 'smooth' });
                });
                // ★ 拖拽：纯 delta 驱动，无居中偏移
                t._mmMoveHandler = function (e) {
                    if (!t._mmDragViewport || !t._treeRoot || !t._minimapCanvas) return;
                    var mc = t._minimapCanvas;
                    var mr = mc.getBoundingClientRect();
                    var mx = e.clientX - mr.left, my = e.clientY - mr.top;
                    var d = t._mmMouseDown, sd = t._mmScrollDown;
                    if (!d || !sd) return;
                    var scale = t._mmScaleDown, zoom = t._zoom;
                    var dx = (mx - d.x) / scale * zoom;
                    var dy = (my - d.y) / scale * zoom;
                    var sa = t._scrollArea;
                    var maxSx = Math.max(0, (t._canvas.width || 1200) - sa.clientWidth);
                    var maxSy = Math.max(0, (t._canvas.height || 1200) - sa.clientHeight);
                    sa.scrollLeft = Math.max(0, Math.min(maxSx, sd.left + dx));
                    sa.scrollTop  = Math.max(0, Math.min(maxSy, sd.top + dy));
                };
                t._mmUpHandler = function () { t._mmDragViewport = false; };
                window.addEventListener('mousemove', t._mmMoveHandler);
                window.addEventListener('mouseup', t._mmUpHandler);
                // ★ 滚轮缩放小地图 → 联动主画布缩放
                t._mmWheelHandler = function (e) {
                    if (!t._minimapVisible || !t._settingsVisible) return;
                    var mc = t._minimapCanvas;
                    if (!mc) return;
                    var mr = mc.getBoundingClientRect();
                    var hoverX = e.clientX - mr.left, hoverY = e.clientY - mr.top;
                    if (hoverX < 0 || hoverY < 0 || hoverX > mc.clientWidth || hoverY > (mc.clientHeight || 160)) return;
                    e.preventDefault();
                    var oldZoom = t._zoom;
                    var factor = e.deltaY > 0 ? 0.9 : 1.1;
                    var newZoom = oldZoom * factor;
                    if (newZoom < 0.2) newZoom = 0.2;
                    if (newZoom > 4) newZoom = 4;
                    // ★ 以鼠标指向的世界坐标为中心缩放
                    var b = t._bounds(t._treeRoot, null);
                    var nw = b.Mx - b.mx, nh = b.My - b.my;
                    if (nw < 10) nw = 10; if (nh < 10) nh = 10;
                    var scale = Math.min(mc.clientWidth / nw, (mc.clientHeight || 160) / nh) * 0.9;
                    var ox = (mc.clientWidth - nw * scale) / 2 - b.mx * scale;
                    var oy = ((mc.clientHeight || 160) - nh * scale) / 2 - b.my * scale;
                    var wx = (hoverX - ox) / scale + b.mx;
                    var wy = (hoverY - oy) / scale + b.my;
                    var sa = t._scrollArea;
                    // newScroll = wx * newZoom - cursorScreenPos, 其中 cursorScreenPos = wx * oldZoom - oldScroll
                    sa.scrollLeft = Math.max(0, wx * newZoom - (wx * oldZoom - sa.scrollLeft));
                    sa.scrollTop  = Math.max(0, wy * newZoom - (wy * oldZoom - sa.scrollTop));
                    t._zoom = newZoom;
                    t._redraw();
                };
                mmCanvas.addEventListener('wheel', t._mmWheelHandler, { passive: false });
                // ★ 等布局完成后绘制小地图
                if (t._treeRoot && t._minimapVisible) {
                    requestAnimationFrame(function () { requestAnimationFrame(function () { t._drawMinimap(); }); });
                }
            }

            // 绑定分区折叠
            body.querySelectorAll('.ct-section-header').forEach(function (h) {
                h.addEventListener('click', function () {
                    var arrow = h.querySelector('.ct-section-arrow');
                    var bd = h.nextElementSibling;
                    var collapsed = bd.classList.toggle('ct-collapsed');
                    arrow.classList.toggle('ct-open', !collapsed);
                });
            });
            // ★ 同步面板按钮状态
            t._syncPanelButtons();
        };

        t.toggleSettingsPanel = function () {
            t._settingsVisible = !t._settingsVisible;
            if (t._settingsVisible) { t.renderSettingsPanel(); requestAnimationFrame(function () { requestAnimationFrame(function () { if (t._minimapVisible && t._treeRoot) t._drawMinimap(); }); }); }
            t._settingsPanel.style.display = t._settingsVisible ? '' : 'none';
            var btn = c.querySelector('.ct-tool-btn');
            if (btn) btn.classList.toggle('ct-active', t._settingsVisible);
        };

        t._popOutSettings = function () {
            if (t._popoutActive) { t._closePopout(); return; }
            if (!t._settingsVisible) { t._settingsVisible = true; t._settingsPanel.style.display = ''; t.renderSettingsPanel(); }
            var p = t._settingsPanel;
            // 保存原始父节点和样式
            t._popoutParent = p.parentNode;
            t._popoutSibling = p.nextSibling;
            t._popoutSavedCSS = { position: p.style.position, top: p.style.top, right: p.style.right, left: p.style.left, width: p.style.width, maxHeight: p.style.maxHeight, zIndex: p.style.zIndex, boxShadow: p.style.boxShadow, borderRadius: p.style.borderRadius, background: p.style.background, border: p.style.border };
            // 移到 body 打破 overflow:hidden 限制
            document.body.appendChild(p);
            p.style.position = 'fixed'; p.style.top = '80px'; p.style.right = '40px'; p.style.left = 'auto';
            p.style.zIndex = '1000'; p.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)'; p.style.borderRadius = '8px';
            p.style.background = 'var(--background-primary)'; p.style.border = '1px solid var(--background-modifier-border)';
            p.style.display = '';
            // 拖拽
            var dSX = 0, dSY = 0, dOX2 = 0, dOY2 = 0, dragging2 = false;
            var onDown = function (e) { dragging2 = true; dSX = e.clientX; dSY = e.clientY; dOX2 = p.offsetLeft; dOY2 = p.offsetTop; p.style.left = dOX2 + 'px'; p.style.top = dOY2 + 'px'; p.style.right = 'auto'; e.stopPropagation(); };
            var onMove = function (e) { if (!dragging2) return; p.style.left = (dOX2 + e.clientX - dSX) + 'px'; p.style.top = (dOY2 + e.clientY - dSY) + 'px'; };
            var onUp = function () { dragging2 = false; };
            p.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            t._popoutDown = onDown; t._popoutMove = onMove; t._popoutUp = onUp;
            // 底部关闭按钮
            var footer = p.createDiv();
            footer.style.cssText = 'text-align:right;padding:6px 12px;border-top:1px solid var(--background-modifier-border);';
            var cb = footer.createEl('button', { text: '取消浮动', cls: 'ct-act-btn' });
            cb.addEventListener('click', function (e) { e.stopPropagation(); t._closePopout(); });
            t._popoutFooter = footer;
            var escH = function (e) { if (e.key === 'Escape') { t._closePopout(); document.removeEventListener('keydown', escH); } };
            document.addEventListener('keydown', escH);
            t._popoutEsc = escH; t._popoutActive = true;
            setTimeout(function () { if (t._minimapVisible && t._treeRoot) t._drawMinimap(); }, 100);
        };

        t._closePopout = function () {
            if (!t._popoutActive) return;
            var p = t._settingsPanel;
            var c2 = t._popoutSavedCSS || {};
            p.style.position = c2.position || ''; p.style.top = c2.top || ''; p.style.right = c2.right || ''; p.style.left = '';
            p.style.width = c2.width || ''; p.style.maxHeight = c2.maxHeight || '';
            p.style.zIndex = c2.zIndex || ''; p.style.boxShadow = c2.boxShadow || ''; p.style.borderRadius = c2.borderRadius || '';
            p.style.background = c2.background || ''; p.style.border = '';
            if (t._popoutDown) p.removeEventListener('mousedown', t._popoutDown);
            if (t._popoutMove) document.removeEventListener('mousemove', t._popoutMove);
            if (t._popoutUp) document.removeEventListener('mouseup', t._popoutUp);
            if (t._popoutEsc) document.removeEventListener('keydown', t._popoutEsc);
            if (t._popoutFooter) { t._popoutFooter.remove(); t._popoutFooter = null; }
            // 搬回原位
            if (t._popoutParent) {
                if (t._popoutSibling && t._popoutSibling.parentNode === t._popoutParent) {
                    t._popoutParent.insertBefore(p, t._popoutSibling);
                } else {
                    t._popoutParent.appendChild(p);
                }
            }
            t._popoutActive = false;
            t._popoutParent = null; t._popoutSibling = null;
            t._popoutDown = null; t._popoutMove = null; t._popoutUp = null; t._popoutEsc = null; t._popoutSavedCSS = null;
            if (t._minimapVisible && t._treeRoot) { setTimeout(function () { t._drawMinimap(); }, 100); }
        };

        // canvas
        var ca = c.createDiv('collapse-tree-canvas-area');
        t._scrollArea = ca;
        // ★ 滚动时实时更新小地图（rAF 节流，避免每帧重复绘制）
        t._mmRedrawPending = false;
        ca.addEventListener('scroll', function () {
            if (!t._mmRedrawPending) {
                t._mmRedrawPending = true;
                requestAnimationFrame(function () {
                    if (t._minimapVisible && t._settingsVisible && t._minimapCanvas) t._drawMinimap();
                    t._mmRedrawPending = false;
                });
            }
        });
        t._canvas = ca.createEl('canvas');
        t._ctx = t._canvas.getContext('2d');
        t._tooltip = c.createDiv('collapse-tree-tooltip');

        // ═══ 中键拖拽画布 ═══
        t._scrollArea.addEventListener('mousedown', function (e) {
            if (e.button === 1) {
                e.preventDefault();
                t._panning = true;
                t._panStartX = e.clientX; t._panStartY = e.clientY;
                t._panScrollLeft = t._scrollArea.scrollLeft;
                t._panScrollTop = t._scrollArea.scrollTop;
                t._scrollArea.style.cursor = 'grabbing';
            }
        });
        window.addEventListener('mousemove', function (e) {
            if (!t._panning) return;
            t._scrollArea.scrollLeft = t._panScrollLeft - (e.clientX - t._panStartX);
            t._scrollArea.scrollTop = t._panScrollTop - (e.clientY - t._panStartY);
        });
        window.addEventListener('mouseup', function (e) {
            if (e.button === 1 && t._panning) { t._panning = false; t._scrollArea.style.cursor = ''; }
        });

        // ═══ 事件 ═══
        t._canvas.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var p = t._screenToWorld(e.offsetX, e.offsetY);
            t._mouseDownNode = t._hitTest(p.worldX, p.worldY);
            t._mouseDownWX = p.worldX; t._mouseDownWY = p.worldY;
            t._dragging = false; t._dragNodes = [];
        });

        t._canvas.addEventListener('mousemove', function (e) {
            if (t._panning) return;
            var p = t._screenToWorld(e.offsetX, e.offsetY);
            if (t._mouseDownNode && !t._dragging) {
                var dx = p.worldX - t._mouseDownWX, dy = p.worldY - t._mouseDownWY;
                if (dx * dx + dy * dy > 16) {
                    t._dragging = true;
                    t._dragStartWX = t._mouseDownWX; t._dragStartWY = t._mouseDownWY;
                    t._dragWorldX = p.worldX; t._dragWorldY = p.worldY;
                    if (t._selected.has(t._mouseDownNode.path)) {
                        t._selected.forEach(function (sp) { t._dragNodes.push(sp); });
                    } else {
                        t._selected.clear(); t._selected.add(t._mouseDownNode.path);
                        t._dragNodes.push(t._mouseDownNode.path); t._updateSelInfo();
                    }
                    t._tooltip.removeClass('is-visible'); t._scrollArea.style.cursor = 'grabbing';
                }
            }
            if (t._dragging) {
                t._dragWorldX = p.worldX; t._dragWorldY = p.worldY;
                t._dropTarget = t._findDropTarget(p.worldX, p.worldY);
                t._hovered = t._dropTarget; t._redraw();
                // ★ 拖拽时自动滚动：鼠标靠近边缘时画布平移
                var sa = t._scrollArea, edge = 50;
                var sr = sa.getBoundingClientRect();
                var mxEdge = e.clientX - sr.left, myEdge = e.clientY - sr.top;
                var spd = 10;
                if (mxEdge < edge) sa.scrollLeft -= (edge - mxEdge) / edge * spd;
                else if (mxEdge > sr.width - edge) sa.scrollLeft += (mxEdge - (sr.width - edge)) / edge * spd;
                if (myEdge < edge) sa.scrollTop -= (edge - myEdge) / edge * spd;
                else if (myEdge > sr.height - edge) sa.scrollTop += (myEdge - (sr.height - edge)) / edge * spd;
            } else {
                var h = t._hitTest(p.worldX, p.worldY);
                if (h !== t._hovered) {
                    t._hovered = h; t._updateTooltip(e); t._redraw();
                    // ★ 悬停预览：文件节点悬停 350ms 触发 hover-editor
                    if (t._hoverPreviewTimer) { clearTimeout(t._hoverPreviewTimer); t._hoverPreviewTimer = null; }
                    if (h && !h.isFolder && t.plugin.settings.enableHoverPreview && !t._suppressHoverPreview) {
                        t._hoverPreviewTimer = setTimeout(function () { t._triggerHoverPreview(h); }, 350);
                    }
                }
            }
        });

        t._canvas.addEventListener('mouseup', function (e) {
            if (e.button !== 0) return;
            if (t._dragging) {
                t._dragging = false; t._scrollArea.style.cursor = '';
                if (t._dropTarget && t._dropTarget.isFolder) t._doMove(t._dropTarget.path, t._dragNodes.slice());
                t._dropTarget = null; t._dragNodes = []; t._mouseDownNode = null; t._hovered = null;
                t._updateSelInfo(); t.rebuild(); return;
            }
            var node = t._mouseDownNode; t._mouseDownNode = null;
            if (!node) { t._selected.clear(); t._lastClickedPath = null; t._updateSelInfo(); t._redraw(); return; }
            if (e.ctrlKey || e.metaKey) {
                if (t._selected.has(node.path)) t._selected.delete(node.path); else t._selected.add(node.path);
                t._lastClickedPath = node.path; t._updateSibLabel(); t._updateSelInfo(); t._redraw(); return;
            }
            if (e.shiftKey && t._lastClickedPath) { t._rangeSelect(t._lastClickedPath, node.path); t._updateSelInfo(); t._redraw(); return; }
            if (t._selected.size === 1 && t._selected.has(node.path)) {
                if (node.isFolder) {
                    if (t._expanded.has(node.path)) t._expanded.delete(node.path); else t._expanded.add(node.path);
                    t._selected.clear(); t._updateSelInfo(); t.rebuild(); t._saveLayout();
                } else {
                    var f = t.app.vault.getAbstractFileByPath(node.path);
                    if (f) t.app.workspace.getLeaf(false).openFile(f);
                }
            } else { t._selected.clear(); t._selected.add(node.path); t._lastClickedPath = node.path; t._updateSibLabel(); t._updateSelInfo(); t._redraw(); }
        });

        t._canvas.addEventListener('mouseleave', function () { if (!t._dragging) { t._hovered = null; if (t._hoverPreviewTimer) { clearTimeout(t._hoverPreviewTimer); t._hoverPreviewTimer = null; } t._tooltip.removeClass('is-visible'); t._redraw(); } });
        t._canvas.addEventListener('wheel', function (e) {
            e.preventDefault(); var sa = t._scrollArea || t.containerEl;
            if (e.ctrlKey || e.metaKey) { t._zoom *= (e.deltaY > 0 ? 0.9 : 1.1); if (t._zoom < 0.2) t._zoom = 0.2; if (t._zoom > 4) t._zoom = 4; t._redraw(); }
            else if (e.shiftKey) sa.scrollLeft += e.deltaY;
            else sa.scrollTop += e.deltaY;
        }, { passive: false });

        // ★ Ctrl+Z 撤销移动
        t._undoCmd = t.plugin.addCommand({ id: 'collapse-tree-undo', name: '撤销移动 (Ctrl+Z)', hotkeys: [{ modifiers: ['Ctrl'], key: 'Z' }], callback: function () { var al = t.app.workspace.activeLeaf; if (al && al.view === t) t._undo(); } });
        // ★ Ctrl+Shift+D Focus Mode（去掉 al.view===t 限制，任意活跃叶子均可触发）
        t._focusCmd = t.plugin.addCommand({ id: 'collapse-tree-focus', name: 'Focus Mode', hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'D' }], callback: function () { t._toggleFocusMode(); } });
        // 兜底：直接监听容器键盘事件
        c.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault(); e.stopPropagation();
                t._undo();
            }
        });

        // ═══ 右键菜单 ═══
        t._canvas.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            var p = t._screenToWorld(e.offsetX, e.offsetY), h = t._hitTest(p.worldX, p.worldY);
            if (!h) {
                if (t._selected.size > 0) {
                    var gm = new (require('obsidian').Menu)();
                    gm.addItem(function (i) { i.setTitle('批量删除 (' + t._selected.size + ' 项)'); i.setIcon('trash'); i.onClick(function () { t._batchDelete(); }); });
                    gm.addItem(function (i) { i.setTitle('清除选择'); i.setIcon('x'); i.onClick(function () { t._clearSelection(); t._updateSelInfo(); t._redraw(); }); });
                    gm.showAtMouseEvent(e);
                }
                return;
            }
            var f = t.app.vault.getAbstractFileByPath(h.path);
            var m = new (require('obsidian').Menu)();
            if (t._selected.size > 1) { m.addItem(function (i) { i.setTitle('批量删除 (' + t._selected.size + ' 项)'); i.setIcon('trash'); i.onClick(function () { t._batchDelete(); }); }); m.addItem(function (i) { i.setTitle('剪切 (' + t._selected.size + ' 项)'); i.setIcon('scissors'); i.onClick(function () { t._cutSelected(); }); }); m.addSeparator(); }
            else if (t._selected.size === 1) { m.addItem(function (i) { i.setTitle('剪切'); i.setIcon('scissors'); i.onClick(function () { t._cutSelected(); }); }); m.addSeparator(); }
            if (h.isFolder) {
                // 粘贴到此处
                if (t._clipboardPaths.length > 0) {
                    m.addItem(function (i) { i.setTitle('粘贴到此处 (' + t._clipboardPaths.length + ' 项)'); i.setIcon('clipboard-paste'); i.onClick(function () { t._pasteHere(h.path); }); });
                    m.addSeparator();
                }
                m.addItem(function (i) { i.setTitle('新建笔记'); i.setIcon('file-plus'); i.onClick(function () { t._createFile(h.path, '.md'); }); });
                m.addItem(function (i) { i.setTitle('新建文件夹'); i.setIcon('folder-plus'); i.onClick(function () { t._createFolder(h.path); }); });
                m.addItem(function (i) { i.setTitle('新建白板'); i.setIcon('layout-dashboard'); i.onClick(function () { t._createFile(h.path, '.canvas'); }); });
                m.addItem(function (i) { i.setTitle('新建绘图'); i.setIcon('pencil'); i.onClick(function () { t._createFile(h.path, '.excalidraw'); }); });
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('重命名'); i.setIcon('pencil'); i.onClick(function () { t._rename(h.path); }); });
                m.addItem(function (i) { i.setTitle('删除'); i.setIcon('trash'); i.onClick(function () { t._delete(h.path); }); });
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('上一个平行节点'); i.setIcon('chevron-up'); i.onClick(function () { t._jumpSibling(h.path, 'prev'); }); });
                m.addItem(function (i) { i.setTitle('下一个平行节点'); i.setIcon('chevron-down'); i.onClick(function () { t._jumpSibling(h.path, 'next'); }); });
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('复制相对路径'); i.setIcon('clipboard-copy'); i.onClick(function () { navigator.clipboard.writeText(h.path); }); });
                m.addItem(function (i) { i.setTitle('复制绝对路径'); i.setIcon('clipboard-copy'); i.onClick(function () { try { navigator.clipboard.writeText(t.app.vault.adapter.getFullPath(h.path)); } catch(e) { navigator.clipboard.writeText(h.path); } }); });
                m.addItem(function (i) { i.setTitle('在文件管理器打开'); i.setIcon('folder-open'); i.onClick(function () { t._showInExplorer(h.path); }); });
            } else {
                if (f) { m.addItem(function (i) { i.setTitle('打开'); i.setIcon('file'); i.onClick(function () { t.app.workspace.getLeaf(false).openFile(f); }); }); m.addItem(function (i) { i.setTitle('新标签页打开'); i.setIcon('file-plus'); i.onClick(function () { t.app.workspace.getLeaf('tab').openFile(f); }); }); m.addItem(function (i) { i.setTitle('右侧打开'); i.setIcon('separator-vertical'); i.onClick(function () { t.app.workspace.getLeaf('split').openFile(f); }); }); }
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('查看详情'); i.setIcon('info'); i.onClick(function () { t._viewDetails(h.path); }); });
                m.addItem(function (i) { i.setTitle('重命名'); i.setIcon('pencil'); i.onClick(function () { t._rename(h.path); }); });
                m.addItem(function (i) { i.setTitle('删除'); i.setIcon('trash'); i.onClick(function () { t._delete(h.path); }); });
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('上一个平行节点'); i.setIcon('chevron-up'); i.onClick(function () { t._jumpSibling(h.path, 'prev'); }); });
                m.addItem(function (i) { i.setTitle('下一个平行节点'); i.setIcon('chevron-down'); i.onClick(function () { t._jumpSibling(h.path, 'next'); }); });
                m.addSeparator();
                m.addItem(function (i) { i.setTitle('复制相对路径'); i.setIcon('clipboard-copy'); i.onClick(function () { navigator.clipboard.writeText(h.path); }); });
                m.addItem(function (i) { i.setTitle('复制绝对路径'); i.setIcon('clipboard-copy'); i.onClick(function () { try { navigator.clipboard.writeText(t.app.vault.adapter.getFullPath(h.path)); } catch(e) { navigator.clipboard.writeText(h.path); } }); });
                m.addItem(function (i) { i.setTitle('在文件管理器打开'); i.setIcon('folder-open'); i.onClick(function () { t._showInExplorer(h.path); }); });
            }
            m.showAtMouseEvent(e);
        });

        t._loadLayout(); t.buildTree(); t.render();
    };

    CollapseTreeView.prototype.onClose = function () {
        this._saveLayout();
        clearTimeout(this._layoutTimer);
        this._mmDragViewport = false;
        this._focusMode = false;
        this._focusPath = null;
        this._savedExpanded = null;
        if (this._mmMoveHandler) { window.removeEventListener('mousemove', this._mmMoveHandler); this._mmMoveHandler = null; }
        if (this._mmUpHandler) { window.removeEventListener('mouseup', this._mmUpHandler); this._mmUpHandler = null; }
        if (this._mmWheelHandler) { window.removeEventListener('wheel', this._mmWheelHandler); this._mmWheelHandler = null; }
        if (this._styleObserver) { this._styleObserver.disconnect(); this._styleObserver = null; }
        for (var i = 0; i < this._wsRefs.length; i++) this.app.workspace.offref(this._wsRefs[i]);
        this._wsRefs = [];
    };

    CollapseTreeView.prototype._screenToWorld = function (sx, sy) {
        return { worldX: Math.round(sx / this._zoom), worldY: Math.round(sy / this._zoom) };
    };

    // ── Tree ──

    CollapseTreeView.prototype.rebuild = function () { this.buildTree(); this.render(); };
    CollapseTreeView.prototype.expandAll = function () { this._collectFolders(this.app.vault.getRoot()); this.rebuild(); };
    CollapseTreeView.prototype.collapseAll = function () { this._expanded.clear(); this.rebuild(); };
    CollapseTreeView.prototype._collectFolders = function (f) { this._expanded.add(f.path); if (f.children) for (var i = 0; i < f.children.length; i++) { if (f.children[i].children) this._collectFolders(f.children[i]); } };

    CollapseTreeView.prototype.buildTree = function () {
        this._treeRoot = this._buildNode(this.app.vault.getRoot());
        // 热力图：计算 mtime 范围
        this._heatMinMtime = Infinity; this._heatMaxMtime = 0;
        var t = this;
        (function collectMtime(node) {
            if (!node) return;
            if (typeof node._mtime === 'number' && node._mtime > 0) {
                if (node._mtime < t._heatMinMtime) t._heatMinMtime = node._mtime;
                if (node._mtime > t._heatMaxMtime) t._heatMaxMtime = node._mtime;
            }
            if (node.children) for (var i = 0; i < node.children.length; i++) collectMtime(node.children[i]);
        })(this._treeRoot);
        if (this._heatMinMtime === Infinity) { this._heatMinMtime = 0; this._heatMaxMtime = 1; }
    };

    CollapseTreeView.prototype._buildNode = function (obsFolder) {
        var t = this;
        var isRoot = !obsFolder.parent;
        var mtime = obsFolder.stat ? obsFolder.stat.mtime : 0;
        var node = { name: isRoot ? 'Vault' : obsFolder.name, path: obsFolder.path, isFolder: true, expanded: isRoot || t._expanded.has(obsFolder.path), children: [], x: 0, y: 0, sw: 0, color: null, _mtime: mtime, _fileCount: 0 };
        if (!obsFolder.children) return node;
        var ch = obsFolder.children.slice();
        ch.sort(function (a, b) {
            var af = !!a.children, bf = !!b.children;
            if (af && !bf) return -1; if (!af && bf) return 1;
            if (t.plugin.settings.sortOrder === 'mtime') return (b.stat ? b.stat.mtime : 0) - (a.stat ? a.stat.mtime : 0);
            return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        });
        for (var i = 0; i < ch.length; i++) {
            var c = ch[i];
            if (t.plugin.isExcluded(c.name || '')) continue;
            if (c.children) { node.children.push(t._buildNode(c)); }
            else { node.children.push({ name: c.basename || c.name, path: c.path, isFolder: false, expanded: false, children: null, x: 0, y: 0, sw: 0, color: fc(c.name), _mtime: c.stat ? c.stat.mtime : 0 }); }
        }
        // ★ 计算文件夹内文件总数（递归所有子节点）
        (function countFiles(n) { var c = 0; if (!n.isFolder) return 1; if (n.children) for (var j = 0; j < n.children.length; j++) c += countFiles(n.children[j]); n._fileCount = c; })(node);
        return node;
    };

    // ── 径向布局辅助 ──

    CollapseTreeView.prototype._getMaxDepth = function (node) {
        if (!node.isFolder || !node.expanded || !node.children || !node.children.length) return 0;
        var m = 0;
        for (var i = 0; i < node.children.length; i++) {
            var d = this._getMaxDepth(node.children[i]) + 1;
            if (d > m) m = d;
        }
        return m;
    };

    // ★ 统计每层节点数 + 总跨度（用于自适应半径）
    CollapseTreeView.prototype._countDepthNodes = function (node, counts, maxPerDepth) {
        var d = node._depth || 0;
        counts[d] = (counts[d] || 0) + 1;
        if (maxPerDepth[d] === undefined || counts[d] > maxPerDepth[d]) maxPerDepth[d] = counts[d];
        if (node.children) for (var i = 0; i < node.children.length; i++) this._countDepthNodes(node.children[i], counts, maxPerDepth);
    };

    CollapseTreeView.prototype._layoutRadial = function (node) {
        var s = this.plugin.settings;
        var minSpan = 0.5;
        var gap = Math.max(0.02, (s.siblingGap || 24) / 480);
        if (s.compactDensity) gap *= 0.55;
        if (!node.isFolder || !node.expanded || !node.children || !node.children.length) { node.sw = minSpan; return; }
        var ta = 0, nc = node.children.length;
        for (var i = 0; i < nc; i++) {
            var c = node.children[i];
            if (c.isFolder) this._layoutRadial(c); else c.sw = minSpan;
            ta += c.sw; if (i < nc - 1) ta += gap;
        }
        node.sw = ta;
    };

    CollapseTreeView.prototype._positionRadial = function (node, cx, cy, startAngle, endAngle, depthRadius) {
        var depth = node._depth || 0;
        var r = depth === 0 ? 0 : (depthRadius[depth] || (350 + depth * 120));
        var mid = (startAngle + endAngle) / 2;
        node._midAngle = mid; node._angleSpan = endAngle - startAngle;
        node.x = cx + r * Math.cos(mid); node.y = cy + r * Math.sin(mid);
        if (!node.children || !node.children.length || !node.isFolder || !node.expanded) return;
        var sector = endAngle - startAngle, totalW = Math.max(node.sw, 0.01), a = startAngle;
        for (var i = 0; i < node.children.length; i++) {
            var ch = node.children[i];
            ch._depth = depth + 1;
            var span = (ch.sw / totalW) * sector;
            ch._midAngle = a + span / 2; ch._angleSpan = span;
            var chR = depthRadius[depth + 1] || (350 + (depth + 1) * 120);
            ch.x = cx + chR * Math.cos(ch._midAngle);
            ch.y = cy + chR * Math.sin(ch._midAngle);
            if (ch.isFolder && ch.expanded && ch.children && ch.children.length)
                this._positionRadial(ch, cx, cy, a, a + span, depthRadius);
            a += span;
        }
    };

    // ── 线性布局 ──

    CollapseTreeView.prototype._layout = function (node) {
        var s = this.plugin.settings, gx = s.levelGap || 100, gy = s.siblingGap || 24, ns = s.nodeSize || 8;
        if (s.compactDensity) { gx *= 0.65; gy *= 0.55; }
        gy = Math.min(gy, 40);
        if (!node.isFolder || !node.expanded || !node.children || !node.children.length) { node.sw = ns * 2 + gy; return; }
        var tw = 0;
        for (var i = 0; i < node.children.length; i++) { var c = node.children[i]; if (c.isFolder) this._layout(c); else c.sw = ns * 2 + gy; tw += c.sw; if (i < node.children.length - 1) tw += gy; }
        node.sw = Math.max(tw, ns * 2 + gy);
    };

    CollapseTreeView.prototype._position = function (node, x, y) {
        var s = this.plugin.settings, gx = s.levelGap || 100, gy = s.siblingGap || 24;
        if (s.compactDensity) { gx *= 0.65; gy *= 0.55; }
        gy = Math.min(gy, 40);
        node.x = x; node.y = y;
        if (!node.isFolder || !node.expanded || !node.children || !node.children.length) return;
        var sy = y - node.sw / 2;
        for (var i = 0; i < node.children.length; i++) { var c = node.children[i]; this._position(c, x + gx, sy + c.sw / 2); sy += c.sw; if (i < node.children.length - 1) sy += gy; }
    };

    CollapseTreeView.prototype._bounds = function (node, b) {
        if (!b) b = { mx: 1e9, my: 1e9, Mx: -1e9, My: -1e9 };
        var ns = this.plugin.settings.nodeSize || 8, r = node.isFolder ? ns + 4 : ns;
        if (node.x - r < b.mx) b.mx = node.x - r; if (node.y - r < b.my) b.my = node.y - r;
        if (node.x + r > b.Mx) b.Mx = node.x + r; if (node.y + r > b.My) b.My = node.y + r;
        if (node.isFolder && node.expanded && node.children) for (var i = 0; i < node.children.length; i++) this._bounds(node.children[i], b);
        return b;
    };

    // ── Render ──

    CollapseTreeView.prototype.render = function () {
        if (!this._ctx || !this._canvas || !this._treeRoot) return;
        var ctx = this._ctx, s = this.plugin.settings;
        var isRadial = s.layoutMode === 'radial';
        if (isRadial) {
            this._treeRoot._depth = 0;
            this._layoutRadial(this._treeRoot);
            stc(this._treeRoot, 0);
            var maxD = this._getMaxDepth(this._treeRoot);
            var depthRadius = {};
            var baseR = 250;
            var gx = s.levelGap || 100;
            for (var d = 1; d <= maxD + 1; d++) {
                depthRadius[d] = baseR + d * gx;
            }
            var maxR = depthRadius[maxD + 1] || (baseR + (maxD + 1) * gx);
            this._depthRadii = depthRadius; this._radialMaxD = maxD;
            maxR += 400;
            var c = this._scrollArea || this.containerEl, vw = c.clientWidth || 600, vh = c.clientHeight || 400;
            var nw = Math.max(maxR * 2, vw + 200, 2000);
            var nh = Math.max(maxR * 2, vh + 200, 2000);
            var cx = nw / 2, cy = nh / 2;
            this._radialCx = cx; this._radialCy = cy;
            this._positionRadial(this._treeRoot, cx, cy, -Math.PI / 2, Math.PI * 1.5, depthRadius);
        } else {
            this._layout(this._treeRoot);
            stc(this._treeRoot, 0);
            this._position(this._treeRoot, 60, Math.max(600, this._treeRoot.sw / 2 + 100));
        }
        var b = this._bounds(this._treeRoot, null);
        var c2 = this._scrollArea || this.containerEl, vw2 = c2.clientWidth || 600, vh2 = c2.clientHeight || 400;
        if (!isRadial) {
            nw = Math.max(b.Mx + 200, vw2 + 200, 1200);
            nh = Math.max(b.My + 200, vh2 + 200, 1200);
        } else {
            nw = Math.max(b.Mx + 100, nw, 1200);
            nh = Math.max(b.My + 100, nh, 1200);
        }
        var MAX_CANVAS = 32768;
        if (nw > MAX_CANVAS) nw = MAX_CANVAS;
        if (nh > MAX_CANVAS) nh = MAX_CANVAS;
        if (this._canvas.width !== nw) this._canvas.width = nw;
        if (this._canvas.height !== nh) this._canvas.height = nh;
        this._canvas.style.width = nw + 'px'; this._canvas.style.height = nh + 'px';
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        ctx.save(); ctx.scale(this._zoom, this._zoom);
        this._drawLines(this._treeRoot, ctx);
        this._drawNodes(this._treeRoot, ctx);
        if (this._dragging) this._drawDragGhost(ctx);
        ctx.restore();
        if (this._minimapVisible && this._settingsVisible) this._drawMinimap();
    };

    CollapseTreeView.prototype._redraw = function () {
        if (!this._ctx || !this._canvas || !this._treeRoot) return;
        var ctx = this._ctx, cw = this._canvas.width, ch = this._canvas.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save(); ctx.scale(this._zoom, this._zoom);
        this._drawLines(this._treeRoot, ctx);
        this._drawNodes(this._treeRoot, ctx);
        if (this._dragging) this._drawDragGhost(ctx);
        ctx.restore();
        // ★ 小地图（面板内）
        if (this._minimapVisible && this._settingsVisible) this._drawMinimap();
    };

    // ── Focus path helper
    CollapseTreeView.prototype._isOnFocusPath = function (node) {
        if (!this._focusPath || !node) return -1; // -1=not on path, 0=ancestor, 1=target
        if (node.path === this._focusPath) return 1;
        if (node.path === '/') return this._focusPath !== '/' ? 0 : 1;
        return this._focusPath.startsWith(node.path + '/') ? 0 : -1;
    };

    CollapseTreeView.prototype._drawLines = function (node, ctx) {
        var t = this;
        // 旭日图：同心圆环参考线（只画一次）
        if (node.path === '/' && t.plugin.settings.layoutMode === 'radial' && t._depthRadii && t._radialCx !== undefined) {
            var cx = t._radialCx, cy = t._radialCy;
            var dr = t._depthRadii, maxD = t._radialMaxD || 5;
            ctx.save();
            for (var d = 1; d <= maxD + 1; d++) {
                var r = dr[d] || (250 + d * (t.plugin.settings.levelGap || 100));
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
            ctx.restore();
        }
        if (!node.isFolder || !node.expanded || !node.children) return;
        var ls = this.plugin.settings.lineStyle || 'straight';
        for (var i = 0; i < node.children.length; i++) {
            var c = node.children[i];
            // ★ Focus Mode: 聚焦路径连线高亮，否则暗淡
            var onPath = t._focusMode && t._isOnFocusPath(c) >= 0;
            ctx.strokeStyle = onPath ? '#ffeb3b' : (c.isFolder ? (node.color || '#666') : (c.color || '#666'));
            ctx.lineWidth = onPath ? 2.5 : (c.isFolder ? 1.5 : 0.8);
            if (onPath) { ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 6; }
            if (!t._focusMode || onPath) {
                if (ls === 'dashed') ctx.setLineDash([4, 3]);
                else if (ls === 'dotted') ctx.setLineDash([2, 3]);
            } else {
                ctx.globalAlpha = 0.15;
            }
            ctx.beginPath();
            if (ls === 'curved') {
                var mx = (node.x + c.x) / 2;
                ctx.moveTo(node.x, node.y);
                ctx.quadraticCurveTo(mx, node.y, mx, c.y);
                ctx.quadraticCurveTo(mx, c.y, c.x, c.y);
            } else {
                ctx.moveTo(node.x, node.y); ctx.lineTo(c.x, c.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            if (c.isFolder) this._drawLines(c, ctx);
        }
    };

    CollapseTreeView.prototype._drawNodes = function (node, ctx) {
        var t = this;
        var s = t.plugin.settings, ns = s.nodeSize || 8, r = node.isFolder ? ns + 4 : ns;

        // ── 放置目标高亮（虚线区域指示器）──
        if (t._dropTarget && t._dropTarget.path === node.path) {
            ctx.save();
            // 光圈
            ctx.beginPath(); ctx.arc(node.x, node.y, r + 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(76,175,80,0.1)'; ctx.fill();
            // ★ 虚线区域框：包裹文件夹名和计数
            var zoneW = ctx.measureText(node.name).width + 60;
            var zoneH = 24;
            ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(node.x + r + 2, node.y - zoneH / 2, zoneW, zoneH);
            ctx.fillStyle = 'rgba(76,175,80,0.06)'; ctx.fillRect(node.x + r + 2, node.y - zoneH / 2, zoneW, zoneH);
            ctx.setLineDash([]);
            // 放置提示文字
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#4caf50';
            ctx.fillText('放置到此处', node.x + r + 6, node.y - zoneH / 2 - 4);
            ctx.restore();
        }

        // ── 工作区感知：打开的文件用节点右下角小圆点标记 ──
        if (!node.isFolder && t._openFilePaths.has(node.path)) {
            ctx.save();
            ctx.fillStyle = '#42a5f5';
            ctx.beginPath(); ctx.arc(node.x + r + 4, node.y + r + 2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ── 悬停光晕 ──
        if (t._hovered && t._hovered.path === node.path) { ctx.save(); ctx.shadowColor = node.color || '#8ab4f8'; ctx.shadowBlur = 14; }

        // ── 搜索高亮 ──
        var ms = t._searchQuery && !t._dragging && t._matchSearch(node);
        if (ms) { ctx.save(); ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 16; }

        // ── 确定填充色：热力图 or 彩虹 ──
        var fillColor = node.color || '#666';
        if (s.colorMode === 'heatmap' && typeof node._mtime === 'number' && node._mtime > 0 && t._heatMaxMtime > t._heatMinMtime) {
            fillColor = heatColor(node._mtime, t._heatMinMtime, t._heatMaxMtime);
            if (node.isFolder) fillColor = folderHeatColor(node._mtime, t._heatMinMtime, t._heatMaxMtime);
        }
        // 搜索时淡化不匹配节点
        var searchDim = t._searchQuery && !ms && !t._dragging;

        // ★ Focus Mode: 聚焦路径节点保持显示，其余淡化
        var focusOnPath = t._focusMode ? t._isOnFocusPath(node) : -2; // -2=disabled, -1=off-path, 0=ancestor, 1=target
        var focusDim = t._focusMode && focusOnPath < 0 && !t._dragging;
        var isFocusedTarget = focusOnPath === 1;

        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.globalAlpha = (searchDim || focusDim) ? 0.18 : 1;
        ctx.fillStyle = fillColor;
        ctx.fill();
        // 旭日图：文件夹加外圈描边，区分线性树
        if (s.layoutMode === 'radial' && node.isFolder) {
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ★ Focus target 光环
        if (isFocusedTarget) {
            ctx.save();
            ctx.beginPath(); ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 3;
            ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 14;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,235,59,0.15)'; ctx.fill();
            ctx.restore();
        }

        if (ms) ctx.restore();
        if (t._hovered && t._hovered.path === node.path) ctx.restore();

        // ── 选中环（纯描边，无填充，避免多圈）──
        if (t._selected.has(node.path)) {
            ctx.save();
            ctx.beginPath(); ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
        }

        if (node.isFolder) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke(); }

        // ── 当前搜索匹配 ──
        if (ms) {
            var ic = t._currentMatchPath === node.path;
            ctx.beginPath(); ctx.arc(node.x, node.y, r + (ic ? 5 : 4), 0, Math.PI * 2);
            ctx.strokeStyle = ic ? '#fff' : '#ffeb3b'; ctx.lineWidth = ic ? 3 : 2.5; ctx.stroke();
        }

        // ── 标签文字 ──
        var lb = node.name; if (lb.length > 18) lb = lb.slice(0, 17) + '...';
        ctx.font = (node.isFolder ? 'bold ' : '') + '11px sans-serif';
        var isRadialText = s.layoutMode === 'radial' && t._radialCx;
        if (isRadialText && node !== t._treeRoot) {
            var angle = node._midAngle || 0;
            // ★ 始终显示旋转标签，不管密度
            ctx.save();
            ctx.translate(node.x, node.y);
            if (node.x >= t._radialCx) {
                ctx.rotate(angle); ctx.textAlign = 'left';
                ctx.fillStyle = searchDim ? 'rgba(255,255,255,0.3)' : t._cachedTextColor;
                ctx.textBaseline = 'middle'; ctx.fillText(lb, r + 5, 0);
            } else {
                ctx.rotate(angle + Math.PI); ctx.textAlign = 'right';
                ctx.fillStyle = searchDim ? 'rgba(255,255,255,0.3)' : t._cachedTextColor;
                ctx.textBaseline = 'middle'; ctx.fillText(lb, -r - 5, 0);
            }
            ctx.restore();
            // 文件计数
            if (node.isFolder && node._fileCount > 0 && node.path !== '/') {
                var cntTextR = '(' + node._fileCount + ')';
                ctx.font = '9px sans-serif';
                ctx.fillStyle = searchDim ? 'rgba(255,255,255,0.2)' : t._cachedTextFaint;
                ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
                ctx.fillText(cntTextR, node.x, node.y + r + 10);
                ctx.textAlign = 'start';
            }
        } else {
            ctx.fillStyle = searchDim ? 'rgba(255,255,255,0.3)' : t._cachedTextColor;
            ctx.textBaseline = 'middle'; ctx.fillText(lb, node.x + r + 5, node.y);
            if (node.isFolder && node._fileCount > 0 && node.path !== '/') {
                var cntText = '(' + node._fileCount + ')';
                var lbW = ctx.measureText(lb).width;
                ctx.font = '10px sans-serif';
                ctx.fillStyle = searchDim ? 'rgba(255,255,255,0.25)' : t._cachedTextFaint;
                ctx.fillText(cntText, node.x + r + 5 + lbW + 4, node.y);
            }
        }

        // ── 折叠指示 ──
        if (node.isFolder && node.children && node.children.length > 0) {
            ctx.font = 'bold 10px monospace'; ctx.fillStyle = node.color || '#888';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(node.expanded ? '-' : '+', node.x, node.y);
            ctx.textAlign = 'start';
        }
        if (node.isFolder && node.expanded && node.children) for (var i = 0; i < node.children.length; i++) this._drawNodes(node.children[i], ctx);
    };

    // ── 小地图 ──

    CollapseTreeView.prototype._drawMinimap = function () {
        var t = this;
        if (!t._minimapCanvas || !t._treeRoot) { return; }
        var mc = t._minimapCanvas, mctx = mc.getContext('2d');
        var mw = mc.clientWidth || mc.offsetWidth || 280;
        var mh = mc.clientHeight || mc.offsetHeight || 160;
        if (mw < 4 || mh < 4) return;
        mc.width = mw; mc.height = mh;
        // ★ 确保树已布局
        if (t._treeRoot.x === 0 && t._treeRoot.y === 0) {
            t._layout(t._treeRoot);
            t._position(t._treeRoot, 60, Math.max(600, t._treeRoot.sw / 2 + 100));
        }
        var b = t._bounds(t._treeRoot, null);
        var nw = b.Mx - b.mx, nh = b.My - b.my;
        if (nw < 10) nw = 10; if (nh < 10) nh = 10;
        var scale = Math.min(mw / nw, mh / nh) * 0.9;
        var ox = (mw - nw * scale) / 2 - b.mx * scale;
        var oy = (mh - nh * scale) / 2 - b.my * scale;
        mctx.clearRect(0, 0, mw, mh);
        // ★ 透明背景
        mctx.strokeStyle = 'rgba(255,255,255,0.15)'; mctx.lineWidth = 1;
        mctx.strokeRect(0.5, 0.5, mw - 1, mh - 1);
        // 绘制连线
        (function drawLines(node) {
            if (!node.isFolder || !node.expanded || !node.children) return;
            for (var i = 0; i < node.children.length; i++) {
                var c = node.children[i];
                mctx.beginPath();
                mctx.moveTo(node.x * scale + ox, node.y * scale + oy);
                mctx.lineTo(c.x * scale + ox, c.y * scale + oy);
                mctx.strokeStyle = 'rgba(255,255,255,0.15)'; mctx.lineWidth = 0.5; mctx.stroke();
                if (c.isFolder) drawLines(c);
            }
        })(t._treeRoot);
        // 绘制节点
        (function drawNodes(node) {
            var r = Math.max(1.5, (node.isFolder ? 4 : 3) * scale);
            mctx.beginPath();
            mctx.arc(node.x * scale + ox, node.y * scale + oy, r, 0, Math.PI * 2);
            mctx.fillStyle = node.color || '#666'; mctx.fill();
            if (node.isFolder && node.expanded && node.children)
                for (var i = 0; i < node.children.length; i++) drawNodes(node.children[i]);
        })(t._treeRoot);
        // 绘制视口矩形
        var sa = t._scrollArea || t.containerEl;
        var vx = sa.scrollLeft, vy = sa.scrollTop;
        var vw = sa.clientWidth || 1, vh = sa.clientHeight || 1;
        var rx = (vx / t._zoom) * scale + ox;
        var ry = (vy / t._zoom) * scale + oy;
        var rw = Math.max(8, (vw / t._zoom) * scale);
        var rh = Math.max(8, (vh / t._zoom) * scale);
        // 限制在画布内
        rx = Math.max(0, Math.min(mw - rw, rx));
        ry = Math.max(0, Math.min(mh - rh, ry));
        mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 2;
        mctx.strokeRect(rx, ry, rw, rh);
        mctx.fillStyle = 'rgba(255,255,255,0.15)'; mctx.fillRect(rx, ry, rw, rh);
    };

    // ── 拖拽幽灵 ──

    CollapseTreeView.prototype._drawDragGhost = function (ctx) {
        var t = this, s = t.plugin.settings, ns = s.nodeSize || 8;
        if (!t._dragNodes.length) return;
        ctx.save(); ctx.globalAlpha = 0.55;
        var ox = t._dragWorldX - t._dragStartWX, oy = t._dragWorldY - t._dragStartWY;
        for (var i = 0; i < t._dragNodes.length; i++) {
            var sn = t._findNodeByPath(t._treeRoot, t._dragNodes[i]);
            if (!sn) continue;
            var r = sn.isFolder ? ns + 4 : ns, gx = sn.x + ox, gy = sn.y + oy;
            ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fillStyle = sn.color || '#666'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
    };

    // ── Hit test ──

    CollapseTreeView.prototype._hitTest = function (wx, wy) {
        var r = null, t = this;
        (function ht(node) {
            if (!node) return false;
            if (node.isFolder && node.children) for (var i = 0; i < node.children.length; i++) { if (ht.call(t, node.children[i])) return true; }
            if (r) return true;
            var ns = t.plugin.settings.nodeSize || 8, rad = node.isFolder ? ns + 4 : ns + 2;
            if ((wx - node.x) * (wx - node.x) + (wy - node.y) * (wy - node.y) < rad * rad) { r = node; return true; }
            return false;
        }).call(this, this._treeRoot);
        return r;
    };

    // ── 查找放置目标 ──

    CollapseTreeView.prototype._findDropTarget = function (wx, wy) {
        var t = this, target = null, s = t.plugin.settings, ns = s.nodeSize || 8;
        (function walk(node) {
            if (!node || target) return;
            if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
            if (!node.isFolder) return;
            var rad = ns + 12;
            if ((wx - node.x) * (wx - node.x) + (wy - node.y) * (wy - node.y) < rad * rad) {
                var ok = true;
                var cp = t._dragNodes.length ? t._dragNodes : (t._mouseDownNode ? [t._mouseDownNode.path] : []);
                for (var di = 0; di < cp.length; di++) {
                    var dp = cp[di];
                    if (dp === node.path) { ok = false; break; }
                    if (node.path.startsWith(dp + '/')) { ok = false; break; }
                    if (dp.startsWith(node.path + '/')) { ok = false; break; }
                }
                if (ok) target = node;
            }
        })(t._treeRoot);
        return target;
    };

    // ═══ 多选操作 ═══

    CollapseTreeView.prototype._updateSelInfo = function () {
        var s = this._selected.size;
        if (s > 0) { this._selInfoEl.style.display = ''; this._selInfoEl.setText('已选 ' + s + ' 项'); this._deselBtn.style.display = ''; this._batDelBtn.style.display = ''; }
        else { this._selInfoEl.style.display = 'none'; this._deselBtn.style.display = 'none'; this._batDelBtn.style.display = 'none'; }
    };

    CollapseTreeView.prototype._clearSelection = function () {
        this._selected.clear(); this._lastClickedPath = null; this._updateSelInfo(); this._redraw();
    };

    CollapseTreeView.prototype._rangeSelect = function (fromPath, toPath) {
        var t = this;
        var fn = t._findNodeByPath(t._treeRoot, fromPath), tn = t._findNodeByPath(t._treeRoot, toPath);
        if (!fn || !tn) return;
        var fp = t._findParent(t._treeRoot, fromPath), rp = t._findParent(t._treeRoot, toPath);
        if (!fp || !rp || fp.path !== rp.path) return;
        var sib = fp.expanded && fp.children ? fp.children : [], fi = -1, ti = -1;
        for (var i = 0; i < sib.length; i++) { if (sib[i].path === fromPath) fi = i; if (sib[i].path === toPath) ti = i; }
        if (fi < 0 || ti < 0) return;
        if (fi > ti) { var tmp = fi; fi = ti; ti = tmp; }
        for (var j = fi; j <= ti; j++) t._selected.add(sib[j].path);
        t._lastClickedPath = toPath;
    };

    CollapseTreeView.prototype._batchDelete = function () {
        var t = this;
        if (t._selected.size === 0) return;
        var paths = []; t._selected.forEach(function (p) { paths.push(p); });
        var M = require('obsidian').Modal, m = new M(t.app);
        m.titleEl.setText('批量删除');
        m.contentEl.createEl('p', { text: '确定删除 ' + paths.length + ' 个项目？此操作不可撤销。', cls: 'setting-item-description' });
        var row = m.contentEl.createDiv(); row.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end';
        row.createEl('button', { text: '取消' }).addEventListener('click', function () { m.close(); });
        var db = row.createEl('button', { text: '删除全部' }); db.style.cssText = 'background:#d32f2f;color:#fff;border:none;padding:6px 16px;border-radius:4px;';
        db.addEventListener('click', function () {
            var prs = [];
            for (var i = 0; i < paths.length; i++) { var f = t.app.vault.getAbstractFileByPath(paths[i]); if (f) prs.push(t.app.vault.trash(f)); }
            Promise.all(prs).then(function () { t._selected.clear(); t._updateSelInfo(); t.rebuild(); });
            m.close();
        });
        m.open();
    };

    // ═══ 拖拽移动 ═══

    CollapseTreeView.prototype._doMove = function (targetFolderPath, pts) {
        var t = this;
        if (!pts || !pts.length) return;
        // ★ 保存撤销状态
        var undoItem = { targetFolder: targetFolderPath, paths: pts.slice(), oldPaths: pts.slice() };
        t._undoStack = t._undoStack || [];
        t._undoStack.push(undoItem);
        if (t._undoStack.length > 20) t._undoStack.shift();
        var prs = [];
        for (var i = 0; i < pts.length; i++) {
            (function (idx) {
                var f = t.app.vault.getAbstractFileByPath(pts[idx]); if (!f) return;
                var name = f.name, tgt = targetFolderPath === '/' ? '' : targetFolderPath;
                var np = tgt ? tgt + '/' + name : name;
                var base = name, ext = '';
                if (!f.children) { var dot = base.lastIndexOf('.'); if (dot > 0) { ext = base.slice(dot); base = base.slice(0, dot); } }
                var c = 1;
                while (t.app.vault.getAbstractFileByPath(np)) { np = tgt ? tgt + '/' + base + ' ' + c + ext : base + ' ' + c + ext; c++; }
                prs.push(t.app.vault.rename(f, np));
            })(i);
        }
        Promise.all(prs).then(function () { t._selected.clear(); t._dragNodes = []; t._dropTarget = null; t._updateSelInfo(); if (t._undoBtn && t._undoStack && t._undoStack.length) t._undoBtn.style.display = ''; t.rebuild(); }).catch(function (err) { console.error('Collapse Tree: move failed', err); t._undoStack.pop(); t.rebuild(); });
    };

    // ═══ 树查找辅助 ═══

    CollapseTreeView.prototype._findNodeByPath = function (node, path) {
        if (!node) return null;
        if (node.path === path) return node;
        if (node.children) for (var i = 0; i < node.children.length; i++) { var r = this._findNodeByPath(node.children[i], path); if (r) return r; }
        return null;
    };

    CollapseTreeView.prototype._findParent = function (node, path) {
        if (!node || !node.children) return null;
        for (var i = 0; i < node.children.length; i++) { if (node.children[i].path === path) return node; var r = this._findParent(node.children[i], path); if (r) return r; }
        return null;
    };

    // ── Tooltip ──

    CollapseTreeView.prototype._updateTooltip = function (e) {
        if (this._hovered) {
            var txt = this._hovered.path;
            if (this._selected.has(this._hovered.path)) txt = '✓ ' + txt;
            this._tooltip.setText(txt); this._tooltip.style.left = (e.clientX + 14) + 'px'; this._tooltip.style.top = (e.clientY + 14) + 'px'; this._tooltip.addClass('is-visible');
        } else { this._tooltip.removeClass('is-visible'); }
    };

    CollapseTreeView.prototype._triggerHoverPreview = function (node) {
        var t = this;
        if (!node || node.isFolder) return;
        var he = t.app.plugins.plugins['obsidian-hover-editor'];
        if (!he) return; // hover-editor 未安装
        var f = t.app.vault.getAbstractFileByPath(node.path);
        if (!f || f.children) return;
        // 保存当前 hover-editor 位置
        var prevEl = document.querySelector('.hover-editor');
        if (prevEl) {
            var r = prevEl.getBoundingClientRect();
            t._hoverPrevPos = { left: r.left, top: r.top };
        }
        // 打开 hover-editor
        try {
            if (t._hoverLeaf && t._hoverLeaf.view && t._hoverLeaf.view.containerEl && t._hoverLeaf.view.containerEl.isConnected) {
                t._hoverLeaf.openFile(f);
            } else if (he.spawnPopover) {
                var orig = he.settings.autoPin;
                he.settings.autoPin = 'always';
                t._hoverLeaf = he.spawnPopover();
                he.settings.autoPin = orig;
                if (t._hoverLeaf) t._hoverLeaf.openFile(f);
            }
            // 恢复上次位置
            if (t._hoverPrevPos) {
                setTimeout(function () {
                    var el = document.querySelector('.hover-editor');
                    if (el) {
                        el.style.position = 'fixed';
                        el.style.left = t._hoverPrevPos.left + 'px';
                        el.style.top = t._hoverPrevPos.top + 'px';
                        el.style.transform = 'none';
                        el.style.right = 'auto';
                        el.style.bottom = 'auto';
                    }
                }, 50);
            }
        } catch(e) {}
    };

    // ═══ 搜索增强 ═══

    CollapseTreeView.prototype._runFulltextSearch = async function () {
        var t = this, q = t._searchQuery;
        if (!q) { t._fulltextMatches = null; return; }
        var ql = q.toLowerCase();
        // 缓存：同查询不重复扫描
        if (t._fulltextCacheKey === ql && t._fulltextMatches) return;
        t._fulltextCacheKey = ql;
        t._fulltextPending = true;
        var files = t.app.vault.getMarkdownFiles();
        var matches = new Set();
        for (var i = 0; i < files.length; i++) {
            try {
                var content = await t.app.vault.read(files[i]);
                if (content.toLowerCase().indexOf(ql) >= 0) matches.add(files[i].path);
            } catch (e) {}
        }
        t._fulltextMatches = matches;
        t._fulltextPending = false;
        t._updateSearchCount();
        t.render();
    };

    CollapseTreeView.prototype._matchSearch = function (node) {
        var t = this, q = t._searchQuery;
        if (!q) return false;
        var mode = t._searchMode || 'normal';
        if (mode === 'normal') {
            return node.name.toLowerCase().indexOf(q.toLowerCase()) >= 0;
        }
        if (mode === 'regex') {
            try { return new RegExp(q).test(node.name); } catch (e) { return false; }
        }
        if (mode === 'ext') {
            var exts = q.toLowerCase().split(/[,;，；\s]+/).filter(Boolean);
            var dot = node.name.lastIndexOf('.');
            if (dot < 0) return false;
            var fe = node.name.slice(dot).toLowerCase();
            for (var i = 0; i < exts.length; i++) {
                var e = exts[i]; if (e[0] !== '.') e = '.' + e;
                if (fe === e) return true;
            }
            return false;
        }
        if (mode === 'fm') {
            if (node.isFolder) return false;
            var f = t.app.vault.getAbstractFileByPath(node.path);
            if (!f || !(f instanceof TFile)) return false;
            var cache = t.app.metadataCache.getFileCache(f);
            if (!cache || !cache.frontmatter) return false;
            var fm = cache.frontmatter, ql = q.toLowerCase();
            for (var key in fm) {
                if (fm.hasOwnProperty(key)) {
                    var v = fm[key];
                    if (String(key).toLowerCase().indexOf(ql) >= 0) return true;
                    if (v !== null && v !== undefined && String(v).toLowerCase().indexOf(ql) >= 0) return true;
                }
            }
            return false;
        }
        if (mode === 'fulltext') {
            if (t._fulltextPending) return false;
            return t._fulltextMatches ? t._fulltextMatches.has(node.path) : false;
        }
        return false;
    };

    CollapseTreeView.prototype._collectSearchMatches = function (node, r) {
        if (this._matchSearch(node)) r.push(node);
        if (node.children) for (var i = 0; i < node.children.length; i++) this._collectSearchMatches(node.children[i], r);
    };

    CollapseTreeView.prototype._updateSearchCount = function () {
        if (!this._treeRoot) return;
        var m = []; this._collectSearchMatches(this._treeRoot, m);
        this._searchMatchCount = m.length;
        if (this._searchQuery && this._searchMatchCount > 0) {
            this._searchCountEl.style.display = '';
            var cur = this._searchMatchIndex >= 0 ? (this._searchMatchIndex + 1) : 0;
            this._searchCountEl.setText('匹配 ' + cur + '/' + this._searchMatchCount);
        } else if (this._searchQuery) {
            this._searchCountEl.style.display = ''; this._searchCountEl.setText('匹配 0/0');
        } else {
            this._searchCountEl.style.display = 'none';
        }
        // 同步面板内计数
        var inlineEl = this._settingsPanel?.querySelector('#ct-search-count-inline');
        if (inlineEl) {
            if (this._searchQuery && this._searchMatchCount > 0) {
                inlineEl.style.display = '';
                inlineEl.textContent = (this._searchMatchIndex >= 0 ? (this._searchMatchIndex + 1) : 0) + '/' + this._searchMatchCount;
            } else {
                inlineEl.style.display = 'none';
            }
        }
    };

    CollapseTreeView.prototype._navigateSearch = function () {
        if (!this._searchQuery) return;
        // 首次导航时保存搜索历史
        if (this._searchMatchIndex < 0) {
            var h = this._searchHistory, qi = h.indexOf(this._searchQuery);
            if (qi >= 0) h.splice(qi, 1);
            h.unshift(this._searchQuery);
            if (h.length > this._maxSearchHistory) h.length = this._maxSearchHistory;
        }
        var m = []; this._collectSearchMatches(this._treeRoot, m);
        if (!m.length) return;
        this._searchMatchIndex = (this._searchMatchIndex + 1) % m.length;
        this._scrollToMatch(m);
    };

    CollapseTreeView.prototype._navigateSearchPrev = function () {
        if (!this._searchQuery) return;
        var m = []; this._collectSearchMatches(this._treeRoot, m);
        if (!m.length) return;
        this._searchMatchIndex = this._searchMatchIndex <= 0 ? m.length - 1 : this._searchMatchIndex - 1;
        this._scrollToMatch(m);
    };

    CollapseTreeView.prototype._scrollToMatch = function (m) {
        var t = m[this._searchMatchIndex];
        this._currentMatchPath = t.path;
        this._updateSearchCount();
        if (typeof t.x !== 'number' || isNaN(t.x)) return;
        var c = this._scrollArea || this.containerEl;
        // ★ 居中目标节点，偏移 80px 防止被面板遮挡
        var offsetX = this._settingsVisible ? 160 : 80;
        var tx = Math.max(0, t.x * this._zoom - c.clientWidth / 2 + offsetX);
        var ty = Math.max(0, t.y * this._zoom - c.clientHeight / 2);
        c.scrollTo({ left: tx, top: ty, behavior: 'smooth' });
        this._redraw();
        // ★ 搜索导航联动 hover-editor 预览
        if (!t.isFolder && this.plugin.settings.enableHoverPreview) {
            this._triggerHoverPreview(t);
        }
    };

    CollapseTreeView.prototype._showSearchHistory = function () {
        if (!this._searchHistory.length) { this._searchHistEl.style.display = 'none'; return; }
        var el = this._searchHistEl; el.empty();
        var t = this;
        for (var i = 0; i < this._searchHistory.length; i++) {
            (function (h) {
                var row = el.createDiv(); row.setText(h);
                row.style.cssText = 'padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;';
                row.addEventListener('mouseenter', function () { this.style.background = 'var(--background-modifier-hover)'; });
                row.addEventListener('mouseleave', function () { this.style.background = ''; });
                row.addEventListener('mousedown', function (e) { e.preventDefault();
                    t._searchInput.value = h; t._searchQuery = h; t._searchMatchIndex = -1; t._currentMatchPath = null;
                    t._updateSearchCount(); t.render(); t._searchHistEl.style.display = 'none';
                });
            })(this._searchHistory[i]);
        }
        var rect = this._searchInput.getBoundingClientRect();
        el.style.left = (rect.left - 60) + 'px';
        el.style.top = (rect.bottom + 4) + 'px';
        el.style.width = Math.max(rect.width + 60, 180) + 'px';
        el.style.display = 'block';
    };

    // ── CRUD ──

    CollapseTreeView.prototype._createFile = function (fp, ext) {
        var t = this, f = t.app.vault.getAbstractFileByPath(fp);
        if (!f || !f.children) return;
        ext = ext || '.md';
        var bnMap = { '.md': '未命名', '.canvas': '白板', '.excalidraw': '绘图' };
        var bn = bnMap[ext] || '未命名';
        var p = fp === '/' ? '' : fp, n = bn + ext, full = p ? p + '/' + n : n, c = 1;
        while (t.app.vault.getAbstractFileByPath(full)) { n = bn + ' ' + c + ext; full = p ? p + '/' + n : n; c++; }
        var ct = ext === '.canvas' ? '{"nodes":[],"edges":[]}' : (ext === '.excalidraw' ? '{"type":"excalidraw","version":2,"elements":[],"appState":{}}' : '');
        t.app.vault.create(full, ct).then(function () { t._expanded.add(fp); t.rebuild(); });
    };
    CollapseTreeView.prototype._createFolder = function (pp) {
        var t = this, f = t.app.vault.getAbstractFileByPath(pp);
        if (!f || !f.children) return;
        var p = pp === '/' ? '' : pp, n = '新建文件夹', full = p ? p + '/' + n : n, c = 1;
        while (t.app.vault.getAbstractFileByPath(full)) { n = '新建文件夹 ' + c; full = p ? p + '/' + n : n; c++; }
        t.app.vault.createFolder(full).then(function () { t._expanded.add(pp); t.rebuild(); });
    };
    CollapseTreeView.prototype._rename = function (fp) {
        var t = this, f = t.app.vault.getAbstractFileByPath(fp), old = f.name;
        if (!f) return;
        var M = require('obsidian').Modal, m = new M(t.app);
        m.titleEl.setText('重命名');
        var c = m.contentEl;
        c.createEl('p', { text: '当前: ' + old, cls: 'setting-item-description' });
        var inp = c.createEl('input', { type: 'text', value: old }); inp.style.width = '100%';
        var row = c.createDiv(); row.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end';
        row.createEl('button', { text: '取消' }).addEventListener('click', function () { m.close(); });
        var ob = row.createEl('button', { text: '确认' }); ob.style.cssText = 'background:var(--interactive-accent);color:#fff;border:none';
        ob.addEventListener('click', function () { var nn = inp.value.trim(); if (!nn || nn === old) { m.close(); return; } var d = fp.slice(0, fp.lastIndexOf('/') + 1); t.app.vault.rename(f, d + nn).then(function () { t.rebuild(); }); m.close(); });
        inp.addEventListener('keydown', function (ke) { if (ke.key === 'Enter') ob.click(); if (ke.key === 'Escape') m.close(); });
        m.open(); setTimeout(function () { inp.focus(); inp.select(); }, 50);
    };
    CollapseTreeView.prototype._delete = function (fp) {
        var t = this, f = t.app.vault.getAbstractFileByPath(fp), isF = !!f.children;
        if (!f) return;
        var M = require('obsidian').Modal, m = new M(t.app);
        m.titleEl.setText('确认删除');
        var c = m.contentEl;
        c.createEl('p', { text: '删除' + (isF ? '文件夹' : '文件') + ' "' + f.name + '"？' });
        if (isF && f.children) c.createEl('p', { text: '包含 ' + f.children.length + ' 个项目', cls: 'setting-item-description' });
        var row = c.createDiv(); row.style.cssText = 'margin-top:14px;display:flex;gap:8px;justify-content:flex-end';
        row.createEl('button', { text: '取消' }).addEventListener('click', function () { m.close(); });
        var db = row.createEl('button', { text: '删除' }); db.style.cssText = 'background:#d32f2f;color:#fff;border:none';
        db.addEventListener('click', function () { t.app.vault.trash(f).then(function () { t.rebuild(); }); m.close(); });
        m.open();
    };
    CollapseTreeView.prototype._showInExplorer = function (fp) {
        try {
            var fullPath = this.app.vault.adapter.getFullPath(fp);
            var { shell } = require('electron');
            shell.showItemInFolder(fullPath);
        } catch (e) {
            // 桌面端用 Electron，移动端不支持则降级为复制路径
            navigator.clipboard.writeText(fp);
        }
    };

    CollapseTreeView.prototype._jumpSibling = function (fp, dir) {
        var node = this._findNodeByPath(this._treeRoot, fp);
        if (!node) return;
        var parent = this._findParent(this._treeRoot, fp);
        if (!parent || !parent.children) return;
        var idx = -1;
        for (var i = 0; i < parent.children.length; i++) { if (parent.children[i].path === fp) { idx = i; break; } }
        if (idx < 0) return;
        var newIdx = dir === 'next' ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= parent.children.length) return;
        var sn = parent.children[newIdx];
        if (typeof sn.x !== 'number' || isNaN(sn.x)) return;
        this._lastClickedPath = sn.path;
        this._selected.clear(); this._selected.add(sn.path);
        this._updateSelInfo(); this._updateSibLabel();
        var t = this, sa = this._scrollArea || this.containerEl;
        var tx = Math.max(0, sn.x * this._zoom - sa.clientWidth / 2);
        var ty = Math.max(0, sn.y * this._zoom - sa.clientHeight / 2);
        sa.scrollTo({ left: tx, top: ty, behavior: 'smooth' });
        this._redraw();
        // 模拟鼠标移到目标节点，触发自然 hover
        setTimeout(function () {
            var rect = t._canvas.getBoundingClientRect();
            var sx = rect.left + sn.x * t._zoom + 5;
            var sy = rect.top + sn.y * t._zoom + 5;
            t._canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
        }, 500);
    };

    // ★ 面板同级导航：使用最后点击的节点作为参考
    CollapseTreeView.prototype._jumpSiblingFromPanel = function (dir) {
        var t = this, fp = t._lastClickedPath;
        if (!fp) {
            var af = t.app.workspace.activeLeaf && t.app.workspace.activeLeaf.view && t.app.workspace.activeLeaf.view.file;
            if (af) fp = af.path;
        }
        if (!fp) {
            t.app.workspace.iterateAllLeaves(function (leaf) {
                if (!fp && leaf.view && leaf.view.file) fp = leaf.view.file.path;
            });
        }
        if (!fp) return;
        t._lastClickedPath = fp;
        t._jumpSibling(fp, dir);
        t._updateSibLabel();
    };

    CollapseTreeView.prototype._openCurrentRefNode = function () {
        var fp = this._lastClickedPath;
        if (!fp) {
            var af = this.app.workspace.activeLeaf && this.app.workspace.activeLeaf.view && this.app.workspace.activeLeaf.view.file;
            if (af) fp = af.path;
        }
        if (!fp) return;
        var f = this.app.vault.getAbstractFileByPath(fp);
        if (f && !f.children) this.app.workspace.getLeaf(false).openFile(f);
    };

    CollapseTreeView.prototype._updateSibLabel = function () {
        var el = this._sibLabelEl;
        if (!el) return;
        var fp = this._lastClickedPath;
        if (!fp) {
            var af = this.app.workspace.activeLeaf && this.app.workspace.activeLeaf.view && this.app.workspace.activeLeaf.view.file;
            if (af) fp = af.path;
        }
        if (fp) {
            var name = fp.split('/').pop();
            if (name.length > 50) name = name.slice(0, 49) + '…';
            el.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' + name;
        } else {
            el.innerHTML = '';
        }
    };

    CollapseTreeView.prototype._cutSelected = function () {
        this._clipboardPaths = [];
        this._selected.forEach(function (p) { this._clipboardPaths.push(p); }, this);
        this._clearSelection();
        this._updateSelInfo();
        this._redraw();
    };

    CollapseTreeView.prototype._pasteHere = function (destFolder) {
        var t = this;
        if (!t._clipboardPaths.length) return;
        var paths = t._clipboardPaths.slice();
        t._clipboardPaths = [];
        t._doMove(destFolder, paths);
    };

    CollapseTreeView.prototype._undo = function () {
        var t = this;
        if (!t._undoStack || !t._undoStack.length) return;
        var item = t._undoStack.pop();
        var tgt = item.targetFolder === '/' ? '' : item.targetFolder;
        var prs = [];
        for (var i = 0; i < item.oldPaths.length; i++) {
            (function (idx) {
                var oldPath = item.oldPaths[idx];
                var oldName = oldPath.split('/').pop();
                var newPath = tgt ? tgt + '/' + oldName : oldName;
                // ★ 先找精确路径，只有找不到才搜碰撞后缀
                var f = t.app.vault.getAbstractFileByPath(newPath);
                if (!f) {
                    var base = oldName, ext = '';
                    var dot = base.lastIndexOf('.');
                    if (dot > 0) { ext = base.slice(dot); base = base.slice(0, dot); }
                    var c = 1;
                    while (!f && c <= 20) {
                        var cp = tgt ? tgt + '/' + base + ' ' + c + ext : base + ' ' + c + ext;
                        f = t.app.vault.getAbstractFileByPath(cp); c++;
                    }
                }
                if (!f) return;
                var oldParent = oldPath.substring(0, oldPath.lastIndexOf('/'));
                var restorePath = oldParent ? oldParent + '/' + oldName : oldName;
                if (t.app.vault.getAbstractFileByPath(restorePath)) {
                    var rb = oldName, re = '';
                    var rd = rb.lastIndexOf('.');
                    if (rd > 0) { re = rb.slice(rd); rb = rb.slice(0, rd); }
                    restorePath = oldParent ? oldParent + '/' + rb + ' (已恢复)' + re : rb + ' (已恢复)' + re;
                }
                prs.push(t.app.vault.rename(f, restorePath));
            })(i);
        }
        Promise.all(prs).then(function () { t.rebuild(); }).catch(function (err) { t._undoStack.push(item); t.rebuild(); });
        if (t._undoBtn) t._undoBtn.style.display = (t._undoStack && t._undoStack.length) ? '' : 'none';
    };

    CollapseTreeView.prototype._viewDetails = function (fp) {
        var f = this.app.vault.getAbstractFileByPath(fp);
        if (!f) return;
        var M = require('obsidian').Modal, m = new M(this.app);
        m.titleEl.setText('节点详情');
        var c = m.contentEl;
        function ar(l, v) { var tr = c.createEl('tr'); tr.createEl('td').style.cssText = 'padding:4px 8px;color:var(--text-muted)'; tr.firstChild.setText(l); tr.createEl('td').style.cssText = 'padding:4px 8px;word-break:break-all'; tr.lastChild.setText(v); }
        ar('名称', f.name); ar('路径', f.path);
        if (!f.children) { ar('类型', (f.extension || '') + ' 文件'); if (f.stat) { ar('大小', _fs(f.stat.size || 0)); ar('修改', _fd(f.stat.mtime)); ar('创建', _fd(f.stat.ctime)); } var cache = this.app.metadataCache.getFileCache(f); if (cache) { ar('出链', (cache.links || []).length + ' 个'); ar('嵌入', (cache.embeds || []).length + ' 个'); } }
        else { ar('类型', '文件夹'); ar('包含', (f.children ? f.children.length : 0) + ' 个项目'); }
        var row = c.createDiv(); row.style.cssText = 'margin-top:14px;text-align:right';
        row.createEl('button', { text: '关闭' }).addEventListener('click', function () { m.close(); });
        m.open();
    };

    // ── Layout save ──

    CollapseTreeView.prototype._saveLayout = function () {
        var p = []; this._expanded.forEach(function (v) { p.push(v); });
        this.plugin.settings.expandedPaths = p;
        this.plugin.saveData(this.plugin.settings);
    };
    CollapseTreeView.prototype._loadLayout = function () {
        var p = this.plugin.settings.expandedPaths;
        if (p && p.length) for (var i = 0; i < p.length; i++) this._expanded.add(p[i]);
    };

    // ── Focus Mode ──

    CollapseTreeView.prototype._syncPanelButtons = function () {
        var p = this._settingsPanel;
        if (!p) return;
        var fb = p.querySelector('#ct-focus-panel-btn');
        if (fb) fb.classList.toggle('ct-active', this._focusMode);
        var rb = p.querySelector('#ct-radial-panel-btn');
        if (rb) rb.classList.toggle('ct-active', this.plugin.settings.layoutMode === 'radial');
    };

    CollapseTreeView.prototype._toggleRadialLayout = function () {
        var s = this.plugin.settings;
        s.layoutMode = s.layoutMode === 'radial' ? 'linear' : 'radial';
        this.plugin.saveSettings();
        this._zoom = 1;
        this._scrollArea.scrollLeft = 0;
        this._scrollArea.scrollTop = 0;
        this.rebuild();
        this._syncPanelButtons();
    };

    CollapseTreeView.prototype._toggleFocusMode = function () {
        var t = this;
        t._focusMode = !t._focusMode;
        if (t._focusMode) {
            t._savedExpanded = new Set(t._expanded);
            // ★ 优先取活跃叶子文件，否则遍历所有叶子找任意已打开文件
            var af = null;
            var al = t.app.workspace.activeLeaf;
            if (al && al.view && al.view.file) af = al.view.file;
            if (!af) {
                t.app.workspace.iterateAllLeaves(function (leaf) {
                    if (!af && leaf.view && leaf.view.file) af = leaf.view.file;
                });
            }
            if (!af) { t._focusMode = false; t._savedExpanded = null; return; }
            t._applyFocus(af.path);
        } else {
            if (t._savedExpanded) t._expanded = t._savedExpanded;
            t._savedExpanded = null;
            t._focusPath = null;
            t._currentMatchPath = null;
            t.rebuild();
        }
        t._syncPanelButtons();
        t._saveLayout();
    };

    CollapseTreeView.prototype._applyFocus = function (filePath) {
        var t = this;
        t._expanded.clear();
        t._expanded.add('/');
        var parts = filePath.split('/');
        var accum = '';
        for (var i = 0; i < parts.length - 1; i++) {
            accum += (accum ? '/' : '') + parts[i];
            if (accum) t._expanded.add(accum);
        }
        t._focusPath = filePath;
        t.rebuild();
        setTimeout(function () { t._scrollToFocusedNode(); }, 150);
    };

    CollapseTreeView.prototype._scrollToFocusedNode = function () {
        var t = this;
        if (!t._focusPath) return;
        var node = t._findNodeByPath(t._treeRoot, t._focusPath);
        if (!node || typeof node.x !== 'number' || isNaN(node.x)) return;
        var sa = t._scrollArea || t.containerEl;
        var tx = Math.max(0, node.x * t._zoom - sa.clientWidth / 2 + 100);
        var ty = Math.max(0, node.y * t._zoom - sa.clientHeight / 2);
        sa.scrollTo({ left: tx, top: ty, behavior: 'smooth' });
        t._currentMatchPath = t._focusPath;
        t._redraw();
    };

    return CollapseTreeView;
})(ItemView);

// ── Helpers ──

function fc(fn) { var d = fn.lastIndexOf('.'), e = d >= 0 ? fn.slice(d).toLowerCase() : ''; var m = { '.md':'#7c8cf8','.canvas':'#f8a57c','.png':'#7cf8a5','.jpg':'#7cf8a5','.jpeg':'#7cf8a5','.gif':'#7cf8a5','.webp':'#7cf8a5','.svg':'#f8e47c','.pdf':'#f87c7c','.mp4':'#f87cf8','.mp3':'#f87cf8','.js':'#f8d77c','.ts':'#7cb8f8','.css':'#a57cf8','.json':'#7cf8d7','.excalidraw':'#f8b87c' }; return m[e] || '#888888'; }
var CP = ['#f28b82','#fbbc04','#34a853','#4285f4','#a142f4','#24c1e0','#ff6d01','#46bdc6','#7c8cf8','#f8a57c','#a57cf8','#7cf8a5','#f8d77c','#f87cf8','#f87c7c','#7cf8d7'];
function stc(node, d) { node.color = CP[d % CP.length]; if (node.children) for (var i = 0; i < node.children.length; i++) stc(node.children[i], d + 1); }
function _fs(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function _fd(ts) { if (!ts) return '-'; var d = new Date(ts); return d.getFullYear() + '-' + _p(d.getMonth()+1) + '-' + _p(d.getDate()) + ' ' + _p(d.getHours()) + ':' + _p(d.getMinutes()); }
function _p(n) { n = parseInt(n, 10); return isNaN(n) ? '00' : n < 10 ? '0' + n : '' + n; }
function heatColor(mtime, minT, maxT) { var ratio = (mtime - minT) / (maxT - minT); var hue = 240 * (1 - ratio); return 'hsl(' + Math.round(hue) + ', 75%, 50%)'; }
function folderHeatColor(mtime, minT, maxT) { var ratio = (mtime - minT) / (maxT - minT); var hue = 240 * (1 - ratio); return 'hsl(' + Math.round(hue) + ', 55%, 35%)'; }

// ── Settings ──

var CollapseTreeSettingTab = (function (_super) {
    function CollapseTreeSettingTab(app, pl) { var t = _super.call(this, app, pl) || this; t.plugin = pl; return t; }
    CollapseTreeSettingTab.prototype = Object.create(_super && _super.prototype);
    CollapseTreeSettingTab.prototype.constructor = CollapseTreeSettingTab;
    CollapseTreeSettingTab.prototype.display = function () {
        var t = this, c = this.containerEl; c.empty();
        c.createEl('h2', { text: 'Collapse Tree' });
        c.createEl('h3', { text: '布局' });
        new Setting(c).setName('布局模式').setDesc('线性树：左→右层级展开 | 旭日图：圆心辐射').addDropdown(function (d) { d.addOption('linear','线性树').addOption('radial','旭日图'); d.setValue(t.plugin.settings.layoutMode || 'linear'); d.onChange(function (v) { t.plugin.settings.layoutMode = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('排序').addDropdown(function (d) { d.addOption('name','名称').addOption('mtime','修改时间'); d.setValue(t.plugin.settings.sortOrder); d.onChange(function (v) { t.plugin.settings.sortOrder = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('节点大小(4-16)').addSlider(function (s) { s.setLimits(4,16,1).setValue(t.plugin.settings.nodeSize).setDynamicTooltip(); s.onChange(function (v) { t.plugin.settings.nodeSize = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('层级间距(60-200)').addSlider(function (s) { s.setLimits(60,200,10).setValue(t.plugin.settings.levelGap).setDynamicTooltip(); s.onChange(function (v) { t.plugin.settings.levelGap = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('兄弟间距(12-60)').addSlider(function (s) { s.setLimits(12,60,4).setValue(t.plugin.settings.siblingGap).setDynamicTooltip(); s.onChange(function (v) { t.plugin.settings.siblingGap = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('紧凑密度').setDesc('节点更紧凑排列，适合大库').addToggle(function (tg) { tg.setValue(t.plugin.settings.compactDensity); tg.onChange(function (v) { t.plugin.settings.compactDensity = v; t.plugin.saveSettings(); }); });
        c.createEl('h3', { text: '外观' });
        new Setting(c).setName('连线样式').addDropdown(function (d) { d.addOption('straight','直线').addOption('curved','曲线').addOption('dashed','虚线').addOption('dotted','点线'); d.setValue(t.plugin.settings.lineStyle); d.onChange(function (v) { t.plugin.settings.lineStyle = v; t.plugin.saveSettings(); }); });
        new Setting(c).setName('色彩模式').setDesc('热力图：红=最近修改，蓝=久未修改').addDropdown(function (d) { d.addOption('rainbow','彩虹（默认）').addOption('heatmap','热力图'); d.setValue(t.plugin.settings.colorMode); d.onChange(function (v) { t.plugin.settings.colorMode = v; t.plugin.saveSettings(); }); });
        c.createEl('h3', { text: '预览' });
        new Setting(c).setName('悬停预览').setDesc('鼠标悬停文件节点 0.35 秒，联动 hover-editor 预览内容').addToggle(function (tg) { tg.setValue(t.plugin.settings.enableHoverPreview); tg.onChange(function (v) { t.plugin.settings.enableHoverPreview = v; t.plugin.saveSettings(); }); });
        c.createEl('p', { text: 'Ctrl+点击多选 | Shift+范围选择 | 拖拽节点移动 | 中键拖拽画布 | Ctrl+滚轮缩放 | ［普通\|正则\|扩展名\|FM\|全文］搜索', cls: 'setting-item-description' });
    };
    return CollapseTreeSettingTab;
})(PluginSettingTab);

module.exports = CollapseTreePlugin;
