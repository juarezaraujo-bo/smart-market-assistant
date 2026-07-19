'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Clock,
  TrendingDown,
  DollarSign,
  Package,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type StatCardProps = {
  label: string;
  value: string | number;
  subValue: string;
  icon: LucideIcon;
  color: string;
  loading: boolean;
};

type AlertSummary = {
  tipo: string | null;
  mensagem: string | null;
  whatsapp_status: string | null;
};

type InventorySummary = {
  preco_custo: number | null;
  estoque?: Array<{
    quantidade_atual: number | null;
  }> | null;
};

type UploadSummary = {
  id: string;
  nome_arquivo: string;
  status: string;
  linhas_processadas: number;
  created_at: string;
};

const StatCard = ({ label, value, subValue, icon: Icon, color, loading }: StatCardProps) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ padding: '8px', borderRadius: '6px', background: `${color}20`, color }}>
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
    capital: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentUploads, setRecentUploads] = useState<UploadSummary[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();

        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth Debug] Dashboard Session active:', !!session);
          console.log('[Auth Debug] Dashboard User Role:', session?.user?.role || 'anon');
        }

        if (!session) {
          console.warn('[Auth] Dashboard acessado sem sessão ativa.');
          return;
        }

        const { data: alerts } = await supabase
          .from('alertas')
          .select('tipo, mensagem, whatsapp_status')
          .eq('lido', false);

        const { data: inventory } = await supabase
          .from('produtos')
          .select('preco_custo, estoque(quantidade_atual)');

        const alertRows = (alerts || []) as AlertSummary[];
        const inventoryRows = (inventory || []) as InventorySummary[];

        const criticos = alertRows.filter((alert) => alert.whatsapp_status === 'pending').length;
        const vencimento = alertRows.filter((alert) => alert.tipo === 'vencimento').length;
        const baixo = alertRows.filter((alert) => alert.tipo === 'estoque_baixo').length;

        const capital = inventoryRows.reduce((acc, product) => {
          const qty = product.estoque?.[0]?.quantidade_atual || 0;
          return acc + (qty * (product.preco_custo || 0));
        }, 0);

        setStats({ criticos, vencimento, baixo, capital });

        const { data: uploads } = await supabase
          .from('uploads_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3);

        setRecentUploads((uploads || []) as UploadSummary[]);
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
          subValue="Pendentes para WhatsApp"
          icon={AlertCircle}
          color="#ef4444"
          loading={loading}
        />
        <StatCard
          label="Próximos Vencimentos"
          value={stats.vencimento}
          subValue="Nos próximos 7 dias"
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

      <div className="dashboard-content-grid">
        <div className="card">
          <h3 style={{ fontSize: '16px', marginBottom: '24px' }}>Últimas Importações</h3>

          <div className="recent-upload-list">
            {recentUploads.length > 0 ? recentUploads.map((upload) => (
              <div key={upload.id} className="recent-upload-item">
                <div className="recent-upload-icon">
                  <Package size={20} color="var(--text-muted)" />
                </div>
                <div className="recent-upload-info">
                  <div>{upload.nome_arquivo}</div>
                  <span>
                    {new Date(upload.created_at).toLocaleString('pt-BR')} • {upload.linhas_processadas} itens
                  </span>
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
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 15px var(--primary)' }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>Serviço Ativo</div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Fila de processamento em execução</p>
          </div>
        </div>
      </div>
    </div>
  );
}
