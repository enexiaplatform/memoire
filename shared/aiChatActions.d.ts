export type ChatAction = {
  kind: "create_plan" | "update_opportunity" | "update_plan" | "update_account";
  targetKey: string;
  label: string;
  date: string;
  channel: string;
  changes: { field: string; value: string }[];
};
export const actionFields: string[];
export const planActionFields: string[];
export const accountActionFields: string[];
export const actionChannels: string[];
export const actionSchema: Record<string, unknown>;
export function parseActionList(
  value: unknown,
  sources: { key: string; kind: string }[],
): ChatAction[];

export function isPlanTransferRequest(question: string): boolean;
