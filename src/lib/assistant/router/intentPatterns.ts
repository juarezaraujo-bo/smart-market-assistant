import type { AssistantIntent } from './assistantIntents';

export const KNOWN_CATEGORY_TERMS = [
  'bebida',
  'bebidas',
  'limpeza',
  'mercearia',
  'laticinio',
  'laticinios',
  'higiene',
  'doce',
  'doces',
  'snack',
  'snacks',
];

export const INTENT_KEYWORDS: Record<Exclude<AssistantIntent, 'product_analysis' | 'category_analysis' | 'unknown'>, string[]> = {
  priorities: ['prioridade', 'prioridades', 'atencao', 'comecar', 'fazer hoje'],
  idle_capital: ['dinheiro parado', 'capital', 'imobilizado', 'concentrado', 'prende mais dinheiro'],
  replenishment: ['repor', 'reposicao', 'comprar', 'acabando', 'falta', 'ruptura'],
  expiration: ['vence', 'vencem', 'vencer', 'vencimento', 'validade', 'perto de vencer'],
  stagnant_products: ['sem vender', 'sem vendas', 'encalhado', 'encalhados', 'nao vendem', 'estoque parado'],
  promotions: ['promocao', 'promocoes', 'combo', 'desconto', 'reduz mais perda', 'vale mais a pena'],
  sales_ranking: ['vende mais', 'mais vendido', 'mais vendidos', 'vende menos', 'menos vendido', 'menos vendidos'],
  executive_summary: ['resumo', 'visao geral', 'como esta meu mercado', 'como foi o mes'],
  period_comparison: ['mes anterior', 'mes passado', 'trimestre anterior', 'antes disso', 'compare com'],
  help: ['ajuda', '/ajuda', '/help', 'o que voce sabe fazer', 'quais perguntas posso fazer'],
};

export const PRODUCT_PATTERNS = [
  /^como esta(?:o)?\s+(?:(?:umas|uns|uma|um|as|os|a|o)\s+)?(.+)$/,
  /^situacao\s+(?:(?:das|dos|da|do|de)\s+)?(.+)$/,
  /^analise\s+(?:(?:umas|uns|uma|um|as|os|a|o)\s+)?(.+)$/,
  /^me fale sobre\s+(?:(?:umas|uns|uma|um|as|os|a|o)\s+)?(.+)$/,
  /^tenho problema com\s+(?:(?:umas|uns|uma|um|as|os|a|o)\s+)?(.+)$/,
];

export const CATEGORY_PATTERNS = [
  /categoria\s+(.+)$/,
  /^como esta(?:o)?\s+(?:a\s+|o\s+|as\s+|os\s+)?(bebidas|limpeza|mercearia|laticinios|higiene|doces|snacks)$/,
  /^qual a situacao\s+(?:da\s+|do\s+|das\s+|dos\s+)?(bebidas|limpeza|mercearia|laticinios|higiene|doces|snacks)$/,
];
