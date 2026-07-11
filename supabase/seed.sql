-- INSTRUÇÕES:
-- 1. Acesse o Dashboard do Supabase (https://supabase.com/dashboard)
-- 2. Vá em 'SQL Editor'
-- 3. Cole o script abaixo e clique em 'Run'
-- Este script cria o usuário admin e vincula ao perfil de cliente inicial.

-- 1. Criar Usuário Admin no Auth (Senha: Smart123@)
-- O ID gerado será usado na tabela de clientes.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, recovery_token)
VALUES (
    '00000000-0000-0000-0000-000000000000', -- ID Fixo para o Admin
    'admin@smartmarket.local',
    crypt('Smart123@', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Administrador SmartMarket"}',
    now(),
    now(),
    'authenticated',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- 2. Criar Identidade do Usuário
INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000000', 'admin@smartmarket.local')::jsonb,
    'email',
    now(),
    now(),
    now()
) ON CONFLICT DO NOTHING;

-- 3. Vincular Usuário ao Perfil de Cliente (Mercadinho)
INSERT INTO public.clientes (id, user_id, nome_mercado, responsavel, whatsapp, cidade, uf, status)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'Mercadinho Central',
    'Admin SmartMarket',
    '5511999999999',
    'São Paulo',
    'SP',
    'ativo'
) ON CONFLICT DO NOTHING;
