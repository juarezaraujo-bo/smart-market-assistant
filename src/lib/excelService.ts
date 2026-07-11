import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { z } from 'zod';

type RawRow = Record<string, unknown>;

export type ValidationError = {
  row: number;
  field: string;
  value?: unknown;
  message: string;
};

export type ParserDiagnostics = {
  detectedHeaders: string[];
  normalizedHeaders: string[];
  firstRawRow: RawRow | null;
  firstNormalizedRow: RawRow | null;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeHeader(header: string) {
  return String(header)
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCellValue(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.replace(/^\uFEFF/, '').trim();
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const normalized = value
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');

  return normalized === '' ? value : Number(normalized);
}

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateOnlySchema = z.preprocess(
  normalizeCellValue,
  z.string().refine(isValidDateOnly, {
    message: 'Data invalida. Use o formato YYYY-MM-DD.',
  })
);

export const ProductRowSchema = z.object({
  produto: z.preprocess(
    normalizeCellValue,
    z.string().min(1, 'O nome do produto e obrigatorio').trim()
  ),
  categoria: z.preprocess(
    normalizeCellValue,
    z.string().min(1, 'A categoria e obrigatoria').trim()
  ),
  estoque: z.preprocess(
    parseNumber,
    z.number({ error: 'Estoque deve ser numerico' }).min(0, 'Estoque nao pode ser negativo')
  ),
  custo: z.preprocess(
    parseNumber,
    z.number({ error: 'Custo deve ser numerico' }).min(0, 'Custo nao pode ser negativo')
  ),
  preco_venda: z.preprocess(
    parseNumber,
    z.number({ error: 'Preco de venda deve ser numerico' }).gt(0, 'Preco de venda deve ser maior que zero')
  ),
  validade: dateOnlySchema,
  quantidade_vendida: z.preprocess(
    parseNumber,
    z.number({ error: 'Quantidade vendida deve ser numerica' }).min(0, 'Quantidade vendida nao pode ser negativa')
  ),
  ultima_venda: z.preprocess(
    (value) => {
      const normalized = normalizeCellValue(value);
      return normalized === '' || normalized === undefined ? null : normalized;
    },
    z.string()
      .refine(isValidDateOnly, { message: 'Data da ultima venda invalida. Use o formato YYYY-MM-DD.' })
      .nullable()
  ),
});

export type ProductRow = z.infer<typeof ProductRowSchema>;

export interface ValidationReport {
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  errors: ValidationError[];
  data: ProductRow[];
  status: 'success' | 'partial' | 'failed';
  diagnostics: ParserDiagnostics;
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

  static async parseFile(file: File): Promise<ValidationReport> {
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
      throw new Error('Formato de arquivo nao suportado. Utilize .xlsx ou .csv');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Arquivo muito grande. O limite e de 5MB.');
    }

    const buffer = await file.arrayBuffer();
    let rawData: RawRow[] = [];

    try {
      if (isCsv) {
        const text = new TextDecoder('utf-8').decode(buffer);
        const result = Papa.parse<RawRow>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeHeader,
        });

        if (result.errors.length > 0) {
          throw new Error(result.errors.map((error) => error.message).join('; '));
        }

        rawData = result.data;
      } else {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rawData = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: '' });
      }
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Falha ao ler o arquivo. Verifique se ele nao esta corrompido.${detail}`);
    }

    return this.validateData(rawData);
  }

  private static normalizeRow(row: RawRow) {
    const normalized: RawRow = {};

    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = normalizeCellValue(value);
    });

    return normalized;
  }

  private static createEmptyReport(rawData: RawRow[]): ValidationReport {
    const firstRawRow = rawData[0] || null;
    const firstNormalizedRow = firstRawRow ? this.normalizeRow(firstRawRow) : null;
    const detectedHeaders = firstRawRow ? Object.keys(firstRawRow) : [];

    return {
      totalRows: rawData.length,
      validRows: 0,
      rejectedRows: 0,
      errors: [],
      data: [],
      status: 'failed',
      diagnostics: {
        detectedHeaders,
        normalizedHeaders: detectedHeaders.map(normalizeHeader),
        firstRawRow,
        firstNormalizedRow,
      },
    };
  }

  private static validateData(rawData: RawRow[]): ValidationReport {
    const report = this.createEmptyReport(rawData);

    if (rawData.length === 0) {
      report.errors.push({ row: 0, field: 'arquivo', message: 'O arquivo esta vazio.' });
      return report;
    }

    const headers = report.diagnostics.normalizedHeaders;
    const missing = this.MANDATORY_HEADERS.filter((header) => !headers.includes(header));

    if (missing.length > 0) {
      report.errors.push({
        row: 1,
        field: 'cabecalhos',
        value: headers,
        message: `Colunas obrigatorias ausentes: ${missing.join(', ')}`,
      });
      return report;
    }

    rawData.forEach((row, index) => {
      const normalizedRow = this.normalizeRow(row);
      const result = ProductRowSchema.safeParse(normalizedRow);

      if (result.success) {
        report.data.push(result.data);
        report.validRows++;
        return;
      }

      report.rejectedRows++;
      result.error.issues.forEach((issue) => {
        const field = String(issue.path[0] || 'linha');
        report.errors.push({
          row: index + 2,
          field,
          value: normalizedRow[field],
          message: issue.message,
        });
      });
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
