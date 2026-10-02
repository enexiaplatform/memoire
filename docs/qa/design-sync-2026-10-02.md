# Memoire — đồng bộ Daylight, 2026-10-02

## Kết quả

Đưa các panel cũ trong workspace về nền trắng, bo góc 20px và bóng panel Daylight. Chuẩn hóa màu chữ ink và đường phân cách line trên các bề mặt đã chuyển đổi. Products & Brands, Reports và Dashboards dùng cùng bộ nút pill, biểu mẫu, màu trạng thái và tiêu đề hiện có của Memoire; các trang vẫn là ba điểm đến riêng.

`daylightStyles` cung cấp chung `controlClass`, `fieldLabelClass` và `panelClass`; `daylightForm`, `Panel` và `Card` dùng lại chúng. Các nút hành động ở commercial editor, capture intake, kế hoạch, team và replay cũng dùng hình pill thống nhất. Thành phần Input/Button chung, màn hình đăng nhập, loading, lỗi tuyến đường và khung chart cũng được đồng bộ. Tài liệu brand và tokens được đối chiếu với hệ thống Daylight đã triển khai từ 2026-09-14, gồm nền #F4F7FA, ink #0B141C, muted #646B75, viền #E7ECF2, panel 20px và tile 18px.

Marketing tiếp tục dùng phong cách editorial hiện có trong Brand Guide. Khung bản ghi nhỏ, bảng, drawer và vùng đọc giữ hình dạng phù hợp công việc; không đổi chúng thành các panel lớn. Không đổi thuật toán tính, handler, scope dữ liệu, URL hoặc hợp đồng lưu/xuất.

## Kiểm chứng

- `npm run check`: đạt, 2.078 test, 0 lỗi; bao gồm build, API typecheck, lint và các hợp đồng sản phẩm.
- `verify-product-linkage-browser.mjs`: đạt luồng deal → phân loại → report có phạm vi → dashboard → nguồn → Collections, reload và mobile.
- `verify-standalone-navigation-browser.mjs`: đạt điều hướng desktop/mobile, trạng thái active và bảo toàn các link cũ.
- `verify-next-gen-browser.mjs`: đạt commercial drawer, Scenario không ghi dữ liệu, Decision, console và màn hình hẹp.
- `verify-reports-browser.mjs`: đạt builder, template, drill-through, phân trang, CSV đầy đủ, print, lưu/sửa/khôi phục và cô lập demo.
- `verify-daylight-surfaces-browser.mjs`: đạt 19 bề mặt workspace và 7 trang public/auth ở 1440px và 390px. Kiểm tra font/màu tiêu đề workspace, nút chính của ba trang mới, tràn ngang tài liệu và lỗi chạy. Kiểm tra thêm focus bàn phím màu xanh ở thư viện Reports nền trắng; viền focus trắng chỉ áp dụng cho thanh điều hướng tối. Các trang public/auth dùng context trống riêng, tránh bị chuyển vào workspace mẫu.

19 bề mặt workspace: Today, Plan, Leads, Accounts, Opportunities, Money, Review, Products & Brands, Reports, Dashboards, Capture, Ask, Activity, Vault, Settings, Quotes, Portfolio Coverage, Stakeholders và Objections. 7 trang public/auth: Login, Signup, Forgot Password, Verify Email, Home, Pricing và Use Cases.

Ảnh hiện tại được lưu trong `.memoire-private/design-sync/`: Products & Brands và Reports được xem trực tiếp qua trình duyệt; ảnh Reports 390px được mở để kiểm tra bố cục. Dữ liệu là mẫu giả, ở origin kiểm tra riêng 5175, không đụng bài thử người dùng đang chuẩn bị trên 5174.

## Giới hạn

Kiểm tra này xác nhận các màn hình và luồng được nêu trên, không phải mọi trạng thái dữ liệu hay chứng nhận accessibility toàn diện. Chưa có kết quả đo thời gian của người dùng thật. Bản cập nhật giao diện đi lên Preview; cổng Production về backup/restore và database dùng chung vẫn cần bằng chứng riêng theo runbook triển khai.
