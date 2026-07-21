export type NormalizedIntentText = {
  original: string;
  normalized: string;
};

export function normalizeIntentText(value: string): NormalizedIntentText {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[?!.,;:()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    original: value,
    normalized,
  };
}

export function singularizeIntentTerm(value: string) {
  if (value.length > 4 && value.endsWith('es')) return value.slice(0, -2);
  if (value.length > 3 && value.endsWith('s')) return value.slice(0, -1);
  return value;
}

export function cleanIntentTerm(value: string) {
  return singularizeIntentTerm(
    normalizeIntentText(value).normalized
      .replace(/^(umas|uns|uma|um|as|os|a|o)\s+/, '')
      .trim()
  );
}
