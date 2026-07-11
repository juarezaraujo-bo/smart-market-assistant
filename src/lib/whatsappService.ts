import { supabase } from './supabase';

/**
 * Serviço responsável por gerenciar o envio de mensagens via WhatsApp
 * garantindo que não haja duplicidade e mantendo logs de auditoria.
 */
export class WhatsAppService {
  /**
   * Processa a fila de alertas pendentes para todos os clientes.
   * Utiliza trava atômica para permitir escalabilidade sem duplicidade.
   */
  static async processPendingQueue() {
    // 1. Buscar alertas elegíveis (pendentes ou falhas com < 3 tentativas)
    const { data: alerts, error } = await supabase
      .from('alertas')
      .select(`
        *,
        clientes:cliente_id (
          whatsapp,
          nome_mercado,
          responsavel
        )
      `)
      .or('whatsapp_status.eq.pending,whatsapp_status.eq.failed')
      .lt('whatsapp_tentativas', 3)
      .limit(20); // Processar em lotes para evitar timeout

    if (error) {
      console.error('Erro ao buscar fila de WhatsApp:', error);
      return;
    }

    if (!alerts || alerts.length === 0) return;

    // Processar cada alerta sequencialmente (ou em paralelo controlado)
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * Envia um único alerta com proteção contra duplicidade.
   */
  private static async sendAlert(alert: any) {
    // 2. LOCK ATÔMICO: Tentar marcar como 'processing'
    // Esta query garante que apenas um worker processe este alerta por vez.
    const { data: reserved, error: lockError } = await supabase
      .from('alertas')
      .update({ 
        whatsapp_status: 'processing',
        whatsapp_tentativas: alert.whatsapp_tentativas + 1 
      })
      .eq('id', alert.id)
      .in('whatsapp_status', ['pending', 'failed']) // Só reserva se ainda for elegível
      .select()
      .single();

    // Se não retornar nada, outro processo já o capturou
    if (lockError || !reserved) {
      return;
    }

    try {
      // 3. Executar envio para Evolution API
      const result = await this.executeEvolutionApiCall(alert);

      // 4. SUCESSO: Marcar como 'sent'
      await supabase
        .from('alertas')
        .update({
          whatsapp_status: 'sent',
          whatsapp_message_id: result.messageId,
          whatsapp_data_envio: new Date().toISOString(),
          whatsapp_ultimo_erro: null
        })
        .eq('id', alert.id);

      // Logar sucesso
      await this.logEvent(alert, 200, result);

    } catch (error: any) {
      // 5. FALHA: Marcar como 'failed' para retentativa futura
      await supabase
        .from('alertas')
        .update({
          whatsapp_status: 'failed',
          whatsapp_ultimo_erro: error.message
        })
        .eq('id', alert.id);

      // Logar erro
      await this.logEvent(alert, 500, null, error.message);
    }
  }

  /**
   * Chamada real para a Evolution API.
   * As chaves são lidas apenas no servidor (Segurança).
   */
  private static async executeEvolutionApiCall(alert: any) {
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_API_INSTANCE;

    if (!apiUrl || !apiKey || !instance) {
      throw new Error("Configuração da Evolution API incompleta no servidor.");
    }

    const destination = alert.clientes.whatsapp.replace(/\D/g, ''); // Sanitizar número
    
    // Mock da chamada para exemplo (em prod seria fetch)
    console.log(`[WhatsAppService] Enviando para ${destination}: ${alert.mensagem}`);
    
    // Simular processamento da API
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simular retorno de sucesso
    return { 
      messageId: `BAE5${Math.random().toString(36).substring(7).toUpperCase()}`,
      status: 'success'
    };
  }

  /**
   * Registra o evento na tabela de auditoria.
   */
  private static async logEvent(alert: any, status: number, response: any, error?: string) {
    await supabase.from('whatsapp_logs').insert({
      alerta_id: alert.id,
      cliente_id: alert.cliente_id,
      telefone_destino: alert.clientes.whatsapp,
      status_api: status,
      resposta_api: response,
      erro: error
    });
  }
}
