import * as XLSX from "xlsx";

const normalizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  return value;
};

export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

export interface ParsedTable {
  headers: string[];
  rows: Record<string, unknown>[];
  /** Text found above the header row — usually the client/company name of the sheet. */
  sheetTitle: string | null;
  /** Every non-tabular line above the header row. */
  metadataRows: string[];
  /** Non-tabular lines below the header row (footnotes such as engine/oil facts). */
  footnotes: string[];
  /** Rows discarded because they carried no vehicle identity and no real data. */
  droppedRows: number;
}

/** Header names that identify a vehicle roster header row. */
const HEADER_HINTS: RegExp[] = [
  /\bvin\b/i,
  /vehicle\s*identification/i,
  /\bplate\b/i,
  /\btag\b/i,
  /\byear\b/i,
  /\bmake\b/i,
  /\bmodel\b/i,
  /\bunit\b/i,
  /install.*acct/i,
  /\bmileage\b/i,
  /\bodometer\b/i,
  /\bcolor\b/i,
  /\bengine\b/i,
  /\bvan\s*#/i,
  /\basset\b/i,
];

const IDENTITY_HEADER = /\bvin\b|vehicle\s*identification|\bplate\b|\btag\b|\bunit\b|install.*acct|\bvan\b|\basset\b|\btruck\b/i;

const cell = (value: unknown): string => String(normalizeValue(value) ?? "").trim();

function headerScore(row: unknown[]): number {
  const values = row.map(cell).filter(Boolean);
  if (values.length < 2) return 0;
  let hits = 0;
  for (const value of values) {
    if (HEADER_HINTS.some((pattern) => pattern.test(value))) hits += 1;
  }
  return hits;
}

/**
 * Real client lists rarely start with headers — row 1 is often the company name.
 * Scan the first rows and pick the one that reads most like a header row.
 */
export function detectHeaderRow(matrix: unknown[][], lookahead = 10): number {
  let bestIndex = 0;
  let bestScore = -1;
  const limit = Math.min(lookahead, matrix.length);
  for (let index = 0; index < limit; index += 1) {
    const score = headerScore(matrix[index] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

/** Build unique, non-empty header labels from the detected header row. */
function buildHeaders(headerRow: unknown[], width: number): string[] {
  const used = new Set<string>();
  const headers: string[] = [];
  for (let index = 0; index < width; index += 1) {
    let label = cell(headerRow[index]);
    if (!label) label = `Column ${index + 1}`;
    let candidate = label;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${label} (${suffix})`;
      suffix += 1;
    }
    used.add(candidate);
    headers.push(candidate);
  }
  return headers;
}

function matrixToTable(matrix: unknown[][]): ParsedTable {
  const cleanedMatrix = matrix.filter((row) => Array.isArray(row));
  const headerIndex = detectHeaderRow(cleanedMatrix);
  const metadataRows = cleanedMatrix
    .slice(0, headerIndex)
    .map((row) => row.map(cell).filter(Boolean).join(" | "))
    .filter(Boolean);

  const headerRow = cleanedMatrix[headerIndex] || [];
  const bodyRows = cleanedMatrix.slice(headerIndex + 1);
  const width = Math.max(headerRow.length, ...bodyRows.map((row) => row.length), 1);
  const headers = buildHeaders(headerRow, width);
  const identityColumns = headers
    .map((header, index) => ({ header, index }))
    .filter((entry) => IDENTITY_HEADER.test(entry.header));

  const rows: Record<string, unknown>[] = [];
  const footnotes: string[] = [];
  let droppedRows = 0;

  for (const raw of bodyRows) {
    const values = headers.map((_, index) => normalizeValue(raw[index] ?? ""));
    const filled = values.filter((value) => String(value).trim()).length;
    if (filled === 0) continue;

    const hasIdentity = identityColumns.length
      ? identityColumns.some((entry) => String(values[entry.index] ?? "").trim())
      : filled >= 2;

    if (!hasIdentity || filled < 2) {
      droppedRows += 1;
      const text = values.map((value) => String(value).trim()).filter(Boolean).join(" ");
      if (text) footnotes.push(text);
      continue;
    }

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    rows.push(row);
  }

  return {
    headers,
    rows,
    sheetTitle: metadataRows[0] ? cleanSheetTitle(metadataRows[0]) : null,
    metadataRows,
    footnotes,
    droppedRows,
  };
}

/** "CLOSETS BY DESIGN - VEHICLE INFO -11/30/23 | | |" → "Closets By Design" */
export function cleanSheetTitle(raw: string): string {
  const firstSegment = raw.split("|")[0] || raw;
  const withoutDates = firstSegment.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, " ");
  const withoutLabels = withoutDates.replace(/vehicle\s*info(rmation)?|vehicle\s*list|fleet\s*list|roster/gi, " ");
  const cleaned = withoutLabels.replace(/[-–—:]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return firstSegment.trim();
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(" ");
}

export async function parseImportFile(file: File): Promise<ParsedTable & { fileType: "csv" | "xlsx" }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true });
  const lower = file.name.toLowerCase();
  const fileType = lower.endsWith(".csv") ? "csv" : "xlsx";
  return { ...matrixToTable(matrix), fileType };
}

/** Split a pasted line on tabs, falling back to commas for CSV pastes. */
function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  return line.split(",");
}

export function parsePastedTable(input: string): ParsedTable {
  const lines = input.split(/\r?\n/);
  if (!lines.some((line) => line.trim())) {
    return { headers: [], rows: [], sheetTitle: null, metadataRows: [], footnotes: [], droppedRows: 0 };
  }
  const matrix = lines.map((line) => splitLine(line).map((value) => value.trim()));
  return matrixToTable(matrix);
}
