/* =====================================================
   ERP FINANCEIRO JW v5.1 - METAS (MÍNIMO USÁVEL)
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
    return Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
  }

  function goalsKey() {
    return Core.keys.goals(uid());
  }

  function loadGoals() {
    return Core.storage.getJSON(goalsKey(), []);
  }

  function saveGoals(list) {
    Core.storage.setJSON(goalsKey(), Array.isArray(list) ? list : []);
  }

  function uidGoal() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  }

  function goalProgress(goal, monthId) {
    const tx = Core.tx.load(uid(), monthId);

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
    $('monthLabel').textContent = Core.month.getMonthLabel(monthId);

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

  function bind() {
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
    $('goalsList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;

      const id = del.dataset.del;
      if (!confirm('Remover esta meta?')) return;

      const goals = loadGoals().filter((g) => g.id !== id);
      saveGoals(goals);
      ERP.toast('✓ Meta removida.', 'info');
      render();
    });

    const btnNow = $('btnMonthNow');
    if (btnNow) btnNow.addEventListener('click', () => {
      Core.selectedMonth.clear(uid());
      render();
    });

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
