# Memoire — Sửa F08/F09 và tiếp tục audit, 04/10/2026

Trạng thái ban đầu: đã triển khai bản sửa trong mã nguồn; đang hoàn tất kiểm chứng và phát hành. Chưa dùng tài liệu này để xác nhận bản sửa trên Production. [Vòng audit thứ hai](global-b2b-round2-audit-2026-10-04.md) giữ bằng chứng trước sửa.

## Thay đổi

- F08: từng đơn công nợ giữ các thao tác chưa đồng bộ trong bản ghi trên thiết bị. Thêm receipt, xóa receipt và sửa điều khoản được áp dụng lên dữ liệu cloud mới đọc, rồi ghi có điều kiện theo phiên bản đã quan sát. Một thay đổi không gửi lại toàn bộ 48 đơn. Token phiên bản riêng không phụ thuộc đồng hồ thiết bị.
- Mất kết nối hoặc phản hồi ghi bị mất giữ nguyên thao tác để retry theo cùng mã receipt. Bản cloud mới hơn không được làm mất thao tác chưa đồng bộ. Xóa receipt không bị biến thành thao tác hợp nhất làm sống lại receipt cũ.
- Hai thay đổi khác nhau trên cùng ngày giao hàng/điều khoản báo xung đột. Người dùng có thể chọn bản trên tài khoản hoặc giữ thay đổi của mình; lựa chọn điều khoản giữ nguyên các khoản thu đang chờ.
- F09: từ chối lịch phần trăm, số tiền cố định hoặc lịch hỗn hợp vượt giá trị hợp đồng ở đường ghi, phục hồi và tính toán. Lịch số tiền cố định cần giá trị hợp đồng để kiểm tra. Dữ liệu sai hiển thị lỗi trên các màn hình tiền thay vì biến thành số dư hoặc workspace rỗng.
- Các phần trăm giữ độ chính xác của giá trị đơn hàng chuẩn khi chuyển thành các đợt trả tiền; phần thu dư được đối chiếu với giá trị hợp đồng. Sửa lịch không tạo một tổng tiền cạnh tranh với hợp đồng đã Accepted.
- README được đối chiếu với trạng thái Production đã xác minh; bỏ hai câu còn nói ứng dụng/navigation chưa triển khai.

## Phạm vi và điều kiện kiểm chứng

Bản sửa dùng bảng, khóa, Data API và RLS hiện có; không có migration hoặc thay đổi billing. Kiểm tra ghi có điều kiện trực tiếp trên tài khoản giả lập đã qua: owner ghi được, cùng phiên bản cũ không ghi đè được, yêu cầu có owner khác không sửa được dòng. Phép thử hoàn trả payload toàn bộ công nợ.

Bằng chứng vòng này nằm trong `.audit/global-b2b-round3-2026-10-04/`. Các bài trên cloud chỉ dùng Northstar giả lập. Script trình duyệt đóng các phiên trước khi hoàn trả; thông tin đăng nhập và bản sao dùng phục hồi không được công bố.

Các kiểm tra phát hành bắt buộc: `npm run check`; oracle 12 mốc tháng; sáu ca trình duyệt về đồng bộ/xung đột; chín ca lịch sai trên Collections/Orders/Today trong browser sample không gọi cloud; hồi quy F01–F07 trên deployment; backup thực và phục hồi có dữ liệu trong database cách ly. Kết quả cuối sẽ được cập nhật sau kiểm chứng deployment và tên miền chính.
