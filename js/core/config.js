/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/core/config.js
   Versão: 8.2.6 | Data: 2026-02-19 | Autor: JW

   RESPONSABILIDADE:
   Gerenciamento de configurações por usuário:
   - Categorias customizáveis (ativar/desativar/renomear)
   - Bancos customizáveis por tipo de transação

   PADRÃO DE ARMAZENAMENTO:
   ─────────────────────────
   key: gf_erp_cfg_categorias_{userId}
   value: { receita: [{id, label, active}], poupanca: [...], ... }

   key: gf_erp_cfg_bancos_{userId}
   value: { receita: [{id, label, active}], poupanca: [...], ... }

   MIGRAÇÃO:
   Se não houver config do usuário, tenta herdar config global (v4.x)
   e então usa os defaults de ERP_CONST.

   DEPENDÊNCIAS:
   - js/core/constants.js (ERP_CONST)
   - js/core/core.js (Core.user, Core.storage)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (!window.ERP_CONST) {
    console.error('[ERP_CFG] ERP_CONST não carregado. Verifique a ordem dos scripts.');
    return;
  }

  // ─────────────────────────────────────────────
  // HELPERS INTERNOS
  // ─────────────────────────────────────────────

  /** Resolve userId da sessão atual (pode ser null se não logado) */
  function getUserId() {
    try { return window.Core?.user?.getCurrentUserId?.() || null; }
    catch { return null; }
  }

  /**
   * Normaliza label: trim + colapsa espaços múltiplos
   * @param {string} s
   */
  function normalizeLabel(s) {
    return String(s || '').trim().replace(/\s+/g, ' ');
  }

  /** Key de categorias: por usuário se logado, global como fallback */
  function keyCats() {
    const uid = getUserId();
    return uid ? `gf_erp_cfg_categorias_${uid}` : 'gf_erp_cfg_categorias';
  }

  /** Key de bancos: por usuário se logado, global como fallback */
  function keyBanks() {
    const uid = getUserId();
    return uid ? `gf_erp_cfg_bancos_${uid}` : 'gf_erp_cfg_bancos';
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[ERP_CFG] Falha ao ler JSON:', key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ─────────────────────────────────────────────
  // CATEGORIAS
  // ─────────────────────────────────────────────

  /**
   * Monta config de categorias a partir dos defaults de ERP_CONST.
   * Cada item: { id, originalLabel, label, active: true }
   */
  function buildDefaultCategoriesConfig() {
    const out  = {};
    const base = window.ERP_CONST.categories;

    Object.keys(base).forEach((kind) => {
      out[kind] = base[kind].map((c) => ({
        id:            c.id,
        originalLabel: c.label,
        label:         c.label,
        active:        true
      }));
    });

    return out;
  }

  /**
   * Garante que a config existe (cria se necessário).
   * Ordem de prioridade:
   *   1. Config do usuário logado
   *   2. Config global legada (v4.x)
   *   3. Defaults de ERP_CONST
   */
  function ensureCategoriesConfig() {
    const cfg = loadJSON(keyCats(), null);
    if (cfg && typeof cfg === 'object') return cfg;

    // tenta herdar config global legada (migração suave)
    const legacy = loadJSON('gf_erp_cfg_categorias', null);
    if (legacy && typeof legacy === 'object') {
      saveJSON(keyCats(), legacy);
      return legacy;
    }

    const fresh = buildDefaultCategoriesConfig();
    saveJSON(keyCats(), fresh);
    return fresh;
  }

  /** @param {string} kind - receita|poupanca|despesa_essencial|despesa_livre|divida */
  function getCategoryConfig(kind) {
    const cfg = ensureCategoriesConfig();
    return Array.isArray(cfg[kind]) ? cfg[kind] : [];
  }

  function setCategoryConfig(kind, items) {
    const cfg = ensureCategoriesConfig();
    cfg[kind] = items;
    saveJSON(keyCats(), cfg);
  }

  /**
   * Retorna apenas os labels das categorias ativas.
   * Usado para popular selects nos formulários.
   */
  function getActiveCategoryLabels(kind) {
    return getCategoryConfig(kind)
      .filter((i) => (typeof i === 'string') ? true : (i && i.active !== false))
      .map((i)    => (typeof i === 'string') ? i     : i.label);
  }

  /**
   * Alterna ativo/inativo de uma categoria por id ou label.
   * @param {string} kind
   * @param {string} idOrLabel
   */
  function toggleCategory(kind, idOrLabel) {
    const items = getCategoryConfig(kind).map((it) => {
      const matchId    = String(it.id)  === String(idOrLabel);
      const matchLabel = normalizeLabel(it.label) === normalizeLabel(idOrLabel);
      if (matchId || matchLabel) return { ...it, active: !it.active };
      return it;
    });
    setCategoryConfig(kind, items);
    return items;
  }

  // ─────────────────────────────────────────────
  // BANCOS
  // ─────────────────────────────────────────────

  /**
   * Monta config de bancos a partir dos defaults de ERP_CONST.
   * Cada tipo de transação tem sua própria lista de bancos ativos.
   */
  function buildDefaultBanksConfig() {
    const base     = window.ERP_CONST.banksBase;
    const defaults = window.ERP_CONST.banksByTypeDefault;

    const makeType = (type) => {
      const activeSet = new Set((defaults[type] || []).map(normalizeLabel));
      return base.map((b) => ({
        id:            b.id,
        originalLabel: b.label,
        label:         b.label,
        active:        activeSet.has(normalizeLabel(b.label))
      }));
    };

    return {
      receita:  makeType('receita'),
      poupanca: makeType('poupanca'),
      despesa:  makeType('despesa'),
      divida:   makeType('divida')
    };
  }

  function ensureBanksConfig() {
    const cfg = loadJSON(keyBanks(), null);
    if (cfg && typeof cfg === 'object') return cfg;

    const legacy = loadJSON('gf_erp_cfg_bancos', null);
    if (legacy && typeof legacy === 'object') {
      saveJSON(keyBanks(), legacy);
      return legacy;
    }

    const fresh = buildDefaultBanksConfig();
    saveJSON(keyBanks(), fresh);
    return fresh;
  }

  /** @param {string} type - receita|poupanca|despesa|divida */
  function getBankConfig(type) {
    const cfg = ensureBanksConfig();
    return Array.isArray(cfg[type]) ? cfg[type] : [];
  }

  function setBankConfig(type, items) {
    const cfg = ensureBanksConfig();
    cfg[type] = items;
    saveJSON(keyBanks(), cfg);
  }

  function getActiveBankLabels(type) {
    return getBankConfig(type)
      .filter((i) => (typeof i === 'string') ? true : (i && i.active !== false))
      .map((i)    => (typeof i === 'string') ? i     : i.label);
  }

  function toggleBank(type, idOrLabel) {
    const items = getBankConfig(type).map((it) => {
      const matchId    = String(it.id)  === String(idOrLabel);
      const matchLabel = normalizeLabel(it.label) === normalizeLabel(idOrLabel);
      if (matchId || matchLabel) return { ...it, active: !it.active };
      return it;
    });
    setBankConfig(type, items);
    return items;
  }

  // ─────────────────────────────────────────────
  // UTILIDADE — Seleção compatível com legado
  // ─────────────────────────────────────────────

  /**
   * Garante que um valor aparece na lista (injeta temporariamente).
   * Usado quando um lançamento antigo usa uma categoria que foi desativada.
   */
  function ensureValueInList(list, value) {
    const v = normalizeLabel(value);
    if (!v) return list.slice();
    const exists = list.some((x) => normalizeLabel(x) === v);
    if (exists) return list.slice();
    return [value, ...list]; // valor antigo no topo da lista
  }

  // ─────────────────────────────────────────────
  // EXPORT NAMESPACE GLOBAL
  // ─────────────────────────────────────────────
  window.ERP_CFG = {
    // Categorias
    ensureCategoriesConfig,
    getCategoryConfig,
    setCategoryConfig,
    getActiveCategoryLabels,
    toggleCategory,
    getCategoriesByKind: getCategoryConfig, // alias

    // Bancos
    ensureBanksConfig,
    getBankConfig,
    setBankConfig,
    getActiveBankLabels,
    toggleBank,
    getBanksByType: getBankConfig, // alias

    // Utilitários
    ensureValueInList,
    normalizeLabel
  };

})();
