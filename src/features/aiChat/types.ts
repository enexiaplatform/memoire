export type ChatSourceKind =
  | "account"
  | "opportunity"
  | "activity"
  | "commitment"
  | "quote"
  | "receivable"
  | "milestone"
  | "analysis";
export type ChatSource = {
  key: string;
  kind: ChatSourceKind;
  id: string;
  title: string;
  detail: string;
  href?: string;
};
export type ChatContext = {
  asOf: string;
  scope: string;
  sources: ChatSource[];
  facts: string[];
  limitations: string[];
};
export type ChatReply = {
  answer: string;
  sourceKeys: string[];
  sources: ChatSource[];
  draft: string;
  suggestedAction: string;
  missingContext: string[];
  suggestedQuestions: string[];
};
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reply?: ChatReply;
};
export type ChatScope = {
  kind: "all" | "account" | "opportunity";
  id?: string;
};
