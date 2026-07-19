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
};
