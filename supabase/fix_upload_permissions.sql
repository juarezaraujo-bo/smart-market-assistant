-- Corrige permissoes necessarias para o fluxo de upload do SmartMarket.
-- Execute no Supabase SQL Editor com usuario owner/admin do projeto.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.produtos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.estoque TO authenticated;
GRANT SELECT, INSERT ON TABLE public.vendas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.uploads_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.produto_periodos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alertas TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS quantidade_vendida INTEGER DEFAULT 0 CHECK (quantidade_vendida >= 0);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ultima_venda DATE;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

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

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes pertencem ao usuario" ON public.clientes;
DROP POLICY IF EXISTS "Produtos do usuario" ON public.produtos;
DROP POLICY IF EXISTS "Estoque do usuario" ON public.estoque;
DROP POLICY IF EXISTS "Vendas do usuario" ON public.vendas;
DROP POLICY IF EXISTS "Uploads do usuario" ON public.uploads_history;
DROP POLICY IF EXISTS "Produto periodos do usuario" ON public.produto_periodos;
DROP POLICY IF EXISTS "Alertas do usuario" ON public.alertas;

CREATE POLICY "Clientes pertencem ao usuario" ON public.clientes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Produtos do usuario" ON public.produtos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = produtos.cliente_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = produtos.cliente_id
        AND clientes.user_id = auth.uid()
    )
  );

CREATE POLICY "Estoque do usuario" ON public.estoque
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.produtos
      JOIN public.clientes ON clientes.id = produtos.cliente_id
      WHERE produtos.id = estoque.produto_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.produtos
      JOIN public.clientes ON clientes.id = produtos.cliente_id
      WHERE produtos.id = estoque.produto_id
        AND clientes.user_id = auth.uid()
    )
  );

CREATE POLICY "Vendas do usuario" ON public.vendas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.produtos
      JOIN public.clientes ON clientes.id = produtos.cliente_id
      WHERE produtos.id = vendas.produto_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.produtos
      JOIN public.clientes ON clientes.id = produtos.cliente_id
      WHERE produtos.id = vendas.produto_id
        AND clientes.user_id = auth.uid()
    )
  );

CREATE POLICY "Uploads do usuario" ON public.uploads_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = uploads_history.cliente_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = uploads_history.cliente_id
        AND clientes.user_id = auth.uid()
    )
  );

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

CREATE POLICY "Alertas do usuario" ON public.alertas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = alertas.cliente_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = alertas.cliente_id
        AND clientes.user_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS produtos_cliente_nome_key
  ON public.produtos (cliente_id, nome);

CREATE UNIQUE INDEX IF NOT EXISTS estoque_produto_id_key
  ON public.estoque (produto_id);

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

SELECT
  has_table_privilege('authenticated', 'public.clientes', 'SELECT') AS clientes_select,
  has_table_privilege('authenticated', 'public.produtos', 'SELECT') AS produtos_select,
  has_table_privilege('authenticated', 'public.produtos', 'INSERT') AS produtos_insert,
  has_table_privilege('authenticated', 'public.produtos', 'UPDATE') AS produtos_update,
  has_table_privilege('authenticated', 'public.estoque', 'INSERT') AS estoque_insert,
  has_table_privilege('authenticated', 'public.vendas', 'INSERT') AS vendas_insert,
  has_table_privilege('authenticated', 'public.produto_periodos', 'INSERT') AS produto_periodos_insert;
