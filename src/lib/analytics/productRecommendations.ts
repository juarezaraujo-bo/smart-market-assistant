import type { ProductMetrics } from './productMetrics';
import {
  defaultRecommendationConfig,
  type RecommendationConfig,
} from './recommendationConfig';

export type RecommendationSeverity = 'critica' | 'alta' | 'media' | 'baixa' | 'informativa';

export type RecommendationType =
  | 'RISCO_RUPTURA'
  | 'REPOSICAO_PRIORITARIA'
  | 'SEM_VENDAS'
  | 'EXCESSO_ESTOQUE'
  | 'CAPITAL_PARADO'
  | 'RISCO_VENCIMENTO'
  | 'PRODUTO_VENCIDO'
  | 'QUEDA_VENDAS'
  | 'CRESCIMENTO_VENDAS'
  | 'MARGEM_BAIXA'
  | 'MONITORAR';

export type RecommendedAction =
  | 'REPOR_ESTOQUE'
  | 'SUSPENDER_REPOSICAO'
  | 'CRIAR_PROMOCAO'
  | 'CRIAR_COMBO'
  | 'REVISAR_PRECO'
  | 'REVISAR_EXPOSICAO'
  | 'NEGOCIAR_COM_FORNECEDOR'
  | 'RETIRAR_PRODUTO_VENCIDO'
  | 'MONITORAR_ESTOQUE'
  | 'MANTER_ESTRATEGIA';

export type RecommendationReasonCode =
  | 'PRODUTO_VENCIDO'
  | 'VENCIMENTO_PROXIMO'
  | 'COBERTURA_MAIOR_QUE_VALIDADE'
  | 'VENDA_ZERO_COM_ESTOQUE'
  | 'VENDA_ZERO_SEM_ESTOQUE'
  | 'COBERTURA_CRITICA'
  | 'COBERTURA_BAIXA'
  | 'COBERTURA_EXCESSIVA'
  | 'EXCESSO_COBERTURA'
  | 'COBERTURA_MUITO_EXCESSIVA'
  | 'TENDENCIA_CRESCIMENTO'
  | 'TENDENCIA_QUEDA'
  | 'VARIACAO_QUEDA_RELEVANTE'
  | 'VARIACAO_CRESCIMENTO_RELEVANTE'
  | 'CAPITAL_ALTO_RELATIVO'
  | 'CAPITAL_RELEVANTE'
  | 'BAIXA_VELOCIDADE_VENDA'
  | 'DIAS_SEM_VENDA_CRITICO'
  | 'MARGEM_BAIXA'
  | 'VENDA_ALTA_RELATIVA'
  | 'ESTOQUE_EXISTENTE'
  | 'SEM_CONDICAO_PRIORITARIA';

export type RecommendationReason = {
  codigo: RecommendationReasonCode;
  mensagem: string;
  peso_score: number;
  campo?: string;
};

export type ProductRecommendation = {
  produto_id: string;
  nome: string | null;
  categoria: string | null;
  prioridade_score: number;
  severidade: RecommendationSeverity;
  recomendacao_principal: RecommendationType;
  diagnostico: string;
  impacto: string;
  acao_recomendada: RecommendedAction;
  justificativas: RecommendationReason[];
  metricas_relevantes: Record<string, number | string | null>;
};

type RecommendationContext = {
  highCapitalProductIds: Set<string>;
  highSalesProductIds: Set<string>;
};

const NEGATIVE_RECOMMENDATIONS = new Set<RecommendationType>([
  'PRODUTO_VENCIDO',
  'RISCO_VENCIMENTO',
  'SEM_VENDAS',
  'EXCESSO_ESTOQUE',
  'CAPITAL_PARADO',
]);

export type RecommendationsSummary = {
  criticas: number;
  altas: number;
  medias: number;
  baixas: number;
  informativas: number;
  capital_em_risco: number;
};

function formatCurrency(value: number | null) {
  if (value === null) return 'valor nao calculado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatNumber(value: number | null, suffix = '') {
  if (value === null) return 'nao calculado';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function addReason(
  reasons: RecommendationReason[],
  codigo: RecommendationReasonCode,
  mensagem: string,
  pesoScore: number,
  campo?: string
) {
  reasons.push(campo ? { codigo, mensagem, peso_score: pesoScore, campo } : { codigo, mensagem, peso_score: pesoScore });
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRecommendationSeverity(score: number): RecommendationSeverity {
  if (score >= 80) return 'critica';
  if (score >= 60) return 'alta';
  if (score >= 35) return 'media';
  if (score >= 15) return 'baixa';
  return 'informativa';
}

function topPercentIds(metrics: ProductMetrics[], getValue: (metric: ProductMetrics) => number | null, percent: number) {
  const ranked = metrics
    .filter((metric) => {
      const value = getValue(metric);
      return value !== null && value > 0;
    })
    .sort((a, b) => (getValue(b) ?? 0) - (getValue(a) ?? 0));
  const count = ranked.length === 0 ? 0 : Math.max(1, Math.ceil(ranked.length * (percent / 100)));
  return new Set(ranked.slice(0, count).map((metric) => metric.produto_id));
}

function buildContext(metrics: ProductMetrics[], config: RecommendationConfig): RecommendationContext {
  return {
    highCapitalProductIds: topPercentIds(metrics, (metric) => metric.capital_estoque, config.capitalAltoPercentualProdutos),
    highSalesProductIds: topPercentIds(metrics, (metric) => metric.quantidade_vendida, config.vendaAltaPercentualProdutos),
  };
}

function hasLowSales(metric: ProductMetrics) {
  return metric.quantidade_vendida === 0 || metric.tendencia_vendas === 'queda';
}

function hasNoSalesForCoverage(metric: ProductMetrics) {
  return metric.cobertura_dias === null && (metric.quantidade_vendida === 0 || metric.venda_media_dia === null || metric.venda_media_dia === 0);
}

function getMetricFlags(metric: ProductMetrics, context: RecommendationContext, config: RecommendationConfig) {
  const cobertura = metric.cobertura_dias;
  const diasVencimento = metric.dias_ate_vencimento;

  return {
    produtoVencido: diasVencimento !== null && diasVencimento < 0,
    riscoVencimento:
      diasVencimento !== null &&
      diasVencimento >= 0 &&
      metric.estoque_atual > 0 &&
      (
        (cobertura !== null && cobertura > diasVencimento) ||
        (hasNoSalesForCoverage(metric) && diasVencimento <= config.vencimentoProximoDias)
      ),
    vendaZeroComEstoque: metric.quantidade_vendida === 0 && metric.estoque_atual > 0,
    vendaZeroSemEstoque: metric.quantidade_vendida === 0 && metric.estoque_atual === 0,
    ruptura: metric.venda_media_dia !== null && metric.venda_media_dia > 0 && cobertura !== null && cobertura <= config.coberturaCriticaRupturaDias,
    reposicaoPrioritaria:
      cobertura !== null &&
      cobertura > config.coberturaCriticaRupturaDias &&
      cobertura <= config.coberturaBaixaDias &&
      (metric.tendencia_vendas === 'crescimento' || context.highSalesProductIds.has(metric.produto_id)),
    excessoEstoque: cobertura !== null && cobertura > config.coberturaExcessivaDias,
    excessoMuitoAlto: cobertura !== null && cobertura > config.coberturaMuitoExcessivaDias,
    capitalParado:
      metric.estoque_atual > 0 &&
      context.highCapitalProductIds.has(metric.produto_id) &&
      (hasLowSales(metric) || cobertura === null || cobertura > config.coberturaExcessivaDias || (metric.dias_sem_venda ?? 0) > config.diasSemVendaCriticos),
    quedaVendas:
      metric.tendencia_vendas === 'queda' &&
      metric.variacao_vendas_percentual !== null &&
      metric.variacao_vendas_percentual <= config.quedaRelevantePercentual,
    crescimentoVendas:
      metric.tendencia_vendas === 'crescimento' &&
      (metric.variacao_vendas_percentual === null || metric.variacao_vendas_percentual >= config.crescimentoRelevantePercentual),
    margemBaixa: metric.margem_percentual !== null && metric.margem_percentual < config.margemBaixaPercentual,
    capitalAlto: context.highCapitalProductIds.has(metric.produto_id),
    vendaAlta: context.highSalesProductIds.has(metric.produto_id),
    diasSemVendaCritico: metric.dias_sem_venda !== null && metric.dias_sem_venda > config.diasSemVendaCriticos,
  };
}

function chooseMainRecommendation(
  metric: ProductMetrics,
  flags: ReturnType<typeof getMetricFlags>
): RecommendationType {
  if (flags.produtoVencido) return 'PRODUTO_VENCIDO';
  if (flags.riscoVencimento) return 'RISCO_VENCIMENTO';
  if (flags.vendaZeroComEstoque) return 'SEM_VENDAS';
  if (flags.ruptura) return 'RISCO_RUPTURA';
  if (flags.excessoEstoque) return 'EXCESSO_ESTOQUE';
  if (flags.capitalParado) return 'CAPITAL_PARADO';
  if (flags.quedaVendas) return 'QUEDA_VENDAS';
  if (flags.reposicaoPrioritaria) return 'REPOSICAO_PRIORITARIA';
  if (flags.crescimentoVendas) return 'CRESCIMENTO_VENDAS';
  if (flags.margemBaixa) return 'MARGEM_BAIXA';
  if (flags.vendaZeroSemEstoque || metric.estoque_atual === 0) return 'MONITORAR';
  return 'MONITORAR';
}

function chooseAction(main: RecommendationType, flags: ReturnType<typeof getMetricFlags>): RecommendedAction {
  if (main === 'PRODUTO_VENCIDO') return 'RETIRAR_PRODUTO_VENCIDO';
  if (main === 'RISCO_VENCIMENTO') return flags.produtoVencido ? 'RETIRAR_PRODUTO_VENCIDO' : 'CRIAR_PROMOCAO';
  if (main === 'SEM_VENDAS') return flags.riscoVencimento ? 'CRIAR_PROMOCAO' : 'SUSPENDER_REPOSICAO';
  if (main === 'RISCO_RUPTURA' || main === 'REPOSICAO_PRIORITARIA') return 'REPOR_ESTOQUE';
  if (main === 'EXCESSO_ESTOQUE' || main === 'CAPITAL_PARADO') return flags.quedaVendas ? 'CRIAR_PROMOCAO' : 'SUSPENDER_REPOSICAO';
  if (main === 'QUEDA_VENDAS') return 'REVISAR_EXPOSICAO';
  if (main === 'CRESCIMENTO_VENDAS') return 'MANTER_ESTRATEGIA';
  if (main === 'MARGEM_BAIXA') return 'REVISAR_PRECO';
  return 'MONITORAR_ESTOQUE';
}

function scoreRecommendation(metric: ProductMetrics, flags: ReturnType<typeof getMetricFlags>, reasons: RecommendationReason[]) {
  let score = 0;

  if (flags.produtoVencido) {
    score += 100;
    addReason(reasons, 'PRODUTO_VENCIDO', 'Produto vencido no fechamento do periodo.', 100, 'dias_ate_vencimento');
  }

  if (flags.riscoVencimento && !flags.produtoVencido) {
    const days = metric.dias_ate_vencimento ?? 0;
    const weight = days <= 7 ? 80 : days <= 15 ? 65 : 50;
    score += weight;
    addReason(reasons, 'VENCIMENTO_PROXIMO', `Vencimento em ${formatNumber(days, ' dias')}.`, weight, 'dias_ate_vencimento');
    if (metric.cobertura_dias !== null && metric.cobertura_dias > days) {
      addReason(reasons, 'COBERTURA_MAIOR_QUE_VALIDADE', 'Cobertura estimada maior que o prazo ate o vencimento.', 0, 'cobertura_dias');
    }
  }

  if (flags.vendaZeroComEstoque) {
    score += 35;
    addReason(reasons, 'VENDA_ZERO_COM_ESTOQUE', 'Produto sem vendas no periodo e com estoque disponivel.', 35, 'quantidade_vendida');
  } else if (flags.vendaZeroSemEstoque) {
    addReason(reasons, 'VENDA_ZERO_SEM_ESTOQUE', 'Produto sem vendas e sem estoque no periodo.', 0, 'quantidade_vendida');
  }

  if (flags.excessoMuitoAlto) {
    score += 30;
    addReason(reasons, 'COBERTURA_MUITO_EXCESSIVA', 'Cobertura estimada acima de 90 dias.', 30, 'cobertura_dias');
  } else if (flags.excessoEstoque) {
    score += 20;
    addReason(reasons, 'EXCESSO_COBERTURA', 'Cobertura estimada acima de 60 dias.', 20, 'cobertura_dias');
  }

  if (flags.ruptura) {
    score += 35;
    addReason(reasons, 'COBERTURA_CRITICA', 'Cobertura estimada em ate 7 dias.', 35, 'cobertura_dias');
  } else if (flags.reposicaoPrioritaria) {
    addReason(reasons, 'COBERTURA_BAIXA', 'Cobertura estimada entre 7 e 15 dias.', 10, 'cobertura_dias');
  }

  if (flags.crescimentoVendas) {
    const weight = flags.ruptura || flags.reposicaoPrioritaria ? 15 : 0;
    score += weight;
    addReason(reasons, 'TENDENCIA_CRESCIMENTO', 'Tendencia de vendas em crescimento.', weight, 'tendencia_vendas');
  }

  if (flags.quedaVendas) {
    score += 15;
    addReason(reasons, 'VARIACAO_QUEDA_RELEVANTE', 'Queda de vendas acima do limite configurado.', 15, 'variacao_vendas_percentual');
  } else if (metric.tendencia_vendas === 'queda') {
    score += 15;
    addReason(reasons, 'TENDENCIA_QUEDA', 'Tendencia de vendas em queda.', 15, 'tendencia_vendas');
  }

  if (flags.capitalAlto) {
    score += 15;
    addReason(reasons, 'CAPITAL_RELEVANTE', 'Produto esta entre os maiores capitais em estoque do cliente.', 15, 'capital_estoque');
  }

  if (flags.diasSemVendaCritico) {
    score += 20;
    addReason(reasons, 'DIAS_SEM_VENDA_CRITICO', 'Produto sem venda ha mais de 30 dias.', 20, 'dias_sem_venda');
  }

  if (hasLowSales(metric) && metric.estoque_atual > 0) {
    addReason(reasons, 'BAIXA_VELOCIDADE_VENDA', 'Baixa velocidade de venda combinada com estoque existente.', 0, 'venda_media_dia');
  }

  if (flags.margemBaixa) {
    score += 10;
    addReason(reasons, 'MARGEM_BAIXA', 'Margem percentual abaixo do limite configurado.', 10, 'margem_percentual');
  }

  if (flags.vendaAlta) {
    addReason(reasons, 'VENDA_ALTA_RELATIVA', 'Produto esta entre os maiores volumes vendidos do cliente.', 0, 'quantidade_vendida');
  }

  if (metric.estoque_atual > 0) {
    addReason(reasons, 'ESTOQUE_EXISTENTE', `Estoque atual de ${formatNumber(metric.estoque_atual, ' unidades')}.`, 0, 'estoque_atual');
  }

  if (reasons.length === 0) {
    addReason(reasons, 'SEM_CONDICAO_PRIORITARIA', 'Produto sem condicao operacional prioritaria no periodo.', 0);
  }

  return clampScore(score);
}

function buildDiagnostico(main: RecommendationType, metric: ProductMetrics) {
  if (main === 'PRODUTO_VENCIDO') return 'Produto vencido no fechamento do periodo.';
  if (main === 'RISCO_VENCIMENTO') return 'Produto com risco de vencimento antes do escoamento do estoque.';
  if (main === 'SEM_VENDAS') return 'Produto sem vendas no periodo e com estoque disponivel.';
  if (main === 'RISCO_RUPTURA') return 'Produto com baixa cobertura estimada e risco de ruptura.';
  if (main === 'REPOSICAO_PRIORITARIA') return 'Produto com cobertura baixa e necessidade de planejamento de reposicao.';
  if (main === 'EXCESSO_ESTOQUE') return 'Produto com cobertura estimada excessiva para a velocidade de venda atual.';
  if (main === 'CAPITAL_PARADO') return 'Produto com capital relevante em estoque e baixa saida.';
  if (main === 'QUEDA_VENDAS') return 'Produto com queda relevante de vendas.';
  if (main === 'CRESCIMENTO_VENDAS') return 'Produto com tendencia positiva de vendas.';
  if (main === 'MARGEM_BAIXA') return 'Produto com margem percentual baixa.';
  if (metric.estoque_atual === 0) return 'Produto sem estoque no periodo, monitorar reposicao conforme estrategia.';
  return 'Produto sem prioridade operacional imediata.';
}

function buildImpacto(metric: ProductMetrics) {
  const capital = formatCurrency(metric.capital_estoque);
  const estoque = formatNumber(metric.estoque_atual, ' unidades');
  const cobertura = formatNumber(metric.cobertura_dias, ' dias');
  return `Existem ${capital} imobilizados em ${estoque}. Cobertura estimada: ${cobertura}.`;
}

function buildRelevantMetrics(metric: ProductMetrics) {
  return {
    quantidade_vendida: metric.quantidade_vendida,
    estoque_atual: metric.estoque_atual,
    venda_media_dia: metric.venda_media_dia,
    cobertura_dias: metric.cobertura_dias,
    capital_estoque: metric.capital_estoque,
    margem_percentual: metric.margem_percentual,
    dias_sem_venda: metric.dias_sem_venda,
    dias_ate_vencimento: metric.dias_ate_vencimento,
    variacao_vendas_percentual: metric.variacao_vendas_percentual,
    tendencia_vendas: metric.tendencia_vendas,
  };
}

export function generateProductRecommendation(
  metric: ProductMetrics,
  allMetrics: ProductMetrics[],
  config: RecommendationConfig = defaultRecommendationConfig
): ProductRecommendation {
  const context = buildContext(allMetrics, config);
  const flags = getMetricFlags(metric, context, config);
  const justificativas: RecommendationReason[] = [];
  const recomendacaoPrincipal = chooseMainRecommendation(metric, flags);
  const score = scoreRecommendation(metric, flags, justificativas);

  return {
    produto_id: metric.produto_id,
    nome: metric.nome,
    categoria: metric.categoria,
    prioridade_score: score,
    severidade: getRecommendationSeverity(score),
    recomendacao_principal: recomendacaoPrincipal,
    diagnostico: buildDiagnostico(recomendacaoPrincipal, metric),
    impacto: buildImpacto(metric),
    acao_recomendada: chooseAction(recomendacaoPrincipal, flags),
    justificativas,
    metricas_relevantes: buildRelevantMetrics(metric),
  };
}

export function generateProductRecommendations(
  metrics: ProductMetrics[],
  config: RecommendationConfig = defaultRecommendationConfig
) {
  return metrics
    .map((metric) => generateProductRecommendation(metric, metrics, config))
    .sort((a, b) => {
      const scoreCompare = b.prioridade_score - a.prioridade_score;
      if (scoreCompare !== 0) return scoreCompare;
      const capitalCompare = Number(b.metricas_relevantes.capital_estoque ?? 0) - Number(a.metricas_relevantes.capital_estoque ?? 0);
      if (capitalCompare !== 0) return capitalCompare;
      return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
    });
}

export function isNegativeRelevantRecommendation(type: RecommendationType) {
  return NEGATIVE_RECOMMENDATIONS.has(type);
}

export function summarizeProductRecommendations(recommendations: ProductRecommendation[]): RecommendationsSummary {
  const summary = recommendations.reduce(
    (accumulator, recommendation) => {
      if (recommendation.severidade === 'critica') accumulator.criticas++;
      if (recommendation.severidade === 'alta') accumulator.altas++;
      if (recommendation.severidade === 'media') accumulator.medias++;
      if (recommendation.severidade === 'baixa') accumulator.baixas++;
      if (recommendation.severidade === 'informativa') accumulator.informativas++;
      if (isNegativeRelevantRecommendation(recommendation.recomendacao_principal)) {
        accumulator.capital_em_risco += Number(recommendation.metricas_relevantes.capital_estoque ?? 0);
      }
      return accumulator;
    },
    {
      criticas: 0,
      altas: 0,
      medias: 0,
      baixas: 0,
      informativas: 0,
      capital_em_risco: 0,
    }
  );

  return {
    ...summary,
    capital_em_risco: Math.round((summary.capital_em_risco + Number.EPSILON) * 100) / 100,
  };
}
