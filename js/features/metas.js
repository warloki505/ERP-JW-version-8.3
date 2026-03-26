/* =====================================================
   ERP JW Finance v8.2.1 - METAS (ORÇAMENTO PERCENTUAL)
   - Tela comparativa: meta (%) vs realizado (R$)
   - Storage versionado por usuário e mês (budgetPercentual_v8)
   - Legado mantido como fallback por flag (ERP_CONST.flags.budgetPercentV8)
   ===================================================== */

(function () {
  'use strict';

  async function bootBudgetV8() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP || !window.ERP_CONST) return console.error('[Metas v8] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    // se flag estiver desligada, não roda o modo v8
    if (!ERP_CONST?.flags?.budgetPercentV8) return;

    try { ERP.theme.apply(); } catch {}
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Sync] SyncService indisponível:', err); }

    bind();
    render();
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  const DEFAULT_PCT = { poupanca: 20, essenciais: 50, livres: 20, dividas: 10 };

  function getMonthId() {
  // Fonte única: selectedMonth (mesma regra do Dashboard)
  const sel = Core.selectedMonth.get(uid());
  return sel || Core.month.getMonthId(new Date());
}

  function readPct(monthId) {
    const key = Core.keys.budgetPct(uid(), monthId);
    const obj = Core.storage.getJSON(key, null);
    if (!obj) return { ...DEFAULT_PCT };
    return {
      poupanca: Number(obj.poupanca) || 0,
      essenciais: Number(obj.essenciais) || 0,
      livres: Number(obj.livres) || 0,
      dividas: Number(obj.dividas) || 0
    };
  }

  function writePct(monthId, pct) {
    const key = Core.keys.budgetPct(uid(), monthId);
    Core.storage.setJSON(key, pct);
    try { window.SyncService?.markDirty?.('budgetPct'); } catch {}
  }

  function pctTotal(p) {
    return (Number(p.poupanca)||0) + (Number(p.essenciais)||0) + (Number(p.livres)||0) + (Number(p.dividas)||0);
  }

  function syncInputs(p) {
    $('pctPoupanca').value = String(Number(p.poupanca)||0);
    $('pctEssenciais').value = String(Number(p.essenciais)||0);
    $('pctLivres').value = String(Number(p.livres)||0);
    $('pctDividas').value = String(Number(p.dividas)||0);
    updateTotalBox();
  }

  function readInputs() {
    return {
      poupanca: Number($('pctPoupanca').value) || 0,
      essenciais: Number($('pctEssenciais').value) || 0,
      livres: Number($('pctLivres').value) || 0,
      dividas: Number($('pctDividas').value) || 0
    };
  }

  function updateTotalBox() {
    const p = readInputs();
    const total = pctTotal(p);
    const box = $('pctTotalBox');
    box.innerHTML = `Total: <strong>${total}%</strong>`;
    // feedback visual simples
    box.classList.remove('status--ok', 'status--error', 'status--info');
    if (total === 100) box.classList.add('status--ok');
    else if (total > 100) box.classList.add('status--error');
    else box.classList.add('status--info');
  }

  async function bind() {
    // month now
    $('btnMonthNow')?.addEventListener('click', async () => {
      Core.selectedMonth.clear(uid());
      const m = Core.month.getMonthId(new Date());
      const inp = $('budgetMonth');
      if (inp) inp.value = m;
      render();
    });

// mês ativo (prev/next/current) - igual Dashboard
$('btnPrevMonth')?.addEventListener('click', () => {
  const cur = getMonthId();
  const prev = Core.month.addMonths(cur, -1);
  Core.selectedMonth.set(uid(), prev);
  try { window.SyncService?.markDirty?.('selected-month'); } catch {}
  render();
});

$('btnNextMonth')?.addEventListener('click', () => {
  const cur = getMonthId();
  const nxt = Core.month.addMonths(cur, 1);
  Core.selectedMonth.set(uid(), nxt);
  try { window.SyncService?.markDirty?.('selected-month'); } catch {}
  render();
});

$('btnCurrentMonth')?.addEventListener('click', () => {
  Core.selectedMonth.clear(uid());
  const m = Core.month.getMonthId(new Date());
  const inp = $('budgetMonth');
  if (inp) inp.value = m;
  render();
});


    // month picker (v8.1.8)
    $('btnApplyBudgetMonth')?.addEventListener('click', () => {
      const m = $('budgetMonth')?.value || '';
      if (!m) return ERP.toast('Selecione um mês para aplicar.', 'warning');
      Core.selectedMonth.set(uid(), m);
      try { window.SyncService?.markDirty?.('selected-month'); } catch {}
      render();
    });

    // inputs change
    ['pctPoupanca','pctEssenciais','pctLivres','pctDividas'].forEach((id) => {
      $(id)?.addEventListener('input', updateTotalBox);
    });

    // save
    $('budgetForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const monthId = getMonthId();
    const inpMonth = $('budgetMonth');
    if (inpMonth) inpMonth.value = monthId;
      const p = readInputs();
      const total = pctTotal(p);

      if (total !== 100) {
        ERP.toast(`A soma dos percentuais precisa dar 100%. Atual: ${total}%`, 'error');
        return;
      }

      writePct(monthId, p);
      ERP.toast('Percentuais salvos.', 'success');
      render();
    });

    // reset
    $('btnResetBudget')?.addEventListener('click', async () => {
      const monthId = getMonthId();
    const inpMonth = $('budgetMonth');
    if (inpMonth) inpMonth.value = monthId;
      writePct(monthId, { ...DEFAULT_PCT });
      syncInputs(DEFAULT_PCT);
      ERP.toast('Percentuais restaurados para o padrão.', 'info');
      render();
    });

    // logout
    $('logoutBtn')?.addEventListener('click', async () => {
      if (await Core.ui.confirm('Deseja realmente sair?', 'Confirmar')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });
  }

  function money(v) {
    return Core.format.brl(v);
  }

  function statusBadge(title, ok, warn, bad) {
    if (ok) return `<span class="status status--ok">${title}</span>`;
    if (warn) return `<span class="status status--info">${title}</span>`;
    return `<span class="status status--error">${title}</span>`;
  }

  function buildCard(label, emoji, kind, target, realized) {
    const diff = (Number(target)||0) - (Number(realized)||0);

    // regras de "bom"
    // - poupanca: realizado >= target
    // - despesas/dividas: realizado <= target
    let ok=false, warn=false;
    if (kind === 'poupanca') {
      ok = realized >= target;
      warn = !ok && realized >= (target * 0.8);
    } else {
      ok = realized <= target;
      warn = !ok && realized <= (target * 1.15);
    }

    const statusTxt = ok ? 'OK' : (warn ? 'Atenção' : 'Fora do alvo');
    const hint = (kind === 'poupanca')
      ? `Falta: ${money(Math.max(0, target - realized))}`
      : `Excesso: ${money(Math.max(0, realized - target))}`;

    const badge = statusBadge(`${emoji} ${statusTxt}`, ok, warn, !ok && !warn);

    return `
      <div class="card" style="margin:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <h3 style="margin:0;">${emoji} ${label}</h3>
          ${badge}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
          <div>
            <div class="text-muted" style="font-size:12px;">Meta (R$)</div>
            <div style="font-size:22px; font-weight:800;">${money(target)}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size:12px;">Realizado (R$)</div>
            <div style="font-size:22px; font-weight:800;">${money(realized)}</div>
          </div>
        </div>
        <div class="text-muted" style="margin-top: 8px; font-size: 13px;">
          Diferença: <strong>${money(diff)}</strong> • ${hint}
        </div>
      </div>
    `;
  }

  function render() {
    // toggle sections
    $('budgetV8')?.classList.remove('hidden');
    $('goalsLegacy')?.classList.add('hidden');

    const monthId = getMonthId();
    const inpMonth = $('budgetMonth');
    if (inpMonth) inpMonth.value = monthId;
    const monthLabel = Core.month.getMonthLabel(monthId);
    $('monthLabel').textContent = monthLabel;

    const tx = (window.SyncService?.visibleTx ? SyncService.visibleTx(Core.tx.load(uid(), monthId)) : (Core.tx.load(uid(), monthId) || []).filter((t) => !t?.deletedAt));
    const sum = Core.calc.summary(tx);

    const pct = readPct(monthId);
    syncInputs(pct);

    const total = pctTotal(pct);
    $('pctTotalBox').innerHTML = `Total: <strong>${total}%</strong>`;

    $('kpiBase').textContent = money(sum.renda);

    // orçamento
    const budget = Core.calc.budgetFromPercent(sum, pct);

    const cards = [];
    cards.push(buildCard('Poupança', '🏦', 'poupanca', budget.targets.poupanca, budget.realized.poupanca));
    cards.push(buildCard('Essenciais', '📌', 'essenciais', budget.targets.essenciais, budget.realized.essenciais));
    cards.push(buildCard('Livres', '🎯', 'livres', budget.targets.livres, budget.realized.livres));
    cards.push(buildCard('Dívidas', '⚠️', 'dividas', budget.targets.dividas, budget.realized.dividas));

    $('budgetCards').innerHTML = cards.join('');

    // status geral
    const isApplicable = budget.renda > 0;
    if (!isApplicable) {
      $('kpiBudgetStatus').textContent = '—';
      $('kpiBudgetHint').textContent = 'Sem receita no mês (orçamento não aplicável).';
      return;
    }

    const okCount = [
      budget.realized.poupanca >= budget.targets.poupanca,
      budget.realized.essenciais <= budget.targets.essenciais,
      budget.realized.livres <= budget.targets.livres,
      budget.realized.dividas <= budget.targets.dividas
    ].filter(Boolean).length;

    if (okCount >= 3) {
      $('kpiBudgetStatus').textContent = '🟢 Em linha';
      $('kpiBudgetHint').textContent = 'Você está bem próximo do planejado (maioria das metas dentro do alvo).';
    } else if (okCount === 2) {
      $('kpiBudgetStatus').textContent = '🟡 Ajustes';
      $('kpiBudgetHint').textContent = 'Metade do planejamento está fora do alvo. Ajuste hábitos ou percentuais.';
    } else {
      $('kpiBudgetStatus').textContent = '🔴 Atenção';
      $('kpiBudgetHint').textContent = 'Orçamento fora do alvo na maioria dos blocos. Priorize correção (dívidas/essenciais).';
    }
  }

  bootBudgetV8();
})();

/* ===========================
   LEGADO (fallback por flag)
   - Mantido para rollback simples
   =========================== */
/* =====================================================
   ERP JW Finance v6.5 - METAS (MÍNIMO USÁVEL)
   - CRUD básico + progresso automático
   - Avaliação no mês em foco (selected_month)
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP) return console.error('[Metas] Core/ERP não carregados.');
    if (!Core.guards.requireLogin()) return;

    try { ERP.theme.apply(); } catch {}

    bind();
    render();
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  function getMonthId() {
  // Fonte única: selectedMonth (mesma regra do Dashboard)
  const sel = Core.selectedMonth.get(uid());
  return sel || Core.month.getMonthId(new Date());
}

  function goalsKey() {
    return Core.keys.goals(uid());
  }

  function loadGoals() {
    return Core.storage.getJSON(goalsKey(), []);
  }

  function saveGoals(list) {
    Core.storage.setJSON(goalsKey(), Array.isArray(list) ? list : []);
    try { window.SyncService?.markDirty?.('goals'); } catch {}
  }

  function uidGoal() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  }

  function goalProgress(goal, monthId) {
    const tx = (window.SyncService?.visibleTx ? SyncService.visibleTx(Core.tx.load(uid(), monthId)) : (Core.tx.load(uid(), monthId) || []).filter((t) => !t?.deletedAt));

    if (goal.type === 'poupanca_mes') {
      const sum = tx.filter(t => t.tipo === 'poupanca').reduce((a, t) => a + (Number(t.valor) || 0), 0);
      return { current: sum, target: goal.targetValue, goodDirection: 'up' };
    }

    if (goal.type === 'divida_mes') {
      const sum = tx.filter(t => t.tipo === 'divida').reduce((a, t) => a + (Number(t.valor) || 0), 0);
      return { current: sum, target: goal.targetValue, goodDirection: 'down' }; // meta é limite
    }

    if (goal.type === 'categoria_mes') {
      const cat = String(goal.category || '').trim();
      const sum = tx
        .filter(t => (t.tipo === 'despesa' || t.tipo === 'divida') && String(t.categoria || '').trim() === cat)
        .reduce((a, t) => a + (Number(t.valor) || 0), 0);
      return { current: sum, target: goal.targetValue, goodDirection: 'down' };
    }

    return { current: 0, target: goal.targetValue, goodDirection: 'up' };
  }

  function pct(progress) {
    const t = Number(progress.target) || 0;
    if (t <= 0) return 0;

    if (progress.goodDirection === 'down') {
      // quanto mais baixo, melhor. 100% = dentro do limite.
      const c = Number(progress.current) || 0;
      const ok = Math.max(0, Math.min(1, (t - c) / t));
      return Math.round(ok * 100);
    }

    const c = Number(progress.current) || 0;
    return Math.round(Math.max(0, Math.min(1, c / t)) * 100);
  }

  function render() {
    const monthId = getMonthId();
    const inpMonth = $('budgetMonth');
    if (inpMonth) inpMonth.value = monthId;
    $('monthLabelLegacy').textContent = Core.month.getMonthLabel(monthId);

    const list = $('goalsList');
    list.innerHTML = '';

    const goals = loadGoals();
    if (!goals.length) {
      list.innerHTML = `
        <div class="card" style="padding:16px;">
          <p class="text-muted" style="margin:0;">Nenhuma meta cadastrada ainda.</p>
        </div>
      `;
      return;
    }

    goals.forEach((g) => {
      const pr = goalProgress(g, monthId);
      const percent = pct(pr);

      const isOk = (pr.goodDirection === 'up')
        ? (Number(pr.current) >= Number(pr.target))
        : (Number(pr.current) <= Number(pr.target));

      const badge = isOk ? 'status--ok' : (percent >= 60 ? 'status--info' : 'status--error');
      const currentLabel = Core.format.brl(pr.current);
      const targetLabel = Core.format.brl(pr.target);

      const desc = g.type === 'poupanca_mes'
        ? 'Poupança do mês'
        : g.type === 'divida_mes'
          ? 'Dívidas do mês (limite)'
          : `Categoria do mês (limite): ${g.category || '—'}`;

      const item = document.createElement('div');
      item.className = 'card';
      item.style.padding = '14px';
      item.style.marginBottom = '12px';

      item.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <strong>${g.name}</strong>
              <span class="status ${badge}">${percent}%</span>
            </div>
            <small class="text-muted">${desc}</small>
          </div>

          <div style="text-align:right;">
            <div style="font-weight:800;">${currentLabel} / ${targetLabel}</div>
            <small class="text-muted">${isOk ? 'Meta atingida / dentro do limite' : 'Em progresso'}</small>
          </div>
        </div>

        <div style="margin-top:10px; height:10px; background: rgba(148,163,184,.25); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${Math.max(0, Math.min(100, percent))}%; background: currentColor;"></div>
        </div>

        <div style="margin-top:10px; display:flex; gap:8px;">
          <button class="btn btn--ghost" data-del="${g.id}">🗑️ Remover</button>
        </div>
      `;

      list.appendChild(item);
    });
  }

  async function bind() {
    // form
    const form = $('goalForm');
    const typeSel = $('goalType');
    const catGroup = $('goalCategoryGroup');

    function toggleCat() {
      const v = typeSel.value;
      catGroup.style.display = (v === 'categoria_mes') ? 'block' : 'none';
    }
    if (typeSel) typeSel.addEventListener('change', toggleCat);
    toggleCat();

    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = $('goalName').value.trim();
      const type = $('goalType').value;
      const targetValue = Core.format.parseBRL($('goalTarget').value);

      if (!name) return ERP.toast('Informe um nome para a meta.', 'error');
      if (!targetValue || targetValue <= 0) return ERP.toast('Informe um valor alvo válido.', 'error');

      const goal = {
        id: uidGoal(),
        name,
        type,
        targetValue,
        category: type === 'categoria_mes' ? $('goalCategory').value.trim() : null,
        createdAt: new Date().toISOString()
      };

      if (goal.type === 'categoria_mes' && !goal.category) return ERP.toast('Informe a categoria para essa meta.', 'error');

      const goals = loadGoals();
      goals.push(goal);
      saveGoals(goals);

      form.reset();
      toggleCat();

      ERP.toast('✓ Meta criada!', 'success');
      render();
    });

    // list actions
    $('goalsList').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;

      const id = del.dataset.del;
      if (!(await Core.ui.confirm('Remover esta meta?', 'Confirmar'))) return;

      const goals = loadGoals().filter((g) => g.id !== id);
      saveGoals(goals);
      ERP.toast('✓ Meta removida.', 'info');
      render();
    });

    const btnNow = $('btnMonthNow');
    if (btnNow) btnNow.addEventListener('click', async () => {
      Core.selectedMonth.clear(uid());
      render();
    });

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

  if (!ERP_CONST?.flags?.budgetPercentV8) boot();
})();
