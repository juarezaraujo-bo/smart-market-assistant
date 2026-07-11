import { differenceInDays, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

type ProdutoAnalise = {
  id: string;
  nome: string;
  preco_custo: number | string | null;
  quantidade_vendida?: number | string | null;
  ultima_venda?: string | null;
  estoque?: Array<{
    quantidade_atual: number | string | null;
    data_validade: string | null;
  }> | null;
  vendas?: Array<{
    quantidade_vendida: number | null;
    data_venda: string;
  }> | null;
};

type AlertaInsert = {
  cliente_id: string;
  produto_id: string;
  tipo: 'vencimento' | 'estoque_baixo' | 'estoque_parado' | 'ruptura';
  mensagem: string;
  lido: boolean;
  whatsapp_status: 'pending' | 'skipped';
};

const money = (value: number) => value.toFixed(2);

function getVendaMediaDiaria(produto: ProdutoAnalise, hoje: Date) {
  const quantidadeVendidaProduto = Number(produto.quantidade_vendida || 0);
  const ultimaVendaProduto = produto.ultima_venda ? parseISO(produto.ultima_venda) : null;

  if (
    quantidadeVendidaProduto > 0 &&
    ultimaVendaProduto &&
    differenceInDays(hoje, ultimaVendaProduto) <= 30
  ) {
    return quantidadeVendidaProduto / 30;
  }

  const vendas30Dias = (produto.vendas || []).filter((venda) =>
    differenceInDays(hoje, parseISO(venda.data_venda)) <= 30
  );
  const totalVendido30 = vendas30Dias.reduce(
    (acc, venda) => acc + (venda.quantidade_vendida || 0),
    0
  );

  return totalVendido30 > 0 ? totalVendido30 / 30 : 0;
}

function getDiasSemVenda(produto: ProdutoAnalise, hoje: Date) {
  if (produto.ultima_venda) {
    return differenceInDays(hoje, parseISO(produto.ultima_venda));
  }

  const ultimaVendaHistorica = [...(produto.vendas || [])].sort(
    (a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime()
  )[0];

  if (!ultimaVendaHistorica) return 999;
  return differenceInDays(hoje, parseISO(ultimaVendaHistorica.data_venda));
}

export async function runAnalysis(clienteId: string, client: SupabaseClient = supabase) {
  const { data: produtos, error: prodError } = await client
    .from('produtos')
    .select('*, estoque(*), vendas(*)')
    .eq('cliente_id', clienteId);

  if (prodError || !produtos) {
    console.error('Erro ao buscar dados para analise:', prodError);
    return 0;
  }

  const hoje = new Date();
  const alertasParaInserir: AlertaInsert[] = [];

  for (const produto of produtos as ProdutoAnalise[]) {
    const estoque = produto.estoque?.[0];
    if (!estoque) continue;

    const estoqueAtual = Number(estoque.quantidade_atual || 0);
    const precoCusto = Number(produto.preco_custo || 0);
    const vendaMediaDiaria = getVendaMediaDiaria(produto, hoje);

    if (estoque.data_validade) {
      const diasParaVencer = differenceInDays(parseISO(estoque.data_validade), hoje);

      if (diasParaVencer >= 0 && diasParaVencer <= 7) {
        const vendaEstimadaAteVencer = vendaMediaDiaria * diasParaVencer;
        const quantidadeRisco = Math.max(0, estoqueAtual - vendaEstimadaAteVencer);
        const valorRisco = quantidadeRisco * precoCusto;

        if (quantidadeRisco > 0) {
          alertasParaInserir.push({
            cliente_id: clienteId,
            produto_id: produto.id,
            tipo: 'vencimento',
            mensagem: `${produto.nome} vence em ${diasParaVencer} dias. Risco de perda de ${Math.round(quantidadeRisco)} un (R$ ${money(valorRisco)}).`,
            lido: false,
            whatsapp_status: diasParaVencer <= 3 ? 'pending' : 'skipped',
          });
        }
      }
    }

    if (estoqueAtual > 0 && vendaMediaDiaria > 0) {
      const diasParaAcabar = estoqueAtual / vendaMediaDiaria;

      if (diasParaAcabar <= 3) {
        alertasParaInserir.push({
          cliente_id: clienteId,
          produto_id: produto.id,
          tipo: 'ruptura',
          mensagem: `RUPTURA: ${produto.nome} deve zerar em menos de 3 dias.`,
          lido: false,
          whatsapp_status: 'pending',
        });
      } else if (diasParaAcabar <= 5) {
        alertasParaInserir.push({
          cliente_id: clienteId,
          produto_id: produto.id,
          tipo: 'estoque_baixo',
          mensagem: `Estoque Baixo: ${produto.nome} tem apenas ${estoqueAtual} un. Acaba em aprox. ${Math.ceil(diasParaAcabar)} dias.`,
          lido: false,
          whatsapp_status: 'skipped',
        });
      }
    }

    const diasSemVenda = getDiasSemVenda(produto, hoje);
    const capitalParado = estoqueAtual * precoCusto;

    if (diasSemVenda >= 30 && estoqueAtual > 0 && capitalParado >= 50) {
      alertasParaInserir.push({
        cliente_id: clienteId,
        produto_id: produto.id,
        tipo: 'estoque_parado',
        mensagem: `${produto.nome} sem vendas há ${diasSemVenda === 999 ? 'mais de 30' : diasSemVenda} dias. R$ ${money(capitalParado)} parados em estoque.`,
        lido: false,
        whatsapp_status: capitalParado >= 100 ? 'pending' : 'skipped',
      });
    }
  }

  // MVP: a cada importacao, substitui os alertas operacionais ainda nao lidos.
  await client
    .from('alertas')
    .delete()
    .eq('cliente_id', clienteId)
    .eq('lido', false);

  if (alertasParaInserir.length > 0) {
    const { error: insertError } = await client
      .from('alertas')
      .insert(alertasParaInserir);

    if (insertError) console.error('Erro ao inserir alertas:', insertError);
  }

  return alertasParaInserir.length;
}
