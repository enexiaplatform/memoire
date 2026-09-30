/** Public API v1 types. This package has no application or persistence imports. */
export interface Observation {
  schemaVersion: 1;
  sourceKind: 'email' | 'calendar' | 'crm' | 'erp' | 'csv_import';
  sourceNamespace: string; sourceEventId: string; sourceVersion: string;
  observedAt: string | null; summary: string; rawText: string;
}
export interface Commitment {
  id: string; accountId: string | null; opportunityId: string | null;
  party: string; responsiblePerson: string; promise: string;
  dueDate: string | null; status: string; updatedAt: string;
}
export interface Recommendation {
  id: string; reasonCode: string; reasonText: string; sourceRecordIds: string[];
  threshold: number; severity: string; recommendedAction: string; calculatedAt: string;
  accountName: string; href: string; commitmentId?: string | null;
  threadId?: string | null; opportunityId?: string | null;
}
export interface Page<T> {
  version: 1; resource: 'commitments' | 'commitment-recommendations';
  scope: 'authenticated-owner'; basis: 'commitments-in-this-page';
  items: T[]; nextCursor: string | null;
}
export interface ReceiptResult {
  version: 1; command: 'receive-observation'; duplicate: boolean;
  receipt: {id: string; receivedAt: string; observation: Observation; acceptedCommercialTruth: false};
}
export interface PageOptions {limit?: number; after?: string; signal?: AbortSignal}
export interface ClientOptions {
  /** Trusted deployment origin only, never a URL supplied by an external observation. */
  origin: string;
  getAccessToken: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  allowLocalHttp?: boolean;
}
export class MemoireError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  /** Same observation envelope can be retried; no retries are performed automatically. */
  readonly retrySafe: boolean;
  readonly outcomeUnknown: boolean;
  constructor(code: string, options: {status?: number; retryAfterSeconds?: number | null; retrySafe?: boolean; outcomeUnknown?: boolean} = {}) {
    super(code); this.name = 'MemoireError'; this.code = code;
    this.status = options.status ?? null; this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.retrySafe = options.retrySafe ?? false; this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function strings(value: Record<string, unknown>, keys: string[]) {return keys.every(key => typeof value[key] === 'string');}
function validItem(value: unknown, resource: string): boolean {
  if (!object(value)) return false;
  if (resource === 'commitments') return strings(value, ['id', 'party', 'responsiblePerson', 'promise', 'status', 'updatedAt'])
    && ['accountId', 'opportunityId', 'dueDate'].every(key => value[key] === null || typeof value[key] === 'string');
  return strings(value, ['id', 'reasonCode', 'reasonText', 'severity', 'recommendedAction', 'calculatedAt', 'accountName', 'href'])
    && typeof value.threshold === 'number' && Number.isFinite(value.threshold)
    && Array.isArray(value.sourceRecordIds) && value.sourceRecordIds.every(id => typeof id === 'string');
}
function validPage(value: unknown, resource: string): boolean {
  return object(value) && value.version === 1 && value.resource === resource && value.scope === 'authenticated-owner'
    && value.basis === 'commitments-in-this-page' && Array.isArray(value.items) && value.items.every(item => validItem(item, resource))
    && (value.nextCursor === null || typeof value.nextCursor === 'string' && value.nextCursor.length > 0);
}
/** Stateless client: credentials are requested per call, never persisted or placed in URLs. */
export function createMemoireClient(options: ClientOptions) {
  const origin = new URL(options.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
    || !(origin.protocol === 'https:' || origin.protocol === 'http:' && local && options.allowLocalHttp)) {
    throw new MemoireError('invalid_origin');
  }
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  const tokenProvider = options.getAccessToken;
  async function request(url: URL, body: unknown, signal?: AbortSignal): Promise<unknown> {
    let token: string;
    try {token = await tokenProvider();} catch {throw new MemoireError('authentication_unavailable');}
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw new MemoireError('authentication_unavailable');
    const write = body !== undefined;
    const serialized = write ? JSON.stringify(body) : undefined;
    let response: Response;
    try {
      response = await transport(url, {method: write ? 'POST' : 'GET',
        headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', ...(write ? {'Content-Type': 'application/json'} : {})},
        body: serialized, signal, redirect: 'error', credentials: 'omit', cache: 'no-store'});
    } catch {throw new MemoireError(signal?.aborted ? 'request_aborted' : 'transport_unavailable', {retrySafe: true, outcomeUnknown: write});}
    let result: unknown;
    try {result = await response.json();} catch {throw new MemoireError('invalid_response', {status: response.status, retrySafe: true, outcomeUnknown: write});}
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      throw new MemoireError(object(result) && typeof result.error === 'string' && /^[a-z_]{1,80}$/.test(result.error) ? result.error : 'request_failed', {
        status: response.status, retryAfterSeconds: retry !== null && /^\d+$/.test(retry) ? Number(retry) : null,
        retrySafe: !write || response.status >= 500 || response.status === 429,
        outcomeUnknown: write && response.status >= 500,
      });
    }
    return result;
  }
  async function page<T>(resource: Page<T>['resource'], input: PageOptions = {}): Promise<Page<T>> {
    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      || input.after !== undefined && (typeof input.after !== 'string' || !input.after || input.after.length > 200)) throw new MemoireError('invalid_query');
    const url = new URL('/api/commercial', origin); url.searchParams.set('resource', resource);
    if (input.limit !== undefined) url.searchParams.set('limit', String(input.limit));
    if (input.after !== undefined) url.searchParams.set('after', input.after);
    const result = await request(url, undefined, input.signal);
    if (!validPage(result, resource)) throw new MemoireError('invalid_response');
    return result as Page<T>;
  }
  return Object.freeze({
    listCommitments: (input?: PageOptions) => page<Commitment>('commitments', input),
    listCommitmentRecommendations: (input?: PageOptions) => page<Recommendation>('commitment-recommendations', input),
    async receiveObservation(observation: Observation, input: {signal?: AbortSignal} = {}): Promise<ReceiptResult> {
      const result = await request(new URL('/api/commercial', origin), {version: 1, command: 'receive-observation', observation}, input.signal);
      if (!object(result) || result.version !== 1 || result.command !== 'receive-observation' || typeof result.duplicate !== 'boolean'
        || !object(result.receipt) || result.receipt.acceptedCommercialTruth !== false || typeof result.receipt.id !== 'string'
        || typeof result.receipt.receivedAt !== 'string' || !object(result.receipt.observation)) {
        throw new MemoireError('invalid_response', {retrySafe: true, outcomeUnknown: true});
      }
      return result as unknown as ReceiptResult;
    },
  });
}
export type MemoireClient = ReturnType<typeof createMemoireClient>;
