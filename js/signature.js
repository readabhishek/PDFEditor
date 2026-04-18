// ===== SIGNATURE MANAGER =====
const SigManager = {
  canvas: null,
  ctx: null,
  drawing: false,
  color: '#111111',
  pendingPage: null,
  pendingX: 0,
  pendingY: 0,
  sigFont: "'Dancing Script', cursive",

  init() {
    this.canvas = $('sigCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._setupPad();
    this._setupUI();
  },

  _setupPad() {
    const c = this.canvas;
    const getPos = e => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) * (c.width / r.width), y: (src.clientY - r.top) * (c.height / r.height) };
    };
    c.addEventListener('mousedown', e => { this.drawing = true; const {x,y} = getPos(e); this.ctx.beginPath(); this.ctx.moveTo(x,y); });
    c.addEventListener('mousemove', e => {
      if (!this.drawing) return;
      const {x,y} = getPos(e);
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = 2.5; this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
      this.ctx.lineTo(x,y); this.ctx.stroke();
      this.ctx.beginPath(); this.ctx.moveTo(x,y);
    });
    c.addEventListener('mouseup', () => this.drawing = false);
    c.addEventListener('mouseleave', () => this.drawing = false);
    c.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; c.dispatchEvent(new MouseEvent('mousedown',{clientX:t.clientX,clientY:t.clientY})); }, {passive:false});
    c.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; c.dispatchEvent(new MouseEvent('mousemove',{clientX:t.clientX,clientY:t.clientY})); }, {passive:false});
    c.addEventListener('touchend', () => c.dispatchEvent(new MouseEvent('mouseup')));
  },

  _setupUI() {
    $('btnSigClear')?.addEventListener('click', () => { this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); });
    $$('.sigcol').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.sigcol').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.color = btn.dataset.col;
      });
    });
    $$('.sig-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.sig-tab').forEach(t => t.classList.remove('active'));
        $$('.sig-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = tab.dataset.sigtab === 'draw' ? 'sigDrawPanel' : 'sigTypePanel';
        $(panelId)?.classList.add('active');
      });
    });
    $$('.sig-font').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.sig-font').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.sigFont = btn.dataset.sigfont;
      });
    });
    $('btnInsertSig')?.addEventListener('click', () => this.insert());
  },

  open(pageNum, x, y) {
    this.pendingPage = pageNum;
    this.pendingX = x;
    this.pendingY = y;
    // Clear canvas
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    openModal('modalSig');
  },

  insert() {
    // Check active tab
    const isType = $('sigTypePanel')?.classList.contains('active');
    let dataUrl;
    if (isType) {
      const text = $('sigTextInput')?.value?.trim();
      if (!text) { showToast('Please enter your name', 'error'); return; }
      dataUrl = this._renderTextSig(text);
    } else {
      if (!this.canvas) return;
      dataUrl = this.canvas.toDataURL();
      // Check if blank
      const blank = !this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data.some(v => v !== 0);
      if (blank) { showToast('Please draw your signature', 'error'); return; }
    }
    closeModal('modalSig');
    this._placeSig(dataUrl);
  },

  _renderTextSig(text) {
    const c = document.createElement('canvas');
    c.width = 460; c.height = 150;
    const ctx = c.getContext('2d');
    ctx.font = `54px ${this.sigFont}`;
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);
    return c.toDataURL();
  },

  _placeSig(dataUrl) {
    const pg = this.pendingPage || PdfEngine.currentPage;
    const al = PdfEngine.getAnnotLayer(pg);
    if (!al) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'sig-overlay';
    wrapper.style.cssText = `left:${this.pendingX}px;top:${this.pendingY}px;width:200px`;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:100%;height:auto;display:block';

    const del = document.createElement('button');
    del.className = 'adel'; del.textContent = '✕';
    del.onclick = () => wrapper.remove();

    const resize = document.createElement('div');
    resize.className = 'sig-resize';

    wrapper.append(img, del, resize);
    al.appendChild(wrapper);

    // Draggable
    let sx, sy, ex, ey;
    wrapper.addEventListener('mousedown', e => {
      if (e.target === resize || e.target === del) return;
      sx = e.clientX; sy = e.clientY;
      ex = parseInt(wrapper.style.left)||0; ey = parseInt(wrapper.style.top)||0;
      const mv = ev => { wrapper.style.left=(ex+ev.clientX-sx)+'px'; wrapper.style.top=(ey+ev.clientY-sy)+'px'; };
      const up = () => { document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });

    // Resize
    let rsx, rw0;
    resize.addEventListener('mousedown', e => {
      e.stopPropagation();
      rsx = e.clientX; rw0 = wrapper.offsetWidth;
      const mv = ev => { wrapper.style.width = Math.max(60, rw0 + ev.clientX - rsx) + 'px'; };
      const up = () => { document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });

    showToast('Signature placed — drag to reposition', 'success');
  }
};
