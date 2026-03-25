/* =====================================================
   ERP JW Finance v8.0.0 - PERFIL / CONFIG
   - Simplificado (v8): foco em gerenciadores, backup e segurança
   - Adiciona: alterar senha (com confirmação)
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP || !window.ERP_CFG || !window.ERP_CONST) {
      console.error('[Perfil] Core/ERP não carregados.');
      return;
    }
    if (!Core.guards.requireLogin()) return;

    // garante configs por usuário (não quebra legado)
    try { ERP_CFG.ensureCategoriesConfig(); } catch {}
    try { ERP_CFG.ensureBanksConfig(); } catch {}

    try { ERP.theme.apply(); } catch {}
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Sync] SyncService indisponível:', err); }

    bindLogout();
    loadUser();
    setupSecurity();
    // Gerenciadores movidos para gerenciadores.html (v8)
    if (document.getElementById('catLista') && document.getElementById('bankLista')) setupManagers();
    setupBackup();
  }

  const $ = (id) => document.getElementById(id);
  const uid = () => Core.user.getCurrentUserId();

  function setPwStatus(msg, tone) {
    const el = $('pwStatus');
    if (!el) return;
    el.classList.remove('hidden', 'status--ok', 'status--error', 'status--info');
    el.classList.add('status', tone === 'ok' ? 'status--ok' : tone === 'error' ? 'status--error' : 'status--info');
    el.textContent = msg;
  }

  function bindLogout() {
    $('logoutBtn')?.addEventListener('click', async () => {
      if (await Core.ui.confirm('Deseja realmente sair?', 'Confirmar')) {
        Core.user.clearSession();
        window.location.href = 'index.html';
      }
    });
  }

  // -------------------------------
  // USER
  // -------------------------------
  function loadUser() {
    const user = Core.storage.getJSON(Core.keys.user(uid()), null) || {};
    // v6.5.5: Corrigido - inputs usam .value, não .textContent
    if ($('displayNome')) $('displayNome').value = user.nome || '—';
    if ($('displayEmail')) $('displayEmail').value = user.email || '—';
    if ($('displayDataCriacao')) $('displayDataCriacao').value = user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '—';
  }

  // -------------------------------
  // SEGURANÇA (v8)
  // -------------------------------
  function setupSecurity() {
    const form = $('formChangePassword');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const current = String($('currentPassword')?.value || '');
      const next = String($('newPassword')?.value || '');
      const confirmNext = String($('confirmPassword')?.value || '');

      if (next.length < 6) {
        setPwStatus('A nova senha deve ter no mínimo 6 caracteres.', 'error');
        return;
      }
      if (next !== confirmNext) {
        setPwStatus('Confirmação de senha não confere.', 'error');
        return;
      }

      const userKey = Core.keys.user(uid());
      const user = Core.storage.getJSON(userKey, null);
      if (!user) {
        setPwStatus('Usuário não encontrado (storage).', 'error');
        return;
      }

      const currentHash = await Core.crypto.sha256Hex(current);
      if (currentHash !== user.passwordHash) {
        setPwStatus('Senha atual incorreta.', 'error');
        return;
      }

      const newHash = await Core.crypto.sha256Hex(next);
      user.passwordHash = newHash;

      Core.storage.setJSON(userKey, user);

      // limpa campos
      $('currentPassword').value = '';
      $('newPassword').value = '';
      $('confirmPassword').value = '';

      setPwStatus('Senha atualizada com sucesso.', 'ok');
      try { ERP.toast('Senha atualizada.', 'success'); } catch {}
    });
  }

  // -------------------------------
  // MANAGERS (mantido)
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
        
        // Coluna 1: Toggle (checkbox + "Ativo")
        const toggleCol = document.createElement('div');
        toggleCol.className = 'manager-toggle';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = it.active;
        checkbox.dataset.catActive = it.id;
        
        const activeLabel = document.createElement('span');
        activeLabel.textContent = 'Ativo';
        
        toggleCol.appendChild(checkbox);
        toggleCol.appendChild(activeLabel);
        
        // Coluna 2: Input (nome editável)
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'manager-input input';
        input.value = it.label || it.originalLabel;
        input.dataset.catLabel = it.id;
        
        // Coluna 3: Nome original (muted)
        const originalSpan = document.createElement('span');
        originalSpan.className = 'manager-muted';
        originalSpan.textContent = it.originalLabel || it.label;
        originalSpan.title = it.originalLabel || it.label;
        
        row.appendChild(toggleCol);
        row.appendChild(input);
        row.appendChild(originalSpan);
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

    $('btnSalvarCats')?.addEventListener('click', async () => {
      const kind = catKind();
      const items = ERP_CFG.getCategoryConfig(kind).map((it) => {
        const active = !!document.querySelector(`[data-cat-active="${it.id}"]`)?.checked;
        const label = document.querySelector(`[data-cat-label="${it.id}"]`)?.value || it.label;
        return { ...it, active, label: String(label).trim() || it.label };
      });

      ERP_CFG.setCategoryConfig(kind, items);
      try { window.SyncService?.markDirty?.('cfgCats'); } catch {}
      // v6.5: reflete imediatamente nos formulários (dashboard/metas/etc.)
      document.dispatchEvent(new CustomEvent('erp_cfg_changed'));
      ERP.toast('✓ Categorias salvas!', 'success');
      renderCats(kind);
    });

    $('btnResetCats')?.addEventListener('click', async () => {
      if (!(await Core.ui.confirm('Restaurar categorias para o padrão?', 'Confirmar'))) return;
      localStorage.removeItem(Core.keys.cfgCats(uid()));
      ERP_CFG.ensureCategoriesConfig();
      try { window.SyncService?.markDirty?.('cfgCats-reset'); } catch {}
      document.dispatchEvent(new CustomEvent('erp_cfg_changed'));
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
        
        // Coluna 1: Toggle (checkbox + "Ativo")
        const toggleCol = document.createElement('div');
        toggleCol.className = 'manager-toggle';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = it.active;
        checkbox.dataset.bankActive = it.id;
        
        const activeLabel = document.createElement('span');
        activeLabel.textContent = 'Ativo';
        
        toggleCol.appendChild(checkbox);
        toggleCol.appendChild(activeLabel);
        
        // Coluna 2: Input (nome editável)
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'manager-input input';
        input.value = it.label || it.originalLabel;
        input.dataset.bankLabel = it.id;
        
        // Coluna 3: Nome original (muted)
        const originalSpan = document.createElement('span');
        originalSpan.className = 'manager-muted';
        originalSpan.textContent = it.originalLabel || it.label;
        originalSpan.title = it.originalLabel || it.label;
        
        row.appendChild(toggleCol);
        row.appendChild(input);
        row.appendChild(originalSpan);
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

    $('btnSalvarBanks')?.addEventListener('click', async () => {
      const type = bankType();
      const items = ERP_CFG.getBankConfig(type).map((it) => {
        const active = !!document.querySelector(`[data-bank-active="${it.id}"]`)?.checked;
        const label = document.querySelector(`[data-bank-label="${it.id}"]`)?.value || it.label;
        return { ...it, active, label: String(label).trim() || it.label };
      });

      ERP_CFG.setBankConfig(type, items);
      try { window.SyncService?.markDirty?.('cfgBanks'); } catch {}
      document.dispatchEvent(new CustomEvent('erp_cfg_changed'));
      ERP.toast('✓ Bancos salvos!', 'success');
      renderBanks(type);
    });

    $('btnResetBanks')?.addEventListener('click', async () => {
      if (!(await Core.ui.confirm('Restaurar bancos para o padrão?', 'Confirmar'))) return;
      localStorage.removeItem(Core.keys.cfgBanks(uid()));
      ERP_CFG.ensureBanksConfig();
      try { window.SyncService?.markDirty?.('cfgBanks-reset'); } catch {}
      document.dispatchEvent(new CustomEvent('erp_cfg_changed'));
      ERP.toast('✓ Bancos restaurados.', 'info');
      renderBanks(bankType());
    });
  }

  // -------------------------------
  // BACKUP / EXPORT / THEME (mantido)
  // -------------------------------
  function setupBackup() {
    const btnExport = $('btnExportBackup');
    const btnImport = $('btnImportBackup');
    const btnCSV = $('btnExportCSV');
    const info = $('backupInfo');
    const themeMode = $('themeMode');

    if (themeMode) {
      themeMode.value = ERP.theme.get();
      themeMode && themeMode.addEventListener('change', () => ERP.theme.set(themeMode.value));
    }

    const monthId = Core.selectedMonth.get(uid()) || Core.month.getMonthId(new Date());
    if (info) info.textContent = `Mês em foco: ${Core.month.getMonthLabel(monthId)} • Backup por usuário (offline)`;

    btnExport?.addEventListener('click', async () => {
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

        const ok = await Core.ui.confirm(
          `Importar backup?\n\n` +
          `Usuário do backup: ${obj.userId}\n` +
          `Keys no arquivo: ${keys.length}\n` +
          `Keys que serão sobrescritas: ${overwrites}\n\n` +
          `⚠️ A importação NÃO apaga nada, mas pode sobrescrever dados existentes.`
        , 'Confirmar');
        if (!ok) return;

        const res = Core.backup.applyPayload(obj);
        // Dispara sync completo para replicar todos os dados restaurados
        try {
          window.SyncService?.scanLocalChanges?.(uid());
          window.SyncService?.markDirty?.('backup-restore');
        } catch {}
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

  boot();
})();