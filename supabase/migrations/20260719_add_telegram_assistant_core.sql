-- Fase 3A: nucleo seguro do assistente inteligente no Telegram

CREATE TABLE IF NOT EXISTS public.telegram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_connections_chat_id
  ON public.telegram_connections (chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_connections_cliente_id
  ON public.telegram_connections (cliente_id);

ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  ultimo_periodo_inicio DATE,
  ultimo_periodo_fim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, telegram_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_cliente_chat
  ON public.assistant_conversations (cliente_id, telegram_chat_id);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation_created
  ON public.assistant_messages (conversation_id, created_at DESC);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_chat_id
  ON public.telegram_processed_updates (chat_id);

ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;

-- Sem policies publicas: acesso dessas tabelas ocorre apenas via backend com service role.
