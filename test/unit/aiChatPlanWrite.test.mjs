import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestsPlanWrite,
  canAutoSavePlan,
} from "../../src/features/aiChat/planWriteIntent.ts";
const plan = {
  kind: "create_plan",
  targetKey: "",
  label: "Prepare checklist",
  date: "2026-10-20",
  channel: "Desk work",
  changes: [],
};
test("explicit Plan commands authorize creation without an extra confirmation", () => {
  for (const text of [
    "thêm vào Plan tuần sau",
    "tạo plan tuần sau cho tôi",
    "điền kế hoạch tuần sau",
    "add it into the Plan for next week",
    "save these to Plan",
  ]) {
    assert.equal(requestsPlanWrite(text), true, text);
    assert.equal(canAutoSavePlan(text, [plan]), true, text);
  }
});
test("drafts, questions, negations, empty, mixed or unresolved output never auto-save", () => {
  for (const text of [
    "Plan next week for me",
    "gợi ý plan tuần sau",
    "chưa thêm vào Plan",
    "đừng tạo Plan",
    "Do not add to Plan yet",
    "Draft a plan",
    "Can you add to Plan?",
    "Nếu đủ thì thêm Plan",
  ])
    assert.equal(requestsPlanWrite(text), false, text);
  for (const actions of [
    [],
    [{ ...plan, kind: "update_opportunity" }],
    [plan, { ...plan, kind: "update_opportunity" }],
  ])
    assert.equal(canAutoSavePlan("add into Plan", actions), false);
  assert.equal(canAutoSavePlan("add into Plan", [plan], "Which date?"), false);
});
import { chatHistory } from "../../src/features/aiChat/chatHistory.ts";
import { validateChatRequest } from "../../api/_aiChat.js";
test("save receipts preserve alternating bounded API history for the next command", () => {
  const history = chatHistory(
    [
      { role: "user", content: "add into Plan" },
      {
        role: "assistant",
        content: "Prepared tasks",
        context: { private: "not serialized" },
      },
      { role: "assistant", content: "Saved tasks" },
    ],
    "add into Plan",
  );
  assert.deepEqual(history, [
    { role: "user", content: "add into Plan" },
    { role: "assistant", content: "Prepared tasks\n\nSaved tasks" },
    { role: "user", content: "add into Plan" },
  ]);
  assert.equal(
    validateChatRequest({
      consent: true,
      messages: history,
      context: {
        asOf: "2026-10-17",
        scope: "All",
        sources: [],
        facts: [],
        limitations: [],
      },
    }),
    true,
  );
  const many = chatHistory(
    Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: "x",
    })),
    "Next",
  );
  assert.equal(many.length, 9);
  assert.equal(many[0].role, "user");
});
