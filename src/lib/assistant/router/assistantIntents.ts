import type { AssistantPeriod } from '../assistantTypes';

export type AssistantIntent =
  | 'priorities'
  | 'product_analysis'
  | 'category_analysis'
  | 'idle_capital'
  | 'replenishment'
  | 'expiration'
  | 'stagnant_products'
  | 'promotions'
  | 'sales_ranking'
  | 'executive_summary'
  | 'period_comparison'
  | 'help'
  | 'unknown';

export type SalesRankingDirection = 'most' | 'least';
export type PeriodReference = 'latest' | 'previous_month' | 'previous_quarter' | 'before_that';

export type AssistantIntentEntities = {
  productTerm?: string;
  category?: string;
  periodReference?: PeriodReference;
  limit?: number;
  salesDirection?: SalesRankingDirection;
};

export type AssistantIntentRoute = {
  intent: AssistantIntent;
  confidence: number;
  entities: AssistantIntentEntities;
  reason: string;
};

export type LastProductContext = {
  productTerm: string;
  period?: AssistantPeriod | null;
};
