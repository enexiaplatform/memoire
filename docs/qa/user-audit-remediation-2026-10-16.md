# Memoire — sửa lỗi từ kiểm thử người dùng

Ngày: 16/10/2026. Phạm vi: bản local tại `E:/Antigravity project/Memoire`, dựa trên HEAD `b909221bacd9d34da9471416849513af64ddf8cc` và các thay đổi có sẵn trong working tree.

**Đã sửa 6/6 lỗi xác nhận và kiểm tra lại cả 6 qua giao diện.** Kết quả này áp dụng cho bản local với dữ liệu giả lập. Không có thao tác deploy hoặc thay đổi database production trong đợt sửa này. Các thay đổi có sẵn của người dùng được giữ nguyên.

## Kết quả từng lỗi

| Mã | Bản sửa | Kiểm chứng sau sửa |
| --- | --- | --- |
| TARGET01 · P1 | Editor quy đổi chỉ tiêu sang đúng tiền tệ đang ghi trên form. Chỉ ghi các quý thực sự thay đổi; giữ nguyên số tiền, tiền tệ và lịch sử khi lưu nguyên trạng. Thiếu tỷ giá thì khóa quý bị ảnh hưởng và hướng dẫn bổ sung tỷ giá. Lọc đúng năm và phạm vi demo. Giữ note của chỉ tiêu khi sửa. | Đổi reporting sang VND; sửa Q4 thành 2,6 tỷ VND rồi trả về 2,5 tỷ VND. Chuyển reporting về USD: editor hiển thị 96.153,84615384616 USD. Save không sửa → No target changes to save; reload giữ 96,2K USD và coverage 70%. File xuất sau cùng xác nhận Q4 vẫn lưu **2.500.000.000 VND**, không bị đổi thành USD. |
| PLAN-02 · P2 | Plan item từ Capture mang theo ID cơ hội độc lập với đường mở lịch sử. Bản ghi hoàn thành truyền liên kết có ID tới hàm lưu Activity. Không suy đoán theo tên và không gắn cơ hội cho ngày Out of office. | Tạo Capture gắn Apex/add-on, hoàn thành việc Send SIM16 repaired protocol với người liên hệ và bằng chứng. History và chi tiết sau reload đều ghi đúng cơ hội, contact Dr. Linh Simulation. ZIP xác nhận linkStatus Linked và ID cơ hội gốc. |
| QUOTE-01 · P2 | Chặn Amount âm/không hữu hạn ở màn hình và cả createQuote/updateQuote. Amount có min=0; các trường margin/discount giữ hành vi cũ. Điều chỉnh thu tiền âm không bị ảnh hưởng. | Tạo -10 USD bị từ chối; sửa báo giá có sẵn thành -20 cũng bị từ chối. Sửa về 1.500 USD lưu thành công; reload và ZIP chỉ có một báo giá 1.500 USD. |
| ACC02 · P2 | Chip Strategic dùng cùng hygiene status với bộ đếm và tab trạng thái; không dùng cờ Key account riêng. | Tài khoản Strategic only xuất hiện khi chọn chip: 1 shown of 6, bộ đếm Strategic 1. Đã lặp lại sau reload và ở mobile 390×900; không tràn ngang toàn trang (clientWidth=scrollWidth=375). |
| CAP-02 · P2 | Bộ trích fact nhận honorific Dr/Mr/Mrs/Ms/Prof cùng tên, hỗ trợ dấu Unicode và từ chối honorific đứng riêng. | Câu Met Dr. Linh Simulation… đề xuất đúng Dr. Linh Simulation trong bước review, sau đó lưu người và cam kết thành công. ZIP có đúng một người tên đầy đủ. Kiểm thử tự động thêm Ms. José, tên không honorific, title đứng riêng và “the team”. |
| MARGIN-01 · P3 | Bỏ đoạn chú thích đang được render thành text trong JSX. | Money → Margin hiển thị giao diện bình thường; DOM không chứa câu The link to Orders is gone. |

## Kiểm tra hồi quy

- **2.215/2.215 unit tests đạt**, gồm 4 ca mới kiểm tra chỉ tiêu đa tiền tệ/lưu nguyên trạng, liên kết hoàn thành Plan, chặn báo giá âm tại lớp lưu và tên người có honorific/dấu.
- Build production, typecheck ứng dụng/API và lint đạt. Sau rà cuối, giới hạn min=0 được thu hẹp chỉ cho Amount; đã chạy lại typecheck, lint phần thay đổi, 4 ca mới và build production.
- Đã chạy mọi bước trong chuỗi `npm run check` theo các đợt. Lần chạy đầu dừng ở kiểm tra nhãn tiền tệ; phần tiếp theo phát hiện hai kiểm tra nguồn không còn khớp header compact có sẵn. Đã sửa và chạy lại cả ba kiểm tra, không bỏ qua nội dung chức năng mà chúng bảo vệ.
- Ba contract được cập nhật: Qualification kiểm tra currency binding và giá trị editor đã quy đổi; Margin xác nhận document title Money · Margin thay cho eyebrow cũ; Today nhận thẻ PageContainer có thêm prop nhưng vẫn kiểm tra tách đúng hai tầng nội dung.
- Đối chiếu thêm dữ liệu thực từ ZIP tải qua UI: chỉ tiêu gốc VND giữ nguyên, báo giá hợp lệ, liên kết hoàn thành có ID, người có tên đầy đủ và không có ID Activity trùng.
- Checklist React: hooks gọi ổn định, state form được giữ trong editor, không thêm effect/fetch, dùng ID cơ hội đã xác nhận, không đổi khóa danh sách để che lỗi dữ liệu; form còn label, validation và trạng thái disabled cho trường thiếu tỷ giá.

Đây là vòng kiểm lại các phần sửa và kiểm tra tự động toàn repo; không tuyên bố đã chạy lại toàn bộ 56 kịch bản UI trước đó trong phiên sửa.

## Cảnh báo trùng key và các ca chưa nghiệm thu

Cảnh báo cũ về `demo-activity-apex-budget` và `demo-activity-orion-pharma-tender-email` chưa tái hiện trong phiên kiểm lại. Hai ZIP trước sửa không có Activity ID trùng; ZIP sau sửa cũng không có. Đã mở lại Review, Learning & Analytics và initiative Validation proof pilot với danh sách hoạt động liên quan; log cảnh báo/lỗi của tab được thu ở hai thời điểm đều rỗng. Chưa có bằng chứng nguyên nhân để sửa thêm một đường dữ liệu hay kết luận cảnh báo cũ đã được khắc phục vĩnh viễn.

| Ca trước đó | Tình trạng sau đợt sửa |
| --- | --- |
| SET02 — tài khoản/billing/cloud/reminders | Kiểm tra tự động liên quan đã chạy; nghiệm thu UI thật vẫn cần backend và tài khoản test được cấu hình. Local hiện chạy demo với backend placeholder. |
| AUTH01 — login/OAuth/reset/signup | Chưa thực hiện xác thực thật, tạo tài khoản hoặc gửi email reset. Không coi form validation là bằng chứng end-to-end auth. |
| SET04 — restore/preview/undo | Xuất backup tiếp tục đạt; các kiểm tra restore tự động đạt. UI restore còn chưa xác minh do file chooser ở lần trước không hoạt động và demo yêu cầu Exit trước khi restore. |
| SET03 — xác nhận xóa dữ liệu | Không thử xóa thêm dữ liệu. Hộp xác nhận/dismiss qua UI vẫn chưa được xác minh; không đánh dấu PASS từ việc chỉ đọc window.confirm trong source. |

Bốn ca này là khoảng trống kiểm chứng, không nằm trong sáu lỗi đã tái hiện. Không đánh dấu “đã xử lý toàn bộ production” khi các bước trên còn thiếu bằng chứng.

## Bằng chứng

Thư mục: [hồ sơ sửa lỗi](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16>).

- [Chỉ tiêu sau lưu nguyên trạng](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/02-target-noop-fixed.jpg>) và [DOM sau reload](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/03-target-after-reload.txt>).
- [Margin](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/04-margin-fixed.jpg>).
- [Strategic desktop](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/05-strategic-filter-fixed.jpg>) và [mobile](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/13-mobile-strategic-fixed.jpg>).
- [Capture nhận đủ tên](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/06-capture-name-fixed.jpg>).
- [Chi tiết hoàn thành Plan sau reload](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/08-plan-link-survives-reload.jpg>).
- [Báo giá âm bị chặn](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/10-negative-edit-blocked.jpg>) và [báo giá hợp lệ sau reload](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/11-positive-quote-after-reload.txt>).
- [Đối chiếu file xuất](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/post-fix-data-check.json>) · [bản sao sau sửa](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/post-fix-workspace.zip>).
- [Kết quả kiểm tự động và các log](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/verification.json>) · [manifest SHA-256](<E:/Antigravity project/Memoire/.memoire-private/user-audit-remediation-2026-10-16/manifest.json>).

Ảnh 09 là khung trước khi thông báo lỗi kịp hiển thị, không dùng làm bằng chứng chặn số âm; dùng ảnh 10 cùng DOM tương ứng. Các ảnh được giữ kèm DOM snapshot và mở lại để kiểm tra nội dung.
