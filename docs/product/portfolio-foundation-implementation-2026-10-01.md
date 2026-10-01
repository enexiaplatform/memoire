# Memoire — bước 1: nền tảng Products & Brands

Ngày: 2026-10-01. Phạm vi: triển khai cục bộ trong checkout; chưa deploy hay áp dụng migration lên Production.

## Kết quả sử dụng được

Điểm vào: **Products & Brands trên menu chính**, hoặc **Settings → Workspace → Manage portfolio**. Đường dẫn trực tiếp: `/app/products`.

- Tạo và sửa Business unit, Brand, Product group, Product / solution; danh mục chưa có deal vẫn hiện.
- BU và nhóm sản phẩm có cây cha/con riêng. Product có brand/group mặc định; brand không tự cấp hoặc ngụ ý quyền BU.
- Đổi tên, ngừng sử dụng và kích hoạt lại giữ ID, liên kết và lịch sử phiên bản. Không thêm liên kết mới vào mục đã ngừng sử dụng.
- Phân loại deal theo một BU, brand, group và product chính. Giữ trường brand/product gốc, chỉ gợi ý khớp chính xác với tên/alias đã xác nhận; không tự merge tên gần giống.
- Product mặc định hỗ trợ điền brand/group. Phân loại đã lưu độc lập với mặc định: thay mặc định của product không âm thầm sửa deal cũ.
- Mở lại deal nguồn từ màn hình phân loại.
- Xem qualified pipeline hiện tại, giá trị deal Won và win rate; từng danh mục có số bản ghi liên kết và pipeline.

Đây là phần đầu của giai đoạn A trong đề xuất, chưa phải hoàn tất toàn bộ ba tính năng. Chưa triển khai mục tiêu theo BU/brand, Reports builder hoặc Dashboard builder.

## Nghĩa số liệu

Mỗi opportunity chỉ có một dòng dữ liệu và một phân loại chính; không join quote/commitment để nhân giá trị deal. BU/group ở bước này là phân loại của người sở hữu dữ liệu, chưa cộng dồn cấp cha hay tổng hợp dữ liệu nhiều nhân viên.

Qualified pipeline dùng các deal Active ngoài tập Lead, bao gồm việc loại Lead đã bị disqualify khỏi các kết quả Lost. Phân tích brand cũ trong Review cũng được sửa để dùng cùng tập qualified.

Won deal value là estimated value của các deal Won, không phải doanh thu kế toán hay tiền đã thu. Win rate = Won / (Won + Lost), không gồm Lead và chỉ hiện khi có ít nhất ba deal quyết định. Kết quả Won/Lost hiện là toàn thời gian, không có trend lịch sử hoặc lọc kỳ được suy diễn từ `updatedAt`.

Tiền dùng reporting currency và tỷ giá lập kế hoạch hiện có cùng workspace override. Giá trị hoặc tỷ giá thiếu giữ trạng thái thiếu, không giả bằng zero; tổng một phần ghi số bản ghi bị thiếu. Bucket chưa phân loại hiện rõ. Một bundle chưa có breakdown không được tách thành nhiều product; người dùng có thể để product chưa phân loại.

## Lưu trữ và khôi phục

`memoire.portfolioRecords.v1` / `portfolio_records` giữ danh mục, phân loại và lịch sử thay đổi ngay trong payload. Chủ sở hữu và demo được tách; dữ liệu demo không gửi cloud, reset demo chỉ xóa bản ghi có tag demo/sample.

Lỗi lưu trong trình duyệt chặn thông báo thành công. Khi cloud chưa sẵn sàng, UI nói rõ bản ghi mới lưu trong trình duyệt và cần thử lại trước khi dùng thiết bị khác. Xung đột hai thiết bị không tự chọn một bản theo thời gian: chỉ chấp nhận phiên bản có lịch sử chứng minh nó tiếp nối bản đã biết; trường hợp khác yêu cầu backup và đối chiếu.

Migration `20261001071024_portfolio_records.sql` tạo bảng owner-only, RLS, từ chối dữ liệu demo và chặn ghi đè revision khác nhánh. Bảng này đã được thêm vào export API và inventory khôi phục.

Backup envelope tăng lên format 16. `20261001073327_portfolio_backup_format.sql` chỉ mở rộng format được chấp nhận của RPC khôi phục lịch sử hiện tại; giữ nguyên các nguồn covered, authority và lineage. Migration dừng nếu định nghĩa format-15 khác điều kiện đã kiểm chứng. Khôi phục danh mục kiểm tra toàn bộ liên kết và từ chối assignment thiếu deal nguồn.

Chưa áp dụng hai migration trên Production. Đồng bộ nhiều thiết bị cần deployment ứng dụng và schema đã được kiểm chứng; trạng thái P1 được xử lý độc lập.

## Kiểm chứng

- Test domain/storage/database: rename, retirement, stale edits, history, cây acyclic, alias rõ ràng, duplicate identity, descendant/divergent sync, quyền hai owner/anonymous, demo, lỗi quota, backup có liên kết và thiếu nguồn, partition Lead, tiền thiếu và win-rate denominator.
- Kiểm tra browser bằng `node scripts/verify-portfolio-browser.mjs`: tạo bốn loại danh mục, phân loại deal, product defaults, giữ tên gốc, rename/reload, retire, lỗi ghi, không gọi cloud trong demo, reset giữ bản ghi thật, màn hình 1440px và 390px không tràn ngang.
- Ảnh QA nằm tại `.codex-portfolio-qa/portfolio-desktop.png` và `portfolio-mobile.png` (chỉ dữ liệu test; folder được ignore).
- `npm run check` đạt: production build, kiểm tra kiểu ứng dụng/API, lint, 2.044 unit/integration tests và toàn bộ contract checks của repository. Browser smoke phía trên đạt riêng, gồm cả reset demo giữ bản ghi thật.
- Đã kiểm tra trực quan ảnh desktop/mobile. Không dùng kết quả local để tuyên bố đã live hoặc đã kiểm chứng bằng dữ liệu khách hàng.

## Bước tiếp theo

Cập nhật sau bước 1: [Reports nền tảng đã triển khai cục bộ ở bước 2](reports-foundation-implementation-2026-10-01.md), với backup format hiện tại là 17. Nội dung kiểm chứng và format 16 phía trên ghi nhận đúng phạm vi tại thời điểm hoàn tất bước 1.

Tiếp tục giai đoạn B bằng report definition có kiểu và một bộ truy vấn dùng chung: chọn cột, filter và grouping trên dataset opportunity/portfolio; hai template đầu, drill-through và export CSV. Sau khi report/preview/export trả cùng kết quả mới nối dashboard widget vào chính kết quả đó.

Mục tiêu theo scope, phân bổ bundle và dữ liệu tài chính ở grain khác chỉ bổ sung cùng quy tắc dữ liệu và bằng chứng tương ứng. Quyền nhiều người/BU tiếp tục là giai đoạn riêng, vì filter BU không thể thay quyền đọc dữ liệu.
