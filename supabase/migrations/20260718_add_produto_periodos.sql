-- Adiciona historico de desempenho por produto e periodo de importacao.
-- Execute no Supabase SQL Editor com usuario owner/admin do projeto.

ALTER TABLE public.uploads_history
  ADD COLUMN IF NOT EXISTS periodo_inicio DATE;

ALTER TABLE public.uploads_history
  ADD COLUMN IF NOT EXISTS periodo_fim DATE;

CREATE TABLE IF NOT EXISTS public.produto_periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.uploads_history(id) ON DELETE SET NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  quantidade_vendida NUMERIC NOT NULL DEFAULT 0,
  estoque_atual NUMERIC NOT NULL DEFAULT 0,
  preco_custo NUMERIC,
  preco_venda NUMERIC,
  ultima_venda DATE,
  data_validade DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_periodos_cliente_id
  ON public.produto_periodos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_produto_periodos_produto_id
  ON public.produto_periodos (produto_id);

CREATE INDEX IF NOT EXISTS idx_produto_periodos_periodo_inicio
  ON public.produto_periodos (periodo_inicio);

CREATE INDEX IF NOT EXISTS idx_produto_periodos_periodo_fim
  ON public.produto_periodos (periodo_fim);

CREATE INDEX IF NOT EXISTS idx_produto_periodos_upload_id
  ON public.produto_periodos (upload_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_periodos_cliente_produto_periodo
  ON public.produto_periodos (cliente_id, produto_id, periodo_inicio, periodo_fim);

ALTER TABLE public.produto_periodos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.uploads_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produto_periodos TO authenticated;

DROP POLICY IF EXISTS "Produto periodos do usuario" ON public.produto_periodos;

CREATE POLICY "Produto periodos do usuario" ON public.produto_periodos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = produto_periodos.cliente_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = produto_periodos.cliente_id
        AND clientes.user_id = auth.uid()
    )
  );
