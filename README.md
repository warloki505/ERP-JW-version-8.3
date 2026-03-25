# 💰 ERP JW Finance

Sistema de gestão financeira pessoal — multiplataforma, offline-first, com autenticação Firebase.

## ✨ Funcionalidades

- Sincronização multi-device via Firestore REST + fila local (Fase 3)
- Bootstrap automático em novo dispositivo após login Firebase
- Indicador visual de status de sincronização

- Login e cadastro com Firebase Authentication (REST, sem SDK externo)
- Fallback local automático caso o Firebase esteja indisponível
- Controle de receitas, despesas, dívidas e poupança
- Dashboard com resumo financeiro
- Histórico de transações
- Gráficos e consolidado mensal
- Metas financeiras
- Gerenciadores de categorias e bancos
- Perfil do usuário
- PWA — funciona offline após primeira visita

## 🚀 Como usar

Acesse diretamente pelo GitHub Pages:
**[https://warloki505.github.io/ERP-JW-Finance-8/](https://warloki505.github.io/ERP-JW-Finance-8/)**

Não é necessário instalar nada.

## 🏗️ Estrutura do projeto

```
├── index.html              # Login / Cadastro
├── dashboard.html          # Painel principal
├── historico.html          # Histórico de transações
├── consolidado.html        # Consolidado mensal
├── charts.html             # Gráficos
├── metas.html              # Metas financeiras
├── gerenciadores.html      # Categorias e bancos
├── perfil.html             # Perfil do usuário
├── css/
│   └── style.css
├── js/
│   ├── core/
│   │   ├── firebase-init.js   # Auth Firebase via REST (sem SDK externo)
│   │   ├── core.js            # Núcleo do sistema
│   │   ├── constants.js       # Constantes globais
│   │   └── config.js          # Configurações por usuário
│   ├── features/              # Lógica de cada tela
│   └── utils/
│       └── ui.js              # Componentes de interface
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # Manifesto PWA
└── tests/                  # Testes básicos
```

## 🔒 Segurança

- Autenticação via Firebase Auth REST API (sem dependência de CDN externo)
- Dados financeiros armazenados localmente no navegador (localStorage)
- Sessão persistida com refresh token do Firebase
- Fallback local sem quebrar a interface caso o Firebase esteja bloqueado

## 📋 Versão

**v8.3.0** — Fase 3 concluída (sincronização multi-device)
