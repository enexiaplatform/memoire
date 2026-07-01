export const CAPTURE_CORRECTION_STORAGE_KEY = 'memoire.captureCorrections.v1';
export const CAPTURE_ACCOUNT_ALIAS_STORAGE_KEY = 'memoire.captureAccountAliases.v1';

export const captureCorrectionFields = [
  'accountName',
  'contactName',
  'opportunityName',
  'activityType',
  'summary',
  'nextAction',
  'dueDate',
  'timelineSignals',
  'risks',
  'buyingSignals',
] as const;

export type CaptureCorrectionField = (typeof captureCorrectionFields)[number];
export type CaptureCorrectionSource = 'ai' | 'local-fallback' | 'manual';

export type CaptureCorrectionEvent = {
  id: string;
  userId?: string;
  source: CaptureCorrectionSource;
  rawNoteExcerpt: string;
  fieldName: CaptureCorrectionField;
  originalValue: string;
  correctedValue: string;
  createdAt: string;
  storageMode: 'local' | 'cloud';
};

export type CaptureAccountAlias = {
  id: string;
  userId?: string;
  alias: string;
  canonicalAccountName: string;
  source: 'correction' | 'manual' | 'import';
  createdAt: string;
  storageMode: 'local' | 'cloud';
};

type CorrectableDraft = Partial<Record<CaptureCorrectionField, unknown>>;

export function buildCaptureCorrectionEvents(input: {
  original: CorrectableDraft;
  corrected: CorrectableDraft;
  source: CaptureCorrectionSource;
  rawNote: string;
  userId?: string;
  createdAt?: string;
}) {
  const createdAt = input.createdAt || new Date().toISOString();
  const rawNoteExcerpt = safeExcerpt(input.rawNote);

  return captureCorrectionFields.flatMap<CaptureCorrectionEvent>((fieldName) => {
    const originalValue = serializeValue(input.original[fieldName]);
    const correctedValue = serializeValue(input.corrected[fieldName]);
    if (originalValue === correctedValue) return [];
    return [{
      id: createId('correction'),
      userId: input.userId,
      source: input.source,
      rawNoteExcerpt,
      fieldName,
      originalValue,
      correctedValue,
      createdAt,
      storageMode: 'local',
    }];
  });
}

export function recordCaptureCorrections(events: CaptureCorrectionEvent[], userId?: string) {
  if (events.length === 0) return { corrections: loadCaptureCorrections(userId), aliases: loadCaptureAccountAliases(userId) };
  const corrections = dedupeCorrections([...events, ...loadCaptureCorrections(userId)]).slice(0, 200);
  writeLocal(correctionKey(userId), corrections);

  const correctionAliases = events
    .filter((event) => event.fieldName === 'accountName')
    .filter((event) => isSafeAlias(event.originalValue, event.correctedValue))
    .map((event): CaptureAccountAlias => ({
      id: createId('alias'),
      userId,
      alias: event.originalValue,
      canonicalAccountName: event.correctedValue,
      source: 'correction',
      createdAt: event.createdAt,
      storageMode: 'local',
    }));
  const aliases = saveAliases([...correctionAliases, ...loadCaptureAccountAliases(userId)], userId);
  return { corrections, aliases };
}

export function loadCaptureCorrections(userId?: string): CaptureCorrectionEvent[] {
  return readLocal<CaptureCorrectionEvent>(correctionKey(userId))
    .filter((event) => captureCorrectionFields.includes(event.fieldName))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deleteCaptureCorrection(correctionId: string, userId?: string) {
  const next = loadCaptureCorrections(userId).filter((event) => event.id !== correctionId);
  writeLocal(correctionKey(userId), next);
  return next;
}

export function loadCaptureAccountAliases(userId?: string): CaptureAccountAlias[] {
  return readLocal<CaptureAccountAlias>(aliasKey(userId))
    .filter((alias) => alias.alias && alias.canonicalAccountName)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function addCaptureAccountAlias(input: {
  alias: string;
  canonicalAccountName: string;
  source?: CaptureAccountAlias['source'];
  userId?: string;
}) {
  const alias = input.alias.trim();
  const canonicalAccountName = input.canonicalAccountName.trim();
  if (!isSafeAlias(alias, canonicalAccountName)) return loadCaptureAccountAliases(input.userId);
  return saveAliases([{
    id: createId('alias'),
    userId: input.userId,
    alias,
    canonicalAccountName,
    source: input.source || 'manual',
    createdAt: new Date().toISOString(),
    storageMode: 'local',
  }, ...loadCaptureAccountAliases(input.userId)], input.userId);
}

export function deleteCaptureAccountAlias(aliasId: string, userId?: string) {
  return saveAliases(loadCaptureAccountAliases(userId).filter((alias) => alias.id !== aliasId), userId);
}

export function clearLocalCaptureCorrectionMemory(userId?: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(correctionKey(userId));
  localStorage.removeItem(aliasKey(userId));
}

function saveAliases(aliases: CaptureAccountAlias[], userId?: string) {
  const unique = Array.from(new Map(aliases.map((alias) => [normalize(alias.alias), alias])).values()).slice(0, 100);
  writeLocal(aliasKey(userId), unique);
  return unique;
}

function correctionKey(userId?: string) {
  return `${CAPTURE_CORRECTION_STORAGE_KEY}:${userId || 'guest'}`;
}

function aliasKey(userId?: string) {
  return `${CAPTURE_ACCOUNT_ALIAS_STORAGE_KEY}:${userId || 'guest'}`;
}

function safeExcerpt(rawNote: string) {
  const compact = rawNote.replace(/\s+/g, ' ').trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

function serializeValue(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean))));
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value);
}

function isSafeAlias(alias: string, canonical: string) {
  return Boolean(
    alias.trim()
    && canonical.trim()
    && normalize(alias) !== normalize(canonical)
    && alias.length <= 60
    && canonical.length <= 140
    && !/^(?:Ms|Mr|Mrs|Dr)\.?\s+/i.test(alias),
  );
}

function dedupeCorrections(events: CaptureCorrectionEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = [event.fieldName, normalize(event.originalValue), normalize(event.correctedValue), event.rawNoteExcerpt].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readLocal<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
