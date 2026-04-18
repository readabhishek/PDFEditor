// ===== SIDEBAR MANAGER =====
const SidebarManager = {
  collapsed: false,

  init() {
    $$('.stab').forEach(tab => {
      tab.onclick = () => {
        $$('.stab').forEach(t => t.classList.remove('active'));
        $$('.spanel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelMap = { thumbs: 'panelThumbs', outline: 'panelOutline', info: 'panelInfo' };
        const panel = $(panelMap[tab.dataset.panel]);
        if (panel) panel.classList.add('active');
      };
    });
  },

  toggle() {
    this.collapsed = !this.collapsed;
    $('sidebar').classList.toggle('collapsed', this.collapsed);
  },

  async buildThumbnails() {
    const list = $('thumbList');
    list.innerHTML = '';
    for (let i = 1; i <= PdfEngine.pageCount; i++) {
      const item = document.createElement('div');
      item.className = 'thumb-item' + (i === PdfEngine.currentPage ? ' active' : '');
      item.dataset.page = i;

      const canvas = document.createElement('canvas');
      canvas.className = 'thumb-canvas';

      const actions = document.createElement('div');
      actions.className = 'thumb-actions';
      actions.innerHTML = `
        <button class="thumb-action" data-action="rotl" title="Rotate CCW">↺</button>
        <button class="thumb-action" data-action="rotr" title="Rotate CW">↻</button>
        <button class="thumb-action" data-action="del" title="Delete">✕</button>
      `;

      const num = document.createElement('div');
      num.className = 'thumb-num';
      num.textContent = i;

      item.appendChild(canvas);
      item.appendChild(actions);
      item.appendChild(num);

      item.onclick = e => {
        if (e.target.classList.contains('thumb-action')) return;
        App.goToPage(parseInt(item.dataset.page));
      };

      actions.querySelectorAll('.thumb-action').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const pg = parseInt(item.dataset.page);
          if (btn.dataset.action === 'rotl') PdfTools.rotatePage(pg, -90);
          else if (btn.dataset.action === 'rotr') PdfTools.rotatePage(pg, 90);
          else if (btn.dataset.action === 'del') PdfTools.deletePage(pg);
        };
      });

      list.appendChild(item);
      // Async thumbnail render
      this._renderThumb(i, canvas);
    }
  },

  async _renderThumb(pageNum, canvas) {
    try {
      const page = await PdfEngine.pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 0.18 });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch(e) {}
  },

  updateThumbnail(pageNum) {
    const item = $('thumbList').querySelector(`[data-page="${pageNum}"]`);
    if (!item) return;
    const canvas = item.querySelector('.thumb-canvas');
    if (canvas) this._renderThumb(pageNum, canvas);
  },

  setActivePage(pageNum) {
    $$('.thumb-item').forEach(el => el.classList.toggle('active', parseInt(el.dataset.page) === pageNum));
    const item = $('thumbList').querySelector(`[data-page="${pageNum}"]`);
    if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  async buildOutline() {
    const outline = await PdfEngine.getOutline();
    const list = $('outlineList');
    if (!outline || !outline.length) {
      list.innerHTML = '<p class="empty-state">No outline found in this PDF</p>';
      return;
    }
    list.innerHTML = '';
    this._renderOutlineItems(outline, list, 0);
  },

  _renderOutlineItems(items, container, level) {
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'bookmark-item' + (level ? ` level-${Math.min(level, 2)}` : '');
      el.textContent = item.title || '(untitled)';
      el.onclick = async () => {
        if (!item.dest) return;
        try {
          const dest = typeof item.dest === 'string'
            ? await PdfEngine.pdfDoc.getDestination(item.dest)
            : item.dest;
          if (dest && dest[0]) {
            const pageIndex = await PdfEngine.pdfDoc.getPageIndex(dest[0]);
            App.goToPage(pageIndex + 1);
          }
        } catch(e) {}
      };
      container.appendChild(el);
      if (item.items && item.items.length) this._renderOutlineItems(item.items, container, level + 1);
    });
  },

  refreshAnnotsList() {
    const list = $('annotsList');
    const all = AnnotationManager.getAllAnnotations();
    if (!all.length) {
      list.innerHTML = '<p class="empty-state">No annotations yet</p>';
      return;
    }
    list.innerHTML = '';
    all.sort((a, b) => (a.pageNum || 1) - (b.pageNum || 1)).forEach(annot => {
      const el = document.createElement('div');
      el.className = 'annot-item';
      const typeLabels = { text:'📝 Text', sticky:'📌 Note', highlight:'🖊 Highlight',
        underline:'U Underline', strikethrough:'S Strike', signature:'✍ Signature' };
      el.innerHTML = `
        <div class="annot-item-type">${typeLabels[annot.type] || annot.type}</div>
        <div class="annot-item-content">${(annot.text || '').slice(0, 40) || '—'}</div>
        <div class="annot-item-page">Page ${annot.pageNum}</div>
      `;
      el.onclick = () => App.goToPage(annot.pageNum);
      list.appendChild(el);
    });
  },

  async buildInfo() {
    const list = $('infoList');
    list.innerHTML = '';
    try {
      const meta = await PdfEngine.getMetadata();
      const info = meta.info || {};
      const bytes = PdfEngine.rawBytes;
      const size = bytes ? (bytes.byteLength || bytes.length || 0) : 0;
      const fields = [
        ['File Name', PdfEngine.fileName],
        ['Total Pages', PdfEngine.pageCount],
        ['File Size', formatBytes(size)],
        ['Title', info.Title],
        ['Author', info.Author],
        ['Subject', info.Subject],
        ['Keywords', info.Keywords],
        ['Creator', info.Creator],
        ['Producer', info.Producer],
        ['Created', info.CreationDate ? String(info.CreationDate).slice(2, 16) : null],
        ['Modified', info.ModDate ? String(info.ModDate).slice(2, 16) : null],
        ['PDF Version', info.PDFFormatVersion],
      ];
      fields.forEach(([label, val]) => {
        if (!val && val !== 0) return;
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `<span class="info-label">${label}</span><span class="info-value">${val}</span>`;
        list.appendChild(row);
      });
    } catch(e) {}
  }
};
