// ===== PDF ENGINE =====
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PdfEngine = {
  pdfDoc: null,
  pdfLibDoc: null,
  rawBytes: null,
  fileName: '',
  pageCount: 0,
  currentPage: 1,
  scale: 1.5,
  pageRefs: {},

  async loadFile(file) {
    showLoading('Loading PDF…');
    try {
      this.rawBytes = await file.arrayBuffer();
      this.fileName = file.name;
      await this._parse(this.rawBytes);
      hideLoading();
      return true;
    } catch(e) {
      hideLoading();
      showToast('Failed to load: ' + e.message, 'error');
      return false;
    }
  },

  async loadBytes(bytes) {
    this.rawBytes = bytes instanceof ArrayBuffer ? bytes : bytes.buffer || bytes;
    await this._parse(this.rawBytes);
  },

  async reloadBytes(bytes) {
    this.rawBytes = bytes instanceof ArrayBuffer ? bytes : bytes.buffer || bytes;
    await this._parse(this.rawBytes);
  },

  async _parse(bytes) {
    const arr = new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes);
    this.pdfDoc = await pdfjsLib.getDocument({ data: arr.slice() }).promise;
    this.pageCount = this.pdfDoc.numPages;
    this.pageRefs = {};
    try {
      this.pdfLibDoc = await PDFLib.PDFDocument.load(arr, { ignoreEncryption: true });
    } catch(e) { this.pdfLibDoc = null; }
  },

  async renderAll(container) {
    container.innerHTML = '';
    this.pageRefs = {};
    for (let i = 1; i <= this.pageCount; i++) {
      await this.renderPage(i, container, false);
    }
  },

  async renderPage(num, container, replace = false) {
    const page = await this.pdfDoc.getPage(num);
    const vp = page.getViewport({ scale: this.scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.page = num;
    wrapper.style.width = vp.width + 'px';
    wrapper.style.height = vp.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.width = vp.width; canvas.height = vp.height;

    const drawLayer = document.createElement('canvas');
    drawLayer.className = 'page-draw-layer';
    drawLayer.width = vp.width; drawLayer.height = vp.height;

    const annotLayer = document.createElement('div');
    annotLayer.className = 'page-annot-layer';

    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = 'Page ' + num;

    wrapper.append(canvas, drawLayer, annotLayer, label);

    if (replace) {
      const old = container.querySelector(`[data-page="${num}"]`);
      old ? container.replaceChild(wrapper, old) : container.appendChild(wrapper);
    } else {
      container.appendChild(wrapper);
    }

    this.pageRefs[num] = { wrapper, canvas, drawLayer, annotLayer, vp, viewport: vp };
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return this.pageRefs[num];
  },

  async rerenderPage(num) {
    const container = $('pdfContainer');
    await this.renderPage(num, container, true);
    DrawingManager.restorePageDrawings(num);
    AnnotationManager.restorePage(num);
  },

  setScale(s) { this.scale = Math.max(0.2, Math.min(6, s)); },

  getRef(num) { return this.pageRefs[num] || null; },
  getWrapper(num) { return this.pageRefs[num]?.wrapper || null; },
  getPageWrapper(num) { return this.pageRefs[num]?.wrapper || null; },
  getDrawLayer(num) { return this.pageRefs[num]?.drawLayer || null; },
  getAnnotLayer(num) { return this.pageRefs[num]?.annotLayer || null; },
  getVP(num) { return this.pageRefs[num]?.vp || null; },

  async getMetadata() {
    try { return await this.pdfDoc.getMetadata(); } catch(e) { return {}; }
  },
  async getOutline() {
    try { return await this.pdfDoc.getOutline(); } catch(e) { return null; }
  },

  async searchText(q) {
    if (!q) return [];
    const results = [];
    const lq = q.toLowerCase();
    for (let i = 1; i <= this.pageCount; i++) {
      const page = await this.pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str).join(' ');
      if (text.toLowerCase().includes(lq)) results.push(i);
    }
    return results;
  },

  getBytes() { return this.rawBytes; }
};
