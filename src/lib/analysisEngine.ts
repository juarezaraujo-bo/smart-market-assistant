import { differenceInDays, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Venda } from '@/types';

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
  const alertasParaInserir = [];

  for (const produto of produtos) {
    const estoque = produto.estoque?.[0];
    const vendas = produto.vendas || [];

    if (!estoque) continue;

    const EA = estoque.quantidade_atual;
    const PC = produto.preco_custo;

    const vendas30Dias = vendas.filter((v: Venda) =>
      differenceInDays(hoje, parseISO(v.data_venda)) <= 30
    );
    const totalVendido30 = vendas30Dias.reduce((acc: number, v: Venda) => acc + v.quantidade_vendida, 0);
    const VMD = totalVendido30 / 30 || 0.1;

    if (estoque.data_validade) {
      const dataValidade = parseISO(estoque.data_validade);
      const diasParaVencer = differenceInDays(dataValidade, hoje);

      if (diasParaVencer <= 30 && diasParaVencer >= 0) {
        const vendaEstimada = VMD * diasParaVencer;
        const qtdRisco = Math.max(0, EA - vendaEstimada);
        const valorRisco = qtdRisco * PC;

        if (qtdRisco > 0) {
          alertasParaInserir.push({
            cliente_id: clienteId,
            produto_id: produto.id,
            tipo: 'vencimento',
            mensagem: `${produto.nome} vence em ${diasParaVencer} dias. Risco de perda de ${Math.round(qtdRisco)} un (R$ ${valorRisco.toFixed(2)}).`,
            lido: false,
          });
        }
      }
    }

    const diasDeCobertura = EA / VMD;

    if (diasDeCobertura < 3) {
      alertasParaInserir.push({
        cliente_id: clienteId,
        produto_id: produto.id,
        tipo: 'ruptura',
        mensagem: `RUPTURA: ${produto.nome} deve zerar em menos de 3 dias!`,
        lido: false,
      });
    } else if (diasDeCobertura <= 7) {
      alertasParaInserir.push({
        cliente_id: clienteId,
        produto_id: produto.id,
        tipo: 'estoque_baixo',
        mensagem: `Estoque Baixo: ${produto.nome} tem apenas ${EA} un. Acaba em aprox. ${Math.round(diasDeCobertura)} dias.`,
        lido: false,
      });
    }

    const ultimaVenda = vendas.length > 0
      ? vendas.sort((a: Venda, b: Venda) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime())[0]
      : null;

    const diasSemVenda = ultimaVenda
      ? differenceInDays(hoje, parseISO(ultimaVenda.data_venda))
      : 999;

    if (diasSemVenda > 30 && EA > 0) {
      const capitalParado = EA * PC;
      alertasParaInserir.push({
        cliente_id: clienteId,
        produto_id: produto.id,
        tipo: 'estoque_parado',
        mensagem: `${produto.nome} sem vendas ha ${diasSemVenda === 999 ? 'mais de 30' : diasSemVenda} dias. R$ ${capitalParado.toFixed(2)} parados em estoque.`,
        lido: false,
      });
    }
  }

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
