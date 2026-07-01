import { sanitizeBusinessDate } from './safeDate.ts';

export const ingestionSourceTypes = [
  'manual-note',
  'quick-capture',
  'pasted-email',
  'pasted-thread',
  'meeting-recap',
  'calendar-placeholder',
  'csv-import',
  'future-zalo-paste',
] as const;

export type IngestionSourceType = typeof ingestionSourceTypes[number];

export type IngestedSourceItem = {
  sourceType: IngestionSourceType;
  sourceLabel: string;
  sourceTimestamp?: string;
  sender?: string;
  recipients?: string;
  subject?: string;
  originalExcerpt: string;
  safeHash: string;
  rawText: string;
  createdAt: string;
  userId?: string;
};

export type EmailThreadIngestionInput = {
  sourceType?: Extract<IngestionSourceType, 'pasted-email' | 'pasted-thread'>;
  subject?: string;
  sender?: string;
  recipients?: string;
  body: string;
  sourceDate?: string;
  accountHint?: string;
  opportunityHint?: string;
  userId?: string;
};

export function buildIngestedSourceItem(input: {
  sourceType: IngestionSourceType;
  rawText: string;
  sourceLabel?: string;
  sourceTimestamp?: string;
  sender?: string;
  recipients?: string;
  subject?: string;
  userId?: string;
  createdAt?: string;
}): IngestedSourceItem {
  const rawText = compactWhitespace(input.rawText);
  const subject = cleanValue(input.subject);
  const sender = cleanValue(input.sender);
  const recipients = cleanValue(input.recipients);
  const originalExcerpt = getSafeIngestionExcerpt(rawText);
  const sourceLabel = cleanValue(input.sourceLabel)
    || formatIngestionSourceLabel({
      sourceType: input.sourceType,
      subject,
      sender,
    });

  return {
    sourceType: input.sourceType,
    sourceLabel,
    ...(sanitizeBusinessDate(input.sourceTimestamp) ? { sourceTimestamp: sanitizeBusinessDate(input.sourceTimestamp) } : {}),
    ...(sender ? { sender } : {}),
    ...(recipients ? { recipients } : {}),
    ...(subject ? { subject } : {}),
    originalExcerpt,
    safeHash: hashIngestionText(rawText),
    rawText,
    createdAt: input.createdAt || new Date().toISOString(),
    ...(input.userId ? { userId: input.userId } : {}),
  };
}

export function buildEmailThreadIngestion(input: EmailThreadIngestionInput): IngestedSourceItem {
  const sourceType = input.sourceType || 'pasted-email';
  return buildIngestedSourceItem({
    sourceType,
    rawText: input.body,
    subject: input.subject,
    sender: input.sender,
    recipients: input.recipients,
    sourceTimestamp: input.sourceDate,
    userId: input.userId,
  });
}

export function composeIngestionParserText(
  item: IngestedSourceItem,
  hints: { accountHint?: string; opportunityHint?: string } = {},
) {
  const lines = [
    `Source type: ${item.sourceType}`,
    `Source label: ${item.sourceLabel}`,
    item.sourceTimestamp ? `Source date: ${item.sourceTimestamp}` : '',
    item.subject ? `Subject: ${item.subject}` : '',
    item.sender ? `Sender: ${item.sender}` : '',
    item.recipients ? `Recipients: ${item.recipients}` : '',
    cleanValue(hints.accountHint) ? `Account hint: ${cleanValue(hints.accountHint)}` : '',
    cleanValue(hints.opportunityHint) ? `Opportunity hint: ${cleanValue(hints.opportunityHint)}` : '',
    'Instructions: Extract structured sales evidence conservatively. Do not invent opportunity names. Do not infer MEDDIC roles such as Champion or Economic Buyer unless explicit evidence says so. Mark uncertain fields as Needs confirmation.',
    'Body excerpt:',
    item.originalExcerpt,
  ];
  return lines.filter(Boolean).join('\n');
}

export function getSafeIngestionExcerpt(rawText: string, maxLength = 1200) {
  const cleaned = compactWhitespace(rawText);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 18).trim()} ... [truncated]`;
}

export function formatIngestionSourceLabel(input: {
  sourceType: IngestionSourceType;
  subject?: string;
  sender?: string;
}) {
  if (input.subject?.trim()) return `${labelForSourceType(input.sourceType)}: ${cleanValue(input.subject)}`;
  if (input.sender?.trim()) return `${labelForSourceType(input.sourceType)} from ${cleanValue(input.sender)}`;
  return labelForSourceType(input.sourceType);
}

export function buildIngestionSourceTags(item: Pick<IngestedSourceItem, 'sourceType' | 'sourceLabel' | 'safeHash'>) {
  return [
    `source:${item.sourceType}`,
    `source-label:${encodeSourceTagValue(item.sourceLabel).slice(0, 96)}`,
    `source-hash:${item.safeHash}`,
  ];
}

export function parseIngestionSourceTags(tags: string[] | null | undefined) {
  const tagList = Array.isArray(tags) ? tags : [];
  const sourceType = tagList
    .find((tag) => tag.startsWith('source:'))
    ?.replace(/^source:/, '') as IngestionSourceType | undefined;
  const sourceLabel = tagList
    .find((tag) => tag.startsWith('source-label:'))
    ?.replace(/^source-label:/, '');
  const sourceHash = tagList
    .find((tag) => tag.startsWith('source-hash:'))
    ?.replace(/^source-hash:/, '');

  return {
    sourceType: sourceType && ingestionSourceTypes.includes(sourceType) ? sourceType : undefined,
    sourceLabel: sourceLabel ? decodeSourceTagValue(sourceLabel) : '',
    sourceHash: sourceHash || '',
  };
}

export function hashIngestionText(rawText: string) {
  let hash = 2166136261;
  const text = compactWhitespace(rawText);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function labelForSourceType(sourceType: IngestionSourceType) {
  const labels: Record<IngestionSourceType, string> = {
    'manual-note': 'Manual note',
    'quick-capture': 'Quick capture',
    'pasted-email': 'Pasted email',
    'pasted-thread': 'Pasted thread',
    'meeting-recap': 'Meeting recap',
    'calendar-placeholder': 'Calendar placeholder',
    'csv-import': 'CSV import',
    'future-zalo-paste': 'Future Zalo paste',
  };
  return labels[sourceType];
}

function encodeSourceTagValue(value: string) {
  return cleanValue(value).replace(/[\n\r|]/g, ' ').replace(/\s+/g, '_');
}

function decodeSourceTagValue(value: string) {
  return value.replace(/_/g, ' ').trim();
}

function cleanValue(value: string | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function compactWhitespace(value: string) {
  return (value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
