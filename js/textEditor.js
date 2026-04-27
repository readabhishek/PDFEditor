// ===== INLINE TEXT EDITOR =====
// Extracts text runs from each PDF page using PDF.js, renders an editable
// overlay matching the original font-family / size / position / rotation,
// and lets the user edit inline. Modified runs are persisted on save by
// drawing a white rectangle over the original text and stamping new text
// in an equivalent standard font (Helvetica / Times / Courier).

// 2x3 affine matrix multiply: result = a × b (PDF.js convention)
function _teMatMul(a, b) {
  if (window.pdfjsLib && pdfjsLib.Util && pdfjsLib.Util.transform) {
    return pdfjsLib.Util.transform(a, b);
  }
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const TextEditor = {
  active: false,
  pages: {},          // pageNum -> { layer, items: [item, ...], built }
  _building: {},      // pageNum -> Promise (in-flight build)

  init() {
    this.active = false;
    this.pages = {};
    this._building = {};
  },

  reset() {
    this._removeAllLayers();
    this.pages = {};
    this._building = {};
    this.active = false;
  },

  async activate() {
    if (!PdfEngine.pdfDoc) return;
    this.active = true;
    document.body.classList.add('te-mode');
    // Lazy-build layer for current page first, then the rest
    const cur = PdfEngine.currentPage;
    await this.buildPage(cur);
    for (let i = 1; i <= PdfEngine.pageCount; i++) {
      if (i !== cur) this.buildPage(i); // fire-and-forget for other pages
    }
    this._showAllLayers(true);
  },

  deactivate() {
    this.active = false;
    document.body.classList.remove('te-mode');
    this._showAllLayers(false);
    // Blur any active editor so changes commit
    if (document.activeElement && document.activeElement.classList?.contains('te-item')) {
      document.activeElement.blur();
    }
  },

  _showAllLayers(show) {
    document.querySelectorAll('.te-layer').forEach(l => {
      l.classList.toggle('te-hidden', !show);
    });
  },

  _removeAllLayers() {
    document.querySelectorAll('.te-layer').forEach(l => l.remove());
  },

  hasModifications() {
    for (const pn of Object.keys(this.pages)) {
      const items = this.pages[pn].items || [];
      if (items.some(it => it.modified)) return true;
    }
    return false;
  },

  // Rebuild the layer for one page (e.g. after rerender / zoom change)
  async rebuildPage(pageNum) {
    const ref = PdfEngine.getRef(pageNum);
    if (ref?.wrapper) {
      const old = ref.wrapper.querySelector('.te-layer');
      if (old) old.remove();
    }
    delete this.pages[pageNum];
    if (this.active) await this.buildPage(pageNum);
  },

  async buildPage(pageNum) {
    if (this.pages[pageNum]?.built) return this.pages[pageNum];
    if (this._building[pageNum]) return this._building[pageNum];

    const promise = (async () => {
      const ref = PdfEngine.getRef(pageNum);
      if (!ref) return null;
      const page = await PdfEngine.pdfDoc.getPage(pageNum);
      const vp = ref.vp;
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const styles = textContent.styles || {};

      // Remove any existing layer for this page (safety)
      const existing = ref.wrapper.querySelector('.te-layer');
      if (existing) existing.remove();

      const layer = document.createElement('div');
      layer.className = 'te-layer te-hidden';
      layer.style.cssText =
        `position:absolute;top:0;left:0;width:${vp.width}px;height:${vp.height}px;`;
      ref.wrapper.appendChild(layer);

      const items = [];
      textContent.items.forEach((rawItem, idx) => {
        if (!rawItem.str || !rawItem.str.length) return;
        // Apply viewport transform to the item's PDF transform → screen space
        const tx = _teMatMul(vp.transform, rawItem.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        if (fontHeight < 1) return;
        const angle = Math.atan2(tx[1], tx[0]);
        const left = tx[4];
        // tx[5] is the baseline. For top-anchored CSS we offset by ascent.
        const top = tx[5] - fontHeight;
        const styleInfo = styles[rawItem.fontName] || {};
        const fontFamily = styleInfo.fontFamily || 'sans-serif';
        const widthPx = (rawItem.width || 0) * vp.scale;

        const el = document.createElement('span');
        el.className = 'te-item';
        el.spellcheck = false;
        el.dir = rawItem.dir || 'ltr';
        el.dataset.idx = idx;
        el.dataset.page = pageNum;
        el.textContent = rawItem.str;

        const transformCss = angle ? `rotate(${angle}rad)` : '';
        el.style.cssText =
          `left:${left}px;top:${top}px;` +
          `font-family:${fontFamily};` +
          `font-size:${fontHeight}px;` +
          `line-height:${fontHeight * 1.0}px;` +
          (transformCss ? `transform:${transformCss};` : '') +
          `min-width:${Math.max(8, widthPx)}px;`;

        const entry = {
          idx, el, pageNum,
          original: rawItem.str,
          current: rawItem.str,
          transform: rawItem.transform.slice(),
          screenLeft: left,
          screenTop: top,
          fontHeightPx: fontHeight,
          fontHeightPdf: Math.hypot(rawItem.transform[2], rawItem.transform[3]) || rawItem.height || 12,
          widthPx,
          widthPdf: rawItem.width || 0,
          fontFamily,
          fontName: rawItem.fontName,
          angleRad: angle,
          modified: false,
        };

        el.addEventListener('mousedown', e => this._onMouseDown(e, entry));
        el.addEventListener('focus', () => this._onFocus(entry));
        el.addEventListener('blur', () => this._onBlur(entry));
        el.addEventListener('input', () => this._onInput(entry));
        el.addEventListener('keydown', e => this._onKey(e, entry));

        layer.appendChild(el);
        items.push(entry);
      });

      this.pages[pageNum] = { layer, items, built: true };
      if (this.active) layer.classList.remove('te-hidden');
      return this.pages[pageNum];
    })();

    this._building[pageNum] = promise;
    try { return await promise; }
    finally { delete this._building[pageNum]; }
  },

  _onMouseDown(e, entry) {
    if (!this.active) return;
    // Promote to editable on click, keep selection behaviour natural
    if (entry.el.contentEditable !== 'true') {
      entry.el.contentEditable = 'true';
      // Focus on next tick so the click positions the caret
      setTimeout(() => entry.el.focus(), 0);
    }
  },

  _onFocus(entry) {
    entry.el.classList.add('te-active');
    // Ensure cover is present so original canvas text is hidden while editing
    this._applyCover(entry, true);
  },

  _onBlur(entry) {
    entry.el.classList.remove('te-active');
    entry.current = entry.el.textContent;
    entry.modified = entry.current !== entry.original;
    this._applyCover(entry, entry.modified);
    if (entry.modified) {
      entry.el.classList.add('te-modified');
    } else {
      entry.el.classList.remove('te-modified');
      entry.el.contentEditable = 'false';
    }
  },

  _onInput(entry) {
    entry.current = entry.el.textContent;
    entry.modified = entry.current !== entry.original;
    entry.el.classList.toggle('te-modified', entry.modified);
    this._applyCover(entry, true);
  },

  _onKey(e, entry) {
    if (e.key === 'Escape') {
      e.preventDefault();
      entry.el.blur();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Single-line edits by default — Shift+Enter inserts a real newline
      e.preventDefault();
      entry.el.blur();
    }
  },

  // Insert (or update) a white rect behind the text item to cover original glyphs
  _applyCover(entry, on) {
    if (!on) {
      if (entry.coverEl && entry.coverEl.parentNode) entry.coverEl.remove();
      entry.coverEl = null;
      return;
    }
    const layer = entry.el.parentElement;
    if (!layer) return;
    if (!entry.coverEl) {
      entry.coverEl = document.createElement('div');
      entry.coverEl.className = 'te-cover';
      layer.insertBefore(entry.coverEl, entry.el);
    }
    // Cover the larger of original width and current rendered width to fully hide originals
    const renderedW = entry.el.offsetWidth || entry.widthPx;
    const w = Math.max(entry.widthPx, renderedW) + 2;
    const h = entry.fontHeightPx * 1.25;
    const transformCss = entry.angleRad ? `rotate(${entry.angleRad}rad)` : '';
    entry.coverEl.style.cssText =
      `left:${entry.screenLeft}px;top:${entry.screenTop - entry.fontHeightPx * 0.1}px;` +
      `width:${w}px;height:${h}px;` +
      (transformCss ? `transform:${transformCss};` : '');
  },

  // ===== EXPORT =====
  // Apply edits onto a pdf-lib document. Each modified run gets a white
  // rectangle over its bbox + new text drawn in a standard font of the same
  // (PDF-units) size. Returns true if any edits were applied.
  async applyEditsToPdfLib(doc) {
    if (!this.hasModifications()) return false;
    const pages = doc.getPages();
    const helv = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const times = await doc.embedFont(PDFLib.StandardFonts.TimesRoman);
    const timesBold = await doc.embedFont(PDFLib.StandardFonts.TimesRomanBold);
    const courier = await doc.embedFont(PDFLib.StandardFonts.Courier);

    const pickFont = (family) => {
      const f = (family || '').toLowerCase();
      const isBold = f.includes('bold');
      if (f.includes('serif') && !f.includes('sans')) return isBold ? timesBold : times;
      if (f.includes('mono') || f.includes('courier')) return courier;
      return isBold ? helvBold : helv;
    };

    let applied = 0;

    for (const pageNumStr of Object.keys(this.pages)) {
      const pageNum = parseInt(pageNumStr, 10);
      const pdflibPage = pages[pageNum - 1];
      if (!pdflibPage) continue;
      const items = this.pages[pageNum].items || [];
      const modItems = items.filter(it => it.modified);
      if (!modItems.length) continue;

      const pageHeight = pdflibPage.getHeight();

      for (const it of modItems) {
        const t = it.transform; // [a,b,c,d,e,f] in PDF user-space
        const a = t[0], b = t[1], c = t[2], d = t[3], e = t[4], f = t[5];
        const sizePdf = Math.hypot(a, b) || it.fontHeightPdf;

        // White-out original glyph box. The PDF transform places the run at
        // (e,f) which is the baseline. We approximate the bbox as
        // width × fontSize, with a small descent below baseline.
        const widthPdf = Math.max(it.widthPdf, sizePdf * 0.5);
        const descent = sizePdf * 0.25;
        const ascent = sizePdf * 1.05;

        // Rectangle anchored at baseline, extending up by ascent and down by descent
        // The rectangle is rotated by the same angle as the text.
        const rotDeg = Math.atan2(b, a) * 180 / Math.PI;
        pdflibPage.drawRectangle({
          x: e,
          y: f - descent,
          width: widthPdf,
          height: ascent + descent,
          color: PDFLib.rgb(1, 1, 1),
          rotate: PDFLib.degrees(rotDeg),
          opacity: 1,
          // Anchor of rotation in pdf-lib is (x,y) — our (e, f-descent)
        });

        // Draw the new text at the same baseline position
        const font = pickFont(it.fontFamily);
        const newText = it.current;
        if (newText && newText.length) {
          try {
            pdflibPage.drawText(newText, {
              x: e,
              y: f,
              size: sizePdf,
              font,
              color: PDFLib.rgb(0, 0, 0),
              rotate: PDFLib.degrees(rotDeg),
            });
          } catch (_) {
            // Fall back: strip glyphs that the standard font can't encode
            const safe = newText.replace(/[^\x20-\x7E]/g, '');
            if (safe.length) {
              pdflibPage.drawText(safe, {
                x: e, y: f, size: sizePdf, font,
                color: PDFLib.rgb(0, 0, 0),
                rotate: PDFLib.degrees(rotDeg),
              });
            }
          }
        }
        applied++;
      }
    }

    return applied > 0;
  },
};
