'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Lock, Loader2 } from 'lucide-react';
import { supabase, isConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!isConfigured) {
        setError('Supabase não configurado. Por favor, adicione suas chaves no arquivo .env.local para testar o login.');
        setLoading(false);
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('FetchError') || authError.message.includes('Failed to fetch')) {
          setError('Erro de conexão com o servidor. Verifique a URL do Supabase ou sua internet.');
          setLoading(false);
          return;
        }
        setError('E-mail ou senha incorretos.');
        setLoading(false);
        return;
      }

      if (data?.user) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth Debug] Login success:', data.user.id);
          console.log('[Auth Debug] Session exists:', !!data.session);
          console.log('[Auth Debug] Redirecting to /dashboard');
        }
        router.push('/dashboard');
        router.refresh(); // Atualiza o estado da sessão no servidor
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError('Não foi possível conectar ao servidor. Verifique sua conexão ou a configuração do Supabase.');
      } else {
        setError(err.message || 'Erro inesperado ao tentar fazer login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'radial-gradient(circle at top right, #10b98120, transparent), radial-gradient(circle at bottom left, #3b82f610, transparent)'
    }}>
      <div className="card" style={{ width: '400px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            background: 'var(--primary)', 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <AlertTriangle size={24} color="white" />
          </div>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>SmartMarket</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Gestão inteligente para mini mercadinhos</p>
        </div>

        {error && (
          <div style={{ 
            padding: '12px', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: 'var(--danger)', 
            borderRadius: 'var(--radius)', 
            fontSize: '13px', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '8px' }}>
              E-mail
            </label>
            <input 
              type="email" 
              placeholder="nome@mercado.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
                Senha
              </label>
              <a href="#" style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none' }}>Esqueceu?</a>
            </div>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit"
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px', marginBottom: '16px' }}
            disabled={loading}
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Loader2 size={18} className="animate-spin" />
                Autenticando...
              </div>
            ) : 'Acessar Painel'}
          </button>

          <button type="button" className="btn btn-outline" style={{ width: '100%', padding: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <Lock size={16} />
            Login com Single Sign-On
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Não tem uma conta? <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Fale com o suporte</a>
        </p>
      </div>
    </div>
  );
}
