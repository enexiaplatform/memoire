# Memoire — bước 2: Reports tùy chỉnh

Đối chiếu liên kết 2026-10-01: catalog entry mở draft đúng phạm vi ID; chọn/lưu report giữ ID trong URL cho reload/Back. Report đã lưu và không còn thay đổi chưa lưu có thể tạo dashboard draft dùng chính report đó. Liên kết thiếu/sai phạm vi không chạy một report mặc định khác. Xem [audit logic và công sức sử dụng](../qa/product-logic-linkage-audit-2026-10-01.md).

Ngày: 2026-10-01. Trạng thái: hoàn tất phạm vi bước 2 trong checkout; chưa deploy ứng dụng hoặc áp dụng migration lên Production. Tiếp nối [Products & Brands](portfolio-foundation-implementation-2026-10-01.md) và [đề xuất phát triển ba năng lực](portfolio-analytics-reporting-proposal-2026-10-01.md).

## Kết quả sử dụng được

Điểm vào: **Reports trên menu chính**, hoặc **Settings → Workspace → Build reports**. Đường dẫn trực tiếp: `/app/reports`.

- Hai template: **Portfolio Performance** và **Collections & Blockers**. Chọn dataset Opportunities hoặc Collections để bắt đầu câu hỏi khác.
- Chọn trường thuộc dataset, tìm trường, đổi nhãn cột và đổi thứ tự cột. Dữ liệu deal, danh mục chuẩn, thông tin người mua, blocker, đơn hàng và khoản thu có registry với kiểu rõ ràng.
- Chọn tập qualified, Leads hoặc toàn bộ opportunities. Collections chỉ dùng đơn hàng qualified.
- Tối đa 20 bộ lọc theo kiểu số/ngày/text/boolean/ID danh mục, kết hợp AND hoặc OR; điều kiện thiếu/có dữ liệu riêng. Sắp xếp tăng/giảm, dữ liệu thiếu ở cuối.
- Bảng chi tiết hoặc tổng hợp theo tối đa hai chiều. Các chỉ số đã định nghĩa gồm số bản ghi, qualified pipeline, Won deal value, win rate, order value, recorded receipts, outstanding và overdue tùy dataset.
- Mở từng nhóm ra danh sách bản ghi và mở deal nguồn để tiếp tục xử lý trong workflow hiện tại.
- Lưu report, sửa, nhân bản, archive và restore. Archive giữ lịch sử; cần restore trước khi mở lại bản đã archive.
- Xuất ZIP chứa `details.csv`, `summary.csv` và `report-metadata.json`. CSV bao gồm toàn bộ kết quả, không chỉ trang preview; metadata ghi cấu hình, phạm vi nguồn, thời gian, timezone, cơ sở tỷ giá, phiên bản chỉ số và totals.
- In hoặc Save as PDF qua trình duyệt: bảng đầy đủ trong giới hạn bản in, tiêu đề bảng lặp qua trang, có ngữ cảnh lần chạy và nguồn.

Report lưu một câu hỏi và cấu hình. Mỗi lần Run đọc lại workspace và tạo một kết quả được giữ nguyên cho preview/export/print của lần đó. Sửa cấu hình ẩn kết quả cũ và yêu cầu chạy lại. Kết quả này chỉ ở bộ nhớ và file người dùng xuất; chưa có kho snapshot dài hạn.

## Align với dữ liệu và workflow hiện tại

Dataset Opportunities có grain **một opportunity một dòng**. Phân loại BU/brand/group/product lấy từ ID và assignment của bước 1; tên gốc trên deal vẫn là trường riêng. Hai danh mục cùng tên không bị gộp: filter/group theo ID, hiển thị tên để người dùng đọc được.

Qualified pipeline, giá trị Won và win rate dùng lại `summarizePortfolio`; chỉ tính trên tập đã lọc. Won là giá trị deal, không phải tiền thu hay doanh thu kế toán. Win rate chỉ xuất hiện khi có ít nhất ba deal quyết định; total được tính lại từ Won/Lost, không lấy trung bình tỷ lệ từng nhóm. Tập Lead/disqualified không lẫn vào qualified Lost.

Dataset Collections có grain **một committed qualified order một dòng**, dùng lại `buildOrderBook` và `buildReceivables`. Chỉ quote liên kết opportunity bằng ID được sử dụng; quote cùng ngày được phân định tiếp bằng timestamp revision và ID. Quote cũ chỉ khớp theo tên bị loại khỏi Reports để tránh liên kết nhầm; màn hình Money cũ vẫn giữ cơ chế tương thích của nó. UI và metadata nêu khác biệt này. Nhiều quote hoặc nhiều receipts không nhân số dòng hay giá trị đơn hàng. Mốc ngày và overdue theo mô hình lịch thanh toán lập kế hoạch hiện tại; recorded receipts là khoản thu đã ghi trong Memoire, chưa phải đối soát kế toán được chứng nhận.

Tiền được quy đổi một lần theo reporting currency và tỷ giá lập kế hoạch/cấu hình workspace được chụp ở lần chạy. Giá trị hoặc tỷ giá thiếu giữ trạng thái thiếu, không thành zero; tổng một phần ghi số bản ghi thiếu. Dữ liệu nguồn trùng identity/linkage bị từ chối để người dùng xử lý, không tự chọn một bản rồi cộng tiền.

Trường và chỉ số có danh sách cho phép theo dataset. Chưa có join tùy ý, custom SQL, công thức tự do, pivot/matrix, dữ liệu ngoài chưa chấp nhận hoặc tổng hợp dữ liệu nhiều người. Đây là nền tảng để Dashboard dùng đúng cùng kết quả truy vấn, thay vì phát sinh một cách tính độc lập.

## Lưu trữ, quyền và recovery

`memoire.reportDefinitions.v1` / `report_definitions` giữ definition có phiên bản, trạng thái archive và lịch sử chỉnh sửa. Demo và owner tách phạm vi; demo không gọi bảng cloud. Reset demo chỉ xóa bản ghi được tag demo/sample, giữ bản ghi thật.

Lỗi ghi trong trình duyệt được báo là chưa lưu và không tiếp tục ghi cloud. Cloud chưa sẵn sàng được báo rõ là bản sao trình duyệt; dữ liệu nguồn có thể là browser copy và không được mô tả là snapshot giao dịch đồng bộ trên mọi bảng. Thay owner trong lúc tải làm kết quả cũ bị từ chối. Phiên bản mới chỉ được hợp nhất nếu lịch sử chứng minh tiếp nối phiên bản đã biết; hai nhánh khác nhau không dùng last-write-wins.

Migration `20261001074206_report_definitions.sql` tạo bảng với RLS owner-only, chặn anonymous/demo/foreign writes và kiểm tra revision chain. Migration đồng thời nâng điều kiện format của RPC khôi phục từ 16 lên 17, dừng khi định nghĩa trước đó lệch mẫu đã kiểm chứng. Backup format **17** thêm report definitions và history; export API và durability inventory đã chứa bảng mới. Các nguồn history có authority/lineage hiện hữu giữ nguyên phạm vi.

Migration đã chạy trong kiểm tra database cục bộ, **chưa áp dụng Production**. Đồng bộ trên nhiều thiết bị cần ứng dụng và schema được phát hành, kiểm chứng riêng theo gate P1.

## Giới hạn đã công bố

- Tối đa **10.000 bản ghi nguồn** mỗi dataset/lần chạy; vượt giới hạn thì từ chối thay vì tạo báo cáo thiếu.
- Preview **100 dòng/trang**. CSV pack xuất toàn bộ tập đã lọc.
- Bản in chi tiết tối đa **8 cột / 2.000 dòng**, hoặc summary tối đa **2.000 nhóm**; UI nêu lý do khi vượt giới hạn và hướng người dùng dùng CSV.
- Dataset hiện tại và phân loại hiện tại; không tái dựng report lịch sử từ các bảng Quote/Receivable chưa có history đầy đủ.
- Chưa có XLSX, scheduled delivery, permanent result snapshots, report sharing hoặc quyền tổ chức/BU liên người dùng. Bộ lọc BU chỉ chọn dữ liệu đã được phép đọc.

## Kiểm chứng

`npm run check` đạt: production build, kiểm tra kiểu ứng dụng/API, lint, **2.059 unit/integration tests** và toàn bộ contract checks của repository. Các test mới kiểm tra definition/kiểu/ngày, missing values, AND/OR, ID grouping, denominator win rate, kết quả giữ nguyên cơ sở tiền, CSV escape formula, exports đầy đủ, giới hạn nguồn, quote/receipt không cộng trùng, scope/history, quota, backup và RLS giữa hai owner/anonymous/demo.

`node scripts/verify-reports-browser.mjs` đạt: templates, tạo/sửa/lưu/reload/duplicate/archive/restore, cấu hình làm mất hiệu lực kết quả cũ, drill-through, hai trang của 131 dòng, download ZIP thực tế với đầy đủ dòng, filter collections, bản in, mobile 390px, quota refusal, demo không gọi cloud và reset demo giữ report thật. Fixtures và artifact QA nằm trong `.codex-reports-qa/` được ignore, không phải dữ liệu khách hàng.

Kiểm tra PDF từ trình duyệt: **9 trang, đủ 131 deal nguồn, tiêu đề lặp mỗi trang, không lẫn nút điều hướng của ứng dụng**. Đã kiểm tra trực quan trang đầu, giữa và cuối, cùng ảnh giao diện desktop/mobile. Đây là bằng chứng local, không chứng nhận rollout Production hoặc tính đầy đủ của dữ liệu kế toán.

## Bước 3

Cập nhật sau bước 2: [Dashboard builder nền tảng đã triển khai cục bộ ở bước 3](dashboards-foundation-implementation-2026-10-01.md), với backup hiện tại format 18. Bản ghi bước 2 phía trên giữ đúng scope/format 17 và kiểm chứng tại thời điểm hoàn tất Reports.

Xây Dashboard builder với widget tham chiếu saved report, chọn cách biểu diễn phù hợp kiểu dữ liệu, cùng scope và cùng lần chạy cho các con số được so sánh. Drill-through mở report/bản ghi nguồn. Tiếp tục tránh chart trùng Analytics hiện tại và trend lịch sử không có bằng chứng. Widget không tự nhập lại số hoặc tạo công thức cạnh tranh với Reports.
