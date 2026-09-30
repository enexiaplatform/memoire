import {createMemoireClient, MemoireError, type ClientOptions, type Commitment, type Recommendation, type Observation, type ReceiptResult} from './index.js';

export type AgentProposal =
  | {type: 'follow-up'; commitmentId: string; summary: string}
  | {type: 'receive-observation'; observationKey: string; summary: string};
export interface AgentView {
  version: 1; basis: 'commitments-in-this-page'; observedAt: string;
  commitments: Commitment[]; recommendations: Recommendation[];
  observations: {key: string; observation: Observation}[];
  nextCursor: string | null;
}
export interface AgentRuntimeOptions extends ClientOptions {
  agentId: string;
  /** Host-provided source material; proposals may reference but never replace it. */
  observations?: {key: string; observation: Observation}[];
  /** Absent means read/propose only. Host policy, never accepted from model output. */
  receiptAuthority?: {expiresAt: string; namespaces: string[]; maxReceipts: number};
}
export interface GovernedProposal {
  id: string; agentId: string; proposedAt: string; proposal: AgentProposal;
  acceptedCommercialTruth: false;
}
function record(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function text(value: unknown, max: number): value is string {return typeof value === 'string' && !!value.trim() && value.length <= max;}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {for (const child of Object.values(value)) freeze(child); Object.freeze(value);}
  return value;
}
function clone<T>(value: T): T {return structuredClone(value);}
/** A host orchestration boundary for model output, not a sandbox for untrusted executable code. */
export async function createAgentRuntime(options: AgentRuntimeOptions) {
  if (!text(options.agentId, 200)) throw new MemoireError('invalid_agent');
  const agentId = options.agentId;
  const authority = options.receiptAuthority ? clone(options.receiptAuthority) : null;
  if (authority && (!Number.isFinite(Date.parse(authority.expiresAt)) || !Number.isInteger(authority.maxReceipts)
    || authority.maxReceipts < 1 || authority.maxReceipts > 50 || !Array.isArray(authority.namespaces)
    || authority.namespaces.length < 1 || authority.namespaces.length > 50 || authority.namespaces.some(ns => !text(ns, 200)))) throw new MemoireError('invalid_authority');
  const sources = clone(options.observations ?? []);
  if (!Array.isArray(sources) || sources.length > 50 || sources.some(source => !source || !text(source.key, 200)
    || !record(source.observation) || source.observation.schemaVersion !== 1 || !text(source.observation.sourceNamespace, 200)
    || !text(source.observation.rawText, 20000)) || new Set(sources.map(source => source.key)).size !== sources.length) throw new MemoireError('invalid_sources');
  // Pin a single session token. A refreshed/switched identity requires a new runtime and new authority.
  let token: string;
  try {token = await options.getAccessToken();} catch {throw new MemoireError('authentication_unavailable');}
  if (!text(token, 20000) || /\s/.test(token)) throw new MemoireError('authentication_unavailable');
  const client = createMemoireClient({...options, getAccessToken: () => token});
  const proposals = new Map<string, GovernedProposal>();
  const results = new Map<string, ReceiptResult>();
  const reserved = new Set<string>();
  let revoked = false, busy = false;
  function active() {if (revoked) throw new MemoireError('authority_revoked');}
  return Object.freeze({
    revoke() {revoked = true; proposals.clear(); results.clear();},
    async propose(agent: (view: Readonly<AgentView>) => Promise<unknown>, input: {signal?: AbortSignal} = {}): Promise<GovernedProposal[]> {
      active(); if (busy) throw new MemoireError('runtime_busy'); if (proposals.size >= 50) throw new MemoireError('proposal_budget_exhausted');
      busy = true;
      try {
        const page = await client.listCommitments({limit: 50, signal: input.signal}); active();
        const recommendations = await client.listCommitmentRecommendations({limit: 50, signal: input.signal}); active();
        const ids = new Set(page.items.map(item => item.id));
        const view: AgentView = {version: 1, basis: 'commitments-in-this-page', observedAt: new Date().toISOString(),
          commitments: page.items, recommendations: recommendations.items.filter(item => item.sourceRecordIds.every(id => ids.has(id))),
          observations: sources, nextCursor: page.nextCursor};
        const output = await agent(freeze(clone(view))); active();
        if (input.signal?.aborted) throw new MemoireError('request_aborted');
        if (!Array.isArray(output) || output.length > 10 || output.length + proposals.size > 50) throw new MemoireError('invalid_proposals');
        const batch: GovernedProposal[] = output.map(value => {
          if (!record(value) || !text(value.summary, 1000) || Object.keys(value).length !== 3
            || !(value.type === 'follow-up' && typeof value.commitmentId === 'string' && ids.has(value.commitmentId)
              || value.type === 'receive-observation' && typeof value.observationKey === 'string' && sources.some(source => source.key === value.observationKey))) throw new MemoireError('invalid_proposals');
          return freeze({id: crypto.randomUUID(), agentId, proposedAt: new Date().toISOString(), proposal: clone(value) as AgentProposal, acceptedCommercialTruth: false as const});
        });
        for (const item of batch) proposals.set(item.id, item);
        return clone(batch);
      } finally {busy = false;}
    },
    async executeReceipt(proposalId: string, input: {signal?: AbortSignal} = {}): Promise<ReceiptResult> {
      active(); if (busy) throw new MemoireError('runtime_busy');
      const entry = proposals.get(proposalId);
      if (!entry || entry.proposal.type !== 'receive-observation') throw new MemoireError('command_not_permitted');
      const proposal = entry.proposal;
      const source = sources.find(item => item.key === proposal.observationKey)!;
      if (!authority || Date.now() >= Date.parse(authority.expiresAt) || !authority.namespaces.includes(source.observation.sourceNamespace)) throw new MemoireError('command_not_permitted');
      if (results.has(proposalId)) return clone(results.get(proposalId)!);
      if (!reserved.has(source.key) && reserved.size >= authority.maxReceipts) throw new MemoireError('receipt_budget_exhausted');
      reserved.add(source.key); // Uncertain acknowledgement keeps the reservation; exact source retry remains possible.
      busy = true;
      try {
        const result = await client.receiveObservation(source.observation, input);
        // An in-flight receipt cannot be undone by revocation. Return its honest acknowledgement.
        if (!revoked) results.set(proposalId, clone(result));
        return result;
      } finally {busy = false;}
    },
  });
}
