// ===== EXPORT MANAGER =====
const ExportManager = {
  async exportAsImage(format, scale, quality, pagesMode, rangeStr) {
    if (!PdfEngine.pdfDoc) { showToast('No PDF loaded', 'error'); return; }
    showLoading('Exporting as image…');
    try {
      let pageNums = [];
      const total = PdfEngine.pageCount;

      if (pagesMode === 'current') {
        pageNums = [PdfEngine.currentPage];
      } else if (pagesMode === 'all') {
        for (let i = 1; i <= total; i++) pageNums.push(i);
      } else if (pagesMode === 'range') {
        const groups = PdfTools.parseRanges(rangeStr, total);
        pageNums = [...new Set(groups.flat())].map(i => i + 1).sort((a, b) => a - b);
      }

      if (!pageNums.length) { showToast('No pages selected', 'error'); hideLoading(); return; }

      const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format] || 'image/png';
      const q = quality / 100;

      for (const pn of pageNums) {
        const dataUrl = await this._renderPageToImage(pn, scale, mime, q);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${baseName(PdfEngine.fileName)}_page${pn}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (pageNums.length > 1) await new Promise(r => setTimeout(r, 300));
      }

      showToast(`✓ Exported ${pageNums.length} page(s) as ${format.toUpperCase()}`, 'success');
      closeModal('modalExport');
    } catch(e) {
      showToast('Export failed: ' + e.message, 'error');
    } finally { hideLoading(); }
  },

  async _renderPageToImage(pageNum, scale, mime, quality) {
    const page = await PdfEngine.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Composite drawing layer
    const drawLayer = PdfEngine.getDrawLayer(pageNum);
    if (drawLayer && DrawingManager.drawings[pageNum]) {
      const drawScale = scale / PdfEngine.scale;
      ctx.save();
      ctx.scale(drawScale, drawScale);
      ctx.drawImage(drawLayer, 0, 0);
      ctx.restore();
    }

    return canvas.toDataURL(mime, quality);
  }
};
