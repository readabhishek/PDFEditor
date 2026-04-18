// ===== UTILS =====
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function formatBytes(b){if(!b)return'—';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB';}
function baseName(n){return(n||'document').replace(/\.pdf$/i,'');}
let _tt;
function showToast(msg,type=''){const t=$('toast');t.textContent=msg;t.className='toast'+(type?' '+type:'');t.classList.remove('hidden');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.add('hidden'),3400);}
function showLoading(msg='Processing…'){$('loadingMsg').textContent=msg;$('loadingOv').classList.remove('hidden');}
function hideLoading(){$('loadingOv').classList.add('hidden');}
function openModal(id){$(id).classList.remove('hidden');}
function closeModal(id){$(id).classList.add('hidden');}
function downloadBytes(bytes,filename){const blob=new Blob([bytes],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),6000);}
function downloadDataURL(dataUrl,filename){const a=document.createElement('a');a.href=dataUrl;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-ov'))closeModal(e.target.id);const cb=e.target.closest('[data-close]');if(cb)closeModal(cb.dataset.close);});
function makeDraggable(container,selector){let src=null;container.addEventListener('dragstart',e=>{src=e.target.closest(selector);if(src){src.classList.add('dragging');e.dataTransfer.effectAllowed='move';}});container.addEventListener('dragover',e=>{e.preventDefault();const t=e.target.closest(selector);if(t&&t!==src){const after=e.clientY>t.getBoundingClientRect().top+t.offsetHeight/2;after?t.after(src):t.before(src);}});container.addEventListener('dragend',()=>{if(src)src.classList.remove('dragging');src=null;});}
function parseRanges(str,total){const g=[];str.split(',').map(s=>s.trim()).filter(Boolean).forEach(p=>{const d=p.indexOf('-');if(d===-1){const n=parseInt(p);if(!isNaN(n)&&n>=1&&n<=total)g.push([n-1]);}else{const a=parseInt(p.slice(0,d)),b=parseInt(p.slice(d+1));if(!isNaN(a)&&!isNaN(b)){const s=Math.max(1,Math.min(a,b))-1,e=Math.min(total,Math.max(a,b));const c=[];for(let i=s;i<e;i++)c.push(i);if(c.length)g.push(c);}}});return g;}
window.App=window.App||{};
