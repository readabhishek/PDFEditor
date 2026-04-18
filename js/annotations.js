// ===== ANNOTATION MANAGER =====
const AnnotationManager = {
  data: {}, // pageNum -> [{type, el, x, y, ...}]

  init() { this.data = {}; },
  page(n) { if (!this.data[n]) this.data[n] = []; return this.data[n]; },

  addText(pageNum, x, y, text, opts = {}) {
    const al = PdfEngine.getAnnotLayer(pageNum);
    if (!al || !text.trim()) return;
    const el = document.createElement('div');
    el.className = 'text-annot' + (opts.bg !== false ? ' has-bg' : '');
    el.style.cssText = `left:${x}px;top:${y}px;font-size:${opts.size||16}px;font-family:${opts.font||'DM Sans'};color:${opts.color||'#111'}`;
    el.textContent = text;
    const del = this._delBtn(); del.onclick = () => { el.remove(); this._rm(pageNum, a); };
    el.appendChild(del);
    al.appendChild(el);
    this._draggable(el, a);
    const a = { type:'text', el, x, y, text, opts };
    this.page(pageNum).push(a);
    History.push(History.captureDrawings());
    return a;
  },

  addSticky(pageNum, x, y) {
    const al = PdfEngine.getAnnotLayer(pageNum);
    if (!al) return;
    const el = document.createElement('div');
    el.className = 'sticky-note';
    el.style.cssText = `left:${x}px;top:${y}px`;
    const ta = document.createElement('textarea');
    ta.placeholder = 'Type note…';
    const del = this._delBtn(); del.onclick = () => { el.remove(); this._rm(pageNum, a); };
    el.append(ta, del);
    al.appendChild(el);
    this._draggable(el, a);
    const a = { type:'sticky', el, x, y };
    this.page(pageNum).push(a);
    ta.focus();
    History.push(History.captureDrawings());
    return a;
  },

  _delBtn() {
    const b = document.createElement('button');
    b.className = 'adel'; b.textContent = '✕'; return b;
  },

  _rm(pageNum, a) {
    const pg = this.page(pageNum);
    const i = pg.indexOf(a); if (i !== -1) pg.splice(i, 1);
    History.push(History.captureDrawings());
  },

  _draggable(el, ref) {
    let sx, sy, ex, ey;
    el.addEventListener('mousedown', e => {
      if (['BUTTON','TEXTAREA','INPUT'].includes(e.target.tagName)) return;
      sx = e.clientX; sy = e.clientY;
      ex = parseInt(el.style.left)||0; ey = parseInt(el.style.top)||0;
      el.style.zIndex = 50;
      const mv = ev => {
        el.style.left = (ex + ev.clientX - sx) + 'px';
        el.style.top = (ey + ev.clientY - sy) + 'px';
        if (ref) { ref.x = parseInt(el.style.left); ref.y = parseInt(el.style.top); }
      };
      const up = () => { el.style.zIndex = ''; document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  },

  restorePage(num) {
    const al = PdfEngine.getAnnotLayer(num);
    if (!al) return;
    (this.data[num]||[]).forEach(a => { if (a.el && a.el.parentNode !== al) al.appendChild(a.el); });
  },

  serialize() {
    const out = {};
    for (const [pg, annots] of Object.entries(this.data)) {
      out[pg] = annots.map(a => ({
        type: a.type, x: a.x, y: a.y,
        text: a.type === 'text' ? a.el.textContent : (a.el.querySelector('textarea')?.value || ''),
        opts: a.opts
      }));
    }
    return out;
  },

  clearAll() { this.init(); }
};
