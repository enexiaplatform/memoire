# Memoire — Đóng 7 lỗi từ audit B2B 12 tháng

**Trạng thái: F01–F07 đã sửa và được kiểm chứng trên Production ngày 03/10/2026.** Bản phát hành ứng dụng: `153fd6014c876c484d2cfd19ab56c10bffc22ddb`. Tài khoản Northstar là doanh nghiệp giả lập; mọi phép thử gây lỗi chỉ tác động tài khoản QC này và đã hoàn trả dữ liệu ban đầu. Báo cáo audit gốc vẫn giữ bằng chứng của bản trước khi sửa.

| Lỗi | Thay đổi | Kết quả kiểm chứng |
| --- | --- | --- |
| F01 — Backup thiếu lịch sử | Phân trang `commercial_history_coverage` bằng khóa thật `user_id`. | Kiểm tra cột phân trang và khóa duy nhất của toàn bộ bảng theo schema. ZIP thực tế đủ 56 bảng, 1.290 dòng, 488 State Revisions; qua kiểm tra phục hồi. |
| F02 — Quote nháp đổi giá trị đơn đã chấp nhận | Quote Accepted mới nhất quyết định giá trị, tiền tệ, điều khoản và bằng chứng thực hiện. Draft/Sent/Expired không ghi đè hợp đồng. | Ca quote nháp 20.000 USD không làm đổi tổng giá trị đơn. Revision Accepted hợp lệ được áp dụng; revision cùng ngày được chọn thống nhất trong Orders và Reports. |
| F03 — Receipt trùng bị tính hai lần | Cùng mã và cùng nội dung chỉ tính một lần; cùng mã nhưng nội dung khác bị từ chối trước tính toán, ghi hoặc phục hồi. | Retry không đổi dữ liệu hay thời điểm cập nhật. Hai chuyển khoản cùng tiền/ngày nhưng khác mã vẫn được giữ. Dữ liệu xung đột không bị che thành workspace rỗng. Probe cloud: chênh lệch tiền thu bằng 0. |
| F04 — Nhận tiền trong tương lai | Form và hàm ghi từ chối ngày tương lai. Receipt cũ có ngày tương lai/sai vẫn hiện để sửa, nhưng không góp vào số đã thu tại ngày tính. | Đúng ngày chốt được tính, ngày sau chốt bị loại; ngày sai không được đổi thành hôm nay. Form từ chối 2099-01-01, không đổi receipts trên cloud. Probe cloud loại đúng 10.000 USD. |
| F05 — Gắn nhãn USD cho receipt EUR | Lịch sử receipt hiển thị số tiền và tiền tệ gốc. Tổng hợp dùng tiền tệ báo cáo. | Receipt 1.260 EUR hiển thị đúng EUR trong workspace báo cáo USD. |
| F06 — Orders tiếp tục đòi tiền đã thu | Orders, Reports, Today cash và câu trả lời money trong Ask đọc collection records. Khi có collection record, số dư thực nhận quyết định Deposit/Collected; tick thủ công không ghi đè bằng chứng này. | Kiểm tra thu đủ, thu một phần, thu dư, hoàn tiền, xóa receipt cuối, thu đủ deposit và thiếu tỷ giá. 24 đơn thu đủ và 24 đơn còn mở khớp Collections. Đơn thu đủ không còn Deposit due/overdue/stalled. |
| F07 — Deep link làm mất Collections | Chỉ xóa `orderId` sau khi mở đơn; giữ `view` và tham số còn lại. Đơn thu đủ cũng mở được. | Kiểm tra URL và nội dung sau khi hiệu ứng xử lý link hoàn tất, cả desktop và mobile 390px. |

## Kiểm chứng bản phát hành

- `npm run check` qua build, API typecheck, lint, các hợp đồng phát hành và **2.085 test; 0 thất bại**.
- Đối soát độc lập qua đủ **12 mốc tháng**: pipeline, giá trị đơn, tiền thu, công nợ và biên lợi nhuận đều khớp.
- Chạy lại probe bằng dữ liệu thật trên cloud của tài khoản giả lập: receipt trùng chênh lệch 0; receipt tương lai chênh lệch 0; quote nháp chênh lệch dưới 0,000000001 USD. Mọi dữ liệu gây lỗi được trả về ban đầu trước phát hành.
- Các bộ kiểm tra trình duyệt Reports, Dashboards, product linkage và Next-Gen qua. Reports/Dashboards/linkage chạy lại trên build ứng dụng cuối cùng.
- Kiểm tra sau phát hành trên [Memoire Production](https://www.memoire-official.com) qua desktop/mobile, deep link, nhãn tiền tệ, từ chối ngày tương lai, trạng thái thu đủ/thu một phần, tải báo cáo và backup. Không ghi nhận lỗi runtime trình duyệt hoặc REST response thất bại.
- Vercel dùng `api/tsconfig.json` kế thừa cấu hình API đã được kiểm tra, để nhận khai báo kiểu Node. Build Vercel cuối không có lỗi TypeScript. Các snapshot QA được loại khỏi phạm vi lint mã nguồn ứng dụng.

## Backup và phục hồi có dữ liệu

Backup vừa xuất qua giao diện Production có manifest `complete: true`, không có cảnh báo: **56 bảng, 1.290 dòng, 488 revision gốc**. Bộ kiểm tra phục hồi chấp nhận file.

Diễn tập trên database cách ly phục hồi **41 collection chuẩn**, giữ nguyên mọi trường revision, lineage và ranh giới bảo đảm lịch sử. Gọi lại phục hồi lịch sử trả `no_op`. Dữ liệu đã phục hồi cho các số USD sau:

| Chỉ tiêu | Sau phục hồi |
| --- | ---: |
| Tiền đã thu | 412.384,6154 |
| Còn phải thu | 359.076,9215 |
| Giá vốn và chi phí landed | 511.776,9231 |
| Lợi nhuận gộp | 252.069,2308 |
| Đơn thu đủ / đơn còn mở | 24 / 24 |

Các giá trị khớp bộ tính kỳ vọng độc lập. Harness cách ly cấp quyền bảng Data API tương đương Supabase và giữ các owner policy từ migrations. Phạm vi xác minh là phục hồi dữ liệu/lịch sử ứng dụng; không xác nhận diễn tập phục hồi toàn bộ hạ tầng nhà cung cấp.

## Danh tính phát hành và bằng chứng

Deployment Production `dpl_FhcgggxzP1yvV3QPbBtbsksxCrqr` ở trạng thái Ready, phục vụ tên miền chính, có Git SHA khớp snapshot đã kiểm chứng. Commit ứng dụng hiện có trên `main` và nhánh Production được cấu hình là `master`. Deployment trước `dpl_4GWHY45MXbskijn7xweBgM4FuVRG` là mốc rollback. Không có migration database hoặc thay đổi cấu hình billing trong bản sửa này. Các thay đổi backup script và tài liệu sự cố database đã có trong thư mục làm việc được giữ nguyên.

Bằng chứng riêng trên máy nằm trong `.audit/global-b2b-remediation-2026-10-03/`: `calculation-evidence.json`, `final-staged-probes/probe-evidence.json`, `production-release-api.json`, `verified-live-deployment.json`, và `production-browser/acceptance.json`, `workspace-backup.zip`, `restore-rehearsal.json`. Bằng chứng gốc nằm trong `.audit/global-b2b-year-2026-10-03/`. Các file này được Git bỏ qua; credentials và session không được công bố.
