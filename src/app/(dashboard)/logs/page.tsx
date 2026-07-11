'use client';

import React from 'react';
import { History, CheckCircle2, XCircle, Info } from 'lucide-react';

export default function LogsPage() {
  return (
    <div className="animate-fade">
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Logs de WhatsApp</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Auditoria completa das mensagens enviadas e status da API.</p>
      </header>

      <div className="card" style={{ padding: '0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Destino / Mercado</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Status API</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Message ID</th>
              <th style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Horário</th>
            </tr>
          </thead>
          <tbody>
            {[
              { phone: '+55 11 99999-9999', market: 'Mercadinho Centro', status: 200, id: 'BAE5-9823', time: '10:45:12' },
              { phone: '+55 11 98888-8888', market: 'Vila Market', status: 500, id: '-', time: '10:42:05', error: 'Instance not connected' },
              { phone: '+55 11 97777-7777', market: 'Mercado do João', status: 200, id: 'BAE5-1245', time: '09:15:30' },
            ].map((log, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{log.phone}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{log.market}</div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {log.status === 200 ? <CheckCircle2 size={16} color="var(--primary)" /> : <XCircle size={16} color="var(--danger)" />}
                    <span style={{ fontSize: '13px' }}>{log.status === 200 ? 'Sucesso' : 'Erro 500'}</span>
                    {log.error && (
                      <span title={log.error} style={{ display: 'flex', alignItems: 'center' }}>
                        <Info size={14} color="var(--text-muted)" />
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '16px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {log.id}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  {log.time}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
