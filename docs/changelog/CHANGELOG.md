# CHANGELOG — ERP JW Finance

Histórico completo de versões seguindo [SemVer](https://semver.org/lang/pt-BR/) e [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [8.3.0] — 2026-03-22 — Fase 3: Sincronização Multi-Device

### Adicionado
- `js/sync/sync-service.js` — SyncService com fila local persistida (`gf_erp_syncQueue_<userId>`), bootstrap remoto, polling Firestore REST a cada 10s e retry automático com backoff.
- Indicador visual de status de sincronização na topbar: OK / pendente / offline / erro.
- Normalização automática do schema de transações: campos `createdAt`, `updatedAt`, `deletedAt`, `deviceId` e `schemaVersion` garantidos em 100% dos registros.
- `deviceId` único por dispositivo persistido em `gf_erp_deviceId`.
- Bootstrap remoto em novo dispositivo: reconstrói `localStorage` completo a partir das coleções `users/{uid}/transactions` e `users/{uid}/settings` no Firestore.
- Resolução de conflito Last Write Wins baseada em `updatedAt` — registro mais recente sempre vence.
- `docs/technical/FASE_3_SYNC_MULTI_DEVICE.md` — arquitetura e limites conhecidos da Fase 3.
- `docs/validation/VALIDACAO_v8.3.0.txt` — checklist de validação específico da Fase 3.
- `RELEASE_NOTES_v8.3.0.txt`.

### Modificado
- Dashboard: soft delete substituiu delete físico — transações excluídas recebem `deletedAt` e são filtradas da view, não removidas do localStorage.
- Histórico, Gráficos, Consolidado e Metas: filtram registros com `deletedAt` preenchido via `SyncService.visibleTx()` com fallback inline.
- Perfil: restore de backup dispara `scanLocalChanges()` e `markDirty()` para propagar dados importados ao Firestore.
- Gerenciadores: salvar categorias e bancos dispara `markDirty()` — gap de integração corrigido.
- `sw.js`: `CACHE_NAME` atualizado para `v8.3.0`; `js/sync/sync-service.js` adicionado ao array `ASSETS`.
- `DIARIO_TECNICO.md`: versão atualizada, DEC-015 e DEC-016 adicionados, REG-007 registrado, checklist de regressão expandido para cobrir Fase 3.
- `docs/INDEX.md`: versão e tabela de documentos atualizadas.

### Observações
### Patch 3 — Revisão Final (2026-03-22)
- `sync-service.js`: `flush()` não mascara mais `failed` como `synced` — dois pontos corrigidos (early-exit e contagem final).
- `sync-service.js`: `updateIndicator()` conta `error` e `failed` no badge de sync.
- `dashboard.js`: `deleteFutureRecurring()` limpa `recorrApplied` como objeto mapa (`delete applied[id]`), não como array.
- `sync-service.js`: comentário do bootstrap alinhado com a implementação real.
- `DIARIO_TECNICO.md`: REG-009, REG-010, REG-011 registrados.

- charts.js: visibleTx() aplicado após getTransactionsByPeriod() — gráficos agora ignoram soft-deleted.
- sync-service.js: backoff exponencial no retry (5s→10s→20s→40s→80s, cap 120s) e status `failed` definitivo após maxRetries.
- sync-service.js: pull incremental via lastPullAt — polling a cada 10s não baixa mais toda a coleção.
- DIARIO_TECNICO.md: REG-008, DEC-017, DEC-018 registrados.
- `Core.js` permanece intocado — Regra de Ouro respeitada.
- Sincronização requer login Firebase válido; fallback local continua 100% operacional offline.
- Listener em tempo real (`onSnapshot`) não introduzido — replicação via Firestore REST + polling (DEC-016).
- Security Rules do Firestore precisam ser publicadas manualmente no Firebase Console conforme o briefing técnico.

---

Histórico completo de versões seguindo [SemVer](https://semver.org/lang/pt-BR/) e [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---


## [8.2.6] — 2026-03-18 — Patch de Validação em Produção (Auth REST)

### Corrigido
- HTMLs internos e tela de login agora carregam `js/core/firebase-init.js` como script clássico, removendo a dependência de `type="module"` no bootstrap de autenticação.
- Fluxo de boot da tela de login simplificado para reduzir risco residual de race condition entre inicialização do Firebase REST e bind dos formulários.

### Melhorado
- Service Worker atualizado para `erp-jw-finance-v8.2.6`, forçando renovação do cache em ambientes com deploy anterior.
- Preparação do pacote para validação em produção no GitHub Pages com autenticação REST sem `gstatic`.

### Sem breaking changes
- Nenhuma alteração no schema do `localStorage`.
- Nenhuma alteração nas fórmulas de cálculo do Core.
- Fallback local preservado para ambientes com bloqueio de rede.

---

## [8.2.3] — 2026-02-19 — Patch de UX (Dashboard Minimal)

### Removido
- **Dashboard (Resumo do mês):** removidos KPIs secundários de saúde (**Poupança**, **Endividamento**, **Despesas**) do painel de status.
- **UI (Topbar):** padronizados ícones de Perfil/Histórico/Consolidado e botão **← Dashboard** nas telas internas.

### Melhorado
- **Dashboard (Resumo do mês):** mantido apenas **Score do mês** com visual **minimalista (Apple-like)** em formato de *pill*, com tonalidade por faixa (ok/warn/error) sem poluir a UI.

### Sem breaking changes
- Nenhuma alteração em `Core.calc.*`.
- Nenhuma alteração em schema/keys do localStorage.
---

## [8.2.2] — 2026-02-19 — Patch de Governança (PWA + Robustez)

### Corrigido
- PWA/Service Worker: alinhado header e `CACHE_NAME` com a versão real para evitar cache antigo

### Melhorado
- Charts: fallback no gráfico **📈 Evolução do Saldo (por mês)** quando o range do filtro estiver ausente/inválido

### Organização
- `docs/validation`: movido `VALIDACAO_v8.2.0.txt` para `archive/` mantendo histórico sem confundir o checklist ativo

---

## [8.2.1] — 2026-02-18 — Patch de UX + Correções de Período

### Corrigido
- **Gráficos (charts):** card "📈 Evolução do Saldo (por mês)" agora respeita corretamente o range do filtro (Mês inicial → Mês final) usando o iterator oficial `Core.period.iterateMonths()` (evita depender de função inexistente).
- **Dashboard (selects):** placeholder "Selecione" não é mais injetado após o usuário já ter escolhido um valor (evita duplicações/misturas). Lista também filtra itens vazios/placeholder caso venham por engano.

### Adicionado
- **Dashboard (validação de período):** inputs de data (`type=date`) agora recebem `min`/`max` do **mês ativo** e o valor default é "clampado" para dentro do período (reduz inconsistência nos KPIs e relatórios).

### Modificado
- **Metas (UX):** navegação de mês (Anterior / Mês Atual / Próximo) movida para o topo do card principal e título passou a refletir o período: **"📊 Orçamento — [mês]"**.

### Sem breaking changes
- Schema do localStorage inalterado.
- `Core.calc.*` inalterado (mudanças focadas em UI/validação de entrada).

---

## [8.2.0] — 2026-02-18 — Reorganização Estrutural + Documentação Completa

### Adicionado
- **Estrutura de pastas modular:** `js/core/`, `js/features/`, `js/utils/`
- **`js/core/constants.js`** — renomeado e documentado linha a linha (ex-constantes.js)
- **`js/core/core.js`** — documentação completa com JSDoc em cada método
- **`js/core/config.js`** — documentação das regras de herança de config
- **`js/utils/ui.js`** — consolidação limpa dos helpers de UI (ex-script.js)
- **`docs/technical/DIARIO_TECNICO.md`** — diário técnico atualizado com v8.2.0
- **`docs/technical/BASE_DE_DADOS.md`** — schema completo do localStorage
- **`docs/changelog/CHANGELOG.md`** — este arquivo
- **`docs/validation/VALIDACAO_v8.2.0.txt`** — checklist de regressão atualizado
- **`README.md`** — documentação principal com estrutura, fórmulas e guia de uso

### Alterado
- Caminhos de todos os `<script src>` nos HTMLs atualizados para nova estrutura
- Service Worker atualizado com novos caminhos de assets
- Cache name atualizado: `erp-jw-finance-v8.2.0`
- Comentários JSDoc adicionados a todos os métodos do Core

### Sem breaking changes
- localStorage keys inalteradas — dados existentes são preservados
- Namespaces globais inalterados (`Core`, `ERP_CONST`, `ERP_CFG`, `ERP`)
- Fórmulas financeiras inalteradas

---

## [8.1.12] — 2026-02-18 — Gráficos Corrigidos (Estrutural)

### Corrigido
- `charts.html` reestruturado com IDs alinhados ao `charts.js`
- Renderização dos gráficos restaurada sem depender de CDN
- Taxas e percentuais via `Core.calc.rates()` com valores numéricos robustos
- Card "Evolução do Saldo" reposicionado para o final e ampliado

### Adicionado
- Legendas em todos os gráficos (facilita auditoria)
- Snapshot de canvas para impressão/PDF

---

## [8.1.11] — 2026-02-17 — Correções de Valores BRL nos Gráficos

### Corrigido
- Gráficos calculavam incorretamente quando valores vinham como string "R$ 1.234,56"
- Despesas por Categoria / Categorias por Banco / Evolução do Saldo

### Modificado
- Card "Evolução do Saldo" movido para o final e expandido (largura total)

---

## [8.1.10] — 2026-02-16 — Gráficos com Legendas + Metas com Mês Ativo

### Modificado
- Dashboard: indicador de saúde trocado de "Essenciais" para "Despesas" (total)
- Metas: bloco de Mês Ativo movido para o topo + navegação funcionando

### Adicionado
- Gráficos: legendas por card (macro, categorias, banco, saldo)

---

## [8.1.9] — 2026-02-15 — Gráficos Offline

### Corrigido
- KPIs refletem o mesmo mês/período do Dashboard
- Gráficos renderizam sem internet

### Adicionado
- `SimpleCharts` — implementação própria de canvas (pizza/barras/linha)
- Metas: bloco "Mês Ativo" com navegação Anterior/Atual/Próximo

### Removido
- Dependência externa de Chart.js (CDN) — offline-first garantido

---

## [8.1.8] — 2026-02-14 — Métricas Centralizadas

### Adicionado
- `Core.getMetrics(tx)` — ponto único para `{sum, health, score}`
- Gráficos: chart "Evolução do Saldo (por mês)"
- Gráficos: snapshot de canvas para impressão/PDF

### Modificado
- Orçamento: seleção de mês via input (igual Dashboard)

---

## [8.1.7] — 2026-02-13 — Consistência de Métricas

### Modificado
- Dashboard: mensagens claras quando renda=0 (sem alterar cálculos)
- Consolidado: saúde/score com foco no período
- Histórico: cards com chips de KPIs percentuais

---

## [8.1.6] — 2026-02-12 — Fix Crítico Histórico + Saúde no Consolidado

### Corrigido
- Histórico: erro de sintaxe que impedia renderizar após filtro

### Adicionado
- Saúde Financeira na tela de Consolidado

---

## [8.1.5] — 2026-02-11 — UX Histórico

### Modificado
- Histórico: só renderiza quando usuário aplica filtro (evita timeout em contas com muitos meses)
- Histórico: estado vazio melhorado

---

## [8.1.4] — 2026-02-10 — Filtro de Período no Histórico

### Adicionado
- Filtro visual por mês inicial/final no Histórico
- Export CSV por período no Histórico

---

## [8.1.3] — 2026-02-09 — Dark Mode Fixo + Export CSV por Período

### Adicionado
- Helper `monthsBetween()` para export CSV por período
- `exportPeriodCSV()` função standalone no Consolidado

### Modificado
- Dark mode fixo via CSS (não mais configurável — simplificação)

---

## [8.1.2] — 2026-02-08 — Logger + UI Modal

### Adicionado
- `Core.log` — logger estruturado (debug/info/warn/error)
- `Core.ui.modal()` — modal customizado (substitui `confirm()` nativo)
- `Core.ui.requireWord()` — confirmação de ação sensível

---

## [8.1.1] — 2026-02-07 — Hotfix Consolidado

### Corrigido
- Consolidado: cálculo de saldo por banco quando tipo não reconhecido

---

## [8.1.0] — 2026-02-06 — Consolidado + Period API

### Adicionado
- Tela de Consolidado (visão executiva por período)
- `Core.period.getTransactionsByPeriod()` — coleta TX de múltiplos meses
- `Core.period.iterateMonths()` — generator de meses

---

## [8.0.1] — 2026-02-05 — Gerenciadores Restaurados

### Adicionado
- Tela `gerenciadores.html` (separada de perfil.html)
- Botões de adicionar categoria/banco customizado

---

## [8.0.0] — 2026-02-04 — Versão Principal (Multiusuário)

### Adicionado
- Sistema multiusuário — dados isolados por hash de e-mail
- `Core.keys.*` — namespace por userId para todas as keys
- `Core.migrate.runOnce()` — migração v4.x → v6.5
- `Core.backup` — backup/restore JSON completo
- `Core.safe` — sanitização de dados (XSS, prototype pollution)
- Recorrências (lançamentos fixos) com controle de escopo

### Arquitetura
- `Core` como fonte única de verdade (versão, cálculos, storage)
- `ERP_CONST` separado para constantes imutáveis
- `ERP_CFG` separado para configs customizáveis por usuário

---

## [7.x] — Jan/2026 — Ciclo de Segurança

- v7.0: sanitização centralizada
- v7.1: `Core.log` inicial
- v7.2: correções de UI

---

## [6.5] — Dez/2025 — Gerenciadores

- Categorias e bancos customizáveis por usuário
- 47 categorias, 18 bancos, 5 perfis financeiros
- Toggles de ativo/inativo

---

## [6.0] — Nov/2025 — Refatoração CSS

- Tema dark completo com variáveis CSS
- KPIs com gradientes e hierarquia visual

---

## [5.x] — Out/2025 — Metas e Orçamento

- Orçamento percentual (% da renda)
- Metas por categoria/mês
- Score financeiro 0-100

---

## [4.x] — Set/2025 — Base offline

- localStorage como única persistência
- Primeira versão funcional multiusuário
