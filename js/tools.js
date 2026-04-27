// ===== PDF TOOLS =====
const PdfTools = {
  mergeFiles: [],

  initMerge() { this.mergeFiles = []; $('mergeList').innerHTML = ''; },

  addMergeFile(file) {
    this.mergeFiles.push({ file, name: file.name, size: file.size });
    this.renderMergeList();
  },

  renderMergeList() {
    const list = $('mergeList');
    list.innerHTML = '';
    this.mergeFiles.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'merge-item';
      el.draggable = true;
      el.dataset.index = i;
      el.innerHTML = `
        <span class="merge-drag-handle" style="color:var(--text-3);cursor:grab;font-size:16px;flex-shrink:0;padding:0 4px">⋮⋮</span>
        <span style="color:var(--accent);flex-shrink:0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 1h8l4 4v10H2V1z" stroke="currentColor" stroke-width="1.2"/><path d="M10 1v4h4" stroke="currentColor" stroke-width="1.2"/><path d="M4 8h5M4 11h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </span>
        <span class="merge-item-name" title="${item.name}">${item.name}</span>
        <span class="merge-item-size">${formatBytes(item.size)}</span>
        <button class="merge-item-del" data-idx="${i}" title="Remove">✕</button>
      `;
      list.appendChild(el);
    });
    list.querySelectorAll('.merge-item-del').forEach(btn => {
      btn.onclick = () => { this.mergeFiles.splice(parseInt(btn.dataset.idx), 1); this.renderMergeList(); };
    });
    makeDraggable(list, '.merge-item');
  },

  getMergeOrdered() {
    const items = $('mergeList').querySelectorAll('.merge-item');
    return Array.from(items).map(el => this.mergeFiles[parseInt(el.dataset.index)]).filter(Boolean);
  },

  async doMerge() {
    const ordered = this.getMergeOrdered();
    if (ordered.length < 2) { showToast('Add at least 2 PDFs', 'error'); return; }
    showLoading('Merging PDFs…');
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (const item of ordered) {
        const bytes = await item.file.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const out = await merged.save();
      downloadBytes(out, 'merged.pdf');
      showToast('✓ PDFs merged!', 'success');
      closeModal('modalMerge');
    } catch(e) { showToast('Merge failed: ' + e.message, 'error'); }
    finally { hideLoading(); }
  },

  parseRanges(str, total) {
    const groups = [];
    (str || '').split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
      const dash = part.indexOf('-');
      if (dash === -1) {
        const n = parseInt(part);
        if (!isNaN(n) && n >= 1 && n <= total) groups.push([n - 1]);
      } else {
        const a = parseInt(part.slice(0, dash));
        const b = parseInt(part.slice(dash + 1));
        if (!isNaN(a) && !isNaN(b)) {
          const s = Math.max(0, Math.min(a, b) - 1);
          const e2 = Math.min(total, Math.max(a, b));
          const chunk = [];
          for (let i = s; i < e2; i++) chunk.push(i);
          if (chunk.length) groups.push(chunk);
        }
      }
    });
    return groups;
  },

  async doSplit(mode, range, fixedN) {
    if (!PdfEngine.pdfLibDoc) { showToast('No PDF loaded', 'error'); return; }
    showLoading('Splitting…');
    try {
      const total = PdfEngine.pdfLibDoc.getPageCount();
      let groups = [];
      if (mode === 'all') { for (let i = 0; i < total; i++) groups.push([i]); }
      else if (mode === 'range') { groups = this.parseRanges(range, total); }
      else if (mode === 'fixed') {
        const n = Math.max(1, parseInt(fixedN) || 1);
        for (let i = 0; i < total; i += n) {
          const chunk = [];
          for (let j = i; j < Math.min(i + n, total); j++) chunk.push(j);
          groups.push(chunk);
        }
      }
      if (!groups.length) { showToast('Invalid range', 'error'); hideLoading(); return; }
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      for (let g = 0; g < groups.length; g++) {
        const src = await PDFLib.PDFDocument.load(srcBytes);
        const doc = await PDFLib.PDFDocument.create();
        const pages = await doc.copyPages(src, groups[g]);
        pages.forEach(p => doc.addPage(p));
        const out = await doc.save();
        downloadBytes(out, `${baseName(PdfEngine.fileName)}_part${g+1}.pdf`);
        await new Promise(r => setTimeout(r, 200));
      }
      showToast(`✓ Split into ${groups.length} file(s)`, 'success');
      closeModal('modalSplit');
    } catch(e) { showToast('Split failed: ' + e.message, 'error'); }
    finally { hideLoading(); }
  },

  async doCompress(level) {
    if (!PdfEngine.rawBytes) { showToast('No PDF loaded', 'error'); return; }
    showLoading('Compressing…');
    try {
      const arr = PdfEngine.rawBytes instanceof ArrayBuffer ? new Uint8Array(PdfEngine.rawBytes) : PdfEngine.rawBytes;
      const src = await PDFLib.PDFDocument.load(arr, { ignoreEncryption: true });
      const out = await src.save({ useObjectStreams: level !== 'low', addDefaultPage: false });
      const saved = Math.max(0, (1 - out.byteLength / arr.byteLength) * 100).toFixed(1);
      downloadBytes(out, baseName(PdfEngine.fileName) + '_compressed.pdf');
      showToast(`✓ Compressed! ${saved}% saved → ${formatBytes(out.byteLength)}`, 'success');
      closeModal('modalCompress');
    } catch(e) { showToast('Compress failed: ' + e.message, 'error'); }
    finally { hideLoading(); }
  },

  async doWatermark(text, color, opacity, angle, fontSize, pagesMode) {
    if (!PdfEngine.pdfLibDoc) { showToast('No PDF loaded', 'error'); return; }
    showLoading('Adding watermark…');
    try {
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const doc = await PDFLib.PDFDocument.load(srcBytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const hex = color.replace('#','');
      const r=parseInt(hex.slice(0,2),16)/255, g2=parseInt(hex.slice(2,4),16)/255, b=parseInt(hex.slice(4,6),16)/255;
      doc.getPages().forEach((page, i) => {
        const ok = pagesMode==='all'||
          (pagesMode==='current'&&i===PdfEngine.currentPage-1)||
          (pagesMode==='odd'&&(i+1)%2===1)||
          (pagesMode==='even'&&(i+1)%2===0);
        if (!ok) return;
        const {width,height} = page.getSize();
        const tw = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: width/2-tw/2, y: height/2-fontSize/2,
          size: fontSize, font,
          color: PDFLib.rgb(r,g2,b),
          opacity: opacity/100,
          rotate: PDFLib.degrees(angle),
        });
      });
      downloadBytes(await doc.save(), baseName(PdfEngine.fileName)+'_watermarked.pdf');
      showToast('✓ Watermark added!','success');
      closeModal('modalWatermark');
    } catch(e) { showToast('Watermark failed: '+e.message,'error'); }
    finally { hideLoading(); }
  },

  async doPageNumbers(pos, startNum, format, fontSize, skip) {
    if (!PdfEngine.pdfLibDoc) { showToast('No PDF loaded', 'error'); return; }
    showLoading('Adding page numbers…');
    try {
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const doc = await PDFLib.PDFDocument.load(srcBytes);
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const mg = 22;
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        if (i < skip) return;
        const {width,height} = page.getSize();
        const n = i + startNum;
        const total = pages.length;
        let label = format==='n'?String(n):format==='page-n'?'Page '+n:format==='n-of-total'?`${n} of ${total+startNum-1}`:toRoman(n).toLowerCase();
        const tw = font.widthOfTextAtSize(label, fontSize);
        let x = width/2-tw/2, y = mg;
        if (pos.startsWith('top')) y = height-mg-fontSize;
        if (pos.endsWith('left')) x = mg;
        if (pos.endsWith('right')) x = width-tw-mg;
        page.drawText(label, {x,y,size:fontSize,font,color:PDFLib.rgb(0.3,0.3,0.3)});
      });
      downloadBytes(await doc.save(), baseName(PdfEngine.fileName)+'_numbered.pdf');
      showToast('✓ Page numbers added!','success');
      closeModal('modalPageNum');
    } catch(e) { showToast('Failed: '+e.message,'error'); }
    finally { hideLoading(); }
  },

  async rotatePage(pageNum, deg) {
    if (!PdfEngine.pdfLibDoc) return;
    showLoading('Rotating…');
    try {
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const doc = await PDFLib.PDFDocument.load(srcBytes);
      const page = doc.getPage(pageNum-1);
      page.setRotation(PDFLib.degrees((page.getRotation().angle+deg+360)%360));
      await PdfEngine.reloadBytes(await doc.save());
      await PdfEngine.rerenderPage(pageNum);
      SidebarManager.updateThumbnail(pageNum);
    } catch(e) { showToast('Rotate failed: '+e.message,'error'); }
    finally { hideLoading(); }
  },

  async deletePage(pageNum) {
    if (PdfEngine.pageCount<=1) { showToast('Cannot delete the only page','error'); return; }
    if (!confirm(`Delete page ${pageNum}?`)) return;
    showLoading('Deleting…');
    try {
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const doc = await PDFLib.PDFDocument.load(srcBytes);
      doc.removePage(pageNum-1);
      await PdfEngine.reloadBytes(await doc.save());
      hideLoading();
      App.renderAll();
    } catch(e) { hideLoading(); showToast('Delete failed: '+e.message,'error'); }
  },

  async extractPages(range, total) {
    if (!PdfEngine.pdfLibDoc) return;
    showLoading('Extracting…');
    try {
      const groups = this.parseRanges(range, total);
      if (!groups.length) { showToast('Invalid range','error'); hideLoading(); return; }
      const flat = [...new Set(groups.flat())].sort((a,b)=>a-b);
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const src = await PDFLib.PDFDocument.load(srcBytes);
      const doc = await PDFLib.PDFDocument.create();
      (await doc.copyPages(src, flat)).forEach(p=>doc.addPage(p));
      downloadBytes(await doc.save(), baseName(PdfEngine.fileName)+'_extracted.pdf');
      showToast(`✓ Extracted ${flat.length} page(s)`,'success');
    } catch(e) { showToast('Extract failed: '+e.message,'error'); }
    finally { hideLoading(); }
  },

  async flattenAnnotations() {
    if (!PdfEngine.pdfLibDoc) return;
    showLoading('Flattening annotations…');
    try {
      const srcBytes = await PdfEngine.pdfLibDoc.save();
      const doc = await PDFLib.PDFDocument.load(srcBytes);
      const pages = doc.getPages();
      for (let i=0; i<pages.length; i++) {
        const drawLayer = PdfEngine.getDrawLayer(i+1);
        if (!drawLayer || !DrawingManager.drawings[i+1]) continue;
        try {
          const resp = await fetch(drawLayer.toDataURL('image/png'));
          const imgBytes = await resp.arrayBuffer();
          const img = await doc.embedPng(imgBytes);
          const {width,height} = pages[i].getSize();
          pages[i].drawImage(img, {x:0,y:0,width,height});
        } catch(_) {}
      }
      downloadBytes(await doc.save(), baseName(PdfEngine.fileName)+'_flattened.pdf');
      showToast('✓ Annotations flattened!','success');
    } catch(e) { showToast('Flatten failed: '+e.message,'error'); }
    finally { hideLoading(); }
  },

  async saveCurrentFile() {
    if (!PdfEngine.pdfLibDoc) return;
    showLoading('Saving…');
    try {
      // If the user edited text inline, bake those edits into a fresh pdf-lib doc
      const hasTextEdits = window.TextEditor && TextEditor.hasModifications();
      let outBytes;
      if (hasTextEdits) {
        const srcBytes = await PdfEngine.pdfLibDoc.save();
        const doc = await PDFLib.PDFDocument.load(srcBytes);
        await TextEditor.applyEditsToPdfLib(doc);
        outBytes = await doc.save();
      } else {
        outBytes = await PdfEngine.pdfLibDoc.save();
      }
      downloadBytes(outBytes, PdfEngine.fileName||'document.pdf');
      showToast('✓ Downloaded!','success');
    } catch(e) { showToast('Save failed: '+e.message,'error'); }
    finally { hideLoading(); }
  }
};
