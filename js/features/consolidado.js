/* =====================================================
   ERP FINANCEIRO JW v5.1 - CONSOLIDADO (EXECUTIVO)
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Consolidado] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}

    bind();
    render();
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  function getMonthId() {
    return Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
  }

  function toneClass(tone) {
    if (tone === 'ok') return 'status--ok';
    if (tone === 'warn') return 'status--info';
    if (tone === 'error') return 'status--error';
    return 'status--info';
  }

  function render() {
    const monthId = getMonthId();
    $('monthLabel').textContent = Core.month.getMonthLabel(monthId);

    const tx = Core.tx.load(uid(), monthId);
    const sum = Core.calc.summary(tx);

    $('kpiLiquidez').textContent = Core.format.brl(sum.saldo);
    $('kpiRenda').textContent = Core.format.brl(sum.renda);
    $('kpiPoupanca').textContent = Core.format.brl(sum.poupanca);
    $('kpiEssenciais').textContent = Core.format.brl(sum.essenciais);
    $('kpiLivres').textContent = Core.format.brl(sum.livres);
    $('kpiDividas').textContent = Core.format.brl(sum.dividas);

    const health = Core.calc.health(sum, ERP_CONST.thresholds);
    const score = Core.calc.score(sum, ERP_CONST.thresholds, { poupanca: 40, endividamento: 30, essenciais: 30 });

    const scoreBox = $('scoreBox');
    if (scoreBox) {
      scoreBox.className = `status ${score == null ? 'status--info' : (score >= 80 ? 'status--ok' : score >= 60 ? 'status--info' : 'status--error')}`;
      scoreBox.textContent = `Score: ${score == null ? '—' : `${score}/100`}`;
    }

    $('healthPoupanca').className = `status ${toneClass(health.poupanca.tone)}`;
    $('healthPoupanca').textContent = `Poupança: ${health.poupanca.status} ${health.poupanca.rate == null ? '' : `(${health.poupanca.rate.toFixed(1)}%)`}`;

    $('healthEndividamento').className = `status ${toneClass(health.endividamento.tone)}`;
    $('healthEndividamento').textContent = `Endividamento: ${health.endividamento.status} ${health.endividamento.rate == null ? '' : `(${health.endividamento.rate.toFixed(1)}%)`}`;

    $('healthEssenciais').className = `status ${toneClass(health.essenciais.tone)}`;
    $('healthEssenciais').textContent = `Essenciais: ${health.essenciais.status} ${health.essenciais.rate == null ? '' : `(${health.essenciais.rate.toFixed(1)}%)`}`;

    // by bank
    const byBank = Core.calc.groupByBank(tx);
    const byBankEl = $('byBank');
    byBankEl.innerHTML = '';
    if (!byBank.length) {
      byBankEl.innerHTML = `<div class="card" style="padding:16px;"><span class="text-muted">Sem dados.</span></div>`;
    } else {
      byBank.forEach((b) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '14px';
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <strong>${b.bank}</strong>
            <span style="font-weight:800;">${Core.format.brl(b.net)}</span>
          </div>
          <small class="text-muted">Entradas - Saídas</small>
        `;
        byBankEl.appendChild(card);
      });
    }

    // card bills
    const bills = Core.calc.cardBillsByBank(tx);
    const billsEl = $('cardBills');
    billsEl.innerHTML = '';
    if (!bills.length) {
      billsEl.innerHTML = `<div class="card" style="padding:16px;"><span class="text-muted">Sem dívidas no mês.</span></div>`;
    } else {
      bills.forEach((b) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '14px';
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <strong>${b.bank}</strong>
            <span style="font-weight:800;">${Core.format.brl(b.total)}</span>
          </div>
          <small class="text-muted">Total de dívidas registradas</small>
        `;
        billsEl.appendChild(card);
      });
    }
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
}

  boot();
})();
