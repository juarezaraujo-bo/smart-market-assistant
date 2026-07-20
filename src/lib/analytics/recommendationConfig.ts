export type RecommendationConfig = {
  coberturaCriticaRupturaDias: number;
  coberturaBaixaDias: number;
  coberturaExcessivaDias: number;
  coberturaMuitoExcessivaDias: number;
  diasSemVendaCriticos: number;
  vencimentoProximoDias: number;
  margemBaixaPercentual: number;
  quedaRelevantePercentual: number;
  crescimentoRelevantePercentual: number;
  capitalAltoPercentualProdutos: number;
  vendaAltaPercentualProdutos: number;
  simulacaoPromocao: PromotionSimulationConfig;
};

export type PromotionScenarioConfig = {
  descontoPercentual: number;
  aumentoVelocidadePercentual: number;
};

export type PromotionSimulationConfig = {
  margemMinimaPercentual: number;
  descontoMaximoPercentual: number;
  horizontePadraoDias: number;
  cenarios: PromotionScenarioConfig[];
};

export const defaultRecommendationConfig: RecommendationConfig = {
  coberturaCriticaRupturaDias: 7,
  coberturaBaixaDias: 15,
  coberturaExcessivaDias: 60,
  coberturaMuitoExcessivaDias: 90,
  diasSemVendaCriticos: 30,
  vencimentoProximoDias: 30,
  margemBaixaPercentual: 10,
  quedaRelevantePercentual: -20,
  crescimentoRelevantePercentual: 20,
  capitalAltoPercentualProdutos: 20,
  vendaAltaPercentualProdutos: 20,
  simulacaoPromocao: {
    margemMinimaPercentual: 10,
    descontoMaximoPercentual: 25,
    horizontePadraoDias: 30,
    cenarios: [
      { descontoPercentual: 5, aumentoVelocidadePercentual: 10 },
      { descontoPercentual: 10, aumentoVelocidadePercentual: 25 },
      { descontoPercentual: 15, aumentoVelocidadePercentual: 45 },
      { descontoPercentual: 20, aumentoVelocidadePercentual: 70 },
      { descontoPercentual: 25, aumentoVelocidadePercentual: 100 },
    ],
  },
};
