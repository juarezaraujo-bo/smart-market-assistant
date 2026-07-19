import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type AnalyticsProduct = {
  produto_id: string;
  nome: string | null;
  categoria: string | null;
  quantidade_vendida: number;
  estoque_atual: number;
  cobertura_dias: number | null;
  capital_estoque: number | null;
  tendencia_vendas: string;
};

type AnalyticsResponse = {
  total: number;
  produtos: AnalyticsProduct[];
};

type DemoCheck = {
  nome: string;
  validate: (product: AnalyticsProduct) => boolean;
  expected: string;
};

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
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

function findProduct(products: AnalyticsProduct[], name: string) {
  const normalizedTarget = normalizeName(name);
  return products.find((product) => normalizeName(product.nome).includes(normalizedTarget));
}

function assertUniqueProductIds(products: AnalyticsProduct[]) {
  const ids = new Set<string>();
  const duplicates = new Set<string>();

  for (const product of products) {
    if (ids.has(product.produto_id)) duplicates.add(product.produto_id);
    ids.add(product.produto_id);
  }

  if (duplicates.size > 0) {
    throw new Error(`Produtos duplicados na resposta: ${Array.from(duplicates).join(', ')}`);
  }
}

function validateDemoProducts(products: AnalyticsProduct[]) {
  const checks: DemoCheck[] = [
    {
      nome: 'Molho Premium 300g',
      expected: 'venda zero e estoque 24',
      validate: (product) => product.quantidade_vendida === 0 && product.estoque_atual === 24,
    },
    {
      nome: 'Esponja de Aco',
      expected: 'venda zero e estoque elevado',
      validate: (product) => product.quantidade_vendida === 0 && product.estoque_atual >= 20,
    },
    {
      nome: 'Iogurte Natural 170g',
      expected: 'tendencia de queda',
      validate: (product) => product.tendencia_vendas === 'queda',
    },
    {
      nome: 'Feijao 1kg',
      expected: 'tendencia de crescimento e estoque baixo',
      validate: (product) => product.tendencia_vendas === 'crescimento' && product.estoque_atual <= 5,
    },
    {
      nome: 'Energetico 269ml',
      expected: 'crescimento e baixa cobertura',
      validate: (product) => product.tendencia_vendas === 'crescimento' && (product.cobertura_dias ?? 999) <= 5,
    },
    {
      nome: 'Salgadinho 80g',
      expected: 'crescimento e estoque baixo',
      validate: (product) => product.tendencia_vendas === 'crescimento' && product.estoque_atual <= 5,
    },
    {
      nome: 'Cerveja Lata 350ml',
      expected: 'vendas altas',
      validate: (product) => product.quantidade_vendida >= 80,
    },
  ];

  return checks.map((check) => {
    const product = findProduct(products, check.nome);
    if (!product) return `${check.nome}: nao encontrado`;
    return `${check.nome}: ${check.validate(product) ? 'ok' : `conferir (${check.expected})`}`;
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

  const endpoint = new URL('/api/analytics/products', appUrl);
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

  const payload = (await response.json()) as AnalyticsResponse;
  assertUniqueProductIds(payload.produtos);

  if (payload.total !== 30) {
    throw new Error(`Total esperado de 30 produtos, recebido: ${payload.total}`);
  }

  if (hasInvalidNumber(payload)) {
    throw new Error('Resposta contem NaN, Infinity ou -Infinity.');
  }

  const topCapital = [...payload.produtos]
    .sort((a, b) => (b.capital_estoque ?? 0) - (a.capital_estoque ?? 0))
    .slice(0, 5)
    .map((product) => ({
      nome: product.nome,
      capital_estoque: product.capital_estoque,
      quantidade_vendida: product.quantidade_vendida,
      estoque_atual: product.estoque_atual,
      tendencia_vendas: product.tendencia_vendas,
      cobertura_dias: product.cobertura_dias,
    }));

  console.log(JSON.stringify({
    total: payload.total,
    produtos_unicos: payload.produtos.length,
    duplicidades: 0,
    numeros_invalidos: false,
    top_capital_estoque: topCapital,
    conferencia_demo: validateDemoProducts(payload.produtos),
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erro desconhecido na validacao analitica.';
  console.error(message);
  process.exitCode = 1;
});
