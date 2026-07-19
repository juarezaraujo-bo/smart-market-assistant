import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type Recommendation = {
  produto_id: string;
  nome: string | null;
  prioridade_score: number;
  severidade: string;
  recomendacao_principal: string;
  acao_recomendada: string;
  diagnostico: string;
  impacto: string;
  metricas_relevantes: Record<string, number | string | null>;
};

type RecommendationsResponse = {
  total: number;
  resumo: {
    criticas: number;
    altas: number;
    medias: number;
    baixas: number;
    informativas: number;
    capital_em_risco: number;
  };
  recomendacoes: Recommendation[];
};

type DemoCheck = {
  nome: string;
  expected: string;
  validate: (recommendation: Recommendation) => boolean;
};

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

function normalizeName(value: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber);
  return false;
}

function assertUniqueProductIds(recommendations: Recommendation[]) {
  const ids = new Set<string>();
  const duplicates = new Set<string>();

  for (const recommendation of recommendations) {
    if (ids.has(recommendation.produto_id)) duplicates.add(recommendation.produto_id);
    ids.add(recommendation.produto_id);
  }

  if (duplicates.size > 0) {
    throw new Error(`Produtos duplicados na resposta: ${Array.from(duplicates).join(', ')}`);
  }
}

function findRecommendation(recommendations: Recommendation[], name: string) {
  const target = normalizeName(name);
  return recommendations.find((recommendation) => normalizeName(recommendation.nome).includes(target));
}

function validateDemoRecommendations(recommendations: Recommendation[]) {
  const checks: DemoCheck[] = [
    {
      nome: 'Molho Premium 300g',
      expected: 'SEM_VENDAS ou CAPITAL_PARADO, suspender reposicao, estoque 24 e capital 144',
      validate: (item) =>
        ['SEM_VENDAS', 'CAPITAL_PARADO'].includes(item.recomendacao_principal) &&
        item.acao_recomendada === 'SUSPENDER_REPOSICAO' &&
        item.metricas_relevantes.estoque_atual === 24 &&
        item.metricas_relevantes.capital_estoque === 144,
    },
    {
      nome: 'Bala Sortida 600g',
      expected: 'RISCO_VENCIMENTO, EXCESSO_ESTOQUE ou CAPITAL_PARADO, cobertura proxima de 190 dias, queda e acao compativel',
      validate: (item) =>
        ['RISCO_VENCIMENTO', 'EXCESSO_ESTOQUE', 'CAPITAL_PARADO'].includes(item.recomendacao_principal) &&
        Number(item.metricas_relevantes.cobertura_dias ?? 0) >= 170 &&
        item.metricas_relevantes.tendencia_vendas === 'queda' &&
        ['CRIAR_PROMOCAO', 'CRIAR_COMBO', 'SUSPENDER_REPOSICAO'].includes(item.acao_recomendada),
    },
    {
      nome: 'Cerveja Lata 350ml',
      expected: 'crescimento, cobertura proxima de 10 dias e sem excesso',
      validate: (item) =>
        item.recomendacao_principal !== 'EXCESSO_ESTOQUE' &&
        item.metricas_relevantes.tendencia_vendas === 'crescimento' &&
        Number(item.metricas_relevantes.cobertura_dias ?? 0) >= 7 &&
        Number(item.metricas_relevantes.cobertura_dias ?? 0) <= 15,
    },
    {
      nome: 'Maionese 500g',
      expected: 'RISCO_VENCIMENTO, EXCESSO_ESTOQUE ou QUEDA_VENDAS, cobertura proxima de 96 dias, queda e acao compativel',
      validate: (item) =>
        item.metricas_relevantes.tendencia_vendas === 'queda' &&
        Number(item.metricas_relevantes.cobertura_dias ?? 0) >= 90 &&
        ['RISCO_VENCIMENTO', 'EXCESSO_ESTOQUE', 'QUEDA_VENDAS'].includes(item.recomendacao_principal) &&
        ['CRIAR_PROMOCAO', 'CRIAR_COMBO', 'SUSPENDER_REPOSICAO', 'REVISAR_EXPOSICAO'].includes(item.acao_recomendada),
    },
    {
      nome: 'Farinha de Trigo 1kg',
      expected: 'queda, cobertura proxima de 82,5 dias e revisao de reposicao',
      validate: (item) =>
        item.metricas_relevantes.tendencia_vendas === 'queda' &&
        Number(item.metricas_relevantes.cobertura_dias ?? 0) >= 75 &&
        ['EXCESSO_ESTOQUE', 'CAPITAL_PARADO'].includes(item.recomendacao_principal),
    },
    {
      nome: 'Feijao 1kg',
      expected: 'crescimento, estoque baixo e reposicao',
      validate: (item) =>
        item.metricas_relevantes.tendencia_vendas === 'crescimento' &&
        Number(item.metricas_relevantes.estoque_atual ?? 999) <= 5 &&
        ['RISCO_RUPTURA', 'REPOSICAO_PRIORITARIA'].includes(item.recomendacao_principal),
    },
    {
      nome: 'Energetico 269ml',
      expected: 'crescimento, baixa cobertura e prioridade de reposicao',
      validate: (item) =>
        item.metricas_relevantes.tendencia_vendas === 'crescimento' &&
        Number(item.metricas_relevantes.cobertura_dias ?? 999) <= 15 &&
        ['RISCO_RUPTURA', 'REPOSICAO_PRIORITARIA'].includes(item.recomendacao_principal),
    },
    {
      nome: 'Esponja de Aco',
      expected: 'venda zero, estoque elevado e suspender reposicao',
      validate: (item) =>
        item.metricas_relevantes.quantidade_vendida === 0 &&
        Number(item.metricas_relevantes.estoque_atual ?? 0) >= 20 &&
        item.acao_recomendada === 'SUSPENDER_REPOSICAO',
    },
    {
      nome: 'Leite Integral',
      expected: 'nao pode ser RISCO_VENCIMENTO quando cobertura for menor que dias ate vencimento',
      validate: (item) =>
        !(
          item.recomendacao_principal === 'RISCO_VENCIMENTO' &&
          Number(item.metricas_relevantes.cobertura_dias ?? 0) < Number(item.metricas_relevantes.dias_ate_vencimento ?? 0)
        ),
    },
    {
      nome: 'Chocolate Barra',
      expected: 'nao pode ser RISCO_VENCIMENTO quando cobertura for menor que dias ate vencimento',
      validate: (item) =>
        !(
          item.recomendacao_principal === 'RISCO_VENCIMENTO' &&
          Number(item.metricas_relevantes.cobertura_dias ?? 0) < Number(item.metricas_relevantes.dias_ate_vencimento ?? 0)
        ),
    },
  ];

  return checks.map((check) => {
    const recommendation = findRecommendation(recommendations, check.nome);
    if (!recommendation) return `${check.nome}: nao encontrado`;
    return `${check.nome}: ${check.validate(recommendation) ? 'ok' : `conferir (${check.expected})`}`;
  });
}

async function main() {
  loadLocalEnv();

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const email = requireEnv('SMARTMARKET_VALIDATE_EMAIL');
  const password = requireEnv('SMARTMARKET_VALIDATE_PASSWORD');
  const appUrl = process.env.SMARTMARKET_APP_URL || 'http://localhost:3000';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message || 'Nao foi possivel autenticar no Supabase.');
  }

  const endpoint = new URL('/api/analytics/recommendations', appUrl);
  endpoint.searchParams.set('periodo_inicio', '2026-06-01');
  endpoint.searchParams.set('periodo_fim', '2026-06-30');
  endpoint.searchParams.set('limite', '100');

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API retornou HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as RecommendationsResponse;
  assertUniqueProductIds(payload.recomendacoes);

  if (payload.total !== 30) {
    throw new Error(`Total esperado de 30 recomendacoes, recebido: ${payload.total}`);
  }

  if (hasInvalidNumber(payload)) {
    throw new Error('Resposta contem NaN, Infinity ou -Infinity.');
  }

  console.log(JSON.stringify({
    total: payload.total,
    produtos_unicos: payload.recomendacoes.length,
    duplicidades: 0,
    numeros_invalidos: false,
    resumo: payload.resumo,
    top_10_prioridades: payload.recomendacoes.slice(0, 10).map((item) => ({
      nome: item.nome,
      prioridade_score: item.prioridade_score,
      severidade: item.severidade,
      recomendacao_principal: item.recomendacao_principal,
      acao_recomendada: item.acao_recomendada,
      capital_estoque: item.metricas_relevantes.capital_estoque,
      cobertura_dias: item.metricas_relevantes.cobertura_dias,
    })),
    conferencia_demo: validateDemoRecommendations(payload.recomendacoes),
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erro desconhecido na validacao de recomendacoes.';
  console.error(message);
  process.exitCode = 1;
});
