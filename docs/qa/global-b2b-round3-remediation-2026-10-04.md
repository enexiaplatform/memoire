# Memoire — Sửa F08/F09 và tiếp tục audit, 04/10/2026

**Kết luận: F08 (P1) và F09 (P2) đã sửa và kiểm chứng trên Production.** Sai lệch README (P3) cũng đã sửa. Các ca hồi quy, mô phỏng 12 mốc tháng, backup và phục hồi qua kiểm tra. Chưa phát hiện thêm lỗi được tái hiện trong phạm vi vòng này. [Vòng audit thứ hai](global-b2b-round2-audit-2026-10-04.md) giữ nguyên bằng chứng trước sửa.

## Phiên bản đã kiểm chứng

- Tên miền chính: https://www.memoire-official.com.
- Git SHA ứng dụng: `beaa8ccde121b3e6c37a35ec84f0c4b154e1c7cf`, nhánh Production `master`.
- Deployment Production: `dpl_HTWZBbgxaRVfC4uKQDRZhfDC2hXr`, `READY`; project `prj_IG0RdVVsY9KzEuSFHdTez5T5nQNH`. Đã đối chiếu SHA, nhánh, project và alias tên miền chính qua Vercel API sau phát hành.
- Deployment thử: `dpl_4ELhcQSZfAeUuo13au5zM6SobKmj`, từ Git archive của cùng SHA; dùng cấu hình Production và chưa chuyển tên miền chính khi chạy kiểm tra trước phát hành.
- Kiểm tra và đối soát cuối kết thúc lúc `2026-10-04T07:23:05Z` (14:23 giờ Việt Nam). Bản chốt tài liệu sau đó được commit riêng trên `main`; bản ứng dụng Production giữ SHA đã kiểm chứng.

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

## Kết quả test và audit tiếp theo

| Kiểm tra | Kết quả |
| --- | --- |
| Kiểm tra nguồn toàn bộ | `npm run check` thành công: typecheck, lint, build, **2.108 test qua / 0 thất bại**, cùng các kiểm tra contract phát hành. Có 23 test mới cho cạnh tranh ghi, retry, hàng đợi, xung đột, lỗi lưu thiết bị, lịch thanh toán và backup. |
| Mô phỏng 12 mốc tháng | Oct 2025–Sep 2026; pipeline, won, win rate, order value, receipts, outstanding, overpaid, costs và margin khớp oracle độc lập với sai số dưới 0,01 USD. Các ca receipt trùng, ngày tương lai, thiếu giá trị/FX và quote chưa Accepted tiếp tục giữ đúng nguồn số liệu. |
| F08: trình duyệt trước và sau phát hành | **6/6 ca qua trên mỗi deployment**, ghi bằng tài khoản QC thật; mỗi yêu cầu ghi chỉ gửi đơn đã thay đổi. Không có lỗi runtime; khôi phục đầy đủ payload sau mỗi lần chạy. Chi tiết ở bảng dưới. |
| F09: lịch sai trước và sau phát hành | **9/9 ca qua trên mỗi deployment**: ba loại lịch sai × Collections, Orders, Today. Lịch 200%, lịch cố định 11.000 và lịch hỗn hợp 11.000 trên hợp đồng 10.000 đều bị từ chối khi lập kế hoạch restore, và hiện lỗi rõ khi đọc trên màn hình. Browser sample có **0 yêu cầu REST / 0 lỗi runtime**. |
| Hồi quy giao diện và xuất dữ liệu | **7/7 ca qua trên mỗi deployment**: deep link desktop/mobile 390px; khoản thu tương lai bị từ chối mà không đổi cloud; EUR giữ đúng nhãn; Orders nhận đúng thu đủ/thu một phần; CSV Collections khớp oracle; backup từ giao diện hoàn chỉnh. Không có lỗi runtime hoặc yêu cầu REST lỗi trong các bài này. |
| Backup thật và phục hồi | ZIP xuất từ tài khoản có **56 bảng, 1.290 dòng**, manifest hoàn chỉnh, đủ **488 revision**. Diễn tập riêng cho backup trước và sau phát hành trong database cách ly: 41 collection chuẩn, dữ liệu/ID, lineage và mốc bảo đảm lịch sử được giữ; gọi lại lịch sử trả `no_op`; tiền và margin sau phục hồi khớp oracle. Không phục hồi thử vào Production. |
| Phiên đăng nhập trên tên miền chính | **4/4 ca qua**: nhập mật khẩu qua UI, sign out xóa session, private Reports sau logout yêu cầu đăng nhập, đăng nhập lại mở Reports. Bài này không tiêm session. |
| Audit lịch sử và liên kết nghiệp vụ | Trên deployment thử, browser sample qua URL lịch sử/reload/drawer chỉ đọc, cutoff trước mốc bảo đảm, timezone, cutoff sai, quay về hiện tại và mobile; Money Gate tạo liên kết và đọc cùng giá trị trên Opportunity/Money. |

### Sáu ca F08 đã tái hiện lại

| Ca | Kết quả sau sửa, cả trước và sau phát hành |
| --- | --- |
| Hai thiết bị đã mở cùng đơn; A thêm 111 USD, B thêm 222 USD | Giữ cả hai receipt, tổng mới 333 USD; cả hai thiết bị tải lại vẫn đúng. |
| Hai thiết bị sửa hai đơn khác nhau, thêm 555 và 666 USD | Cả hai thay đổi còn nguyên trên cloud và sau tải lại. |
| C thêm 333 USD nhưng chặn yêu cầu ghi; D thêm 444 USD thành công; C kết nối lại và tải lại | Khoản chờ không bị mất; đồng bộ đúng một lần, tổng mới 777 USD; hàng đợi được xác nhận hoàn tất. |
| Xóa receipt 4.000 USD rồi một thiết bị cũ thêm 111 USD | Receipt đã xóa không xuất hiện lại; tổng đúng 6.111 USD trên cloud và sau tải lại. |
| Sửa ngày giao hàng đồng thời thêm khoản thu 222 USD | Giữ cả ngày giao hàng và khoản thu. |
| Hai thiết bị sửa cùng ngày giao hàng thành hai ngày khác nhau | Báo xung đột và giữ thay đổi trên thiết bị; chỉ ghi sau lựa chọn rõ ràng. Chọn giữ thay đổi cập nhật cloud và vẫn đúng sau tải lại. |

Test tự động bổ sung cũng kiểm chứng lần tạo bản ghi đầu tiên cạnh tranh, mất phản hồi sau ghi thành công, receipt cùng mã khác nội dung, giữ pending cash khi chọn điều khoản, từ chối xóa dữ liệu mới hơn, vượt giới hạn retry và không báo lưu thành công khi bộ nhớ thiết bị không ghi được.

## Đối soát sau thử nghiệm trên Production

Sau mọi ca ghi và kiểm tra đăng nhập, đăng nhập mới đọc cloud rồi so sánh **ID và toàn bộ payload** của 48 bản ghi công nợ với snapshot trước thử.

| Chỉ tiêu | Kết quả cuối |
| --- | ---: |
| Opportunities / quotes / công nợ / chi phí | 96 / 96 / 48 / 48 |
| Receipts | 72 |
| Đơn thu đủ / còn mở | 24 / 24 |
| Đã thu, USD | 412.384,6154 |
| Còn phải thu, USD | 359.076,9231 |
| Lợi nhuận gộp, USD | 252.069,2308 |

`final-owner-state.json` xác nhận `passed: true`, `allReceivablePayloadsRestored: true`. Giá trị công nợ dùng độ chính xác chuẩn sau sửa, khớp oracle; raw receipts không bị sửa để đạt kết quả. Không ghi vào dữ liệu khách hàng thực, không thay đổi schema hoặc billing.

## Bằng chứng và giới hạn

Các artifact trong `.audit/global-b2b-round3-2026-10-04/` gồm `full-check.log`, `calculations/calculation-evidence.json`, `existing-cloud-cas-evidence.json`, `staged-concurrency/acceptance.json`, `production-concurrency/acceptance.json`, `staged-schedule/acceptance.json`, `production-schedule/acceptance.json`, `staged-browser/acceptance.json`, `production-browser/acceptance.json`, `restore-rehearsal.json` trong từng thư mục browser, `auth-boundary-evidence.json`, `final-owner-state.json`, build logs và metadata deployment. Thông tin đăng nhập, session và snapshot phục hồi vẫn ở file riêng bị Git ignore.

Phạm vi là workspace cá nhân Northstar giả lập, với thao tác đồng thời của các thiết bị đã tải bản mới. **Các tab đang chạy bản trước phát hành cần tải lại**: client cũ vẫn có đường ghi toàn danh sách; bản sửa không thêm trigger database để cấm mọi client cũ hoặc yêu cầu API tùy ý. Chưa kiểm chứng tải đồng thời quy mô lớn, tự đăng ký/email delivery hoặc toàn bộ mô hình chia sẻ nhiều chủ sở hữu. Kiểm tra CAS owner-scoped và database cách ly không được coi là chứng nhận bảo mật toàn sản phẩm.

12 mốc tháng là mô phỏng vận hành và đối soát, không phải 12 tháng sử dụng thật hoặc sổ kế toán được chứng nhận. Browser sample lịch sử kiểm chứng hành vi màn hình; không tạo bằng chứng quan sát trong quá khứ. Kết luận qua áp dụng cho phạm vi và phiên bản nêu trên.
