/* =====================================================
   ERP JW Finance v8.0.1 - GERENCIADORES
   - Listas Globais Inteligentes (Categorias e Bancos)
   - UI em tabela com scroll (estilo planilha)
   ===================================================== */
(function () {
  'use strict';

  async function boot() {
    try { if (window.Core?.migrate) await Core.migrate.runOnce(); } catch {}
    if (!window.Core || !window.ERP_CFG) return;
    try { await window.SyncService?.start(Core.user.getCurrentUserId()); } catch (err) { console.warn('[Gerenciadores] SyncService indisponível:', err); }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { Core.user.clearSession(); window.location.href = 'index.html'; });

    const catGrupo = document.getElementById('catGrupo');
    const bankTipo = document.getElementById('bankTipo');

    const catBody = document.getElementById('catLista');
    const bankBody = document.getElementById('bankLista');

    const btnSalvarCats = document.getElementById('btnSalvarCats');
    const btnResetCats = document.getElementById('btnResetCats');
    const btnAddCat = document.getElementById('btnAddCat');

    const btnSalvarBanks = document.getElementById('btnSalvarBanks');
    const btnResetBanks = document.getElementById('btnResetBanks');
    const btnAddBank = document.getElementById('btnAddBank');

    function normalizeLabel(s) {
      return String(s || '').trim().replace(/\s+/g, ' ');
    }

    function dedupeById(list) {
      const seen = new Set();
      const seenLabel = new Set();
      return (list || []).map((i, idx) => {
        if (typeof i === 'string') return { id: '', label: i, active: true };
        return i || {};
      }).filter((i, idx) => {
        const labelN = ERP_CFG.normalizeLabel(i.label || i.originalLabel || '');
        const id = String(i.id || '');
        const key = id || labelN || `idx_${idx}`;
        if (seen.has(key)) return false;
        // evita duplicidade por label também
        if (!id && labelN && seenLabel.has(labelN)) return false;
        seen.add(key);
        if (labelN) seenLabel.add(labelN);
        // garante que sem id continue aparecendo
        return true;
      }).map((i, idx) => {
        if (!i.id) i.id = i.id || (`custom_${ERP_CFG.normalizeLabel(i.label || '') || idx}`);
        if (i.active === undefined) i.active = true;
        if (!i.label && i.originalLabel) i.label = i.originalLabel;
        return i;
      });
    }

    function renderCategories() {
      if (!catBody) return;
      catBody.textContent = '';
      const kind = catGrupo?.value || 'receita';
      const list = dedupeById(ERP_CFG.getCategoryConfig(kind));

      list.forEach((c, idx) => {
        const tr = document.createElement('tr');

        const tdA = document.createElement('td');
        tdA.style.width = '90px';
        const lab = document.createElement('label');
        lab.style.display = 'flex';
        lab.style.gap = '8px';
        lab.style.alignItems = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = c.active !== false;
        cb.dataset.idx = String(idx);
        lab.appendChild(cb);
        const sp = document.createElement('span');
        sp.textContent = 'Ativo';
        sp.className = 'text-muted';
        lab.appendChild(sp);
        tdA.appendChild(lab);

        const tdN = document.createElement('td');
        const input = document.createElement('input');
        input.className = 'input';
        input.value = c.label || '';
        input.dataset.idx = String(idx);
        tdN.appendChild(input);
        tr.appendChild(tdA);
        tr.appendChild(tdN);
        catBody.appendChild(tr);
      });
    }

    function renderBanks() {
      if (!bankBody) return;
      bankBody.textContent = '';
      const type = bankTipo?.value || 'receita';
      const list = dedupeById(ERP_CFG.getBankConfig(type));

      list.forEach((b, idx) => {
        const tr = document.createElement('tr');

        const tdA = document.createElement('td');
        tdA.style.width = '90px';
        const lab = document.createElement('label');
        lab.style.display = 'flex';
        lab.style.gap = '8px';
        lab.style.alignItems = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = b.active !== false;
        cb.dataset.idx = String(idx);
        lab.appendChild(cb);
        const sp = document.createElement('span');
        sp.textContent = 'Ativo';
        sp.className = 'text-muted';
        lab.appendChild(sp);
        tdA.appendChild(lab);

        const tdN = document.createElement('td');
        const input = document.createElement('input');
        input.className = 'input';
        input.value = b.label || '';
        input.dataset.idx = String(idx);
        tdN.appendChild(input);
        tr.appendChild(tdA);
        tr.appendChild(tdN);
        bankBody.appendChild(tr);
      });
    }

    function collectEditedCategories() {
      const kind = catGrupo?.value || 'receita';
      const base = dedupeById(ERP_CFG.getCategoryConfig(kind));
      const rows = Array.from(catBody.querySelectorAll('tr'));
      rows.forEach((tr, idx) => {
        const cb = tr.querySelector('input[type="checkbox"]');
        const input = tr.querySelector('input.input');
        if (!base[idx]) return;
        base[idx].active = (cb ? !!cb.checked : true);
        base[idx].label = normalizeLabel((input && input.value) || base[idx].label);
      });
      return { kind, list: base };
    }

    function collectEditedBanks() {
      const type = bankTipo?.value || 'receita';
      const base = dedupeById(ERP_CFG.getBankConfig(type));
      const rows = Array.from(bankBody.querySelectorAll('tr'));
      rows.forEach((tr, idx) => {
        const cb = tr.querySelector('input[type="checkbox"]');
        const input = tr.querySelector('input.input');
        if (!base[idx]) return;
        base[idx].active = (cb ? !!cb.checked : true);
        base[idx].label = normalizeLabel((input && input.value) || base[idx].label);
      });
      return { type, list: base };
    }

    if (catGrupo) catGrupo.addEventListener('change', renderCategories);
    if (bankTipo) bankTipo.addEventListener('change', renderBanks);

    if (btnSalvarCats) btnSalvarCats.addEventListener('click', () => {
      const { kind, list } = collectEditedCategories();
      ERP_CFG.setCategoryConfig(kind, list);
      try { window.SyncService?.markDirty?.('cfgCats'); } catch {}
      ERP.toast('✓ Categorias salvas!', 'success');
    });

    if (btnResetCats) btnResetCats.addEventListener('click', () => {
      localStorage.removeItem(`gf_erp_cfg_categorias_${Core.user.getCurrentUserId()}`);
      ERP_CFG.ensureCategoriesConfig();
      try { window.SyncService?.markDirty?.('cfgCats-reset'); } catch {}
      renderCategories();
      ERP.toast('✓ Categorias restauradas!', 'success');
    });

    if (btnAddCat) btnAddCat.addEventListener('click', () => {
      const kind = catGrupo?.value || 'receita';
      const list = dedupeById(ERP_CFG.getCategoryConfig(kind));
      const id = `usr_${Date.now()}`;
      list.unshift({ id, originalLabel: 'Personalizado', label: 'Novo item', active: true, custom: true });
      ERP_CFG.setCategoryConfig(kind, list);
      try { window.SyncService?.markDirty?.('cfgCats-add'); } catch {}
      renderCategories();
    });

    if (btnSalvarBanks) btnSalvarBanks.addEventListener('click', () => {
      const { type, list } = collectEditedBanks();
      ERP_CFG.setBankConfig(type, list);
      try { window.SyncService?.markDirty?.('cfgBanks'); } catch {}
      ERP.toast('✓ Bancos salvos!', 'success');
    });

    if (btnResetBanks) btnResetBanks.addEventListener('click', () => {
      localStorage.removeItem(`gf_erp_cfg_bancos_${Core.user.getCurrentUserId()}`);
      ERP_CFG.ensureBanksConfig();
      try { window.SyncService?.markDirty?.('cfgBanks-reset'); } catch {}
      renderBanks();
      ERP.toast('✓ Bancos restaurados!', 'success');
    });

    if (btnAddBank) btnAddBank.addEventListener('click', () => {
      const type = bankTipo?.value || 'receita';
      const list = dedupeById(ERP_CFG.getBankConfig(type));
      const id = `usr_${Date.now()}`;
      list.unshift({ id, originalLabel: 'Personalizado', label: 'Novo item', active: true, custom: true });
      ERP_CFG.setBankConfig(type, list);
      try { window.SyncService?.markDirty?.('cfgBanks-add'); } catch {}
      renderBanks();
    });

    // first render
    ERP_CFG.ensureCategoriesConfig();
    ERP_CFG.ensureBanksConfig();
    renderCategories();
    renderBanks();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
