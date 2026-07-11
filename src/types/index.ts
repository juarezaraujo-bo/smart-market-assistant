export type Cliente = {
  id: string;
  nome_mercado: string;
  responsavel: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  status: string;
  user_id: string;
  created_at: string;
};

export type Produto = {
  id: string;
  cliente_id: string;
  sku: string;
  nome: string;
  categoria: string;
  preco_custo: number;
  preco_venda: number;
  created_at: string;
};

export type Estoque = {
  id: string;
  produto_id: string;
  quantidade_atual: number;
  data_validade: string | null;
  last_updated: string;
};

export type Venda = {
  id: string;
  produto_id: string;
  quantidade_vendida: number;
  data_venda: string;
  valor_total: number;
};

export type Alerta = {
  id: string;
  cliente_id: string;
  produto_id: string;
  tipo: 'vencimento' | 'estoque_baixo' | 'estoque_parado' | 'ruptura';
  mensagem: string;
  lido: boolean;
  whatsapp_status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  whatsapp_tentativas: number;
  whatsapp_message_id?: string;
  whatsapp_data_envio?: string;
  whatsapp_ultimo_erro?: string;
  created_at: string;
  criticidade?: 'baixa' | 'media' | 'alta' | 'critica';
};
