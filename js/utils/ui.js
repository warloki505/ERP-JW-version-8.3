/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/utils/ui.js
   Versão: 8.2.0 | Data: 2026-02-18 | Autor: JW

   RESPONSABILIDADE:
   Helpers de UI globais expostos no namespace `window.ERP`:
   - toast      → notificações temporárias (sucesso/erro/info)
   - theme      → alternância dark/light (persiste por usuário)
   - modal      → abrir/fechar modais por ID
   - files      → download de texto, seleção e leitura de arquivo
   - PWA/SW     → registro do Service Worker

   PADRÃO DO TEMA:
   O sistema usa dark mode fixo por CSS (--bg, --card, etc.).
   ERP.theme.apply() é mantido por compatibilidade mas é no-op.

   NÃO EXECUTA automaticamente — apenas expõe funções.
   Cada página chama o que precisar.

   DEPENDÊNCIAS: Nenhuma (pode carregar antes de Core)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // HELPERS DOM
  // ─────────────────────────────────────────────

  /**
   * Cria elemento DOM com atributos e filhos.
   * @param {string} tag
   * @param {object} attrs - { class, text, id, href, ... }
   * @param {HTMLElement[]} children
   */
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class')  e.className   = v;
      else if (k === 'text')   e.textContent = v;
      else                     e.setAttribute(k, v);
    });
    children.forEach((c) => e.appendChild(c));
    return e;
  }

  // ─────────────────────────────────────────────
  // TOAST — Notificações temporárias
  //
  // Tipos: 'success' | 'error' | 'info' | 'warning'
  // Duração padrão: 3000ms
  // Aparece no canto inferior direito (estilo CSS: .toast)
  // ─────────────────────────────────────────────

  /**
   * Exibe uma notificação toast temporária.
   * @param {string} message - texto da notificação
   * @param {string} type    - success|error|info|warning
   * @param {number} ms      - duração em milissegundos
   */
  function toast(message, type = 'success', ms = 3000) {
    const t = el('div', {
      class: `toast toast--${type}`,
      text:  message
    });

    document.body.appendChild(t);

    // animação de saída antes de remover
    setTimeout(() => {
      t.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // ─────────────────────────────────────────────
  // FILES — Download e leitura de arquivos
  // ─────────────────────────────────────────────

  /**
   * Dispara download de um arquivo de texto.
   * @param {string} filename
   * @param {string} text
   * @param {string} mime - tipo MIME (padrão: application/json)
   */
  function downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 50);
  }

  /**
   * Abre o seletor de arquivo nativo.
   * @param {string} accept - filtro de extensão (ex: '.json', '.csv')
   * @returns {Promise<File|null>}
   */
  function pickFile(accept = '.json') {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept });
      input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
      input.click();
    });
  }

  /**
   * Lê o conteúdo de um File como string.
   * @param {File} file
   * @returns {Promise<string|null>}
   */
  async function readFileText(file) {
    if (!file) return null;
    return await file.text();
  }

  // ─────────────────────────────────────────────
  // THEME — Controle de tema (dark/light/auto)
  //
  // v8.1.3+: dark mode é fixo via CSS.
  // ERP.theme é mantido por compatibilidade com código legado.
  // ─────────────────────────────────────────────
  const theme = {
    get()       { return 'dark'; },
    set(_mode)  { return 'dark'; },
    apply()     { /* dark mode fixo via CSS — no-op */ }
  };

  // ─────────────────────────────────────────────
  // MODAL — Helpers para modais HTML por ID
  // ─────────────────────────────────────────────
  const modal = {
    /**
     * Abre um modal pelo ID.
     * Adiciona display:flex e remove classe 'hidden'.
     */
    open(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.style.display = 'flex';
      m.classList.remove('hidden');
    },

    /**
     * Fecha um modal pelo ID.
     */
    close(id) {
      const m = document.getElementById(id);
      if (!m) return;
      m.style.display = 'none';
      m.classList.add('hidden');
    }
  };

  // ─────────────────────────────────────────────
  // PWA — Registro do Service Worker
  //
  // Só registra em http:// ou https:// (não funciona em file://)
  // ─────────────────────────────────────────────
  (function registerSW() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const proto = window.location.protocol;
      if (proto !== 'http:' && proto !== 'https:') return;

      navigator.serviceWorker.register('./sw.js')
        .then(() => {
          if (window.Core?.log) Core.log.info('Service Worker registrado');
        })
        .catch((e) => {
          if (window.Core?.log) Core.log.warn('Falha ao registrar SW', { error: String(e) });
        });
    } catch (_) {}
  })();

  // ─────────────────────────────────────────────
  // EXPORT NAMESPACE GLOBAL
  // ─────────────────────────────────────────────
  window.ERP = {
    toast,
    theme,
    modal,
    files: { downloadText, pickFile, readFileText }
  };

})();
