import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Validação de inicialização (Safety Check estrito para URL HTTP válida)
const isValidHttpUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');

export const isConfigured = 
  isValidHttpUrl && 
  rawKey && 
  !rawUrl.includes('example.supabase.co') && 
  !rawUrl.includes('SEU-PROJETO') && 
  !rawKey.includes('example_key') &&
  !rawKey.includes('SUA_ANON_KEY_REAL')

if (!isConfigured && typeof window !== 'undefined') {
  console.warn(
    '⚠️ SUPABASE NÃO CONFIGURADO: Verifique seu arquivo .env.local e insira as chaves reais do seu projeto Supabase. O sistema está usando credenciais temporárias para evitar crash.'
  )
}

// Fallback seguro se a URL não for HTTP/HTTPS válida
const supabaseUrl = isValidHttpUrl ? rawUrl : 'https://example.supabase.co'
const supabaseAnonKey = rawKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'

let browserClient: SupabaseClient | undefined

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }

  return browserClient
}

export const supabase = getSupabaseBrowserClient()
