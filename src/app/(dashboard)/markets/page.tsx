'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, MoreVertical, MapPin, Phone, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Cliente } from '@/types';

type MarketForm = {
  nome_mercado: string;
  responsavel: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  status: string;
};

const emptyForm: MarketForm = {
  nome_mercado: '',
  responsavel: '',
  whatsapp: '',
  cidade: '',
  uf: '',
  status: 'ativo',
};

const statusLabel = (status: string) => {
  const normalized = status?.toLowerCase();
  if (normalized === 'ativo') return 'Ativo';
  if (normalized === 'pendente') return 'Pendente';
  if (normalized === 'inativo') return 'Inativo';
  return status || 'Pendente';
};

const MarketRow = ({ market }: { market: Cliente }) => {
  const label = statusLabel(market.status);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '16px 8px' }}>
        <div style={{ fontWeight: 500 }}>{market.nome_mercado}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Responsavel: {market.responsavel}</div>
      </td>
      <td style={{ padding: '16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '6px' }}>
          <MapPin size={14} color="var(--text-muted)" />
          {market.cidade} - {market.uf}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <Phone size={14} />
          {market.whatsapp}
        </div>
      </td>
      <td style={{ padding: '16px 8px' }}>
        <div className={`badge ${label === 'Ativo' ? 'badge-success' : 'badge-warning'}`}>
          {label}
        </div>
      </td>
      <td style={{ padding: '16px 8px', textAlign: 'right' }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} aria-label="Mais opcoes">
          <MoreVertical size={18} />
        </button>
      </td>
    </tr>
  );
};

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<MarketForm>(emptyForm);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('Usuario nao autenticado.');
      setMarkets([]);
      setLoading(false);
      return;
    }

    const { data, error: marketsError } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (marketsError) {
      setError(marketsError.message || 'Erro ao carregar mercados.');
      setMarkets([]);
    } else {
      setMarkets((data || []) as Cliente[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchMarkets);
  }, [fetchMarkets]);

  const filteredMarkets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return markets;

    return markets.filter((market) => {
      return (
        market.nome_mercado.toLowerCase().includes(term) ||
        market.responsavel.toLowerCase().includes(term) ||
        market.cidade.toLowerCase().includes(term) ||
        market.uf.toLowerCase().includes(term)
      );
    });
  }, [markets, search]);

  const handleChange = (field: keyof MarketForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: field === 'uf' ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm(emptyForm);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('Usuario nao autenticado.');
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      nome_mercado: form.nome_mercado.trim(),
      responsavel: form.responsavel.trim(),
      whatsapp: form.whatsapp.trim(),
      cidade: form.cidade.trim(),
      uf: form.uf.trim().toUpperCase(),
      status: form.status,
    };

    const { data, error: insertError } = await supabase
      .from('clientes')
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      setError(insertError.message || 'Erro ao cadastrar mercado.');
      setSaving(false);
      return;
    }

    setMarkets((current) => [data as Cliente, ...current]);
    setSaving(false);
    closeModal();
  };

  return (
    <div className="animate-fade">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '24px', marginBottom: '4px' }}>Mercados</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Gerencie seus clientes e unidades operacionais.</p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', gap: '8px' }} onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          Novo Mercado
        </button>
      </header>

      <div className="card" style={{ padding: '0' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              placeholder="Buscar por nome ou cidade..."
              style={{ paddingLeft: '36px', fontSize: '14px' }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button className="btn btn-outline" onClick={() => setSearch('')}>Limpar</button>
        </div>

        {error && !isModalOpen && (
          <div style={{ padding: '16px', color: 'var(--danger)', fontSize: '14px', borderBottom: '1px solid var(--border)' }}>
            {error}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nome / Responsavel</th>
              <th style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Localizacao</th>
              <th style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '12px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '56px', textAlign: 'center' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
                  <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>Carregando mercados...</p>
                </td>
              </tr>
            ) : filteredMarkets.length > 0 ? (
              filteredMarkets.map((market) => <MarketRow key={market.id} market={market} />)
            ) : (
              <tr>
                <td colSpan={4} style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <h3 style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>Nenhum mercado cadastrado</h3>
                  <p style={{ fontSize: '14px' }}>Cadastre um mercado para liberar a importacao de dados.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          zIndex: 50,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', marginBottom: '4px' }}>Novo Mercado</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Vinculado ao usuario autenticado.</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Nome do mercado
                  <input value={form.nome_mercado} onChange={(event) => handleChange('nome_mercado', event.target.value)} required style={{ marginTop: '8px' }} />
                </label>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Responsavel
                  <input value={form.responsavel} onChange={(event) => handleChange('responsavel', event.target.value)} required style={{ marginTop: '8px' }} />
                </label>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Telefone
                  <input value={form.whatsapp} onChange={(event) => handleChange('whatsapp', event.target.value)} required style={{ marginTop: '8px' }} />
                </label>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Cidade
                  <input value={form.cidade} onChange={(event) => handleChange('cidade', event.target.value)} required style={{ marginTop: '8px' }} />
                </label>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Estado
                  <input value={form.uf} onChange={(event) => handleChange('uf', event.target.value)} required minLength={2} maxLength={2} style={{ marginTop: '8px' }} />
                </label>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => handleChange('status', event.target.value)}
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-dark)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pendente">Pendente</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-outline" onClick={closeModal} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: '120px' }}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
