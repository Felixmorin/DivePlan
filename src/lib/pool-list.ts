export type PoolListRow = {
  id: string;
  context: string;
  diveCodes: string[];
  repetitions: number[];
};

export type PoolListRowValidation = {
  row: PoolListRow;
  errors: string[];
  heightCount: number;
  total: number;
};

export function parseDiveCodes(value: string) {
  return value.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
}

export function parseRepetitions(value: string) {
  if (!value.trim()) return [];
  return value.split(",").map((item) => {
    const text = item.trim();
    return /^\d+$/.test(text) ? Number(text) : Number.NaN;
  });
}

export function parseQuickPoolLine(description: string, repetitions: string, id = "row"): PoolListRowValidation {
  const separator = description.indexOf(":");
  const context = (separator >= 0 ? description.slice(0, separator) : "").trim();
  const diveText = separator >= 0 ? description.slice(separator + 1) : description;
  return validatePoolListRow({ id, context, diveCodes: parseDiveCodes(diveText), repetitions: parseRepetitions(repetitions) });
}

export function countPoolContexts(context: string) {
  const normalized = context.trim();
  if (!normalized) return 0;
  return normalized.split(/\s*(?:-|,)\s*(?=\d+\s*m\b)/i).map((item) => item.trim()).filter(Boolean).length;
}

export function validatePoolListRow(row: PoolListRow): PoolListRowValidation {
  const errors: string[] = [];
  const heightCount = countPoolContexts(row.context);
  if (heightCount === 0) errors.push("Indique au moins une hauteur ou un contexte avant les deux-points.");
  if (row.diveCodes.length === 0 || row.diveCodes.some((code) => !code.trim())) errors.push("Ajoute au moins un plongeon non vide.");
  if (row.repetitions.some((value) => !Number.isInteger(value) || value < 0)) errors.push("Chaque repetition doit etre un nombre entier positif ou zero.");
  if (row.repetitions.length !== 1 && row.repetitions.length !== row.diveCodes.length) {
    errors.push(`Indique une repetition commune ou exactement ${row.diveCodes.length} repetitions.`);
  }
  const repetitions = row.repetitions.length === 1 ? row.diveCodes.map(() => row.repetitions[0]) : row.repetitions;
  const total = errors.length === 0 ? heightCount * repetitions.reduce((sum, value) => sum + value, 0) : 0;
  return { row, errors, heightCount, total };
}

export function poolListTotal(rows: PoolListRow[]) {
  return rows.reduce((sum, row) => sum + validatePoolListRow(row).total, 0);
}
