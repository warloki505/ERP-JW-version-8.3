# Fase 3 — Sincronização Multi-Device

**Versão:** 8.3.0 | **Data:** 2026-03-22 | **Status:** Implementado

---

## Visão Geral

A Fase 3 implementa um modelo híbrido de persistência:

- `localStorage` continua como **fonte operacional primária** — rápido, offline, inalterado.
- `js/sync/sync-service.js` atua como **camada de sincronização isolada** — exposta em `window.SyncService`.
- `Firebase Firestore REST` é a **camada de replicação** entre dispositivos.
- `Core.js` permaneceu **intocado** — Regra de Ouro respeitada.

---

## Arquitetura Aplicada

```
[Usuário age na UI]
        │
        ▼
[Core.tx.save → localStorage]   ← fonte operacional, sempre primeiro
        │
        ▼
[SyncService.markDirty()]
        │
        ▼
[syncQueue (localStorage)]       ← fila persistida: gf_erp_syncQueue_<userId>
        │
   se online
        │
        ▼
[SyncService.flush()]
        │
        ├─ upsertRemoteTx()  →  Firestore: users/{uid}/transactions/{txId}
        └─ upsertRemoteSetting() →  Firestore: users/{uid}/settings/{docId}

[Polling a cada 10s quando online]
        │
        ▼
[SyncService.pullRemote()]
        │
        ▼
[mergeRemoteTx() / applyRemoteSetting()]
        │
        ▼
[localStorage atualizado via Core.keys]
```

---

## Entregas Implementadas

1. **Fila local persistida** `gf_erp_syncQueue_<userId>` com campos:
   - `queueId`, `scope` (tx | setting), `docId`, `type` (update | delete)
   - `payload`, `timestamp`, `status` (pending | synced | error), `retries`, `deviceId`

2. **`deviceId`** único por dispositivo — gerado uma vez, persistido em `gf_erp_deviceId`.

3. **Normalização automática de transações** — campos obrigatórios garantidos:
   - `id` (UUID), `userId`, `monthId`
   - `createdAt` (imutável após criação), `updatedAt` (atualizado a cada mudança)
   - `deletedAt` (null enquanto ativo; ISOString quando excluído — soft delete)
   - `deviceId`, `schemaVersion` (inicia em 1)

4. **Soft delete** no Dashboard — `deletedAt` substitui delete físico. Todos os módulos
   filtram registros com `deletedAt` via `SyncService.visibleTx()` com fallback inline.

5. **Bootstrap remoto** em novo dispositivo — ao logar, reconstrói `localStorage` completo
   a partir das coleções Firestore:
   - `users/{firebaseUid}/transactions/{txId}`
   - `users/{firebaseUid}/settings/{docId}`

6. **Resolução de conflito Last Write Wins** — ao receber dado remoto, compara `updatedAt`:
   o registro com timestamp mais recente prevalece. Comparação numérica (ms), não string.

7. **Polling remoto** a cada 10 segundos quando online + flush imediato ao reconectar.

8. **Indicador visual de status** na topbar (elemento `#syncStatusBadge`):
   - `Sync: OK` (verde) — todos sincronizados
   - `Sync: pendente • N pend.` (âmbar) — fila ativa
   - `Sync: offline` (cinza) — sem conexão ou sem sessão Firebase
   - `Sync: erro (N)` (vermelho) — falha persistente após maxRetries

9. **Feature flag** `gf_erp_sync_feature_enabled` — valor `'0'` desativa sync completamente
   sem quebrar nenhuma outra funcionalidade.

10. **Shadow map** `gf_erp_syncShadow_<userId>` — hash de cada key do localStorage para
    detectar mudanças locais sem precisar comparar payload completo.

---

## Correções Aplicadas no Patch Interno (v8.3.0)

Os seguintes gaps de integração foram identificados em curadoria e corrigidos:

| Arquivo | Problema | Correção |
|---------|----------|----------|
| `sw.js` | `CACHE_NAME` em `v8.2.6` — PWA não entregava assets novos | Atualizado para `v8.3.0` |
| `sw.js` | `sync-service.js` ausente do array `ASSETS` — falha silenciosa offline | Adicionado ao cache |
| `consolidado.html` | Tag `<section>` aninhada sem fechamento — HTML inválido | Tag duplicada removida |
| `sync-service.js` | `Autor: OpenAI` no cabeçalho — inconsistência institucional | Corrigido para `Autor: JW` |
| `gerenciadores.js` | `btnSalvarCats` não chamava `markDirty()` — mudanças nunca entravam na fila | `markDirty('cfgCats')` adicionado |
| `gerenciadores.js` | `btnSalvarBanks` não chamava `markDirty()` — mesmo problema | `markDirty('cfgBanks')` adicionado |
| `perfil.js` | Restore de backup não disparava sync — dados importados nunca replicavam | `scanLocalChanges()` + `markDirty('backup-restore')` adicionados |

---

## Integração com Features Existentes

| Módulo | Como integra com SyncService |
|--------|------------------------------|
| Dashboard | `start()` no boot; `markDirty()` após save/delete; `visibleTx()` para filtrar tabela |
| Histórico | `start()` no boot; `visibleTx()` ao carregar lista de meses |
| Gráficos | `start()` no boot; `visibleTx()` nos dados de cada período |
| Consolidado | `start()` no boot; `visibleTx()` nas transações do período |
| Metas | `start()` no boot; `markDirty()` após salvar percentuais; `visibleTx()` no cálculo |
| Gerenciadores | `start()` no boot; `markDirty()` ao salvar categorias e bancos (corrigido) |
| Perfil | `start()` no boot; `markDirty()` após reset de cats/banks e restore de backup (corrigido) |

---

## Ordem de Carregamento nos HTMLs

Todos os HTMLs seguem esta ordem obrigatória:

```html
<script src="js/core/constants.js"></script>
<script src="js/core/config.js"></script>
<script src="js/core/core.js"></script>
<script src="js/utils/ui.js"></script>
<script src="js/sync/sync-service.js"></script>   <!-- Fase 3: sempre antes da feature -->
<script src="js/features/[tela].js"></script>
```

---

## Chaves do localStorage Introduzidas

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `gf_erp_deviceId` | string (UUID) | ID único do dispositivo — gerado uma vez, nunca muda |
| `gf_erp_syncQueue_<userId>` | JSON array | Fila de operações pendentes de envio ao Firestore |
| `gf_erp_syncShadow_<userId>` | JSON object | Hash de cada key para detecção de mudanças locais |
| `gf_erp_syncBootstrap_<userId>` | ISOString | Timestamp do último bootstrap bem-sucedido |
| `gf_erp_syncLastPull_<userId>` | ISOString | Timestamp do último pull remoto bem-sucedido |
| `gf_erp_sync_feature_enabled` | string ('0' = off) | Feature flag — ausente ou '1' = sync ativo |

---

## Limites Conhecidos

- **Sem SDK Firestore**: sincronização em tempo real implementada por polling REST a cada 10s.
  Latência máxima entre dispositivos: ~10 segundos. Decisão arquitetural: DEC-016.
- **Security Rules**: precisam ser publicadas manualmente no Firebase Console.
  O sistema não as configura automaticamente.
- **Autenticação**: requer login Firebase para sync. Em modo local (sem Firebase),
  o sistema opera 100% offline sem degradação funcional.
- **Fila offline longa**: registros com mais de 30 dias em status `pending` podem gerar
  conflitos de LWW — monitorar via indicador de erro na topbar.
- **schemaVersion**: atualmente em `1`. Ao alterar `normalizeTx()`, incrementar e testar
  migração de registros legados.

---

## Correções Aplicadas na Auditoria de Produção (v8.3.0 — patch 2)

Após diagnóstico externo apontando 4 riscos críticos, as seguintes correções foram aplicadas:

| # | Risco | Arquivo | Problema | Correção |
|---|-------|---------|----------|----------|
| R1 | Persistência da fila | `sync-service.js` | ✅ Já estava correto — `writeQueue()` persiste em `gf_erp_syncQueue_<userId>` | Confirmado, sem mudança |
| R2 | Backoff no retry | `sync-service.js` | Retry sem delay — risco de flood na API do Firestore após erros em série | Backoff exponencial: 5s → 10s → 20s → 40s → 80s (cap 120s). Status `failed` definitivo após `maxRetries` |
| R3 | Polling completo a cada 10s | `sync-service.js` | `pullRemote()` baixava toda a coleção sempre — custo alto com muitos dados | Pull incremental: `listRemoteCollection()` recebe `sinceIso` (timestamp do último pull) e filtra client-side por `updatedAt > lastPull`. Bootstrap mantém pull completo (localStorage vazio = sem filtro) |
| R4 | `deletedAt` em `charts.js` | `charts.js` | `Core.period.getTransactionsByPeriod()` não filtra `deletedAt` — gráficos incluíam dados excluídos | `visibleTx()` aplicado sobre `res.tx` antes de qualquer cálculo |

### Status final dos riscos

| Risco | Status |
|-------|--------|
| Persistência da fila local | ✅ Confirmado correto |
| Backoff exponencial no retry | ✅ Implementado |
| Poll incremental com `lastPullAt` | ✅ Implementado |
| `deletedAt` filtrado em TODAS as telas | ✅ charts.js corrigido — cobertura 100% |
| `normalizeTx` garantido em todos os saves | ✅ Confirmado via `migrateLocalTxSchema()` no boot |
