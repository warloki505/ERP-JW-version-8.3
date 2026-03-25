/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/core/core.js
   Versão: 8.2.6 | Data: 2026-02-19 | Autor: JW

   RESPONSABILIDADE (Fonte Única de Verdade):
   Núcleo central do sistema — todos os módulos dependem deste.
   Expõe o namespace global `window.Core` com os seguintes submódulos:

   ┌─────────────────────────────────────────────────────────┐
   │  Core.APP          → metadados de versão                │
   │  Core.storage      → wrapper seguro do localStorage     │
   │  Core.format       → formatação de moeda (BRL)          │
   │  Core.month        → utilitários de mês (YYYY-MM)       │
   │  Core.user         → sessão e hash de usuário           │
   │  Core.keys         → namespacing de keys por usuário    │
   │  Core.calc         → cálculos financeiros centralizados │
   │  Core.tx           → CRUD de transações por mês         │
   │  Core.period       → iteração por período (range)       │
   │  Core.selectedMonth → mês ativo do usuário              │
   │  Core.migrate      → migração v4.x → v6.5              │
   │  Core.export       → exportação CSV                     │
   │  Core.backup       → backup/restore JSON                │
   │  Core.guards       → proteção de rotas (requer login)   │
   │  Core.safe         → sanitização de dados               │
   │  Core.log          → logger estruturado com níveis      │
   │  Core.ui           → modais customizados (confirm/ask)  │
   │  Core.getMetrics   → ponto único: sum + health + score  │
   └─────────────────────────────────────────────────────────┘

   FÓRMULAS FINANCEIRAS DOCUMENTADAS:
   ────────────────────────────────────
   saldo      = renda − poupança − essenciais − livres − dívidas
   taxaPoupc  = poupança / renda × 100
   taxaDívida = dívidas  / renda × 100
   taxaEss    = essenciais / renda × 100
   score      = (pontosPoupança×40 + pontosEndiv×30 + pontosEss×30) / 100

   DEPENDÊNCIAS: js/core/constants.js (ERP_CONST)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const Core = {};

  // ─────────────────────────────────────────────
  // APP — Metadados de versão (FONTE ÚNICA)
  // Todos os outros arquivos lêem daqui.
  // ─────────────────────────────────────────────
  const APP = {
    version:       '8.2.6',
    backupVersion: '3',
    releaseDate:   '2026-02-19',
    schemaVersion: '8.0'        // versão do schema do localStorage
  };

  // ─────────────────────────────────────────────
  // STORAGE — Wrapper seguro para localStorage
  // Toda leitura/escrita passa por aqui para evitar
  // exceções quando localStorage está bloqueado.
  // ─────────────────────────────────────────────
  Core.storage = {
    /**
     * Lê uma string do localStorage.
     * @param {string} key
     * @param {*} fallback - valor retornado em caso de erro ou chave ausente
     */
    safeGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return (raw === null || raw === undefined) ? fallback : raw;
      } catch (e) {
        console.warn('[Core.storage] safeGet falhou:', key, e);
        return fallback;
      }
    },

    /**
     * Escreve uma string no localStorage.
     * @returns {boolean} true se sucesso
     */
    safeSet(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.warn('[Core.storage] safeSet falhou:', key, e);
        return false;
      }
    },

    /**
     * Lê e parseia JSON do localStorage.
     * @param {string} key
     * @param {*} fallback - retornado se a chave não existir ou parse falhar
     */
    getJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn('[Core.storage] getJSON falhou:', key, e);
        return fallback;
      }
    },

    /**
     * Serializa e escreve um objeto JSON no localStorage.
     * @returns {boolean} true se sucesso
     */
    setJSON(key, value) {
      return Core.storage.safeSet(key, JSON.stringify(value));
    }
  };

  // ─────────────────────────────────────────────
  // FORMAT — Formatação e parsing de moeda BRL
  // ─────────────────────────────────────────────
  Core.format = {
    /**
     * Formata número como moeda BRL (ex: R$ 1.234,56)
     * @param {number|string} value
     */
    brl(value) {
      return (Number(value) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    },

    /**
     * Faz parse de string BRL para número.
     * Aceita: "R$ 1.234,56" | "1.234,56" | "1234.56" | "1234,56"
     * @param {string|number} str
     * @returns {number}
     */
    parseBRL(str) {
      const s = String(str ?? '').trim();
      if (!s) return 0;
      const cleaned = s
        .replace(/\s/g, '')
        .replace(/^R\$\s*/i, '')   // remove "R$"
        .replace(/\./g, '')         // remove separador de milhar
        .replace(/,/g, '.')         // vírgula → ponto decimal
        .replace(/[^\d.-]/g, '');   // remove qualquer outro char
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
  };

  // ─────────────────────────────────────────────
  // MONTH — Utilitários de mês no formato YYYY-MM
  // ─────────────────────────────────────────────
  Core.month = {
    /**
     * Retorna o ID do mês no formato YYYY-MM
     * @param {Date} date - padrão: hoje
     */
    getMonthId(date = new Date()) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    },

    /**
     * Converte YYYY-MM para rótulo legível (ex: "fevereiro de 2026")
     * @param {string} monthId
     */
    getMonthLabel(monthId) {
      const [y, m] = String(monthId || '').split('-');
      if (!y || !m) return '';
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    },

    /**
     * Retorna quantos dias tem o mês (28/29/30/31)
     * @param {string} monthId
     */
    daysInMonth(monthId) {
      const [y, m] = String(monthId || '').split('-').map(Number);
      if (!y || !m) return 30;
      return new Date(y, m, 0).getDate();
    },

    /**
     * Clipa um dia no intervalo válido do mês (1 a daysInMonth)
     * Garante que lançamentos recorrentes não fiquem em datas inválidas
     * Ex: dia 31 em fevereiro → dia 28
     */
    clampDay(monthId, day) {
      const max = Core.month.daysInMonth(monthId);
      const d   = Math.max(1, Math.min(max, Number(day) || 1));
      return String(d).padStart(2, '0');
    },

    /**
     * Avança N meses a partir de um monthId
     * @param {string} monthId
     * @param {number} delta - pode ser negativo
     */
    addMonths(monthId, delta) {
      const d = Core.period.monthIdToDate(monthId);
      d.setMonth(d.getMonth() + (Number(delta) || 0));
      return Core.month.getMonthId(d);
    }
  };

  // ─────────────────────────────────────────────
  // USER / SESSION — Autenticação e identidade
  // ─────────────────────────────────────────────
  const SESSION = {
    loggedKey:        'gf_erp_logged',
    currentUserIdKey: 'gf_erp_current_userId',
    migratedFlag:     'gf_erp_migrated_v5_1'
  };

  /** @param {ArrayBuffer} buf */
  function bytesToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * SHA-256 do texto (Web Crypto API, nativo no browser)
   * @param {string} input
   * @returns {Promise<string>} hex de 64 chars
   */
  async function sha256Hex(input) {
    const enc  = new TextEncoder().encode(String(input ?? ''));
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return bytesToHex(hash);
  }

  Core.user = {
    SESSION,

    /**
     * Gera userId a partir do e-mail (SHA-256 truncado 16 chars)
     * Garante isolamento de dados entre usuários no mesmo device.
     */
    async hashEmail(email) {
      const hex = await sha256Hex(String(email || '').trim().toLowerCase());
      return hex.slice(0, 16);
    },

    getCurrentUserId() {
      return Core.storage.safeGet(SESSION.currentUserIdKey, null);
    },

    setCurrentUserId(userId) {
      Core.storage.safeSet(SESSION.currentUserIdKey, String(userId || ''));
    },

    /** Remove sessão ativa (logout) — não apaga dados do usuário */
    clearSession() {
      localStorage.setItem(SESSION.loggedKey, 'false');
      localStorage.removeItem(SESSION.currentUserIdKey);
    },

    isLogged() {
      return localStorage.getItem(SESSION.loggedKey) === 'true'
          && !!Core.user.getCurrentUserId();
    }
  };

  // ─────────────────────────────────────────────
  // KEYS — Namespacing de keys do localStorage
  // Padrão: gf_erp_{tipo}_{userId}[_{monthId}]
  // Evita colisão entre usuários no mesmo browser
  // ─────────────────────────────────────────────
  Core.keys = {
    user(userId)           { return `gf_erp_user_${userId}`; },
    tx(userId, monthId)    { return `gf_erp_tx_${userId}_${monthId}`; },
    recorr(userId)         { return `gf_erp_recorr_${userId}`; },
    recorrApplied(userId, monthId) { return `gf_erp_recorr_applied_${userId}_${monthId}`; },
    selectedMonth(userId)  { return `gf_erp_selected_month_${userId}`; },
    goals(userId)          { return `gf_erp_goals_${userId}`; },
    theme(userId)          { return `gf_erp_theme_${userId}`; },
    cfgCats(userId)        { return `gf_erp_cfg_categorias_${userId}`; },
    cfgBanks(userId)       { return `gf_erp_cfg_bancos_${userId}`; },
    budgetPct(userId, monthId) { return `gf_erp_budgetpct_${userId}_${monthId}`; }
  };

  // ─────────────────────────────────────────────
  // CALC — Cálculos financeiros centralizados
  //
  // TODAS AS FÓRMULAS DO SISTEMA PASSAM AQUI.
  // Nenhum módulo externo calcula finanças diretamente.
  // ─────────────────────────────────────────────
  Core.calc = {

    /**
     * Sumariza uma lista de transações em totais por tipo.
     *
     * FÓRMULA DO SALDO:
     *   saldo = renda − poupança − essenciais − livres − dívidas
     *
     * Lógica: a renda é a entrada. Tudo que sai (poupança, despesas, dívidas)
     * reduz o saldo disponível. Poupança também subtrai pois sai da conta corrente.
     *
     * @param {Array} txList - lista de transações do mês
     * @returns {{ renda, poupanca, essenciais, livres, dividas, saldo }}
     */
    summary(txList) {
      const list = Array.isArray(txList) ? txList : [];
      let renda = 0, poupanca = 0, essenciais = 0, livres = 0, dividas = 0;

      list.forEach((t) => {
        if (!t) return;
        const v = Number(t.valor) || 0;
        if (t.tipo === 'receita')                               renda     += v;
        if (t.tipo === 'poupanca')                              poupanca  += v;
        if (t.tipo === 'divida')                                dividas   += v;
        if (t.tipo === 'despesa' && t.subtipo === 'essencial')  essenciais += v;
        if (t.tipo === 'despesa' && t.subtipo === 'livre')      livres    += v;
      });

      const saldo = renda - poupanca - essenciais - livres - dividas;
      return { renda, poupanca, essenciais, livres, dividas, saldo };
    },

    /**
     * Calcula taxas percentuais em relação à renda.
     *
     * FÓRMULA: taxa = valor / renda × 100
     * Retorna null para todas as taxas se renda ≤ 0
     * (evita divisão por zero e percentuais sem sentido)
     *
     * @param {{ renda, poupanca, dividas, essenciais, livres }} summary
     * @returns {{ poupanca, endividamento, essenciais, livres }} em %
     */
    rates(summary) {
      const r     = summary || {};
      const renda = Number(r.renda) || 0;

      if (renda <= 0) {
        return { poupanca: null, endividamento: null, essenciais: null, livres: null };
      }

      const pct = (x) => (Number(x) || 0) * 100 / renda;
      return {
        poupanca:      pct(r.poupanca),
        endividamento: pct(r.dividas),
        essenciais:    pct(r.essenciais),
        livres:        pct(r.livres)
      };
    },

    /**
     * Avalia a saúde financeira baseada em thresholds.
     *
     * Retorna status semântico para cada indicador:
     *   poupanca → highGood  (quanto maior, melhor)
     *   endividamento → lowGood (quanto menor, melhor)
     *   essenciais → lowGood (quanto menor, melhor)
     *
     * @param {object} summary - resultado de Core.calc.summary()
     * @param {object} thresholds - de ERP_CONST.thresholds
     * @returns {{ poupanca, endividamento, essenciais, livres }}
     */
    health(summary, thresholds) {
      const t     = thresholds || {};
      const rates = Core.calc.rates(summary);

      /**
       * Mapeia um valor numérico para { rate, status, tone }
       * @param {number|null} value - percentual
       * @param {object} rules - thresholds específicos
       * @param {'highGood'|'lowGood'} mode
       */
      function statusFrom(value, rules, mode) {
        if (value === null || value === undefined) {
          return { rate: null, status: 'Sem dados', tone: 'info' };
        }

        if (mode === 'highGood') {
          // Poupança: mais é melhor
          if (value >= (rules.excelente ?? 30)) return { rate: value, status: 'Excelente', tone: 'ok' };
          if (value >= (rules.otima     ?? 20)) return { rate: value, status: 'Ótima',     tone: 'ok' };
          if (value >= (rules.aceitavel ?? 10)) return { rate: value, status: 'Aceitável', tone: 'warn' };
          return { rate: value, status: 'Baixa', tone: 'error' };
        } else {
          // Dívidas / Essenciais: menos é melhor
          if (value <= (rules.saudavel ?? rules.ideal     ?? 10)) return { rate: value, status: 'Saudável', tone: 'ok' };
          if (value <= (rules.atencao  ?? rules.aceitavel ?? 20)) return { rate: value, status: 'Atenção',  tone: 'warn' };
          if (value <= (rules.perigoso ?? rules.alto      ?? 30)) return { rate: value, status: 'Perigoso', tone: 'error' };
          return { rate: value, status: 'Crítico', tone: 'error' };
        }
      }

      return {
        poupanca:      statusFrom(rates.poupanca,      t.poupanca      || {}, 'highGood'),
        endividamento: statusFrom(rates.endividamento, t.endividamento || {}, 'lowGood'),
        essenciais:    statusFrom(rates.essenciais,    t.essenciais    || {}, 'lowGood'),
        livres: rates.livres === null
          ? { rate: null, status: 'Sem dados', tone: 'info' }
          : { rate: rates.livres, status: 'OK', tone: 'info' }
      };
    },

    /**
     * Calcula o Score Financeiro (0 a 100)
     *
     * FÓRMULA:
     *   score = (pontosPoupança × 40 + pontosEndiv × 30 + pontosEss × 30) / 100
     *
     * Pesos padrão: poupança=40%, endividamento=30%, essenciais=30%
     * Pontuação por status:
     *   Excelente / Saudável → 100
     *   Ótima / Atenção       →  85 / 75
     *   Aceitável / Perigoso  →  65 / 45
     *   Baixa / Crítico       →  35 / 25
     *
     * @param {object} summary
     * @param {object} thresholds
     * @param {{ poupanca, endividamento, essenciais }} pesos
     * @returns {number|null} 0-100 ou null se sem dados
     */
    score(summary, thresholds, pesos) {
      const w    = pesos || { poupanca: 40, endividamento: 30, essenciais: 30 };
      const sumW = (w.poupanca + w.endividamento + w.essenciais) || 100;
      const h    = Core.calc.health(summary, thresholds);

      function points(item, tipo) {
        if (!item || item.rate === null) return null;
        const s = item.status;
        if (tipo === 'poupanca') {
          if (s === 'Excelente') return 100;
          if (s === 'Ótima')     return 85;
          if (s === 'Aceitável') return 65;
          return 35;
        } else {
          if (s === 'Saudável')  return 100;
          if (s === 'Atenção')   return 75;
          if (s === 'Perigoso')  return 45;
          return 25;
        }
      }

      const p1 = points(h.poupanca,      'poupanca');
      const p2 = points(h.endividamento, 'endividamento');
      const p3 = points(h.essenciais,    'essenciais');

      if (p1 === null && p2 === null && p3 === null) return null;

      const safe  = (v) => (v === null ? 0 : v);
      const score = (safe(p1) * w.poupanca + safe(p2) * w.endividamento + safe(p3) * w.essenciais) / sumW;
      return Math.round(score);
    },

    /**
     * Agrupa transações por banco e calcula saldo líquido.
     * Receita → positivo (+), demais → negativo (−)
     * @param {Array} txList
     * @returns {Array<{ bank, net }>} ordenado por |net| desc
     */
    groupByBank(txList) {
      const list = Array.isArray(txList) ? txList : [];
      const map  = {};

      list.forEach((t) => {
        if (!t) return;
        const bank  = String(t.banco || '—');
        const v     = Number(t.valor) || 0;
        const delta = (t.tipo === 'receita') ? +v : -v;
        map[bank] = (map[bank] || 0) + delta;
      });

      return Object.entries(map)
        .map(([bank, net]) => ({ bank, net }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    },

    /**
     * Dívidas agrupadas por banco (para análise de cartão de crédito)
     * @param {Array} txList
     * @returns {Array<{ bank, total }>}
     */
    cardBillsByBank(txList) {
      const list = Array.isArray(txList) ? txList : [];
      const map  = {};

      list.forEach((t) => {
        if (t?.tipo !== 'divida') return;
        const bank = String(t.banco || '—');
        map[bank]  = (map[bank] || 0) + (Number(t.valor) || 0);
      });

      return Object.entries(map)
        .map(([bank, total]) => ({ bank, total }))
        .sort((a, b) => b.total - a.total);
    },

    /**
     * Despesas por subtipo (essencial, livre, outros)
     * @param {Array} txList
     */
    expenseBySubtipo(txList) {
      const list = Array.isArray(txList) ? txList : [];
      const out  = { essencial: 0, livre: 0, outros: 0 };

      list.forEach((t) => {
        if (!t || t.tipo !== 'despesa') return;
        const v = Number(t.valor) || 0;
        if (t.subtipo === 'essencial')  out.essencial += v;
        else if (t.subtipo === 'livre') out.livre     += v;
        else                            out.outros    += v;
      });

      return out;
    },

    /**
     * Calcula metas de orçamento em R$ a partir de percentuais.
     *
     * FÓRMULA: target = renda × pct / 100
     *
     * Usado pela tela de Metas/Orçamento (v8).
     *
     * @param {{ renda, poupanca, essenciais, livres, dividas }} summary
     * @param {{ poupanca, essenciais, livres, dividas }} percent - em %
     */
    budgetFromPercent(summary, percent) {
      const renda = Number(summary?.renda) || 0;
      const p = {
        poupanca:  Number(percent?.poupanca)  || 0,
        essenciais: Number(percent?.essenciais) || 0,
        livres:    Number(percent?.livres)    || 0,
        dividas:   Number(percent?.dividas)   || 0
      };

      return {
        renda,
        pct: p,
        targets: {
          poupanca:  (renda * p.poupanca)  / 100,
          essenciais: (renda * p.essenciais) / 100,
          livres:    (renda * p.livres)    / 100,
          dividas:   (renda * p.dividas)   / 100
        },
        realized: {
          poupanca:  Number(summary?.poupanca)  || 0,
          essenciais: Number(summary?.essenciais) || 0,
          livres:    Number(summary?.livres)    || 0,
          dividas:   Number(summary?.dividas)   || 0
        }
      };
    }
  };

  // ─────────────────────────────────────────────
  // TX — CRUD de transações por mês/usuário
  // ─────────────────────────────────────────────
  Core.tx = {
    /**
     * Carrega transações de um mês específico.
     * @returns {Array} lista de transações ([] se vazio)
     */
    load(userId, monthId) {
      return Core.storage.getJSON(Core.keys.tx(userId, monthId), []);
    },

    /**
     * Salva lista de transações do mês.
     * @param {Array} list
     */
    save(userId, monthId, list) {
      return Core.storage.setJSON(Core.keys.tx(userId, monthId), Array.isArray(list) ? list : []);
    }
  };

  // ─────────────────────────────────────────────
  // PERIOD — Iteração por range de meses
  // ─────────────────────────────────────────────
  Core.period = {
    /**
     * Lista todos os meses com dados do usuário.
     * Faz scan das keys do localStorage pelo prefixo.
     * @returns {string[]} meses no formato YYYY-MM, ordenados
     */
    listMonthIds(userId) {
      const uid    = String(userId || '');
      if (!uid) return [];
      const prefix = `gf_erp_tx_${uid}_`;
      return Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .map(k => k.replace(prefix, ''))
        .filter(m => /^\d{4}-\d{2}$/.test(m))
        .sort((a, b) => a.localeCompare(b));
    },

    /**
     * Normaliza e valida um range de meses.
     * Garante que start ≤ end (inverte se necessário).
     * @returns {{ start, end }|null}
     */
    normalizeRange(start, end) {
      const s = String(start || '').trim();
      const e = String(end   || '').trim();
      if (!/^\d{4}-\d{2}$/.test(s) || !/^\d{4}-\d{2}$/.test(e)) return null;
      return s <= e ? { start: s, end: e } : { start: e, end: s };
    },

    /** Converte YYYY-MM para Date (dia 1) */
    monthIdToDate(monthId) {
      const [y, m] = String(monthId).split('-').map(Number);
      return new Date(y, (m || 1) - 1, 1);
    },

    /**
     * Generator que itera meses de start até end (inclusive).
     * Uso: for (const m of Core.period.iterateMonths('2026-01','2026-06'))
     */
    *iterateMonths(start, end) {
      const r = Core.period.normalizeRange(start, end);
      if (!r) return;
      let cur = r.start;
      while (cur <= r.end) {
        yield cur;
        cur = Core.month.addMonths(cur, 1);
      }
    },

    /**
     * Coleta todas as transações de um período.
     * Cada transação recebe __monthId para rastreabilidade.
     *
     * @returns {{ range: {start,end}, tx: Array }}
     */
    getTransactionsByPeriod(userId, start, end) {
      const r     = Core.period.normalizeRange(start, end);
      const range = r || { start: '', end: '' };
      if (!r) return { range, tx: [] };

      const out = [];
      for (const monthId of Core.period.iterateMonths(r.start, r.end)) {
        const list = Core.tx.load(userId, monthId) || [];
        list.forEach((t) => out.push({ ...t, __monthId: monthId }));
      }
      return { range: r, tx: out };
    }
  };

  // ─────────────────────────────────────────────
  // SELECTED MONTH — Mês ativo persistente
  // ─────────────────────────────────────────────
  Core.selectedMonth = {
    get(userId)           { return Core.storage.safeGet(Core.keys.selectedMonth(userId), null); },
    set(userId, monthId)  { if (monthId) Core.storage.safeSet(Core.keys.selectedMonth(userId), String(monthId)); },
    clear(userId)         { localStorage.removeItem(Core.keys.selectedMonth(userId)); }
  };

  // ─────────────────────────────────────────────
  // MIGRATE — Migração v4.x → v6.5+
  // ─────────────────────────────────────────────
  Core.migrate = {
    /**
     * Executa migração uma única vez (idempotente).
     * Migra dados de versões antigas (sem userId) para o padrão atual.
     * Safe: não sobrescreve dados já migrados.
     */
    async runOnce() {
      const already = localStorage.getItem(SESSION.migratedFlag) === 'true';
      if (already) return { migrated: false, reason: 'already' };

      const legacyUser   = Core.storage.getJSON('gf_erp_user', null);
      const legacyLogged = localStorage.getItem('gf_erp_logged') === 'true';
      const hasAnyLegacyTx = Object.keys(localStorage).some(k => /^gf_erp_tx_\d{4}-\d{2}$/.test(k));
      const hasLegacy = !!legacyUser || hasAnyLegacyTx;

      if (!hasLegacy) {
        localStorage.setItem(SESSION.migratedFlag, 'true');
        return { migrated: false, reason: 'no-legacy' };
      }

      let userId = 'default';
      if (legacyUser?.email) {
        try { userId = await Core.user.hashEmail(legacyUser.email); }
        catch { userId = 'default'; }
      }

      if (legacyUser) Core.storage.setJSON(Core.keys.user(userId), legacyUser);

      // Migra TXs antigas (sem userId na key) para o novo padrão
      let migratedMonths = 0;
      Object.keys(localStorage)
        .filter(k => k.startsWith('gf_erp_tx_'))
        .forEach((k) => {
          const m = k.replace('gf_erp_tx_', '');
          if (!/^\d{4}-\d{2}$/.test(m)) return;
          const newKey = Core.keys.tx(userId, m);
          if (localStorage.getItem(newKey) !== null) return; // não sobrescreve
          const raw = localStorage.getItem(k);
          if (raw !== null) {
            localStorage.setItem(newKey, raw);
            migratedMonths++;
          }
        });

      // Migra configs
      const migrateIfAbsent = (oldKey, newKey) => {
        const val = localStorage.getItem(oldKey);
        if (val && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, val);
      };

      migrateIfAbsent('gf_erp_cfg_categorias',  Core.keys.cfgCats(userId));
      migrateIfAbsent('gf_erp_cfg_bancos',       Core.keys.cfgBanks(userId));
      migrateIfAbsent('gf_erp_recorrentes',      Core.keys.recorr(userId));
      migrateIfAbsent('gf_erp_selected_month',   Core.keys.selectedMonth(userId));

      if (legacyLogged) {
        localStorage.setItem(SESSION.loggedKey, 'true');
        Core.user.setCurrentUserId(userId);
      }

      localStorage.setItem(SESSION.migratedFlag, 'true');
      return { migrated: true, userId, migratedMonths };
    }
  };

  // ─────────────────────────────────────────────
  // EXPORT — Geração de CSV
  // ─────────────────────────────────────────────
  Core.export = {
    /** Cabeçalho padrão do CSV de transações */
    txHeader() {
      return ['Mes', 'Data', 'Tipo', 'Subtipo', 'Categoria', 'Banco', 'Descricao', 'Valor', 'Fixado'];
    },

    /** Converte uma transação em array de células para o CSV */
    txToRow(t) {
      const monthId  = t.__monthId || t.monthId || '';
      const valor    = Number(t.valor) || Core.format.parseBRL(t.valor);
      const valorStr = (Number(valor) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return [
        String(monthId),
        String(t.data        || ''),
        String(t.tipo        || ''),
        String(t.subtipo     || ''),
        String(t.categoria   || ''),
        String(t.banco       || ''),
        String((t.descricao  || '').replace(/\s+/g, ' ').trim()),
        String(valorStr),
        t.fixado ? 'SIM' : 'NAO'
      ];
    },

    /**
     * Gera e dispara download de um CSV.
     * Usa BOM (EF BB BF) para compatibilidade com Excel brasileiro.
     * Separador: ponto-e-vírgula (padrão Excel PT-BR)
     *
     * @param {string} filename
     * @param {Array[]} rows - array de arrays de células
     * @param {string[]} header - cabeçalho
     * @returns {{ ok, error? }}
     */
    downloadCSV(filename, rows, header) {
      try {
        const body = Array.isArray(rows) ? rows : [];
        if (!body.length) return { ok: false, error: 'Sem dados para exportar.' };

        const escape = (v) => {
          const s = String(v ?? '');
          const needsQuote = /[;"\n\r]/.test(s);
          const out = s.replace(/"/g, '""');
          return needsQuote ? `"${out}"` : out;
        };

        const lines = [];
        if (Array.isArray(header) && header.length) lines.push(header.map(escape).join(';'));
        body.forEach(r => {
          const arr = Array.isArray(r) ? r : Object.values(r);
          lines.push(arr.map(escape).join(';'));
        });

        const csv  = '\ufeff' + lines.join('\n'); // BOM + conteúdo
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename || 'export.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2500);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Falha ao exportar CSV.' };
      }
    }
  };

  // ─────────────────────────────────────────────
  // BACKUP — Exportação e importação de dados
  // ─────────────────────────────────────────────
  Core.backup = {
    /** Coleta todas as keys do localStorage pertencentes ao userId */
    collectUserKeys(userId) {
      const prefixes = [
        Core.keys.user(userId),
        `gf_erp_tx_${userId}_`,
        Core.keys.recorr(userId),
        `gf_erp_recorr_applied_${userId}_`,
        Core.keys.goals(userId),
        Core.keys.selectedMonth(userId),
        Core.keys.cfgCats(userId),
        Core.keys.cfgBanks(userId),
        Core.keys.theme(userId)
      ];

      const out = {};
      Object.keys(localStorage)
        .filter(k => prefixes.some(p => k === p || k.startsWith(p)))
        .forEach(k => { out[k] = localStorage.getItem(k); });

      return out;
    },

    /** Monta o payload JSON de backup */
    buildPayload(userId) {
      return {
        backupVersion: APP.backupVersion,
        appVersion:    APP.version,
        exportDateISO: new Date().toISOString(),
        userId,
        keys: Core.backup.collectUserKeys(userId)
      };
    },

    /** Valida se o payload tem a estrutura esperada */
    validatePayload(obj) {
      if (!obj || typeof obj !== 'object') return { ok: false, error: 'JSON inválido' };
      for (const k of ['backupVersion', 'appVersion', 'exportDateISO', 'userId', 'keys']) {
        if (!(k in obj)) return { ok: false, error: `Campo obrigatório ausente: ${k}` };
      }
      if (!obj.keys || typeof obj.keys !== 'object') return { ok: false, error: 'keys inválido' };
      return { ok: true };
    },

    /** Aplica o payload no localStorage (não apaga nada, apenas escreve) */
    applyPayload(obj) {
      const keys = obj.keys || {};
      const all  = Object.keys(keys);
      all.forEach(k => localStorage.setItem(k, keys[k]));
      return { applied: all.length };
    }
  };

  // ─────────────────────────────────────────────
  // GUARDS — Proteção de rotas
  // ─────────────────────────────────────────────
  Core.guards = {
    /** Redireciona para login se não estiver autenticado. */
    requireLogin() {
      if (!Core.user.isLogged()) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    }
  };

  // ─────────────────────────────────────────────
  // SAFE — Sanitização de dados
  // Previne XSS, prototype pollution e dados inválidos
  // ─────────────────────────────────────────────
  Core.safe = {
    DANGEROUS_PROPS: new Set(['__proto__', 'constructor', 'prototype']),

    /** Sanitiza string (remove HTML tags e props perigosas) */
    str(value) {
      if (typeof value !== 'string') return '';
      if (this.DANGEROUS_PROPS.has(value)) return '';
      return value.replace(/<[^>]*>/g, ''); // strip HTML básico
    },

    /** Sanitiza número (retorna fallback se NaN/Infinity) */
    num(value, fallback = 0) {
      const n = Number(value);
      return (isNaN(n) || !isFinite(n)) ? fallback : n;
    },

    /** Sanitiza objeto (remove props perigosas recursivamente) */
    obj(obj) {
      if (!obj || typeof obj !== 'object') return {};
      const safe = {};
      for (const key in obj) {
        if (this.DANGEROUS_PROPS.has(key)) continue;
        const val = obj[key];
        if (typeof val === 'string')       safe[key] = this.str(val);
        else if (typeof val === 'number')  safe[key] = this.num(val);
        else if (val && typeof val === 'object') safe[key] = this.obj(val);
        else                               safe[key] = val;
      }
      return safe;
    }
  };

  // ─────────────────────────────────────────────
  // LOG — Logger estruturado com níveis
  // ─────────────────────────────────────────────
  Core.log = (function () {
    const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
    let level   = 'info';
    let enabled = true;

    const tag   = `[ERP v${APP.version}]`;
    const should = (lvl) => enabled && (LEVELS[lvl] >= LEVELS[level]);
    const meta   = (m)   => { try { return m ? JSON.parse(JSON.stringify(m)) : undefined; } catch { return undefined; } };

    return {
      LEVELS,
      setLevel(l)   { if (LEVELS[l] !== undefined) level = l; },
      setEnabled(f) { enabled = !!f; },
      debug(msg, m) { if (should('debug')) console.debug(tag, msg, meta(m)); },
      info(msg, m)  { if (should('info'))  console.info(tag,  msg, meta(m)); },
      warn(msg, m)  { if (should('warn'))  console.warn(tag,  msg, meta(m)); },
      error(msg, m) { if (should('error')) console.error(tag, msg, meta(m)); }
    };
  })();

  // ─────────────────────────────────────────────
  // UI — Modais customizados (substitui confirm/prompt nativo)
  // ─────────────────────────────────────────────
  Core.ui = (function () {
    const STYLE_ID = 'core-ui-modal-style';

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const css = `
        .core-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;}
        .core-modal{width:min(520px,100%);background:var(--card,#fff);color:var(--text,#0f172a);border:1px solid var(--border,#e2e8f0);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden;}
        .core-modal__head{padding:14px 16px;border-bottom:1px solid var(--border,#e2e8f0);font-weight:700;}
        .core-modal__body{padding:14px 16px;line-height:1.35;color:var(--text-secondary,#475569);}
        .core-modal__body p{margin:0 0 10px 0;}
        .core-modal__input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--border,#e2e8f0);background:var(--bg,#f8fafc);color:var(--text,#0f172a);}
        .core-modal__foot{display:flex;gap:10px;justify-content:flex-end;padding:14px 16px;border-top:1px solid var(--border,#e2e8f0);}
        .core-modal__btn{padding:10px 14px;border-radius:12px;border:1px solid var(--border,#e2e8f0);background:transparent;color:var(--text,#0f172a);cursor:pointer;font-weight:600;}
        .core-modal__btn--primary{background:var(--primary,#3b82f6);border-color:var(--primary,#3b82f6);color:#fff;}
        .core-modal__btn--danger{background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);color:#fff;}
      `.trim();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }

    function modal(opts) {
      const o = Object.assign({
        title: 'Confirmar', message: '', confirmText: 'Confirmar',
        cancelText: 'Cancelar', requireText: '', placeholder: '', danger: false
      }, opts || {});

      if (typeof document === 'undefined' || !document.body) {
        return Promise.resolve({ ok: window.confirm(o.message || o.title), value: '' });
      }

      ensureStyles();

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'core-modal-overlay';

        const box  = document.createElement('div');
        box.className = 'core-modal';

        const head = document.createElement('div');
        head.className = 'core-modal__head';
        head.textContent = o.title;

        const body = document.createElement('div');
        body.className = 'core-modal__body';

        const p = document.createElement('p');
        p.textContent = o.message || '';
        body.appendChild(p);

        let input = null;
        if (o.requireText) {
          input = document.createElement('input');
          input.className = 'core-modal__input';
          input.type = 'text';
          input.autocomplete = 'off';
          input.placeholder = o.placeholder || `Digite ${o.requireText}`;
          body.appendChild(input);

          const hint = document.createElement('p');
          hint.textContent = `Confirmação obrigatória: digite ${o.requireText}`;
          body.appendChild(hint);
        }

        const foot   = document.createElement('div');
        foot.className = 'core-modal__foot';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'core-modal__btn';
        cancel.textContent = o.cancelText;

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = o.danger
          ? 'core-modal__btn core-modal__btn--danger'
          : 'core-modal__btn core-modal__btn--primary';
        okBtn.textContent = o.confirmText;

        function cleanup() {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
        }

        function done(ok) {
          const value = input ? (input.value || '').trim() : '';
          cleanup();
          resolve({ ok, value });
        }

        function onKey(e) {
          if (e.key === 'Escape') done(false);
          if (e.key === 'Enter')  okBtn.click();
        }

        cancel.addEventListener('click', () => done(false));
        okBtn.addEventListener('click',  () => done(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
        document.addEventListener('keydown', onKey);

        foot.appendChild(cancel);
        foot.appendChild(okBtn);
        box.appendChild(head);
        box.appendChild(body);
        box.appendChild(foot);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        if (input) setTimeout(() => input.focus(), 0);
      });
    }

    async function confirm(message, title) {
      const res = await modal({
        title: title || 'Confirmar',
        message: String(message || ''),
        confirmText: 'Confirmar',
        cancelText: 'Cancelar'
      });
      return !!res.ok;
    }

    async function requireWord(word, opts) {
      const res = await modal(Object.assign({
        title: 'Ação sensível',
        message: 'Esta ação é irreversível.',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        requireText: word,
        placeholder: `Digite ${word} para confirmar`,
        danger: true
      }, opts || {}));
      return !!res.ok && String(res.value || '').toUpperCase() === String(word).toUpperCase();
    }

    return { modal, confirm, requireWord };
  })();

  // ─────────────────────────────────────────────
  // getMetrics — Ponto único de consistência
  // Evita que cada tela calcule sum/health/score separadamente
  // ─────────────────────────────────────────────
  Core.getMetrics = function getMetrics(tx, options = {}) {
    const sum        = Core.calc.summary(Array.isArray(tx) ? tx : []);
    const thresholds = options.thresholds || (window.ERP_CONST?.thresholds);
    const weights    = options.weights    || { poupanca: 40, endividamento: 30, essenciais: 30 };

    let health = null;
    let score  = null;

    try { if (thresholds && Core.calc.health) health = Core.calc.health(sum, thresholds); } catch {}
    try {
      if (thresholds && Core.calc.score) {
        score = Core.calc.score(sum, thresholds, weights);
      } else if (Core.calc.score) {
        const sc = Core.calc.score(sum);
        score = (sc && typeof sc.value === 'number') ? sc.value : (typeof sc === 'number' ? sc : null);
      }
    } catch {}

    return { sum, health, score };
  };

  // ─────────────────────────────────────────────
  // Expõe namespace global
  // ─────────────────────────────────────────────
  Core.APP    = APP;
  Core.crypto = { sha256Hex, bytesToHex };

  window.Core = Core;
  Core.log.info('Core carregado', { version: APP.version });

})();
