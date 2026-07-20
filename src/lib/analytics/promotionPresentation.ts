import type { ProductRecommendation } from './productRecommendations';
import type { PromotionSimulation } from './promotionSimulator';

export type SalesProjectionSummary = {
  historico: {
    intervalo: string;
    duracao: string;
    vendasRealizadas: string;
    mediaMensal: string;
  };
  projecao: {
    diasAteVencimento: string;
    vendaEstimada: string;
    estoqueRestante: string;
    capitalParado: string;
  };
};

const NO_SALES_REASON = 'Não há vendas suficientes no período para estimar o efeito da promoção.';

function metricNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyPtBr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'não estimado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatSignedCurrencyPtBr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'não estimado';
  const formatted = formatCurrencyPtBr(Math.abs(value));
  if (value > 0) return `+ ${formatted}`;
  if (value < 0) return `- ${formatted}`;
  return formatted;
}

export function formatUnits(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'não estimado';
  const rounded = Math.max(0, Math.floor(value));
  return `${rounded} ${rounded === 1 ? 'unidade' : 'unidades'}`;
}

export function formatApproximateDays(value: number | null | undefined, compact = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'não estimado';
  const rounded = Math.max(0, Math.round(value));
  return compact ? `≈ ${rounded} dias` : `aproximadamente ${rounded} dias`;
}

export function formatMonthsAnalyzed(days: number | null | undefined) {
  if (days === null || days === undefined || !Number.isFinite(days) || days <= 0) return 'período não estimado';
  const months = Math.max(1, Math.round(days / 30));
  return `${months} ${months === 1 ? 'mês analisado' : 'meses analisados'}`;
}

export function getPromotionUnavailableMessage(simulation: PromotionSimulation) {
  if (simulation.motivo_indisponibilidade === NO_SALES_REASON) {
    return 'Não há histórico de vendas suficiente para estimar com segurança o impacto de uma promoção.';
  }

  return [
    'Nenhuma promoção simulada apresentou benefício financeiro suficiente.',
    'Neste momento, manter o preço atual é a alternativa mais segura dentro dos parâmetros analisados.',
  ].join(' ');
}

export function buildPromotionInsight(simulation: PromotionSimulation) {
  const scenario = simulation.melhor_cenario;
  if (!scenario) return getPromotionUnavailableMessage(simulation);

  const estoqueAtual = Math.max(0, Math.floor(simulation.estoque_atual));
  const estoqueSemPromocao = Math.max(0, Math.floor(simulation.estoque_estimado_sem_promocao));
  const estoqueComPromocao = Math.max(0, Math.floor(scenario.estoque_estimado_com_promocao));
  const desconto = Math.round(scenario.desconto_percentual);

  const capitalParado = formatCurrencyPtBr(simulation.capital_em_risco_estimado_sem_promocao);
  const intro = `Se nenhuma ação for realizada, aproximadamente ${estoqueSemPromocao} das ${estoqueAtual} unidades podem permanecer em estoque quando o produto vencer. Isso representa cerca de ${capitalParado} em custo.`;
  const action = estoqueComPromocao === 0
    ? `Uma promoção próxima de ${desconto}% pode ajudar a vender praticamente todo o estoque antes da validade.`
    : `Uma promoção próxima de ${desconto}% pode reduzir o estoque restante de ${estoqueSemPromocao} para ${estoqueComPromocao} unidades.`;

  return `${intro} ${action}`;
}

export function buildAnalysisSummary(simulation: PromotionSimulation) {
  const scenario = simulation.melhor_cenario;
  const estoqueAtual = formatUnits(simulation.estoque_atual);
  const vendaBase = formatUnits(simulation.venda_base_estimada);
  const estoqueRestante = formatUnits(simulation.estoque_estimado_sem_promocao);
  const capitalParado = formatCurrencyPtBr(simulation.capital_em_risco_estimado_sem_promocao);

  if (!scenario) {
    return `Você possui ${estoqueAtual} em estoque. Mantendo o ritmo atual, aproximadamente ${vendaBase} devem ser vendidas antes do vencimento. Cerca de ${estoqueRestante}, equivalentes a ${capitalParado} em custo, podem permanecer paradas.`;
  }

  const desconto = Math.round(scenario.desconto_percentual);
  const estoqueComPromocao = Math.max(0, Math.floor(scenario.estoque_estimado_com_promocao));
  const promotionResult = estoqueComPromocao === 0
    ? 'pode reduzir esse estoque restante para zero'
    : `pode reduzir esse estoque restante para ${formatUnits(estoqueComPromocao)}`;

  return [
    `Você possui ${estoqueAtual} em estoque.`,
    `Mantendo o ritmo atual, aproximadamente ${vendaBase} devem ser vendidas antes do vencimento.`,
    `Cerca de ${estoqueRestante}, equivalentes a ${capitalParado} em custo, podem permanecer paradas.`,
    `Uma promoção de aproximadamente ${desconto}% ${promotionResult}.`,
  ].join(' ');
}

export function buildSalesProjectionSummary(
  recommendation: ProductRecommendation,
  periodoLabel: string
): SalesProjectionSummary {
  const quantidadeVendida = metricNumber(recommendation.metricas_relevantes.quantidade_vendida) ?? 0;
  const diasPeriodo = metricNumber(recommendation.metricas_relevantes.dias_periodo) ?? 30;
  const diasAteVencimento = metricNumber(recommendation.metricas_relevantes.dias_ate_vencimento);
  const simulation = recommendation.simulacao_promocao;
  const mediaMensal = diasPeriodo > 0 ? Math.max(0, Math.round((quantidadeVendida / diasPeriodo) * 30)) : quantidadeVendida;

  return {
    historico: {
      intervalo: periodoLabel,
      duracao: formatMonthsAnalyzed(diasPeriodo),
      vendasRealizadas: formatUnits(quantidadeVendida),
      mediaMensal: `${formatUnits(mediaMensal)} por mês`,
    },
    projecao: {
      diasAteVencimento: diasAteVencimento === null ? 'validade não informada' : `${Math.max(0, Math.round(diasAteVencimento))} dias`,
      vendaEstimada: simulation ? formatUnits(simulation.venda_base_estimada) : 'não estimada',
      estoqueRestante: simulation ? formatUnits(simulation.estoque_estimado_sem_promocao) : 'não estimado',
      capitalParado: simulation ? formatCurrencyPtBr(simulation.capital_em_risco_estimado_sem_promocao) : 'não estimado',
    },
  };
}
