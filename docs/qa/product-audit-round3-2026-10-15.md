# Memoire — audit tiếp nối ngày 15/10/2026

Đã xác nhận **3 lỗi sản phẩm**: 1 P1 về Lead bị tính thành deal thua; 1 P2 về số tiền chốt bằng 0; 1 P2 về tương phản chữ trong ma trận. Có thêm 1 rủi ro tiếp cận bằng bàn phím cần thử với trình đọc màn hình. Bộ kiểm tra phát hành hiện chưa đạt: 2 contract checks thất bại.

Vòng này tập trung vào tính nhất quán của Today → Leads → Review/Visual Explorer → Opportunities, cùng đối chiếu Money/Collections/Reports/CSV và mobile. Đây không phải nghiệm thu lại toàn bộ mọi chức năng của 10 khu vực. Không sửa mã ứng dụng, không commit/push/deploy và không sửa bản ghi production.

## Môi trường và giới hạn bằng chứng

- Checkout: `b909221bacd9d34da9471416849513af64ddf8cc`, kèm các thay đổi header có sẵn chưa commit. Giữ nguyên các thay đổi này.
- Production: đọc phiên Chrome đang mở tại `www.memoire-official.com/app/reviews`, chuyển qua Analytics rồi trả lại Weekly review. Phiên này là workspace đang được người dùng sử dụng; không gọi là tài khoản QC hư cấu. Không xuất dữ liệu phiên này hoặc ghi vào cloud. Ảnh/DOM production được giữ trong thư mục private.
- Demo: app local tại cổng 5174, bật demo bằng biến môi trường của tiến trình và dùng giá trị Supabase placeholder. Không sửa file cấu hình. Mọi thay đổi thử nghiệm chỉ ở dữ liệu mẫu local của origin này.
- Desktop: 1440×900 cho phần lớn luồng demo; ảnh khởi đầu và ảnh cuối dùng kích thước browser mặc định. Mobile: 390×900, `innerWidth=390`, `scrollWidth=375` (scrollbar chiếm phần còn lại), không có tràn ngang toàn trang trong Review được kiểm tra. Đã trả viewport về mặc định.
- 17 ảnh demo được xem và chấp nhận; 2 ảnh production giữ riêng. `05-demo-explorer.jpg` bị loại vì vẫn hiển thị Weekly review trong lúc chuyển tab. Dùng `05-demo-explorer-accepted.jpg` thay thế. Không dùng ảnh tải dở làm bằng chứng.
- Bằng chứng mới của vòng này: [thư mục private](../../.memoire-private/audit-2026-10-15/), [bộ ảnh demo theo luồng](../../.memoire-private/audit-2026-10-15/report.html). Các báo cáo cũ chỉ dùng để định hướng phạm vi.

## Các bước đã đi qua

| Bước | Thao tác và trạng thái | Bằng chứng mới |
|---|---|---|
| 1 | Production Review → Analytics: tải được, nhãn Workspace records có mặt; chỉ đọc | `01-live-review.*`, `02-live-analytics.*` private |
| 2 | Demo Today: các thẻ pipeline, overdue và thao tác tiếp theo tải được | `03-demo-today.*` |
| 3 | Demo Weekly review → Visual Explorer → Value & probability: có số đếm, tiền tệ, nguồn và cảnh báo thiếu dữ liệu | `04-demo-weekly.*`, `05-demo-explorer-accepted.*` |
| 4 | Leads → Disqualify Harbor Diagnostics với lý do No project: lưu được, còn 2 Lead mở, bản ghi giữ dưới Disqualified | `06-demo-leads-before.*`, `07-demo-lead-disqualified.*` |
| 5 | Quay lại Review/Explorer, tìm Harbor, inspect → Open opportunity: **sai phạm vi dữ liệu**, xem R3-01 | `08-demo-after-disqualify.txt`, `09-demo-disqualified-in-explorer.*`, `10-demo-disqualified-deal-drawer.*`, `20-demo-scoreboard-after.*` |
| 6 | Money Orders → Collections → Reports: số dư và confirmed overdue nhất quán; không thêm khoản thu | `11-demo-money.*`, `12-demo-collections.*`, `13-demo-reports.*`, `14-demo-payments-report.*` |
| 7 | Export CSV pack: tải ZIP thành công; details, summary và metadata khớp số tiền trên màn hình | `payments-report.zip`, `export-parity.json` |
| 8 | Review mobile → Supporting insights → Tab qua ma trận: reflow tốt, nút ô 40×40; **chữ tương phản thấp** | `15-mobile-review.*`, `16-mobile-support.*`, `17-mobile-matrix.*`, `matrix-contrast.json` |
| 9 | Desktop ArrowRight → Enter → Escape: Enter mở đúng inspector; có rủi ro công bố điểm khi duyệt bằng mũi tên | `18-desktop-keyboard-hover.*`, `19-desktop-keyboard-selected.*`, `keyboard-probe.json` |

## R3-01 · P1 · Lead bị loại làm giảm win rate của deal

**Đã tái hiện bằng browser demo, đối chiếu nguồn và chạy probe độc lập.**

Harbor Diagnostics đang ở Lead, chưa qualify. Chọn Disqualify → No project. Queue phản hồi đúng rằng bản ghi được giữ dưới Disqualified. Tuy nhiên:

- Scoreboard từ `0 won` chuyển thành `0 won · 1 lost · 0% win rate`, đồng thời sinh cảnh báo thiếu số tiền của closed record.
- Business review bên dưới vẫn nói không có deal đóng trong kỳ. Changes since review nhận diện đúng đây là `1 lead disqualified`.
- How you sell từ **5/7 = 71%** xuống **5/8 = 63%**; mức pipeline cần cho doanh số tăng từ **1,4×** lên **1,6×**.
- Visual Explorer từ **8** lên **9 opportunities**, Lost từ **1** lên **2**. Tìm Harbor trả lại `New microbiology lab` dưới Lost.
- Open opportunity mở drawer deal với MEDDIC, cảnh báo thiếu champion/buyer và form retro của deal cho một Lead chưa từng qualify. Danh sách Opportunities nền vẫn loại bản ghi này, nên người dùng thấy các phạm vi khác nhau trong cùng luồng.
- Portfolio Performance report giữ **8 qualified records, 75% / 4 decided**; đây là đối chứng cho việc Report dùng phạm vi Lead/deal khác với Explorer/Scoreboard.

Nguồn: [visualExplorer.ts:23](../../src/utils/visualExplorer.ts#L23) chỉ loại `stage === 'Lead'`, trong khi disqualify đã chuyển stage thành Lost; [ReviewAnalyticsSection.tsx:225](../../src/features/reviews/ReviewAnalyticsSection.tsx#L225) truyền workspace opportunities thô. [canonicalReviewOutcomes:404](../../src/utils/outcomeScoreboard.ts#L404) giữ outcome có `stageBeforeOutcome='Lead'`; [operatorProfile.ts:149](../../src/utils/operatorProfile.ts#L149) chỉ lọc theo ngày hợp lệ. Đường predicate chuẩn đã có ở [leadIdentity.ts](../../src/utils/leadIdentity.ts).

Probe hư cấu: thêm 1 disqualified Lead vào 5 Won deals khiến Explorer từ 5→6, Scoreboard lost 0→1 và profile win rate 100%→83,33%, dù `isDisqualifiedLeadOutcome` nhận diện đúng Lead này. Kết quả tại `probe-results.json`.

**Đề nghị:** dùng cùng identity predicate/outcomes cho mọi phép đọc qualified pipeline. Giữ Lead bị loại trong lead learning. Deep link phải mở đúng ngữ cảnh Lead. Điều kiện đạt: disqualify, reload và export không đổi win rate/closed totals/Explorer của qualified deals; Lead funnel vẫn cập nhật.

## R3-02 · P2 · Giá trị chốt bằng 0 bị thay bằng estimate cũ

**Đã xác nhận bằng thực thi hàm với fixture hư cấu; chưa tạo giao dịch bằng 0 trong browser hoặc production.**

Năm Won records có `finalAmount=0`, estimate trước đó mỗi record 100.000 VND. Scoreboard cộng đúng tổng chốt bằng 0. How you sell lại trả median deal value **3,846153846 USD**, tương ứng 100.000 VND; giá trị estimate đã thay thế giá trị chốt được ghi rõ là 0.

Nguồn: [operatorProfile.ts:629](../../src/utils/operatorProfile.ts#L629) chỉ nhận `fromOutcome > 0`, rồi fallback sang estimate. Đây là vấn đề thay dữ kiện hiện có bằng ước tính, kể cả nếu sản phẩm muốn loại free deals khỏi median. [TargetPlanPanel.tsx:45](../../src/features/revenue/TargetPlanPanel.tsx#L45) cũng đọc profile economics, nên kế hoạch dựa trên quy mô deal có thể bị ảnh hưởng; phạm vi UI này mới được xác định từ nguồn.

**Đề nghị:** phân biệt zero và missing. Nếu không dùng deal bằng 0 trong một tỷ lệ kinh tế, loại nó có giải thích; không tự thay bằng estimate. Điều kiện đạt: final zero không trở thành positive estimate; trường hợp thiếu số tiền và thiếu FX giữ trạng thái chưa biết.

## R3-03 · P2 · Số đếm ma trận khó đọc vì opacity áp vào cả chữ

**Đã thấy trên ảnh mobile và đo từ DOM render hiện tại.**

Các ô có số đếm nhỏ dùng chữ trắng 10 px, đồng thời áp opacity 0,675 lên toàn bộ button. Sau compositing trên nền `#faf8f3`, tương phản chữ/nền tính được: Tailin **2,35:1**, Scitek **2,65:1**, No brand set **2,22:1**; PMM với opacity 1 đạt **4,54:1**. Đây là đo màu CSS, không đo pixel đã antialias và không phải chứng nhận accessibility toàn app.

Nguồn: ô matrix trong [VisualExplorer.tsx:153](../../src/features/reviews/VisualExplorer.tsx#L153), [visualExplorer.css:16](../../src/features/reviews/visualExplorer.css#L16). Dữ liệu và phép tính tại `matrix-styles.json`, `matrix-contrast.json`; ảnh `17-mobile-matrix.jpg`.

**Đề nghị:** chỉ điều chỉnh màu nền, giữ chữ opacity 1 và chọn màu chữ theo nền; giữ số đếm đọc được ở mọi mức cường độ. Nút mobile đã có kích thước 40×40 và scroll được trong vùng matrix.

## Rủi ro tiếp cận cần kiểm chứng thêm

Khi focus SVG và bấm ArrowRight, điểm QC workflow đổi `aria-pressed=true`, nhưng focus vẫn ở SVG; SVG không có `aria-activedescendant`, các điểm không có tab stop và inspector `aria-live` không đổi. Chỉ Enter mới cập nhật inspector bằng tên record. Người dùng trình đọc màn hình có thể không biết đang duyệt tới điểm nào. Có đường thay thế bằng danh sách record dạng button; Enter/Escape vẫn hoạt động trong lượt thử này.

Nguồn: [VisualExplorer.tsx:126](../../src/features/reviews/VisualExplorer.tsx#L126). **Chưa chạy NVDA/JAWS**, nên ghi là rủi ro cần xác minh, không khẳng định kết quả phát âm. Đề nghị thêm thông báo tên điểm đang duyệt hoặc mô hình focus rõ ràng, thử lại cùng record-list alternative.

Chữ `0 qualified` trên Scoreboard đang nói về ngưỡng bằng chứng để bảo vệ forecast, còn Reports dùng `Qualified opportunities` cho phạm vi sau Lead. Hai nghĩa đều có trong nguồn nhưng dễ gây nhầm; nên đổi nhãn Scoreboard thành `backs forecast` và ghi ngưỡng tại chỗ.

## Kiểm tra kỹ thuật và gate phát hành

- `npm run check`: build, API typecheck, lint và **2.211/2.211 unit tests đạt**. Dừng ở bước 51/117, `verify:order-margin`, vì assertion yêu cầu `eyebrow="Money"` đã bị thay đổi ở CostAnalysisPage trong phần header chưa commit.
- Chạy tiếp độc lập toàn bộ **66 bước còn lại** để không che lỗi phía sau: 65 đạt, 1 thất bại là `verify:today-command-center` — `Today must keep its two tiers separable`. Check này dò các marker/cấu trúc nguồn của Today; cần hòa giải với bố cục header mới trước khi gọi release green.
- Tổng hợp 117 bước trong chuỗi check: **115 đạt, 2 không đạt**. Đây là các bước cấp cao của script, không phải số unit tests. Không bỏ qua hoặc sửa assertion trong vòng audit.
- Log: `.audit-2026-10-15-check.log`, `.audit-2026-10-15-remaining.log`; danh sách kết quả tiếp tục tại `remaining-contracts.json` private.
- Các lỗi Statsig/Cloudflare từ runtime công cụ browser không được tính là lỗi Memoire. Không suy từ chúng ra tình trạng API/cloud của app.
- Chưa kiểm tra bảo mật xâm nhập, RLS/restore production, gửi email, billing hoặc xác minh deployment SHA trong lượt này. Không có kết luận release production mới.

## Điểm đang hoạt động tốt và thứ tự xử lý

Collections và Payments needing attention cùng có 2 open orders: outstanding **59.615,384615 USD**, confirmed overdue **25.000 USD**, planning dates to confirm **34.615,384615 USD**. ZIP CSV và metadata cùng số liệu, không kéo 2 settled orders vào preset cần chú ý. Demo provenance, bản ghi thiếu value/probability, currency riêng và scope nguồn được thể hiện rõ. Mobile Review không tràn ngang, có supporting insights đóng theo chiều rộng; Enter chọn đúng record, Escape có đường xóa chọn.

Ưu tiên: sửa R3-01 trên cả chuỗi đọc/export/deep link; sửa cách xử lý final zero; chỉnh tương phản và xác minh trình đọc màn hình; cuối cùng hòa giải hai contract checks với layout hiện tại rồi chạy lại gate. Giữ các sửa header có sẵn và tránh bổ sung module trong bước remediation này.
