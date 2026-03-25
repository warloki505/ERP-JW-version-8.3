/* =====================================================
   ERP JW Finance v8.2.1 - DASHBOARD (MULTIUSUÁRIO)
   - CRUD + navegação de meses + modais + recorrências
   - Cálculo centralizado no Core.calc.summary
   - selected_month consistente por usuário
   ===================================================== */

(function () {
  'use strict';

  // Guard + migração
  async function boot() {
    try {
      if (window.Core?.migrate) await Core.migrate.runOnce();
    } catch (e) {
      console.warn('[Dashboard] Migração falhou (seguindo):', e);
    }

    if (!window.Core || !window.ERP_CFG || !window.ERP) {
      console.error('[Dashboard] Scripts base não carregados (Core/ERP_CFG/ERP).');
      return;
    }

    if (!Core.guards.requireLogin()) return;
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Dashboard] SyncService indisponível:', err); }

    // garantir configs (por usuário)
    ERP_CFG.ensureCategoriesConfig();
    ERP_CFG.ensureBanksConfig();

    init();
  }

  const $ = (id) => document.getElementById(id);

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  }
  function setOptions(select, list) {
    if (!select) return;

    // preserva seleção atual (se existir)
    const current = String(select.value ?? "");

    // Regra UX (v8.2.1): placeholder "Selecione" apenas quando NÃO há valor selecionado.
    // Evita duplicação/mistura do placeholder após o usuário já ter escolhido.
    const showPlaceholder = !current;

    // normaliza lista (remove vazios e o próprio placeholder, se vier por engano)
    const clean = (list || []).filter((item) => {
      if (item === null || item === undefined) return false;
      if (typeof item === "string") {
        const s = String(item).trim();
        if (!s) return false;
        if (s.toLowerCase() === "selecione") return false;
        return true;
      }
      if (item && typeof item === "object") {
        const v = String(item.value ?? "").trim();
        const lab = String(item.label ?? item.value ?? "").trim();
        if (!v && !lab) return false;
        if (!v && lab.toLowerCase() === "selecione") return false;
        return true;
      }
      return true;
    });

    select.innerHTML = "";

    if (showPlaceholder) {
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Selecione";
      select.appendChild(opt0);
    }

    clean.forEach((item) => {
      const opt = document.createElement("option");
      if (typeof item === "string") {
        opt.value = item;
        opt.textContent = item;
      } else if (item && typeof item === "object") {
        opt.value = String(item.value ?? "");
        opt.textContent = String(item.label ?? item.value ?? "");
        if (item.data && typeof item.data === "object") {
          Object.entries(item.data).forEach(([k, v]) => { opt.dataset[k] = String(v); });
        }
      }
      select.appendChild(opt);
    });

    if (current) {
      ensureSelectedOption(select, current);
      select.value = current;
    }
  }


  function ensureSelectedOption(select, value) {
    if (!select) return;
    const v = ERP_CFG.normalizeLabel(value);
    if (!v) return;

    const exists = Array.from(select.options).some((o) => ERP_CFG.normalizeLabel(o.value) === v);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = `${value} (valor antigo)`;
      select.insertBefore(opt, select.firstChild?.nextSibling || null);
    }
    select.value = value;
  }

  // -------------------------------
  // USER + MONTH CONTEXT
  // -------------------------------
  const userId = () => Core.user.getCurrentUserId();

  function activeMonthDefault() {
    const uid = userId();
    const sel = uid ? Core.selectedMonth.get(uid) : null;
    return sel || Core.month.getMonthId(new Date());
  }

  let activeMonth = activeMonthDefault();

  function getTxKey(monthId = activeMonth) {
    return Core.keys.tx(userId(), monthId);
  }

  function loadTx(monthId = activeMonth) {
    return Core.storage.getJSON(getTxKey(monthId), []);
  }

  function saveTx(list, monthId = activeMonth) {
    const ok = Core.storage.setJSON(getTxKey(monthId), Array.isArray(list) ? list : []);
    try { window.SyncService?.markDirty?.('tx-save'); } catch {}
    return ok;
  }

  let tx = [];

  // -------------------------------
  // RECORRÊNCIA (LANÇAMENTOS FIXOS)
  // -------------------------------
  function recKey() { return Core.keys.recorr(userId()); }
  function recAppliedKey(monthId) { return Core.keys.recorrApplied(userId(), monthId); }

  function loadRecorrentes() {
    return Core.storage.getJSON(recKey(), []);
  }

  function saveRecorrentes(list) {
    return Core.storage.setJSON(recKey(), Array.isArray(list) ? list : []);
  }

  function wasAppliedThisMonth(monthId, recId) {
    const map = Core.storage.getJSON(recAppliedKey(monthId), {});
    return map?.[recId] === true;
  }

  function markAppliedThisMonth(monthId, recId) {
    const map = Core.storage.getJSON(recAppliedKey(monthId), {});
    map[recId] = true;
    Core.storage.setJSON(recAppliedKey(monthId), map);
  }

  function monthInRange(monthId, startMonth, endMonth) {
    if (startMonth && monthId < startMonth) return false;
    if (endMonth && monthId > endMonth) return false;
    return true;
  }

  function applyRecorrentesForMonth(monthId) {
    const recs = loadRecorrentes();
    if (!Array.isArray(recs) || recs.length === 0) return false;

    let changed = false;
    let monthTx = loadTx(monthId);

    recs.forEach((rec) => {
      if (!rec || !rec.id || !rec.template) return;
      if (!monthInRange(monthId, rec.startMonth, rec.endMonth || null)) return;
      if (wasAppliedThisMonth(monthId, rec.id)) return;

      const t = rec.template;
      const day = Core.month.clampDay(monthId, t.day || 1);
      const data = `${monthId}-${day}`;

      monthTx.push(buildTxRecord({
        tipo: t.tipo,
        subtipo: t.subtipo || undefined,
        data,
        valor: t.valor,
        categoria: t.categoria,
        banco: t.banco,
        descricao: t.descricao || '',
        auto: true,
        recurrenceId: rec.id
      }, monthId));

      markAppliedThisMonth(monthId, rec.id);
      changed = true;
    });

    if (changed) saveTx(monthTx, monthId);
    return changed;
  }

  // -------------------------------
  // LISTAS (configuráveis)
  // -------------------------------
  function catKindFromTx(item) {
    if (item.tipo === 'receita') return 'receita';
    if (item.tipo === 'poupanca') return 'poupanca';
    if (item.tipo === 'divida') return 'divida';
    if (item.tipo === 'despesa') {
      return item.subtipo === 'essencial' ? 'despesa_essencial' : 'despesa_livre';
    }
    return 'receita';
  }

  function bankTypeFromTx(item) {
    if (item.tipo === 'receita') return 'receita';
    if (item.tipo === 'poupanca') return 'poupanca';
    if (item.tipo === 'divida') return 'divida';
    return 'despesa';
  }

  function getActiveCategories(kind) {
    return ERP_CFG.getActiveCategoryLabels(kind);
  }

  function getActiveBanks(type) {
    return ERP_CFG.getActiveBankLabels(type);
  }

  
  function buildExpenseOptions() {
    // une Essencial + Livre em um único select
    // Importante: manter compatibilidade com lançamentos legados (categoria como texto/label)
    const norm = (c) => {
      if (!c) return null;
      if (typeof c === 'string') return { id: ERP_CFG.normalizeLabel(c), label: c, active: true };
      if (typeof c === 'object') {
        return {
          id: String(c.id || ERP_CFG.normalizeLabel(c.label || c.originalLabel || '') || ''),
          label: String(c.label || c.originalLabel || ''),
          originalLabel: c.originalLabel ? String(c.originalLabel) : undefined,
          active: c.active !== false
        };
      }
      return null;
    };

    const essRaw = (ERP_CFG.getCategoryConfig?.('despesa_essencial') || []);
    const livRaw = (ERP_CFG.getCategoryConfig?.('despesa_livre') || []);

    const ess = essRaw.map(norm).filter((c) => c && c.active && c.label)
      .map((c) => ({ value: c.id, label: c.label, data: { subtipo: 'essencial', kind: 'despesa_essencial', id: c.id } }));

    const liv = livRaw.map(norm).filter((c) => c && c.active && c.label)
      .map((c) => ({ value: c.id, label: c.label, data: { subtipo: 'livre', kind: 'despesa_livre', id: c.id } }));

    return [...ess, ...liv];
  }

  function syncDespesaTipoFromCategoria() {
    if (!despesaCategoria || !despesaSubtipo) return;
    const override = document.getElementById('overrideDespesaTipo');
    const opt = despesaCategoria.selectedOptions?.[0] || null;
    const subtipo = opt?.dataset?.subtipo || '';
    const allowAuto = !!subtipo;
    const isOverride = !!override?.checked;

    if (allowAuto && !isOverride) {
      despesaSubtipo.value = subtipo;
      despesaSubtipo.disabled = true;
    } else {
      // fallback: permite manual
      despesaSubtipo.disabled = false;
      if (!despesaSubtipo.value) despesaSubtipo.value = '';
    }
  }

// -------------------------------
  // UI ELEMENTS
  // -------------------------------
  const kpiRenda = $('kpiRenda');
  const kpiPoupanca = $('kpiPoupanca');
  const kpiEssenciais = $('kpiEssenciais');
  const kpiLivres = $('kpiLivres');
  const kpiDividas = $('kpiDividas');
  const kpiSaldo = $('kpiSaldoDistribuir');

  const monthLabel = $('monthLabel');
  const btnPrevMonth = $('btnPrevMonth');
  const btnCurrentMonth = $('btnCurrentMonth');
  const btnNextMonth = $('btnNextMonth');

  const btnPerfil = $('btnPerfil');
  const btnHistorico = $('btnHistorico');
  const btnCharts = $('btnCharts');
  const btnConsolidado = $('btnConsolidado');
  const btnMetas = $('btnMetas');
  const btnGerenciadores = $('btnGerenciadores');

  const btnLimparMes = $('btnLimparMes');
  const btnExportCSVMonth = $('btnExportCSVMonth');
  const logoutBtn = $('logoutBtn');

  const tbody = $('txTbody');

  const formPoupanca = $('formPoupanca');
  const formReceita = $('formReceita');
  const formDespesa = $('formDespesa');
  const formDivida = $('formDivida');

  const despesaSubtipo = $('despesaSubtipo');
  const despesaCategoria = $('despesaCategoria');

  const modalEdit = $('modalEdit');
  const modalFixar = $('modalFixar');

  // v8.2.3: Dashboard minimalista — manter apenas Score do mês
  const healthScore = $('healthScore');

  function toneClass(tone) {
    if (tone === 'ok') return 'score-pill--ok';
    if (tone === 'warn') return 'score-pill--warn';
    if (tone === 'error') return 'score-pill--error';
    return 'score-pill--neutral';
  }

  // -------------------------------
  // RENDER
  // -------------------------------
  function render() {
    if (monthLabel) monthLabel.textContent = Core.month.getMonthLabel(activeMonth);

    const txVisible = window.SyncService?.visibleTx ? SyncService.visibleTx(tx) : (tx || []).filter((t) => !t?.deletedAt);
    const sum = Core.calc.summary(txVisible);

    if (kpiRenda) kpiRenda.textContent = Core.format.brl(sum.renda);
    if (kpiPoupanca) kpiPoupanca.textContent = Core.format.brl(sum.poupanca);
    if (kpiEssenciais) kpiEssenciais.textContent = Core.format.brl(sum.essenciais);
    if (kpiLivres) kpiLivres.textContent = Core.format.brl(sum.livres);
    if (kpiDividas) kpiDividas.textContent = Core.format.brl(sum.dividas);
    if (kpiSaldo) kpiSaldo.textContent = Core.format.brl(sum.saldo);

    if (kpiSaldo) {
      if (sum.saldo < 0) kpiSaldo.style.color = '#ef4444';
      else if (sum.saldo > 0) kpiSaldo.style.color = '#10b981';
      else kpiSaldo.style.color = '';
    }

    // Score do mês (v8.2.3 - UI minimalista / Apple)
    if (window.ERP_CONST?.thresholds && healthScore) {
      const thresholds = window.ERP_CONST.thresholds;
      const rendaBase = sum.renda || 0;
      const score = Core.calc.score(sum, thresholds, { poupanca: 40, endividamento: 30, essenciais: 30 });

      const tone = rendaBase <= 0 ? 'neutral' : (score == null ? 'neutral' : score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'error');
      healthScore.className = `score-pill ${toneClass(tone)}`;
      healthScore.textContent = rendaBase <= 0
        ? 'Score do mês: —'
        : `Score do mês: ${score == null ? '—' : `${score}/100`}`;
    }


    // Tabela
    if (!tbody) return;

    tbody.innerHTML = '';
    if (txVisible.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px;">
            <span class="text-muted">Nenhum lançamento neste mês</span>
          </td>
        </tr>
      `;
      return;
    }

    txVisible.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).forEach((t) => {
      const tr = document.createElement('tr');

      let badgeClass = 'badge-receita';
      let badgeText = 'RECEITA';

      if (t.tipo === 'poupanca') { badgeClass = 'badge-poupanca'; badgeText = 'POUPANÇA'; }
      else if (t.tipo === 'divida') { badgeClass = 'badge-divida'; badgeText = 'DÍVIDA'; }
      else if (t.tipo === 'despesa') {
        badgeClass = 'badge-despesa';
        badgeText = t.subtipo === 'essencial' ? 'DESP. ESSENCIAL' : 'DESP. LIVRE';
      }

      const pin = t.auto ? `<span class="pin-mark" title="Lançamento fixo aplicado automaticamente">📌</span>` : '';

      tr.innerHTML = `
        <td><span class="badge ${badgeClass}">${badgeText}</span> ${pin}</td>
        <td>${new Date(String(t.data) + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
        <td style="font-weight: 600;">${Core.format.brl(t.valor)}</td>
        <td>${t.categoria || '—'}</td>
        <td>${t.banco || '—'}</td>
        <td class="text-muted">${t.descricao || '-'}</td>
        <td class="td-actions">
          <button class="btn-mini btn-pin" data-id="${t.id}" title="Fixar lançamento">📌</button>
          <button class="btn-mini btn-edit" data-id="${t.id}">✏️ Editar</button>
          <button class="btn-mini btn-del" data-id="${t.id}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function buildTxRecord(data, monthId = activeMonth, existing = null) {
    const now = new Date().toISOString();
    const base = { ...(existing || {}) };
    return {
      ...base,
      ...data,
      id: base.id || data.id || uid(),
      userId: userId(),
      monthId,
      createdAt: base.createdAt || now,
      updatedAt: now,
      deletedAt: (data.deletedAt !== undefined) ? data.deletedAt : (base.deletedAt || null),
      deviceId: window.SyncService?.getDeviceId?.() || base.deviceId || 'local-device',
      schemaVersion: window.SyncService?.TX_SCHEMA_VERSION || base.schemaVersion || 1
    };
  }

  function addTx(data) {
    const d = { ...data };

    // compat: sempre manter label (categoria/banco). Para novos lançamentos, registrar *_Id quando existir.
    try {
      if (d.tipo === 'despesa' && d.categoriaId && !d.categoria) {
        const kind = (d.subtipo === 'essencial') ? 'despesa_essencial' : (d.subtipo === 'livre') ? 'despesa_livre' : 'despesa_essencial';
        const r = Core.resolve.category(userId(), kind, d.categoriaId, d.categoria);
        d.categoriaId = r.id;
        d.categoria = r.label;
      }
    } catch {}

    tx.push(buildTxRecord(d));
    saveTx(tx);
    render();
  }

  function validarValor(valor) {
    const v = parseFloat(valor);
    if (Number.isNaN(v) || v <= 0) {
      ERP.toast('Valor deve ser maior que zero!', 'error');
      return false;
    }
    return true;
  }

  // -------------------------------
  // MODAL EDIT
  // -------------------------------
  let editingId = null;

  function openEditModal(id) {
    const item = tx.find((t) => t.id === id);
    if (!item) return;

    editingId = id;

    const resumo = `${(item.tipo||"").toUpperCase()} • ${Core.format.brl(item.valor)} • ${item.categoria || "—"} • ${item.banco || "—"}`;
    const box = $('editResumo');
    if (box) box.textContent = resumo;

    $('editId').value = id;
    $('editTipo').value = item.tipo;
    $('editData').value = item.data;
    $('editValor').value = item.valor;
    $('editDescricao').value = item.descricao || '';

    const catKind = catKindFromTx(item);
    const bankType = bankTypeFromTx(item);

    const cats = ERP_CFG.ensureValueInList(getActiveCategories(catKind), item.categoria);
    const banks = ERP_CFG.ensureValueInList(getActiveBanks(bankType), item.banco);

    setOptions($('editCategoria'), cats);
    setOptions($('editBanco'), banks);

    ensureSelectedOption($('editCategoria'), item.categoria);
    ensureSelectedOption($('editBanco'), item.banco);

    if (modalEdit) {
      modalEdit.style.display = 'flex';
      modalEdit.classList.remove('hidden');
    }
  }

  window.closeEditModal = function () {
    if (!modalEdit) return;
    modalEdit.style.display = 'none';
    modalEdit.classList.add('hidden');
    editingId = null;
  };

  window.saveEdit = function () {
    if (!editingId) return;

    const item = tx.find((t) => t.id === editingId);
    if (!item) return;

    const valor = $('editValor').value;
    if (!validarValor(valor)) return;

    item.data = $('editData').value;
    item.valor = valor;
    item.categoria = $('editCategoria').value;
    item.banco = $('editBanco').value;
    item.descricao = $('editDescricao').value.trim();
    item.monthId = activeMonth;
    item.userId = userId();
    item.updatedAt = new Date().toISOString();
    item.deviceId = window.SyncService?.getDeviceId?.() || item.deviceId || 'local-device';
    item.schemaVersion = window.SyncService?.TX_SCHEMA_VERSION || item.schemaVersion || 1;
    item.deletedAt = null;

    saveTx(tx);
    render();
    window.closeEditModal();
    ERP.toast('✓ Lançamento atualizado!', 'success');
  };

  // -------------------------------
  // DELETE
  // -------------------------------
  async function deleteTx(id) {
    const item = tx.find((t) => t.id === id);
    if (!item) return;

    // Recorrente: escolher escopo
    if (item.recurrenceId) {
      const choice = prompt(
        `Lançamento fixado (recorrência) detectado.\n\n1) Excluir apenas este mês\n2) Excluir este mês e futuros\n3) Cancelar\n\nDigite 1, 2 ou 3:`
      );

      if (!choice || choice === '3') return;

      if (choice === '1') {
        if (!(await Core.ui.confirm('Confirmar exclusão APENAS deste mês?', 'Confirmar'))) return;
        const target = tx.find((t) => t.id === id);
        if (target) {
          target.deletedAt = new Date().toISOString();
          target.updatedAt = target.deletedAt;
          target.deviceId = window.SyncService?.getDeviceId?.() || target.deviceId || 'local-device';
          target.schemaVersion = window.SyncService?.TX_SCHEMA_VERSION || target.schemaVersion || 1;
        }
        saveTx(tx);
        render();
        ERP.toast('✓ Lançamento removido (somente este mês).', 'info');
        return;
      }

      if (choice === '2') {
        if (!confirm('Confirmar exclusão deste mês e de TODOS os futuros? (Meses passados não serão alterados)')) return;
        deleteFutureRecurring(item.recurrenceId, activeMonth);
        // remove também do mês atual
        const target = tx.find((t) => t.id === id);
        if (target) {
          target.deletedAt = new Date().toISOString();
          target.updatedAt = target.deletedAt;
          target.deviceId = window.SyncService?.getDeviceId?.() || target.deviceId || 'local-device';
          target.schemaVersion = window.SyncService?.TX_SCHEMA_VERSION || target.schemaVersion || 1;
        }
        saveTx(tx);
        render();
        ERP.toast('✓ Recorrência removida (mês atual e futuros).', 'info');
        return;
      }

      return;
    }

    if (!(await Core.ui.confirm('⚠️ Confirmar exclusão deste lançamento?', 'Confirmar'))) return;
    item.deletedAt = new Date().toISOString();
    item.updatedAt = item.deletedAt;
    item.deviceId = window.SyncService?.getDeviceId?.() || item.deviceId || 'local-device';
    item.schemaVersion = window.SyncService?.TX_SCHEMA_VERSION || item.schemaVersion || 1;
    saveTx(tx);
    render();
    ERP.toast('✓ Lançamento removido!', 'info');
  }

  function deleteFutureRecurring(recurrenceId, fromMonthId) {
    // Nunca alterar meses passados
    const months = Core.period.listMonthIds(userId());
    months.filter((m) => m >= fromMonthId).forEach((m) => {
      const list = Core.tx.load(userId(), m) || [];
      let changed = false;
      const next = list.map((t) => {
        if (t?.recurrenceId !== recurrenceId || t?.deletedAt) return t;
        changed = true;
        return {
          ...t,
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deviceId: window.SyncService?.getDeviceId?.() || t.deviceId || 'local-device',
          schemaVersion: window.SyncService?.TX_SCHEMA_VERSION || t.schemaVersion || 1
        };
      });
      if (changed) Core.tx.save(userId(), m, next);

      // limpeza do marcador "applied" (objeto mapa, não array)
      try {
        const k = Core.keys.recorrApplied(userId(), m);
        const applied = Core.storage.getJSON(k, {});
        if (applied && typeof applied === 'object' && !Array.isArray(applied)) {
          delete applied[recurrenceId];
          Core.storage.setJSON(k, applied);
        }
      } catch {}
    });

    // remove template de recorrência
    const rec = loadRecorrentes().filter((r) => r.id !== recurrenceId);
    saveRecorrentes(rec);
  }

// -------------------------------
  // FIXAR (RECORRÊNCIA)
  // -------------------------------
  let pinningId = null;

  function openFixarModal(id) {
    const item = tx.find((t) => t.id === id);
    if (!item) return;

    pinningId = id;

    $('fixResumo').textContent = `${item.tipo.toUpperCase()} • ${Core.format.brl(item.valor)} • ${item.categoria} • ${item.banco}`;
    $('fixInicio').value = activeMonth;

    const [y, m] = activeMonth.split('-').map(Number);
    const end = new Date(y, m - 1);
    end.setMonth(end.getMonth() + 11);
    $('fixFim').value = Core.month.getMonthId(end);

    $('fixSemFim').checked = false;
    $('fixAplicarAtual').checked = true;

    if (modalFixar) {
      modalFixar.style.display = 'flex';
      modalFixar.classList.remove('hidden');
    }
  }

  window.closeFixarModal = function () {
    if (!modalFixar) return;
    modalFixar.style.display = 'none';
    modalFixar.classList.add('hidden');
    pinningId = null;
  };

  function buildRecTemplateFromTx(item) {
    const day = (item.data || '').split('-')[2] || '01';
    return {
      tipo: item.tipo,
      subtipo: item.subtipo || undefined,
      day,
      valor: item.valor,
      categoria: item.categoria,
      banco: item.banco,
      descricao: item.descricao || ''
    };
  }

  window.saveFixar = function () {
    if (!pinningId) return;

    const item = tx.find((t) => t.id === pinningId);
    if (!item) return;

    const startMonth = $('fixInicio').value;
    const semFim = $('fixSemFim').checked;
    const endMonth = semFim ? null : $('fixFim').value;

    if (!startMonth) return ERP.toast('Informe o mês de início.', 'error');
    if (!semFim && endMonth && endMonth < startMonth) return ERP.toast('Mês final deve ser maior ou igual ao inicial.', 'error');

    const recs = loadRecorrentes();
    const rec = {
      id: uid(),
      createdAt: new Date().toISOString(),
      startMonth,
      endMonth,
      template: buildRecTemplateFromTx(item)
    };

    recs.push(rec);
    saveRecorrentes(recs);

    const applyNow = $('fixAplicarAtual').checked;
    if (applyNow && monthInRange(activeMonth, startMonth, endMonth)) {
      if (!wasAppliedThisMonth(activeMonth, rec.id)) {
        markAppliedThisMonth(activeMonth, rec.id);

        const t = rec.template;
        const day = Core.month.clampDay(activeMonth, t.day || 1);
        tx.push(buildTxRecord({
          tipo: t.tipo,
          subtipo: t.subtipo || undefined,
          data: `${activeMonth}-${day}`,
          valor: t.valor,
          categoria: t.categoria,
          banco: t.banco,
          descricao: t.descricao || '',
          auto: true,
          recurrenceId: rec.id
        }));
        saveTx(tx);
        render();
      }
    }

    window.closeFixarModal();
    ERP.toast('📌 Lançamento fixo criado!', 'success');
  };

  // -------------------------------
  // NAV MONTH
  // -------------------------------
  function setDefaultDates() {
    // Regra (v8.2.1): lançamentos limitados ao mês ativo para evitar distorções nos KPIs.
    // Define min/max em todos inputs type=date e aplica um valor default dentro do intervalo.

    const monthId = String(activeMonth || '').trim();
    const days = Core.month.daysInMonth(monthId);
    const first = `${monthId}-01`;
    const last = `${monthId}-${String(days).padStart(2, '0')}`;

    const today = new Date().toISOString().split('T')[0];
    const clamp = (d) => (d >= first && d <= last) ? d : first;
    const val = clamp(today);

    const ids = ['receitaData', 'poupancaData', 'despesaData', 'dividaData'];
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      try {
        el.min = first;
        el.max = last;
        // Se o valor atual estiver fora do range (ou vazio), clampa.
        const cur = String(el.value || '').trim();
        el.value = (cur && cur >= first && cur <= last) ? cur : val;
      } catch {}
    });
  }

  function loadMonth(monthId) {
    applyRecorrentesForMonth(monthId);
    tx = loadTx(monthId);
    activeMonth = monthId;

    // persiste selected_month por usuário
    Core.selectedMonth.set(userId(), activeMonth);
    try { window.SyncService?.markDirty?.('selected-month'); } catch {}

    setDefaultDates();
    render();
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    // theme apply (não executa sozinho)
    try { ERP.theme.apply(); } catch {}

    // user name
    const userName = $('userName');
    const user = Core.storage.getJSON(Core.keys.user(userId()), null);
    if (user?.nome && userName) userName.textContent = `Olá, ${String(user.nome).split(' ')[0]}`;

    // binds
    if (btnPrevMonth) btnPrevMonth.addEventListener('click', async () => {
      const [y, m] = activeMonth.split('-').map(Number);
      loadMonth(Core.month.getMonthId(new Date(y, m - 2, 1)));
    });

    if (btnNextMonth) btnNextMonth.addEventListener('click', async () => {
      const [y, m] = activeMonth.split('-').map(Number);
      loadMonth(Core.month.getMonthId(new Date(y, m, 1)));
    });

    if (btnCurrentMonth) btnCurrentMonth.addEventListener('click', async () => {
      Core.selectedMonth.clear(userId());
      loadMonth(Core.month.getMonthId(new Date()));
    });

    if (btnPerfil) btnPerfil.addEventListener('click', async () => window.location.href = 'perfil.html');
    if (btnGerenciadores) btnGerenciadores.addEventListener('click', async () => window.location.href = 'gerenciadores.html');
    if (btnHistorico) btnHistorico.addEventListener('click', async () => window.location.href = 'historico.html');
    if (btnCharts) btnCharts.addEventListener('click', async () => window.location.href = 'charts.html');
    if (btnConsolidado) btnConsolidado.addEventListener('click', async () => window.location.href = 'consolidado.html');
    if (btnMetas) btnMetas.addEventListener('click', async () => window.location.href = 'metas.html');

    
    if (btnExportCSVMonth) btnExportCSVMonth.addEventListener('click', async () => {
      const rows = (tx || []).map((t) => Core.export.txToRow({ ...t, __monthId: activeMonth }));
      const header = Core.export.txHeader();
      const res = Core.export.downloadCSV(`erp-jw-${userId()}-${activeMonth}.csv`, rows, header);
      if (!res.ok) return ERP.toast(res.error || 'Sem dados para exportar.', 'info');
      ERP.toast('✓ CSV exportado!', 'success');
    });

if (btnLimparMes) btnLimparMes.addEventListener('click', async () => {
      if (!confirm(`⚠️ ATENÇÃO!\n\nIsso vai apagar TODOS os lançamentos de ${Core.month.getMonthLabel(activeMonth)}.\n\nEsta ação não pode ser desfeita. Confirmar?`)) return;
      tx.forEach((item) => {
        item.deletedAt = new Date().toISOString();
        item.updatedAt = item.deletedAt;
        item.deviceId = window.SyncService?.getDeviceId?.() || item.deviceId || 'local-device';
        item.schemaVersion = window.SyncService?.TX_SCHEMA_VERSION || item.schemaVersion || 1;
      });
      saveTx(tx);
      render();
      ERP.toast('✓ Todos os dados do mês foram removidos!', 'info');
    });

    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      if (await Core.ui.confirm('Deseja realmente sair?', 'Confirmar')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });

    // forms
    if (formPoupanca) formPoupanca.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'poupanca',
        data: f.data.value,
        valor: f.valor.value,
        categoria: f.categoria.value,
        banco: f.banco.value,
        descricao: ($('poupancaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('✓ Poupança adicionada!', 'success');
      setDefaultDates();
    });

    if (formReceita) formReceita.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'receita',
        data: f.data.value,
        valor: f.valor.value,
        categoria: f.categoria.value,
        banco: f.banco.value,
        descricao: ($('receitaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('✓ Receita adicionada!', 'success');
      setDefaultDates();
    });

    if (formDespesa) formDespesa.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'despesa',
        subtipo: despesaSubtipo?.value,
        data: f.data.value,
        valor: f.valor.value,
        categoriaId: despesaCategoria?.value,
        categoria: despesaCategoria?.selectedOptions?.[0]?.textContent || '',
        banco: $('despesaBanco')?.value,
        descricao: ($('despesaDescricao')?.value || '').trim()
      });

      f.reset();
      if (despesaSubtipo) despesaSubtipo.value = '';
      if (despesaCategoria) { refreshFormSelects(); despesaCategoria.value=''; }
      document.getElementById('overrideDespesaTipo') && (document.getElementById('overrideDespesaTipo').checked=false);
      syncDespesaTipoFromCategoria();
      ERP.toast('✓ Despesa adicionada!', 'success');
      setDefaultDates();
    });

    if (formDivida) formDivida.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validarValor(f.valor.value)) return;

      addTx({
        tipo: 'divida',
        data: f.data.value,
        valor: f.valor.value,
        categoria: $('dividaCategoria')?.value,
        banco: $('dividaBanco')?.value,
        descricao: ($('dividaDescricao')?.value || '').trim()
      });

      f.reset();
      ERP.toast('⚠️ Dívida registrada. Priorize quitação!', 'error', 3500);
      setDefaultDates();
    });

    // selects (v6.5)
    function refreshFormSelects() {
      setOptions($('poupancaCategoria'), getActiveCategories('poupanca'));
      setOptions($('poupancaBanco'), getActiveBanks('poupanca'));

      setOptions($('receitaCategoria'), getActiveCategories('receita'));
      setOptions($('receitaBanco'), getActiveBanks('receita'));

      setOptions($('despesaBanco'), getActiveBanks('despesa'));

      // Despesas (novo fluxo v8)
      setOptions(despesaCategoria, buildExpenseOptions());
      syncDespesaTipoFromCategoria();

      setOptions($('dividaCategoria'), getActiveCategories('divida'));
      setOptions($('dividaBanco'), getActiveBanks('divida'));
    }

    refreshFormSelects();

    // Despesas: categoria -> tipo (auto) + override manual
    despesaCategoria?.addEventListener('change', syncDespesaTipoFromCategoria);
    document.getElementById('overrideDespesaTipo')?.addEventListener('change', syncDespesaTipoFromCategoria);

    // Atualiza selects quando categorias/bancos mudarem no Perfil (sem recarregar)
    document.addEventListener('erp_cfg_changed', () => {
      try { refreshFormSelects();

    // Despesas: categoria -> tipo (auto) + override manual
    despesaCategoria?.addEventListener('change', syncDespesaTipoFromCategoria);
    document.getElementById('overrideDespesaTipo')?.addEventListener('change', syncDespesaTipoFromCategoria); } catch {}
    });
    // tabela delegation
    if (tbody) tbody.addEventListener('click', (e) => {
      const target = e.target;

      const del = target.classList.contains('btn-del') ? target : target.closest('.btn-del');
      if (del) return deleteTx(del.dataset.id);

      const edt = target.classList.contains('btn-edit') ? target : target.closest('.btn-edit');
      if (edt) return openEditModal(edt.dataset.id);

      const pin = target.classList.contains('btn-pin') ? target : target.closest('.btn-pin');
      if (pin) return openFixarModal(pin.dataset.id);
    });

    // fechar modais ao clicar fora
    if (modalEdit) modalEdit.addEventListener('click', (e) => { if (e.target === modalEdit) window.closeEditModal(); });
    if (modalFixar) modalFixar.addEventListener('click', (e) => { if (e.target === modalFixar) window.closeFixarModal(); });

    // atalhos
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (modalEdit && !modalEdit.classList.contains('hidden')) window.closeEditModal();
      if (modalFixar && !modalFixar.classList.contains('hidden')) window.closeFixarModal();
    });

    // carregar mês inicial (selected_month ou atual)
    activeMonth = activeMonthDefault();
    applyRecorrentesForMonth(activeMonth);
    tx = loadTx(activeMonth);
    Core.selectedMonth.set(userId(), activeMonth);
    try { window.SyncService?.markDirty?.('selected-month'); } catch {}

    setDefaultDates();
    render();
  }
  boot().catch((e)=>console.error('[Dashboard] boot error:', e));
})();