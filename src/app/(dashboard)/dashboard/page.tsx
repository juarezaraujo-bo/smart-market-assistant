'use client';

import React, { useEffect, useState } from 'react';
import { 
  AlertCircle, 
  Clock, 
  TrendingDown, 
  DollarSign, 
  Package,
  Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const StatCard = ({ label, value, subValue, icon: Icon, color, loading }: any) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ padding: '8px', borderRadius: '6px', background: `${color}20`, color: color }}>
        <Icon size={20} />
      </div>
    </div>
    <div className="stat-label">{label}</div>
    {loading ? (
      <Loader2 size={24} className="animate-spin" style={{ margin: '8px 0' }} />
    ) : (
      <div className="stat-value">{value}</div>
    )}
    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
      {subValue}
    </div>
  </div>
);

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    criticos: 0,
    vencimento: 0,
    baixo: 0,
    capital: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentUploads, setRecentUploads] = useState<any[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);

        // Diagnóstico de Sessão
        const { data: { session } } = await supabase.auth.getSession();
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth Debug] Dashboard Session active:', !!session);
          console.log('[Auth Debug] Dashboard User Role:', session?.user?.role || 'anon');
        }

        if (!session) {
          console.warn('[Auth] Dashboard acessado sem sessão ativa.');
          return;
        }

        // 1. Buscar Alertas
        const { data: alerts } = await supabase.from('alertas').select('tipo, mensagem').eq('lido', false);
        
        // 2. Buscar Produtos para Capital Parado
        const { data: inventory } = await supabase.from('produtos').select('preco_custo, estoque(quantidade_atual)');

        const criticos = alerts?.filter(a => a.tipo === 'ruptura').length || 0;
        const vencimento = alerts?.filter(a => a.tipo === 'vencimento').length || 0;
        const baixo = alerts?.filter(a => a.tipo === 'estoque_baixo').length || 0;
        
        const capital = inventory?.reduce((acc, p) => {
          const qty = p.estoque?.[0]?.quantidade_atual || 0;
          return acc + (qty * (p.preco_custo || 0));
        }, 0) || 0;

        setStats({ criticos, vencimento, baixo, capital });

        // 3. Buscar Últimos Uploads
        const { data: uploads } = await supabase
          .from('uploads_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3);
        
        setRecentUploads(uploads || []);
      } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="animate-fade">
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Visão Geral</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Status atualizado do seu mercado em tempo real.</p>
      </div>

      <div className="stats-grid">
        <StatCard 
          label="Alertas Críticos" 
          value={stats.criticos} 
          subValue="Ruptura imediata" 
          icon={AlertCircle} 
          color="#ef4444" 
          loading={loading}
        />
        <StatCard 
          label="Próximos Vencimentos" 
          value={stats.vencimento} 
          subValue="Nos próximos 30 dias" 
          icon={Clock} 
          color="#f59e0b" 
          loading={loading}
        />
        <StatCard 
          label="Estoque Baixo" 
          value={stats.baixo} 
          subValue="Abaixo da margem de giro" 
          icon={TrendingDown} 
          color="#3b82f6" 
          loading={loading}
        />
        <StatCard 
          label="Capital em Estoque" 
          value={`R$ ${stats.capital.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          subValue="Total investido parado" 
          icon={DollarSign} 
          color="#10b981" 
          loading={loading}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '24px' }}>Últimas Importações</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recentUploads.length > 0 ? recentUploads.map((upload) => (
              <div key={upload.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={20} color="var(--text-muted)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{upload.nome_arquivo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(upload.created_at).toLocaleString('pt-BR')} • {upload.linhas_processadas} itens
                  </div>
                </div>
                <div className={`badge ${upload.status === 'success' ? 'badge-success' : 'badge-warning'}`}>
                  {upload.status === 'success' ? 'Sucesso' : 'Parcial'}
                </div>
              </div>
            )) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>Nenhuma importação realizada.</p>
            )}
          </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, var(--bg-card), #10b98105)' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Status WhatsApp</h3>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 15px var(--primary)' }}></div>
            </div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>Serviço Ativo</div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Fila de processamento em execução</p>
          </div>
        </div>
      </div>
    </div>
  );
}
