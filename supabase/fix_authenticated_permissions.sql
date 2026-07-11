-- Reparar permissoes do MVP SmartMarket.
-- Execute no Supabase SQL Editor com um usuario owner/admin do projeto.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produtos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estoque TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alertas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uploads_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_logs TO authenticated;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso Autenticado - Clientes" ON public.clientes;
DROP POLICY IF EXISTS "Acesso Autenticado - Produtos" ON public.produtos;
DROP POLICY IF EXISTS "Acesso Autenticado - Estoque" ON public.estoque;
DROP POLICY IF EXISTS "Acesso Autenticado - Vendas" ON public.vendas;
DROP POLICY IF EXISTS "Acesso Autenticado - Alertas" ON public.alertas;
DROP POLICY IF EXISTS "Acesso Autenticado - Uploads" ON public.uploads_history;
DROP POLICY IF EXISTS "Acesso Autenticado - Logs" ON public.whatsapp_logs;

CREATE POLICY "Acesso Autenticado - Clientes" ON public.clientes
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Produtos" ON public.produtos
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Estoque" ON public.estoque
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Vendas" ON public.vendas
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Alertas" ON public.alertas
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Uploads" ON public.uploads_history
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acesso Autenticado - Logs" ON public.whatsapp_logs
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

SELECT
  has_schema_privilege('authenticated', 'public', 'USAGE') AS authenticated_schema_usage,
  has_table_privilege('authenticated', 'public.produtos', 'SELECT') AS authenticated_produtos_select,
  has_table_privilege('authenticated', 'public.alertas', 'SELECT') AS authenticated_alertas_select,
  has_table_privilege('anon', 'public.produtos', 'SELECT') AS anon_produtos_select,
  has_table_privilege('anon', 'public.alertas', 'SELECT') AS anon_alertas_select;
