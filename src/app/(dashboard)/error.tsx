'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Aqui você poderia enviar o erro para um serviço como Sentry ou LogRocket
    console.error('Dashboard Critical Error:', error);
  }, [error]);

  return (
    <div style={{ 
      height: '70vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      textAlign: 'center',
      padding: '20px'
    }}>
      <div style={{ 
        width: '64px', 
        height: '64px', 
        background: 'rgba(239, 68, 68, 0.1)', 
        borderRadius: '50%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: '24px'
      }}>
        <AlertTriangle size={32} color="var(--danger)" />
      </div>

      <h1 style={{ fontSize: '24px', marginBottom: '12px' }}>Ops! Algo deu errado.</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: '400px', marginBottom: '32px', fontSize: '15px' }}>
        Ocorreu um erro inesperado ao carregar esta página. Nossa equipe técnica já foi notificada.
      </p>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button 
          onClick={() => reset()} 
          className="btn btn-primary" 
          style={{ display: 'flex', gap: '8px' }}
        >
          <RefreshCcw size={18} />
          Tentar Novamente
        </button>
        
        <Link href="/dashboard" className="btn btn-outline" style={{ display: 'flex', gap: '8px', textDecoration: 'none' }}>
          <Home size={18} />
          Voltar ao Início
        </Link>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="card" style={{ marginTop: '40px', textAlign: 'left', background: '#000', fontSize: '12px', fontFamily: 'monospace', color: '#ff4444' }}>
          <p style={{ fontWeight: 700, marginBottom: '8px' }}>Stack Trace (Dev Only):</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message}</pre>
        </div>
      )}
    </div>
  );
}
