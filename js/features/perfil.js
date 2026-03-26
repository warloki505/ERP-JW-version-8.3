/* =====================================================
   ERP FINANCEIRO JW v5.1 - PERFIL / CONFIG
   - Perfil financeiro (percentuais)
   - Gerenciar categorias e bancos (por usuário)
   - Backup/Restore + Export CSV
   - Theme Auto/Claro/Escuro
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP || !window.ERP_CFG || !window.ERP_CONST) {
      console.error('[Perfil] Scripts base não carregados.');
      return;
    }
    if (!Core.guards.requireLogin()) return;

    ERP_CFG.ensureCategoriesConfig();
    ERP_CFG.ensureBanksConfig();

    try { ERP.theme.apply(); } catch {}

    bind();
    loadUser();
    setupProfile();
    setupManagers();
    setupBackup();
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  // -------------------------------
  // USER
  // -------------------------------
  function loadUser() {
    const user = Core.storage.getJSON(Core.keys.user(uid()), null) || {};
    if ($('displayNome')) $('displayNome').textContent = user.nome || '—';
    if ($('displayEmail')) $('displayEmail').textContent = user.email || '—';
    if ($('displayDataCriacao')) $('displayDataCriacao').textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '—';
  }

  // -------------------------------
  // PROFILE (percentuais)
  // -------------------------------
  function profilesList() {
    const fp = ERP_CONST.financialProfiles || {};
    return Object.entries(fp).map(([id, p]) => ({
      id,
      name: p.name,
      description: p.description,
      percEssenciais: p.percEssenciais,
      percLivres: p.percLivres,
      percPoupanca: p.percPoupanca,
      percQuitacaoDividas: p.percQuitacaoDividas
    }));
  }

  function setupProfile() {
    const sel = $('tipoPerfil');
    const form = $('formPerfil');

    const list = profilesList();
    if (sel) {
      sel.innerHTML = '';
      list.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.percEssenciais}/${p.percLivres}/${p.percPoupanca}/${p.percQuitacaoDividas})`;
        sel.appendChild(opt);
      });
    }

    const user = Core.storage.getJSON(Core.keys.user(uid()), null) || {};
    const profileId = user.profileId || list[0]?.id;

    if (sel && profileId) sel.value = profileId;
    applyProfile(profileId);

    if (sel) sel.addEventListener('change', () => applyProfile(sel.value));
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveProfile();
    });

    ['percDespesasEssenciais', 'percDespesasLivres', 'percPoupanca', 'percQuitacaoDividas'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', updateTotal);
    });

    updateTotal();
  }

  function getProfileById(id) {
    return profilesList().find(p => p.id === id) || null;
  }

  function applyProfile(profileId) {
    const p = getProfileById(profileId);
    if (!p) return;

    $('percDespesasEssenciais').value = p.percEssenciais;
    $('percDespesasLivres').value = p.percLivres;
    $('percPoupanca').value = p.percPoupanca;
    $('percQuitacaoDividas').value = p.percQuitacaoDividas;
    updateTotal();
  }

  function updateTotal() {
    const a = Number($('percDespesasEssenciais')?.value) || 0;
    const b = Number($('percDespesasLivres')?.value) || 0;
    const c = Number($('percPoupanca')?.value) || 0;
    const d = Number($('percQuitacaoDividas')?.value) || 0;
    const total = a + b + c + d;

    const el = $('totalPerc');
    if (!el) return;

    el.textContent = `${total}%`;
    el.className = `status ${total === 100 ? 'status--ok' : 'status--error'}`;
  }

  function saveProfile() {
    const a = Number($('percDespesasEssenciais')?.value) || 0;
    const b = Number($('percDespesasLivres')?.value) || 0;
    const c = Number($('percPoupanca')?.value) || 0;
    const d = Number($('percQuitacaoDividas')?.value) || 0;

    const total = a + b + c + d;
    if (total !== 100) return ERP.toast('A soma dos percentuais deve ser 100%.', 'error');

    const user = Core.storage.getJSON(Core.keys.user(uid()), null) || {};
    user.profileId = $('tipoPerfil')?.value || user.profileId || null;
    user.profilePerc = { percEssenciais: a, percLivres: b, percPoupanca: c, percQuitacaoDividas: d };
    Core.storage.setJSON(Core.keys.user(uid()), user);

    updateTotal();
    ERP.toast('✓ Perfil salvo!', 'success');
  }

  // -------------------------------
  // MANAGERS
  // -------------------------------
  function setupManagers() {
    // categorias
    const catGrupo = $('catGrupo');
    const catLista = $('catLista');

    function renderCats(kind) {
      if (!catLista) return;
      const items = ERP_CFG.getCategoryConfig(kind);
      catLista.innerHTML = '';

      items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'manager-row';
        row.innerHTML = `
          <label style="display:flex; align-items:center; gap:10px; width:100%;">
            <input type="checkbox" ${it.active ? 'checked' : ''} data-cat-active="${it.id}" />
            <input class="input" style="flex:1;" value="${String(it.label).replace(/"/g, '&quot;')}" data-cat-label="${it.id}" />
          </label>
        `;
        catLista.appendChild(row);
      });
    }

    function catKind() {
      return catGrupo?.value || 'receita';
    }

    if (catGrupo) {
      catGrupo.addEventListener('change', () => renderCats(catKind()));
      renderCats(catKind());
    }

    $('btnSalvarCats')?.addEventListener('click', () => {
      const kind = catKind();
      const items = ERP_CFG.getCategoryConfig(kind).map((it) => {
        const active = !!document.querySelector(`[data-cat-active="${it.id}"]`)?.checked;
        const label = document.querySelector(`[data-cat-label="${it.id}"]`)?.value || it.label;
        return { ...it, active, label: String(label).trim() || it.label };
      });

      ERP_CFG.setCategoryConfig(kind, items);
      ERP.toast('✓ Categorias salvas!', 'success');
      renderCats(kind);
    });

    $('btnResetCats')?.addEventListener('click', () => {
      if (!confirm('Restaurar categorias para o padrão?')) return;
      localStorage.removeItem(Core.keys.cfgCats(uid()));
      ERP_CFG.ensureCategoriesConfig();
      ERP.toast('✓ Categorias restauradas.', 'info');
      renderCats(catKind());
    });

    // bancos
    const bankTipo = $('bankTipo');
    const bankLista = $('bankLista');

    function renderBanks(type) {
      if (!bankLista) return;
      const items = ERP_CFG.getBankConfig(type);
      bankLista.innerHTML = '';

      items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'manager-row';
        row.innerHTML = `
          <label style="display:flex; align-items:center; gap:10px; width:100%;">
            <input type="checkbox" ${it.active ? 'checked' : ''} data-bank-active="${it.id}" />
            <input class="input" style="flex:1;" value="${String(it.label).replace(/"/g, '&quot;')}" data-bank-label="${it.id}" />
          </label>
        `;
        bankLista.appendChild(row);
      });
    }

    function bankType() {
      return bankTipo?.value || 'despesa';
    }

    if (bankTipo) {
      bankTipo.addEventListener('change', () => renderBanks(bankType()));
      renderBanks(bankType());
    }

    $('btnSalvarBanks')?.addEventListener('click', () => {
      const type = bankType();
      const items = ERP_CFG.getBankConfig(type).map((it) => {
        const active = !!document.querySelector(`[data-bank-active="${it.id}"]`)?.checked;
        const label = document.querySelector(`[data-bank-label="${it.id}"]`)?.value || it.label;
        return { ...it, active, label: String(label).trim() || it.label };
      });

      ERP_CFG.setBankConfig(type, items);
      ERP.toast('✓ Bancos salvos!', 'success');
      renderBanks(type);
    });

    $('btnResetBanks')?.addEventListener('click', () => {
      if (!confirm('Restaurar bancos para o padrão?')) return;
      localStorage.removeItem(Core.keys.cfgBanks(uid()));
      ERP_CFG.ensureBanksConfig();
      ERP.toast('✓ Bancos restaurados.', 'info');
      renderBanks(bankType());
    });
  }

  // -------------------------------
  // BACKUP / RESTORE + CSV
  // -------------------------------
  function setupBackup() {
    const btnExport = $('btnExportBackup');
    const btnImport = $('btnImportBackup');
    const btnCSV = $('btnExportCSV');
    const info = $('backupInfo');
    const themeMode = $('themeMode');

    if (themeMode) {
      themeMode.value = ERP.theme.get();
      themeMode.addEventListener('change', () => ERP.theme.set(themeMode.value));
    }

    const monthId = Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
    if (info) info.textContent = `Mês em foco: ${Core.month.getMonthLabel(monthId)} • Backup por usuário (offline)`;

    btnExport?.addEventListener('click', () => {
      const payload = Core.backup.buildPayload(uid());
      const date = new Date().toISOString().slice(0, 10);
      ERP.files.downloadText(`erp-jw-backup-${payload.userId}-${date}.json`, JSON.stringify(payload, null, 2));
      ERP.toast('✓ Backup exportado!', 'success');
    });

    btnImport?.addEventListener('click', async () => {
      const file = await ERP.files.pickFile('.json');
      if (!file) return;

      try {
        const text = await ERP.files.readFileText(file);
        const obj = JSON.parse(text);

        const val = Core.backup.validatePayload(obj);
        if (!val.ok) return ERP.toast(`Backup inválido: ${val.error}`, 'error');

        const keys = Object.keys(obj.keys || {});
        const overwrites = keys.filter((k) => localStorage.getItem(k) !== null).length;

        const ok = confirm(
          `Importar backup?\n\n` +
          `Usuário do backup: ${obj.userId}\n` +
          `Keys no arquivo: ${keys.length}\n` +
          `Keys que serão sobrescritas: ${overwrites}\n\n` +
          `⚠️ A importação NÃO apaga nada, mas pode sobrescrever dados existentes.`
        );
        if (!ok) return;

        const res = Core.backup.applyPayload(obj);
        ERP.toast(`✓ Backup importado (${res.applied} keys)!`, 'success');
      } catch (e) {
        console.error(e);
        ERP.toast('Erro ao importar backup. Verifique o arquivo.', 'error');
      }
    });

    btnCSV?.addEventListener('click', () => {
      const monthId = Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
      const tx = Core.tx.load(uid(), monthId);

      const header = ['Data', 'Tipo', 'Categoria', 'Banco', 'Descrição', 'Valor'].join(';');
      const lines = tx
        .slice()
        .sort((a, b) => String(a.data).localeCompare(String(b.data)))
        .map((t) => {
          const tipo = t.tipo === 'despesa'
            ? (t.subtipo === 'essencial' ? 'despesa_essencial' : 'despesa_livre')
            : t.tipo;

          const valor = String(Number(t.valor) || 0).replace('.', ',');
          const desc = String(t.descricao || '').replaceAll(';', ',');
          return [t.data, tipo, t.categoria || '', t.banco || '', desc, valor].join(';');
        });

      const csv = [header, ...lines].join('\n');
      ERP.files.downloadText(`erp-jw-${uid()}-${monthId}.csv`, csv, 'text/csv');
      ERP.toast('✓ CSV exportado!', 'success');
    });
  }

  function bind() {
    $('logoutBtn')?.addEventListener('click', () => {
      if (confirm('Deseja realmente sair?')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });
  }

  boot();
})();
