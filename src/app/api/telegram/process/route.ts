import { NextRequest, NextResponse } from 'next/server';
import { processPendingTelegramAlerts } from '@/lib/telegramService';

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim();
}

function validateProcessSecret(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_PROCESS_SECRET;

  if (!configuredSecret) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        status: 503,
        message: 'TELEGRAM_PROCESS_SECRET não configurado.',
      };
    }

    return { ok: true };
  }

  const urlSecret = request.nextUrl.searchParams.get('secret');
  const bearerSecret = getBearerToken(request);
  const providedSecret = urlSecret || bearerSecret;

  if (!providedSecret || providedSecret !== configuredSecret) {
    return {
      ok: false,
      status: 401,
      message: 'Segredo de processamento Telegram ausente ou inválido.',
    };
  }

  return { ok: true };
}

export async function GET(request: NextRequest) {
  const secretValidation = validateProcessSecret(request);

  if (!secretValidation.ok) {
    return NextResponse.json({
      success: false,
      message: secretValidation.message,
    }, { status: secretValidation.status });
  }

  try {
    const result = await processPendingTelegramAlerts();

    return NextResponse.json({
      success: true,
      message: 'Processamento de alertas Telegram concluído.',
      total_enviados: result.sent,
      total_falhas: result.failed,
      total_processados: result.total,
      detalhes: result.details,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Falha ao processar alertas Telegram.',
      error: error instanceof Error ? error.message : 'Erro desconhecido.',
    }, { status: 500 });
  }
}
