export type AiWorkflow = {
  id: string;
  title: string;
  surfaces: string[];
  prompt: string;
  result: string;
};

/** Product workflows, not provider tools. Choosing one never sends a request. */
export const aiWorkflows: AiWorkflow[] = [
  {
    id: "priorities",
    title: "Ưu tiên hôm nay",
    surfaces: ["today"],
    prompt:
      "Phân tích ưu tiên hôm nay: việc quá hạn, deal cần cứu và bằng chứng cần bổ sung. Nêu lý do và nguồn cho từng việc; chưa tạo hay sửa dữ liệu.",
    result: "Danh sách ưu tiên có căn cứ và bước tiếp theo.",
  },
  {
    id: "plan",
    title: "Lập Plan tuần sau",
    surfaces: ["timeline", "calendar"],
    prompt:
      "Đề xuất Plan tuần sau dựa trên công việc đang mở trong phạm vi này. Ghi rõ khách hàng, opportunity, ngày, nội dung và kênh đã biết; phân biệt đề xuất với lịch hẹn đã xác nhận. Chưa lưu.",
    result: "Bản nháp có ngày; nhắn “thêm các việc trên vào Plan” để lưu.",
  },
  {
    id: "leads",
    title: "Sàng lọc Lead",
    surfaces: ["leads"],
    prompt:
      "Phân tích lead qualification: lead nào sẵn sàng qualify, lead nào cần liên hệ lại, còn thiếu bằng chứng gì? Dùng trạng thái và tiêu chí đang có của Memoire, không tự chấm điểm hay đổi stage.",
    result: "Hàng đợi Lead và câu hỏi cần làm rõ.",
  },
  {
    id: "account-brief",
    title: "Chuẩn bị gặp khách hàng",
    surfaces: ["accounts", "stakeholders"],
    prompt:
      "Chuẩn bị account brief trước cuộc gặp: tóm tắt quan hệ, các cơ hội, người quyết định và ảnh hưởng, phản đối đang mở, cam kết, mục tiêu và câu hỏi nên hỏi. Chỉ dùng dữ liệu trong phạm vi đã chọn; phân biệt thiếu thông tin với suy đoán.",
    result: "Brief, mục tiêu cuộc gặp và câu hỏi theo từng người.",
  },
  {
    id: "deal-coach",
    title: "Gỡ vướng Opportunity",
    surfaces: ["opportunities", "objections"],
    prompt:
      "Phân tích deal risk và coaching: cơ hội nào cần Rescue hoặc Downgrade theo Memoire, bằng chứng nào còn thiếu, phản đối nào chưa giải quyết? Đề xuất bước tiếp theo và soạn phản hồi dựa trên bằng chứng; chưa đổi bản ghi.",
    result: "Chẩn đoán deal, khoảng trống và phương án xử lý.",
  },
  {
    id: "forecast",
    title: "Bảo vệ forecast",
    surfaces: ["revenue", "coverage", "reports", "dashboards"],
    prompt:
      "Rà soát forecast quý hiện tại: tách open pipeline, declared weighted, evidence-adjusted và Won; chỉ ra deal thiếu thời điểm hoặc giá trị/FX. Không coi forecast là doanh thu thực thu.",
    result: "Forecast dùng số tính của Memoire, có giới hạn dữ liệu.",
  },
  {
    id: "collections",
    title: "Theo dõi công nợ",
    surfaces: ["revenue", "quotes"],
    prompt:
      "Phân tích collections công nợ: khách hàng nào có khoản quá hạn cần theo dõi trước, số tiền nào được xác nhận và số nào theo lịch giả định? Soạn lời nhắc thanh toán lịch sự, không gửi và không ghi nhận khoản thu.",
    result: "Ưu tiên công nợ và bản nháp nhắc thanh toán.",
  },
  {
    id: "learning",
    title: "Rút kinh nghiệm Won/Lost",
    surfaces: ["reviews"],
    prompt:
      "Phân tích win/loss learning từ kết quả đã ghi: lý do lặp lại, bài học, bằng chứng thiếu và việc nên kiểm chứng ở các cơ hội đang mở. Nêu cỡ mẫu; không suy ra quan hệ nhân quả từ tần suất.",
    result: "Bài học có nguồn và mức độ dữ liệu hỗ trợ.",
  },
  {
    id: "brands",
    title: "Phân tích Brand",
    surfaces: ["products", "reviews"],
    prompt:
      "Brand nào đang tăng hoặc giảm theo giá trị ước tính đã ghi trong tháng so với cùng khoảng ngày tháng trước? Dùng Brand ID chính thức, tách chưa phân loại và chỉ rõ dữ liệu thiếu.",
    result: "So sánh danh mục theo nguồn và kỳ rõ ràng.",
  },
  {
    id: "hygiene",
    title: "Rà soát dữ liệu thiếu",
    surfaces: ["reports", "imports", "opportunities"],
    prompt:
      "Rà soát data hygiene: cơ hội đang mở nào thiếu next action, ngày làm, bằng chứng hoặc giá trị? Tách thiếu thông tin với quá hạn; đề xuất cách bổ sung, không tự điền dữ kiện chưa biết.",
    result: "Danh sách khoảng trống và gợi ý sửa có căn cứ.",
  },
  {
    id: "notes",
    title: "Ghi chú thành hành động",
    surfaces: ["capture", "activity"],
    prompt:
      "Tôi muốn chuyển ghi chú cuộc trao đổi thành đề xuất cập nhật cơ hội hiện có và việc Plan. Hãy hỏi ghi chú, opportunity chính xác và ngày nếu chưa rõ; tách điều khách nói, suy đoán và hành động. Chưa lưu trước khi có thông tin.",
    result: "Đề xuất cập nhật trường và Plan từ ghi chú bạn cung cấp.",
  },
];

export function workflowsForSurface(surface = "") {
  const page = surface.split("?")[0].split("/").filter(Boolean).at(-1) || "";
  const matching = aiWorkflows.filter((workflow) =>
    workflow.surfaces.includes(page),
  );
  return matching.length ? matching : aiWorkflows.slice(0, 3);
}

export function viewedRecordScope(
  search: string,
): { kind: "account" | "opportunity"; id: string } | null {
  const params = new URLSearchParams(search);
  const opportunity = params.get("opportunityId");
  const account = params.get("accountId");
  const id = opportunity || account;
  return id && /^[a-zA-Z0-9_-]{1,160}$/.test(id)
    ? { kind: opportunity ? "opportunity" : "account", id }
    : null;
}
