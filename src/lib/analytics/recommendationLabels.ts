import type { TendenciaVendas } from './productMetrics';
import type {
  RecommendedAction,
  RecommendationSeverity,
  RecommendationType,
} from './productRecommendations';

export const recommendationTypeLabels: Record<RecommendationType, string> = {
  RISCO_RUPTURA: 'Risco de ruptura',
  REPOSICAO_PRIORITARIA: 'Reposição prioritária',
  SEM_VENDAS: 'Produto sem vendas',
  EXCESSO_ESTOQUE: 'Excesso de estoque',
  CAPITAL_PARADO: 'Capital parado',
  RISCO_VENCIMENTO: 'Risco de vencimento',
  PRODUTO_VENCIDO: 'Produto vencido',
  QUEDA_VENDAS: 'Queda nas vendas',
  CRESCIMENTO_VENDAS: 'Crescimento nas vendas',
  MARGEM_BAIXA: 'Margem baixa',
  MONITORAR: 'Monitorar',
};

export const recommendedActionLabels: Record<RecommendedAction, string> = {
  REPOR_ESTOQUE: 'Repor estoque',
  SUSPENDER_REPOSICAO: 'Suspender reposição',
  CRIAR_PROMOCAO: 'Criar promoção',
  CRIAR_COMBO: 'Criar combo',
  REVISAR_PRECO: 'Revisar preço',
  REVISAR_EXPOSICAO: 'Revisar exposição',
  NEGOCIAR_COM_FORNECEDOR: 'Negociar com fornecedor',
  RETIRAR_PRODUTO_VENCIDO: 'Retirar produto vencido',
  MONITORAR_ESTOQUE: 'Monitorar estoque',
  MANTER_ESTRATEGIA: 'Manter estratégia',
};

export const severityLabels: Record<RecommendationSeverity, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  informativa: 'Informativa',
};

export const trendLabels: Record<TendenciaVendas, string> = {
  crescimento: 'Crescimento',
  queda: 'Queda',
  estavel: 'Estável',
  dados_insuficientes: 'Dados insuficientes',
};

export function getRecommendationTypeLabel(type: RecommendationType) {
  return recommendationTypeLabels[type] ?? 'Recomendação';
}

export function getRecommendedActionLabel(action: RecommendedAction) {
  return recommendedActionLabels[action] ?? 'Ação recomendada';
}

export function getSeverityLabel(severity: RecommendationSeverity) {
  return severityLabels[severity] ?? 'Severidade';
}

export function getTrendLabel(trend: unknown) {
  if (typeof trend !== 'string' || !trend) return 'Não estimável';
  return trendLabels[trend as TendenciaVendas] ?? 'Não estimável';
}

export function formatCurrencyPtBr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Não estimável';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatPercentPtBr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Não estimável';
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatNumberPtBr(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Não estimável';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function formatCoverageDays(value: number | null | undefined) {
  return formatNumberPtBr(value, ' dias');
}

export type RecommendationListItem = {
  nome: string | null;
  categoria: string | null;
};

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterRecommendationsByText<T extends RecommendationListItem>(items: T[], searchText: string) {
  const normalizedSearch = normalizeText(searchText);
  if (!normalizedSearch) return items;

  return items.filter((item) => {
    const haystack = `${normalizeText(item.nome)} ${normalizeText(item.categoria)}`;
    return haystack.includes(normalizedSearch);
  });
}
