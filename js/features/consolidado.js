// ===== v8.1.3: helper para export CSV por período =====
function monthsBetween(startYM, endYM) {
  // startYM/endYM no formato 'YYYY-MM'
  const out = [];
  if (!startYM || !endYM) return out;

  const s = startYM.split('-').map(n => parseInt(n, 10));
  const e = endYM.split('-').map(n => parseInt(n, 10));
  if (s.length < 2 || e.length < 2 || !s[0] || !s[1] || !e[0] || !e[1]) return out;

  let y = s[0], m = s[1];
  const endY = e[0], endM = e[1];

  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 240) break; // hardening: evita loop infinito
  }
  return out;
}


/* =====================================================
   ERP JW Finance v8.0.1 - CONSOLIDADO (EXECUTIVO)
   - Filtro por período (mês inicial/final)
   - KPIs + Score
   - Saldo por Banco/Instituição (Receita + Poupança − Despesas − Dívidas)
   - Exportação CSV/PDF
   ===================================================== */

(function () {
  'use strict';

  function toneClass(tone) {
    if (!tone) return 'status--info';
    if (tone === 'ok' || tone === 'success') return 'status--ok';
    if (tone === 'warn' || tone === 'warning') return 'status--info';
    if (tone === 'bad' || tone === 'danger' || tone === 'error') return 'status--error';
    return 'status--info';
  }
  

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core) return;
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Consolidado] SyncService indisponível:', err); }

    const btnCSV = document.getElementById('btnConsCSV');
    const btnApply = document.getElementById('btnApply');
    const btnClear = document.getElementById('btnClearFilter');
    const inStart = document.getElementById('consStart');
    const inEnd = document.getElementById('consEnd');

    const monthLabel = document.getElementById('monthLabel');
    const scoreBox = document.getElementById('scoreBox');

    
  const healthPoupanca = document.getElementById('healthPoupanca');
  const healthEndividamento = document.getElementById('healthEndividamento');
  const healthEssenciais = document.getElementById('healthEssenciais');
let period = loadPeriodPref();

    // default: mês selecionado no app
    const currentMonth = (Core.selectedMonth.get(Core.user.getCurrentUserId()) || Core.month.getMonthId(new Date()));
    if (!period.start || !period.end) {
      period = { start: currentMonth, end: currentMonth };
      savePeriodPref(period);
    }

    if (inStart) inStart.value = period.start;
    if (inEnd) inEnd.value = period.end;

    function normalizePeriod(p) {
      const s = String(p.start || '').slice(0,7);
      const e = String(p.end || '').slice(0,7);
      if (!s || !e) return null;
      return (s <= e) ? { start: s, end: e } : { start: e, end: s };
    }

    function monthRange(start, end) {
      const out = [];
      const [sy, sm] = start.split('-').map(Number);
      const [ey, em] = end.split('-').map(Number);
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        const mm = String(m).padStart(2,'0');
        out.push(`${y}-${mm}`);
        m += 1;
        if (m === 13) { m = 1; y += 1; }
      }
      return out;
    }

    function loadTx(monthId) {
      const list = Core.tx.load(Core.user.getCurrentUserId(), monthId) || [];
      return window.SyncService?.visibleTx ? SyncService.visibleTx(list) : list.filter((t) => !t?.deletedAt);
    }

    function collectTx(periodNorm) {
      const months = monthRange(periodNorm.start, periodNorm.end);
      const all = [];
      months.forEach((mid) => {
        const tx = loadTx(mid) || [];
        tx.forEach((t) => all.push({ ...t, __monthId: mid }));
      });
      return all;
    }

    function labelForPeriod(p) {
      if (p.start === p.end) return Core.month.getMonthLabel(p.start);
      return `${Core.month.getMonthLabel(p.start)} → ${Core.month.getMonthLabel(p.end)}`;
    }

    function render() {
      const p = normalizePeriod(period);
      if (!p) return;

      const tx = collectTx(p);
      const sum = Core.calc.summary(tx);

      if (monthLabel) monthLabel.textContent = labelForPeriod(p);

      // KPIs
      setText('kpiLiquidez', Core.format.brl(sum.saldo));
      setText('kpiRenda', Core.format.brl(sum.receita));
      setText('kpiPoupanca', Core.format.brl(sum.poupanca));
      setText('kpiEssenciais', Core.format.brl(sum.essenciais));
      setText('kpiLivres', Core.format.brl(sum.livres));
      setText('kpiDividas', Core.format.brl(sum.dividas));

      // Saúde Financeira + Score (v8.1.7 - UX hardening)
try {
  const thresholds = window.ERP_CONST?.thresholds;
  if (thresholds && Core.calc.health) {
    const rendaBase = sum.renda || 0;
    const health = Core.calc.health(sum, thresholds);
    const score = Core.calc.score(sum, thresholds, { poupanca: 40, endividamento: 30, essenciais: 30 });

    const noIncomeMsg = 'Sem receita no período';
    const fmt = (label, obj) => {
      if (rendaBase <= 0) return `${label}: ${noIncomeMsg}`;
      const rate = obj?.rate == null ? '' : ` (${obj.rate.toFixed(1)}%)`;
      return `${label}: ${obj?.status || '—'}${rate}`;
    };

    if (healthPoupanca) {
      healthPoupanca.className = `status ${toneClass(health.poupanca.tone)}`;
      healthPoupanca.textContent = fmt('Poupança', health.poupanca);
    }
    if (healthEndividamento) {
      healthEndividamento.className = `status ${toneClass(health.endividamento.tone)}`;
      healthEndividamento.textContent = fmt('Endividamento', health.endividamento);
    }
    if (healthEssenciais) {
      healthEssenciais.className = `status ${toneClass(health.essenciais.tone)}`;
      healthEssenciais.textContent = fmt('Essenciais', health.essenciais);
    }

    if (scoreBox) {
      scoreBox.textContent = rendaBase <= 0 ? 'Score: — (sem receita)' : `Score: ${score == null ? '—' : `${score}/100`}`;
    }
  } else {
    const sc = Core.calc.score(sum);
    if (scoreBox) scoreBox.textContent = sc?.value != null ? `Score: ${sc.value}` : 'Score: —';
  }
} catch {
  if (scoreBox) scoreBox.textContent = 'Score: —';
}

// Saldo por banco
      renderBankBalance(tx);

      // CSV export
      if (btnCSV) {
        btnCSV.onclick = () => {
          const rows = (tx || []).map((t) => Core.export.txToRow(t));
          const header = Core.export.txHeader();
          const res = Core.export.downloadCSV(`erp-jw-consolidado-${Core.user.getCurrentUserId()}-${p.start}_a_${p.end}.csv`, rows, header);
          if (!res.ok) return ERP.toast(res.error || 'Sem dados para exportar.', 'info');
          ERP.toast('✓ CSV exportado!', 'success');
        };
      }
    }

    function renderBankBalance(tx) {
      const host = document.getElementById('byBankBalance');
      if (!host) return;
      host.innerHTML = '';

      const map = new Map();
      (tx || []).forEach((t) => {
        const banco = String(t.banco || '').trim() || 'Não informado';
        const v = Number(t.valor) || Core.format.parseBRL(t.valor);
        const tipo = t.tipo;

        let delta = 0;
        if (tipo === 'receita') delta = +v;
        else if (tipo === 'poupanca') delta = +v;
        else if (tipo === 'despesa') delta = -v;
        else if (tipo === 'divida') delta = -v;
        else delta = 0;

        map.set(banco, (map.get(banco) || 0) + delta);
      });

      const rows = Array.from(map.entries())
        .map(([banco, saldo]) => ({ banco, saldo }))
        .sort((a,b) => Math.abs(b.saldo) - Math.abs(a.saldo));

      if (!rows.length) {
        host.innerHTML = `<div class="status status--info">Nenhum dado no período.</div>`;
        return;
      }

      rows.forEach((r) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.margin = '0';
        card.style.padding = '14px';

        const tone = r.saldo >= 0 ? 'success' : 'error';
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div>
              <div style="font-weight:800;">${escapeHtml(r.banco)}</div>
              <small class="text-muted">Saldo no período</small>
            </div>
            <div class="text-${tone}" style="font-weight:900; font-size:18px;">${Core.format.brl(r.saldo)}</div>
          </div>
        `;
        host.appendChild(card);
      });
    }

    function setText(id, v) {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    }

    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, (c) => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    function prefKey() {
      const uid = Core.user.getCurrentUserId();
      return uid ? `gf_erp_cons_period_${uid}` : 'gf_erp_cons_period';
    }

    function loadPeriodPref() {
      try { return JSON.parse(localStorage.getItem(prefKey()) || '{}') || {}; }
      catch { return {}; }
    }

    function savePeriodPref(p) {
      try { localStorage.setItem(prefKey(), JSON.stringify(p)); } catch {}
    }

    if (btnApply) btnApply.addEventListener('click', () => {
      period = { start: inStart?.value || '', end: inEnd?.value || '' };
      const n = normalizePeriod(period);
      if (!n) return ERP.toast('Selecione mês inicial e final.', 'info');
      period = n;
      savePeriodPref(period);
      render();
    });

    if (btnClear) btnClear.addEventListener('click', () => {
      const cur = (Core.selectedMonth.get(Core.user.getCurrentUserId()) || Core.month.getMonthId(new Date()));
      period = { start: cur, end: cur };
      if (inStart) inStart.value = cur;
      if (inEnd) inEnd.value = cur;
      savePeriodPref(period);
      render();
    });

    render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();


function exportPeriodCSV(period) {
  try {
    const userId = Core.session.getUserId ? Core.session.getUserId() : (ERP && ERP.userId) || null;
    if (!userId) {
      Core.toast && Core.toast.error ? Core.toast.error('Usuário não autenticado') : alert('Usuário não autenticado');
      return;
    }

    const start = period && (period.start || period.from || period.inicio || period.startYM);
    const end = period && (period.end || period.to || period.fim || period.endYM);

    if (!start || !end) {
      Core.toast && Core.toast.error ? Core.toast.error('Período inválido para exportação') : alert('Período inválido para exportação');
      return;
    }

    const months = monthsBetween(start, end);
    const all = [];
    for (const monthId of months) {
      const rows = Core.storage.getJSON(Core.keys.tx(userId, monthId), []);
      if (Array.isArray(rows) && rows.length) all.push(...rows);
    }

    const filename = `consolidado_${start}_a_${end}.csv`;
    Core.exportCSV(all, filename);
  } catch (err) {
    console.error('[exportPeriodCSV] erro:', err);
    Core.toast && Core.toast.error ? Core.toast.error('Falha ao exportar CSV') : alert('Falha ao exportar CSV');
  }
}
