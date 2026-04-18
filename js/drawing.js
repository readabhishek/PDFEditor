// ===== DRAWING MANAGER =====
const DrawingManager = {
  drawings: {},
  isDrawing: false,
  currentPageNum: null,
  lastX: 0, lastY: 0,
  color: '#E8402A',
  size: 3,
  opacity: 1,
  activeLayers: {},
  shapeStart: null,
  beforeDrawDataUrl: null,

  init() { this.drawings = {}; this.activeLayers = {}; },

  setupLayer(pageNum) {
    const layer = PdfEngine.getDrawLayer(pageNum);
    if (!layer || this.activeLayers[pageNum]) return;
    this.activeLayers[pageNum] = true;

    const bind = (eventName, handler) => layer.addEventListener(eventName, e => handler(e, pageNum, layer));
    bind('mousedown', (e, pn, l) => this._onDown(e, pn, l));
    bind('mousemove', (e, pn, l) => this._onMove(e, pn, l));
    bind('mouseup', (e, pn, l) => this._onUp(pn, l));
    bind('mouseleave', (e, pn, l) => this._onUp(pn, l));

    layer.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      this._onDown({ clientX: t.clientX, clientY: t.clientY, preventDefault:()=>{} }, pageNum, layer);
    }, { passive: false });
    layer.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      this._onMove({ clientX: t.clientX, clientY: t.clientY }, pageNum, layer);
    }, { passive: false });
    layer.addEventListener('touchend', () => this._onUp(pageNum, layer));
  },

  _getPos(e, layer) {
    const rect = layer.getBoundingClientRect();
    return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
  },

  _onDown(e, pageNum, layer) {
    const tool = window.AppState?.tool;
    const drawTools = ['draw','eraser','highlight','underline','strikethrough','shape','line'];
    if (!drawTools.includes(tool)) return;
    this.isDrawing = true;
    this.currentPageNum = pageNum;
    const { x, y } = this._getPos(e, layer);
    this.lastX = x; this.lastY = y;
    this.beforeDrawDataUrl = this.drawings[pageNum] || null;
    if (tool === 'shape' || tool === 'line') this.shapeStart = { x, y };
  },

  _onMove(e, pageNum, layer) {
    if (!this.isDrawing || this.currentPageNum !== pageNum) return;
    const tool = window.AppState?.tool;
    const { x, y } = this._getPos(e, layer);
    const ctx = layer.getContext('2d');
    const alpha = this.opacity;
    const col = this.color;
    const sz = this.size;

    if (tool === 'draw') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col; ctx.lineWidth = sz;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(this.lastX, this.lastY); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    } else if (tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = sz * 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.lastX, this.lastY); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    } else if (tool === 'highlight') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35 * alpha;
      ctx.fillStyle = col;
      ctx.fillRect(Math.min(this.lastX, x), Math.min(this.lastY, y) + 2, Math.abs(x - this.lastX) + 1, Math.max(sz * 5, 16));
      ctx.restore();
    } else if (tool === 'underline') {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, sz); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.lastX, this.lastY + 10); ctx.lineTo(x, y + 10); ctx.stroke();
      ctx.restore();
    } else if (tool === 'strikethrough') {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, sz); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.lastX, this.lastY); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
    } else if ((tool === 'shape' || tool === 'line') && this.shapeStart) {
      // Live shape preview
      const restore = () => {
        ctx.clearRect(0, 0, layer.width, layer.height);
        if (this.beforeDrawDataUrl) {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, 0); this._drawShapePreview(ctx, this.shapeStart.x, this.shapeStart.y, x, y, tool); };
          img.src = this.beforeDrawDataUrl;
          return;
        }
        this._drawShapePreview(ctx, this.shapeStart.x, this.shapeStart.y, x, y, tool);
      };
      restore();
      this.lastX = x; this.lastY = y;
      return;
    }

    this.lastX = x; this.lastY = y;
  },

  _drawShapePreview(ctx, x1, y1, x2, y2, tool) {
    const shapeTypeEl = document.getElementById('shapeType');
    const stype = shapeTypeEl ? shapeTypeEl.value : 'rect';
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.strokeStyle = this.color; ctx.fillStyle = this.color;
    ctx.lineWidth = this.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (stype === 'rect') {
      ctx.beginPath();
      ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    } else if (stype === 'circle') {
      const cx=(x1+x2)/2, cy=(y1+y2)/2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(x2-x1)/2, Math.abs(y2-y1)/2, 0, 0, Math.PI*2);
      ctx.stroke();
    } else if (stype === 'arrow' || tool === 'line') {
      this._drawArrow(ctx, x1, y1, x2, y2, stype === 'arrow' || tool === 'line');
    }
    ctx.restore();
  },

  _drawArrow(ctx, x1, y1, x2, y2, arrowHead = true) {
    const headLen = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (arrowHead) {
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen*Math.cos(angle-Math.PI/6), y2 - headLen*Math.sin(angle-Math.PI/6));
      ctx.lineTo(x2 - headLen*Math.cos(angle+Math.PI/6), y2 - headLen*Math.sin(angle+Math.PI/6));
      ctx.closePath(); ctx.fill();
    }
  },

  _onUp(pageNum, layer) {
    if (!this.isDrawing || this.currentPageNum !== pageNum) return;
    this.isDrawing = false;
    const after = layer.toDataURL();
    const before = this.beforeDrawDataUrl;
    if (before !== after) {
      History.pushDrawing(pageNum, before, after);
      this.drawings[pageNum] = after;
    }
    this.shapeStart = null;
    this.beforeDrawDataUrl = null;
  },

  restorePageDrawings(pageNum) {
    const layer = PdfEngine.getDrawLayer(pageNum);
    if (!layer || !this.drawings[pageNum]) return;
    const img = new Image();
    const ctx = layer.getContext('2d');
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = this.drawings[pageNum];
  },

  clearPage(pageNum) {
    const layer = PdfEngine.getDrawLayer(pageNum);
    if (layer) layer.getContext('2d').clearRect(0, 0, layer.width, layer.height);
    delete this.drawings[pageNum];
  },

  clearAll() { this.init(); },

  setPointerEvents(enabled) {
    document.querySelectorAll('.page-draw-layer').forEach(l => {
      l.style.pointerEvents = enabled ? 'auto' : 'none';
    });
  },

  enableAll() {
    for (let i = 1; i <= PdfEngine.pageCount; i++) this.setupLayer(i);
  }
};
