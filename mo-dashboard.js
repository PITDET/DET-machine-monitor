/**
 * mo-dashboard.js — Machine Order Dashboard (Monitor / Analytics) + Weekly Report.
 * Uses the shared state from index.html: D, rows, C, F, info(), isOpen(), esc(), fmtD(), today.
 * Status meaning (ordered / delivered / accepted) comes from the Settings sheet.
 */
const DT = { site: '', plant: '', tab: 'monitor' };
const DASH_LISTS = { timeline: [], alerts: [], changes: [] };
const PAL = ['#C5CFDD', '#9DB9E3', '#3F7FD9', '#1D5FBF', '#0F2A4F'];

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
const short = s => s ? `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]}` : '—';
function mondayOf(s) { const d = new Date(s + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; return addDays(s, -wd); }
function isoWeek(s) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - y) / 864e5 - 3 + (y.getUTCDay() + 6) % 7) / 7); }

function stages() {
  const m = D.statusMap;
  const known = Object.keys(m).sort((a, b) => (m[a].order || 99) - (m[b].order || 99));
  const extra = [...new Set(rows.map(r => r.status).filter(s => s && !m[s]))];
  return { list: known.concat(extra), known };
}
function colorOf(st, known) {
  const i = known.indexOf(st);
  if (i < 0) return '#B8C2CF';
  return PAL[Math.round(i * (PAL.length - 1) / Math.max(1, known.length - 1))];
}
const overdue = r => r.eta && isOpen(r) && r.eta < today;
const lateSetup = r => r.eta && r.setup && isOpen(r) && r.eta > r.setup;
const isAlert = r => overdue(r) || lateSetup(r);
const qsum = l => l.reduce((t, r) => t + r.qty, 0);
const demandMonth = r => { const m = +r.a[C.month]; return m >= 1 && m <= 12 ? m : (r.setup ? +r.setup.slice(5, 7) : 0); };
const demandYear = r => +r.a[C.year] || (r.setup ? +r.setup.slice(0, 4) : 0);

function dashRows() { return rows.filter(r => (!DT.site || r.site === DT.site) && (!DT.plant || r.plant === DT.plant)); }

function rateOf(R, flag, endMonth) {
  const y = +(D.dataAsOf || today).slice(0, 4);
  const w = R.filter(r => demandYear(r) === y && demandMonth(r) >= 1 && demandMonth(r) <= endMonth);
  const dn = w.filter(r => info(r.status)[flag]);
  return { p: qsum(w) ? Math.round(qsum(dn) / qsum(w) * 100) : 0, dn: qsum(dn), w: qsum(w) };
}

/* ============================ RENDER ============================ */
function renderDash() {
  if (!D) return;
  const R = dashRows();
  const { list: ST, known } = stages();
  const mon0 = mondayOf(today), wEnd = addDays(mon0, 6), w3End = addDays(mon0, 20);
  const asOfMonth = +(D.dataAsOf || today).slice(5, 7);

  // header + filters
  $('dSub').innerHTML = `Week ${isoWeek(today)} · ${short(mon0)}–${short(wEnd)} ${mon0.slice(0, 4)}
    <span class="pill ok">Data as of ${esc(short(D.dataAsOf))}</span><span class="muted">Compared with ${esc(short(D.previousAsOf))}</span>`;
  const opt = (k, all, cur) => `<option value="">${all}</option>` + [...new Set(rows.map(r => r[k]).filter(Boolean))].sort().map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  $('dSite').innerHTML = opt('site', 'All sites', DT.site);
  $('dPlant').innerHTML = opt('plant', 'All plants', DT.plant);
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === DT.tab));
  $('tabMonitor').hidden = DT.tab !== 'monitor';
  $('tabAnalytics').hidden = DT.tab !== 'analytics';

  const alerts = R.filter(isAlert).map(r => ({ r, od: overdue(r), days: overdue(r) ? diffDays(today, r.eta) : diffDays(r.eta, r.setup) }))
    .sort((a, b) => b.days - a.days);
  $('alertBadge').textContent = alerts.length;
  DASH_LISTS.alerts = alerts.map(a => a.r.i);

  /* ---------- Monitor ---------- */
  const thisWeek = R.filter(r => isOpen(r) && r.eta >= today && r.eta <= wEnd);
  const next2 = R.filter(r => isOpen(r) && r.eta > wEnd && r.eta <= w3End);
  const od = R.filter(overdue);
  const slipped = R.filter(r => r.prevEta && r.eta && r.eta > r.prevEta);
  const acc = R.filter(r => info(r.status).accepted);
  const kpis = [
    ['Arriving this week', thisWeek.length, qsum(thisWeek) + ' units', '#1D5FBF', 'var(--blue)', 'thisweek'],
    ['Next 2 weeks', next2.length, qsum(next2) + ' units', '#7FA3D6', 'var(--ink)', 'next2'],
    ['Alerts', alerts.length, 'Need follow-up', '#EA7A1F', 'var(--warn)', 'delay'],
    ['Past confirmed ETA', od.length, 'Not arrived yet', '#C2410C', 'var(--warn)', 'overdue'],
    ['ETA slipped', slipped.length, 'vs ' + short(D.previousAsOf), '#F2B48A', 'var(--warn)', 'changed'],
    ['Accepted YTD', qsum(acc), 'of ' + qsum(R) + ' units', '#0F2A4F', 'var(--ink)', 'accepted']
  ];
  $('dKpis').innerHTML = kpis.map(([l, v, s, bar, col, go]) =>
    `<button class="card kpi kbtn" type="button" data-go="${go}"><i style="background:${bar}"></i><span><span class="l">${l}</span><span class="v" style="color:${col}">${v}</span><span class="s">${esc(s)}</span></span></button>`).join('');

  const weeks = []; let maxW = 1;
  for (let k = 0; k < 8; k++) {
    const ws = addDays(mon0, 7 * k), we = addDays(ws, 6);
    const it = R.filter(r => isOpen(r) && r.eta >= ws && r.eta <= we).sort((a, b) => a.eta < b.eta ? -1 : 1);
    weeks.push({ ws, we, it }); maxW = Math.max(maxW, qsum(it));
  }
  DASH_LISTS.timeline = weeks.flatMap(w => w.it.map(r => r.i));
  $('weeks').innerHTML = weeks.map((w, k) => `
    <div class="wk${k === 0 ? ' now' : ''}">
      <div class="wkh"><b>W${isoWeek(w.ws)}</b>${k === 0 ? '<span class="pill blue">This week</span>' : ''}</div>
      <div class="muted small">${short(w.ws)} – ${short(w.we)}</div>
      <div class="small strong">${w.it.length ? `${w.it.length} items · ${qsum(w.it)} units` : '—'}</div>
      <div class="load"><span style="width:${Math.round(qsum(w.it) / maxW * 100)}%"></span></div>
      ${w.it.map(r => `<button type="button" class="wcard${isAlert(r) ? ' risk' : ''}" data-i="${r.i}" data-ctx="timeline">
          <span class="small strong muted"><i style="background:${isAlert(r) ? '#EA7A1F' : colorOf(r.status, known)}"></i>${esc(r.status)} · ${short(r.eta)}</span>
          <span class="nm">${esc(r.name)}</span><span class="small muted">${esc(r.site)} · ${esc(r.vendor || '—')} · x${r.qty}</span></button>`).join('')
        || '<div class="small muted">No arrivals</div>'}
    </div>`).join('');

  $('alerts').innerHTML = alerts.map(({ r, od, days }) => `
    <button type="button" class="alert" data-i="${r.i}" data-ctx="alerts">
      <span class="days${days >= 7 ? ' hot' : ''}"><b>${days}</b>days</span>
      <span><span class="small strong warn">${od ? 'Past confirmed ETA' : 'ETA after Setup Date'}</span>
      <span class="nm">${esc(r.name)}</span><span class="small muted">${esc(r.t1b)} · ${esc(r.site)} · ${esc(r.vendor || '—')}</span></span>
    </button>`).join('') || '<div class="muted">No alerts for this filter.</div>';

  /* ---------- Analytics ---------- */
  const byStage = ST.map(s => R.filter(r => r.status === s));
  const maxC = Math.max(1, ...byStage.map(l => l.length));
  $('pipe').innerHTML = ST.map((s, i) => `
    <button type="button" class="card stage" data-status="${esc(s)}">
      <span class="small strong muted">${i + 1}. ${esc(s)}${D.statusMap[s] ? '' : ' (not in Settings)'}</span>
      <span class="big">${byStage[i].length}<small> items · ${qsum(byStage[i])} units</small></span>
      <span class="bar"><span style="width:${Math.round(byStage[i].length / maxC * 100)}%;background:${colorOf(s, known)}"></span></span>
    </button>`).join('');

  const legend = ST.map(s => `<span><i style="background:${colorOf(s, known)}"></i>${esc(s)}</span>`).join('');
  document.querySelectorAll('.legend-status').forEach(el => el.innerHTML = legend);

  const year = +(D.dataAsOf || today).slice(0, 4);
  const months = MON.map((m, i) => R.filter(r => demandYear(r) === year && demandMonth(r) === i + 1));
  const maxM = Math.max(1, ...months.map(qsum));
  $('monthly').innerHTML = `<div class="cols">${months.map((l, i) => `
      <div class="col"><span class="small strong">${qsum(l) || ''}</span>
        <div class="stack">${ST.slice().reverse().map(s => { const q = qsum(l.filter(r => r.status === s)); return q ? `<span style="height:${Math.round(q / maxM * 170)}px;background:${colorOf(s, known)}"></span>` : ''; }).join('')}</div>
        <span class="small ${i + 1 === asOfMonth ? 'strong blue' : 'muted'}">${MON[i]}</span></div>`).join('')}</div>`;
  $('monthlyYear').textContent = `Demand qty by demand month, ${year}`;

  const total = qsum(R); let accp = 0; const stops = [];
  const mix = ST.map(s => { const q = qsum(R.filter(r => r.status === s)); const p = total ? q / total * 100 : 0; stops.push(`${colorOf(s, known)} ${accp}% ${accp + p}%`); accp += p; return { s, q, p }; });
  $('mix').innerHTML = `<div class="donut" style="background:conic-gradient(${stops.join(',') || '#E3EDFB 0 100%'})"><div><b>${total}</b><span class="small muted">units</span></div></div>
    <div class="mixlist">${mix.map(x => `<div><i style="background:${colorOf(x.s, known)}"></i><span>${esc(x.s)}</span><b>${x.q}</b><span class="muted">${Math.round(x.p)}%</span></div>`).join('')}</div>`;

  const RATES = [['ordered', 'Order rate', 12, 'Jan–Dec'], ['delivered', 'Delivery rate', asOfMonth, 'Jan–' + MON[asOfMonth - 1]], ['accepted', 'Acceptance rate', Math.max(1, asOfMonth - 1), 'Jan–' + MON[Math.max(0, asOfMonth - 2)]]];
  $('rates').innerHTML = RATES.map(([f, l, end, lab]) => {
    const r = rateOf(R, f, end); const c = r.p >= 90 ? '#1D5FBF' : r.p >= 70 ? '#3F7FD9' : '#EA7A1F';
    return `<div class="ring"><div class="rg" style="background:conic-gradient(${c} 0 ${r.p}%,#E3EDFB ${r.p}% 100%)"><div><b>${r.p}%</b></div></div>
      <b>${l}</b><span class="small muted">Demand ${lab} · ${r.dn}/${r.w}</span></div>`;
  }).join('');

  const RC = { ordered: '#9DB9E3', delivered: '#3F7FD9', accepted: '#0F2A4F' };
  const sites = [...new Set(R.map(r => r.site).filter(Boolean))].sort();
  $('siteRates').innerHTML = `<div class="grp">${sites.map(s => `<div class="g"><div class="gb">${RATES.map(([f, , end]) => { const r = rateOf(R.filter(x => x.site === s), f, end); return `<div class="gbar"><span class="small strong">${r.p}%</span><span style="height:${Math.round(r.p * 1.5)}px;background:${RC[f]}"></span></div>`; }).join('')}</div><b>${esc(s)}</b></div>`).join('')}</div>`;

  const vendors = [...new Set(R.map(r => r.vendor).filter(Boolean))].sort();
  const vt = vendors.map(v => qsum(R.filter(r => r.vendor === v))); const maxT = Math.max(1, ...vt);
  $('vendors').innerHTML = vendors.map((v, i) => { const l = R.filter(r => r.vendor === v); const al = l.filter(isAlert).length;
    return `<button type="button" class="vrow" data-vendor="${esc(v)}"><span class="vn">${esc(v)}</span>
      <span class="vbar">${ST.map(s => { const q = qsum(l.filter(r => r.status === s)); return q ? `<span style="width:${q / maxT * 100}%;background:${colorOf(s, known)}"></span>` : ''; }).join('')}</span>
      <span class="small muted vt">${vt[i]} units${al ? `<b class="warn"> · ${al} alert${al > 1 ? 's' : ''}</b>` : ''}</span></button>`; }).join('') || '<div class="muted">No vendor data.</div>';

  const changes = R.filter(r => r.prevEta && r.eta && r.prevEta !== r.eta).map(r => ({ r, d: diffDays(r.eta, r.prevEta) })).sort((a, b) => b.d - a.d);
  DASH_LISTS.changes = changes.map(c => c.r.i);
  $('slipBadge').textContent = `${changes.filter(c => c.d > 0).length} slipped`;
  $('changes').innerHTML = changes.map(({ r, d }) => `
    <button type="button" class="chg" data-i="${r.i}" data-ctx="changes"><span><span class="nm">${esc(r.name)}</span>
      <span class="small muted">${esc(r.t1b)} · ${esc(r.vendor || '—')} · ${short(r.prevEta)} → ${short(r.eta)}</span></span>
      <span class="cbar"><span style="width:${Math.min(100, Math.abs(d) / 21 * 100)}%;background:${d > 0 ? '#EA7A1F' : '#3F7FD9'}"></span></span>
      <b class="${d > 0 ? 'warn' : 'blue'}">${d > 0 ? '+' : ''}${d}d</b></button>`).join('') || '<div class="muted">No ETA changes vs last week.</div>';

  /* ---------- Weekly report ---------- */
  const scope = [DT.site || 'All sites', DT.plant || 'All plants'].join(' · ');
  const arrivals = R.filter(r => isOpen(r) && r.eta >= today && r.eta <= w3End).sort((a, b) => a.eta < b.eta ? -1 : 1);
  const del = rateOf(R, 'delivered', asOfMonth), accR = rateOf(R, 'accepted', Math.max(1, asOfMonth - 1));
  $('reportBody').innerHTML = `
    <div class="rhead"><div><div class="small" style="color:#A9BCD8">DET · Machine Order Weekly Summary</div>
      <h2>Week ${isoWeek(today)} · data as of ${esc(fmtD(D.dataAsOf))}</h2><div class="small" style="color:#A9BCD8">${esc(scope)}</div></div>
      <button type="button" class="x noprint" id="closeReport" aria-label="Close report">✕</button></div>
    <div class="rbody">
      <div class="rstats">
        <div><span class="small muted">Arriving this week</span><b class="blue">${thisWeek.length}</b></div>
        <div><span class="small muted">Alerts</span><b class="warn">${alerts.length}</b></div>
        <div><span class="small muted">Delivery rate</span><b>${del.p}%</b></div>
        <div><span class="small muted">Acceptance rate</span><b>${accR.p}%</b></div>
      </div>
      <h3>Top alerts</h3>${alerts.slice(0, 5).map(({ r, days }) => `<div class="rl"><span>${esc(r.name)} <span class="muted">· ${esc(r.t1b)} · ${esc(r.site)} · ${esc(r.vendor || '—')}</span></span><b class="warn">${days} days</b></div>`).join('') || '<div class="muted">None</div>'}
      <h3>Arriving in the next 3 weeks</h3>${arrivals.map(r => `<div class="rl"><span>${esc(r.name)} <span class="muted">· ${esc(r.site)} · x${r.qty}</span></span><b>ETA ${short(r.eta)}</b></div>`).join('') || '<div class="muted">None</div>'}
      <h3>ETA slipped vs last week</h3>${changes.filter(c => c.d > 0).slice(0, 5).map(({ r, d }) => `<div class="rl"><span>${esc(r.name)} <span class="muted">· ${short(r.prevEta)} → ${short(r.eta)}</span></span><b class="warn">+${d}d</b></div>`).join('') || '<div class="muted">None</div>'}
      <div class="ractions noprint"><button class="btn" type="button" id="closeReport2">Close</button><button class="btn primary" type="button" id="printReport">Save as PDF</button></div>
    </div>`;
}

/* ============================ EVENTS ============================ */
function openList(preset) {
  clearListFilters();
  const mon0 = mondayOf(today);
  if (preset === 'thisweek') { F.from = today; F.to = addDays(mon0, 6); }
  if (preset === 'next2') { F.from = addDays(mon0, 7); F.to = addDays(mon0, 20); }
  if (preset === 'delay') F.quick = 'delay';
  if (preset === 'overdue') { F.quick = 'delay'; F.rule = 'ETA passed, not arrived'; }
  if (preset === 'changed') F.quick = 'changed';
  if (preset === 'accepted') { const a = Object.keys(D.statusMap).filter(s => D.statusMap[s].accepted); if (a.length === 1) F.status = a[0]; }
  if (DT.site) F.site = DT.site;
  if (DT.plant) F.plant = DT.plant;
  syncListInputs(); go('list'); render();
}
function initDash() {
  $('viewDash').addEventListener('click', e => {
    const t = e.target.closest('[data-i],[data-go],[data-tab],[data-status],[data-vendor]');
    if (!t) return;
    if (t.dataset.i) return openMachinePop(DASH_LISTS[t.dataset.ctx] || [], +t.dataset.i, true);
    if (t.dataset.go) return openList(t.dataset.go);
    if (t.dataset.tab) { DT.tab = t.dataset.tab; return renderDash(); }
    const key = t.dataset.status ? 'status' : 'vendor';
    clearListFilters(); F[key] = t.dataset[key];
    if (DT.site) F.site = DT.site; if (DT.plant) F.plant = DT.plant;
    syncListInputs(); go('list'); render();
  });
  $('dSite').addEventListener('change', e => { DT.site = e.target.value; renderDash(); });
  $('dPlant').addEventListener('change', e => { DT.plant = e.target.value; renderDash(); });
  $('reportBtn').addEventListener('click', () => { $('report').classList.remove('hidden'); $('closeReport').focus(); });
  $('report').addEventListener('click', e => {
    if (e.target.id === 'report' || e.target.id === 'closeReport' || e.target.id === 'closeReport2') $('report').classList.add('hidden');
    if (e.target.id === 'printReport') { document.body.classList.add('print-report'); window.print(); document.body.classList.remove('print-report'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('report').classList.add('hidden'); });
}
