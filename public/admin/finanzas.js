/* HZ CARS · Finanzas (ingresos, gastos, rentabilidad por coche, costes fijos, gráficas) */
const CAT = {
  gastoVeh: ['Compra del vehículo','Reparación / taller','Chapa y pintura','Neumáticos','ITV y revisión','Gestoría y cambio de nombre','Transporte / grúa','Limpieza y preparación','Publicidad del anuncio','Comisión','Otros del vehículo'],
  gastoGen: ['Alquiler del local','Suministros (luz, agua, internet)','Seguros','Cuota de autónomos / impuestos','Sueldos y colaboradores','Publicidad general','Software y web','Combustible y desplazamientos','Herramientas y material','Gestoría / asesoría','Otros gastos generales'],
  ingVeh: ['Venta de vehículo','Señal / reserva'],
  ingGen: ['Comisión por intermediación','Servicio de gestoría','Reparaciones a terceros','Alquiler y otros servicios','Otros ingresos']
};
const VENTA = 'Venta de vehículo', COMPRA = 'Compra del vehículo';
const eur = (n, d = 0) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(Number(n || 0));
const eur2 = n => eur(n, Math.abs(n % 1) > 0.004 ? 2 : 0);
const pct = n => (isFinite(n) ? Math.round(n * 10) / 10 : 0).toLocaleString('es-ES') + ' %';
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const fdate = s => s ? parseD(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const PAL = ['#E53935', '#111111', '#FF6E63', '#6b6b6b', '#f0a500', '#2b7de9', '#8e5bd4', '#1f9d55', '#bdbdbd', '#a52a2a', '#3a3a3a'];

S.fin = S.fin || { movs: [], fijos: [] };
S.fv = 'resumen';           // resumen | movs | veh | fijos
S.rk = 'mes';               // rango
S.rf = ''; S.rt = '';       // rango personalizado
S.mt = 'todos'; S.mv = 'todos'; S.mq = ''; // filtros de movimientos
S.vm = 'vendidos';          // por vehículo
S.charts = [];

/* ---------- periodos ---------- */
function rango(k) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), today = ymd(n);
  const first = (yy, mm) => ymd(new Date(yy, mm, 1)), end = (yy, mm) => ymd(new Date(yy, mm + 1, 0));
  switch (k) {
    case 'mes': return { from: first(y, m), to: end(y, m), shift: 1 };
    case 'mesant': return { from: first(y, m - 1), to: end(y, m - 1), shift: 1 };
    case 'trim': { const q = Math.floor(m / 3) * 3; return { from: first(y, q), to: end(y, q + 2), shift: 3 }; }
    case 'anio': return { from: first(y, 0), to: end(y, 11), shift: 12 };
    case 'anioant': return { from: first(y - 1, 0), to: end(y - 1, 11), shift: 12 };
    case '12m': return { from: first(y, m - 11), to: end(y, m), shift: 12 };
    case 'todo': {
      const ds = S.fin.movs.map(x => x.fecha).concat(S.fin.fijos.map(f => f.desde)).filter(Boolean).sort();
      return { from: ds[0] || today, to: today, shift: 0 };
    }
    default: { const f = S.rf || first(y, m), t = S.rt || today; return f <= t ? { from: f, to: t, shift: -1 } : { from: t, to: f, shift: -1 }; }
  }
}
function shiftMonths(s, k) { const d = parseD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(day, lastDay(d.getFullYear(), d.getMonth()))); return ymd(d); }
function prevRange(r) {
  if (r.shift === 0) return null;
  if (r.shift > 0) { const to = ymd(new Date(parseD(shiftMonths(r.to, -r.shift)))); let from = shiftMonths(r.from, -r.shift); return { from, to }; }
  const n = daysBetween(r.from, r.to) + 1; return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}
function virtuales(from, to) {
  const out = [];
  for (const f of S.fin.fijos) {
    if (!f.desde) continue;
    const d0 = parseD(f.desde), dd = d0.getDate(); let y = d0.getFullYear(), m = d0.getMonth();
    for (let i = 0; i < 1200; i++) {
      const c = ymd(new Date(y, m, Math.min(dd, lastDay(y, m))));
      if (c > to || (f.hasta && c > f.hasta)) break;
      if (c >= from && c >= f.desde) out.push({ id: 'v-' + f.id + '-' + c, fecha: c, tipo: f.tipo, categoria: f.categoria, concepto: (f.concepto || f.categoria) + ' (fijo)', importe: f.importe, vehiculoId: '', fijo: true, fijoId: f.id });
      if (f.frecuencia === 'anual') y++; else { m++; if (m > 11) { m = 0; y++; } }
    }
  }
  return out;
}
const enRango = (from, to) => S.fin.movs.filter(x => x.fecha >= from && x.fecha <= to).concat(virtuales(from, to));

/* ---------- análisis ---------- */
function analizar(from, to) {
  const L = enRango(from, to);
  const sum = a => a.reduce((t, x) => t + x.importe, 0);
  const ings = L.filter(x => x.tipo === 'ingreso'), gas = L.filter(x => x.tipo === 'gasto');
  const ing = sum(ings), gasto = sum(gas), ben = ing - gasto;
  const compra = sum(gas.filter(x => x.vehiculoId && x.categoria === COMPRA));
  const prep = sum(gas.filter(x => x.vehiculoId && x.categoria !== COMPRA));
  const gen = sum(gas.filter(x => !x.vehiculoId));
  const ventas = ings.filter(x => x.categoria === VENTA);
  const porCat = arr => { const m = {}; arr.forEach(x => m[x.categoria] = (m[x.categoria] || 0) + x.importe); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  // series
  const dias = daysBetween(from, to) + 1;
  const meses = (parseD(to).getFullYear() - parseD(from).getFullYear()) * 12 + parseD(to).getMonth() - parseD(from).getMonth() + 1;
  const modo = dias <= 62 ? 'dia' : meses <= 48 ? 'mes' : 'anio';
  const keyOf = f => modo === 'dia' ? f : modo === 'mes' ? f.slice(0, 7) : f.slice(0, 4);
  const keys = [];
  if (modo === 'dia') for (let i = 0; i < dias; i++) keys.push(addDays(from, i));
  else if (modo === 'mes') { let d = parseD(from); d.setDate(1); while (ymd(d) <= to) { keys.push(ymd(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); } }
  else for (let y = parseD(from).getFullYear(); y <= parseD(to).getFullYear(); y++) keys.push(String(y));
  const si = keys.map(() => 0), sg = keys.map(() => 0);
  L.forEach(x => { const i = keys.indexOf(keyOf(x.fecha)); if (i >= 0) (x.tipo === 'ingreso' ? si : sg)[i] += x.importe; });
  const labels = keys.map(k => modo === 'dia' ? k.slice(8) + '/' + k.slice(5, 7) : modo === 'mes' ? new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) : k);
  let acc = 0; const cum = si.map((v, i) => (acc += v - sg[i]));
  return { L, ing, gasto, ben, margen: ing ? ben / ing * 100 : 0, compra, prep, gen, nVentas: ventas.length, catG: porCat(gas), catI: porCat(ings), labels, si, sg, cum, modo };
}
function vehiculos() {
  const m = {};
  S.fin.movs.forEach(x => {
    if (!x.vehiculoId) return;
    const v = m[x.vehiculoId] ||= { id: x.vehiculoId, nombre: x.vehiculoNombre || 'Vehículo', gastos: 0, ingresos: 0, compra: 0, extra: 0, venta: 0, fVenta: '', fIni: '', n: 0 };
    v.n++;
    if (x.tipo === 'gasto') { v.gastos += x.importe; if (x.categoria === COMPRA) v.compra += x.importe; else v.extra += x.importe; if (!v.fIni || x.fecha < v.fIni) v.fIni = x.fecha; }
    else { v.ingresos += x.importe; if (x.categoria === VENTA) { v.venta += x.importe; if (!v.fVenta || x.fecha > v.fVenta) v.fVenta = x.fecha; } }
  });
  return Object.values(m).map(v => {
    const live = S.vehicles.find(z => z.id === v.id);
    if (live) v.nombre = `${live.marca} ${live.modelo}${live.anio ? ' ' + live.anio : ''}`;
    v.vendido = !!v.fVenta; v.ben = v.ingresos - v.gastos; v.margen = v.ingresos ? v.ben / v.ingresos * 100 : 0;
    v.dias = v.fVenta && v.fIni ? daysBetween(v.fIni, v.fVenta) : (v.fIni ? daysBetween(v.fIni, ymd(new Date())) : 0);
    v.live = live; return v;
  });
}

/* ---------- render principal ---------- */
function renderFin() {
  const R = rango(S.rk);
  const chips = [['mes', 'Este mes'], ['mesant', 'Mes pasado'], ['trim', 'Trimestre'], ['anio', 'Este año'], ['anioant', 'Año pasado'], ['12m', 'Últimos 12 meses'], ['todo', 'Todo'], ['custom', 'Personalizado']]
    .map(([k, n]) => `<button class="chip ${S.rk === k ? 'on' : ''}" data-rk="${k}">${n}</button>`).join('');
  const subs = [['resumen', 'Resumen'], ['movs', 'Movimientos'], ['veh', 'Por vehículo'], ['fijos', 'Costes fijos']]
    .map(([k, n]) => `<button class="tab sm ${S.fv === k ? 'on' : ''}" data-fv="${k}">${n}</button>`).join('');
  const custom = S.rk === 'custom' ? `<div class="g2 cust"><div><label class="f">Desde</label><input type="date" id="rf" value="${R.from}"></div><div><label class="f">Hasta</label><input type="date" id="rt" value="${R.to}"></div></div>` : '';
  let body = '';
  if (S.fv === 'resumen') body = finResumen(R); else if (S.fv === 'movs') body = finMovs(R); else if (S.fv === 'veh') body = finVeh(R); else body = finFijos();
  return `<div class="finbar"><div class="chips">${chips}</div><button class="btn sm" id="newmov">+ Añadir movimiento</button></div>${custom}
  <div class="rangeinfo">${fdate(R.from)} → ${fdate(R.to)}</div>
  <div class="subtabs">${subs}</div>${body}`;
}
function finAfter() {
  const m = $('main');
  m.querySelectorAll('[data-rk]').forEach(b => b.onclick = () => { S.rk = b.dataset.rk; render(); });
  m.querySelectorAll('[data-fv]').forEach(b => b.onclick = () => { S.fv = b.dataset.fv; render(); });
  if ($('rf')) { $('rf').onchange = () => { S.rf = $('rf').value; render(); }; $('rt').onchange = () => { S.rt = $('rt').value; render(); }; }
  $('newmov').onclick = () => openMov({});
  if (S.fv === 'resumen') drawCharts();
  if (S.fv === 'movs') bindMovs();
  if (S.fv === 'veh') m.querySelectorAll('[data-vm]').forEach(b => b.onclick = () => { S.vm = b.dataset.vm; render(); });
  if (S.fv === 'fijos') bindFijos();
}

/* ---------- RESUMEN ---------- */
function delta(cur, prev, bueno) {
  if (prev === null || prev === undefined) return '';
  if (!prev && !cur) return '<span class="dl">sin cambios</span>';
  if (!prev) return '<span class="dl">nuevo</span>';
  const d = (cur - prev) / Math.abs(prev) * 100, up = d >= 0, good = bueno === 'up' ? up : !up;
  return `<span class="dl ${good ? 'ok' : 'ko'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(d))} % vs anterior</span>`;
}
/* resultado "devengado": cada coche vendido cuenta con TODOS sus gastos, aunque se pagaran en otro mes */
function resultados(from, to, V) {
  const A = analizar(from, to);
  const vend = V.filter(v => v.vendido && v.fVenta >= from && v.fVenta <= to);
  const compraV = vend.reduce((t, v) => t + v.compra, 0), extraV = vend.reduce((t, v) => t + v.extra, 0);
  const ingV = vend.reduce((t, v) => t + v.ingresos, 0);
  const genG = A.L.filter(x => !x.vehiculoId && x.tipo === 'gasto').reduce((t, x) => t + x.importe, 0);
  const genI = A.L.filter(x => !x.vehiculoId && x.tipo === 'ingreso').reduce((t, x) => t + x.importe, 0);
  const ingDev = ingV + genI, ben = ingDev - compraV - extraV - genG;
  return { A, vend, compraV, extraV, ingV, genG, genI, ingDev, ben, margen: ingDev ? ben / ingDev * 100 : 0 };
}
function finResumen(R) {
  if (!S.fin.movs.length && !S.fin.fijos.length) return `<div class="empty"><b>Aún no hay movimientos</b>Empieza registrando la compra de un coche, sus gastos y su venta, o tus costes fijos (alquiler, seguros…). Aquí verás gráficas y resultados.</div>`;
  const V = vehiculos(), P = prevRange(R);
  const T = resultados(R.from, R.to, V), B = P ? resultados(P.from, P.to, V) : null, A = T.A;
  const kpi = (t, v, sub, cls = '') => `<div class="kpi ${cls}"><small>${t}</small><b>${v}</b>${sub || ''}</div>`;
  const stock = V.filter(v => !v.vendido && (!v.live || v.live.estado !== 'vendido'));
  const inmov = stock.reduce((t, v) => t + v.gastos, 0);
  const vendAll = V.filter(v => v.vendido), baseBen = T.vend.length ? T.vend : vendAll;
  const benMedio = baseBen.length ? baseBen.reduce((t, v) => t + v.ben, 0) / baseBen.length : 0;
  const diasMed = T.vend.length ? T.vend.reduce((t, v) => t + v.dias, 0) / T.vend.length : 0;
  const hoy = ymd(new Date());
  const fijosMes = S.fin.fijos.filter(f => f.tipo === 'gasto' && (!f.hasta || f.hasta >= hoy)).reduce((t, f) => t + (f.frecuencia === 'anual' ? f.importe / 12 : f.importe), 0);
  const necesarios = benMedio > 0 && fijosMes > 0 ? Math.ceil(fijosMes / benMedio) : 0;
  const tot = Math.max(T.ingDev, T.compraV + T.extraV + T.genG), benPos = Math.max(T.ben, 0);
  const seg = [['Coste de los coches vendidos', T.compraV, '#111'], ['Preparación y gastos de esos coches', T.extraV, '#E53935'], ['Costes fijos y generales', T.genG, '#FF6E63'], ['Beneficio', benPos, '#1f9d55']];
  const reparto = tot ? `<div class="stack">${seg.filter(s => s[1] > 0).map(s => `<div style="flex:${s[1]};background:${s[2]}" title="${s[0]}: ${eur(s[1])}"><span>${Math.round(s[1] / tot * 100)}%</span></div>`).join('')}</div>
    <div class="legend">${seg.map(s => `<span><i style="background:${s[2]}"></i>${s[0]} <b>${eur(s[1])}</b></span>`).join('')}</div>
    ${T.ben < 0 ? `<p class="warn">En este periodo el resultado es negativo: <b>${eur(T.ben)}</b>. Revisa los costes fijos y el margen de cada venta.</p>` : ''}` : '<p class="hint">Sin ventas ni costes en este periodo.</p>';
  const headReparto = T.ben >= 0 ? 'De cada 100 € que vendes, ¿a dónde van?' : 'Este periodo los costes superan a las ventas';
  return `<div class="kpis">
    ${kpi('Beneficio neto', eur(T.ben), delta(T.ben, B && B.ben, 'up'), T.ben >= 0 ? 'g big' : 'r big')}
    ${kpi('Margen', pct(T.margen), delta(T.margen, B && B.margen, 'up'))}
    ${kpi('Vehículos vendidos', T.vend.length, '<span class="dl">' + (T.vend.length ? 'beneficio medio ' + eur(benMedio) + ' por coche' : 'en el periodo') + '</span>')}
    ${kpi('Ingresos (dinero que entra)', eur(A.ing), delta(A.ing, B && B.A.ing, 'up'), 'g')}
    ${kpi('Gastos (dinero que sale)', eur(A.gasto), delta(A.gasto, B && B.A.gasto, 'down'), 'r')}
    ${kpi('Capital parado en stock', eur(inmov), '<span class="dl">' + stock.length + (stock.length === 1 ? ' vehículo' : ' vehículos') + ' con coste sin vender</span>')}
  </div>
  <p class="hint" style="margin:-4px 6px 16px">El <b>beneficio</b> cuenta cada coche vendido con todos sus gastos (aunque se pagaran en otro mes) y descuenta los costes fijos. Los <b>ingresos y gastos</b> son el dinero real que entró y salió: la caja del periodo es <b class="${A.ben >= 0 ? 'pos' : 'neg'}">${eur(A.ben)}</b>.</p>
  <div class="cards2">
    <div class="pan"><h3>${headReparto}</h3>${reparto}</div>
    <div class="pan eq"><h3>Punto de equilibrio</h3>${fijosMes > 0 ? `<div class="big">${necesarios || '—'}</div><p>${necesarios ? `coches al mes para cubrir tus <b>${eur(fijosMes)}</b> de costes fijos (con un beneficio medio de ${eur(benMedio)} por coche).` : `Costes fijos: <b>${eur(fijosMes)}/mes</b>. Aún no hay ventas con beneficio para calcularlo.`}</p>` : `<p class="hint">Añade tus costes fijos (alquiler, seguros, autónomos…) en «Costes fijos» y verás cuántos coches necesitas vender al mes para cubrirlos.</p>`}
      ${diasMed ? `<div class="mini"><b>${Math.round(diasMed)} días</b> de media entre la primera inversión y la venta</div>` : ''}</div>
  </div>
  <div class="cards2">
    <div class="pan"><h3>Entradas y salidas de dinero</h3><div class="cv"><canvas id="c1"></canvas></div></div>
    <div class="pan"><h3>En qué se gasta</h3><div class="cv sm"><canvas id="c2"></canvas></div></div>
  </div>
  <div class="cards2">
    <div class="pan"><h3>Beneficio por vehículo vendido</h3><div class="cv"><canvas id="c3"></canvas></div></div>
    <div class="pan"><h3>De dónde vienen los ingresos</h3><div class="cv sm"><canvas id="c4"></canvas></div></div>
  </div>`;
}
function drawCharts() {
  S.charts.forEach(c => c.destroy()); S.charts = [];
  if (typeof Chart === 'undefined' && $('c1') && !drawCharts.r) { drawCharts.r = 1; setTimeout(() => { drawCharts.r = 0; if (S.tab === 'fin' && S.fv === 'resumen') drawCharts(); }, 800); return; }
  if (typeof Chart === 'undefined' || !$('c1')) { if ($('c1')) $('c1').parentElement.innerHTML = '<p class="hint">No se han podido cargar las gráficas. Comprueba tu conexión.</p>'; return; }
  const R = rango(S.rk), A = analizar(R.from, R.to);
  Chart.defaults.font.family = 'Roboto, sans-serif'; Chart.defaults.color = '#555';
  const tip = { callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${eur2(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } };
  S.charts.push(new Chart($('c1'), { data: { labels: A.labels, datasets: [
    { type: 'bar', label: 'Ingresos', data: A.si, backgroundColor: '#1f9d55', borderRadius: 6, order: 2 },
    { type: 'bar', label: 'Gastos', data: A.sg, backgroundColor: '#E53935', borderRadius: 6, order: 2 },
    { type: 'line', label: 'Caja acumulada', data: A.cum, borderColor: '#111', backgroundColor: '#111', tension: .3, pointRadius: A.labels.length > 40 ? 0 : 3, borderWidth: 2.5, order: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: tip }, scales: { y: { ticks: { callback: v => eur(v) }, grid: { color: '#eee' } }, x: { grid: { display: false } } } } }));
  const doughnut = (id, arr, empty) => {
    if (!arr.length) { $(id).parentElement.innerHTML = `<p class="hint">${empty}</p>`; return; }
    S.charts.push(new Chart($(id), { type: 'doughnut', data: { labels: arr.map(a => a[0]), datasets: [{ data: arr.map(a => a[1]), backgroundColor: arr.map((_, i) => PAL[i % PAL.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${eur2(c.parsed)}` } } } } }));
  };
  doughnut('c2', A.catG, 'No hay gastos en este periodo.');
  doughnut('c4', A.catI, 'No hay ingresos en este periodo.');
  const vs = vehiculos().filter(v => v.vendido && v.fVenta >= R.from && v.fVenta <= R.to).sort((a, b) => b.ben - a.ben).slice(0, 12);
  if (!vs.length) $('c3').parentElement.innerHTML = '<p class="hint">Aún no hay coches vendidos en este periodo. Registra la compra, los gastos y la venta de un vehículo para ver su beneficio.</p>';
  else S.charts.push(new Chart($('c3'), { type: 'bar', data: { labels: vs.map(v => v.nombre), datasets: [{ data: vs.map(v => v.ben), backgroundColor: vs.map(v => v.ben >= 0 ? '#1f9d55' : '#E53935'), borderRadius: 6, maxBarThickness: 34 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` Beneficio: ${eur2(c.parsed.x)}` } } }, scales: { x: { ticks: { callback: v => eur(v) }, grid: { color: '#eee' } }, y: { grid: { display: false } } } } }));
}

/* ---------- MOVIMIENTOS ---------- */
function finMovs(R) {
  let L = enRango(R.from, R.to).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (S.mt !== 'todos') L = L.filter(x => x.tipo === S.mt);
  if (S.mv === 'con') L = L.filter(x => x.vehiculoId); if (S.mv === 'sin') L = L.filter(x => !x.vehiculoId);
  const q = S.mq.trim().toLowerCase();
  if (q) L = L.filter(x => [x.concepto, x.categoria, x.vehiculoNombre, x.nota].join(' ').toLowerCase().includes(q));
  const ing = L.filter(x => x.tipo === 'ingreso').reduce((t, x) => t + x.importe, 0), gas = L.filter(x => x.tipo === 'gasto').reduce((t, x) => t + x.importe, 0);
  const rows = L.map(x => `<article class="mv ${x.fijo ? 'fx' : ''}" data-id="${esc(x.id)}">
    <div class="d">${fdate(x.fecha)}</div>
    <div class="t"><b>${esc(x.concepto || x.categoria)}</b><small>${esc(x.categoria)}${x.vehiculoNombre ? ` · <span class="vt">${esc(x.vehiculoNombre)}</span>` : ' · general'}${x.fijo ? ' · <span class="vt">Coste fijo</span>' : ''}</small>${x.nota ? `<small class="nt">${esc(x.nota)}</small>` : ''}</div>
    <div class="a ${x.tipo === 'ingreso' ? 'pos' : 'neg'}">${x.tipo === 'ingreso' ? '+' : '−'}${eur2(x.importe)}</div>
    <div class="ac">${x.fijo ? '<button class="btn sm ghost" data-a="gofijos">Ver fijo</button>' : '<button class="btn sm ghost" data-a="edit">Editar</button><button class="btn sm danger" data-a="del">✕</button>'}</div></article>`).join('');
  return `<div class="filt"><div class="chips">${[['todos', 'Todos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']].map(([k, n]) => `<button class="chip ${S.mt === k ? 'on' : ''}" data-mt="${k}">${n}</button>`).join('')}</div>
    <select id="mvsel">${[['todos', 'Con y sin vehículo'], ['con', 'Solo asociados a un vehículo'], ['sin', 'Solo generales (sin vehículo)']].map(([k, n]) => `<option value="${k}" ${S.mv === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <input id="mq" type="search" placeholder="Buscar…" value="${esc(S.mq)}"><button class="btn sm ghost" id="csv">Exportar CSV</button></div>
    <div class="tot"><span>Ingresos <b class="pos">${eur2(ing)}</b></span><span>Gastos <b class="neg">${eur2(gas)}</b></span><span>Resultado <b>${eur2(ing - gas)}</b></span><span class="hint">${L.length} movimientos</span></div>
    <div class="list">${rows || '<div class="empty"><b>No hay movimientos</b>Ajusta el periodo o los filtros, o añade uno con «+ Añadir movimiento».</div>'}</div>`;
}
function bindMovs() {
  const m = $('main');
  m.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { S.mt = b.dataset.mt; render(); });
  $('mvsel').onchange = e => { S.mv = e.target.value; render(); };
  $('mq').oninput = e => { S.mq = e.target.value; clearTimeout(bindMovs.t); bindMovs.t = setTimeout(() => { render(); const i = $('mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $('csv').onclick = exportCsv;
  m.querySelectorAll('.mv').forEach(r => {
    const id = r.dataset.id, e = r.querySelector('[data-a=edit]'), d = r.querySelector('[data-a=del]'), g = r.querySelector('[data-a=gofijos]');
    if (e) e.onclick = () => openMov({ edit: id });
    if (d) d.onclick = () => confirmBox('¿Eliminar este movimiento?', 'Se borrará definitivamente de la contabilidad.', 'Eliminar', async () => { try { await api('admin/movs/' + id, { method: 'DELETE' }); S.fin.movs = S.fin.movs.filter(x => x.id !== id); render(); toast('Movimiento eliminado'); } catch (er) { toast(er.message, 1); } });
    if (g) g.onclick = () => { S.fv = 'fijos'; render(); };
  });
}
function exportCsv() {
  const R = rango(S.rk); let L = enRango(R.from, R.to).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (S.mt !== 'todos') L = L.filter(x => x.tipo === S.mt);
  if (S.mv === 'con') L = L.filter(x => x.vehiculoId); if (S.mv === 'sin') L = L.filter(x => !x.vehiculoId);
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Vehículo', 'Importe', 'Nota'].map(q).join(';')]
    .concat(L.map(x => [x.fecha, x.tipo, x.categoria, x.concepto, x.vehiculoNombre || '', String(x.importe).replace('.', ','), x.nota || ''].map(q).join(';')));
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hzcars-movimientos-${R.from}_${R.to}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- POR VEHÍCULO ---------- */
function finVeh(R) {
  let V = vehiculos();
  if (S.vm === 'vendidos') V = V.filter(v => v.vendido && v.fVenta >= R.from && v.fVenta <= R.to);
  else if (S.vm === 'stock') V = V.filter(v => !v.vendido);
  V.sort((a, b) => (b.fVenta || '9').localeCompare(a.fVenta || '9'));
  const chips = [['vendidos', 'Vendidos en el periodo'], ['stock', 'En stock (sin vender)'], ['todos', 'Todos']].map(([k, n]) => `<button class="chip ${S.vm === k ? 'on' : ''}" data-vm="${k}">${n}</button>`).join('');
  const tg = V.filter(v => v.vendido).reduce((t, v) => t + v.ben, 0), ti = V.filter(v => !v.vendido).reduce((t, v) => t + v.gastos, 0);
  const cards = V.map(v => `<article class="vc"><div class="vh"><div><h3>${esc(v.nombre)}</h3><small>${v.vendido ? `Vendido el ${fdate(v.fVenta)} · ${v.dias} días` : `En stock desde ${fdate(v.fIni)} · ${v.dias} días`}</small></div>
      <div class="res ${v.vendido ? (v.ben >= 0 ? 'pos' : 'neg') : ''}">${v.vendido ? (v.ben >= 0 ? '+' : '−') + eur2(Math.abs(v.ben)) : 'En curso'}<small>${v.vendido ? 'margen ' + pct(v.margen) : eur2(v.gastos) + ' invertidos'}</small></div></div>
      <div class="bk"><div><small>Compra</small><b>${eur2(v.compra)}</b></div><div><small>Otros gastos</small><b>${eur2(v.extra)}</b></div><div><small>Coste total</small><b>${eur2(v.gastos)}</b></div><div><small>${v.vendido ? 'Venta' : 'Ingresos'}</small><b>${eur2(v.vendido ? v.venta : v.ingresos)}</b></div></div>
      <div class="vact"><button class="btn sm ghost" data-addv="${v.id}">+ Gasto o ingreso</button></div></article>`).join('');
  return `<div class="chips" style="margin-bottom:14px">${chips}</div>
    <div class="tot"><span>${V.length} vehículos</span>${S.vm !== 'stock' ? `<span>Beneficio de los vendidos <b class="${tg >= 0 ? 'pos' : 'neg'}">${eur2(tg)}</b></span>` : ''}${S.vm !== 'vendidos' ? `<span>Capital en stock <b>${eur2(ti)}</b></span>` : ''}</div>
    <div class="list">${cards || '<div class="empty"><b>No hay vehículos con movimientos en esta vista</b>Para que salgan aquí, registra movimientos asociados a un vehículo (compra, reparaciones, venta…).</div>'}</div>`;
}

/* ---------- COSTES FIJOS ---------- */
function finFijos() {
  const F = S.fin.fijos;
  const mes = F.filter(f => f.tipo === 'gasto').reduce((t, f) => t + (f.frecuencia === 'anual' ? f.importe / 12 : f.importe), 0);
  const rows = F.map(f => `<article class="mv" data-id="${f.id}"><div class="d">${f.frecuencia === 'anual' ? 'Anual' : 'Mensual'}</div>
    <div class="t"><b>${esc(f.concepto || f.categoria)}</b><small>${esc(f.categoria)} · desde ${fdate(f.desde)}${f.hasta ? ' hasta ' + fdate(f.hasta) : ' · sin fecha de fin'}</small></div>
    <div class="a ${f.tipo === 'ingreso' ? 'pos' : 'neg'}">${f.tipo === 'ingreso' ? '+' : '−'}${eur2(f.importe)}</div>
    <div class="ac"><button class="btn sm ghost" data-a="edit">Editar</button><button class="btn sm danger" data-a="del">✕</button></div></article>`).join('');
  return `<div class="bar"><p class="hint" style="max-width:520px">Apunta una vez los costes que se repiten (alquiler, seguros, autónomos, internet…) y se cargan solos cada mes o cada año en los resultados.</p><button class="btn sm" id="newfijo">+ Añadir coste fijo</button></div>
    <div class="tot"><span>Costes fijos al mes <b class="neg">${eur2(mes)}</b></span><span>Al año <b class="neg">${eur2(mes * 12)}</b></span></div>
    <div class="list">${rows || '<div class="empty"><b>Todavía no hay costes fijos</b>Por ejemplo: alquiler del local, cuota de autónomos, seguro, dominio y web…</div>'}</div>`;
}
function bindFijos() {
  $('newfijo').onclick = () => openFijo({});
  $('main').querySelectorAll('.mv').forEach(r => {
    const id = r.dataset.id;
    r.querySelector('[data-a=edit]').onclick = () => openFijo({ edit: id });
    r.querySelector('[data-a=del]').onclick = () => confirmBox('¿Eliminar este coste fijo?', 'Dejará de cargarse en los periodos pasados y futuros. Si solo ha terminado, mejor edítalo y pon una fecha de fin.', 'Eliminar', async () => { try { await api('admin/fijos/' + id, { method: 'DELETE' }); S.fin.fijos = S.fin.fijos.filter(x => x.id !== id); render(); toast('Coste fijo eliminado'); } catch (e) { toast(e.message, 1); } });
  });
}

/* ---------- formularios ---------- */
function fsheet(html) { $('fsheet').innerHTML = html; $('fov').classList.add('open'); document.body.style.overflow = 'hidden'; }
function fclose() { $('fov').classList.remove('open'); document.body.style.overflow = ''; }
$('fov').addEventListener('click', e => { if (e.target === $('fov')) fclose(); });
const opts = (arr, sel) => arr.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
function catsFor(tipo, veh) { return tipo === 'ingreso' ? (veh ? CAT.ingVeh : CAT.ingGen) : (veh ? CAT.gastoVeh : CAT.gastoGen); }

function openMov({ edit, pre = {}, title, skip }) {
  const m = edit ? S.fin.movs.find(x => x.id === edit) : { tipo: 'gasto', fecha: ymd(new Date()), vehiculoId: '', categoria: '', concepto: '', importe: '', nota: '', ...pre };
  const st = { tipo: m.tipo };
  const vehOpts = () => `<option value="">— Sin vehículo (gasto o ingreso general) —</option>` + S.vehicles.slice().sort((a, b) => (a.marca + a.modelo).localeCompare(b.marca + b.modelo)).map(v => `<option value="${v.id}" ${v.id === m.vehiculoId ? 'selected' : ''}>${esc(v.marca)} ${esc(v.modelo)}${v.anio ? ' ' + v.anio : ''}${v.estado === 'vendido' ? ' (vendido)' : ''}</option>`).join('')
    + (m.vehiculoId && !S.vehicles.find(v => v.id === m.vehiculoId) ? `<option value="${m.vehiculoId}" selected>${esc(m.vehiculoNombre || 'Vehículo eliminado')}</option>` : '');
  fsheet(`<div class="sh-h"><h2>${title || (edit ? 'Editar movimiento' : 'Nuevo movimiento')}</h2><button class="x" id="fx" aria-label="Cerrar">✕</button></div>
  <form class="sh-b" id="mf" autocomplete="off">
    <div class="seg" id="mseg"><button type="button" data-t="gasto" class="${m.tipo === 'gasto' ? 'on' : ''}">Gasto</button><button type="button" data-t="ingreso" class="${m.tipo === 'ingreso' ? 'on' : ''}">Ingreso</button></div>
    <div><label class="f">¿Está asociado a un vehículo?</label><select id="mveh">${vehOpts()}</select><div class="hint" style="margin:6px 4px 0">Los de un vehículo cuentan para su rentabilidad. Los «generales» son costes o ingresos de la empresa que no dependen de un coche.</div></div>
    <div><label class="f">Categoría *</label><select id="mcat" required></select></div>
    <div class="g2"><div><label class="f">Fecha *</label><input type="date" id="mfecha" required value="${m.fecha}"></div><div><label class="f">Importe (€) *</label><input id="mimp" required inputmode="decimal" placeholder="0,00" value="${m.importe ? String(m.importe).replace('.', ',') : ''}"></div></div>
    <div><label class="f">Concepto (opcional)</label><input id="mcon" maxlength="120" value="${esc(m.concepto)}" placeholder="Ej. Cambio de embrague, taller Pepe"></div>
    <div><label class="f">Nota (opcional)</label><input id="mnot" maxlength="300" value="${esc(m.nota)}"></div>
  </form>
  <div class="sh-f">${skip ? '<button class="btn ghost" id="mskip" type="button">Ahora no</button>' : '<button class="btn ghost" id="mcan" type="button">Cancelar</button>'}<button class="btn" id="msave" type="button">Guardar</button></div>`);
  const fill = () => { const veh = !!$('mveh').value; const list = catsFor(st.tipo, veh); const cur = $('mcat').value || m.categoria; $('mcat').innerHTML = opts(list, list.includes(cur) ? cur : (pre.categoria && list.includes(pre.categoria) ? pre.categoria : list[0])); };
  fill();
  $('mseg').querySelectorAll('button').forEach(b => b.onclick = () => { st.tipo = b.dataset.t; $('mseg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('mcat').value = ''; fill(); });
  $('mveh').onchange = () => { $('mcat').value = ''; fill(); };
  $('fx').onclick = fclose; if ($('mcan')) $('mcan').onclick = fclose; if ($('mskip')) $('mskip').onclick = fclose;
  $('msave').onclick = async () => {
    const f = $('mf'); if (!f.reportValidity()) return;
    const body = { tipo: st.tipo, vehiculoId: $('mveh').value, categoria: $('mcat').value, fecha: $('mfecha').value, importe: $('mimp').value, concepto: $('mcon').value, nota: $('mnot').value };
    $('msave').disabled = true; $('msave').textContent = 'Guardando…';
    try {
      const o = edit ? await api('admin/movs/' + edit, { method: 'PUT', json: body }) : await api('admin/movs', { method: 'POST', json: body });
      S.fin.movs = edit ? S.fin.movs.map(x => x.id === o.id ? o : x) : [o, ...S.fin.movs];
      fclose(); if (S.tab === 'fin') render(); toast('Movimiento guardado');
    } catch (e) { toast(e.message, 1); $('msave').disabled = false; $('msave').textContent = 'Guardar'; }
  };
}
function openFijo({ edit }) {
  const f = edit ? S.fin.fijos.find(x => x.id === edit) : { tipo: 'gasto', frecuencia: 'mensual', desde: ymd(new Date()), hasta: '', categoria: '', concepto: '', importe: '' };
  const st = { tipo: f.tipo };
  fsheet(`<div class="sh-h"><h2>${edit ? 'Editar' : 'Nuevo'} coste fijo</h2><button class="x" id="fx">✕</button></div>
  <form class="sh-b" id="ff" autocomplete="off">
    <div class="seg" id="fseg"><button type="button" data-t="gasto" class="${f.tipo === 'gasto' ? 'on' : ''}">Gasto fijo</button><button type="button" data-t="ingreso" class="${f.tipo === 'ingreso' ? 'on' : ''}">Ingreso fijo</button></div>
    <div><label class="f">Categoría *</label><select id="fcat"></select></div>
    <div><label class="f">Concepto</label><input id="fcon" maxlength="120" value="${esc(f.concepto)}" placeholder="Ej. Alquiler nave Sevilla"></div>
    <div class="g2"><div><label class="f">Importe (€) *</label><input id="fimp" required inputmode="decimal" value="${f.importe ? String(f.importe).replace('.', ',') : ''}" placeholder="0,00"></div>
      <div><label class="f">Se repite</label><select id="ffre"><option value="mensual" ${f.frecuencia === 'mensual' ? 'selected' : ''}>Cada mes</option><option value="anual" ${f.frecuencia === 'anual' ? 'selected' : ''}>Cada año</option></select></div></div>
    <div class="g2"><div><label class="f">Desde *</label><input type="date" id="fdes" required value="${f.desde}"></div><div><label class="f">Hasta (opcional)</label><input type="date" id="fhas" value="${f.hasta || ''}"></div></div>
    <div class="hint">Se cargará solo en cada mes (o año) a partir de la fecha de inicio, el mismo día.</div>
  </form><div class="sh-f"><button class="btn ghost" id="fcan" type="button">Cancelar</button><button class="btn" id="fsave" type="button">Guardar</button></div>`);
  const fill = () => { const l = st.tipo === 'ingreso' ? CAT.ingGen : CAT.gastoGen; const c = $('fcat').value || f.categoria; $('fcat').innerHTML = opts(l, l.includes(c) ? c : l[0]); }; fill();
  $('fseg').querySelectorAll('button').forEach(b => b.onclick = () => { st.tipo = b.dataset.t; $('fseg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('fcat').value = ''; fill(); });
  $('fx').onclick = $('fcan').onclick = fclose;
  $('fsave').onclick = async () => {
    if (!$('ff').reportValidity()) return;
    const body = { tipo: st.tipo, categoria: $('fcat').value, concepto: $('fcon').value, importe: $('fimp').value, frecuencia: $('ffre').value, desde: $('fdes').value, hasta: $('fhas').value };
    $('fsave').disabled = true;
    try {
      const o = edit ? await api('admin/fijos/' + edit, { method: 'PUT', json: body }) : await api('admin/fijos', { method: 'POST', json: body });
      S.fin.fijos = edit ? S.fin.fijos.map(x => x.id === o.id ? o : x) : [o, ...S.fin.fijos];
      fclose(); render(); toast('Coste fijo guardado');
    } catch (e) { toast(e.message, 1); $('fsave').disabled = false; }
  };
}

/* al marcar un coche como vendido, ofrece registrar la venta */
function askSale(id) {
  const v = S.vehicles.find(x => x.id === id); if (!v) return;
  if (S.fin.movs.some(x => x.vehiculoId === id && x.categoria === VENTA)) return;
  openMov({ pre: { tipo: 'ingreso', vehiculoId: id, categoria: VENTA, importe: v.precio, fecha: ymd(new Date()), concepto: `Venta ${v.marca} ${v.modelo}` }, title: 'Registrar la venta', skip: true });
}
