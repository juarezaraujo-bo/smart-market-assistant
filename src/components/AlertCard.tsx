import React from 'react';
import { AlertCircle, AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { Alerta } from '@/types';

const iconMap = {
  vencimento: <Clock size={20} color="var(--warning)" />,
  estoque_baixo: <TrendingDown size={20} color="var(--secondary)" />,
  estoque_parado: <AlertTriangle size={20} color="var(--text-muted)" />,
  ruptura: <AlertCircle size={20} color="var(--error)" />,
};

export function AlertCard({ alerta }: { alerta: Alerta }) {
  const getBorderColor = () => {
    if (alerta.tipo === 'ruptura') return 'var(--error)';
    if (alerta.tipo === 'vencimento') return 'var(--warning)';
    return 'var(--border)';
  };

  return (
    <div className="card animate-fade" style={{ borderLeft: `4px solid ${getBorderColor()}`, marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        {iconMap[alerta.tipo]}
        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {alerta.tipo.replace('_', ' ')}
        </span>
      </div>
      <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-main)' }}>
        {alerta.mensagem}
      </p>
      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
          Marcar como resolvido
        </button>
      </div>
    </div>
  );
}
