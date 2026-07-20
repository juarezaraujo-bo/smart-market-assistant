import type {
  PromotionScenarioConfig,
  PromotionSimulationConfig,
} from './recommendationConfig';
import { defaultRecommendationConfig } from './recommendationConfig';

export type PromotionSimulationInput = {
  preco_venda_atual: number | null;
  preco_custo: number | null;
  estoque_atual: number;
  venda_media_dia: number | null;
  dias_ate_vencimento: number | null;
};

export type PromotionSimulationScenario = {
  desconto_percentual: number;
  aumento_velocidade_percentual_estimado: number;
  preco_promocional: number;
  margem_bruta_promocional_percentual: number;
  lucro_bruto_unitario_promocional: number;
  venda_promocional_estimada: number;
  estoque_estimado_com_promocao: number;
  capital_em_risco_estimado_com_promocao: number;
  reducao_capital_risco_valor: number;
  reducao_capital_risco_percentual: number;
  receita_promocional_estimada: number;
  lucro_bruto_promocional: number;
  resultado_economico_estimado_com_promocao: number;
  ganho_economico_incremental: number;
  valido: boolean;
  motivo_rejeicao?: string;
};

export type PromotionSimulation = {
  tipo: 'simulacao_promocao';
  aviso: string;
  disponivel: boolean;
  motivo_indisponibilidade: string | null;
  preco_venda_atual: number | null;
  preco_custo: number | null;
  estoque_atual: number;
  venda_media_dia: number | null;
  dias_de_simulacao: number;
  margem_bruta_atual_percentual: number | null;
  lucro_bruto_unitario_atual: number | null;
  capital_em_estoque: number | null;
  venda_base_estimada: number;
  estoque_estimado_sem_promocao: number;
  capital_em_risco_estimado_sem_promocao: number | null;
  lucro_bruto_base: number | null;
  resultado_economico_estimado_sem_promocao: number | null;
  melhor_cenario: PromotionSimulationScenario | null;
  cenarios_avaliados: PromotionSimulationScenario[];
};

const SIMULATION_WARNING =
  'Simulação baseada no histórico recente de vendas e em parâmetros estimados. O resultado real pode variar conforme a resposta dos clientes.';

const NO_SALES_REASON = 'Não há vendas suficientes no período para estimar o efeito da promoção.';

function roundMoney(value: number) {
  return round(value, 2);
}

function roundPercent(value: number) {
  return round(value, 2);
}

function round(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validPositiveNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0;
}

function createUnavailableSimulation(
  input: PromotionSimulationInput,
  motivo: string,
  diasDeSimulacao = 0
): PromotionSimulation {
  const estoqueAtual = nonNegativeNumber(input.estoque_atual) ? input.estoque_atual : 0;
  const precoCusto = nonNegativeNumber(input.preco_custo) ? input.preco_custo : null;
  const precoVenda = validPositiveNumber(input.preco_venda_atual) ? input.preco_venda_atual : null;
  const capitalEmEstoque = precoCusto === null ? null : roundMoney(estoqueAtual * precoCusto);
  const margemAtual = precoVenda !== null && precoCusto !== null
    ? roundPercent(((precoVenda - precoCusto) / precoVenda) * 100)
    : null;

  return {
    tipo: 'simulacao_promocao',
    aviso: SIMULATION_WARNING,
    disponivel: false,
    motivo_indisponibilidade: motivo,
    preco_venda_atual: precoVenda,
    preco_custo: precoCusto,
    estoque_atual: estoqueAtual,
    venda_media_dia: validPositiveNumber(input.venda_media_dia) ? input.venda_media_dia : null,
    dias_de_simulacao: diasDeSimulacao,
    margem_bruta_atual_percentual: margemAtual,
    lucro_bruto_unitario_atual: precoVenda !== null && precoCusto !== null ? roundMoney(precoVenda - precoCusto) : null,
    capital_em_estoque: capitalEmEstoque,
    venda_base_estimada: 0,
    estoque_estimado_sem_promocao: estoqueAtual,
    capital_em_risco_estimado_sem_promocao: capitalEmEstoque,
    lucro_bruto_base: precoVenda !== null && precoCusto !== null ? 0 : null,
    resultado_economico_estimado_sem_promocao: capitalEmEstoque === null ? null : -capitalEmEstoque,
    melhor_cenario: null,
    cenarios_avaliados: [],
  };
}

function getDiasDeSimulacao(input: PromotionSimulationInput, config: PromotionSimulationConfig) {
  if (input.dias_ate_vencimento !== null && input.dias_ate_vencimento !== undefined && Number.isFinite(input.dias_ate_vencimento)) {
    return Math.max(0, Math.floor(input.dias_ate_vencimento));
  }

  return Math.max(0, Math.floor(config.horizontePadraoDias));
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber);
  return false;
}

function rejectScenario(
  scenario: PromotionScenarioConfig,
  motivo: string,
  values: Partial<PromotionSimulationScenario> = {}
): PromotionSimulationScenario {
  return {
    desconto_percentual: scenario.descontoPercentual,
    aumento_velocidade_percentual_estimado: scenario.aumentoVelocidadePercentual,
    preco_promocional: 0,
    margem_bruta_promocional_percentual: 0,
    lucro_bruto_unitario_promocional: 0,
    venda_promocional_estimada: 0,
    estoque_estimado_com_promocao: 0,
    capital_em_risco_estimado_com_promocao: 0,
    reducao_capital_risco_valor: 0,
    reducao_capital_risco_percentual: 0,
    receita_promocional_estimada: 0,
    lucro_bruto_promocional: 0,
    resultado_economico_estimado_com_promocao: 0,
    ganho_economico_incremental: 0,
    ...values,
    valido: false,
    motivo_rejeicao: motivo,
  };
}

function chooseBestScenario(scenarios: PromotionSimulationScenario[]) {
  const valid = scenarios.filter((scenario) => scenario.valido);

  return valid.sort((a, b) => {
    const ganhoCompare = b.ganho_economico_incremental - a.ganho_economico_incremental;
    if (ganhoCompare !== 0) return ganhoCompare;

    const riscoCompare = b.reducao_capital_risco_valor - a.reducao_capital_risco_valor;
    if (riscoCompare !== 0) return riscoCompare;

    const margemCompare = b.margem_bruta_promocional_percentual - a.margem_bruta_promocional_percentual;
    if (margemCompare !== 0) return margemCompare;

    return a.desconto_percentual - b.desconto_percentual;
  })[0] || null;
}

export function simulatePromotion(
  input: PromotionSimulationInput,
  config: PromotionSimulationConfig = defaultRecommendationConfig.simulacaoPromocao
): PromotionSimulation {
  const estoqueAtual = nonNegativeNumber(input.estoque_atual) ? input.estoque_atual : 0;
  const precoVendaAtual = validPositiveNumber(input.preco_venda_atual) ? input.preco_venda_atual : null;
  const precoCusto = nonNegativeNumber(input.preco_custo) ? input.preco_custo : null;
  const vendaMediaDia = validPositiveNumber(input.venda_media_dia) ? input.venda_media_dia : null;
  const diasDeSimulacao = getDiasDeSimulacao(input, config);

  if (precoVendaAtual === null) {
    return createUnavailableSimulation(input, 'Preço de venda ausente impede a simulação.', diasDeSimulacao);
  }

  if (precoCusto === null) {
    return createUnavailableSimulation(input, 'Preço de custo ausente impede a simulação.', diasDeSimulacao);
  }

  if (estoqueAtual <= 0) {
    return createUnavailableSimulation(input, 'Estoque atual insuficiente para simular promoção.', diasDeSimulacao);
  }

  if (vendaMediaDia === null) {
    return createUnavailableSimulation(input, NO_SALES_REASON, diasDeSimulacao);
  }

  const lucroBrutoUnitarioAtual = precoVendaAtual - precoCusto;
  if (lucroBrutoUnitarioAtual <= 0) {
    return createUnavailableSimulation(input, 'Preço atual não preserva lucro bruto positivo.', diasDeSimulacao);
  }

  const capitalEmEstoque = estoqueAtual * precoCusto;
  // Estratégia conservadora: usamos floor para estimar unidades vendidas, evitando prometer frações de unidade.
  const vendaBaseEstimada = Math.min(estoqueAtual, Math.floor(vendaMediaDia * diasDeSimulacao));
  const estoqueEstimadoSemPromocao = Math.max(0, estoqueAtual - vendaBaseEstimada);
  const capitalEmRiscoSemPromocao = estoqueEstimadoSemPromocao * precoCusto;
  const margemBrutaAtualPercentual = (lucroBrutoUnitarioAtual / precoVendaAtual) * 100;
  const lucroBrutoBase = vendaBaseEstimada * lucroBrutoUnitarioAtual;
  const resultadoSemPromocao = lucroBrutoBase - capitalEmRiscoSemPromocao;

  const cenariosAvaliados = config.cenarios.map((scenario) => {
    const precoPromocional = precoVendaAtual * (1 - scenario.descontoPercentual / 100);
    const lucroBrutoUnitarioPromocional = precoPromocional - precoCusto;
    const margemPromocional = precoPromocional > 0
      ? (lucroBrutoUnitarioPromocional / precoPromocional) * 100
      : 0;
    const velocidadePromocional = vendaMediaDia * (1 + scenario.aumentoVelocidadePercentual / 100);
    const vendaPromocionalEstimada = Math.min(estoqueAtual, Math.floor(velocidadePromocional * diasDeSimulacao));
    const estoqueEstimadoComPromocao = Math.max(0, estoqueAtual - vendaPromocionalEstimada);
    const capitalEmRiscoComPromocao = estoqueEstimadoComPromocao * precoCusto;
    const reducaoRiscoValor = capitalEmRiscoSemPromocao - capitalEmRiscoComPromocao;
    const reducaoRiscoPercentual = capitalEmRiscoSemPromocao > 0
      ? (reducaoRiscoValor / capitalEmRiscoSemPromocao) * 100
      : 0;
    const receitaPromocional = vendaPromocionalEstimada * precoPromocional;
    const lucroBrutoPromocional = vendaPromocionalEstimada * lucroBrutoUnitarioPromocional;
    const resultadoComPromocao = lucroBrutoPromocional - capitalEmRiscoComPromocao;
    const ganhoIncremental = resultadoComPromocao - resultadoSemPromocao;

    const values = {
      preco_promocional: roundMoney(precoPromocional),
      margem_bruta_promocional_percentual: roundPercent(margemPromocional),
      lucro_bruto_unitario_promocional: roundMoney(lucroBrutoUnitarioPromocional),
      venda_promocional_estimada: vendaPromocionalEstimada,
      estoque_estimado_com_promocao: estoqueEstimadoComPromocao,
      capital_em_risco_estimado_com_promocao: roundMoney(capitalEmRiscoComPromocao),
      reducao_capital_risco_valor: roundMoney(reducaoRiscoValor),
      reducao_capital_risco_percentual: roundPercent(reducaoRiscoPercentual),
      receita_promocional_estimada: roundMoney(receitaPromocional),
      lucro_bruto_promocional: roundMoney(lucroBrutoPromocional),
      resultado_economico_estimado_com_promocao: roundMoney(resultadoComPromocao),
      ganho_economico_incremental: roundMoney(ganhoIncremental),
    };

    if (scenario.descontoPercentual > config.descontoMaximoPercentual) {
      return rejectScenario(scenario, 'Desconto acima do limite configurado.', values);
    }

    if (precoPromocional <= precoCusto) {
      return rejectScenario(scenario, 'Preço promocional ficaria abaixo ou igual ao custo.', values);
    }

    if (margemPromocional < config.margemMinimaPercentual) {
      return rejectScenario(scenario, 'Margem promocional abaixo da mínima configurada.', values);
    }

    if (vendaPromocionalEstimada <= vendaBaseEstimada) {
      return rejectScenario(scenario, 'Venda promocional estimada não supera a venda base.', values);
    }

    if (reducaoRiscoValor <= 0) {
      return rejectScenario(scenario, 'Promoção não reduz o capital em risco estimado.', values);
    }

    if (ganhoIncremental <= 0) {
      return rejectScenario(scenario, 'Ganho econômico incremental estimado não é positivo.', values);
    }

    const validScenario: PromotionSimulationScenario = {
      desconto_percentual: scenario.descontoPercentual,
      aumento_velocidade_percentual_estimado: scenario.aumentoVelocidadePercentual,
      ...values,
      valido: true,
    };

    if (hasInvalidNumber(validScenario)) {
      return rejectScenario(scenario, 'Cenário produziu número inválido.', values);
    }

    return validScenario;
  });

  const melhorCenario = chooseBestScenario(cenariosAvaliados);

  return {
    tipo: 'simulacao_promocao',
    aviso: SIMULATION_WARNING,
    disponivel: melhorCenario !== null,
    motivo_indisponibilidade: melhorCenario ? null : 'Nenhum cenário promocional estimado apresentou ganho econômico positivo.',
    preco_venda_atual: roundMoney(precoVendaAtual),
    preco_custo: roundMoney(precoCusto),
    estoque_atual: estoqueAtual,
    venda_media_dia: round(vendaMediaDia, 2),
    dias_de_simulacao: diasDeSimulacao,
    margem_bruta_atual_percentual: roundPercent(margemBrutaAtualPercentual),
    lucro_bruto_unitario_atual: roundMoney(lucroBrutoUnitarioAtual),
    capital_em_estoque: roundMoney(capitalEmEstoque),
    venda_base_estimada: vendaBaseEstimada,
    estoque_estimado_sem_promocao: estoqueEstimadoSemPromocao,
    capital_em_risco_estimado_sem_promocao: roundMoney(capitalEmRiscoSemPromocao),
    lucro_bruto_base: roundMoney(lucroBrutoBase),
    resultado_economico_estimado_sem_promocao: roundMoney(resultadoSemPromocao),
    melhor_cenario: melhorCenario,
    cenarios_avaliados: cenariosAvaliados,
  };
}
