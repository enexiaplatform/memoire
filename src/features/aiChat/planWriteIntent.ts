import type { ChatAction } from "../../../shared/aiChatActions.js";

/** Only the user's imperative can authorize a Plan write, never model prose. */
export function requestsPlanWrite(value: string): boolean {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
  if (
    /\?|\b(don't|dont|do not|not yet|khong|chua|dung|draft|preview|suggest|propose|goi y|de xuat|ban nhap|xem truoc|neu|if)\b/.test(
      text,
    )
  )
    return false;
  return (
    /\b(plan|ke hoach|lich)\b/.test(text) &&
    /\b(add|save|create|insert|put|schedule|them|luu|tao|dua|dien|lap)\b/.test(
      text,
    )
  );
}

export function canAutoSavePlan(
  question: string,
  actions: ChatAction[],
  clarification?: string,
): boolean {
  return (
    requestsPlanWrite(question) &&
    !clarification?.trim() &&
    actions.length > 0 &&
    actions.every((action) => action.kind === "create_plan")
  );
}
