export type TendenciaVendas = 'crescimento' | 'queda' | 'estavel' | 'dados_insuficientes';
export type TendenciaVendasDetalhada =
  | 'ALTA'
  | 'QUEDA'
  | 'ESTAVEL'
  | 'OSCILANDO'
  | 'VENDAS_RETOMADAS'
  | 'SEM_VENDAS_RECENTES'
  | 'SEM_HISTORICO_COMPARATIVO'
  | 'HISTORICO_INCOMPLETO'
  | 'DADOS_INSUFICIENTES';

export type AnalyticsReliabilityLevel = 'alta' | 'moderada' | 'baixa';

export type AnalyticsReliability = {
  nivel: AnalyticsReliabilityLevel;
  mensagem: string;
};

export type AnalyticsObservationCode =
  | 'SEM_VENDAS_PARA_COBERTURA'
  | 'PERIODO_ANTERIOR_SEM_VENDAS'
  | 'PRECO_VENDA_ZERO'
  | 'ULTIMA_VENDA_AUSENTE'
  | 'VALIDADE_AUSENTE'
  | 'DADOS_INSUFICIENTES_TENDENCIA'
  | 'PERIODO_INVALIDO'
  | 'DATA_ULTIMA_VENDA_INVALIDA'
  | 'DATA_VALIDADE_INVALIDA'
  | 'PRECO_CUSTO_AUSENTE'
  | 'PRECO_VENDA_AUSENTE';

export type AnalyticsObservation = {
  codigo: AnalyticsObservationCode;
  mensagem: string;
  campo?: string;
};

export type ProductHistoryRecord = {
  id?: string;
  produto_id: string;
  nome?: string | null;
  categoria?: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  quantidade_vendida: number;
  estoque_atual: number;
  preco_custo: number | null;
  preco_venda: number | null;
  ultima_venda: string | null;
  data_validade: string | null;
};

export type ProductMetrics = {
  produto_id: string;
  nome: string | null;
  categoria: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  quantidade_vendida: number;
  estoque_atual: number;
  preco_custo: number | null;
  preco_venda: number | null;
  dias_periodo: number | null;
  venda_media_dia: number | null;
  cobertura_dias: number | null;
  capital_estoque: number | null;
  margem_unitaria: number | null;
  margem_percentual: number | null;
  dias_sem_venda: number | null;
  dias_ate_vencimento: number | null;
  variacao_vendas_percentual: number | null;
  tendencia_vendas: TendenciaVendas;
  tendencia_vendas_detalhada?: TendenciaVendasDetalhada;
  periodos_disponiveis?: number;
  periodos_esperados?: number;
  periodos_ausentes?: string[];
  confiabilidade?: AnalyticsReliability;
  observacoes: AnalyticsObservation[];
};

export type ProductMetricsOptions = {
  tolerancePercent?: number;
  trendRecords?: ProductHistoryRecord[];
  expectedPeriodCount?: number;
  missingPeriods?: string[];
};

const DEFAULT_TOLERANCE_PERCENT = 10;
const DEFAULT_OSCILLATION_TOLERANCE_PERCENT = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function createObservation(codigo: AnalyticsObservationCode, mensagem: string, campo?: string): AnalyticsObservation {
  return campo ? { codigo, mensagem, campo } : { codigo, mensagem };
}

function parseUtcDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function diffDaysUtc(end: string, start: string) {
  const endTimestamp = parseUtcDate(end);
  const startTimestamp = parseUtcDate(start);

  if (endTimestamp === null || startTimestamp === null) return null;
  return Math.round((endTimestamp - startTimestamp) / MS_PER_DAY);
}

function roundMetric(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sortHistory(records: ProductHistoryRecord[]) {
  return [...records].sort((a, b) => {
    const endCompare = a.periodo_fim.localeCompare(b.periodo_fim);
    if (endCompare !== 0) return endCompare;
    return a.periodo_inicio.localeCompare(b.periodo_inicio);
  });
}

function sanitizeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function sanitizeNullableNumber(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
}

export function calculatePeriodoDays(periodoInicio: string, periodoFim: string) {
  const diff = diffDaysUtc(periodoFim, periodoInicio);
  if (diff === null || diff < 0) return null;
  return diff + 1;
}

export function parseAnalyticsLimit(value: string | null) {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return null;
  return parsed;
}

function compareSales(previous: number, current: number, tolerancePercent: number) {
  if (previous === current) return 'estavel';
  if (previous === 0) return current > 0 ? 'crescimento' : 'estavel';

  const changePercent = ((current - previous) / previous) * 100;
  if (!Number.isFinite(changePercent)) return 'estavel';
  if (changePercent > tolerancePercent) return 'crescimento';
  if (changePercent < -tolerancePercent) return 'queda';
  return 'estavel';
}

function isRelevantMove(previous: number, current: number, tolerancePercent: number) {
  if (previous === current) return 'flat';
  if (previous === 0) return current > 0 ? 'up' : 'flat';
  const changePercent = ((current - previous) / previous) * 100;
  if (!Number.isFinite(changePercent)) return 'flat';
  if (changePercent > tolerancePercent) return 'up';
  if (changePercent < -tolerancePercent) return 'down';
  return 'flat';
}

export function calculateDetailedSalesTrend(
  records: ProductHistoryRecord[],
  options: ProductMetricsOptions = {}
): TendenciaVendasDetalhada {
  const sorted = sortHistory(records);
  const validRecords = sorted.filter((record) => calculatePeriodoDays(record.periodo_inicio, record.periodo_fim) !== null);
  const expectedPeriodCount = options.expectedPeriodCount ?? validRecords.length;
  const missingPeriods = options.missingPeriods ?? [];

  if (validRecords.length === 0) return 'DADOS_INSUFICIENTES';
  if (missingPeriods.length > 0 || expectedPeriodCount > validRecords.length) return 'HISTORICO_INCOMPLETO';
  if (validRecords.length === 1) return 'SEM_HISTORICO_COMPARATIVO';

  const sales = validRecords.map((record) => sanitizeNumber(record.quantidade_vendida));
  const last = sales[sales.length - 1];
  const previous = sales[sales.length - 2];

  if (previous === 0 && last > 0) return 'VENDAS_RETOMADAS';
  if (sales.length >= 2 && sales.slice(-2).every((value) => value === 0)) return 'SEM_VENDAS_RECENTES';

  const tolerancePercent = options.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT;
  const moves = sales.slice(1).map((value, index) => isRelevantMove(sales[index], value, DEFAULT_OSCILLATION_TOLERANCE_PERCENT));
  if (moves.includes('up') && moves.includes('down')) return 'OSCILANDO';

  const trendBase = validRecords.length >= 3 ? validRecords.slice(-3) : validRecords;
  const first = sanitizeNumber(trendBase[0].quantidade_vendida);
  const current = sanitizeNumber(trendBase[trendBase.length - 1].quantidade_vendida);
  const overallMove = compareSales(first, current, tolerancePercent);

  if (overallMove === 'crescimento') return 'ALTA';
  if (overallMove === 'queda') return 'QUEDA';
  if (overallMove === 'estavel') return 'ESTAVEL';
  return 'DADOS_INSUFICIENTES';
}

function calculateReliability(
  records: ProductHistoryRecord[],
  totalSales: number,
  expectedPeriodCount: number,
  missingPeriods: string[]
): AnalyticsReliability {
  const validCount = records.filter((record) => calculatePeriodoDays(record.periodo_inicio, record.periodo_fim) !== null).length;

  if (validCount >= 6 && missingPeriods.length === 0 && totalSales > 0) {
    return { nivel: 'alta', mensagem: `Histórico contínuo de ${validCount} meses.` };
  }

  if (validCount >= 3 && missingPeriods.length === 0) {
    return { nivel: 'moderada', mensagem: totalSales > 0 ? `Histórico de ${validCount} meses.` : 'Histórico de 3 meses ou mais, mas com vendas pouco frequentes.' };
  }

  if (expectedPeriodCount > validCount || missingPeriods.length > 0) {
    return { nivel: 'baixa', mensagem: 'Poucos períodos ou histórico incompleto.' };
  }

  return { nivel: 'baixa', mensagem: 'Poucos períodos para comparação.' };
}

export function calculateSalesTrend(
  records: ProductHistoryRecord[],
  options: ProductMetricsOptions = {}
): TendenciaVendas {
  const sorted = sortHistory(records);
  if (sorted.length < 3) return 'dados_insuficientes';

  const tolerancePercent = options.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT;
  const lastThree = sorted.slice(-3);
  const first = sanitizeNumber(lastThree[0].quantidade_vendida);
  const second = sanitizeNumber(lastThree[1].quantidade_vendida);
  const third = sanitizeNumber(lastThree[2].quantidade_vendida);
  const firstMove = compareSales(first, second, tolerancePercent);
  const secondMove = compareSales(second, third, tolerancePercent);
  const overallMove = compareSales(first, third, tolerancePercent);

  if (overallMove === 'crescimento' && firstMove !== 'queda' && secondMove !== 'queda') {
    return 'crescimento';
  }

  if (overallMove === 'queda' && firstMove !== 'crescimento' && secondMove !== 'crescimento') {
    return 'queda';
  }

  return 'estavel';
}


export function calculateProductMetrics(
  records: ProductHistoryRecord[],
  options: ProductMetricsOptions = {}
): ProductMetrics {
  if (records.length === 0) {
    throw new Error('Ao menos um registro historico de produto e necessario.');
  }

  const sorted = sortHistory(records);
  const current = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const trendRecords = sortHistory(options.trendRecords ?? sorted);
  const expectedPeriodCount = options.expectedPeriodCount ?? trendRecords.length;
  const missingPeriods = options.missingPeriods ?? [];
  const observacoes: AnalyticsObservation[] = [];
  const quantidadeVendida = sanitizeNumber(current.quantidade_vendida);
  const estoqueAtual = sanitizeNumber(current.estoque_atual);
  const precoCusto = sanitizeNullableNumber(current.preco_custo);
  const precoVenda = sanitizeNullableNumber(current.preco_venda);
  const diasPeriodo = calculatePeriodoDays(current.periodo_inicio, current.periodo_fim);
  const vendaMediaDia = diasPeriodo && diasPeriodo > 0 ? quantidadeVendida / diasPeriodo : null;
  const tendenciaDetalhada = calculateDetailedSalesTrend(trendRecords, {
    ...options,
    expectedPeriodCount,
    missingPeriods,
  });
  const tendenciaVendas = calculateSalesTrend(sorted, options);

  if (diasPeriodo === null) {
    observacoes.push(createObservation(
      'PERIODO_INVALIDO',
      'Periodo invalido para calculo de indicadores.',
      'periodo_inicio'
    ));
  }

  let coberturaDias: number | null = null;
  if (vendaMediaDia !== null && vendaMediaDia > 0) {
    coberturaDias = estoqueAtual / vendaMediaDia;
  } else {
    observacoes.push(createObservation(
      'SEM_VENDAS_PARA_COBERTURA',
      'Nao existe venda suficiente para estimar cobertura.',
      'cobertura_dias'
    ));
  }

  let capitalEstoque: number | null = null;
  if (precoCusto !== null) {
    capitalEstoque = estoqueAtual * precoCusto;
  } else {
    observacoes.push(createObservation(
      'PRECO_CUSTO_AUSENTE',
      'Preco de custo ausente impede o calculo do capital em estoque.',
      'capital_estoque'
    ));
  }

  let margemUnitaria: number | null = null;
  if (precoVenda !== null && precoCusto !== null) {
    margemUnitaria = precoVenda - precoCusto;
  } else if (precoVenda === null) {
    observacoes.push(createObservation(
      'PRECO_VENDA_AUSENTE',
      'Preco de venda ausente impede o calculo da margem unitaria.',
      'margem_unitaria'
    ));
  }

  let margemPercentual: number | null = null;
  if (precoVenda !== null && precoVenda > 0 && margemUnitaria !== null) {
    margemPercentual = (margemUnitaria / precoVenda) * 100;
  } else if (precoVenda === 0) {
    observacoes.push(createObservation(
      'PRECO_VENDA_ZERO',
      'Preco de venda zero impede o calculo da margem percentual.',
      'margem_percentual'
    ));
  } else if (precoVenda === null) {
    observacoes.push(createObservation(
      'PRECO_VENDA_AUSENTE',
      'Preco de venda ausente impede o calculo da margem percentual.',
      'margem_percentual'
    ));
  }

  let diasSemVenda: number | null = null;
  if (current.ultima_venda) {
    const diff = diffDaysUtc(current.periodo_fim, current.ultima_venda);
    if (diff === null || diff < 0) {
      observacoes.push(createObservation(
        'DATA_ULTIMA_VENDA_INVALIDA',
        'Ultima venda invalida ou posterior ao fim do periodo.',
        'ultima_venda'
      ));
    } else {
      diasSemVenda = diff;
    }
  } else {
    observacoes.push(createObservation(
      'ULTIMA_VENDA_AUSENTE',
      'Ultima venda ausente no periodo.',
      'ultima_venda'
    ));
  }

  let diasAteVencimento: number | null = null;
  if (current.data_validade) {
    const diff = diffDaysUtc(current.data_validade, current.periodo_fim);
    if (diff === null) {
      observacoes.push(createObservation(
        'DATA_VALIDADE_INVALIDA',
        'Data de validade invalida no periodo.',
        'data_validade'
      ));
    } else {
      diasAteVencimento = diff;
    }
  } else {
    observacoes.push(createObservation(
      'VALIDADE_AUSENTE',
      'Data de validade ausente no periodo.',
      'data_validade'
    ));
  }

  let variacaoVendasPercentual: number | null = null;
  if (previous) {
    const vendasAnteriores = sanitizeNumber(previous.quantidade_vendida);
    if (vendasAnteriores > 0) {
      variacaoVendasPercentual = ((quantidadeVendida - vendasAnteriores) / vendasAnteriores) * 100;
    } else {
      observacoes.push(createObservation(
        'PERIODO_ANTERIOR_SEM_VENDAS',
        'Nao existe base percentual adequada porque o periodo anterior teve venda zero.',
        'variacao_vendas_percentual'
      ));
    }
  }

  if (tendenciaVendas === 'dados_insuficientes') {
    observacoes.push(createObservation(
      'DADOS_INSUFICIENTES_TENDENCIA',
      'Sao necessarios ao menos tres periodos para classificar tendencia de vendas.',
      'tendencia_vendas'
    ));
  }

  return {
    produto_id: current.produto_id,
    nome: current.nome ?? null,
    categoria: current.categoria ?? null,
    periodo_inicio: current.periodo_inicio,
    periodo_fim: current.periodo_fim,
    quantidade_vendida: quantidadeVendida,
    estoque_atual: estoqueAtual,
    preco_custo: precoCusto,
    preco_venda: precoVenda,
    dias_periodo: diasPeriodo,
    venda_media_dia: vendaMediaDia === null ? null : roundMetric(vendaMediaDia, 2),
    cobertura_dias: coberturaDias === null ? null : roundMetric(coberturaDias, 2),
    capital_estoque: capitalEstoque === null ? null : roundMetric(capitalEstoque, 2),
    margem_unitaria: margemUnitaria === null ? null : roundMetric(margemUnitaria, 2),
    margem_percentual: margemPercentual === null ? null : roundMetric(margemPercentual, 2),
    dias_sem_venda: diasSemVenda,
    dias_ate_vencimento: diasAteVencimento,
    variacao_vendas_percentual:
      variacaoVendasPercentual === null ? null : roundMetric(variacaoVendasPercentual, 2),
    tendencia_vendas: tendenciaVendas,
    tendencia_vendas_detalhada: tendenciaDetalhada,
    periodos_disponiveis: trendRecords.length,
    periodos_esperados: expectedPeriodCount,
    periodos_ausentes: missingPeriods,
    confiabilidade: calculateReliability(trendRecords, quantidadeVendida, expectedPeriodCount, missingPeriods),
    observacoes,
  };
}
