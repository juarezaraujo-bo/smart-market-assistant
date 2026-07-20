import type { ProductRecommendation, RecommendationSeverity } from '@/lib/analytics/productRecommendations';
import { getRecommendedActionLabel } from '@/lib/analytics/recommendationLabels';
import type { AssistantPeriod } from './assistantTypes';

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
