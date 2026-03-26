/* =====================================================
   ERP JW Finance v8.0.0 - HISTÓRICO
   - Lista meses do usuário atual (scan keys)
   - selected_month consistente (por usuário)
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Histórico] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Sync] SyncService indisponível:', err); }

    bind();
    showEmptyState();
    initExport();
    // v8.1.4: aplicar filtro na lista (sem recarregar página)
    btnHistApply?.addEventListener('click', () => {
      const s = histStart?.value || '';
      const e = histEnd?.value || '';
      if (!s || !e) return showEmptyState();
      if (s > e) return ERP.toast('Período inválido: mês inicial maior que mês final.', 'warning');
      loadHistorico({ start: s, end: e });
    });
  }

  const $ = (id) => document.getElementById(id);

  const histStart = $('histStart');
  const histEnd = $('histEnd');
  const btnHistCSV = $('btnHistCSV');
  const btnHistApply = $('btnHistApply');

  function getUserId() { return Core.user.getCurrentUserId(); }

  function monthKeys() {
    const uid = getUserId();
    const prefix = `gf_erp_tx_${uid}_`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.replace(prefix, ''))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => b.localeCompare(a));
  }

  
  function initExport() {
    // defaults: primeiro e último mês disponíveis (se existirem)
    const months = monthKeys().sort((a,b)=>a.localeCompare(b));
    if (months.length) {
      if (histStart) histStart.value = months[0];
      if (histEnd) histEnd.value = months[months.length-1];
    } else {
      const now = Core.month.getMonthId(new Date());
      if (histStart) histStart.value = now;
      if (histEnd) histEnd.value = now;
    }

    btnHistCSV?.addEventListener('click', async () => {
      const s = histStart?.value || '';
      const e = histEnd?.value || '';
      const res = Core.period.getTransactionsByPeriod(getUserId(), s, e);
      if (!res.tx.length) return ERP.toast('Sem dados no período selecionado.', 'info');

      const rows = res.tx.map((t) => Core.export.txToRow(t));
      const header = Core.export.txHeader();
      const fn = `erp-jw-${getUserId()}-${res.range.start}_a_${res.range.end}.csv`;
      const ok = Core.export.downloadCSV(fn, rows, header);
      if (!ok.ok) return ERP.toast(ok.error || 'Sem dados para exportar.', 'info');
      ERP.toast('✓ CSV exportado!', 'success');
    });
  }

function showEmptyState() {
  const list = $('monthsList');
  if (!list) return;
  list.innerHTML = `
    <div class="card" style="text-align:center; padding:40px;">
      <h3 style="margin:0 0 8px;">Selecione um período</h3>
      <p class="text-muted" style="margin:0;">Defina Mês inicial e Mês final e clique em <strong>Atualizar lista</strong> para carregar o histórico.</p>
    </div>
  `;
}

function loadTx(monthId) {
    const list = Core.tx.load(getUserId(), monthId);
    return window.SyncService?.visibleTx ? SyncService.visibleTx(list) : (list || []).filter((t) => !t?.deletedAt);
  }

  function openMonth(monthId, where) {
    Core.selectedMonth.set(getUserId(), monthId);
    try { window.SyncService?.markDirty?.('selected-month'); } catch {}
    window.location.href = where;
  }

  function renderMonthCard(monthId) {
  const tx = loadTx(monthId);
  const sum = Core.calc.summary(tx);
      let scTxt = '';
      try {
        const sc = Core.calc.score(sum, (window.ERP_CONST?.thresholds || undefined), { poupanca: 40, endividamento: 30, essenciais: 30 });
        if (typeof sc === 'number') scTxt = `Score: ${sc}/100`;
        else if (sc && sc.value != null) scTxt = `Score: ${sc.value}`;
      } catch {}

  const el = document.createElement('div');
  el.className = 'card month-card month-card--compact';
  el.style.marginBottom = '12px';
  el.style.cursor = 'pointer';

  el.innerHTML = `
    <div class="card__header" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <div>
        <h3 style="margin:0;">${Core.month.getMonthLabel(monthId)}</h3>
        <small class="text-muted">${tx.length} lançamentos • clique para abrir${scTxt ? ` • ${scTxt}` : ''}</small>
      </div>
    </div>

    <div class="chips-row" style="display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 8px;">
          ${(() => {
            try {
              const th = window.ERP_CONST?.thresholds;
              if (!th) return '';
              const h = Core.calc.health(sum, th);
              const rendaBase = sum.renda || 0;
              const chip = (txt) => `<span class="status status--info">${txt}</span>`;
              if (rendaBase <= 0) return chip('Sem receita (score não aplicável)');
              return [
                chip(`Poupança ${h.poupanca.rate == null ? '' : h.poupanca.rate.toFixed(1)+'%'}`),
                chip(`Dívidas ${h.endividamento.rate == null ? '' : h.endividamento.rate.toFixed(1)+'%'}`),
                chip(`Essenciais ${h.essenciais.rate == null ? '' : h.essenciais.rate.toFixed(1)+'%'}`)
              ].join('');
            } catch { return ''; }
          })()}
        </div>

        <div class="kpi-grid">
      <div class="kpi kpi--receita">
        <div class="kpi__title">Renda</div>
        <div class="kpi__value">${Core.format.brl(sum.renda)}</div>
      </div>
      <div class="kpi kpi--poupanca">
        <div class="kpi__title">Poupança</div>
        <div class="kpi__value">${Core.format.brl(sum.poupanca)}</div>
      </div>
      <div class="kpi kpi--despesa">
        <div class="kpi__title">Essenciais</div>
        <div class="kpi__value">${Core.format.brl(sum.essenciais)}</div>
      </div>
      <div class="kpi kpi--livre">
        <div class="kpi__title">Livres</div>
        <div class="kpi__value">${Core.format.brl(sum.livres)}</div>
      </div>
      <div class="kpi kpi--dividas">
        <div class="kpi__title">Dívidas</div>
        <div class="kpi__value">${Core.format.brl(sum.dividas)}</div>
      </div>
      <div class="kpi kpi--saldo">
        <div class="kpi__title">Saldo</div>
        <div class="kpi__value">${Core.format.brl(sum.saldo)}</div>
      </div>
    </div>
  `;

  el.addEventListener('click', () => openMonth(monthId, 'dashboard.html'));
  return el;
}

  async function loadHistorico(range) {
    const list = $('monthsList');
    if (!list) return;

    // v8.1.5: só renderiza histórico quando o usuário aplicar filtro
    if (!range || !range.start || !range.end) {
      return showEmptyState();
    }

    let months = monthKeys();
    // v8.1.4: filtro visual do histórico por mês (YYYY-MM)
    if (range && range.start && range.end) {
      const s = range.start;
      const e = range.end;
      months = months.filter(m => m >= s && m <= e);
    }

    list.innerHTML = '';

    if (months.length === 0) {
      list.innerHTML = `
        <div class="card" style="text-align: center; padding: 60px;">
          <p class="text-muted">Nenhum mês encontrado ainda. Comece lançando dados no Dashboard.</p>
          <button class="btn btn--primary" onclick="window.location.href='dashboard.html'">Ir para Dashboard</button>
        </div>
      `;
      return;
    }

    months.forEach((m) => list.appendChild(renderMonthCard(m)));
  }

  async function bind() {
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
  if (!(await Core.ui.confirm('Deseja realmente sair?', 'Confirmar'))) return;

  try {
    await window.firebaseApi?.signOut?.();
  } catch (e) {
    console.warn('[Logout] Falha ao encerrar sessão Firebase:', e);
  }

  localStorage.removeItem('gf_erp_firebase_rest_session');
  Core.user.clearSession();
  window.location.replace('index.html');
});
}

  boot();
})();
