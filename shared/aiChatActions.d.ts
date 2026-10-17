export type ChatAction = {
  kind: "create_plan" | "update_opportunity";
  targetKey: string;
  label: string;
  date: string;
  channel: string;
  changes: { field: string; value: string }[];
};
export const actionFields: string[];
export const actionChannels: string[];
export const actionSchema: Record<string, unknown>;
export function parseActionList(
  value: unknown,
  sources: { key: string; kind: string }[],
): ChatAction[];
