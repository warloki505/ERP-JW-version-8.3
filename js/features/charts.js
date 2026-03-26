/* =====================================================
   ERP FINANCEIRO JW v5.1 - CHARTS / RELATÓRIO
   - Usa Core.js (fonte única)
   - selected_month consistente por usuário
   - Chart.js + exportação PDF via window.print()
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Charts] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}

    bind();
    renderAll();
  }

  const $ = (id) => document.getElementById(id);

  function getUserId() { return Core.user.getCurrentUserId(); }

  function getActiveMonth() {
    return Core.selectedMonth.get(getUserId()) || Core.month.getMonthId(new Date());
  }

  function loadTx(monthId) {
    return Core.tx.load(getUserId(), monthId);
  }

  function groupSumBy(list, getKeyFn) {
    const map = {};
    list.forEach((t) => {
      const k = getKeyFn(t);
      const v = Number(t?.valor) || 0;
      map[k] = (map[k] || 0) + v;
    });
    return Object.entries(map).map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
  }

  // Charts instances
  let cPizza, cBarras, cCategorias, cDividas, cEvolucao;

  function destroyIf(chart) { try { chart?.destroy?.(); } catch {} }

  function renderKPIs(sum) {
    $('kpiRenda').textContent = Core.format.brl(sum.renda);
    $('kpiPoupanca').textContent = Core.format.brl(sum.poupanca);
    $('kpiEssenciais').textContent = Core.format.brl(sum.essenciais);
    $('kpiLivres').textContent = Core.format.brl(sum.livres);
    $('kpiDividas').textContent = Core.format.brl(sum.dividas);
    $('kpiSaldo').textContent = Core.format.brl(sum.saldo);

    const rates = Core.calc.rates(sum);
    const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

    $('percPoupanca').textContent = pct(rates.poupanca);
    $('percEssenciais').textContent = pct(rates.essenciais);
    $('percLivres').textContent = pct(rates.livres);
    $('percDividas').textContent = pct(rates.endividamento);
  }

  function renderTable(tx) {
    const tbody = $('tbodyLancamentos');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!tx.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:26px;" class="text-muted">Sem lançamentos no mês.</td></tr>`;
      return;
    }

    tx.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).forEach((t) => {
      const tr = document.createElement('tr');
      const tipo = t.tipo === 'despesa'
        ? (t.subtipo === 'essencial' ? 'Despesa (Essencial)' : 'Despesa (Livre)')
        : (t.tipo === 'divida' ? 'Dívida' : t.tipo === 'poupanca' ? 'Poupança' : 'Receita');

      tr.innerHTML = `
        <td>${new Date(String(t.data) + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td>${tipo}</td>
        <td>${t.categoria || '—'}</td>
        <td>${t.banco || '—'}</td>
        <td class="text-muted">${t.descricao || '-'}</td>
        <td style="font-weight:600;">${Core.format.brl(t.valor)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderCharts(tx, sum, monthId) {
    if (!window.Chart) {
      console.warn('[Charts] Chart.js não carregado.');
      return;
    }

    // Pizza / Distribuição
    destroyIf(cPizza);
    cPizza = new Chart($('chartPizza'), {
      type: 'pie',
      data: {
        labels: ['Poupança', 'Essenciais', 'Livres', 'Dívidas'],
        datasets: [{ data: [sum.poupanca, sum.essenciais, sum.livres, sum.dividas] }]
      },
      options: { responsive: true }
    });

    // Barras (valores)
    destroyIf(cBarras);
    cBarras = new Chart($('chartBarras'), {
      type: 'bar',
      data: {
        labels: ['Renda', 'Poupança', 'Essenciais', 'Livres', 'Dívidas', 'Saldo'],
        datasets: [{ data: [sum.renda, sum.poupanca, sum.essenciais, sum.livres, sum.dividas, sum.saldo] }]
      },
      options: { responsive: true }
    });

    // Top categorias (gastos + dívidas)
    const gastos = tx.filter((t) => t.tipo === 'despesa' || t.tipo === 'divida');
    const byCat = groupSumBy(gastos, (t) => t.categoria || 'Outros').slice(0, 10);

    destroyIf(cCategorias);
    cCategorias = new Chart($('chartCategorias'), {
      type: 'bar',
      data: {
        labels: byCat.map(x => x.key),
        datasets: [{ data: byCat.map(x => x.total) }]
      },
      options: { responsive: true, indexAxis: 'y' }
    });

    // Dívidas por categoria
    const divs = tx.filter((t) => t.tipo === 'divida');
    const byDiv = groupSumBy(divs, (t) => t.categoria || 'Outros');

    destroyIf(cDividas);
    cDividas = new Chart($('chartDividas'), {
      type: 'bar',
      data: {
        labels: byDiv.map(x => x.key),
        datasets: [{ data: byDiv.map(x => x.total) }]
      },
      options: { responsive: true }
    });

    // Evolução 6 meses (saldo)
    const uid = getUserId();
    const months = [];
    const [y, m] = monthId.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1);
      d.setMonth(d.getMonth() - i);
      months.push(Core.month.getMonthId(d));
    }

    const saldos = months.map((mid) => {
      const txm = Core.tx.load(uid, mid);
      return Core.calc.summary(txm).saldo;
    });

    destroyIf(cEvolucao);
    cEvolucao = new Chart($('chartEvolucao'), {
      type: 'line',
      data: {
        labels: months.map(Core.month.getMonthLabel),
        datasets: [{ data: saldos }]
      },
      options: { responsive: true }
    });
  }

  function renderAll() {
    const monthId = getActiveMonth();
    $('monthLabel').textContent = Core.month.getMonthLabel(monthId);
    $('dataGeracao').textContent = new Date().toLocaleString('pt-BR');

    const tx = loadTx(monthId);
    const sum = Core.calc.summary(tx);

    renderKPIs(sum);
    renderTable(tx);
    renderCharts(tx, sum, monthId);
  }

  function bind() {
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      if (!confirm('Deseja realmente sair?')) return;

      try {
        await window.firebaseApi?.signOut?.();
      } catch (e) {
        console.warn('[Logout] Falha ao encerrar sessão Firebase:', e);
      }

      localStorage.removeItem('gf_erp_firebase_rest_session');
      localStorage.removeItem('gf_erp_logged');
      localStorage.removeItem('gf_erp_current_userId');

      if (window.Core?.user?.clearSession) {
        Core.user.clearSession();
      }

      window.location.replace('index.html');
    });
// Botão PDF: usa print (CSS @media print já existe)
    const pdfBtn = document.querySelector('[data-action="print"]') || document.querySelector('button[onclick*="print"]');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => window.print());
    }

    // Se houver seletor para voltar mês atual
    const btnAtual = document.querySelector('[data-action="month-now"]');
    if (btnAtual) btnAtual.addEventListener('click', () => {
      Core.selectedMonth.clear(getUserId());
      renderAll();
    });
  }

  boot();
})();
