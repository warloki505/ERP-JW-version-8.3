# 🏛️ VERSIONAMENTO OFICIAL — ERP JW Finance

**Versão Institucional Atual:** **8.3.0**  
**Status:** Produção Estável (Fase 3 — Sync Multi-Device)  
**Release date:** 2026-03-22  

---

## Regra de Ouro (Fonte Única)

1. **A versão oficial do sistema vive no `Core.APP`** (`js/core/core.js`).
2. Documentação deve refletir a mesma versão:
   - `README.md`
   - `docs/changelog/CHANGELOG.md`
   - `RELEASE_NOTES_vX.Y.Z.txt`
   - `docs/INDEX.md`
   - `docs/VERSION.md` (este arquivo)
3. **Nenhum HTML deve exibir versão hardcoded na UI.**
   - A interface exibe apenas **“ERP JW Finance”**.
4. Patch (`x.y.z`) não pode alterar schema/keys do localStorage.

---

## Padrão SemVer adotado

- **MAJOR (X.0.0):** quebra de compatibilidade de dados (schema/storage)
- **MINOR (x.Y.0):** feature nova sem quebrar dados existentes
- **PATCH (x.y.Z):** ajustes/bugs/UX sem quebrar arquitetura e sem alterar schema

---

## Identidade Institucional

- **Nome do produto:** ERP JW Finance
- **Modelo:** Offline-first (localStorage) | Multiusuário (namespace por hash)
- **Governança:** documentação + validação antes de release

