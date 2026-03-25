/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/core/constants.js
   Versão: 8.2.6 | Data: 2026-02-19 | Autor: JW

   RESPONSABILIDADE:
   Fonte única de todos os dados imutáveis do sistema:
   - Categorias de transação (47 itens em 5 grupos)
   - Bancos e formas de pagamento (19 itens em 5 categorias)
   - Perfis financeiros (5 perfis com percentuais recomendados)
   - Thresholds de saúde financeira (regras de negócio)

   REGRAS DE NEGÓCIO DOCUMENTADAS:
   ─────────────────────────────────
   1. CATEGORIAS
      • receita      → o que entra (salário, freelance, bônus, etc.)
      • poupanca     → dinheiro guardado / investido (sai da renda disponível)
      • despesa_essencial → gastos obrigatórios (moradia, saúde, transporte)
      • despesa_livre     → gastos opcionais / lazer
      • divida       → compromissos de crédito / parcelas

   2. BANCOS
      • Organizados por categoria (payment, manager, digital, traditional, broker)
      • Defaults por tipo de transação (receita/poupanca/despesa/divida)

   3. PERFIS (percentuais sobre renda)
      • percEssenciais + percLivres + percPoupanca + percQuitacaoDividas = 100%

   4. THRESHOLDS (referência: regra 50/20/30 adaptada BR)
      • poupanca      : excelente ≥ 30%, ótima ≥ 20%, aceitável ≥ 10%
      • endividamento : saudável ≤ 10%, atenção ≤ 20%, perigoso ≤ 30%
      • essenciais    : ideal ≤ 50%, aceitável ≤ 60%, alto ≤ 70%

   DEPENDÊNCIAS: Nenhuma (carrega primeiro na ordem de scripts)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // 1. CATEGORIAS (47 total)
  //    Estrutura: { id: string, label: string }
  //    id: snake_case único por categoria
  //    label: texto exibido ao usuário (PT-BR)
  // ─────────────────────────────────────────────
  const CATEGORIES = {

    // 7 categorias de receita
    receita: [
      { id: 'rec_salario',      label: 'Salário' },
      { id: 'rec_freelance',    label: 'Freelance' },
      { id: 'rec_bonus',        label: 'Bônus/Comissão' },
      { id: 'rec_renda_extra',  label: 'Renda Extra' },
      { id: 'rec_reembolso',    label: 'Reembolso' },
      { id: 'rec_rendimentos',  label: 'Rendimentos' },
      { id: 'rec_outros',       label: 'Outros' }
    ],

    // 5 categorias de poupança / investimento
    poupanca: [
      { id: 'pou_reserva_emergencia', label: 'Reserva de Emergência' },
      { id: 'pou_aposentadoria',      label: 'Aposentadoria' },
      { id: 'pou_investimento',       label: 'Investimento' },
      { id: 'pou_objetivos',          label: 'Objetivos Específicos' },
      { id: 'pou_outros',             label: 'Outros' }
    ],

    // 11 categorias de despesa essencial (obrigatórias / difíceis de cortar)
    despesa_essencial: [
      { id: 'des_moradia',         label: 'MORADIA (Aluguel/Condomínio)' },
      { id: 'des_alimentacao_ess', label: 'ALIMENTAÇÃO ESSENCIAL' },
      { id: 'des_transporte',      label: 'TRANSPORTE' },
      { id: 'des_saude',           label: 'SAÚDE' },
      { id: 'des_educacao',        label: 'EDUCAÇÃO' },
      { id: 'des_comunicacao',     label: 'COMUNICAÇÃO (Internet/Cel)' },
      { id: 'des_utilidades',      label: 'UTILIDADES (Luz/Água/Gás)' },
      { id: 'des_seguros',         label: 'SEGUROS' },
      { id: 'des_impostos',        label: 'IMPOSTOS E TRIBUTOS' },
      { id: 'des_cuidado_pessoal', label: 'CUIDADO PESSOAL' },
      { id: 'des_outros_ess',      label: 'OUTROS ESSENCIAIS' }
    ],

    // 8 categorias de despesa livre (opcionais / lazer)
    despesa_livre: [
      { id: 'des_lazer',           label: 'LAZER E ENTRETENIMENTO' },
      { id: 'des_streaming',       label: 'STREAMING E ASSINATURAS' },
      { id: 'des_alimentacao_fora', label: 'ALIMENTAÇÃO FORA' },
      { id: 'des_vestuario',       label: 'VESTUÁRIO' },
      { id: 'des_viagens',         label: 'VIAGENS E PASSEIOS' },
      { id: 'des_hobbies',         label: 'HOBBIES' },
      { id: 'des_presentes',       label: 'PRESENTES' },
      { id: 'des_outros_liv',      label: 'OUTROS LIVRES' }
    ],

    // 10 categorias de dívida / crédito
    divida: [
      { id: 'div_cartao_credito',       label: 'Cartão de Crédito (fatura)' },
      { id: 'div_parcelas_cartao',      label: 'Parcelas no cartão' },
      { id: 'div_emprestimo_pessoal',   label: 'Empréstimo pessoal' },
      { id: 'div_fin_estudantil',       label: 'Financiamento estudantil (FIES)' },
      { id: 'div_fin_imovel',           label: 'Financiamento imobiliário' },
      { id: 'div_fin_veiculo',          label: 'Financiamento de veículo' },
      { id: 'div_consorcio',            label: 'Consórcio' },
      { id: 'div_acordo',               label: 'Acordo/Parcelamento' },
      { id: 'div_emprestimo_familiar',  label: 'Empréstimo familiar/amigos' },
      { id: 'div_outros',               label: 'Outras dívidas' }
    ]
  };

  // ─────────────────────────────────────────────
  // 2. BANCOS E FORMAS DE PAGAMENTO (19 total)
  //    category: payment | manager | digital | traditional | broker | other
  // ─────────────────────────────────────────────
  const BANKS_BASE = [
    // Formas de pagamento (4)
    { id: 'bank_cartao_credito', label: 'Cartão de Crédito', category: 'payment' },
    { id: 'bank_cartao_debito',  label: 'Cartão de Débito',  category: 'payment' },
    { id: 'bank_pix',            label: 'PIX',               category: 'payment' },
    { id: 'bank_dinheiro',       label: 'Dinheiro',          category: 'payment' },

    // Gerenciadores financeiros (3) — integração com apps externos
    { id: 'manager_guiabolso', label: 'GuiaBolso (Gerenciador)', category: 'manager' },
    { id: 'manager_mobills',   label: 'Mobills (Gerenciador)',   category: 'manager' },
    { id: 'manager_organizze', label: 'Organizze (Gerenciador)', category: 'manager' },

    // Bancos digitais (5)
    { id: 'bank_nubank',       label: 'Nubank',       category: 'digital' },
    { id: 'bank_inter',        label: 'Inter',        category: 'digital' },
    { id: 'bank_c6',           label: 'C6 Bank',      category: 'digital' },
    { id: 'bank_mercado_pago', label: 'Mercado Pago', category: 'digital' },
    { id: 'bank_picpay',       label: 'PicPay',       category: 'digital' },

    // Bancos tradicionais (4)
    { id: 'bank_itau',     label: 'Itaú',           category: 'traditional' },
    { id: 'bank_bb',       label: 'Banco do Brasil', category: 'traditional' },
    { id: 'bank_caixa',    label: 'Caixa',           category: 'traditional' },
    { id: 'bank_bradesco', label: 'Bradesco',        category: 'traditional' },

    // Corretoras / investimentos (2)
    { id: 'bank_xp',  label: 'XP Investimentos', category: 'broker' },
    { id: 'bank_btg', label: 'BTG Pactual',       category: 'broker' },

    // Outros
    { id: 'bank_outros', label: 'Outros', category: 'other' }
  ];

  // Defaults por tipo de transação (exibidos no select por padrão)
  // Regra: 5-7 bancos por tipo para melhor UX
  const BANKS_BY_TYPE_DEFAULT = {
    receita:  ['Cartão de Débito', 'PIX', 'Nubank', 'Itaú', 'Inter', 'Outros'],
    poupanca: ['Nubank', 'Inter', 'XP Investimentos', 'BTG Pactual', 'Itaú', 'Outros'],
    despesa:  ['Cartão de Crédito', 'Cartão de Débito', 'PIX', 'Dinheiro', 'Nubank', 'Mercado Pago', 'Outros'],
    divida:   ['Cartão de Crédito', 'Nubank', 'Itaú', 'Banco do Brasil', 'Caixa', 'Bradesco', 'Outros']
  };

  // ─────────────────────────────────────────────
  // 3. PERFIS FINANCEIROS (5 perfis)
  //    Todos os percentuais somam 100%
  //    Representam diferentes estratégias de vida financeira
  // ─────────────────────────────────────────────
  const FINANCIAL_PROFILES = {

    // Perfil equilibrado (recomendado para a maioria)
    responsavel: {
      name: '🎯 Responsável',
      description: 'Equilíbrio entre segurança e qualidade de vida',
      percEssenciais: 50,
      percLivres: 20,
      percPoupanca: 20,
      percQuitacaoDividas: 10
    },

    // Máxima proteção financeira
    conservador: {
      name: '🛡️ Conservador',
      description: 'Máxima segurança financeira e reservas',
      percEssenciais: 50,
      percLivres: 10,
      percPoupanca: 30,
      percQuitacaoDividas: 10
    },

    // Foco em construção de patrimônio (FIRE movement)
    poupador_agressivo: {
      name: '💰 Poupador Agressivo',
      description: 'Foco máximo em construir patrimônio',
      percEssenciais: 45,
      percLivres: 15,
      percPoupanca: 30,
      percQuitacaoDividas: 10
    },

    // Mais qualidade de vida, menos poupança
    livre: {
      name: '🌟 Livre',
      description: 'Mais flexibilidade no dia a dia',
      percEssenciais: 50,
      percLivres: 30,
      percPoupanca: 10,
      percQuitacaoDividas: 10
    },

    // Saída de dívidas como prioridade
    quitador: {
      name: '🎯 Quitador de Dívidas',
      description: 'Prioridade: zerar dívidas rapidamente',
      percEssenciais: 45,
      percLivres: 15,
      percPoupanca: 15,
      percQuitacaoDividas: 25
    }
  };

  // ─────────────────────────────────────────────
  // 4. THRESHOLDS DE SAÚDE FINANCEIRA
  //    Referência: Regra 50/30/20 adaptada para o Brasil
  //    Usados em Core.calc.health() e Core.calc.score()
  // ─────────────────────────────────────────────
  const FINANCIAL_THRESHOLDS = {

    // Taxa de poupança (% da renda) — quanto MAIOR, MELHOR
    poupanca: {
      excelente: 30, // ≥ 30% → excelente (Poupador Agressivo / Conservador)
      otima:     20, // ≥ 20% → ótima (Responsável padrão)
      aceitavel: 10, // ≥ 10% → aceitável (mínimo recomendado)
      baixa:      5  // < 10% → baixa (sinal de alerta)
    },

    // Taxa de endividamento (% da renda) — quanto MENOR, MELHOR
    endividamento: {
      saudavel: 10,  // ≤ 10% → saudável
      atencao:  20,  // ≤ 20% → atenção
      perigoso: 30,  // ≤ 30% → perigoso
      critico:  40   // > 30% → crítico (risco de insolvência)
    },

    // Despesas essenciais (% da renda) — quanto MENOR, MELHOR
    essenciais: {
      ideal:    50,  // ≤ 50% → ideal (regra 50/30/20)
      aceitavel: 60, // ≤ 60% → aceitável (realidade BR)
      alto:      70  // > 70% → alto (pouco espaço para poupança)
    }
  };

  // ─────────────────────────────────────────────
  // 5. EXPORT NAMESPACE GLOBAL
  // ─────────────────────────────────────────────
  window.ERP_CONST = {
    version:     '8.2.6',
    releaseDate: '2026-02-18',

    // Dados principais
    categories:          CATEGORIES,
    banksBase:           BANKS_BASE,
    banksByTypeDefault:  BANKS_BY_TYPE_DEFAULT,

    // Perfis e thresholds
    financialProfiles: FINANCIAL_PROFILES,
    thresholds:        FINANCIAL_THRESHOLDS,

    // Feature flags
    flags: {
      budgetPercentV8: true  // ativa modo orçamento percentual (v8)
    },

    // Metadata (calculado automaticamente)
    totalCategories: Object.values(CATEGORIES).reduce((n, arr) => n + arr.length, 0),
    totalBanks:      BANKS_BASE.length,
    totalProfiles:   Object.keys(FINANCIAL_PROFILES).length
  };

  console.log(
    `[ERP_CONST v${window.ERP_CONST.version}] Carregado:`,
    `${window.ERP_CONST.totalCategories} categorias,`,
    `${window.ERP_CONST.totalBanks} bancos,`,
    `${window.ERP_CONST.totalProfiles} perfis`
  );

})();
