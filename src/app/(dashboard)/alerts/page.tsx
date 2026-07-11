'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle, Clock, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AlertRecord = {
  id: string;
  tipo: 'ruptura' | 'vencimento' | 'estoque_baixo' | 'estoque_parado' | string | null;
  mensagem: string;
  created_at: string;
  whatsapp_status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped' | string | null;
};

type AlertItemProps = {
  type: AlertRecord['tipo'];
  message: string;
  time: string;
  status: AlertRecord['whatsapp_status'];
};

const AlertItem = ({ type, message, time, status }: AlertItemProps) => {
  const icons: Record<string, React.ReactNode> = {
    ruptura: <AlertCircle size={18} color="var(--danger)" />,
    vencimento: <Clock size={18} color="var(--warning)" />,
    estoque_baixo: <TrendingDown size={18} color="var(--info)" />,
    estoque_parado: <AlertTriangle size={18} color="var(--text-muted)" />,
  };

  const borderColors: Record<string, string> = {
    ruptura: 'var(--danger)',
    vencimento: 'var(--warning)',
    estoque_baixo: 'var(--info)',
    estoque_parado: 'var(--border)',
  };

  return (
    <div className="card" style={{ marginBottom: '12px', borderLeft: `4px solid ${borderColors[type || ''] || 'var(--border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ marginTop: '2px' }}>{icons[type || ''] || <Bell size={18} />}</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{message}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Gerado em: {new Date(time).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`badge ${status === 'sent' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
            WhatsApp: {status === 'sent' ? 'Enviado' : status === 'pending' ? 'Pendente' : 'Falhou'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function fetchAlerts() {
      try {
        setLoading(true);
        setError(null);

        // DiagnÃ³stico de SessÃ£o
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        const { data: { user }, error: userError } = session
          ? await supabase.auth.getUser()
          : { data: { user: null }, error: null };

        if (process.env.NODE_ENV === 'development') {
          console.log('[Alerts Auth Debug]', {
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

        const { data, error: supabaseError } = await supabase
          .from('alertas')
          .select('*')
          .order('created_at', { ascending: false });

        if (supabaseError) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Alerts Supabase Error]', {
              message: supabaseError.message,
              details: supabaseError.details,
              hint: supabaseError.hint,
              code: supabaseError.code,
            });
          }
          setError(supabaseError.message || 'Erro ao carregar dados do servidor.');
          return;
        }
        setAlerts(data || []);
      } catch (err: unknown) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Alerts Unexpected Error]', err);
        }
        setError('Falha de conexÃ£o com o banco de dados.');
      } finally {
        setLoading(false);
      }
    }

    fetchAlerts();
  }, [router]);

  const filteredAlerts = alerts.filter(a => filter === 'all' || a.tipo === filter);

  return (
    <div className="animate-fade" style={{ maxWidth: '800px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Central de Alertas Reais</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Alertas de inteligÃªncia gerados automaticamente apÃ³s cada importaÃ§Ã£o.</p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button 
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} 
          style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px' }}
          onClick={() => setFilter('all')}
        >
          Todos
        </button>
        <button 
          className={`btn ${filter === 'ruptura' ? 'btn-primary' : 'btn-outline'}`} 
          style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px' }}
          onClick={() => setFilter('ruptura')}
        >
          Ruptura
        </button>
        <button 
          className={`btn ${filter === 'vencimento' ? 'btn-primary' : 'btn-outline'}`} 
          style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px' }}
          onClick={() => setFilter('vencimento')}
        >
          Vencimento
        </button>
        <button 
          className={`btn ${filter === 'estoque_baixo' ? 'btn-primary' : 'btn-outline'}`} 
          style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px' }}
          onClick={() => setFilter('estoque_baixo')}
        >
          Estoque Baixo
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
          <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>Buscando alertas de inteligÃªncia...</p>
        </div>
      ) : error ? (
        <div className="card" style={{ border: '1px solid var(--danger)', background: 'rgba(239, 68, 68, 0.05)', textAlign: 'center', padding: '40px' }}>
          <AlertCircle size={40} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '16px', color: 'var(--danger)', marginBottom: '8px' }}>Erro de ConexÃ£o</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>{error}</p>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>Tentar Novamente</button>
        </div>
      ) : filteredAlerts.length > 0 ? (
        filteredAlerts.map((alert) => (
          <AlertItem 
            key={alert.id}
            type={alert.tipo} 
            message={alert.mensagem} 
            time={alert.created_at} 
            status={alert.whatsapp_status} 
          />
        ))
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: '16px', opacity: 0.5 }}>
            <Bell size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>Nenhum alerta encontrado</h3>
          <p style={{ fontSize: '14px' }}>Sua central de inteligÃªncia estÃ¡ limpa. Novos alertas aparecerÃ£o apÃ³s a prÃ³xima importaÃ§Ã£o de dados.</p>
        </div>
      )}
    </div>
  );
}
