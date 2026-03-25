/* =====================================================
   ERP JW Finance v8.2.3 — CHARTS / RELATÓRIO
   - Sem dependências externas (100% offline)
   - Filtro por período (start/end) -> transações consolidadas
   - KPIs + Taxas (rates) consistentes com Core.calc
   - Gráficos: Macro (pizza), Comparativo (barras), Despesas por Categoria, Categorias por Banco, Evolução do Saldo
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Charts] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Sync] SyncService indisponível:', err); }
    bind();
    initControls();
    renderAll();

    // garantir atualização quando volta para a aba
    window.addEventListener('focus', () => renderAll());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

    // impressão/PDF (canvas -> snapshot)
    window.addEventListener('beforeprint', () => snapshotCanvases());
    window.addEventListener('afterprint', () => restoreCanvases());
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  function bind() {
    $('logoutBtn')?.addEventListener('click', async () => {
      const ok = (Core.ui?.confirm)
        ? await Core.ui.confirm('Deseja realmente sair?', 'Confirmar')
        : confirm('Deseja realmente sair?');
      if (ok) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });

    document.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
    $('btnApply')?.addEventListener('click', () => renderAll());
  }

  function fillMonthSelect(sel, months) {
    if (!sel) return;
    sel.innerHTML = '';
    months.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = Core.month.getMonthLabel(m);
      sel.appendChild(opt);
    });
  }

  function initControls() {
    const months = Core.period.listMonthIds(uid());
    const selected = Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
    const start = months.includes(selected) ? selected : (months[0] || selected);
    const end = start;

    fillMonthSelect($('chartsStart'), months.length ? months : [start]);
    fillMonthSelect($('chartsEnd'), months.length ? months : [end]);

    const s = $('chartsStart');
    const e = $('chartsEnd');
    if (s) s.value = start;
    if (e) e.value = end;
  }

  function paletteColors() {
    // paleta fixa (dark-friendly) - sem seletor na UI
    return ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#64748b','#22c55e','#eab308','#f97316'];
  }

  // valor robusto
  function txValue(t) {
    const v = t?.valor;
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return 0;
    return (window.Core?.format?.parseBRL) ? Core.format.parseBRL(v) : (Number(v) || 0);
  }

  function sum(list, getV) {
    return (list || []).reduce((acc, x) => acc + (Number(getV(x)) || 0), 0);
  }

  function groupSum(list, getKeyFn, getValFn) {
    const map = new Map();
    (list || []).forEach((t) => {
      const k = String(getKeyFn(t) ?? '—');
      const v = Number(getValFn(t)) || 0;
      map.set(k, (map.get(k) || 0) + v);
    });
    return map;
  }

  function buildPeriodLabel(range) {
    if (!range?.start || !range?.end) return '—';
    const a = Core.month.getMonthLabel(range.start);
    const b = Core.month.getMonthLabel(range.end);
    return (range.start === range.end) ? a : `${a} → ${b}`;
  }

  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt;
  }

  function fmtPct(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return `${Number(v).toFixed(1)}%`;
  }

  function renderLegend(targetId, labels, values, colors) {
    const el = $(targetId);
    if (!el) return;
    el.innerHTML = '';
    (labels || []).forEach((lab, i) => {
      const row = document.createElement('div');
      row.className = 'item';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = (colors && colors[i]) ? colors[i] : 'rgba(255,255,255,0.35)';

      const text = document.createElement('span');
      text.className = 'text';

      const v = (values && values[i] != null) ? values[i] : null;
      const suffix = (typeof v === 'number')
        ? ` — ${Core.format.brl(v)}`
        : (v != null ? ` — ${String(v)}` : '');
      text.textContent = `${lab}${suffix}`;

      row.appendChild(dot);
      row.appendChild(text);
      el.appendChild(row);
    });
  }

  // -------- SimpleCharts (Canvas 2D) --------
  const SimpleCharts = {
    clear(canvas) {
      const ctx = canvas?.getContext?.('2d');
      if (!ctx) return null;
      const w = canvas.width = canvas.clientWidth || 900;
      const h = canvas.height = canvas.clientHeight || 360;
      ctx.clearRect(0, 0, w, h);
      return { ctx, w, h };
    },

    pie(canvas, labels, values, colors) {
      const g = this.clear(canvas); if (!g) return;
      const { ctx, w, h } = g;
      const total = (values || []).reduce((a,b)=>a+(Number(b)||0),0);
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      if (!total) {
        ctx.fillStyle = 'rgba(148,163,184,0.9)';
        ctx.fillText('Sem dados para o período.', 16, 24);
        return;
      }
      const r = Math.min(w, h) * 0.30;
      const cx = w * 0.32, cy = h * 0.50;
      let ang = -Math.PI/2;
      (values || []).forEach((v, i) => {
        const vv = Number(v)||0;
        const slice = vv / total * Math.PI * 2;
        if (slice <= 0) return;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, ang, ang + slice);
        ctx.closePath();
        ctx.fillStyle = (colors && colors[i % colors.length]) || '#3b82f6';
        ctx.fill();
        ang += slice;
      });
    },

    bar(canvas, labels, values, colors) {
      const g = this.clear(canvas); if (!g) return;
      const { ctx, w, h } = g;
      const vals = (values || []).map(v=>Number(v)||0);
      const max = Math.max(...(vals.length?vals:[0]), 0);
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      if (!max) {
        ctx.fillStyle = 'rgba(148,163,184,0.9)';
        ctx.fillText('Sem dados para o período.', 16, 24);
        return;
      }
      const pad = 32;
      const chartW = w - pad*2;
      const chartH = h - pad*2;
      const n = Math.max(labels.length, 1);
      const slot = chartW / n;
      const barW = slot * 0.66;

      // axis baseline
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.beginPath();
      ctx.moveTo(pad, h-pad);
      ctx.lineTo(w-pad, h-pad);
      ctx.stroke();

      labels.forEach((lab, i) => {
        const v = vals[i] || 0;
        const bh = (v / max) * (chartH * 0.92);
        const x = pad + i*slot + (slot-barW)/2;
        const y = (h-pad) - bh;
        ctx.fillStyle = (colors && colors[i % colors.length]) || '#3b82f6';
        ctx.fillRect(x, y, barW, bh);

        // label (short)
        ctx.fillStyle = 'rgba(241,245,249,0.92)';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        const txt = String(lab);
        const shown = txt.length > 10 ? (txt.slice(0, 9) + '…') : txt;
        ctx.fillText(shown, x, h - 12);
      });
    },

    line(canvas, labels, values, color) {
      const g = this.clear(canvas); if (!g) return;
      const { ctx, w, h } = g;
      const vals = (values || []).map(v=>Number(v)||0);
      const max = Math.max(...(vals.length?vals:[0]), 0);
      const min = Math.min(...(vals.length?vals:[0]), 0);
      const span = Math.max(1, max - min);

      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      if (!(labels || []).length) {
        ctx.fillStyle = 'rgba(148,163,184,0.9)';
        ctx.fillText('Sem dados para o período.', 16, 24);
        return;
      }

      const pad = 42;
      const cw = w - pad*2;
      const ch = h - pad*2;

      // grid
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      for (let i=0;i<=4;i++){
        const yy = pad + (ch*(i/4));
        ctx.beginPath();
        ctx.moveTo(pad, yy);
        ctx.lineTo(w-pad, yy);
        ctx.stroke();
      }

      // line
      ctx.strokeStyle = color || '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      labels.forEach((_, i) => {
        const x = pad + (cw * (i / Math.max(1, labels.length-1)));
        const y = pad + ch - (((vals[i]||0) - min) / span) * ch;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      // points
      ctx.fillStyle = color || '#3b82f6';
      labels.forEach((_, i) => {
        const x = pad + (cw * (i / Math.max(1, labels.length-1)));
        const y = pad + ch - (((vals[i]||0) - min) / span) * ch;
        ctx.beginPath();
        ctx.arc(x,y,3,0,Math.PI*2);
        ctx.fill();
      });

      // x labels (sparse)
      ctx.fillStyle = 'rgba(241,245,249,0.92)';
      ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      const step = Math.max(1, Math.ceil(labels.length / 6));
      labels.forEach((lab, i) => {
        if (i % step !== 0 && i !== labels.length-1) return;
        const x = pad + (cw * (i / Math.max(1, labels.length-1)));
        ctx.fillText(String(lab), x-18, h - 12);
      });
    }
  };

  function renderAll() {
    const start = $('chartsStart')?.value || '';
    const end = $('chartsEnd')?.value || '';
    const colors = paletteColors();

    const res = Core.period.getTransactionsByPeriod(uid(), start, end);
    // Fase 3: filtrar soft-deleted antes de qualquer cálculo
    const txRaw = res.tx || [];
    const tx = window.SyncService?.visibleTx ? SyncService.visibleTx(txRaw) : txRaw.filter((t) => !t?.deletedAt);

    setText('monthLabel', buildPeriodLabel(res.range));

    // KPIs (fonte única: Core.calc.summary ou Core.getMetrics)
    const metrics = (Core.getMetrics) ? Core.getMetrics(tx) : { sum: Core.calc.summary(tx) };
    const sumAll = metrics.sum;

    // Essenciais / Livres (para rate correto)
    const desp = tx.filter((t) => t.tipo === 'despesa');
    const ess = sum(desp.filter((t) => t.subtipo === 'essencial'), (t) => txValue(t));
    const liv = sum(desp.filter((t) => t.subtipo === 'livre'), (t) => txValue(t));

    setText('kpiRenda', Core.format.brl(sumAll.renda));
    setText('kpiPoupanca', Core.format.brl(sumAll.poupanca));
    setText('kpiEssenciais', Core.format.brl(ess));
    setText('kpiLivres', Core.format.brl(liv));
    setText('kpiDividas', Core.format.brl(sumAll.dividas));
    setText('kpiSaldo', Core.format.brl(sumAll.saldo));

    const rates = Core.calc.rates({ renda: sumAll.renda, poupanca: sumAll.poupanca, dividas: sumAll.dividas, essenciais: ess, livres: liv });
    setText('percPoupanca', fmtPct(rates.poupanca));
    setText('percEssenciais', fmtPct(rates.essenciais));
    setText('percLivres', fmtPct(rates.livres));
    setText('percDividas', fmtPct(rates.endividamento));

    // ----------------------
    // Macro (pizza)
    // ----------------------
    const macroLabels = ['Renda', 'Poupança', 'Despesas', 'Dívidas'];
    const macroValues = [sumAll.renda, sumAll.poupanca, sumAll.despesas, sumAll.dividas];
    SimpleCharts.pie($('chartPizza'), macroLabels, macroValues, colors);
    renderLegend('legendMacro', macroLabels, macroValues, colors);

    // ----------------------
    // Comparativo (barras)
    // ----------------------
    const compLabels = ['Renda', 'Poupança', 'Essenciais', 'Livres', 'Dívidas', 'Saldo'];
    const compValues = [sumAll.renda, sumAll.poupanca, ess, liv, sumAll.dividas, sumAll.saldo];
    SimpleCharts.bar($('chartBarras'), compLabels, compValues, colors);
    renderLegend('legendComp', compLabels, compValues, colors);

    // ----------------------
    // Despesas por Categoria (Top 10)
    // ----------------------
    const catMap = groupSum(
      tx.filter((t) => t.tipo === 'despesa'),
      (t) => t.categoriaNome || t.categoria || '—',
      (t) => txValue(t)
    );
    const cats = Array.from(catMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 10);
    const catLabels = cats.map((c)=>c[0]);
    const catValues = cats.map((c)=>c[1]);
    SimpleCharts.bar($('chartCategorias'), catLabels, catValues, colors);
    renderLegend('legendCategorias', catLabels, catValues, colors);

    // ----------------------
    // Categorias por Banco (despesas por banco)
    // ----------------------
    const bankMap = groupSum(
      tx.filter((t) => t.tipo === 'despesa'),
      (t) => t.bancoNome || t.banco || '—',
      (t) => txValue(t)
    );
    const banks = Array.from(bankMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 10);
    const bankLabels = banks.map((b)=>b[0]);
    const bankValues = banks.map((b)=>b[1]);
    SimpleCharts.bar($('chartBancoCategorias'), bankLabels, bankValues, colors);
    renderLegend('legendBancoCat', bankLabels, bankValues, colors);

    // ----------------------
    // Evolução do Saldo (por mês) - usa o range escolhido
    // ----------------------
    // Core.period.monthsBetween não é contrato do Core (evita depender de função inexistente)
    // Fonte única: iterator oficial Core.period.iterateMonths(start, end)
    const months = [];
    if (res?.range?.start && res?.range?.end && Core.period?.iterateMonths) {
      for (const m of Core.period.iterateMonths(res.range.start, res.range.end)) months.push(m);
    }

    // Fallback: se o range estiver inválido/ausente, use o mês ativo para não deixar o gráfico vazio
    if (!months.length) {
      const fallbackMonth = Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
      months.push(fallbackMonth);
    }

    const saldoLabels = months.map((m) => Core.month.getMonthLabel(m));
    const saldoValues = months.map((monthId) => {
      const txm = Core.storage.getJSON(Core.keys.tx(uid(), monthId), []);
      const mm = (Core.getMetrics) ? Core.getMetrics(txm) : { sum: Core.calc.summary(txm) };
      return Number(mm.sum.saldo) || 0;
    });

    SimpleCharts.line($('chartSaldoLinha'), saldoLabels, saldoValues, colors[0]);
    renderLegend('legendSaldo', saldoLabels, saldoValues, new Array(saldoLabels.length).fill(colors[0]));
  }

  // ----- Print helpers (canvas -> img) -----
  function snapshotCanvases() {
    try {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach((cv) => {
        const parent = cv.parentElement;
        if (!parent) return;
        const id = cv.id || '';
        let img = parent.querySelector(`img[data-snapshot="${id}"]`);
        if (!img) {
          img = document.createElement('img');
          img.setAttribute('data-snapshot', id);
          img.style.width = '100%';
          img.style.maxHeight = '520px';
          img.style.objectFit = 'contain';
          img.className = 'chart-snapshot';
          parent.appendChild(img);
        }
        try { img.src = cv.toDataURL('image/png'); } catch {}
        cv.style.display = 'none';
      });
    } catch {}
  }

  function restoreCanvases() {
    try {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach((cv) => { cv.style.display = ''; });
    } catch {}
  }

  boot();
})();
