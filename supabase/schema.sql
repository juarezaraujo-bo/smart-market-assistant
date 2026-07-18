-- Script de criacao do banco de dados para o Smart Market Assistant

-- 1. Tabela de Clientes (Mercadinhos)
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_mercado TEXT NOT NULL,
    responsavel TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    cidade TEXT NOT NULL,
    uf CHAR(2) NOT NULL,
    status TEXT DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Tabela de Produtos
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    sku TEXT,
    nome TEXT NOT NULL,
    categoria TEXT,
    preco_custo NUMERIC(10, 2) CHECK (preco_custo >= 0),
    preco_venda NUMERIC(10, 2) CHECK (preco_venda >= 0),
    quantidade_vendida INTEGER DEFAULT 0 CHECK (quantidade_vendida >= 0),
    ultima_venda DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cliente_id, nome)
);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS quantidade_vendida INTEGER DEFAULT 0 CHECK (quantidade_vendida >= 0);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ultima_venda DATE;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Tabela de Estoque
CREATE TABLE IF NOT EXISTS public.estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade_atual INTEGER DEFAULT 0 CHECK (quantidade_atual >= 0),
    data_validade DATE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(produto_id)
);

-- 4. Tabela de Vendas
CREATE TABLE IF NOT EXISTS public.vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade_vendida INTEGER DEFAULT 0,
    data_venda DATE DEFAULT CURRENT_DATE,
    valor_total NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de Alertas
CREATE TABLE IF NOT EXISTS public.alertas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
    tipo TEXT CHECK (tipo IN ('vencimento', 'estoque_baixo', 'estoque_parado', 'ruptura')),
    mensagem TEXT NOT NULL,
    lido BOOLEAN DEFAULT FALSE,
    whatsapp_status TEXT DEFAULT 'pending' CHECK (whatsapp_status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
    whatsapp_tentativas INTEGER DEFAULT 0,
    whatsapp_ultimo_erro TEXT,
    whatsapp_message_id TEXT,
    whatsapp_data_envio TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabela de Logs de WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alerta_id UUID REFERENCES public.alertas(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    telefone_destino TEXT NOT NULL,
    status_api INTEGER,
    resposta_api JSONB,
    erro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabela de Historico de Uploads
CREATE TABLE IF NOT EXISTS public.uploads_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome_arquivo TEXT NOT NULL,
    status TEXT DEFAULT 'processando',
    linhas_processadas INTEGER DEFAULT 0,
    periodo_inicio DATE,
    periodo_fim DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.uploads_history
  ADD COLUMN IF NOT EXISTS periodo_inicio DATE;

ALTER TABLE public.uploads_history
  ADD COLUMN IF NOT EXISTS periodo_fim DATE;

-- 8. Tabela de Historico por Produto e Periodo
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

-- Habilitar RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- Permissoes de schema e tabelas
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Policies antigas do MVP
DROP POLICY IF EXISTS "Acesso Autenticado - Clientes" ON public.clientes;
DROP POLICY IF EXISTS "Acesso Autenticado - Produtos" ON public.produtos;
DROP POLICY IF EXISTS "Acesso Autenticado - Estoque" ON public.estoque;
DROP POLICY IF EXISTS "Acesso Autenticado - Vendas" ON public.vendas;
DROP POLICY IF EXISTS "Acesso Autenticado - Alertas" ON public.alertas;
DROP POLICY IF EXISTS "Acesso Autenticado - Uploads" ON public.uploads_history;
DROP POLICY IF EXISTS "Acesso Autenticado - Produto Periodos" ON public.produto_periodos;
DROP POLICY IF EXISTS "Acesso Autenticado - Logs" ON public.whatsapp_logs;

-- Policies atuais por usuario autenticado
DROP POLICY IF EXISTS "Clientes pertencem ao usuario" ON public.clientes;
DROP POLICY IF EXISTS "Produtos do usuario" ON public.produtos;
DROP POLICY IF EXISTS "Estoque do usuario" ON public.estoque;
DROP POLICY IF EXISTS "Vendas do usuario" ON public.vendas;
DROP POLICY IF EXISTS "Alertas do usuario" ON public.alertas;
DROP POLICY IF EXISTS "Uploads do usuario" ON public.uploads_history;
DROP POLICY IF EXISTS "Produto periodos do usuario" ON public.produto_periodos;
DROP POLICY IF EXISTS "Logs do usuario" ON public.whatsapp_logs;

CREATE POLICY "Clientes pertencem ao usuario" ON public.clientes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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

CREATE POLICY "Logs do usuario" ON public.whatsapp_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = whatsapp_logs.cliente_id
        AND clientes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clientes
      WHERE clientes.id = whatsapp_logs.cliente_id
        AND clientes.user_id = auth.uid()
    )
  );

-- Indices de Performance
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes (user_id);
CREATE INDEX IF NOT EXISTS idx_alertas_cliente_lido ON public.alertas (cliente_id, lido, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_nome_cliente ON public.produtos (cliente_id, nome);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON public.vendas (data_venda DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_produto ON public.estoque (produto_id);
CREATE INDEX IF NOT EXISTS idx_uploads_history_cliente ON public.uploads_history (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produto_periodos_cliente_id ON public.produto_periodos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_produto_periodos_produto_id ON public.produto_periodos (produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_periodos_periodo_inicio ON public.produto_periodos (periodo_inicio);
CREATE INDEX IF NOT EXISTS idx_produto_periodos_periodo_fim ON public.produto_periodos (periodo_fim);
CREATE INDEX IF NOT EXISTS idx_produto_periodos_upload_id ON public.produto_periodos (upload_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_periodos_cliente_produto_periodo ON public.produto_periodos (cliente_id, produto_id, periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_status ON public.alertas (whatsapp_status) WHERE whatsapp_status = 'pending';
