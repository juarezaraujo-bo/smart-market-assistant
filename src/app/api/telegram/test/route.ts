import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegramService';

export async function GET() {
  try {
    await sendTelegramMessage('✅ SmartMarket conectado ao Telegram com sucesso.');

    return NextResponse.json({
      success: true,
      message: 'Mensagem de teste enviada para o Telegram.',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Falha ao enviar mensagem de teste para o Telegram.',
      error: error instanceof Error ? error.message : 'Erro desconhecido.',
    }, { status: 500 });
  }
}
