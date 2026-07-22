export type AssistantResponseObjective =
  | 'explanation'
  | 'strategy'
  | 'executive_summary'
  | 'action_plan'
  | 'promotion_advice'
  | 'inventory_advice';

export type AssistantContextRequirement =
  | 'summary'
  | 'product'
  | 'recommendations'
  | 'promotion_simulation'
  | 'inventory_metrics';

export type AssistantResponseObjectiveDefinition = {
  id: AssistantResponseObjective;
  purpose: string;
  instructions: readonly string[];
  expectedStructure: readonly string[];
  minimumData: readonly AssistantContextRequirement[];
  recommendedLanguage: readonly string[];
  forbiddenLanguage: readonly string[];
  suggestedMaxChars: number;
  cautionRules: readonly string[];
  missingDataFallback: string;
};

export const ASSISTANT_RESPONSE_OBJECTIVES: Record<AssistantResponseObjective, AssistantResponseObjectiveDefinition> = {
  explanation: {
    id: 'explanation',
    purpose: 'Explicar por que uma metrica, diagnostico ou recomendacao foi gerada.',
    instructions: [
      'Explique a recomendacao usando apenas dados do produto ou recomendacoes presentes no contexto.',
      'Nao transforme a resposta em plano estrategico longo.',
      'Use poucas metricas, escolhendo as mais relevantes para a situacao.',
    ],
    expectedStructure: [
      'situacao observada',
      'dados que sustentam a situacao',
      'impacto operacional',
      'acao recomendada',
      'ressalva quando houver estimativa',
    ],
    minimumData: ['product'],
    recommendedLanguage: ['porque', 'o dado mostra', 'isso indica', 'acao sugerida'],
    forbiddenLanguage: ['plano completo', 'garantia', 'certeza'],
    suggestedMaxChars: 1200,
    cautionRules: ['Nao prometer resultado da acao recomendada.'],
    missingDataFallback: 'Nao ha produto ou recomendacao suficiente para explicar essa situacao com seguranca.',
  },
  strategy: {
    id: 'strategy',
    purpose: 'Orientar a prioridade entre varias acoes reais.',
    instructions: [
      'Priorize somente recomendacoes existentes no contexto.',
      'Mostre o que fazer primeiro e por que.',
      'Inclua uma acao a evitar quando os dados sustentarem.',
    ],
    expectedStructure: [
      'prioridade principal',
      'justificativa',
      'segunda prioridade',
      'acao a evitar',
      'indicador para acompanhar',
    ],
    minimumData: ['summary', 'recommendations'],
    recommendedLanguage: ['eu comecaria por', 'em seguida', 'acompanhe'],
    forbiddenLanguage: ['acao sem dado', 'prioridade inventada'],
    suggestedMaxChars: 1400,
    cautionRules: ['Nao sugerir acoes sem suporte nas recomendacoes reais.'],
    missingDataFallback: 'Nao ha resumo ou recomendacoes suficientes para montar uma estrategia segura.',
  },
  executive_summary: {
    id: 'executive_summary',
    purpose: 'Resumir o estado do mercado de forma gerencial.',
    instructions: [
      'Use agregados e apenas os itens mais relevantes.',
      'Nao liste todo o inventario.',
      'Mostre riscos, capital estimado parado e proximos passos.',
    ],
    expectedStructure: [
      'periodo',
      'principais riscos',
      'capital estimado parado',
      'rupturas',
      'vencimentos',
      'prioridades',
      'proximos passos',
    ],
    minimumData: ['summary'],
    recommendedLanguage: ['visao geral', 'principais riscos', 'proximos passos'],
    forbiddenLanguage: ['lista completa do inventario'],
    suggestedMaxChars: 1400,
    cautionRules: ['Nao exagerar criticidade alem da severidade existente.'],
    missingDataFallback: 'Nao ha resumo analitico suficiente para uma visao executiva segura.',
  },
  action_plan: {
    id: 'action_plan',
    purpose: 'Transformar recomendacoes em sequencia de acoes.',
    instructions: [
      'Organize ate tres acoes em ordem de execucao.',
      'Use papeis genericos quando util, como responsavel pelo estoque ou compras.',
      'Nao crie datas, fornecedores ou valores inexistentes.',
    ],
    expectedStructure: [
      'acao 1',
      'acao 2',
      'acao 3',
      'motivo',
      'responsavel generico quando util',
      'indicador de acompanhamento',
    ],
    minimumData: ['summary', 'recommendations'],
    recommendedLanguage: ['primeiro', 'depois', 'acompanhe'],
    forbiddenLanguage: ['data inventada', 'fornecedor inventado', 'valor inventado'],
    suggestedMaxChars: 1500,
    cautionRules: ['Nao transformar recomendacao em compromisso operacional garantido.'],
    missingDataFallback: 'Nao ha recomendacoes suficientes para montar um plano de acao seguro.',
  },
  promotion_advice: {
    id: 'promotion_advice',
    purpose: 'Explicar uma simulacao de promocao.',
    instructions: [
      'Diferencie preco atual, preco sugerido, desconto, margem e ganho estimado.',
      'Use sempre termos como estimado, potencial, simulacao ou projecao.',
      'Se nao houver cenario valido, informe claramente.',
    ],
    expectedStructure: [
      'preco atual',
      'preco sugerido',
      'desconto',
      'margem',
      'capital estimado em risco',
      'reducao estimada',
      'ganho economico incremental',
      'projecao versus resultado real',
    ],
    minimumData: ['promotion_simulation'],
    recommendedLanguage: ['simulacao', 'estimado', 'potencial', 'projecao'],
    forbiddenLanguage: ['vai vender', 'lucro garantido', 'garante resultado'],
    suggestedMaxChars: 1500,
    cautionRules: ['Nunca afirmar que a promocao garantira vendas ou lucro.'],
    missingDataFallback: 'Nao ha simulacao de promocao valida para orientar essa decisao.',
  },
  inventory_advice: {
    id: 'inventory_advice',
    purpose: 'Explicar decisoes de compra, reposicao, excesso ou suspensao.',
    instructions: [
      'Use estoque, vendas, cobertura, tendencia, dias sem venda, validade e recomendacao quando disponiveis.',
      'Nao recomendar compra apenas porque o estoque esta baixo se as vendas forem insuficientes.',
      'Explique quando a melhor acao for suspender reposicao.',
    ],
    expectedStructure: [
      'situacao do estoque',
      'ritmo de venda',
      'cobertura',
      'risco operacional',
      'recomendacao',
    ],
    minimumData: ['product', 'inventory_metrics'],
    recommendedLanguage: ['estoque', 'vendas', 'cobertura estimada', 'reposicao'],
    forbiddenLanguage: ['compre mesmo sem venda', 'reponha sem dado'],
    suggestedMaxChars: 1200,
    cautionRules: ['Nao recomendar compra sem suporte em venda, cobertura ou recomendacao real.'],
    missingDataFallback: 'Nao ha metricas de estoque e vendas suficientes para orientar compra ou reposicao.',
  },
};
