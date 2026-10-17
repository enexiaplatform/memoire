import {
  loadOpportunities,
  opportunityToFormInput,
  updateOpportunity,
} from "./opportunityStore";
import { loadPlanItemsForUser, savePlanItem } from "./planItemStore";
import { upsertCloudJsonCollection } from "./cloudJsonCollectionStore";
import { supabaseClient } from "../lib/supabaseClient";
import {
  captureLocalWorkspaceScope,
  getLocalWorkspaceOwner,
} from "./localWorkspaceOwner";
import { hasLocalSampleData } from "../utils/dataMode";
import {
  applyActionBatch,
  type ActionBatch,
} from "../features/aiChat/actionBatch";

/** Uses existing writers, including their history, Brand and sync boundaries. */
export async function executeChatActions(
  batch: ActionBatch,
  stillActive: () => boolean,
) {
  const sameWorkspace = captureLocalWorkspaceScope();
  const owns = () =>
    sameWorkspace() &&
    stillActive() &&
    getLocalWorkspaceOwner() === batch.userId &&
    !hasLocalSampleData();
  if (!owns() || !supabaseClient)
    throw new Error("Đăng nhập đúng tài khoản trước khi áp dụng.");
  const { data, error } = await supabaseClient.auth.getUser();
  if (
    error ||
    data.user?.id !== batch.userId ||
    data.user.is_anonymous ||
    !owns()
  )
    throw new Error("Phiên đăng nhập đã đổi. Chưa áp dụng thay đổi.");
  return applyActionBatch(
    batch,
    {
      load: async () => {
        const [opportunities, plans] = await Promise.all([
          loadOpportunities(batch.userId),
          loadPlanItemsForUser(batch.userId),
        ]);
        if (
          batch.items.some(
            (item) =>
              item.opportunity &&
              !opportunities.some(
                (row) =>
                  row.id === item.opportunity!.id &&
                  row.storageMode === "cloud",
              ),
          )
        )
          throw new Error(
            "Chưa xác nhận được bản cơ hội trên cloud. Hãy đồng bộ rồi yêu cầu lại.",
          );
        return { opportunities, plans };
      },
      update: async (row, changes) => {
        if (!owns()) throw new Error("Workspace changed");
        const input = opportunityToFormInput(row);
        for (const { field, value } of changes)
          Reflect.set(
            input,
            field,
            ["estimatedValue", "pipelineProbability"].includes(field)
              ? Number(value)
              : value,
          );
        return updateOpportunity(row, input, batch.userId);
      },
      addPlan: async (record) => {
        if (!owns()) throw new Error("Workspace changed");
        savePlanItem(record, { syncCloud: false });
        try {
          if (!owns())
            return {
              mode: "local",
              warning:
                "Đã lưu trên thiết bị của tài khoản ban đầu; chưa đồng bộ.",
            };
          await upsertCloudJsonCollection("plan_items", batch.userId, [record]);
          return { mode: "cloud" };
        } catch {
          return {
            mode: "local",
            warning:
              "Đã lưu Plan trên thiết bị; cloud chưa xác nhận. Đã dừng các mục tiếp theo.",
          };
        }
      },
    },
    owns,
  );
}
