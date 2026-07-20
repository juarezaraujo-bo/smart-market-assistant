'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  analysisViewOptions,
  buildActionPlanImpact,
  buildReferenceOptions,
  formatMonthYear,
  getTrendDisplay,
  HISTORY_COMPLETE_KEY,
  type AnalysisView,
  type Periodo,
} from '@/lib/analytics/decisionPresentation';
import type {
  ProductRecommendation,
  RecommendationReason,
  RecommendationSeverity,
  RecommendationType,
  RecommendedAction,
} from '@/lib/analytics/productRecommendations';
import {
  filterRecommendationsByText,
  formatCoverageDays,
  formatCurrencyPtBr,
  formatNumberPtBr,
  formatPercentPtBr,
  getRecommendedActionLabel,
  getRecommendationTypeLabel,
  getSeverityLabel,
  getTrendLabel,
} from '@/lib/analytics/recommendationLabels';
import {
  buildAnalysisSummary,
  buildPromotionInsight,
  buildSalesProjectionSummary,
  formatSignedCurrencyPtBr,
  getPromotionUnavailableMessage,
} from '@/lib/analytics/promotionPresentation';


type RecommendationsSummary = {
  criticas: number;
  altas: number;
  medias: number;
  baixas: number;
  informativas: number;
  capital_em_risco: number;
};

type RecommendationsResponse = {
  total: number;
  periodo: {
    inicio: string | null;
    fim: string | null;
    historico_completo?: boolean;
  };
  resumo: RecommendationsSummary;
  recomendacoes: ProductRecommendation[];
  error?: string;
};

type PeriodsResponse = {
  periodos?: Periodo[];
  error?: string;
};

const severityOptions: RecommendationSeverity[] = ['critica', 'alta', 'media', 'baixa', 'informativa'];
const recommendationOptions: RecommendationType[] = [
  'RISCO_VENCIMENTO',
  'PRODUTO_VENCIDO',
  'SEM_VENDAS',
  'RISCO_RUPTURA',
  'EXCESSO_ESTOQUE',
  'CAPITAL_PARADO',
  'QUEDA_VENDAS',
  'REPOSICAO_PRIORITARIA',
  'CRESCIMENTO_VENDAS',
  'MARGEM_BAIXA',
  'MONITORAR',
];

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatPeriod(period: Periodo) {
  return `${formatDate(period.periodo_inicio)} a ${formatDate(period.periodo_fim)}`;
}

function metricNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeverityClass(severity: RecommendationSeverity) {
  if (severity === 'critica') return 'decision-badge decision-badge-danger';
  if (severity === 'alta') return 'decision-badge decision-badge-warning';
  if (severity === 'media') return 'decision-badge decision-badge-info';
  if (severity === 'baixa') return 'decision-badge decision-badge-muted';
  return 'decision-badge decision-badge-success';
}

function buildParams(filters: {
  selectedPeriod: string;
  severity: string;
  recommendation: string;
  category: string;
}) {
  const params = new URLSearchParams();
  const [periodoInicio, periodoFim] = filters.selectedPeriod.split('|');

  if (filters.selectedPeriod === HISTORY_COMPLETE_KEY) {
    params.set('historico', 'completo');
  } else if (periodoInicio && periodoFim) {
    params.set('periodo_inicio', periodoInicio);
    params.set('periodo_fim', periodoFim);
  }
  if (filters.severity) params.set('severidade', filters.severity);
  if (filters.recommendation) params.set('recomendacao', filters.recommendation);
  if (filters.category) params.set('categoria', filters.category);
  params.set('limite', '500');

  return params;
}

function MetricLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`decision-metric-line ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className={`decision-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PromotionCompact({ item }: { item: ProductRecommendation }) {
  const simulation = item.simulacao_promocao;
  const scenario = simulation?.melhor_cenario;

  if (!simulation || !scenario) return null;

  return (
    <div className="decision-promo-compact">
      <strong>Promoção sugerida</strong>
      <span>Preço atual: {formatCurrencyPtBr(simulation.preco_venda_atual)}</span>
      <span>Preço sugerido: {formatCurrencyPtBr(scenario.preco_promocional)}</span>
      <span className="promo-tone-discount">Desconto: {formatPercentPtBr(scenario.desconto_percentual)}</span>
      <span className="promo-tone-gain">
        Redução estimada do capital parado: {formatPercentPtBr(scenario.reducao_capital_risco_percentual)}
      </span>
    </div>
  );
}

function getPromotionResultLabel(item: ProductRecommendation) {
  const simulation = item.simulacao_promocao;
  if (!simulation) return null;
  if (simulation.melhor_cenario?.ganho_economico_incremental && simulation.melhor_cenario.ganho_economico_incremental > 0) {
    return 'Promoção recomendada';
  }
  if (simulation.motivo_indisponibilidade?.includes('vendas suficientes')) {
    return 'Simulação indisponível';
  }
  return 'Promoção não recomendada nas condições simuladas';
}

function getSavingsPerUnit(item: ProductRecommendation) {
  const simulation = item.simulacao_promocao;
  const scenario = simulation?.melhor_cenario;
  if (!simulation || !scenario) return null;
  if (simulation.preco_venda_atual === null || simulation.preco_venda_atual === undefined) return null;
  const savings = simulation.preco_venda_atual - scenario.preco_promocional;
  return Number.isFinite(savings) && savings > 0 ? savings : null;
}

function getMetricText(item: ProductRecommendation, key: string) {
  const value = item.metricas_relevantes[key];
  return typeof value === 'string' ? value : '';
}

function formatReliabilityLevel(value: string) {
  if (value === 'alta') return 'Alta';
  if (value === 'moderada') return 'Moderada';
  if (value === 'baixa') return 'Baixa';
  return 'Não estimada';
}

function formatImpactText(value: string) {
  return value.replace(/Cobertura estimada: ([\d.,]+) dias/g, (_, days: string) => {
    const parsed = Number(String(days).replace('.', '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return `Cobertura estimada: ${days} dias`;
    return `Cobertura estimada: ${formatCoverageDays(parsed)}`;
  });
}

function groupReasons(reasons: RecommendationReason[]) {
  const groups = {
    Validade: [] as RecommendationReason[],
    Vendas: [] as RecommendationReason[],
    Estoque: [] as RecommendationReason[],
    Outros: [] as RecommendationReason[],
  };

  for (const reason of reasons) {
    const text = `${reason.codigo} ${reason.campo || ''} ${reason.mensagem}`.toLowerCase();
    if (text.includes('validade') || text.includes('venc')) groups.Validade.push(reason);
    else if (text.includes('venda') || text.includes('tend')) groups.Vendas.push(reason);
    else if (text.includes('estoque') || text.includes('cobertura') || text.includes('capital')) groups.Estoque.push(reason);
    else groups.Outros.push(reason);
  }

  return Object.entries(groups).filter(([, items]) => items.length > 0);
}
export default function DecisionsPage() {
  const [periods, setPeriods] = useState<Periodo[]>([]);
  const [analysisView, setAnalysisView] = useState<AnalysisView>('historico');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [periodSummary, setPeriodSummary] = useState<RecommendationsSummary | null>(null);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [severity, setSeverity] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [category, setCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedRecommendation, setSelectedRecommendation] = useState<ProductRecommendation | null>(null);
  const [showFinancialDetails, setShowFinancialDetails] = useState(false);

  const categories = useMemo(() => {
    const unique = new Set(recommendations.map((item) => item.categoria).filter(Boolean) as string[]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [recommendations]);

  const referenceOptions = useMemo(
    () => buildReferenceOptions(analysisView, periods),
    [analysisView, periods]
  );

  const filteredRecommendations = useMemo(
    () => filterRecommendationsByText(recommendations, searchText),
    [recommendations, searchText]
  );

  const immediateActions = filteredRecommendations.slice(0, 5);
  const actionPlan = filteredRecommendations.slice(0, 3);

  const historyPeriodLabel = useMemo(() => {
    if (periods.length === 0) return '';
    const sorted = [...periods].sort((a, b) => {
      const startCompare = a.periodo_inicio.localeCompare(b.periodo_inicio);
      if (startCompare !== 0) return startCompare;
      return a.periodo_fim.localeCompare(b.periodo_fim);
    });
    return `${formatMonthYear(sorted[0].periodo_inicio)} até ${formatMonthYear(sorted[sorted.length - 1].periodo_fim)}`;
  }, [periods]);

  const historyMonthsLabel = useMemo(() => {
    if (periods.length === 0) return '';
    return `${periods.length} ${periods.length === 1 ? 'mês analisado' : 'meses analisados'}`;
  }, [periods]);

  const annualSummary = useMemo(() => {
    if (analysisView !== 'anual' || !selectedPeriod) return null;

    const [periodoInicio, periodoFim] = selectedPeriod.split('|');
    if (!periodoInicio || !periodoFim) return null;

    const availablePeriods = periods
      .filter((period) => period.periodo_inicio >= periodoInicio && period.periodo_fim <= periodoFim)
      .sort((a, b) => {
        const startCompare = a.periodo_inicio.localeCompare(b.periodo_inicio);
        if (startCompare !== 0) return startCompare;
        return a.periodo_fim.localeCompare(b.periodo_fim);
      });

    if (availablePeriods.length === 0) return null;

    const firstPeriod = availablePeriods[0];
    const lastPeriod = availablePeriods[availablePeriods.length - 1];
    const year = new Date(`${periodoFim}T00:00:00`).getUTCFullYear();
    const availableMonths = new Set(availablePeriods.map((period) => period.periodo_inicio.slice(0, 7))).size;

    return {
      title: `Acumulado de ${year}`,
      range: `${formatMonthYear(firstPeriod.periodo_inicio)} até ${formatMonthYear(lastPeriod.periodo_fim)}`,
      months: `${availableMonths} ${availableMonths === 1 ? 'mês analisado' : 'meses analisados'}`,
    };
  }, [analysisView, periods, selectedPeriod]);

  const selectedPeriodLabel = useMemo(() => {
    if (selectedPeriod === HISTORY_COMPLETE_KEY) return historyPeriodLabel || 'Histórico completo';
    const matchingOption = referenceOptions.find((option) => option.value === selectedPeriod);
    if (matchingOption) return matchingOption.label;
    const [periodoInicio, periodoFim] = selectedPeriod.split('|');
    if (!periodoInicio || !periodoFim) return 'Período selecionado';
    return formatPeriod({ periodo_inicio: periodoInicio, periodo_fim: periodoFim });
  }, [historyPeriodLabel, referenceOptions, selectedPeriod]);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setSessionExpired(true);
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    setSessionExpired(false);
    return session.access_token;
  }, []);

  const fetchRecommendations = useCallback(async (periodKey: string) => {
    if (!periodKey) return;

    setLoadingRecommendations(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      const params = buildParams({ selectedPeriod: periodKey, severity, recommendation, category });
      const response = await fetch(`/api/analytics/recommendations?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as RecommendationsResponse;

      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(payload.error || 'Erro ao carregar recomendações.');
      }

      setRecommendations(payload.recomendacoes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recomendações.');
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  }, [category, getAccessToken, recommendation, severity]);

  const fetchPeriodSummary = useCallback(async (periodKey: string) => {
    if (!periodKey) return;

    try {
      const accessToken = await getAccessToken();
      const params = buildParams({
        selectedPeriod: periodKey,
        severity: '',
        recommendation: '',
        category: '',
      });
      const response = await fetch(`/api/analytics/recommendations?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as RecommendationsResponse;

      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(payload.error || 'Erro ao carregar resumo do período.');
      }

      setPeriodSummary(payload.resumo);
      setPeriodTotal(payload.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo do período.');
      setPeriodSummary(null);
      setPeriodTotal(0);
    }
  }, [getAccessToken]);

  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/analytics/periods', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as PeriodsResponse;

      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(payload.error || 'Erro ao carregar períodos.');
      }

      const loadedPeriods = payload.periodos || [];
      setPeriods(loadedPeriods);
      if (loadedPeriods.length > 0) {
        setSelectedPeriod((current) => current || HISTORY_COMPLETE_KEY);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar períodos.');
      setPeriods([]);
    } finally {
      setLoadingPeriods(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPeriods();
  }, [fetchPeriods]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedPeriod) void fetchRecommendations(selectedPeriod);
  }, [fetchRecommendations, selectedPeriod]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedPeriod) void fetchPeriodSummary(selectedPeriod);
  }, [fetchPeriodSummary, selectedPeriod]);

  const clearFilters = () => {
    setSeverity('');
    setRecommendation('');
    setCategory('');
    setSearchText('');
  };

  const retry = () => {
    if (periods.length === 0) void fetchPeriods();
    else void fetchRecommendations(selectedPeriod);
  };

  const refreshData = () => {
    if (selectedPeriod) void fetchRecommendations(selectedPeriod);
  };

  const changeAnalysisView = (view: AnalysisView) => {
    setAnalysisView(view);
    if (view === 'historico') {
      setSelectedPeriod(HISTORY_COMPLETE_KEY);
      return;
    }
    setSelectedPeriod(buildReferenceOptions(view, periods)[0]?.value || '');
  };

  const openRecommendation = (item: ProductRecommendation) => {
    setShowFinancialDetails(false);
    setSelectedRecommendation(item);
  };

  return (
    <div className="animate-fade decision-page">
      <header className="decision-header">
        <div>
          <h1>Painel de Decisões</h1>
          <p>Prioridades e recomendações geradas a partir do desempenho real dos produtos.</p>
        </div>
        {error ? (
          <button className="btn btn-outline" onClick={retry} disabled={loadingPeriods || loadingRecommendations}>
            {loadingPeriods || loadingRecommendations ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Tentar novamente
          </button>
        ) : periods.length > 0 ? (
          <button className="btn btn-outline" onClick={refreshData} disabled={!selectedPeriod || loadingRecommendations}>
            {loadingRecommendations ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Atualizar dados
          </button>
        ) : null}
      </header>

      {error && (
        <div className="decision-alert error">
          <XCircle size={18} />
          <span>{sessionExpired ? 'Sessão expirada. Acesse novamente para continuar.' : error}</span>
        </div>
      )}

      {loadingPeriods ? (
        <div className="decision-empty">
          <Loader2 className="animate-spin" size={24} />
          Carregando períodos disponíveis...
        </div>
      ) : periods.length === 0 ? (
        <div className="decision-empty">
          <AlertTriangle size={24} />
          Nenhum período encontrado para análise.
        </div>
      ) : (
        <>
          <section className="decision-filters card">
            <div className="decision-filter-title">
              <SlidersHorizontal size={18} />
              Filtros
            </div>
            <label>
              Visão da análise
              <select value={analysisView} onChange={(event) => changeAnalysisView(event.target.value as AnalysisView)}>
                {analysisViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {analysisView !== 'historico' && (
              <label>
                Período de referência
                <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
                  {referenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Categoria
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Todas</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Severidade
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="">Todas</option>
                {severityOptions.map((item) => (
                  <option key={item} value={item}>{getSeverityLabel(item)}</option>
                ))}
              </select>
            </label>
            <label>
              Recomendação
              <select value={recommendation} onChange={(event) => setRecommendation(event.target.value)}>
                <option value="">Todas</option>
                {recommendationOptions.map((item) => (
                  <option key={item} value={item}>{getRecommendationTypeLabel(item)}</option>
                ))}
              </select>
            </label>
            <label className="decision-search">
              Produto
              <span>
                <Search size={16} />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Buscar produto"
                />
              </span>
            </label>
            <button className="btn btn-outline" onClick={clearFilters}>
              <Filter size={16} />
              Limpar filtros
            </button>
          </section>

          {loadingRecommendations ? (
            <div className="decision-empty">
              <Loader2 className="animate-spin" size={24} />
              Atualizando recomendações...
            </div>
          ) : (
            <>
              <section className="decision-summary-grid">
                <div className="decision-summary-title">
                  <strong>Resumo do período selecionado</strong>
                  {annualSummary ? (
                    <span>
                      {annualSummary.title}
                      <small>Dados disponíveis: {annualSummary.range}</small>
                      <small>{annualSummary.months}</small>
                    </span>
                  ) : selectedPeriod === HISTORY_COMPLETE_KEY && historyPeriodLabel ? (
                    <span>
                      Histórico analisado: {historyPeriodLabel}
                      {historyMonthsLabel ? <small>{historyMonthsLabel}</small> : null}
                    </span>
                  ) : null}
                </div>
                <SummaryCard label="Críticas" value={periodSummary?.criticas ?? 0} tone="danger" />
                <SummaryCard label="Altas" value={periodSummary?.altas ?? 0} tone="warning" />
                <SummaryCard label="Médias" value={periodSummary?.medias ?? 0} tone="info" />
                <SummaryCard label="Capital estimado parado" value={formatCurrencyPtBr(periodSummary?.capital_em_risco ?? 0)} tone="success" />
                <SummaryCard label="Produtos analisados" value={periodTotal} tone="muted" />
              </section>

              <section className="decision-section">
                <div className="decision-section-heading">
                  <h2>Por onde começar</h2>
                  <span>{actionPlan.length} prioridades da visão selecionada</span>
                </div>
                {actionPlan.length === 0 ? (
                  <div className="decision-empty">Nenhuma prioridade encontrada para o filtro atual.</div>
                ) : (
                  <div className="decision-priority-list">
                    {actionPlan.map((item, index) => (
                      <button
                        key={item.produto_id}
                        className="decision-priority-item card"
                        onClick={() => openRecommendation(item)}
                      >
                        <span className="decision-priority-rank">Prioridade {index + 1}</span>
                        <strong>{item.nome || 'produto não identificado'}</strong>
                        <span>{getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</span>
                        <small>{buildActionPlanImpact(item)}</small>
                        <em>Abrir detalhes</em>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="decision-section">
                <div className="decision-section-heading">
                  <h2>Ações imediatas</h2>
                  <span>{immediateActions.length} principais prioridades</span>
                </div>
                {immediateActions.length === 0 ? (
                  <div className="decision-empty">Nenhuma recomendação encontrada para o filtro atual.</div>
                ) : (
                  <div className="decision-action-grid">
                    {immediateActions.map((item) => (
                      <button
                        key={item.produto_id}
                        className="decision-action-card card"
                        onClick={() => openRecommendation(item)}
                      >
                        <div className="decision-card-top">
                          <div>
                            <h3>{item.nome || 'Produto não identificado'}</h3>
                            <span>{item.categoria || 'Sem categoria'}</span>
                          </div>
                          <span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)} · Score {item.prioridade_score}</span>
                        </div>
                        <p><strong>Diagnóstico:</strong> {item.diagnostico}</p>
                        <p><strong>Impacto:</strong> {formatImpactText(item.impacto)}</p>
                        <p><strong>Ação:</strong> {getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</p>
                        <PromotionCompact item={item} />
                        <div className="decision-mini-metrics">
                          <span>{formatCurrencyPtBr(metricNumber(item.metricas_relevantes.capital_estoque))}</span>
                          <span>{formatCoverageDays(metricNumber(item.metricas_relevantes.cobertura_dias))}</span>
                          <span>{getTrendDisplay(item) || getTrendLabel(item.metricas_relevantes.tendencia_vendas_detalhada || item.metricas_relevantes.tendencia_vendas)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="decision-section">
                <div className="decision-section-heading">
                  <h2>Lista completa</h2>
                  <span>{filteredRecommendations.length} recomendações</span>
                </div>
                {filteredRecommendations.length === 0 ? (
                  <div className="decision-empty">Nenhuma recomendação encontrada para o filtro atual.</div>
                ) : (
                  <>
                    <div className="decision-table-wrap card">
                      <table className="decision-table">
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Categoria</th>
                            <th>Prioridade</th>
                            <th>Severidade</th>
                            <th>Diagnóstico</th>
                            <th>Ação recomendada</th>
                            <th>Capital</th>
                            <th>Estoque dura</th>
                            <th>Tendência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecommendations.map((item) => (
                            <tr key={item.produto_id} onClick={() => openRecommendation(item)}>
                              <td>{item.nome || 'Produto não identificado'}</td>
                              <td>{item.categoria || 'Sem categoria'}</td>
                              <td>{item.prioridade_score}</td>
                              <td><span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)}</span></td>
                              <td>{item.diagnostico}</td>
                              <td>{getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</td>
                              <td>{formatCurrencyPtBr(metricNumber(item.metricas_relevantes.capital_estoque))}</td>
                              <td>{formatCoverageDays(metricNumber(item.metricas_relevantes.cobertura_dias))}</td>
                              <td>{getTrendDisplay(item) || getTrendLabel(item.metricas_relevantes.tendencia_vendas_detalhada || item.metricas_relevantes.tendencia_vendas)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="decision-mobile-list">
                      {filteredRecommendations.map((item) => (
                        <button key={item.produto_id} className="decision-mobile-card card" onClick={() => openRecommendation(item)}>
                          <div>
                            <strong>{item.nome || 'Produto não identificado'}</strong>
                            <span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)} · {item.prioridade_score}</span>
                          </div>
                          <p>{item.diagnostico}</p>
                          <p>Tendência: {getTrendDisplay(item) || getTrendLabel(item.metricas_relevantes.tendencia_vendas_detalhada || item.metricas_relevantes.tendencia_vendas)}</p>
                          <small>{getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}

      {selectedRecommendation && (
        <div className="decision-modal-backdrop" onClick={() => setSelectedRecommendation(null)}>
          <div className="decision-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="decision-modal-header">
              <div>
                <h2>{selectedRecommendation.nome || 'Produto não identificado'}</h2>
                <span>{selectedRecommendation.categoria || 'Sem categoria'}</span>
              </div>
              <button className="btn btn-outline" onClick={() => setSelectedRecommendation(null)}>Fechar</button>
            </div>
            <div className="decision-modal-body">
              <section>
                <span className={getSeverityClass(selectedRecommendation.severidade)}>
                  {getSeverityLabel(selectedRecommendation.severidade)} · Score {selectedRecommendation.prioridade_score}
                </span>
                <h3>{getRecommendationTypeLabel(selectedRecommendation.recomendacao_principal as RecommendationType)}</h3>
                <p>{selectedRecommendation.diagnostico}</p>
                <p>{formatImpactText(selectedRecommendation.impacto)}</p>
                <p><strong>Ação recomendada:</strong> {getRecommendedActionLabel(selectedRecommendation.acao_recomendada as RecommendedAction)}</p>
                <div className="decision-detail-grid">
                  <MetricLine
                    label="Confiabilidade da análise"
                    value={`${formatReliabilityLevel(getMetricText(selectedRecommendation, 'confiabilidade_nivel'))} - ${getMetricText(selectedRecommendation, 'confiabilidade_mensagem') || 'Sem mensagem disponível'}`}
                  />
                  {getPromotionResultLabel(selectedRecommendation) ? (
                    <MetricLine label="Resultado da recomendação" value={getPromotionResultLabel(selectedRecommendation) || ''} tone="promo-gain" />
                  ) : null}
                </div>
              </section>

              {selectedRecommendation.simulacao_promocao && (
                <section className="decision-analysis-summary">
                  <h3>Resumo da análise</h3>
                  <p>{buildAnalysisSummary(selectedRecommendation.simulacao_promocao)}</p>
                </section>
              )}

              <section className="decision-sales-story">
                <h3>Como este produto está vendendo?</h3>
                {(() => {
                  const summary = buildSalesProjectionSummary(selectedRecommendation, selectedPeriodLabel);
                  return (
                    <>
                      <div className="decision-story-block">
                        <h4>Histórico de vendas</h4>
                        <div className="decision-story-grid">
                          <MetricLine label="Histórico analisado" value={summary.historico.intervalo} />
                          <MetricLine label="Duração" value={summary.historico.duracao} />
                          <MetricLine label="Vendas realizadas no histórico" value={summary.historico.vendasRealizadas} />
                          <MetricLine label="Média mensal aproximada" value={summary.historico.mediaMensal} />
                        </div>
                      </div>
                      <div className="decision-story-block">
                        <h4>Projeção até o vencimento</h4>
                        <div className="decision-story-grid">
                          <MetricLine label="Dias restantes até o vencimento" value={summary.projecao.diasAteVencimento} />
                          <MetricLine label="Mantendo o ritmo atual, devem ser vendidas" value={summary.projecao.vendaEstimada} />
                          <MetricLine label="Estoque estimado restante" value={summary.projecao.estoqueRestante} />
                          <MetricLine label="Capital que pode permanecer parado" value={summary.projecao.capitalParado} tone="promo-risk" />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>

              {selectedRecommendation.simulacao_promocao && (
                <section className="decision-promo-section">
                  <h3>Simulação de promoção</h3>
                  <div className="decision-promo-insight">
                    {buildPromotionInsight(selectedRecommendation.simulacao_promocao)}
                  </div>
                  <p>
                    Simulação baseada no histórico recente de vendas e em parâmetros estimados.
                    O resultado real pode variar conforme a resposta dos clientes.
                  </p>
                  {selectedRecommendation.simulacao_promocao.melhor_cenario ? (
                    <>
                      <div className="decision-simulation-story">
                        <div className="decision-story-block">
                          <h4>Se nada for feito</h4>
                          <MetricLine label="Venda estimada antes do vencimento" value={formatNumberPtBr(selectedRecommendation.simulacao_promocao.venda_base_estimada, ' un')} />
                          <MetricLine label="Estoque estimado restante" value={formatNumberPtBr(selectedRecommendation.simulacao_promocao.estoque_estimado_sem_promocao, ' un')} />
                          <MetricLine label="Capital que pode permanecer parado" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.capital_em_risco_estimado_sem_promocao)} tone="promo-risk" />
                        </div>
                        <div className="decision-story-block promotion">
                          <h4>Se a promoção for realizada</h4>
                          <MetricLine label="Preço atual" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.preco_venda_atual)} />
                          <MetricLine label="Preço sugerido" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.preco_promocional)} tone="promo-revenue" />
                          <MetricLine label="Economia para o cliente" value={`${formatCurrencyPtBr(getSavingsPerUnit(selectedRecommendation))} por unidade`} tone="promo-revenue" />
                          <MetricLine label="Desconto estimado" value={formatPercentPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.desconto_percentual)} tone="promo-discount" />
                          <MetricLine label="Venda potencial antes do vencimento" value={formatNumberPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.venda_promocional_estimada, ' un')} />
                          <MetricLine label="Estoque restante estimado" value={formatNumberPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.estoque_estimado_com_promocao, ' un')} />
                          <MetricLine label="Capital que pode permanecer parado" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.capital_em_risco_estimado_com_promocao)} tone="promo-risk" />
                          <MetricLine
                            label="Redução estimada do capital parado"
                            value={`${formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.reducao_capital_risco_valor)} (${formatPercentPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.reducao_capital_risco_percentual)})`}
                            tone="promo-gain"
                          />
                        </div>
                      </div>
                      <p className="decision-price-rationale">
                        Este desconto foi selecionado por apresentar o melhor equilíbrio estimado entre redução do estoque parado,
                        preservação da margem e resultado financeiro.
                      </p>
                      <button
                        className="btn btn-outline decision-financial-toggle"
                        onClick={() => setShowFinancialDetails((current) => !current)}
                      >
                        {showFinancialDetails ? 'Ocultar detalhes financeiros' : 'Ver detalhes financeiros'}
                      </button>
                      {showFinancialDetails && (
                        <div className="decision-detail-grid">
                          <MetricLine label="Margem atual" value={formatPercentPtBr(selectedRecommendation.simulacao_promocao.margem_bruta_atual_percentual)} />
                          <MetricLine label="Margem na promoção" value={formatPercentPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.margem_bruta_promocional_percentual)} />
                          <MetricLine label="Lucro bruto estimado sem promoção" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.lucro_bruto_base)} />
                          <MetricLine label="Lucro bruto estimado com promoção" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.lucro_bruto_promocional)} />
                          <MetricLine label="Resultado econômico estimado sem promoção" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.resultado_economico_estimado_sem_promocao)} />
                          <MetricLine label="Resultado econômico estimado com promoção" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.resultado_economico_estimado_com_promocao)} />
                          <MetricLine label="Impacto financeiro estimado" value={formatSignedCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.ganho_economico_incremental)} tone="promo-gain" />
                          <MetricLine label="Receita potencial estimada" value={formatCurrencyPtBr(selectedRecommendation.simulacao_promocao.melhor_cenario.receita_promocional_estimada)} tone="promo-revenue" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="decision-promo-unavailable">
                      {getPromotionUnavailableMessage(selectedRecommendation.simulacao_promocao)}
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3>Justificativas</h3>
                <div className="decision-reason-groups">
                  {groupReasons(selectedRecommendation.justificativas).map(([group, reasons]) => (
                    <div key={group}>
                      <h4>{group}</h4>
                      <ul className="decision-reasons">
                        {reasons.map((reason: RecommendationReason) => (
                          <li key={`${reason.codigo}-${reason.campo || 'geral'}`}>
                            <CheckCircle2 size={16} />
                            <span>{reason.mensagem}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
              <section className="decision-detail-grid">
                <MetricLine label="Quantidade vendida" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.quantidade_vendida))} />
                <MetricLine label="Estoque atual" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.estoque_atual), ' un')} />
                <MetricLine label="Capital em estoque" value={formatCurrencyPtBr(metricNumber(selectedRecommendation.metricas_relevantes.capital_estoque))} />
                <MetricLine label="Estoque dura" value={formatCoverageDays(metricNumber(selectedRecommendation.metricas_relevantes.cobertura_dias))} />
                <MetricLine label="Variação de vendas" value={formatPercentPtBr(metricNumber(selectedRecommendation.metricas_relevantes.variacao_vendas_percentual))} />
                <MetricLine label="Tendência" value={getTrendDisplay(selectedRecommendation) || getTrendLabel(selectedRecommendation.metricas_relevantes.tendencia_vendas_detalhada || selectedRecommendation.metricas_relevantes.tendencia_vendas)} />
                <MetricLine label="Dias sem venda" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.dias_sem_venda), ' dias')} />
                <MetricLine label="Dias até vencimento" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.dias_ate_vencimento), ' dias')} />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
