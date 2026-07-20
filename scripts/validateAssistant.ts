import { createClient } from '@supabase/supabase-js';
import { runSmartMarketAssistant } from '../src/lib/assistant/assistantOrchestrator';

type Cliente = {
  id: string;
  nome_mercado: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

async function main() {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const email = requiredEnv('SMARTMARKET_VALIDATE_EMAIL');
  const password = requiredEnv('SMARTMARKET_VALIDATE_PASSWORD');
  const question = process.env.SMARTMARKET_VALIDATE_QUESTION || 'Quais sao as maiores prioridades deste mes?';
  const conversationKey = process.env.SMARTMARKET_VALIDATE_CONVERSATION_KEY || 'validation-script';

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message || 'Falha ao autenticar usuario de validacao.');
  }

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, nome_mercado')
    .eq('user_id', authData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (clienteError) throw new Error(clienteError.message);
  if (!cliente) throw new Error('Mercado nao encontrado para usuario de validacao.');

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const startedAt = Date.now();
  const result = await runSmartMarketAssistant({
    clienteId: (cliente as Cliente).id,
    chatId: `validation:${conversationKey}`,
    userText: question,
    supabase: adminSupabase,
  });

  console.log('Pergunta:', question);
  console.log('Mercado:', (cliente as Cliente).nome_mercado);
  console.log('Modelo:', result.model || 'fallback');
  console.log('Fallback:', result.usedFallback);
  console.log('Ferramentas:', result.toolCalls.map((call) => call.name).join(', ') || 'nenhuma');
  console.log('Chamadas:', result.toolCalls.length);
  console.log('Duracao ms:', Date.now() - startedAt);
  if (result.usage) console.log('Tokens:', JSON.stringify(result.usage));
  console.log('');
  console.log(result.message);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Erro desconhecido.');
  process.exitCode = 1;
});
