import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantOpenAITools,
  consultarProdutoSchema,
  consultarRecomendacoesSchema,
} from '../src/lib/assistant/assistantToolSchemas';
import {
  consultarProduto,
  consultarRecomendacoes,
  compararProdutoPeriodos,
  listarPeriodos,
} from '../src/lib/assistant/assistantTools';
import { runSmartMarketAssistant } from '../src/lib/assistant/assistantOrchestrator';
import { splitTelegramMessage } from '../src/lib/assistant/telegramMessageFormatter';
import { formatFallbackRecommendationsMessage } from '../src/lib/assistant/assistantPresentation';
import type { ProductRecommendation } from '../src/lib/analytics/productRecommendations';

type QueryResult = {
  data: unknown[];
  error: null;
};

class QueryBuilder {
  private rows: unknown[];

  constructor(rows: unknown[]) {
    this.rows = rows;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => (row as Record<string, unknown>)[column] === value);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.rows = [...this.rows].sort((a, b) => {
      const left = String((a as Record<string, unknown>)[column] || '');
      const right = String((b as Record<string, unknown>)[column] || '');
      const compare = left.localeCompare(right);
      return options.ascending ? compare : -compare;
    });
    return this;
  }

  then(resolve: (value: QueryResult) => void) {
    resolve({ data: this.rows, error: null });
  }
}

function createSupabaseMock(rows: unknown[]) {
  return {
    from(table: string) {
      assert.equal(table, 'produto_periodos');
      return new QueryBuilder(rows);
    },
  };
}

const rows = [
  {
    id: 'pp-1',
    cliente_id: 'cliente-1',
    produto_id: 'bala',
    periodo_inicio: '2026-05-01',
    periodo_fim: '2026-05-31',
    quantidade_vendida: 1,
    estoque_atual: 190,
    preco_custo: 0.69,
    preco_venda: 1.5,
    ultima_venda: '2026-05-10',
    data_validade: '2026-07-20',
    produtos: { nome: 'Bala Sortida 600g', categoria: 'Doces' },
  },
  {
    id: 'pp-2',
    cliente_id: 'cliente-1',
    produto_id: 'bala',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 1,
    estoque_atual: 190,
    preco_custo: 0.69,
    preco_venda: 1.5,
    ultima_venda: '2026-06-10',
    data_validade: '2026-07-10',
    produtos: { nome: 'Bala Sortida 600g', categoria: 'Doces' },
  },
  {
    id: 'pp-3',
    cliente_id: 'cliente-1',
    produto_id: 'molho',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 0,
    estoque_atual: 24,
    preco_custo: 6,
    preco_venda: 9.99,
    ultima_venda: '2026-05-20',
    data_validade: '2026-12-01',
    produtos: { nome: 'Molho Premium 300g', categoria: 'Mercearia' },
  },
  {
    id: 'pp-4',
    cliente_id: 'cliente-1',
    produto_id: 'maionese',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 1,
    estoque_atual: 96,
    preco_custo: 4,
    preco_venda: 8.99,
    ultima_venda: '2026-06-08',
    data_validade: '2026-07-10',
    produtos: { nome: 'Maionese 500g', categoria: 'Mercearia' },
  },
  {
    id: 'pp-5',
    cliente_id: 'cliente-1',
    produto_id: 'iogurte',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 1,
    estoque_atual: 180,
    preco_custo: 2.1,
    preco_venda: 4.99,
    ultima_venda: '2026-06-05',
    data_validade: '2026-07-10',
    produtos: { nome: 'Iogurte Natural 170g', categoria: 'Laticínios' },
  },
  {
    id: 'pp-6',
    cliente_id: 'cliente-1',
    produto_id: 'esponja',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 0,
    estoque_atual: 60,
    preco_custo: 1.2,
    preco_venda: 2.5,
    ultima_venda: '2026-05-01',
    data_validade: '2027-01-01',
    produtos: { nome: 'Esponja de Aco', categoria: 'Limpeza' },
  },
  {
    id: 'pp-7',
    cliente_id: 'cliente-1',
    produto_id: 'molho-extra',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 2,
    estoque_atual: 8,
    preco_custo: 4,
    preco_venda: 7,
    ultima_venda: '2026-06-12',
    data_validade: '2026-12-01',
    produtos: { nome: 'Molho Especial', categoria: 'Mercearia' },
  },
];

function context() {
  return {
    clienteId: 'cliente-1',
    supabase: createSupabaseMock(rows) as never,
  };
}

test('schemas das ferramentas nao aceitam cliente_id do modelo', () => {
  for (const tool of assistantOpenAITools) {
    assert.equal(Object.hasOwn(tool.parameters.properties, 'cliente_id'), false);
  }
});

test('schema rejeita limite acima de 20', () => {
  assert.throws(() => consultarRecomendacoesSchema.parse({ limite: 21 }));
});

test('schema rejeita data invalida', () => {
  assert.throws(() => consultarProdutoSchema.parse({ produto: 'bala', periodo_inicio: '06/2026' }));
});

test('schema rejeita enum invalido', () => {
  assert.throws(() => consultarRecomendacoesSchema.parse({ severidade: 'urgente' }));
});

test('schema rejeita parametros desconhecidos', () => {
  assert.throws(() => consultarProdutoSchema.parse({ produto: 'bala', executar_sql: true }));
});

test('listar_periodos retorna periodo mais recente', async () => {
  const result = await listarPeriodos(context());
  assert.equal(result.periodo_mais_recente?.periodo_inicio, '2026-06-01');
  assert.equal(result.periodos.length, 2);
});

test('consultar_recomendacoes limita retorno a 20 itens', async () => {
  const result = await consultarRecomendacoes(context(), { limite: 20 });
  assert.ok(result.recomendacoes.length <= 20);
  assert.equal(result.periodo?.periodo_fim, '2026-06-30');
});

test('consultar_produto encontra produto por nome parcial sem acento', async () => {
  const result = await consultarProduto(context(), { produto: 'bala sortida' });
  assert.equal(result.status, 'found');
  if (result.status === 'found') {
    assert.equal(result.produto.nome, 'Bala Sortida 600g');
  }
});

test('consultar_produto nao escolhe arbitrariamente multiplas correspondencias', async () => {
  const result = await consultarProduto(context(), { produto: 'molho' });
  assert.equal(result.status, 'multiple_matches');
  if (result.status === 'multiple_matches') {
    assert.equal(result.matches.length, 2);
  }
});

test('consultar_produto retorna not_found para produto inexistente', async () => {
  const result = await consultarProduto(context(), { produto: 'produto inexistente' });
  assert.equal(result.status, 'not_found');
});

test('comparar_produto_periodos usa periodo anterior quando nao informado', async () => {
  const result = await compararProdutoPeriodos(context(), { produto: 'bala' });
  assert.equal(result.status, 'ok');
  assert.ok(result.periodo_atual);
  assert.ok(result.periodo_anterior);
  assert.equal(result.periodo_atual.periodo_inicio, '2026-06-01');
  assert.equal(result.periodo_anterior.periodo_inicio, '2026-05-01');
});

test('splitTelegramMessage divide mensagem longa sem ultrapassar limite', () => {
  const text = Array.from({ length: 120 }, (_, index) => `Linha ${index} com conteudo do SmartMarket.`).join('\n');
  const parts = splitTelegramMessage(text, 300);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 300));
});

test('splitTelegramMessage preserva mensagens curtas', () => {
  assert.deepEqual(splitTelegramMessage('Resumo curto'), ['Resumo curto']);
});

test('resposta das ferramentas nao contem NaN ou Infinity', async () => {
  const result = await consultarRecomendacoes(context(), { limite: 10 });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('NaN'), false);
  assert.equal(serialized.includes('Infinity'), false);
});

test('tentativa textual de SQL permanece apenas como argumento rejeitado por schema', () => {
  assert.throws(() => consultarProdutoSchema.parse({ produto: 'bala', sql: 'select * from produtos' }));
});

test('fallback deterministico traduz codigos tecnicos de acao', async () => {
  const previousAiFlag = process.env.SMARTMARKET_AI_ENABLED;
  const previousWarn = console.warn;
  process.env.SMARTMARKET_AI_ENABLED = 'false';
  console.warn = () => undefined;

  try {
    const result = await runSmartMarketAssistant({
      clienteId: 'cliente-1',
      chatId: 'validation:test',
      userText: 'Quais sao as maiores prioridades deste mes?',
      marketName: 'Mercado da TIA',
      supabase: createSupabaseMock(rows) as never,
    });

    assert.equal(result.usedFallback, true);
    assert.equal(result.message.includes('Prioridades do Mercado da TIA'), true);
    assert.equal(result.message.includes('Período: Junho de 2026'), true);
    assert.equal(result.message.includes('Bala Sortida 600g'), true);
    assert.equal(result.message.includes('Maionese 500g'), true);
    assert.equal(result.message.includes('Iogurte Natural 170g'), true);
    assert.equal(result.message.includes('Molho Premium 300g'), true);
    assert.equal(result.message.includes('Esponja de Aco'), true);
    assert.equal(result.message.includes('🔴 1.'), true);
    assert.equal(result.message.includes('Pode vencer antes de acabar o estoque.'), true);
    assert.equal(result.message.includes('Sem vendas e com estoque disponível.'), true);
    assert.equal(result.message.includes('CRIAR_PROMOCAO'), false);
    assert.equal(result.message.includes('SUSPENDER_REPOSICAO'), false);
    assert.equal(result.message.includes('Criar promoção'), true);
    assert.equal(result.message.includes('Suspender reposição'), true);
    assert.match(result.message, /[Pp]eríodo/);
    assert.equal(result.message.includes('disponível'), true);
    assert.equal(result.message.includes('periodo'), false);
    assert.equal(result.message.includes('disponivel'), false);
    assert.equal(result.message.includes('Consulta determinística SmartMarket'), false);
    assert.equal(result.message.includes('cliente_id'), false);
    assert.equal(result.message.includes('listar_periodos'), false);
    assert.equal(result.message.includes('consultar_recomendacoes'), false);
    assert.equal(result.message.trim().endsWith('• O que vence primeiro?'), true);
  } finally {
    console.warn = previousWarn;
    if (previousAiFlag === undefined) {
      delete process.env.SMARTMARKET_AI_ENABLED;
    } else {
      process.env.SMARTMARKET_AI_ENABLED = previousAiFlag;
    }
  }
});

test('mensagem comercial longa preserva blocos e sugestoes na ultima parte', () => {
  const recommendations = Array.from({ length: 18 }, (_, index) => ({
    produto_id: `produto-${index}`,
    nome: `Produto Comercial ${index + 1}`,
    categoria: 'Teste',
    prioridade_score: 90 - index,
    severidade: index % 2 === 0 ? 'critica' : 'alta',
    recomendacao_principal: index % 2 === 0 ? 'RISCO_VENCIMENTO' : 'SEM_VENDAS',
    diagnostico: 'Diagnóstico técnico interno.',
    impacto: 'Impacto interno.',
    acao_recomendada: index % 2 === 0 ? 'CRIAR_PROMOCAO' : 'SUSPENDER_REPOSICAO',
    justificativas: [],
    metricas_relevantes: {},
    simulacao_promocao: null,
  })) as ProductRecommendation[];

  const message = formatFallbackRecommendationsMessage({
    intent: 'prioridades',
    marketName: 'Mercado da TIA',
    period: { periodo_inicio: '2026-01-01', periodo_fim: '2026-06-30' },
    recommendations,
  });
  const parts = splitTelegramMessage(message, 900);

  assert.ok(parts.length > 1);
  assert.equal(parts[0].includes('Prioridades do Mercado da TIA'), true);
  assert.equal(message.includes('🔴 1. Produto Comercial 1'), true);
  assert.equal(message.includes('🟠 2. Produto Comercial 2'), true);
  assert.equal(parts.slice(1).some((part) => part.includes('Prioridades do Mercado da TIA')), false);
  assert.equal(parts.at(-1)?.includes('Posso detalhar qualquer produto.'), true);
  assert.equal(parts.at(-1)?.includes('• O que vence primeiro?'), true);
  assert.ok(parts.every((part) => part.length <= 900));
});
