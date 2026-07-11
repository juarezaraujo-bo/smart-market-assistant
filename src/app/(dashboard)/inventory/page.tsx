'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type InventoryProduct = {
  id: string;
  cliente_id: string;
  nome: string;
  categoria: string | null;
  preco_venda: number | null;
  quantidade_vendida: number | null;
  ultima_venda: string | null;
  estoque?: Array<{
    quantidade_atual: number | null;
    data_validade: string | null;
  }> | null;
  vendas?: Array<{
    quantidade_vendida: number | null;
  }> | null;
};

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const { data: { user }, error: userError } = session
        ? await supabase.auth.getUser()
        : { data: { user: null }, error: null };

      if (process.env.NODE_ENV === 'development') {
        console.log('[Inventory Auth Debug]', {
          hasSession: !!session,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          userRole: session?.user?.role ?? 'anon',
          sessionError,
          userError,
        });
      }

      if (!session || !user) {
        router.replace('/login');
        return;
      }

      const { data: clientes, error: clientesError } = await supabase
        .from('clientes')
        .select('id')
        .eq('user_id', user.id);

      if (clientesError) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Inventory Clientes Error]', {
            message: clientesError.message,
            details: clientesError.details,
            hint: clientesError.hint,
            code: clientesError.code,
          });
        }
        setError(clientesError.message || 'Erro ao carregar mercados.');
        return;
      }

      const clienteIds = (clientes || []).map((cliente) => cliente.id);
      if (clienteIds.length === 0) {
        setProducts([]);
        return;
      }

      const { data, error: supabaseError } = await supabase
        .from('produtos')
        .select(`
          *,
          estoque (quantidade_atual, data_validade),
          vendas (quantidade_vendida)
        `)
        .in('cliente_id', clienteIds)
        .order('nome');

      if (supabaseError) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Inventory Supabase Error]', {
            message: supabaseError.message,
            details: supabaseError.details,
            hint: supabaseError.hint,
            code: supabaseError.code,
          });
        }
        setError(supabaseError.message || 'Erro ao carregar inventario.');
        return;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[Inventory Products Loaded]', {
          clienteIds,
          totalProducts: data?.length || 0,
        });
      }

      setProducts((data || []) as InventoryProduct[]);
    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Inventory Unexpected Error]', err);
      }
      setError('Falha de comunicacao com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(fetchInventory);
  }, [fetchInventory]);

  const filteredProducts = products.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Inventario Real</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Visualizacao detalhada do seu estoque atualizado via sistema.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              placeholder="Buscar produto ou categoria..."
              style={{ paddingLeft: '36px', width: '250px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Produto / Categoria</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Estoque Atual</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Preco Venda</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Validade</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Giro (Vendas)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '60px', textAlign: 'center' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
                  <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>Carregando estoque...</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px' }}>{error}</div>
                  <button className="btn btn-outline" onClick={() => window.location.reload()}>Recarregar</button>
                </td>
              </tr>
            ) : filteredProducts.length > 0 ? filteredProducts.map((p) => {
              const estoque = p.estoque?.[0];
              const vendasRelacionadas = p.vendas?.reduce((acc, v) => acc + (v.quantidade_vendida || 0), 0) || 0;
              const totalVendas = p.quantidade_vendida ?? vendasRelacionadas;

              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{p.nome}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.categoria}</div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    <span style={{
                      color: (estoque?.quantidade_atual || 0) < 10 ? 'var(--danger)' : 'inherit',
                      fontWeight: (estoque?.quantidade_atual || 0) < 10 ? 600 : 400,
                    }}>
                      {estoque?.quantidade_atual || 0} un
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    R$ {Number(p.preco_venda || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {estoque?.data_validade ? new Date(estoque.data_validade).toLocaleDateString('pt-BR') : 'N/A'}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      <Package size={14} color="var(--text-muted)" />
                      {totalVendas} un vendidas
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={5} style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3 style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>Nenhum produto importado ainda</h3>
                  <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                    Sua lista de inventario esta vazia. Suba sua primeira planilha na aba de <strong>Importar</strong> para comecar a monitorar seu mercado.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
