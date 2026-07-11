import { NextRequest, NextResponse } from 'next/server';
import { StressTester } from '@/lib/stressTest';

/**
 * Rota de Diagnóstico e Teste de Estresse.
 * ATENÇÃO: Esta rota limpa dados de teste e gera massa fictícia.
 */
export async function GET(req: NextRequest) {
  try {
    // Usamos um ID de cliente fixo para o teste de estresse
    const TEST_CLIENTE_ID = '00000000-0000-0000-0000-000000000000';

    const report = await StressTester.runFullTest(TEST_CLIENTE_ID);

    return NextResponse.json({
      message: "Teste de estresse concluído com sucesso.",
      timestamp: new Date().toISOString(),
      report
    });

  } catch (error: any) {
    console.error('Stress Test Critical Failure:', error);
    return NextResponse.json({ 
      error: 'Falha crítica ao executar teste de estresse.',
      details: error.message 
    }, { status: 500 });
  }
}
