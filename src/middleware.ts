import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Validação estrita da URL para evitar erro "Invalid supabaseUrl"
  let envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
    envUrl = 'https://example.supabase.co'; // Fallback se totalmente malformado
  }

  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'SUA_ANON_KEY_REAL';

  const supabase = createServerClient(
    envUrl,
    envKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const protectedRoutes = [
    '/dashboard',
    '/inventory',
    '/alerts',
    '/uploads',
    '/markets',
    '/logs',
    '/settings',
  ]

  const isProtectedPage = protectedRoutes.some((route) => (
    request.nextUrl.pathname === route ||
    request.nextUrl.pathname.startsWith(`${route}/`)
  ))
  const isLoginPage = request.nextUrl.pathname === '/login'

  // 1. Proteção de rota: Se não houver sessão e estiver tentando acessar o dashboard
  if (!session && isProtectedPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. Redirecionamento inverso: Se já houver sessão e estiver no login
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/inventory/:path*',
    '/alerts/:path*',
    '/uploads/:path*',
    '/markets/:path*',
    '/logs/:path*',
    '/settings/:path*',
    '/login'
  ],
}
