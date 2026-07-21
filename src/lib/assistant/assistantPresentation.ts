import type { ProductRecommendation, RecommendationSeverity } from '@/lib/analytics/productRecommendations';
import {
  formatCoverageDays,
  formatCurrencyPtBr,
  formatNumberPtBr,
  formatPercentPtBr,
  getRecommendedActionLabel,
  getRecommendationTypeLabel,
  getSeverityLabel,
  getTrendLabel,
} from '@/lib/analytics/recommendationLabels';
import type { AssistantPeriod, ProductLookupResult } from './assistantTypes';
import type { AssistantIntent, SalesRankingDirection } from './router/assistantIntents';

export type RecommendationIntent = 'prioridades' | 'repor' | 'capital' | 'vencimento' | 'promocao';

const MONTHS_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const TELEGRAM_SEVERITY_ICONS: Record<RecommendationSeverity, string> = {
  critica: '🔴',
  alta: '🟠',
  media: '🟡',
  baixa: '🔵',
  informativa: 'ℹ️',
};

function getTelegramSeverityIcon(severity: RecommendationSeverity) {
  return TELEGRAM_SEVERITY_ICONS[severity] ?? 'ℹ️';
}

function parseDateParts(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatMonthYear(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return value;
  return `${MONTHS_PT_BR[parts.month - 1]} de ${parts.year}`;
}

export function formatAssistantPeriod(period: AssistantPeriod | null | undefined) {
  if (!period) return 'período não encontrado';

  const start = parseDateParts(period.periodo_inicio);
  const end = parseDateParts(period.periodo_fim);
  if (!start || !end) return `${period.periodo_inicio} a ${period.periodo_fim}`;

  if (start.year === end.year && start.month === end.month) {
    return formatMonthYear(period.periodo_fim);
  }

  return `${formatMonthYear(period.periodo_inicio)} a ${formatMonthYear(period.periodo_fim)}`;
}

function getTitle(intent: RecommendationIntent, marketName: string) {
  if (intent === 'repor') return `Reposição do ${marketName}`;
  if (intent === 'capital') return `Capital parado do ${marketName}`;
  if (intent === 'vencimento') return `Vencimentos do ${marketName}`;
  if (intent === 'promocao') return `Promoções do ${marketName}`;
  return `Prioridades do ${marketName}`;
}

function getLead(count: number) {
  if (count === 0) return 'Não encontrei produtos para este filtro.';
  if (count === 1) return 'Encontrei 1 produto que precisa de atenção.';
  return `Encontrei ${count} produtos que precisam de atenção.`;
}

function getSituationLabel(recommendation: ProductRecommendation) {
  if (recommendation.recomendacao_principal === 'RISCO_VENCIMENTO') return 'Risco';
  if (recommendation.recomendacao_principal === 'PRODUTO_VENCIDO') return 'Risco';
  if (recommendation.recomendacao_principal === 'RISCO_RUPTURA') return 'Risco';
  return 'Situação';
}

function simplifyDiagnosis(recommendation: ProductRecommendation) {
  if (recommendation.recomendacao_principal === 'RISCO_VENCIMENTO') {
    return 'Pode vencer antes de acabar o estoque.';
  }

  if (recommendation.recomendacao_principal === 'PRODUTO_VENCIDO') {
    return 'Produto vencido. Precisa ser retirado da venda.';
  }

  if (recommendation.recomendacao_principal === 'SEM_VENDAS') {
    return 'Sem vendas e com estoque disponível.';
  }

  if (recommendation.recomendacao_principal === 'RISCO_RUPTURA') {
    return 'Pode acabar em poucos dias.';
  }

  if (recommendation.recomendacao_principal === 'REPOSICAO_PRIORITARIA') {
    return 'Estoque baixo e reposição precisa ser planejada.';
  }

  if (recommendation.recomendacao_principal === 'CAPITAL_PARADO') {
    return 'Dinheiro parado em estoque com baixa saída.';
  }

  if (recommendation.recomendacao_principal === 'EXCESSO_ESTOQUE') {
    return 'Estoque alto para o ritmo atual de vendas.';
  }

  if (recommendation.recomendacao_principal === 'QUEDA_VENDAS') {
    return 'Vendas em queda no período analisado.';
  }

  return recommendation.diagnostico;
}

function formatRecommendationItem(recommendation: ProductRecommendation, index: number) {
  const icon = getTelegramSeverityIcon(recommendation.severidade as RecommendationSeverity);
  const name = recommendation.nome || 'Produto não identificado';
  const situationLabel = getSituationLabel(recommendation);
  const diagnosis = simplifyDiagnosis(recommendation);
  const action = getRecommendedActionLabel(recommendation.acao_recomendada);

  return [
    `${icon} ${index + 1}. ${name}`,
    `${situationLabel}: ${diagnosis}`,
    `Ação sugerida: ${action}.`,
  ].join('\n');
}

type RecommendationListInput = {
  title: string;
  period: AssistantPeriod | null;
  recommendations: ProductRecommendation[];
  emptyMessage: string;
  mode?: 'default' | 'capital' | 'promotion' | 'sales';
};

function metricNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUnits(value: number | string | null | undefined) {
  const parsed = metricNumber(value);
  if (parsed === null) return 'não informado';
  return `${formatNumberPtBr(parsed, ' unidades')}`;
}

function formatMonthlyAverage(quantitySold: number | null, periodDays: number | null) {
  if (quantitySold === null || periodDays === null || periodDays <= 0) return 'não estimável';
  return formatNumberPtBr((quantitySold / periodDays) * 30, ' unidades/mês');
}

function formatDays(value: number | string | null | undefined, suffix: string) {
  const parsed = metricNumber(value);
  if (parsed === null) return 'não estimável';
  const rounded = Math.round(parsed);
  if (suffix === 'dias') return `${rounded} ${rounded === 1 ? 'dia' : 'dias'}`;
  return `${rounded} ${suffix}`;
}

function productSituationLabel(recommendation: ProductRecommendation) {
  return getRecommendationTypeLabel(recommendation.recomendacao_principal);
}

function productPriorityLabel(recommendation: ProductRecommendation) {
  const icon = getTelegramSeverityIcon(recommendation.severidade as RecommendationSeverity);
  return `${icon} ${getSeverityLabel(recommendation.severidade)}`;
}

function compactIndicators(recommendation: ProductRecommendation) {
  const metrics = recommendation.metricas_relevantes;
  const estoque = metricNumber(metrics.estoque_atual);
  const cobertura = metricNumber(metrics.cobertura_dias);
  const capital = metricNumber(metrics.capital_estoque);
  const indicators: string[] = [];

  if (estoque !== null) indicators.push(`Estoque: ${formatNumberPtBr(estoque, ' un.')}`);
  if (cobertura !== null) indicators.push(`Cobertura: ${formatCoverageDays(cobertura, true)}`);
  if (capital !== null) indicators.push(`Capital: ${formatCurrencyPtBr(capital)}`);

  return indicators.slice(0, 2).join(' | ');
}

function formatPromotionSimulation(recommendation: ProductRecommendation) {
  const simulation = recommendation.simulacao_promocao;
  const scenario = simulation?.melhor_cenario;
  if (!simulation || !scenario) return null;

  return [
    'Simulação de promoção:',
    `Preço atual: ${formatCurrencyPtBr(simulation.preco_venda_atual)}`,
    `Preço sugerido: ${formatCurrencyPtBr(scenario.preco_promocional)}`,
    `Desconto estimado: ${formatPercentPtBr(scenario.desconto_percentual)}`,
    `Redução potencial do capital parado: ${formatCurrencyPtBr(scenario.reducao_capital_risco_valor)} (${formatPercentPtBr(scenario.reducao_capital_risco_percentual)})`,
    `Ganho econômico incremental estimado: ${formatCurrencyPtBr(scenario.ganho_economico_incremental)}`,
    'Projeção baseada no histórico recente. O resultado real pode variar.',
  ].join('\n');
}

function formatListItem(recommendation: ProductRecommendation, index: number, mode: RecommendationListInput['mode'] = 'default') {
  const metrics = recommendation.metricas_relevantes;
  const base = [
    `${index + 1}. ${recommendation.nome || 'Produto não identificado'}`,
    `Situação: ${getRecommendationTypeLabel(recommendation.recomendacao_principal)}`,
    `Ação: ${getRecommendedActionLabel(recommendation.acao_recomendada)}`,
  ];

  if (mode === 'capital') {
    base.push(`Capital em estoque: ${formatCurrencyPtBr(metricNumber(metrics.capital_estoque))}`);
    base.push(`Estoque: ${formatUnits(metrics.estoque_atual)}`);
  } else if (mode === 'promotion') {
    const simulation = recommendation.simulacao_promocao;
    const scenario = simulation?.melhor_cenario;
    if (simulation && scenario) {
      base.push(`Preço: ${formatCurrencyPtBr(simulation.preco_venda_atual)} → ${formatCurrencyPtBr(scenario.preco_promocional)}`);
      base.push(`Desconto estimado: ${formatPercentPtBr(scenario.desconto_percentual)}`);
      base.push(`Impacto potencial: ${formatCurrencyPtBr(scenario.ganho_economico_incremental)}`);
    }
  } else if (mode === 'sales') {
    base.push(`Vendas: ${formatUnits(metrics.quantidade_vendida)}`);
    base.push(`Estoque: ${formatUnits(metrics.estoque_atual)}`);
  } else {
    const indicators = compactIndicators(recommendation);
    if (indicators) base.push(indicators);
  }

  return base.join('\n');
}

export function formatRecommendationListResponse(input: RecommendationListInput) {
  const items = input.recommendations.slice(0, 10).map((item, index) => formatListItem(item, index, input.mode));

  return [
    input.title,
    `Período: ${formatAssistantPeriod(input.period)}`,
    '',
    items.length > 0 ? `Encontrei ${items.length} item(ns) relevantes.` : input.emptyMessage,
    '',
    ...items.flatMap((item) => [item, '']),
  ].join('\n').trim();
}

export function formatExecutiveSummaryResponse(input: {
  marketName: string;
  period: AssistantPeriod | null;
  totalProducts: number;
  recommendations: ProductRecommendation[];
}) {
  const critical = input.recommendations.filter((item) => item.severidade === 'critica').length;
  const high = input.recommendations.filter((item) => item.severidade === 'alta').length;
  const capital = input.recommendations.reduce((sum, item) => sum + (metricNumber(item.metricas_relevantes.capital_estoque) || 0), 0);
  const rupture = input.recommendations.filter((item) => item.recomendacao_principal === 'RISCO_RUPTURA' || item.recomendacao_principal === 'REPOSICAO_PRIORITARIA').length;
  const expiration = input.recommendations.filter((item) => item.recomendacao_principal === 'RISCO_VENCIMENTO' || item.recomendacao_principal === 'PRODUTO_VENCIDO').length;
  const actions = input.recommendations.slice(0, 3).map((item, index) =>
    `${index + 1}. ${item.nome || 'Produto não identificado'}: ${getRecommendedActionLabel(item.acao_recomendada)}`
  );

  return [
    `📊 Resumo do ${input.marketName}`,
    `Período: ${formatAssistantPeriod(input.period)}`,
    '',
    `Produtos analisados: ${input.totalProducts}`,
    `Prioridades críticas: ${critical}`,
    `Prioridades altas: ${high}`,
    `Capital em estoque monitorado: ${formatCurrencyPtBr(capital)}`,
    `Reposição/ruptura: ${rupture}`,
    `Vencimentos: ${expiration}`,
    '',
    'Principais ações:',
    ...actions,
  ].join('\n').trim();
}

export function formatHelpResponse() {
  return [
    'Posso responder consultas operacionais do SmartMarket usando os dados reais do painel.',
    '',
    'Perguntas disponíveis:',
    '• Quais são as maiores prioridades deste mês?',
    '• Como está a cerveja?',
    '• Como estão as bebidas?',
    '• Onde tenho mais dinheiro parado?',
    '• O que preciso repor?',
    '• O que vence primeiro?',
    '• Quais produtos estão sem vender?',
    '• Qual promoção vale mais a pena?',
    '• Qual produto vende mais?',
    '• Como está meu mercado?',
  ].join('\n');
}

export function formatUnknownResponse() {
  return [
    'Não entendi sua solicitação.',
    '',
    'Você pode perguntar, por exemplo:',
    '• Como está a cerveja?',
    '• O que preciso repor?',
    '• Onde tenho mais dinheiro parado?',
    '• /ajuda',
  ].join('\n');
}

export function formatPeriodComparisonResponse(input: {
  productTerm?: string;
  current: ProductLookupResult;
  previous: ProductLookupResult;
  currentPeriod: AssistantPeriod | null;
  previousPeriod: AssistantPeriod | null;
}) {
  if (!input.productTerm) return 'Preciso saber qual produto ou análise você deseja comparar.';
  if (input.current.status !== 'found' || input.previous.status !== 'found') {
    return `Não encontrei dados suficientes para comparar "${input.productTerm}" com o período anterior.`;
  }

  const currentMetrics = input.current.produto.metricas_relevantes;
  const previousMetrics = input.previous.produto.metricas_relevantes;

  return [
    `📊 Comparação de produto`,
    `${input.current.produto.nome || input.productTerm}`,
    '',
    `Atual: ${formatAssistantPeriod(input.currentPeriod)}`,
    `Vendas: ${formatUnits(currentMetrics.quantidade_vendida)}`,
    `Estoque: ${formatUnits(currentMetrics.estoque_atual)}`,
    `Situação: ${getRecommendationTypeLabel(input.current.produto.recomendacao_principal)}`,
    '',
    `Anterior: ${formatAssistantPeriod(input.previousPeriod)}`,
    `Vendas: ${formatUnits(previousMetrics.quantidade_vendida)}`,
    `Estoque: ${formatUnits(previousMetrics.estoque_atual)}`,
    `Situação: ${getRecommendationTypeLabel(input.previous.produto.recomendacao_principal)}`,
  ].join('\n');
}

export function getListTitle(intent: AssistantIntent, category?: string, salesDirection?: SalesRankingDirection) {
  const suffix = category ? ` em ${category}` : '';
  if (intent === 'category_analysis') return `📦 Análise da categoria ${category || ''}`.trim();
  if (intent === 'idle_capital') return `💰 Capital em estoque${suffix}`;
  if (intent === 'replenishment') return `🛒 Produtos para repor${suffix}`;
  if (intent === 'expiration') return `⏳ Vencimentos${suffix}`;
  if (intent === 'stagnant_products') return `📦 Produtos sem venda${suffix}`;
  if (intent === 'promotions') return `🏷️ Promoções sugeridas${suffix}`;
  if (intent === 'sales_ranking') return salesDirection === 'least' ? `📉 Produtos que vendem menos${suffix}` : `📈 Produtos que vendem mais${suffix}`;
  return `📊 Prioridades${suffix}`;
}

export function formatFallbackProductLookupMessage(result: ProductLookupResult) {
  if (result.status === 'not_found') {
    return `Não encontrei produtos relacionados a "${result.termo || 'produto'}" no período analisado.`;
  }

  if (result.status === 'multiple_matches') {
    const term = result.termo || 'consulta';
    const items = result.matches.slice(0, 6).map((item, index) => {
      const action = item.acao_recomendada ? getRecommendedActionLabel(item.acao_recomendada) : 'ação não estimada';
      const situation = item.recomendacao_principal
        ? getRecommendationTypeLabel(item.recomendacao_principal)
        : 'situação não estimada';
      const indicators = item.metricas_relevantes
        ? compactIndicators({
          produto_id: item.produto_id,
          nome: item.nome,
          categoria: item.categoria,
          prioridade_score: 0,
          severidade: item.severidade || 'informativa',
          recomendacao_principal: item.recomendacao_principal || 'MONITORAR',
          diagnostico: '',
          impacto: '',
          acao_recomendada: item.acao_recomendada || 'MONITORAR_ESTOQUE',
          justificativas: [],
          metricas_relevantes: item.metricas_relevantes,
          simulacao_promocao: null,
        })
        : '';

      return [
        `${index + 1}. ${item.nome || 'Produto não identificado'}`,
        item.categoria ? `Categoria: ${item.categoria}` : null,
        `Situação: ${situation}`,
        `Ação sugerida: ${action}`,
        indicators || null,
      ].filter(Boolean).join('\n');
    });

    return [
      `📦 Encontrei ${result.matches.length} produtos relacionados a "${term}".`,
      '',
      ...items.flatMap((item) => [item, '']),
      'Me diga o nome mais específico do produto para eu detalhar melhor.',
    ].join('\n').trim();
  }

  const recommendation = result.produto;
  const metrics = recommendation.metricas_relevantes;
  const quantitySold = metricNumber(metrics.quantidade_vendida);
  const periodDays = metricNumber(metrics.dias_periodo);
  const coverage = metricNumber(metrics.cobertura_dias);
  const capital = metricNumber(metrics.capital_estoque);
  const trend = metrics.tendencia_vendas_detalhada || metrics.tendencia_vendas;
  const promotion = formatPromotionSimulation(recommendation);

  return [
    '📦 Análise de produto',
    `Período: ${formatAssistantPeriod(result.periodo)}`,
    '',
    `${recommendation.nome || 'Produto não identificado'}`,
    recommendation.categoria ? `Categoria: ${recommendation.categoria}` : null,
    '',
    `Estoque atual: ${formatUnits(metrics.estoque_atual)}`,
    `Vendas no período: ${formatUnits(quantitySold)}`,
    `Média mensal aproximada: ${formatMonthlyAverage(quantitySold, periodDays)}`,
    `Cobertura estimada: ${coverage === null ? 'não estimável' : formatCoverageDays(coverage)}`,
    `Capital em estoque: ${capital === null ? 'não estimável' : formatCurrencyPtBr(capital)}`,
    `Tendência: ${getTrendLabel(trend)}`,
    `Dias sem venda: ${formatDays(metrics.dias_sem_venda, 'dias')}`,
    `Dias até vencimento: ${formatDays(metrics.dias_ate_vencimento, 'dias')}`,
    `Preço atual: ${formatCurrencyPtBr(metricNumber(metrics.preco_venda))}`,
    '',
    `Situação: ${productSituationLabel(recommendation)}`,
    `Prioridade: ${productPriorityLabel(recommendation)}`,
    simplifyDiagnosis(recommendation),
    '',
    `Ação sugerida: ${getRecommendedActionLabel(recommendation.acao_recomendada)}.`,
    promotion ? ['', promotion].join('\n') : null,
  ].filter((line) => line !== null).join('\n').trim();
}

function getSuggestions() {
  return [
    'Posso detalhar qualquer produto.',
    '',
    'Exemplos:',
    '• Como está a cerveja?',
    '• Onde tenho mais dinheiro parado?',
    '• O que preciso repor?',
    '• O que vence primeiro?',
  ].join('\n');
}

export function formatFallbackRecommendationsMessage(input: {
  intent: RecommendationIntent;
  marketName: string;
  period: AssistantPeriod | null;
  recommendations: ProductRecommendation[];
}) {
  const title = getTitle(input.intent, input.marketName);
  const periodLabel = formatAssistantPeriod(input.period);
  const items = input.recommendations.map(formatRecommendationItem);

  return [
    `📊 ${title}`,
    `Período: ${periodLabel}`,
    '',
    getLead(input.recommendations.length),
    '',
    ...items.flatMap((item) => [item, '']),
    getSuggestions(),
  ].join('\n').trim();
}
