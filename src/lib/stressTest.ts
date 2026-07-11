import { ExcelService } from './excelService';
import { runAnalysis } from './analysisEngine';
import { WhatsAppService } from './whatsappService';
import { supabase } from './supabase';
import { addDays, subDays, format } from 'date-fns';

export class StressTester {
  static async runFullTest(clienteId: string) {
    const report: any = {
      parser: {},
      engine: {},
      whatsapp: {},
      errors: []
    };

    console.log("Iniciando Teste de Estresse...");

    // 1. Gerar Massa de Dados (500 produtos)
    const mockData = this.generateMockData(500);
    
    // 2. Testar Parser
    const startParser = Date.now();
    const parserReport = (ExcelService as any).validateData(mockData);
    report.parser = {
      timeMs: Date.now() - startParser,
      total: parserReport.totalRows,
      valid: parserReport.validRows,
      rejected: parserReport.rejectedRows,
      errorSamples: parserReport.errors.slice(0, 5)
    };

    // 3. Simular Gravação no Banco (Lote)
    if (parserReport.validRows > 0) {
      await this.saveMockToDb(clienteId, parserReport.data);
    }

    // 4. Testar Motor de Alertas
    const startEngine = Date.now();
    const alertasGeradosCount = await runAnalysis(clienteId);
    report.engine = {
      timeMs: Date.now() - startEngine,
      totalAlertas: alertasGeradosCount
    };

    // 5. Testar Fila de WhatsApp (Simulado)
    const startWs = Date.now();
    // Rodar 3 vezes para testar proteção contra duplicidade
    await WhatsAppService.processPendingQueue();
    await WhatsAppService.processPendingQueue(); 
    
    const { data: logs } = await supabase
      .from('whatsapp_logs')
      .select('*')
      .eq('cliente_id', clienteId);

    const { data: alertsSent } = await supabase
      .from('alertas')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('whatsapp_status', 'sent');

    report.whatsapp = {
      timeMs: Date.now() - startWs,
      messagesInLog: logs?.length || 0,
      uniqueAlertsSent: alertsSent?.length || 0,
      duplicityPrevented: (logs?.length || 0) === (alertsSent?.length || 0)
    };

    return report;
  }

  private static generateMockData(count: number) {
    const data: any[] = [];
    const hoje = new Date();

    for (let i = 0; i < count; i++) {
      const isInvalid = i % 50 === 0; // 1 em cada 50 é propositalmente inválido
      
      data.push({
        produto: isInvalid ? "" : `Produto Stress Test ${i}`,
        categoria: "Teste",
        estoque: i % 10 === 0 ? -5 : Math.floor(Math.random() * 100), // Alguns negativos
        custo: Math.random() * 50,
        preco_venda: i % 20 === 0 ? 0 : Math.random() * 100 + 1, // Alguns preço zero
        validade: format(addDays(hoje, (i % 60) - 10), 'yyyy-MM-dd'), // Algumas datas passadas
        quantidade_vendida: Math.floor(Math.random() * 20),
        ultima_venda: i % 15 === 0 ? "" : format(subDays(hoje, Math.floor(Math.random() * 45)), 'yyyy-MM-dd')
      });
    }
    return data;
  }

  private static async saveMockToDb(clienteId: string, validData: any[]) {
    // Limpar dados de teste anteriores
    await supabase.from('produtos').delete().eq('cliente_id', clienteId);

    // Inserir produtos e estoque em massa (simplificado para o teste)
    for (const item of validData.slice(0, 100)) { // Limitar a 100 para não estourar tempo de resposta da API
      const { data: p } = await supabase.from('produtos').insert({
        cliente_id: clienteId,
        nome: item.produto,
        categoria: item.categoria,
        preco_custo: item.custo,
        preco_venda: item.preco_venda,
        sku: `STRESS_${Math.random().toString(36).substr(2, 5)}`
      }).select().single();

      if (p) {
        await supabase.from('estoque').insert({
          produto_id: p.id,
          quantidade_atual: item.estoque,
          data_validade: item.validade
        });
        
        if (item.quantidade_vendida > 0) {
          await supabase.from('vendas').insert({
            produto_id: p.id,
            quantidade_vendida: item.quantidade_vendida,
            data_venda: item.ultima_venda || format(new Date(), 'yyyy-MM-dd')
          });
        }
      }
    }
  }
}
