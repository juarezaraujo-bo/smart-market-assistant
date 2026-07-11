'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Cliente } from '@/types';

type UploadMessage = { type: 'success' | 'error'; text: string };
type UploadCliente = Pick<Cliente, 'id' | 'nome_mercado'>;
type UploadHistory = {
  id: string;
  nome_arquivo: string;
  status: string;
  linhas_processadas: number;
  created_at: string;
};
type UploadResult = {
  error?: string;
  alertas_gerados?: number;
  linhas_validas?: number;
  produtos_inseridos?: number;
  produtos_atualizados?: number;
  erros?: Array<{
    row?: number;
    field?: string;
    value?: unknown;
    produto?: string;
    message?: string;
    hint?: string | null;
    code?: string | null;
  }>;
};

export default function UploadsPage() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [history, setHistory] = useState<UploadHistory[]>([]);
  const [cliente, setCliente] = useState<UploadCliente | null>(null);
  const [message, setMessage] = useState<UploadMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async (clienteId: string) => {
    const { data } = await supabase
      .from('uploads_history')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    setHistory((data || []) as UploadHistory[]);
  }, []);

  const loadUploadContext = useCallback(async () => {
    setInitialLoading(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage({ type: 'error', text: 'Usuario nao autenticado.' });
      setCliente(null);
      setHistory([]);
      setInitialLoading(false);
      return;
    }

    const { data: mercado, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nome_mercado')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (clienteError) {
      setMessage({ type: 'error', text: clienteError.message || 'Erro ao buscar mercado.' });
      setCliente(null);
      setHistory([]);
      setInitialLoading(false);
      return;
    }

    if (!mercado) {
      setMessage({ type: 'error', text: 'Cadastre um mercado antes de importar dados.' });
      setCliente(null);
      setHistory([]);
      setInitialLoading(false);
      return;
    }

    setCliente(mercado as UploadCliente);
    await fetchHistory(mercado.id);
    setInitialLoading(false);
  }, [fetchHistory]);

  useEffect(() => {
    void Promise.resolve().then(loadUploadContext);
  }, [loadUploadContext]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !cliente) throw new Error('Cadastre um mercado antes de importar dados.');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('clienteId', cliente.id);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result = (await response.json()) as UploadResult;

      if (!response.ok) {
        const firstError = result.erros?.[0];
        const detail = firstError?.message
          ? ` ${firstError.message}${firstError.hint ? ` (${firstError.hint})` : ''}`
          : '';
        throw new Error(`${result.error || 'Falha no upload.'}${detail}`);
      }

      const inserted = result.produtos_inseridos ?? 0;
      const updated = result.produtos_atualizados ?? 0;
      const errors = result.erros?.length ?? 0;
      const validRows = result.linhas_validas ?? inserted + updated;
      const alertsGenerated = result.alertas_gerados ?? 0;

      setMessage({
        type: errors > 0 ? 'error' : 'success',
        text: `Upload concluido: ${validRows} linhas validas, ${inserted} produtos inseridos, ${updated} atualizados e ${alertsGenerated} alertas gerados${errors > 0 ? ` (${errors} erro(s) na persistencia).` : '.'}`,
      });
      fetchHistory(cliente.id);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha no upload.' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-fade" style={{ maxWidth: '900px' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Importar Dados</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Atualize o estoque e as vendas subindo sua planilha Excel ou CSV.</p>
      </header>

      {message && (
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '24px',
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: message.type === 'success' ? 'var(--primary)' : 'var(--danger)',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          border: `1px solid ${message.type === 'success' ? 'var(--primary)' : 'var(--danger)'}`
        }}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          {message.text}
        </div>
      )}

      <div
        style={{
          border: '2px dashed var(--border)',
          borderRadius: '12px',
          padding: '60px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.02)',
          marginBottom: '40px',
          cursor: loading || initialLoading || !cliente ? 'not-allowed' : 'pointer',
          opacity: loading || initialLoading || !cliente ? 0.6 : 1
        }}
        onClick={() => !loading && !initialLoading && cliente && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          hidden
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          disabled={!cliente || initialLoading}
        />
        <div style={{
          width: '56px',
          height: '56px',
          background: 'var(--bg-muted)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          {loading || initialLoading ? <Loader2 size={28} className="animate-spin" color="var(--primary)" /> : <UploadCloud size={28} color="var(--primary)" />}
        </div>
        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>
          {loading ? 'Processando planilha...' : 'Selecione sua planilha'}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>
          {cliente ? `Mercado selecionado: ${cliente.nome_mercado}` : 'Cadastre um mercado antes de importar dados.'}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Arquivos .xlsx ou .csv (O sistema detecta automaticamente)
        </p>
      </div>

      <section>
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Historico Real</h3>
        <div className="card" style={{ padding: '0' }}>
          {history.length > 0 ? history.map((upload) => (
            <div key={upload.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '16px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ color: 'var(--text-muted)' }}>
                <FileText size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{upload.nome_arquivo}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(upload.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{upload.linhas_processadas} linhas</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: upload.status === 'success' ? 'var(--primary)' : 'var(--warning)' }}>
                {upload.status === 'success' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                {upload.status === 'success' ? 'Sucesso' : 'Aviso'}
              </div>
            </div>
          )) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhum upload registrado.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
