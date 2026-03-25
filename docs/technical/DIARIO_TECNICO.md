# DIÁRIO TÉCNICO — ERP JW Finance

> Documento vivo. Toda decisão arquitetural relevante deve ser registrada aqui **antes** de ser implementada, ou imediatamente após.
> Desenvolvedor responsável: JW | Versão atual: **8.3.0** | Última atualização: 2026-03-22

---

## Premissas Inegociáveis

1. **Offline-first absoluto** — zero dependências de CDN em runtime. Todo JS/CSS é local.
2. **localStorage como única persistência** — sem backend, sem cookies de sessão, sem IndexedDB.
3. **Multiusuário isolado** — cada usuário tem suas chaves prefixadas por hash do e-mail (`userId`).
4. **Core centralizado** — todo cálculo financeiro passa por `Core.calc.*`. Features **não** recalculam.
5. **Segurança frontend** — sem envio de dados para servidores. Dados ficam no dispositivo do usuário.
6. **SemVer rigoroso** — patch (x.x.N) = correção/melhoria sem breaking change; minor (x.N.0) = feature sem quebra; major (N.0.0) = breaking change de dados.
7. **Feature não quebra arquitetura** — nova funcionalidade deve respeitar a ordem de carregamento de scripts e os namespaces globais existentes.

---

## Grafo de Dependências dos Módulos

```
constants.js  ──────────────────────────────────────────► ERP_CONST
config.js     ──── depende de ERP_CONST ────────────────► ERP_CFG
core.js       ──── depende de ERP_CONST ────────────────► Core
ui.js         ──── independente ────────────────────────► ERP
sync-service.js ── depende de Core ─────────────────────► SyncService
[feature].js  ──── depende de Core + ERP_CFG + ERP ────► (namespace próprio ou IIFE)
```

**Ordem de carregamento obrigatória nos HTMLs:**
1. `js/core/constants.js`
2. `js/core/config.js`
3. `js/core/core.js`
4. `js/utils/ui.js`
5. `js/sync/sync-service.js`
6. `js/features/[tela].js`

---

## Contratos das Fórmulas Financeiras

### `Core.calc.summary(tx[])` → `{ renda, poupanca, despesas, essenciais, livres, dividas, saldo }`

```
saldo = renda − poupanca − essenciais − livres − dividas
```

- Nunca retorna `null` — valores ausentes são `0`.
- `tx` pode ser array vazio; retorna zeros.
- **Não alterar esta assinatura** — todas as telas dependem dela.

### `Core.calc.rates({ renda, poupanca, dividas, essenciais, livres })` → `{ poupanca%, essenciais%, livres%, endividamento% }`

```
taxa = valor / renda × 100    (retorna null se renda ≤ 0)
```

### `Core.calc.health(sum, thresholds)` → `{ poupanca, endividamento, essenciais }` (cada um com `{ status, rate, tone }`)

- `tone`: `'ok'` | `'warn'` | `'error'`
- **Nota v8.2.3:** este método continua sendo chamado internamente para calcular o score, mas seus resultados individuais não são mais exibidos no Dashboard (apenas o score final).

### `Core.calc.score(sum, thresholds, weights)` → `0..100`

```
score = (pontosPoupança × 40 + pontosEndiv × 30 + pontosEss × 30) / 100
```

### `Core.calc.budgetFromPercent(summary, percent)` → `{ targets, realized, renda }`

Usado exclusivamente pela tela de Metas para calcular meta vs realizado em R$.

---

## Decisões Arquiteturais

### DEC-001 — localStorage como única persistência
**Data:** v4.x | **Status:** Ativo

localStorage garante funcionamento 100% offline sem instalação de servidor. Limite prático estimado: ~50.000 lançamentos por usuário (~5–10 MB). Alternativas (IndexedDB, OPFS) rejeitadas por complexidade desnecessária no escopo atual.

### DEC-002 — Multiusuário por hash do e-mail
**Data:** v6.5 | **Status:** Ativo

Cada usuário recebe um `userId` derivado do e-mail (SHA-256 truncado a 16 chars hex). Chaves no formato `gf_erp_{tipo}_{userId}[_{monthId}]`. Sem autenticação real — proteção por obscuridade de chave. Adequado para uso pessoal/doméstico.

### DEC-003 — Core como namespace global
**Data:** v6.5 | **Status:** Ativo

`window.Core` exposto globalmente evita necessidade de bundler/module system. Features acessam `Core.calc`, `Core.storage`, `Core.month`, etc. diretamente. Custo: poluição do namespace global. Benefício: zero tooling, funciona com `file://`.

### DEC-004 — Dark mode fixo via CSS
**Data:** v8.1.x | **Status:** Ativo

`css/style.css` define paleta escura diretamente nas variáveis raiz. Toggle de tema foi removido em v8.1.x por inconsistência visual. `ERP.theme.apply()` mantido como stub para compatibilidade retroativa, mas não altera nada.

### DEC-005 — SimpleCharts sem dependência externa
**Data:** v8.1.12 | **Status:** Ativo

Gráficos implementados em Canvas 2D puro (`SimpleCharts` em `js/features/charts.js`). Chart.js, ApexCharts e similares rejeitados por introduzirem dependência de CDN ou bundle. Custo: funcionalidade limitada (sem tooltips, sem animação). Benefício: offline-first absoluto garantido.

### DEC-006 — Separação em `js/core/`, `js/features/`, `js/utils/`
**Data:** v8.2.0 | **Status:** Ativo

Reorganização estrutural para facilitar manutenção e leitura. Sem breaking changes — namespaces e localStorage keys inalterados. Arquivos renomeados: `constantes.js` → `js/core/constants.js`, `script.js` → `js/utils/ui.js`.

### DEC-007 — Restrição de data ao mês ativo no Dashboard
**Data:** v8.2.1 | **Status:** Ativo

Inputs `type=date` recebem atributos `min`/`max` dinâmicos iguais ao primeiro e último dia do `activeMonth`. Implementado em `setDefaultDates()`, chamado a cada troca de mês e após cada submit de formulário. Motivação: lançamentos com data fora do mês ativo distorcem KPIs e relatórios, comportamento análogo ao Protheus e outros ERPs que restringem lançamentos ao período aberto.

### DEC-008 — Placeholder "Selecione" condicional nos selects
**Data:** v8.2.1 | **Status:** Ativo

`setOptions()` em `dashboard.js` injeta placeholder vazio apenas quando `select.value` está vazio (estado inicial sem seleção). Após o usuário escolher um valor, o placeholder não reaparece. Lista também filtra itens `null`, vazios ou com label "selecione" vindos por engano das configs.

### DEC-009 — Navegação de mês no topo da tela de Metas
**Data:** v8.2.1 | **Status:** Ativo

Botões Anterior / Mês Atual / Próximo movidos para o cabeçalho do card principal em `metas.html`. Título do card exibe o período: `"📊 Orçamento — [mês]"`. Navegação usa `Core.selectedMonth` — mesma fonte do Dashboard — garantindo consistência entre telas.

### DEC-010 — `Core.period.iterateMonths()` como fonte única para gráfico de evolução
**Data:** v8.2.1 | **Status:** Ativo

O gráfico "Evolução do Saldo" em `charts.js` usa exclusivamente `Core.period.iterateMonths(start, end)` para iterar os meses do range selecionado. Evita reimplementar lógica de calendário fora do Core e garante consistência com `Core.month.addMonths()`.

### DEC-011 — Service Worker sempre alinhado com a versão do app
**Data:** v8.2.2 | **Status:** Ativo

O `CACHE_NAME` em `sw.js` deve ser atualizado a cada release para garantir que os usuários em modo PWA recebam os assets mais recentes. Padrão: `erp-jw-finance-v{MAJOR}.{MINOR}.{PATCH}`. Sem atualização do cache name, o SW pode continuar servindo a versão anterior indefinidamente.

### DEC-012 — Dashboard minimalista: Score como único indicador de saúde visual
**Data:** v8.2.3 | **Status:** Ativo

Os KPIs secundários de saúde (Poupança / Endividamento / Despesas) foram removidos do painel de status do Dashboard. Apenas o **Score do mês** permanece, exibido em formato *pill* minimalista com tonalidade por faixa (`ok` / `warn` / `error` / `neutral`). Motivação: redução de ruído visual — o score já resume os três indicadores em um único número (0–100). Os cálculos de `Core.calc.health()` continuam ocorrendo internamente para alimentar o score; apenas a exibição individual foi removida.


### DEC-013 — Padronização institucional do Topbar (ícones + botão de retorno)
**Data:** v8.2.3 | **Status:** Ativo

Para evitar divergências visuais entre telas, foi definido um padrão único para o Topbar:

- **Ícones:**
  - Perfil → ⚙️
  - Consolidado → 🧾
  - Histórico → 📊
- **Botão de retorno:** todas as telas internas usam exatamente **"← Dashboard"** (classe `btn btn--ghost`).

Motivação: consistência visual, redução de variações e aspecto institucional.

### DEC-014 — Relatório de Análise Técnica (auditável) incluído na documentação
**Data:** v8.2.3 | **Status:** Ativo

Foi adicionado o documento `docs/ANALISE_SISTEMA_v8.2.3.md`, com métricas reais do código (contagem de arquivos JS e linhas), validações matemáticas e recomendações de evolução (principalmente testes automatizados).

Motivação: institucionalizar a qualidade do release e registrar evidências técnicas sem depender apenas de análise informal.
### DEC-015 — SyncService como camada de sincronização isolada (Fase 3)
**Data:** v8.3.0 | **Status:** Ativo

A sincronização multi-device foi implementada como um módulo completamente separado (`js/sync/sync-service.js`) exposto em `window.SyncService`. O Core.js permaneceu intocado. Toda interação entre features e o SyncService é feita via optional chaining (`window.SyncService?.método?.()`) para garantir degradação graciosa quando o sync está desabilitado ou não carregado. Firebase atua exclusivamente como camada de replicação — o localStorage continua sendo a fonte operacional primária.

### DEC-016 — Polling REST em vez de listener do SDK Firestore
**Data:** v8.3.0 | **Status:** Ativo

A sincronização em tempo real via `onSnapshot` do SDK Firebase foi descartada por introduzir dependência de CDN externo, violando o princípio offline-first (DEC-001). A solução adotada é polling REST a cada 10 segundos quando online, reaproveitando a autenticação Firebase REST já existente em `firebase-init.js`. Custo: latência máxima de 10s entre dispositivos. Benefício: zero dependência nova de CDN, funcionamento garantido em ambientes com restrições de rede.

---

### REG-001 — Gráfico de Evolução do Saldo não respeitava filtro de período
**Detectado:** v8.2.0 | **Corrigido:** v8.2.1

`renderAll()` em `charts.js` não passava o range selecionado para o trecho que montava `saldoLabels`/`saldoValues`. O gráfico sempre exibia apenas o mês padrão. Correção: uso de `Core.period.iterateMonths(res.range.start, res.range.end)`.

### REG-002 — Placeholder "Selecione" duplicado nos selects do Dashboard
**Detectado:** v8.2.0 | **Corrigido:** v8.2.1

`setOptions()` injetava o placeholder incondicionalmente, causando duplicação quando o select já tinha valor. Correção: `showPlaceholder = !current` — placeholder só aparece se `select.value` está vazio.

### REG-003 — Lançamentos aceitavam datas de meses fora do período ativo
**Detectado:** v8.2.0 | **Corrigido:** v8.2.1

Inputs `type=date` sem restrição permitiam lançar em meses futuros ou passados, distorcendo KPIs. Correção: `setDefaultDates()` define `min`/`max` do input conforme o `activeMonth`.

### REG-004 — Botão "Mês Ativo" posicionado no rodapé da tela de Metas
**Detectado:** v8.2.0 | **Corrigido:** v8.2.1

Controle de período estava fora do contexto visual principal, dificultando acesso. Correção: navegação movida para o topo do card comparativo, integrada ao título.

### REG-005 — Service Worker servindo assets antigos após atualização
**Detectado:** v8.2.1 | **Corrigido:** v8.2.2

`CACHE_NAME` não era atualizado entre releases, causando que usuários em modo PWA continuassem usando a versão anterior. Correção: `CACHE_NAME` atualizado para `erp-jw-finance-v{versão}` a cada release.

### REG-006 — Gráfico de Evolução do Saldo exibia tela vazia com range inválido
**Detectado:** v8.2.1 | **Corrigido:** v8.2.2

Quando o range do filtro estava ausente ou inválido, o gráfico não renderizava nada. Correção: fallback para o mês ativo quando o range não pode ser resolvido.

### REG-007 — sync-service.js ausente do cache do Service Worker
**Detectado:** v8.3.0 | **Corrigido:** v8.3.0 (patch interno)

O arquivo `js/sync/sync-service.js` não havia sido adicionado ao array `ASSETS` do `sw.js`. Em modo PWA offline após o primeiro carregamento, o Service Worker servia todos os assets em cache exceto o SyncService, causando falha silenciosa de sincronização sem qualquer erro visível ao usuário. Adicionalmente, o `CACHE_NAME` não havia sido atualizado de `v8.2.6` para `v8.3.0`, impedindo que usuários existentes recebessem os assets novos. Correção: ambos aplicados no `sw.js`.

---

## Checklist de Regressão (antes de cada release)

Execute manualmente após qualquer alteração em `dashboard.js`, `charts.js`, `metas.js`, `core.js` ou `sync-service.js`:

**Core e autenticação**
- [ ] Login e criação de novo usuário funcionam
- [ ] Logout limpa sessão corretamente sem apagar dados locais
- [ ] Fallback local funciona quando Firebase está indisponível

**Dashboard**
- [ ] Troca de mês (Anterior / Atual / Próximo) atualiza KPIs e tabela
- [ ] Input de data não aceita datas fora do mês ativo
- [ ] Select de categoria/banco não exibe "Selecione" após escolha
- [ ] Lançamento de Receita, Poupança, Despesa Essencial, Despesa Livre e Dívida funcionam
- [ ] Edição e exclusão de lançamentos funcionam
- [ ] Fixar lançamento (recorrência) cria e aplica corretamente no mês seguinte
- [ ] **Score do mês** exibido no Dashboard como pill com tonalidade correta (ok/warn/error)
- [ ] Score exibe "—" quando não há receita no mês
- [ ] Lançamento excluído não reaparece após reload (soft delete persistido)

**Metas, Gráficos e Consolidado**
- [ ] Tela de Metas: navegação de mês no topo funciona e atualiza cards
- [ ] Tela de Metas: percentuais salvam e carregam corretamente por mês
- [ ] Gráfico "Evolução do Saldo" atualiza corretamente ao mudar filtro de período
- [ ] Consolidado não exibe transações com `deletedAt` preenchido
- [ ] Histórico não exibe transações com `deletedAt` preenchido

**Gerenciadores e Perfil**
- [ ] Salvar categorias dispara `SyncService.markDirty()` (verificar indicador pendente)
- [ ] Salvar bancos dispara `SyncService.markDirty()` (verificar indicador pendente)
- [ ] Backup exporta com todos os novos campos (`createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `schemaVersion`)
- [ ] Restore de backup dispara `scanLocalChanges()` e enfileira dados para sync

**Sincronização (Fase 3)**
- [ ] Indicador de sync aparece na topbar em todas as telas
- [ ] Indicador alterna corretamente entre: OK / pendente / offline / erro
- [ ] Criar lançamento online: aparece em segundo device em até 10s
- [ ] Editar mesmo lançamento em dois devices offline: `updatedAt` mais recente vence
- [ ] Excluir lançamento no device A, manter B offline, religar B: registro não ressuscita
- [ ] Modo offline: operações enfileiradas e sincronizadas ao reconectar
- [ ] Novo device: bootstrap reconstrói localStorage completo após login
- [ ] Feature flag `gf_erp_sync_feature_enabled=0` desativa sync sem quebrar o sistema

**PWA**
- [ ] PWA funciona offline após primeiro carregamento
- [ ] `CACHE_NAME` no `sw.js` está alinhado com a versão atual do app
- [ ] `js/sync/sync-service.js` está no array `ASSETS` do Service Worker

---

## Diretrizes de Evolução Futura

### ✅ Pode fazer (sem risco arquitetural)
- Adicionar novos KPIs ao Dashboard (usar `Core.calc.*` existente, não recalcular na feature)
- Criar novas telas HTML com seus próprios `js/features/[tela].js`
- Estender `ERP_CONST` com novas constantes (sem remover ou renomear as existentes)
- Adicionar novos métodos ao `Core` (sem alterar assinatura dos existentes)
- Criar novos tipos de gráfico em `SimpleCharts`
- Adicionar novos campos opcionais ao schema de Transaction (backward-compatible)
- Adicionar novos `scope` ao `SyncService.enqueue()` para sincronizar novas entidades

### ⚠️ Requer atenção (risco de regressão)
- Alterar `Core.calc.summary()` → afeta KPIs de todas as telas
- Alterar formato das chaves do localStorage → requer migração com `Core.migrate`
- Alterar `setOptions()` no Dashboard → afeta todos os selects de formulário
- Alterar `Core.selectedMonth` → afeta sincronização entre Dashboard e Metas
- Alterar `SimpleCharts` → verificar impacto em todos os gráficos de `charts.html`
- Alterar `normalizeTx()` no SyncService → incrementar `TX_SCHEMA_VERSION` e testar migração
- Alterar intervalo de polling (`pollMs`) → impacto em custo de leituras no Firestore

### 🚫 Não fazer (breaking changes)
- Remover namespaces globais (`Core`, `ERP_CONST`, `ERP_CFG`, `ERP`, `SyncService`)
- Alterar assinatura de `Core.calc.summary()`, `Core.calc.rates()` ou `Core.calc.health()`
- Remover prefixo `gf_erp_` das chaves do localStorage sem migração
- Introduzir dependências externas (CDN, npm) sem garantia de fallback offline
- Armazenar senhas em texto plano
- Fazer delete físico de transações — usar sempre soft delete via `deletedAt`
- Gravar diretamente no Firestore fora do `SyncService` (quebra rastreabilidade da fila)

---

## Adendo — Auditoria de Produção v8.3.0

### REG-008 — charts.js incluía transações com deletedAt nos gráficos
**Detectado:** v8.3.0 (auditoria externa) | **Corrigido:** v8.3.0 (patch 2)

`Core.period.getTransactionsByPeriod()` não filtra `deletedAt` — retorna todas as transações incluindo as excluídas via soft delete. `charts.js` usava o resultado diretamente sem aplicar `visibleTx()`, causando que transações excluídas aparecessem nos gráficos de pizza, barras, categorias e evolução de saldo. Correção: `visibleTx()` aplicado sobre `res.tx` imediatamente após `getTransactionsByPeriod()`, antes de qualquer cálculo.

### DEC-017 — Backoff exponencial no retry de sync
**Data:** v8.3.0 | **Status:** Ativo

Retry sem delay de backoff causaria flood na API do Firestore após erros em série (ex: token expirado, quota excedida). Implementado backoff exponencial: `5s × 2^(retries-1)` com cap em 120s. Após `maxRetries` (5), item muda para status `failed` definitivo e é removido da fila após 7 dias. Isso evita loop infinito silencioso e consumo desnecessário de quota.

### DEC-018 — Pull incremental via lastPullAt
**Data:** v8.3.0 | **Status:** Ativo

Polling completo a cada 10s baixava toda a coleção Firestore em cada ciclo — custo crescente com o volume de dados. Implementado pull incremental: `pullRemote()` lê o timestamp do último pull bem-sucedido (`gf_erp_syncLastPull_<userId>`) e passa para `listRemoteCollection()` que filtra client-side documentos com `updatedAt <= lastPull`. Bootstrap mantém pull completo pois `lastPull` ainda não existe no localStorage do novo dispositivo. Custo de leituras no Firestore cai proporcionalmente ao volume de dados estáticos.

---

## Adendo — Revisão Final v8.3.0 (patch 3)

### REG-009 — Status `failed` mascarado como `synced` no flush()
**Detectado:** v8.3.0 (revisão externa) | **Corrigido:** v8.3.0 (patch 3)

O `flush()` filtrava erros apenas por `status === 'error'`, ignorando `status === 'failed'`. Isso causava dois cenários de bug: (1) ao final do flush sem pendentes, se houvesse itens `failed` na fila, o badge exibia "Sync: OK" incorretamente; (2) no bloco de contagem final de erros, itens `failed` não eram contabilizados, permitindo que o fluxo chegasse ao `setStatus('synced')` mesmo com falhas definitivas na fila. Correção: dois pontos do `flush()` ajustados para incluir `|| item.status === 'failed'` na detecção de problemas.

### REG-010 — `recorrApplied` lido e limpo como array em vez de objeto mapa
**Detectado:** v8.3.0 (revisão externa) | **Corrigido:** v8.3.0 (patch 3)

Em `deleteFutureRecurring()`, a limpeza do marcador `recorrApplied` usava `getJSON(k, [])` e `.filter()`, tratando a estrutura como array. Porém o dado é gravado como objeto mapa `{ [recId]: true }`. O resultado: a limpeza nunca funcionava de fato — o lixo residual de recorrência aplicada permanecia no localStorage. Correção: leitura com `getJSON(k, {})`, remoção via `delete applied[recurrenceId]` e guarda de tipo com `!Array.isArray(applied)` para robustez.

### REG-011 — `updateIndicator()` não contava itens `failed` no badge
**Detectado:** v8.3.0 (revisão externa) | **Corrigido:** v8.3.0 (patch 3)

A variável `failed` em `updateIndicator()` filtrava apenas `status === 'error'`, ignorando `status === 'failed'`. O badge podia exibir "Sync: OK" mesmo com itens com falha definitiva na fila. Correção: filtro expandido para `status === 'error' || status === 'failed'`.
