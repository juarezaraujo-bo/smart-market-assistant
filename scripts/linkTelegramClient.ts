import { createClient } from '@supabase/supabase-js';

type Cliente = {
  id: string;
  nome_mercado: string;
  user_id: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

async function main() {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const email = requiredEnv('SMARTMARKET_LINK_EMAIL');
  const chatId = requiredEnv('SMARTMARKET_LINK_CHAT_ID');
  const telegramUsername = process.env.SMARTMARKET_LINK_TELEGRAM_USERNAME || null;
  const explicitClientId = process.env.SMARTMARKET_LINK_CLIENT_ID || null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw new Error(userError.message);

  const user = userData.users.find((item) => item.email === email);
  if (!user) throw new Error('Usuario nao encontrado pelo e-mail informado.');

  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .select('id, nome_mercado, user_id')
    .eq('user_id', user.id);

  if (clientesError) throw new Error(clientesError.message);
  const clientRows = (clientes || []) as Cliente[];

  if (clientRows.length === 0) throw new Error('Nenhum mercado encontrado para o usuario.');

  let selected: Cliente | undefined;
  if (clientRows.length === 1) {
    selected = clientRows[0];
  } else if (explicitClientId) {
    selected = clientRows.find((cliente) => cliente.id === explicitClientId);
    if (!selected) throw new Error('SMARTMARKET_LINK_CLIENT_ID nao corresponde a um mercado do usuario.');
  } else {
    console.log('Mais de um mercado encontrado. Configure SMARTMARKET_LINK_CLIENT_ID com um dos IDs abaixo:');
    for (const cliente of clientRows) {
      console.log(`- ${cliente.nome_mercado}: ${cliente.id}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Mercado vinculado: ${selected.nome_mercado} (${selected.id})`);

  const { error: upsertError } = await supabase
    .from('telegram_connections')
    .upsert({
      cliente_id: selected.id,
      chat_id: chatId,
      telegram_username: telegramUsername,
      ativo: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

  if (upsertError) throw new Error(upsertError.message);
  console.log('Vinculo Telegram criado/atualizado com sucesso.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Erro desconhecido.');
  process.exitCode = 1;
});
