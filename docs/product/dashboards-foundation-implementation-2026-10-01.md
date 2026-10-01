# Memoire — bước 3: Dashboard tùy chỉnh

Ngày: 2026-10-01. Phạm vi: bản đầu triển khai trong checkout, chưa deploy ứng dụng hoặc áp dụng migration Dashboard lên Production. Tiếp nối [bước 1 Products & Brands](portfolio-foundation-implementation-2026-10-01.md) và [bước 2 Reports](reports-foundation-implementation-2026-10-01.md).

## Trải nghiệm sử dụng

Điểm vào: **Dashboards trên menu chính**, hoặc **Settings → Workspace → Build dashboards**. Đường dẫn: `/app/dashboards`.

1. Tạo và lưu report trong Reports nếu chưa có nguồn phù hợp.
2. Tạo dashboard, đặt tên và mục đích; thêm widget tham chiếu một saved report, chọn chỉ số và cách hiển thị.
3. Chọn bộ lọc BU, brand, product group hoặc product cho toàn dashboard, kể cả phạm vi chưa phân loại.
4. Refresh để xem một lần chạy hiện tại; bấm chỉ số, thanh hoặc dòng tổng hợp để kiểm tra các bản ghi nguồn.
5. Lưu cấu hình, sửa thứ tự widget, nhân bản, archive/restore, hoặc xuất dữ liệu của lần chạy.

Ba kiểu widget là **metric card**, **horizontal bar chart** và **summary table**. Dashboard hỗ trợ tối đa 12 widget. Layout theo thứ tự widget; thẻ chỉ số nằm tối đa hai cột trên desktop, chart/table có chiều rộng đầy đủ, mobile xếp theo cùng thứ tự. Có nút Move up/down và Remove, không yêu cầu thao tác kéo thả. Bảng tùy chỉnh và bộ lọc có thể thu gọn; trên mobile bộ lọc mặc định thu gọn và summary vẫn cho biết phạm vi đang áp dụng.

Bar chart so sánh các nhóm, có baseline zero, scale chung, nhãn và giá trị luôn hiện. Nhóm thiếu số vẫn có nhãn trạng thái; thiếu không bị vẽ thành zero được khẳng định. Với win rate, scale là 0–100%, kèm denominator và ngưỡng ít nhất ba deal quyết định. Chart chỉ hiển thị tối đa 12 nhóm theo giá trị giảm dần và nêu rõ X/N nhóm; không tạo bucket Other có tỷ lệ gây hiểu nhầm. Summary table cho xem đủ nhóm qua trang 20 dòng. Chi tiết nguồn 100 dòng/trang và dùng đúng columns/labels trong report gốc.

## Nghĩa dữ liệu và sự thống nhất

Widget lưu `reportId`, kiểu, chỉ số, nhãn và thứ tự; không nhập tay số liệu, không sao chép definition của report, không tạo một metric engine khác. Nhiều widget cùng report dùng một kết quả truy vấn. Refresh dùng các revision hiện tại của saved reports, cùng một workspace read context, timestamp, timezone và cơ sở reporting currency/tỷ giá được chụp cho toàn lần chạy.

Đây là **captured current view** từ các loader hiện hữu, không phải transaction snapshot nguyên tử giữa mọi bảng hay tái dựng lịch sử. Source loaders có thể dùng bản sao trình duyệt; nguồn, giới hạn và cơ sở tiền có trong từng widget và metadata. Bản chạy nằm trong bộ nhớ hoặc file export, chưa phải kho snapshot lâu dài.

Filter danh mục chung giới hạn sources trước khi chạy điều kiện riêng của report. Vì vậy `global scope AND (report condition A OR report condition B)` giữ đúng ý nghĩa; không thêm điều kiện chung vào một danh sách OR rồi vô tình mở rộng tập dữ liệu. Mọi filter danh mục dùng ID chuẩn từ bước 1, giữ độc lập với đổi tên và quyền đọc owner. Filter BU không cấp quyền đọc dữ liệu của nhân viên khác.

Các semantics của bước 2 giữ nguyên: một opportunity/order một dòng, qualified pipeline chỉ tính Active qualified deals, Won value không phải tiền đã thu, win rate tính lại theo denominator, cash theo recorded receipts và planning schedule, missing values giữ trạng thái thiếu. Drill-through cho xem toàn bộ dòng của report trong nhóm đã chọn và nêu quy tắc Active/Won hoặc payments; không ngụ ý mọi giá trị nguyên gốc trong bảng đều đóng góp cho mọi chỉ số.

**Open saved report** mở đúng report theo ID và cấu hình/bộ lọc riêng của nó. UI nói rõ filter dashboard vẫn thuộc dashboard. Người dùng có thể mở deal nguồn ngay trong bảng drill-through của lần chạy đã lọc.

## Trạng thái và recovery

- Sửa cấu hình hoặc filter làm ẩn kết quả không còn đại diện cho câu hỏi mới; cần Refresh.
- Trong refresh, kết quả trước còn hiện với nhãn đang làm mới. Refresh lỗi giữ lần chạy cũ, đánh dấu rõ và khóa export tới khi refresh thành công.
- Report bị mất hoặc archive tạo widget unavailable. Các widget còn nguồn hợp lệ vẫn chạy; không thay vào đó bằng zero hoặc dữ liệu của report khác.
- Report bỏ chỉ số hoặc grouping cần cho chart tạo thông báo sửa widget/report. Bar chart không dùng report chưa grouping.
- Query URL giữ selected dashboard ID, filter và drill selection; hỗ trợ reload và Back. URL không mang dữ liệu nguồn hoặc cấp quyền chia sẻ. Filter/selection sai được báo và có đường reset/đóng.
- Demo và owner tách phạm vi. Demo không gọi cloud; reset chỉ xóa cấu hình có tag demo/sample.
- Ghi local thất bại được báo chưa lưu và không tiếp tục cloud. Cloud chưa sẵn sàng nói rõ bản cấu hình chỉ lưu trong trình duyệt. Đổi owner trong lúc tải bị từ chối.
- Revision/history chứng minh quan hệ tiếp nối; xung đột giữa hai nhánh không tự dùng bản mới nhất theo timestamp. Archive giữ lịch sử và có Restore.

## Export và lưu trữ

Export ZIP có các thư mục report được đánh số: `details.csv`, `summary.csv`, `report-metadata.json`. Mỗi source report chỉ xuất một lần dù có nhiều widget. CSV chứa đầy đủ tập đã lọc, không chỉ top-12 chart, trang summary hoặc trang drill-through. Metadata Dashboard giữ cấu hình, filter chung, report ID/revision, timestamp và thông báo nguồn/widget unavailable; metadata report giữ metric versions, totals, currency và captured rates. CSV dùng cơ chế escape formula và typed cells đã kiểm chứng ở Reports.

`memoire.dashboardDefinitions.v1` / `dashboard_definitions` giữ definition, archive và history; không lưu dữ liệu kinh doanh thứ hai. Migration `20261001113530_dashboard_definitions.sql` tạo RLS owner-only, revoke anonymous, guard identity/revision chain, đồng thời nâng guard RPC restore từ format 17 lên **18** với kiểm tra definition drift. Durability inventory, backup restore và export API có bảng mới. Report reference thiếu sau restore được hiển thị unavailable, không tự gắn vào một report cùng tên.

Migration đã được kiểm tra bằng database cục bộ; chưa áp dụng Production. Quyết định rollout ứng dụng/schema vẫn theo gate P1 riêng.

## Thiết kế triển khai và giới hạn

Job chính: so sánh nhóm và review trạng thái hiện tại trên dữ liệu bảng. React sở hữu rendering/interactions; DOM/CSS bars cho tối đa 144 thanh, trực tiếp cùng button label/value. Không thêm thư viện chart, Canvas/WebGL, animation, polling hoặc motion không có ý nghĩa dữ liệu. Color roles: text/context navy-gray, thanh/focal blue, trạng thái lỗi/partial amber-red, focus outline riêng; giá trị và cảnh báo có chữ, không phụ thuộc màu. Keyboard Enter/Space, click và tap cùng mở nguồn; không có giá trị chỉ xuất hiện khi hover.

Trên mobile portrait 390px, primary evidence giữ thứ tự, control editor/filter thu gọn và có nhãn trạng thái. Bảng rộng có scroll trong wrapper; trang không tràn ngang. Desktop 1440px có multi-column metric cards và chart/table full width. Không có sensors, notification hoặc background scheduler.

Giới hạn 12 widget, 12 thanh/chart, 20 nhóm/trang, 100 dòng chi tiết/trang, tối đa 10.000 bản ghi nguồn mỗi report như bước 2. Kiểm tra giới hạn và duplicate source trước global filter để không tạo partial report từ nguồn vượt giới hạn. Chưa chứng nhận throughput/bộ nhớ ở quy mô tập đoàn; server aggregation và benchmark dữ liệu thực là điều kiện trước khi mở rộng.

Chưa có dashboard image/PDF export riêng, freeform layout/resize, pie/time series/heatmap, cross-filter tự động giữa charts, formulas, targets theo BU, permanent snapshots, chia sẻ report/dashboard, quyền tổ chức, live connector polling hoặc scheduled delivery. Chart trend lịch sử chờ dữ liệu/history đáng tin. Export dữ liệu đầy đủ đã có; print/PDF của report tiếp tục dùng bước 2.

Learning & Analytics hiện có tiếp tục phục vụ review theo kỳ và learning từ dữ liệu lịch sử; Dashboard này phục vụ câu hỏi tùy chỉnh từ saved reports. Không copy các panel learning thành widget hoặc dựng số liệu lịch sử mới để lấp khoảng trống. Khi mở rộng registry, ưu tiên dùng source/metric definitions chung và loại các view trùng câu hỏi.

## Kiểm chứng

`npm run check` đạt: build production, typecheck ứng dụng/API, lint, **2.071 unit/integration tests** và toàn bộ contract checks. Tests mới kiểm tra typed/bounded definitions, one result per source report, snapshot không đổi khi mutate input, global AND + report OR, missing/archive/removed measure/ungrouped chart, top-N và missing/zero, limit/duplicates, history/conflict, quota/cloud, owner change, backup sample exclusion/divergence và RLS read/write giữa hai owner/anonymous/demo.

`node scripts/verify-dashboards-browser.mjs` đạt: tạo bốn widget, reorder, lưu/reload/filter/Back, keyboard drill-through và phân trang 131 nguồn, ZIP export thực tế đủ 131 dòng và hai reports cùng timestamp, mở đúng saved report, empty scope không tạo số giả, stale state sau refresh lỗi, report archive vẫn giữ widget cash hợp lệ, duplicate/archive/restore, mobile, quota refusal và demo isolation/reset. Đã xem trực quan screenshots desktop/mobile tại `.codex-dashboards-qa/` (fixture test, được ignore).

Browser smoke của **Reports và Products & Brands cũng chạy lại đạt** sau thay đổi. Đây là kiểm chứng local, không phải bằng chứng release Production hay độ chính xác trên dữ liệu khách hàng.

## Phần tiếp theo cần dữ liệu sử dụng

Ba năng lực có bản nền tảng xuyên từ phân loại → report → dashboard → nguồn → export. Theo dõi câu hỏi được dùng lặp lại, trường còn thiếu và các quyết định thực tế trước khi thêm dạng chart hoặc công thức. Report customization sâu hơn (XLSX, snapshots, formula/pivot), mục tiêu/phân bổ product bundle và quản trị nhiều người là các phạm vi tiếp theo riêng, có điều kiện dữ liệu/quyền tương ứng trong đề xuất gốc.
