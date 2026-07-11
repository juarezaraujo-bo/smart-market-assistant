import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { z } from 'zod';

/**
 * Schema de validação rigorosa utilizando Zod.
 * Garante que tipos e regras de negócio sejam respeitados.
 */
export const ProductRowSchema = z.object({
  produto: z.string().min(1, "O nome do produto é obrigatório").trim(),
  categoria: z.string().min(1, "A categoria é obrigatória").trim(),
  estoque: z.coerce.number().min(0, "Estoque não pode ser negativo"),
  custo: z.coerce.number().min(0, "Custo não pode ser negativo"),
  preco_venda: z.coerce.number().gt(0, "Preço de venda deve ser maior que zero"),
  validade: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Data de validade inválida (Use o formato AAAA-MM-DD)",
  }),
  quantidade_vendida: z.coerce.number().min(0, "Quantidade vendida não pode ser negativa"),
  ultima_venda: z.string().optional().nullable().transform(val => val === '' ? null : val).refine(
    (val) => !val || !isNaN(Date.parse(val)),
    { message: "Data da última venda inválida" }
  ),
});

export type ProductRow = z.infer<typeof ProductRowSchema>;

export interface ValidationReport {
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  errors: { row: number; field: string; message: string }[];
  data: ProductRow[];
  status: 'success' | 'partial' | 'failed';
}

export class ExcelService {
  private static MANDATORY_HEADERS = [
    'produto',
    'categoria',
    'estoque',
    'custo',
    'preco_venda',
    'validade',
    'quantidade_vendida',
    'ultima_venda',
  ];

  /**
   * Processa o arquivo (Excel ou CSV) e retorna um relatório de validação.
   */
  static async parseFile(file: File): Promise<ValidationReport> {
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
      throw new Error("Formato de arquivo não suportado. Utilize .xlsx ou .csv");
    }

    // Limite de 5MB para o MVP
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Arquivo muito grande. O limite é de 5MB.");
    }

    const buffer = await file.arrayBuffer();
    let rawData: any[] = [];

    try {
      if (isCsv) {
        const text = new TextDecoder().decode(buffer);
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = result.data;
      } else {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      }
    } catch (error) {
      throw new Error("Falha ao ler o arquivo. Verifique se ele não está corrompido.");
    }

    return this.validateData(rawData);
  }

  private static validateData(rawData: any[]): ValidationReport {
    const report: ValidationReport = {
      totalRows: rawData.length,
      validRows: 0,
      rejectedRows: 0,
      errors: [],
      data: [],
      status: 'failed',
    };

    if (rawData.length === 0) {
      report.errors.push({ row: 0, field: 'arquivo', message: "O arquivo está vazio." });
      return report;
    }

    // Validar presença de cabeçalhos obrigatórios
    const headers = Object.keys(rawData[0]).map(h => h.trim().toLowerCase());
    const missing = this.MANDATORY_HEADERS.filter(h => !headers.includes(h));

    if (missing.length > 0) {
      report.errors.push({
        row: 1,
        field: 'cabeçalhos',
        message: `Colunas obrigatórias ausentes: ${missing.join(', ')}`,
      });
      return report;
    }

    // Iterar e validar cada linha
    rawData.forEach((row, index) => {
      // Normalizar chaves para lowercase e remover espaços (Sanitização)
      const sanitizedRow: any = {};
      Object.keys(row).forEach(key => {
        sanitizedRow[key.trim().toLowerCase()] = row[key];
      });

      const result = ProductRowSchema.safeParse(sanitizedRow);

      if (result.success) {
        report.data.push(result.data);
        report.validRows++;
      } else {
        report.rejectedRows++;
        result.error.issues.forEach((issue) => {
          report.errors.push({
            row: index + 2, // Linha real na planilha (1-based + header)
            field: issue.path[0].toString(),
            message: issue.message,
          });
        });
      }
    });

    if (report.validRows === report.totalRows) {
      report.status = 'success';
    } else if (report.validRows > 0) {
      report.status = 'partial';
    } else {
      report.status = 'failed';
    }

    return report;
  }
}
