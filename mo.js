/**
 * mo.js — Machine Order module: data, Machine List page and the machine Pop-up.
 * Shared helpers ($, esc, fmtD, MON, today) come from index.html.
 */

/* ---------- column positions in the Excel file (0-based) ---------- */
const C = {t1b:0,month:1,reqDate:2,item:3,year:4,site:5,plant:6,factory:7,name:8,mro:9,model:10,poFlag:11,qty:12,unit:13,contract:14,type:15,setup:16,whole:17,line:18,pms:19,d0:20,prNo:21,prItem:22,poNo:23,poItem:24,poQty:25,sys:26,sysRemark:27,flowJudge:28,flowStatus:29,prCat:30,poCat:31,d3:32,d4:33,vcode:34,vendor:35,devId:36,status:37,progress:38,etd:39,eta:40,pc:41};
const LABEL = ['T1B NO.','Month','Request date','Item no.','Year','MFG site','Plant','Factory','Machine name','MRO PN','Model No','PO','Demand qty','Receiving unit','Suggested contracting unit','Machine type','Setup Date','DSM whole line?','Whole line name','PMS no.','D0 form no.','PR NO','PR item','PO NO','PO item','PO qty','System status (MRO-ANTA)','PR/PO system remark','Order flow check','Order flow status','PR link no.','PO link no.','D3 form no.','D4 form no.','PO vendor code','PO vendor','Equipment ID','Machine status','Progress detail','Confirm ETD','Confirm ETA','PC remark'];
const GROUPS = [
  ['Machine',[C.name,C.mro,C.model,C.type,C.qty,C.devId]],
  ['PR / PO',[C.prNo,C.prItem,C.poNo,C.poItem,C.poQty,C.poFlag,C.prCat,C.poCat,C.vcode,C.vendor]],
  ['Location',[C.site,C.plant,C.factory,C.unit,C.contract]],
  ['Status',[C.status,C.sys,C.flowStatus,C.flowJudge,C.sysRemark]],
  ['Dates',[C.month,C.year,C.reqDate,C.setup,C.etd,C.eta,'prevEta']],
  ['Whole line & forms',[C.whole,C.line,C.pms,C.d0,C.d3,C.d4]]
];
const COLS = [['t1b','T1B NO.'],['site','Site'],['plant','Plant'],['name','Machine name'],['model','Model'],['qty','Qty'],['vendor','Vendor'],['status','Status'],['setup','Setup Date'],['eta','Confirm ETA'],['poNo','PO NO']];
const DATE_COLS = [C.reqDate, C.setup, C.etd, C.eta];
const typeLabel = t => t === '新机' ? 'New (新机)' : t === '复购机' ? 'Repeat (复购机)' : (t || '—');
const in14 = new Date(Date.now() + 14 * 864e5).toLocaleDateString('sv-SE');

let D = null, rows = [], sel = null, sortKey = null, sortDir = 1, view = 'dash';
const F = {search:'',site:'',plant:'',vendor:'',status:'',type:'',from:'',to:'',quick:'all',rule:'ETA after Setup Date'};

/* ---------- load ---------- */
async function moLoad() {
  const r = await Api.getData('MO');
  if (!r.ok) return r;
  D = r; prepare();
  return r;
}

function prepare() {
  const useItem = D.keyMode === 'T1B+Item';
  rows = D.rows.map((a, i) => {
    const key = useItem ? a[C.t1b] + '|' + a[C.item] : String(a[C.t1b]);
    const p = D.previous[key];
    return {i, a, key, t1b:a[C.t1b], site:a[C.site], plant:a[C.plant], name:a[C.name], model:a[C.model], qty:+a[C.qty]||0,
      vendor:a[C.vendor], status:String(a[C.status]||''), type:a[C.type], setup:a[C.setup]||'', eta:a[C.eta]||'', poNo:a[C.poNo]||'',
      prevEta: p ? (p.eta||'') : null, isNew: !p};
  });
  F.rule = D.delayRule || F.rule;
  $('fRule').value = F.rule;
  $('asof').textContent = fmtD(D.dataAsOf); $('prevof').textContent = fmtD(D.previousAsOf);
  $('who').textContent = `Signed in as ${D.user.name}`;
  $('warn').classList.toggle('hidden', !D.warnings.length);
  $('warn').innerHTML = D.warnings.map(esc).join('<br>');
  const opts = (k, all) => `<option value="">${all}</option>` + [...new Set(rows.map(r => r[k]).filter(Boolean))].sort().map(v => `<option value="${esc(v)}">${esc(k==='type'?typeLabel(v):v)}</option>`).join('');
  $('fSite').innerHTML = opts('site','All'); $('fPlant').innerHTML = opts('plant','All'); $('fVendor').innerHTML = opts('vendor','All');
  $('fStatus').innerHTML = opts('status','All'); $('fType').innerHTML = opts('type','All');
}

/* ---------- logic ---------- */
const info = s => (D && D.statusMap[s]) || {};
const isOpen = r => !info(r.status).delivered;
const isDelay = r => r.eta && isOpen(r) && (F.rule === 'ETA after Setup Date' ? r.eta > r.setup : r.eta < today);
const etaChanged = r => r.prevEta !== null && r.prevEta !== r.eta;
const etaDelta = r => (etaChanged(r) && r.prevEta && r.eta) ? Math.round((new Date(r.eta) - new Date(r.prevEta)) / 864e5) : 0;
const QUICK = [['all','All',()=>true],['delay','Delay',isDelay],['eta14','ETA in 14 days',r=>r.eta&&isOpen(r)&&r.eta>=today&&r.eta<=in14],['changed','ETA changed',etaChanged],['nopo','No PO yet',r=>!r.poNo]];

function filtered() {
  const q = F.search.trim().toLowerCase(), qf = QUICK.find(x => x[0] === F.quick)[2];
  let list = rows.filter(r =>
    (!F.site || r.site === F.site) && (!F.plant || r.plant === F.plant) && (!F.vendor || r.vendor === F.vendor) &&
    (!F.status || r.status === F.status) && (!F.type || r.type === F.type) &&
    (!F.from || (r.eta && r.eta >= F.from)) && (!F.to || (r.eta && r.eta <= F.to)) && qf(r) &&
    (!q || [r.t1b, r.poNo, r.a[C.prNo], r.name, r.model, r.a[C.devId], r.vendor].join(' ').toLowerCase().includes(q)));
  if (sortKey) list = list.slice().sort((x, y) => (x[sortKey] > y[sortKey] ? 1 : x[sortKey] < y[sortKey] ? -1 : 0) * sortDir);
  return list;
}
function clearListFilters() {
  Object.assign(F, {search:'',site:'',plant:'',vendor:'',status:'',type:'',from:'',to:'',quick:'all'});
  F.rule = (D && D.delayRule) || 'ETA after Setup Date'; sel = null;
}
function syncListInputs() {
  [['fSearch','search'],['fSite','site'],['fPlant','plant'],['fVendor','vendor'],['fStatus','status'],['fType','type'],['fFrom','from'],['fTo','to'],['fRule','rule']].forEach(([id,k]) => $(id).value = F[k]);
}

/* ---------- Machine List ---------- */
function badge(s) {
  const m = info(s); const cls = m.accepted ? 'done' : m.delivered ? 'mid' : m.ordered ? '' : 'early';
  return `<span class="badge ${cls}">${esc(s || '—')}</span>`;
}
function render() {
  if (!D) return;
  const list = filtered(), sum = l => l.reduce((t, r) => t + r.qty, 0);
  const k = [
    ['Machines shown', list.length, `Total demand qty ${sum(list)}`, '#1D5FBF', 'var(--ink)'],
    ['Delay', list.filter(isDelay).length, 'Rule: ' + F.rule, '#EA7A1F', 'var(--warn)'],
    ['ETA in 14 days', list.filter(QUICK[2][2]).length, 'Until ' + fmtD(in14), '#7FA3D6', 'var(--blue)'],
    ['ETA changed', list.filter(etaChanged).length, 'vs ' + fmtD(D.previousAsOf), '#F2B48A', 'var(--warn)']
  ];
  $('kpis').innerHTML = k.map(([l, v, s, bar, col]) => `<div class="card kpi"><i style="background:${bar}"></i><div><div class="l">${l}</div><div class="v" style="color:${col}">${v}</div><div class="s">${esc(s)}</div></div></div>`).join('');
  $('chips').innerHTML = QUICK.map(([key, l]) => `<button class="chip" type="button" aria-pressed="${F.quick===key}" data-q="${key}">${l}</button>`).join('');
  $('thead').innerHTML = COLS.map(([key, l]) => `<th${key==='qty'?' style="text-align:right"':''}><button type="button" data-sort="${key}">${l}${sortKey===key?(sortDir>0?' ▲':' ▼'):''}</button></th>`).join('');
  $('count').textContent = `${list.length} of ${rows.length} machines`;
  $('tbody').innerHTML = list.map(r => {
    const ch = etaDelta(r);
    return `<tr class="${sel===r.i?'sel':''}">
      <td><button class="t1b" type="button" data-i="${r.i}">${esc(r.t1b)}</button>${r.isNew?'<span class="tag blue">New</span>':''}</td>
      <td>${esc(r.site)}</td><td>${esc(r.plant)}</td><td>${esc(r.name)}</td><td>${esc(r.model)}</td><td class="num">${r.qty}</td>
      <td>${esc(r.vendor||'—')}</td><td>${badge(r.status)}</td><td>${fmtD(r.setup)}</td>
      <td>${fmtD(r.eta)}${isDelay(r)?'<span class="tag">Delay</span>':''}${ch?`<span class="tag ${ch<0?'blue':''}">${ch>0?'+':''}${ch}d</span>`:''}</td>
      <td>${esc(r.poNo||'—')}</td></tr>`;
  }).join('');
  $('empty').classList.toggle('hidden', list.length > 0);
}

/* ---------- Pop-up ---------- */
const POP = { ids: [], pos: 0, fromDash: false, returnFocus: null };

function openMachinePop(ids, i, fromDash) {
  POP.ids = ids.length ? ids : [i];
  POP.pos = Math.max(0, POP.ids.indexOf(i));
  POP.fromDash = !!fromDash;
  POP.returnFocus = document.activeElement;
  $('pop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderPop();
  $('popClose').focus();
}
function closePop() {
  $('pop').classList.add('hidden');
  document.body.style.overflow = '';
  if (!POP.fromDash) { sel = null; render(); }
  if (POP.returnFocus && document.body.contains(POP.returnFocus)) POP.returnFocus.focus();
}
function stepPop(d) {
  const n = POP.pos + d;
  if (n < 0 || n >= POP.ids.length) return;
  POP.pos = n; renderPop();
  const b = $(d < 0 ? 'popPrev' : 'popNext');
  (b && !b.disabled ? b : $('popClose')).focus();
}
function renderPop() {
  const r = rows[POP.ids[POP.pos]];
  if (!r) return;
  if (!POP.fromDash) { sel = r.i; render(); }
  const ch = etaDelta(r);
  const val = c => c === 'prevEta' ? (r.prevEta === null ? 'Not in last week\'s file' : fmtD(r.prevEta)) :
    DATE_COLS.includes(c) ? fmtD(r.a[c]) : c === C.type ? typeLabel(r.a[c]) : (r.a[c] === '' || r.a[c] == null ? '—' : r.a[c]);
  const key = [['Setup Date', fmtD(r.setup)], ['Confirm ETA', fmtD(r.eta)], ['ETA last week', r.prevEta === null ? 'New this week' : fmtD(r.prevEta)], ['PO NO', r.poNo || '—']];
  const first = POP.pos === 0, last = POP.pos === POP.ids.length - 1;
  $('popBody').innerHTML = `
    <div class="pophead">
      <div><div class="muted small">${esc(r.t1b)} · Item ${esc(r.a[C.item])}</div>
        <h2 id="popTitle">${esc(r.name)}</h2>
        <div class="tags">${badge(r.status)}${isDelay(r)?'<span class="tag">Delay</span>':''}${ch?`<span class="tag ${ch<0?'blue':''}">ETA ${ch>0?'+':''}${ch}d vs last week</span>`:''}${r.isNew?'<span class="tag blue">New this week</span>':''}</div></div>
      <button class="x" type="button" id="popClose" aria-label="Close">✕</button>
    </div>
    <div class="keystrip">${key.map(([l, v]) => `<div><span class="muted small">${l}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="popgrid">${GROUPS.map(([g, cols]) => `<div class="dgroup"><h3>${g}</h3>${cols.map(c =>
      `<div class="drow"><span>${c==='prevEta'?'ETA last week':LABEL[c]}</span><span>${esc(val(c))}</span></div>`).join('')}</div>`).join('')}</div>
    <div class="dgroup"><h3>Remarks</h3>
      <div class="remark"><span class="muted small">${LABEL[C.progress]}</span><div>${esc(val(C.progress))}</div></div>
      <div class="remark"><span class="muted small">${LABEL[C.pc]}</span><div>${esc(val(C.pc))}</div></div></div>
    <div class="popfoot">
      <button class="btn" type="button" id="popPrev" ${first?'disabled':''}>‹ Previous</button>
      <span class="muted small">${POP.pos + 1} of ${POP.ids.length}${POP.fromDash ? ` · <button type="button" class="linkish" id="popShow">Show in Machine List</button>` : ''}</span>
      <button class="btn" type="button" id="popNext" ${last?'disabled':''}>Next ›</button>
    </div>`;
  $('popClose').onclick = closePop;
  $('popPrev').onclick = () => stepPop(-1);
  $('popNext').onclick = () => stepPop(1);
  if ($('popShow')) $('popShow').onclick = () => {
    $('pop').classList.add('hidden'); document.body.style.overflow = '';
    clearListFilters(); F.search = String(r.t1b); syncListInputs(); go('list'); render();
  };
}

/* ---------- views inside the module ---------- */
function go(v) {
  view = v;
  $('viewDash').classList.toggle('hidden', v !== 'dash');
  $('viewList').classList.toggle('hidden', v !== 'list');
  document.querySelectorAll('[data-view]').forEach(b => b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  window.scrollTo(0, 0);
}

/* ---------- events (bound once) ---------- */
function initMO() {
  [['fSearch','search','input'],['fSite','site'],['fPlant','plant'],['fVendor','vendor'],['fStatus','status'],['fType','type'],['fFrom','from'],['fTo','to'],['fRule','rule']]
    .forEach(([id, key, ev]) => $(id).addEventListener(ev || 'change', e => { F[key] = e.target.value; render(); }));
  $('chips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { F.quick = b.dataset.q; render(); } });
  $('thead').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; const k = b.dataset.sort; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; render(); });
  $('tbody').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) openMachinePop(filtered().map(r => r.i), +b.dataset.i, false); });
  $('clearBtn').onclick = () => { clearListFilters(); syncListInputs(); render(); };
  $('xlsBtn').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([D.headers, ...filtered().map(r => r.a)]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Machines');
    XLSX.writeFile(wb, `DET_Machine_List_${today}.xlsx`);
  };
  $('pdfBtn').onclick = () => window.print();
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (D) go(b.dataset.view); }));
  $('pop').addEventListener('click', e => { if (e.target.id === 'pop') closePop(); });
  document.addEventListener('keydown', e => {
    if ($('pop').classList.contains('hidden')) return;
    if (e.key === 'Escape') closePop();
    if (e.key === 'ArrowLeft') stepPop(-1);
    if (e.key === 'ArrowRight') stepPop(1);
  });
}
