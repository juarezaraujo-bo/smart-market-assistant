import type { ProductRecommendation, RecommendedAction } from './productRecommendations';
import { formatCoverageDays, formatCurrencyPtBr, getRecommendedActionLabel } from './recommendationLabels';
import { formatUnits } from './promotionPresentation';

export type AnalysisView = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'historico';

export type Periodo = {
  periodo_inicio: string;
  periodo_fim: string;
};

export type PeriodOption = {
  value: string;
  label: string;
  periodo_inicio: string;
  periodo_fim: string;
};

export const HISTORY_COMPLETE_KEY = 'historico-completo';

export const analysisViewOptions: Array<{ value: AnalysisView; label: string }> = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Acumulado anual' },
  { value: 'historico', label: 'Histórico completo' },
];

export function formatMonthYear(value: string) {
  const formatted = new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function dateParts(value: string) {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}

function periodValue(periodoInicio: string, periodoFim: string) {
  return `${periodoInicio}|${periodoFim}`;
}

function upsertPeriodOption(map: Map<string, PeriodOption>, key: string, label: string, period: Periodo) {
  const current = map.get(key);
  if (!current) {
    map.set(key, {
      value: periodValue(period.periodo_inicio, period.periodo_fim),
      label,
      periodo_inicio: period.periodo_inicio,
      periodo_fim: period.periodo_fim,
    });
    return;
  }

  const periodoInicio = period.periodo_inicio < current.periodo_inicio ? period.periodo_inicio : current.periodo_inicio;
  const periodoFim = period.periodo_fim > current.periodo_fim ? period.periodo_fim : current.periodo_fim;
  map.set(key, {
    ...current,
    value: periodValue(periodoInicio, periodoFim),
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
  });
}

export function buildReferenceOptions(view: AnalysisView, periods: Periodo[]): PeriodOption[] {
  if (view === 'historico') return [];

  const sorted = [...periods].sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim));
  const grouped = new Map<string, PeriodOption>();

  for (const period of sorted) {
    const { year, month } = dateParts(period.periodo_inicio);
    if (view === 'mensal') {
      upsertPeriodOption(grouped, periodValue(period.periodo_inicio, period.periodo_fim), formatMonthYear(period.periodo_fim), period);
    }
    if (view === 'trimestral') {
      const quarter = Math.ceil(month / 3);
      upsertPeriodOption(grouped, `${year}-Q${quarter}`, `${quarter}º trimestre de ${year}`, period);
    }
    if (view === 'semestral') {
      const semester = month <= 6 ? 1 : 2;
      upsertPeriodOption(grouped, `${year}-S${semester}`, `${semester}º semestre de ${year}`, period);
    }
    if (view === 'anual') {
      upsertPeriodOption(grouped, `${year}`, `${year}`, period);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim));
}

function metricNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildActionPlanImpact(item: ProductRecommendation) {
  const simulation = item.simulacao_promocao;
  const scenario = simulation?.melhor_cenario;

  if (
    scenario &&
    simulation.capital_em_risco_estimado_sem_promocao !== null &&
    scenario.capital_em_risco_estimado_com_promocao !== null
  ) {
    const estoqueSemPromocao = Math.max(0, Math.floor(simulation.estoque_estimado_sem_promocao));
    const estoqueComPromocao = Math.max(0, Math.floor(scenario.estoque_estimado_com_promocao));
    const unidadesEvitadas = Math.max(0, estoqueSemPromocao - estoqueComPromocao);
    const valorEvitado = Math.max(
      0,
      simulation.capital_em_risco_estimado_sem_promocao - scenario.capital_em_risco_estimado_com_promocao
    );

    if (estoqueComPromocao === 0) {
      return `Pode evitar que ${formatUnits(unidadesEvitadas)}, equivalentes a ${formatCurrencyPtBr(valorEvitado)} em custo, permaneçam paradas.`;
    }

    return `Pode reduzir o estoque parado de ${estoqueSemPromocao} para ${estoqueComPromocao} unidades, evitando aproximadamente ${unidadesEvitadas} unidades e ${formatCurrencyPtBr(valorEvitado)} em custo.`;
  }

  const coverage = metricNumber(item.metricas_relevantes.cobertura_dias);
  if (coverage !== null) {
    return `O estoque atual pode durar ${formatCoverageDays(coverage)}.`;
  }

  return item.impacto;
}

export function buildActionPlanTitle(item: ProductRecommendation) {
  return `${getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)} para ${item.nome || 'produto não identificado'}`;
}

export function getTrendDisplay(item: ProductRecommendation) {
  const detailedTrend = item.metricas_relevantes.tendencia_vendas_detalhada;
  if (detailedTrend === 'SEM_VENDAS_RECENTES') {
    const periods = metricNumber(item.metricas_relevantes.periodos_disponiveis);
    if (periods !== null && periods >= 2) {
      return `Sem vendas nos últimos ${Math.min(2, periods)} meses`;
    }

    const days = metricNumber(item.metricas_relevantes.dias_sem_venda);
    if (days !== null) return `Última venda há ${Math.round(days)} dias`;
  }

  return null;
}
