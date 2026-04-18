// ===== UNDO / REDO HISTORY =====
const History = {
  stack: [],
  index: -1,
  maxSize: 40,

  push(snapshot) {
    // Remove any redo states
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snapshot);
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.index = this.stack.length - 1;
    this.updateButtons();
  },

  undo() {
    if (this.index <= 0) return null;
    this.index--;
    this.updateButtons();
    return this.stack[this.index];
  },

  redo() {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    this.updateButtons();
    return this.stack[this.index];
  },

  canUndo() { return this.index > 0; },
  canRedo() { return this.index < this.stack.length - 1; },

  updateButtons() {
    const u = $('btnUndo'), r = $('btnRedo');
    if (u) u.style.opacity = this.canUndo() ? '1' : '0.4';
    if (r) r.style.opacity = this.canRedo() ? '1' : '0.4';
  },

  reset() {
    this.stack = [];
    this.index = -1;
    this.updateButtons();
  },

  clear() {
    this.reset();
  },

  pushDrawing(pageNum, before, after) {
    this.push({ type: 'drawing', pageNum, before, after });
  },

  // Take a snapshot of all drawing canvases
  captureDrawings() {
    const snap = {};
    for (let i = 1; i <= PdfEngine.pageCount; i++) {
      const layer = PdfEngine.getDrawLayer(i);
      if (layer) snap[i] = layer.toDataURL();
    }
    return { drawings: snap, annotations: JSON.stringify(AnnotationManager.serialize()) };
  },

  restoreSnapshot(snap) {
    if (!snap) return;
    // Restore drawings
    if (snap.drawings) {
      for (const [pg, dataUrl] of Object.entries(snap.drawings)) {
        const layer = PdfEngine.getDrawLayer(parseInt(pg));
        if (!layer) continue;
        const ctx = layer.getContext('2d');
        ctx.clearRect(0, 0, layer.width, layer.height);
        if (dataUrl && dataUrl !== 'data:,') {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = dataUrl;
        }
      }
    }
  }
};
