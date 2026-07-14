import { NextResponse } from 'next/server';
import { processPendingTelegramAlerts } from '@/lib/telegramService';

// Preparado para proteção futura:
// const secret = process.env.TELEGRAM_PROCESS_SECRET;
// validar request.headers.get('authorization') ou query param antes de processar.
export async function GET() {
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
