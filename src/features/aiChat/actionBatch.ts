import {
  parseActionList,
  type ChatAction,
} from "../../../shared/aiChatActions.js";
import type { AccountMemoryRecord } from "../../services/accountStore";
import type { CrmLiteOpportunity } from "../../services/opportunityStore";
import type { SalesWorkspaceData } from "../../services/workspaceData";
import {
  createPersonalPlanRecord,
  type PlanRecord,
} from "../../utils/weeklyPlan.ts";
import type { ActivityChannel } from "../../utils/activityChannel.ts";
import type { ChatSource } from "./types";
import { isLeadStage } from "../../utils/leadIdentity.ts";

export type PreparedAction = {
  action: ChatAction;
  title: string;
  preview: string;
  opportunity?: CrmLiteOpportunity;
  plan?: PlanRecord;
  originalPlan?: PlanRecord;
  account?: AccountMemoryRecord;
};
export type ActionBatch = {
  id: string;
  userId: string;
  createdAt: number;
  items: PreparedAction[];
};
export type ActionResult = {
  title: string;
  status: "cloud" | "local" | "unchanged" | "failed" | "not_run";
  detail: string;
};
const fieldLabels: Record<string, string> = {
  date: "Ngày Plan",
  label: "Nội dung Plan",
  channel: "Kênh",
  strategy: "Chiến lược",
  nextFollowUp: "Ngày follow-up",
  relationshipStatus: "Quan hệ",
  nextAction: "Việc tiếp theo",
  nextActionDate: "Ngày thực hiện",
  stage: "Giai đoạn",
  status: "Trạng thái",
  expectedClosePeriod: "Kỳ dự kiến chốt",
  estimatedValue: "Giá trị ước tính",
  pipelineProbability: "Xác suất (%)",
  evidence: "Bằng chứng",
  missingContext: "Thông tin còn thiếu",
  objectionDebt: "Vướng mắc",
  decisionMaker: "Người quyết định",
  budgetOwner: "Người quản ngân sách",
  procurementPath: "Quy trình mua",
  technicalCriteria: "Tiêu chí kỹ thuật",
};

export function prepareActionBatch(
  actions: ChatAction[],
  sources: ChatSource[],
  workspace: SalesWorkspaceData,
  userId: string,
  id: string,
  now = Date.now(),
  plans: PlanRecord[] = [],
): ActionBatch {
  const valid = parseActionList(actions, sources);
  const real = (row: {
    userId?: string;
    source?: string;
    isSample?: boolean;
    __deleted?: boolean;
  }) =>
    !row.isSample &&
    row.source !== "demo" &&
    !row.__deleted &&
    row.userId === userId;
  const items = valid.map((action, index): PreparedAction => {
    const source = sources.find((row) => row.key === action.targetKey);
    const opportunity = action.targetKey.startsWith("opportunity:")
      ? workspace.opportunities.find(
          (row) => row.id === source?.id && real(row),
        )
      : undefined;
    const account = action.targetKey.startsWith("account:")
      ? workspace.accounts.find((row) => row.id === source?.id && real(row))
      : undefined;
    const existingPlan =
      action.kind === "update_plan"
        ? plans.find(
            (row) =>
              row.id === source?.id &&
              !row.isSample &&
              row.source !== "demo" &&
              !row.__deleted &&
              !row.derivedKey &&
              !row.dismissed,
          )
        : undefined;
    if (action.targetKey && !opportunity && !account && !existingPlan)
      throw new Error(
        "Không tìm thấy bản ghi thuộc tài khoản hiện tại. Hãy tải lại và yêu cầu lại.",
      );
    if (action.kind === "update_plan" || action.kind === "update_account") {
      const original = action.kind === "update_plan" ? existingPlan! : account!;
      if (action.kind === "update_plan" && existingPlan!.done)
        throw new Error(
          "Plan đã hoàn thành cần dùng lịch sử và luồng hoàn thành hiện có. Chưa sửa.",
        );
      const preview = action.changes
        .map(
          (change) =>
            `${fieldLabels[change.field]}: ${String(Reflect.get(original, change.field) || "(trống)")} → ${change.value || "(trống)"}`,
        )
        .join("\n");
      if (action.kind === "update_account")
        return {
          action,
          account: { ...account! },
          title: account!.accountName,
          preview,
        };
      const updated = {
        ...existingPlan!,
        updatedAt: new Date(now).toISOString(),
      };
      for (const change of action.changes)
        Reflect.set(updated, change.field, change.value);
      return {
        action,
        plan: updated,
        originalPlan: { ...existingPlan! },
        title: `Plan · ${existingPlan!.label}`,
        preview,
      };
    }
    if (action.kind === "create_plan") {
      const plan = createPersonalPlanRecord({
        date: action.date,
        label: action.label,
        channel: action.channel as ActivityChannel,
        linkedOpportunityId: opportunity?.id,
        linkedAccountName: opportunity?.accountName || account?.accountName,
        source: "user",
        isSample: false,
      });
      plan.id = `chat-${id}-${index}`;
      return {
        action,
        plan,
        title:
          (opportunity &&
            `${opportunity.accountName} · ${opportunity.opportunityName}`) ||
          account?.accountName ||
          "Plan cá nhân",
        preview: `Thêm Plan ${action.date}: ${action.label}${action.channel ? ` · ${action.channel}` : " · chưa ghi kênh"}`,
      };
    }
    if (
      !opportunity ||
      opportunity.status === "Won" ||
      opportunity.status === "Lost" ||
      ["Won", "Lost"].includes(opportunity.stage)
    )
      throw new Error(
        "Cơ hội đã đóng cần dùng luồng kết quả của Memoire. Chat hiện chỉ sửa cơ hội đang mở.",
      );
    if (
      isLeadStage(opportunity.stage) &&
      action.changes.some((change) => change.field === "stage")
    )
      throw new Error(
        "Lead cần đi qua luồng Qualify để giữ đúng liên kết khách hàng và Brand. Chưa áp dụng nhóm này.",
      );
    const preview = action.changes
      .map(
        (change) =>
          `${fieldLabels[change.field]}${change.field === "estimatedValue" ? ` (${opportunity.currency})` : ""}: ${String((opportunity as unknown as Record<string, unknown>)[change.field] ?? "(trống)")} → ${change.value || "(trống)"}`,
      )
      .join("\n");
    return {
      action,
      opportunity: { ...opportunity },
      title: `${opportunity.accountName} · ${opportunity.opportunityName}`,
      preview,
    };
  });
  return { id, userId, createdAt: now, items };
}

type WriteResult = { mode: "cloud" | "local"; warning?: string };
type ActionStores = {
  load: () => Promise<{
    opportunities: CrmLiteOpportunity[];
    plans: PlanRecord[];
    accounts?: AccountMemoryRecord[];
  }>;
  update: (
    row: CrmLiteOpportunity,
    changes: ChatAction["changes"],
  ) => Promise<WriteResult>;
  addPlan: (record: PlanRecord) => Promise<WriteResult>;
  updateAccount?: (
    record: AccountMemoryRecord,
    changes: ChatAction["changes"],
  ) => Promise<WriteResult>;
};

/** Preflight the whole batch, then save sequentially. This is not a cross-table transaction. */
export async function applyActionBatch(
  batch: ActionBatch,
  stores: ActionStores,
  owns: () => boolean,
  now = Date.now(),
): Promise<ActionResult[]> {
  if (!owns() || now - batch.createdAt > 600000)
    throw new Error(
      "Nhóm thay đổi đã hết hạn hoặc tài khoản đã đổi. Hãy yêu cầu lại.",
    );
  const fresh = await stores.load();
  if (!owns()) throw new Error("Tài khoản đã thay đổi. Chưa áp dụng nhóm này.");
  for (const item of batch.items) {
    if (item.originalPlan) {
      const current = fresh.plans.find(
        (row) => row.id === item.originalPlan!.id,
      );
      if (
        !current ||
        current.updatedAt !== item.originalPlan.updatedAt ||
        current.isSample ||
        current.source === "demo" ||
        current.__deleted ||
        current.derivedKey ||
        current.done ||
        current.dismissed ||
        [
          "date",
          "label",
          "channel",
          "linkedOpportunityId",
          "linkedAccountName",
          "linkedBrand",
          "linkedStakeholderName",
        ].some(
          (field) =>
            Reflect.get(current, field) !==
            Reflect.get(item.originalPlan!, field),
        )
      )
        throw new Error(
          "Plan đã đổi kể từ lúc xem trước. Chưa áp dụng nhóm này; hãy yêu cầu lại.",
        );
    }
    if (item.account) {
      const current = fresh.accounts?.find(
        (row) => row.id === item.account!.id,
      );
      if (
        !current ||
        current.updatedAt !== item.account.updatedAt ||
        current.userId !== batch.userId ||
        current.isSample ||
        current.source === "demo"
      )
        throw new Error(
          "Khách hàng đã đổi kể từ lúc xem trước. Chưa áp dụng nhóm này; hãy yêu cầu lại.",
        );
    }
    if (!item.opportunity) continue;
    const current = fresh.opportunities.find(
      (row) => row.id === item.opportunity!.id,
    );
    if (
      !current ||
      current.userId !== batch.userId ||
      current.isSample ||
      current.source === "demo" ||
      current.updatedAt !== item.opportunity.updatedAt
    )
      throw new Error(
        "Cơ hội đã đổi kể từ lúc xem trước. Chưa áp dụng nhóm này; hãy yêu cầu lại.",
      );
  }
  const results: ActionResult[] = [];
  const plans = [...fresh.plans];
  let halted = false;
  for (const item of batch.items) {
    if (halted || !owns()) {
      results.push({
        title: item.title,
        status: "not_run",
        detail: "Chưa thực hiện.",
      });
      continue;
    }
    try {
      let result: WriteResult;
      if (item.account) {
        const current = fresh.accounts!.find(
          (row) => row.id === item.account!.id,
        )!;
        if (!stores.updateAccount)
          throw new Error("Account writer unavailable");
        if (
          item.action.changes.every(
            (change) =>
              String(Reflect.get(current, change.field) ?? "") === change.value,
          )
        ) {
          results.push({
            title: item.title,
            status: "unchanged",
            detail: "Giá trị đã đúng; không ghi lại.",
          });
          continue;
        }
        result = await stores.updateAccount(current, item.action.changes);
      } else if (item.originalPlan && item.plan) {
        if (
          item.action.changes.every(
            (change) =>
              String(Reflect.get(item.originalPlan!, change.field) ?? "") ===
              change.value,
          )
        ) {
          results.push({
            title: item.title,
            status: "unchanged",
            detail: "Giá trị đã đúng; không ghi lại.",
          });
          continue;
        }
        result = await stores.addPlan(item.plan);
      } else if (item.plan) {
        const existing = plans.find(
          (row) =>
            !row.__deleted &&
            !row.isSample &&
            row.source !== "demo" &&
            row.date === item.plan!.date &&
            row.label === item.plan!.label &&
            (row.linkedOpportunityId || "") ===
              (item.plan!.linkedOpportunityId || "") &&
            (row.linkedAccountName || "") ===
              (item.plan!.linkedAccountName || "") &&
            (row.channel || "") === (item.plan!.channel || ""),
        );
        if (existing) {
          results.push({
            title: item.title,
            status: "unchanged",
            detail: "Việc Plan này đã tồn tại; không tạo trùng.",
          });
          continue;
        }
        result = await stores.addPlan(item.plan);
        plans.push(item.plan);
      } else {
        const row = fresh.opportunities.find(
          (row) => row.id === item.opportunity!.id,
        )!;
        if (
          item.action.changes.every(
            (change) =>
              String(
                (row as unknown as Record<string, unknown>)[change.field] ?? "",
              ) === change.value,
          )
        ) {
          results.push({
            title: item.title,
            status: "unchanged",
            detail: "Giá trị đã đúng; không ghi lại.",
          });
          continue;
        }
        result = await stores.update(row, item.action.changes);
      }
      results.push({
        title: item.title,
        status: result.mode,
        detail:
          result.warning ||
          (result.mode === "cloud"
            ? "Đã lưu và đồng bộ."
            : "Đã lưu trên thiết bị; chưa xác nhận đồng bộ."),
      });
      if (result.mode !== "cloud") halted = true;
    } catch {
      results.push({
        title: item.title,
        status: "failed",
        detail:
          "Không xác nhận được kết quả ghi. Đã dừng các mục sau; kiểm tra dữ liệu trước khi thử lại.",
      });
      halted = true;
    }
  }
  return results;
}
