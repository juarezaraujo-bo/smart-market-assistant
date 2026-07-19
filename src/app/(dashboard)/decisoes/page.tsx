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

type Periodo = {
  periodo_inicio: string;
  periodo_fim: string;
};

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

  if (periodoInicio && periodoFim) {
    params.set('periodo_inicio', periodoInicio);
    params.set('periodo_fim', periodoFim);
  }
  if (filters.severity) params.set('severidade', filters.severity);
  if (filters.recommendation) params.set('recomendacao', filters.recommendation);
  if (filters.category) params.set('categoria', filters.category);
  params.set('limite', '500');

  return params;
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="decision-metric-line">
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

export default function DecisionsPage() {
  const [periods, setPeriods] = useState<Periodo[]>([]);
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

  const categories = useMemo(() => {
    const unique = new Set(recommendations.map((item) => item.categoria).filter(Boolean) as string[]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [recommendations]);

  const filteredRecommendations = useMemo(
    () => filterRecommendationsByText(recommendations, searchText),
    [recommendations, searchText]
  );

  const immediateActions = filteredRecommendations.slice(0, 5);

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
        const latest = `${loadedPeriods[0].periodo_inicio}|${loadedPeriods[0].periodo_fim}`;
        setSelectedPeriod((current) => current || latest);
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
              Período
              <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
                {periods.map((period) => {
                  const value = `${period.periodo_inicio}|${period.periodo_fim}`;
                  return (
                    <option key={value} value={value}>
                      {formatPeriod(period)}
                    </option>
                  );
                })}
              </select>
            </label>
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
                <div className="decision-summary-title">Resumo do período selecionado</div>
                <SummaryCard label="Críticas" value={periodSummary?.criticas ?? 0} tone="danger" />
                <SummaryCard label="Altas" value={periodSummary?.altas ?? 0} tone="warning" />
                <SummaryCard label="Médias" value={periodSummary?.medias ?? 0} tone="info" />
                <SummaryCard label="Capital em risco" value={formatCurrencyPtBr(periodSummary?.capital_em_risco ?? 0)} tone="success" />
                <SummaryCard label="Produtos analisados" value={periodTotal} tone="muted" />
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
                        onClick={() => setSelectedRecommendation(item)}
                      >
                        <div className="decision-card-top">
                          <div>
                            <h3>{item.nome || 'Produto não identificado'}</h3>
                            <span>{item.categoria || 'Sem categoria'}</span>
                          </div>
                          <span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)} · Score {item.prioridade_score}</span>
                        </div>
                        <p><strong>Diagnóstico:</strong> {item.diagnostico}</p>
                        <p><strong>Impacto:</strong> {item.impacto}</p>
                        <p><strong>Ação:</strong> {getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</p>
                        <div className="decision-mini-metrics">
                          <span>{formatCurrencyPtBr(metricNumber(item.metricas_relevantes.capital_estoque))}</span>
                          <span>{formatCoverageDays(metricNumber(item.metricas_relevantes.cobertura_dias))}</span>
                          <span>{getTrendLabel(item.metricas_relevantes.tendencia_vendas)}</span>
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
                            <th>Cobertura</th>
                            <th>Tendência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecommendations.map((item) => (
                            <tr key={item.produto_id} onClick={() => setSelectedRecommendation(item)}>
                              <td>{item.nome || 'Produto não identificado'}</td>
                              <td>{item.categoria || 'Sem categoria'}</td>
                              <td>{item.prioridade_score}</td>
                              <td><span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)}</span></td>
                              <td>{item.diagnostico}</td>
                              <td>{getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}</td>
                              <td>{formatCurrencyPtBr(metricNumber(item.metricas_relevantes.capital_estoque))}</td>
                              <td>{formatCoverageDays(metricNumber(item.metricas_relevantes.cobertura_dias))}</td>
                              <td>{getTrendLabel(item.metricas_relevantes.tendencia_vendas)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="decision-mobile-list">
                      {filteredRecommendations.map((item) => (
                        <button key={item.produto_id} className="decision-mobile-card card" onClick={() => setSelectedRecommendation(item)}>
                          <div>
                            <strong>{item.nome || 'Produto não identificado'}</strong>
                            <span className={getSeverityClass(item.severidade)}>{getSeverityLabel(item.severidade)} · {item.prioridade_score}</span>
                          </div>
                          <p>{item.diagnostico}</p>
                          <p>Tendência: {getTrendLabel(item.metricas_relevantes.tendencia_vendas)}</p>
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
                <p>{selectedRecommendation.impacto}</p>
                <p><strong>Ação recomendada:</strong> {getRecommendedActionLabel(selectedRecommendation.acao_recomendada as RecommendedAction)}</p>
              </section>
              <section>
                <h3>Justificativas</h3>
                <ul className="decision-reasons">
                  {selectedRecommendation.justificativas.map((reason: RecommendationReason) => (
                    <li key={`${reason.codigo}-${reason.campo || 'geral'}`}>
                      <CheckCircle2 size={16} />
                      <span>{reason.mensagem}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="decision-detail-grid">
                <MetricLine label="Quantidade vendida" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.quantidade_vendida))} />
                <MetricLine label="Estoque atual" value={formatNumberPtBr(metricNumber(selectedRecommendation.metricas_relevantes.estoque_atual), ' un')} />
                <MetricLine label="Capital em estoque" value={formatCurrencyPtBr(metricNumber(selectedRecommendation.metricas_relevantes.capital_estoque))} />
                <MetricLine label="Cobertura" value={formatCoverageDays(metricNumber(selectedRecommendation.metricas_relevantes.cobertura_dias))} />
                <MetricLine label="Margem" value={formatPercentPtBr(metricNumber(selectedRecommendation.metricas_relevantes.margem_percentual))} />
                <MetricLine label="Variação de vendas" value={formatPercentPtBr(metricNumber(selectedRecommendation.metricas_relevantes.variacao_vendas_percentual))} />
                <MetricLine label="Tendência" value={getTrendLabel(selectedRecommendation.metricas_relevantes.tendencia_vendas)} />
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
