// ===== APP STATE =====
window.AppState = {
  tool: 'select',
  color: '#E8402A',
  size: 3,
  opacity: 1,
  loaded: false,
  pendingSignatureDataUrl: null,
};

// ===== THEME =====
const ThemeManager = {
  current: 'dark',
  init() {
    const saved = localStorage.getItem('pdfstudio-theme') || 'dark';
    this.set(saved);
  },
  set(theme) {
    this.current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pdfstudio-theme', theme);
  },
  toggle() { this.set(this.current === 'dark' ? 'light' : 'dark'); }
};

// ===== MAIN APP =====
const App = {
  _searchResults: [],
  _searchIdx: 0,
  _ctxPageNum: null,
  _ctxX: 0,
  _ctxY: 0,

  async init() {
    ThemeManager.init();
    SidebarManager.init();
    SigManager.init();
    this.bindLanding();
    this.bindToolbar();
    this.bindAnnotationTools();
    this.bindModals();
    this.bindSearch();
    this.bindContextMenu();
    this.bindKeyboard();
    this.bindDropdown();
    History.updateButtons();
  },

  // ===== LANDING =====
  bindLanding() {
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
      if (files.length > 1) this.handleMultipleFiles(files);
      else if (files.length === 1) this.loadFile(files[0]);
    });

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files);
      if (files.length > 1) this.handleMultipleFiles(files);
      else if (files.length === 1) this.loadFile(files[0]);
      fileInput.value = '';
    });

    $('openInput').addEventListener('change', () => {
      if ($('openInput').files[0]) this.loadFile($('openInput').files[0]);
      $('openInput').value = '';
    });
  },

  handleMultipleFiles(files) {
    PdfTools.initMerge();
    files.forEach(f => PdfTools.addMergeFile(f));
    openModal('modalMerge');
  },

  async loadFile(file) {
    const ok = await PdfEngine.loadFile(file);
    if (!ok) return;
    AppState.loaded = true;
    $('landing').classList.remove('active');
    $('app').classList.remove('hidden');
    await this.renderAll();

    const t = window._pendingTool;
    window._pendingTool = null;
    if (t === 'split') {
      openModal('modalSplit');
    } else if (t === 'compress') {
      $('cOrigSize').textContent = formatBytes(file.size);
      openModal('modalCompress');
    } else if (t === 'export-img') {
      openModal('modalExport');
    }
    showToast('✓ ' + file.name, 'success');
  },

  async renderAll() {
    const container = $('pdfContainer');
    container.innerHTML = '';
    DrawingManager.clearAll();
    AnnotationManager.clearAll();
    History.reset();

    await PdfEngine.renderAll(container);
    for (let i = 1; i <= PdfEngine.pageCount; i++) DrawingManager.setupLayer(i);

    $('totalPages').textContent = PdfEngine.pageCount;
    $('pageInput').max = PdfEngine.pageCount;
    $('pageInput').value = 1;
    PdfEngine.currentPage = 1;
    $('sbFile').textContent = PdfEngine.fileName;
    const bytes = PdfEngine.rawBytes;
    $('sbSize').textContent = formatBytes(bytes ? (bytes.byteLength || bytes.length || 0) : 0);

    // Viewer drop support
    $('viewerWrap').ondragover = e => e.preventDefault();
    $('viewerWrap').ondrop = e => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
      if (files.length) this.loadFile(files[0]);
    };

    await SidebarManager.buildThumbnails();
    await SidebarManager.buildOutline();
    await SidebarManager.buildInfo();
    SidebarManager.setActivePage(1);
    this.updatePageHighlight(1);
    this.setTool('select');
  },

  // ===== TOOLBAR =====
  bindToolbar() {
    $('btnHome').onclick = () => {
      if (!confirm('Return to home? Unsaved annotations will be lost.')) return;
      $('landing').classList.add('active');
      $('app').classList.add('hidden');
      AppState.loaded = false;
    };

    $('btnOpen').onclick = () => $('openInput').click();
    $('btnSave').onclick = () => PdfTools.saveCurrentFile();
    $('btnPrint').onclick = () => window.print();
    $('btnUndo').onclick = () => History.undo();
    $('btnRedo').onclick = () => History.redo();

    $('btnZoomIn').onclick = () => this.setZoom(PdfEngine.scale + 0.2);
    $('btnZoomOut').onclick = () => this.setZoom(PdfEngine.scale - 0.2);
    $('btnFitPage').onclick = () => this.fitPage();
    $('btnFitWidth').onclick = () => this.fitWidth();
    $('zoomDisplay').onclick = () => {
      const v = prompt('Zoom % (10–600):', Math.round(PdfEngine.scale * 100));
      if (v) { const n = parseFloat(v); if (!isNaN(n)) this.setZoom(n / 100); }
    };

    $('btnPrev').onclick = () => this.goToPage(PdfEngine.currentPage - 1);
    $('btnNext').onclick = () => this.goToPage(PdfEngine.currentPage + 1);
    if ($('btnFirst')) $('btnFirst').onclick = () => this.goToPage(1);
    if ($('btnLast')) $('btnLast').onclick = () => this.goToPage(PdfEngine.pageCount);
    $('pageInput').addEventListener('change', () => this.goToPage(parseInt($('pageInput').value)));

    if ($('btnToggleSidebar')) $('btnToggleSidebar').onclick = () => SidebarManager.toggle();
  },

  // ===== ANNOTATION TOOLS =====
  bindAnnotationTools() {
    // Tool toggle buttons
    $$('.ttoggle').forEach(btn => {
      btn.onclick = () => this.setTool(btn.dataset.tool);
    });

    // Color input
    const annotColor = $('annotColor');
    if (annotColor) {
      annotColor.addEventListener('input', e => {
        this.setColor(e.target.value);
      });
    }

    // Size slider
    const annotSize = $('annotSize');
    if (annotSize) {
      annotSize.addEventListener('input', e => {
        AppState.size = parseInt(e.target.value);
        DrawingManager.size = AppState.size;
      });
    }

    // Text popup buttons
    $('btnTpAdd').onclick = () => this.commitText();
    $('btnTpCancel').onclick = () => $('textPopup').classList.add('hidden');
    $('btnTpClose').onclick = () => $('textPopup').classList.add('hidden');

    // Viewer click
    $('viewerWrap').addEventListener('click', e => this.handleViewerClick(e));
    // Scroll -> current page
    $('viewerWrap').addEventListener('scroll', () => this.syncPageFromScroll(), { passive: true });
  },

  setColor(hex) {
    AppState.color = hex;
    DrawingManager.color = hex;
    const annotColor = $('annotColor');
    if (annotColor) annotColor.value = hex;
  },

  setTool(tool) {
    AppState.tool = tool;
    DrawingManager.tool = tool;

    $$('.ttoggle').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');

    // Show/hide shape options
    const shapeType = $('shapeType');
    const fillLbl = $('fillLbl');
    if (shapeType) shapeType.classList.toggle('hidden', tool !== 'shape');
    if (fillLbl) fillLbl.classList.toggle('hidden', tool !== 'shape');

    // Cursor class
    const wrap = $('viewerWrap');
    const cursors = { text:'text', draw:'crosshair', eraser:'cell', highlight:'crosshair',
      underline:'crosshair', strikethrough:'crosshair', shape:'crosshair', line:'crosshair',
      sticky:'copy', sign:'crosshair', select:'default' };
    if (wrap) wrap.style.cursor = cursors[tool] || 'default';

    // Enable draw layer for drawing tools
    const drawTools = ['draw','eraser','highlight','underline','strikethrough','shape','line'];
    DrawingManager.setPointerEvents(drawTools.includes(tool));

    // Enable annot layer pointer events for interactive tools
    const annotTools = ['select','text','sticky'];
    $$('.page-annot-layer').forEach(l => {
      l.style.pointerEvents = annotTools.includes(tool) ? 'auto' : 'none';
    });

    const sbTool = $('sbTool');
    if (sbTool) sbTool.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);

    // Sign tool: open modal if no pending signature
    if (tool === 'sign') {
      SigManager.open(PdfEngine.currentPage, 50, 50);
    }
  },

  handleViewerClick(e) {
    const wrapper = e.target.closest('.page-wrapper');
    if (!wrapper) return;
    const pageNum = parseInt(wrapper.dataset.page);
    if (!pageNum) return;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (AppState.tool === 'text') {
      const popup = $('textPopup');
      popup.classList.remove('hidden');
      const px = Math.min(e.clientX, window.innerWidth - 360);
      const py = Math.min(e.clientY + 8, window.innerHeight - 220);
      popup.style.left = px + 'px';
      popup.style.top = py + 'px';
      this._pendingTextPage = pageNum;
      this._pendingTextX = x;
      this._pendingTextY = y;
      $('tpText').focus();
    } else if (AppState.tool === 'sticky') {
      AnnotationManager.addSticky(pageNum, x, y);
    } else if (AppState.tool === 'sign' && AppState.pendingSignatureDataUrl) {
      SigManager._placeSig(AppState.pendingSignatureDataUrl);
      AppState.pendingSignatureDataUrl = null;
      this.setTool('select');
      showToast('✓ Signature placed', 'success');
    }
  },

  commitText() {
    const text = $('tpText').value.trim();
    if (!text) return;
    const pageNum = this._pendingTextPage || PdfEngine.currentPage;
    AnnotationManager.addText(pageNum, this._pendingTextX || 50, this._pendingTextY || 50, text, {
      size: parseInt($('tpSize').value) || 16,
      font: $('tpFont').value,
      color: $('tpColor').value || AppState.color,
      bg: $('tpBg') ? $('tpBg').checked : true,
    });
    $('textPopup').classList.add('hidden');
    $('tpText').value = '';
  },

  // ===== MODALS =====
  bindModals() {
    // Merge
    $('mergeInput').onchange = () => {
      Array.from($('mergeInput').files).forEach(f => PdfTools.addMergeFile(f));
      $('mergeInput').value = '';
    };
    const md = $('mergeZone');
    md.addEventListener('dragover', e => { e.preventDefault(); md.classList.add('drag-over'); });
    md.addEventListener('dragleave', () => md.classList.remove('drag-over'));
    md.addEventListener('drop', e => {
      e.preventDefault(); md.classList.remove('drag-over');
      Array.from(e.dataTransfer.files).filter(f=>f.name.endsWith('.pdf')).forEach(f=>PdfTools.addMergeFile(f));
    });
    $('btnDoMerge').onclick = () => PdfTools.doMerge();

    // Split
    $$('input[name="splitMode"]').forEach(r => r.onchange = () => {
      $('splitRangeWrap').classList.toggle('hidden', r.value !== 'range');
      $('splitFixedWrap').classList.toggle('hidden', r.value !== 'fixed');
    });
    $('btnDoSplit').onclick = () => {
      const mode = document.querySelector('input[name="splitMode"]:checked').value;
      PdfTools.doSplit(mode, $('splitRange').value, $('splitFixed').value);
    };

    // Watermark
    $('wmOpacity').oninput = e => $('wmOpVal').textContent = e.target.value + '%';
    $('wmAngle').oninput = e => $('wmAngVal').textContent = e.target.value + '°';
    $('wmSize').oninput = e => $('wmSzVal').textContent = e.target.value;
    $('btnDoWatermark').onclick = () => PdfTools.doWatermark(
      $('wmText').value, $('wmColor').value,
      parseInt($('wmOpacity').value), parseInt($('wmAngle').value),
      parseInt($('wmSize').value), $('wmPages').value
    );

    // Page numbers
    $('btnDoPageNum').onclick = () => {
      const pos = $('pnPos').value || 'bottom-center';
      PdfTools.doPageNumbers(pos, parseInt($('pnStart').value)||1, $('pnFormat').value,
        parseInt($('pnSize').value)||12, parseInt($('pnSkip').value)||0);
    };

    // Compress
    $('btnDoCompress').onclick = () => {
      const lvl = document.querySelector('input[name="cLevel"]:checked').value;
      PdfTools.doCompress(lvl);
    };

    // Export Image
    const expQuality = $('expQuality');
    if (expQuality) {
      expQuality.oninput = e => {
        const val = $('expQualityVal');
        if (val) val.textContent = e.target.value + '%';
      };
    }
    const expPages = $('expPages');
    if (expPages) {
      expPages.onchange = () => {
        $('expRangeWrap').classList.toggle('hidden', expPages.value !== 'range');
      };
    }
    $('btnDoExport').onclick = () => ExportManager.exportAsImage(
      $('expFmt').value, parseInt($('expScale').value),
      parseInt($('expQuality').value), $('expPages').value, $('expRange').value
    );

    // Password
    const btnDoPassword = $('btnDoPassword');
    if (btnDoPassword) {
      btnDoPassword.onclick = () => {
        const pw = $('pwUser').value;
        const confirm2 = $('pwConfirm').value;
        if (!pw) { showToast('Enter a password', 'error'); return; }
        if (pw !== confirm2) { showToast('Passwords do not match', 'error'); return; }
        showToast('Password protection requires server-side encryption', 'error');
      };
    }

    // Toolbar accent buttons
    const btnMerge = $('btnMerge');
    if (btnMerge) btnMerge.onclick = () => { PdfTools.initMerge(); openModal('modalMerge'); };

    const btnSplit = $('btnSplit');
    if (btnSplit) btnSplit.onclick = () => {
      if (!AppState.loaded) { showToast('Open a PDF first', 'error'); return; }
      openModal('modalSplit');
    };

    const btnCompress = $('btnCompress');
    if (btnCompress) btnCompress.onclick = () => {
      if (!AppState.loaded) { showToast('Open a PDF first', 'error'); return; }
      const bytes = PdfEngine.rawBytes;
      $('cOrigSize').textContent = formatBytes(bytes ? (bytes.byteLength || bytes.length) : 0);
      openModal('modalCompress');
    };

    // More dropdown items
    const menuActions = {
      menuWatermark: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } openModal('modalWatermark'); },
      menuPageNum: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } openModal('modalPageNum'); },
      menuExtract: () => {
        if (!AppState.loaded) { showToast('Open a PDF first','error'); return; }
        const r = prompt(`Extract pages (1–${PdfEngine.pageCount}), e.g. "1-3, 5, 7-9":`);
        if (r) PdfTools.extractPages(r, PdfEngine.pageCount);
      },
      menuPassword: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } openModal('modalPassword'); },
      menuExport: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } openModal('modalExport'); },
      menuRotCCW: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } PdfTools.rotatePage(PdfEngine.currentPage, -90); },
      menuRotCW: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } PdfTools.rotatePage(PdfEngine.currentPage, 90); },
      menuDelPage: () => { if (!AppState.loaded) { showToast('Open a PDF first','error'); return; } PdfTools.deletePage(PdfEngine.currentPage); },
      menuTheme: () => ThemeManager.toggle(),
    };
    for (const [id, handler] of Object.entries(menuActions)) {
      const el = $(id);
      if (el) el.onclick = () => { $('ddMenu').classList.add('hidden'); handler(); };
    }
  },

  openMergeTool() {
    PdfTools.initMerge();
    openModal('modalMerge');
  },

  openQuickTool(tool) {
    if (['split','compress','export-img'].includes(tool)) {
      if (!AppState.loaded) {
        window._pendingTool = tool === 'export-img' ? 'export-img' : tool;
        $('fileInput').click();
        return;
      }
    }
    if (!AppState.loaded) { showToast('Open a PDF first', 'error'); return; }
    switch(tool) {
      case 'split': openModal('modalSplit'); break;
      case 'compress':
        const bytes = PdfEngine.rawBytes;
        $('cOrigSize').textContent = formatBytes(bytes ? (bytes.byteLength || bytes.length) : 0);
        openModal('modalCompress'); break;
      case 'watermark': openModal('modalWatermark'); break;
      case 'pagenums': openModal('modalPageNum'); break;
      case 'password': openModal('modalPassword'); break;
      case 'rotate':
        if (AppState.loaded) PdfTools.rotatePage(PdfEngine.currentPage, 90);
        break;
      case 'export': openModal('modalExport'); break;
    }
  },

  // ===== SEARCH =====
  bindSearch() {
    $('btnSearch').onclick = () => {
      $('searchBar').classList.toggle('hidden');
      if (!$('searchBar').classList.contains('hidden')) $('searchInput').focus();
    };
    $('btnSrchClose').onclick = () => $('searchBar').classList.add('hidden');
    $('searchInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.doSearch($('searchInput').value);
      if (e.key === 'Escape') $('searchBar').classList.add('hidden');
    });
    $('btnSrchNext').onclick = () => this.nextSearchResult(1);
    $('btnSrchPrev').onclick = () => this.nextSearchResult(-1);
  },

  async doSearch(query) {
    if (!query.trim()) return;
    this._searchResults = await PdfEngine.searchText(query);
    const status = $('searchStatus');
    if (status) {
      status.textContent = this._searchResults.length
        ? `${this._searchResults.length} match${this._searchResults.length > 1 ? 'es' : ''}`
        : 'Not found';
    }
    this._searchIdx = 0;
    if (this._searchResults.length) this.goToPage(this._searchResults[0]);
  },

  nextSearchResult(dir) {
    if (!this._searchResults.length) return;
    this._searchIdx = (this._searchIdx + dir + this._searchResults.length) % this._searchResults.length;
    this.goToPage(this._searchResults[this._searchIdx]);
  },

  // ===== CONTEXT MENU =====
  bindContextMenu() {
    const ctxMenu = $('ctxMenu');
    if (!ctxMenu) return;

    $('viewerWrap').addEventListener('contextmenu', e => {
      e.preventDefault();
      const wrapper = e.target.closest('.page-wrapper');
      if (!wrapper) return;
      this._ctxPageNum = parseInt(wrapper.dataset.page);
      const rect = wrapper.getBoundingClientRect();
      this._ctxX = e.clientX - rect.left;
      this._ctxY = e.clientY - rect.top;
      ctxMenu.classList.remove('hidden');
      ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    });

    $$('.ctx-item').forEach(item => {
      item.onclick = () => {
        ctxMenu.classList.add('hidden');
        this.handleCtxAction(item.dataset.ctx);
      };
    });
  },

  handleCtxAction(action) {
    const pn = this._ctxPageNum || PdfEngine.currentPage;
    switch(action) {
      case 'add-text':
        this.setTool('text');
        const popup = $('textPopup');
        popup.classList.remove('hidden');
        popup.style.left = Math.min(this._ctxX + 20, window.innerWidth - 360) + 'px';
        popup.style.top = Math.min(this._ctxY + 20, window.innerHeight - 220) + 'px';
        this._pendingTextPage = pn;
        this._pendingTextX = this._ctxX;
        this._pendingTextY = this._ctxY;
        $('tpText').focus();
        break;
      case 'add-sticky':
        this.setTool('sticky');
        AnnotationManager.addSticky(pn, this._ctxX, this._ctxY);
        break;
      case 'rotate-cw': PdfTools.rotatePage(pn, 90); break;
      case 'rotate-ccw': PdfTools.rotatePage(pn, -90); break;
      case 'delete-page': PdfTools.deletePage(pn); break;
    }
  },

  // ===== DROPDOWN =====
  bindDropdown() {
    const btnMore = $('btnMore');
    const ddMenu = $('ddMenu');
    if (btnMore && ddMenu) {
      btnMore.onclick = e => {
        e.stopPropagation();
        ddMenu.classList.toggle('hidden');
      };
      // Close on outside click
      document.addEventListener('click', () => ddMenu.classList.add('hidden'));
    }
  },

  // ===== ZOOM =====
  async setZoom(scale) {
    PdfEngine.setScale(scale);
    $('zoomDisplay').textContent = Math.round(PdfEngine.scale * 100) + '%';
    await this.renderAll();
    this.goToPage(PdfEngine.currentPage);
  },

  fitPage() {
    const wrap = $('viewerWrap');
    const ref = PdfEngine.pageRefs[1];
    if (!ref) return;
    const rawW = ref.vp.width / PdfEngine.scale;
    const rawH = ref.vp.height / PdfEngine.scale;
    const s = Math.min((wrap.clientWidth - 60) / rawW, (wrap.clientHeight - 60) / rawH);
    this.setZoom(s);
  },

  fitWidth() {
    const wrap = $('viewerWrap');
    const ref = PdfEngine.pageRefs[1];
    if (!ref) return;
    const rawW = ref.vp.width / PdfEngine.scale;
    this.setZoom((wrap.clientWidth - 60) / rawW);
  },

  // ===== PAGE NAV =====
  goToPage(n) {
    n = Math.max(1, Math.min(PdfEngine.pageCount, n));
    PdfEngine.currentPage = n;
    $('pageInput').value = n;
    if ($('btnPrev')) $('btnPrev').disabled = n <= 1;
    if ($('btnNext')) $('btnNext').disabled = n >= PdfEngine.pageCount;
    const wrapper = PdfEngine.getWrapper(n);
    if (wrapper) wrapper.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    SidebarManager.setActivePage(n);
    this.updatePageHighlight(n);
  },

  syncPageFromScroll() {
    if (!AppState.loaded) return;
    const wrap = $('viewerWrap');
    const mid = wrap.scrollTop + wrap.clientHeight / 2;
    for (let i = 1; i <= PdfEngine.pageCount; i++) {
      const w = PdfEngine.getWrapper(i);
      if (!w) continue;
      if (mid >= w.offsetTop && mid <= w.offsetTop + w.offsetHeight) {
        if (PdfEngine.currentPage !== i) {
          PdfEngine.currentPage = i;
          $('pageInput').value = i;
          SidebarManager.setActivePage(i);
          this.updatePageHighlight(i);
        }
        break;
      }
    }
  },

  updatePageHighlight(n) {
    $$('.page-wrapper').forEach(w => w.classList.toggle('current-page', parseInt(w.dataset.page) === n));
  },

  // ===== KEYBOARD =====
  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!AppState.loaded && !['?'].includes(e.key)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z') { e.preventDefault(); History.undo(); return; }
      if (ctrl && (e.key === 'y' || e.key === 'Z')) { e.preventDefault(); History.redo(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); PdfTools.saveCurrentFile(); return; }
      if (ctrl && e.key === 'p') { e.preventDefault(); window.print(); return; }
      if (ctrl && e.key === 'o') { e.preventDefault(); $('openInput').click(); return; }
      if (ctrl && e.key === 'f') { e.preventDefault(); $('searchBar').classList.toggle('hidden'); $('searchInput').focus(); return; }

      switch(e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown':
          e.preventDefault(); this.goToPage(PdfEngine.currentPage + 1); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault(); this.goToPage(PdfEngine.currentPage - 1); break;
        case 'Home': e.preventDefault(); this.goToPage(1); break;
        case 'End': e.preventDefault(); this.goToPage(PdfEngine.pageCount); break;
        case '+': case '=': this.setZoom(PdfEngine.scale + 0.15); break;
        case '-': this.setZoom(PdfEngine.scale - 0.15); break;
        case '0': this.fitPage(); break;
        case 'v': case 'V': this.setTool('select'); break;
        case 't': case 'T': this.setTool('text'); break;
        case 'd': case 'D': this.setTool('draw'); break;
        case 'e': case 'E': this.setTool('eraser'); break;
        case 'h': case 'H': this.setTool('highlight'); break;
        case 'u': case 'U': this.setTool('underline'); break;
        case 's': case 'S': this.setTool('shape'); break;
        case 'l': case 'L': this.setTool('line'); break;
        case 'n': case 'N': this.setTool('sticky'); break;
        case 'g': case 'G': this.setTool('sign'); break;
        case 'Tab':
          e.preventDefault();
          SidebarManager.toggle();
          break;
        case 'Escape':
          this.setTool('select');
          $('textPopup').classList.add('hidden');
          $('searchBar').classList.add('hidden');
          const ddMenu = $('ddMenu');
          if (ddMenu) ddMenu.classList.add('hidden');
          const ctxMenu = $('ctxMenu');
          if (ctxMenu) ctxMenu.classList.add('hidden');
          AppState.pendingSignatureDataUrl = null;
          break;
        case '?':
          this.showShortcuts(); break;
      }
    });

    // Scroll wheel zoom
    $('viewerWrap').addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.setZoom(PdfEngine.scale + delta);
      }
    }, { passive: false });
  },

  showShortcuts() {
    const shortcuts = [
      ['Open file','Ctrl+O'], ['Save / Download','Ctrl+S'], ['Print','Ctrl+P'],
      ['Undo','Ctrl+Z'], ['Redo','Ctrl+Y'], ['Search','Ctrl+F'],
      ['Next page','→ / ↓ / PgDn'], ['Prev page','← / ↑ / PgUp'],
      ['First / Last','Home / End'], ['Zoom in/out','+ / -'],
      ['Fit page','0'], ['Zoom with scroll','Ctrl+Wheel'],
      ['Toggle sidebar','Tab'], ['Close / Reset','Esc'],
      ['',''], ['Select tool','V'], ['Text tool','T'], ['Draw','D'],
      ['Eraser','E'], ['Highlight','H'], ['Underline','U'],
      ['Shape','S'], ['Line','L'], ['Sticky note','N'], ['Sign','G'],
    ];
    const existing = document.querySelector('.shortcuts-overlay');
    if (existing) { existing.remove(); return; }
    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-box">
        <h3>⌨️ Keyboard Shortcuts <span style="float:right;cursor:pointer;font-weight:400;color:var(--text-3)" onclick="this.closest('.shortcuts-overlay').remove()">✕ Close</span></h3>
        ${shortcuts.map(([label, key]) => label ? `
          <div class="shortcut-row">
            <span>${label}</span>
            <span class="shortcut-key">${key}</span>
          </div>` : '<div style="height:8px"></div>').join('')}
        <p style="font-size:11px;color:var(--text-3);margin-top:12px;text-align:center">Press ? or Esc to close</p>
      </div>
    `;
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => App.init());
