# BASE DE DADOS — ERP JW Finance v8.2.3

**Armazenamento:** `localStorage` do navegador  
**Modo:** 100% offline, sem servidor  
**Isolamento:** Por `userId` (hash SHA-256 do e-mail, truncado 16 chars)

---

## 1. Visão Geral do Schema

```
localStorage
│
├── [SESSÃO]
│   ├── gf_erp_logged                  → "true"|"false"
│   └── gf_erp_current_userId          → "{userId}"
│
├── [POR USUÁRIO] (prefixo: gf_erp_*_{userId})
│   ├── gf_erp_user_{userId}           → objeto User
│   ├── gf_erp_tx_{userId}_{YYYY-MM}  → array Transaction[]
│   ├── gf_erp_recorr_{userId}         → array Recurrence[]
│   ├── gf_erp_recorr_applied_{userId}_{YYYY-MM} → object {recId: true}
│   ├── gf_erp_goals_{userId}          → array Goal[]
│   ├── gf_erp_selected_month_{userId} → "YYYY-MM"
│   ├── gf_erp_theme_{userId}          → "dark"|"light"|"auto"
│   ├── gf_erp_cfg_categorias_{userId} → object CategoriesConfig
│   ├── gf_erp_cfg_bancos_{userId}     → object BanksConfig
│   └── gf_erp_budgetpct_{userId}_{YYYY-MM} → object BudgetPercent
│
└── [MIGRAÇÃO]
    └── gf_erp_migrated_v5_1           → "true"
```

---

## 2. Schemas Detalhados

### 2.1 User

```json
{
  "nome": "João Wijaya",
  "email": "joao@exemplo.com",
  "passwordHash": "a3f1b2c4d5e6...",
  "createdAt": "2026-02-18T10:30:00.000Z"
}
```

| Campo          | Tipo   | Descrição                              |
|----------------|--------|----------------------------------------|
| `nome`         | string | Nome completo do usuário               |
| `email`        | string | E-mail em lowercase                    |
| `passwordHash` | string | SHA-256 hex (64 chars) da senha        |
| `createdAt`    | string | ISO 8601 de criação da conta           |

---

### 2.2 Transaction (tx)

Armazenada em arrays por mês: `gf_erp_tx_{userId}_{YYYY-MM}`

```json
{
  "id": "3f1a-b2c4-d5e6-...",
  "tipo": "despesa",
  "subtipo": "essencial",
  "data": "2026-02-15",
  "valor": 1500.00,
  "categoria": "MORADIA (Aluguel/Condomínio)",
  "categoriaId": "des_moradia",
  "banco": "PIX",
  "descricao": "Aluguel fevereiro",
  "auto": false,
  "recurrenceId": null
}
```

| Campo          | Tipo    | Obrigatório | Valores possíveis                              |
|----------------|---------|-------------|------------------------------------------------|
| `id`           | string  | ✓           | UUID v4 ou timestamp                           |
| `tipo`         | string  | ✓           | `receita` `poupanca` `despesa` `divida`        |
| `subtipo`      | string  | Despesas    | `essencial` `livre`                            |
| `data`         | string  | ✓           | `YYYY-MM-DD`                                   |
| `valor`        | number  | ✓           | Sempre positivo (>0)                           |
| `categoria`    | string  | ✓           | Label da categoria (ex-valor de select)        |
| `categoriaId`  | string  | –           | ID semântico (ex: `des_moradia`)               |
| `banco`        | string  | ✓           | Label do banco/forma de pagamento              |
| `descricao`    | string  | –           | Texto livre (máx recomendado: 200 chars)       |
| `auto`         | boolean | –           | `true` se aplicado por recorrência             |
| `recurrenceId` | string  | –           | Referência à recorrência que gerou o lançamento|

**Tipos de transação e como afetam o saldo:**

```
receita   → +valor (entra na conta)
poupanca  → -valor (sai da conta, mas vai para reserva)
despesa   → -valor (gasto corrente)
divida    → -valor (pagamento de compromisso de crédito)

Saldo = Σ receita − Σ poupanca − Σ despesa − Σ divida
```

---

### 2.3 Recurrence (recorrência)

```json
{
  "id": "rec-uuid",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "startMonth": "2026-01",
  "endMonth": "2026-12",
  "template": {
    "tipo": "despesa",
    "subtipo": "essencial",
    "day": "15",
    "valor": 1500.00,
    "categoria": "MORADIA (Aluguel/Condomínio)",
    "banco": "PIX",
    "descricao": "Aluguel fixo"
  }
}
```

| Campo        | Tipo   | Descrição                                          |
|--------------|--------|----------------------------------------------------|
| `id`         | string | UUID único da recorrência                          |
| `startMonth` | string | YYYY-MM — primeiro mês que aplica                 |
| `endMonth`   | string | YYYY-MM ou null para "sem fim"                    |
| `template.day` | string | Dia do mês (1-31), clampado ao máximo do mês    |

**Controle de aplicação:** A key `gf_erp_recorr_applied_{userId}_{YYYY-MM}` armazena `{ recId: true }` para evitar duplicação quando o usuário navega entre meses.

---

### 2.4 Goal (meta)

```json
{
  "id": "goal-uuid",
  "name": "Economizar para viagem",
  "type": "poupanca_mes",
  "targetValue": 500.00,
  "category": null,
  "createdAt": "2026-02-01T00:00:00.000Z"
}
```

| Campo         | Tipo   | Valores                                          |
|---------------|--------|--------------------------------------------------|
| `type`        | string | `poupanca_mes` `divida_mes` `categoria_mes`      |
| `targetValue` | number | Valor alvo em R$                                 |
| `category`    | string | Só usado quando `type === 'categoria_mes'`       |

---

### 2.5 BudgetPercent (orçamento %)

```json
{
  "poupanca": 20,
  "essenciais": 50,
  "livres": 20,
  "dividas": 10
}
```

Soma deve ser 100. Calculado como: `target = renda × pct / 100`

---

### 2.6 CategoriesConfig

```json
{
  "receita": [
    { "id": "rec_salario", "originalLabel": "Salário", "label": "Salário", "active": true },
    { "id": "rec_freelance", "originalLabel": "Freelance", "label": "Meu Freela", "active": true }
  ],
  "poupanca": [...],
  "despesa_essencial": [...],
  "despesa_livre": [...],
  "divida": [...]
}
```

| Campo           | Descrição                                       |
|-----------------|-------------------------------------------------|
| `id`            | Identificador imutável (de ERP_CONST)           |
| `originalLabel` | Label original (não editável — referência)      |
| `label`         | Label customizado pelo usuário                  |
| `active`        | `true` = aparece nos selects; `false` = oculto  |

---

### 2.7 BanksConfig

Mesma estrutura de CategoriesConfig, mas organizado por tipo de transação:

```json
{
  "receita":  [...bancos],
  "poupanca": [...bancos],
  "despesa":  [...bancos],
  "divida":   [...bancos]
}
```

---

## 3. Backup (payload de exportação)

```json
{
  "backupVersion": "3",
  "appVersion": "8.2.3",
  "exportDateISO": "2026-02-18T15:30:00.000Z",
  "userId": "a3f1b2c4d5e6f7a8",
  "keys": {
    "gf_erp_user_a3f1b2c4d5e6f7a8": "{...}",
    "gf_erp_tx_a3f1b2c4d5e6f7a8_2026-02": "[...]",
    "...": "..."
  }
}
```

O campo `keys` é um dicionário flat de todas as keys do localStorage do usuário com seus valores serializados como string.

---

## 4. Limites do localStorage

| Limite       | Valor típico | Impacto                                  |
|--------------|--------------|------------------------------------------|
| Capacidade   | ~5–10 MB     | ~50.000 lançamentos estimados            |
| Timeout      | N/A          | Persistência até limpar dados do browser |
| Escopo       | Origem       | Só acessível pelo mesmo domínio          |

---

## 5. Convenções de Key

```
gf_erp_{tipo}[_{userId}][_{monthId}]
     │         │              │
     │         │              └─ YYYY-MM (opcional)
     │         └─ 16 chars hex (opcional para sessão)
     └─ prefixo fixo para localizar todas as keys do app
```

Para listar todas as keys do usuário no console:
```js
Object.keys(localStorage).filter(k => k.startsWith('gf_erp_'))
```
