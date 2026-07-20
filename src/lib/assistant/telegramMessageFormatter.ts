const TELEGRAM_MESSAGE_LIMIT = 3800;

const PRESENTATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bperiodo\b/g, 'período'],
  [/\bperiodos\b/g, 'períodos'],
  [/\bdisponivel\b/g, 'disponível'],
  [/\bdisponiveis\b/g, 'disponíveis'],
  [/\bpromocao\b/g, 'promoção'],
  [/\bpromocoes\b/g, 'promoções'],
  [/\breposicao\b/g, 'reposição'],
  [/\bacao\b/g, 'ação'],
  [/\bacoes\b/g, 'ações'],
  [/\brecomendacao\b/g, 'recomendação'],
  [/\brecomendacoes\b/g, 'recomendações'],
  [/\bcritica\b/g, 'crítica'],
  [/\bcriticas\b/g, 'críticas'],
  [/\banalise\b/g, 'análise'],
  [/\bdeterministica\b/g, 'determinística'],
  [/\bdeterministicas\b/g, 'determinísticas'],
];

export function formatAssistantPresentationText(message: string) {
  return PRESENTATION_REPLACEMENTS.reduce(
    (formatted, [pattern, replacement]) => formatted.replace(pattern, replacement),
    message
  );
}

export function sanitizeTelegramText(message: string) {
  return formatAssistantPresentationText(message)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function splitAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return [text, ''];

  const paragraphIndex = text.lastIndexOf('\n\n', maxLength);
  if (paragraphIndex > 0) {
    return [text.slice(0, paragraphIndex), text.slice(paragraphIndex).trimStart()];
  }

  const lineIndex = text.lastIndexOf('\n', maxLength);
  if (lineIndex > 0) {
    return [text.slice(0, lineIndex), text.slice(lineIndex).trimStart()];
  }

  const spaceIndex = text.lastIndexOf(' ', maxLength);
  if (spaceIndex > 0) {
    return [text.slice(0, spaceIndex), text.slice(spaceIndex).trimStart()];
  }

  return [text.slice(0, maxLength), text.slice(maxLength)];
}

export function splitTelegramMessage(message: string, maxLength = TELEGRAM_MESSAGE_LIMIT) {
  const parts: string[] = [];
  let remaining = sanitizeTelegramText(message);

  while (remaining.length > maxLength) {
    const [part, rest] = splitAtBoundary(remaining, maxLength);
    parts.push(part.trim());
    remaining = rest.trim();
  }

  if (remaining) parts.push(remaining);
  return parts.length > 0 ? parts : [''];
}

export function limitAssistantAnswer(message: string, maxLength = 3500) {
  const clean = sanitizeTelegramText(message);
  if (clean.length <= maxLength) return clean;
  const [part] = splitAtBoundary(clean, maxLength);
  return `${part.trim()}\n\nResposta encurtada para caber no Telegram.`;
}
