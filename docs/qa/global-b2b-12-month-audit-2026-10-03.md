# Memoire — Strict QC: doanh nghiệp B2B global trong 12 tháng

> **Cập nhật sau sửa lỗi:** 7/7 phát hiện bên dưới đã được đóng cho bản Production `153fd60`. Xem [kết quả sửa và kiểm chứng sau phát hành](global-b2b-audit-remediation-2026-10-03.md). Phần còn lại giữ nguyên kết quả và bằng chứng của bản audit trước khi sửa.

Ngày audit: **03/10/2026**, múi giờ Asia/Saigon. Mã nguồn nền: `9ab5df28ea15e36503cde9aff5beda82158f1429`. Ứng dụng kiểm tra: https://www.memoire-official.com. Backend: `mlmpcpkucurylkrobain`.

## Kết luận

**Chưa đạt QC để tin cậy toàn bộ luồng tiền và phục hồi dữ liệu.** Bộ dữ liệu chuẩn đi qua cloud và Reports đúng; các ca bất thường và thao tác thực tế phát hiện **7 lỗi: 5 P1, 2 P2**. Bộ test xanh không phủ được những lỗi này.

P1: ảnh hưởng trực tiếp đến số tiền, ý nghĩa tiền tệ hoặc bản sao phục hồi. P2: dẫn sai thao tác hoặc trạng thái vận hành. Không tìm thấy P0 trong phạm vi đã kiểm tra; điều này không chứng nhận không có P0 ở phần chưa kiểm tra.

Không sửa mã sản phẩm hoặc triển khai thay đổi trong audit này. Các dữ liệu fault injection đã được trả về số liệu chuẩn. Tài khoản giả lập được giữ lại để chủ sản phẩm kiểm tra.

## Doanh nghiệp và tài khoản đã tạo

**Northstar Industrial Supply** là doanh nghiệp hư cấu, một nhà phân phối thiết bị công nghiệp do một người phụ trách bán hàng vận hành, phục vụ Mỹ, Đức/châu Âu và Singapore. Tiền giao dịch: USD, EUR, SGD; tiền báo cáo: USD. Hai nhãn hàng hư cấu: FlowWorks và SenseWorks.

- Tài khoản Production: `northstar-qc-1791035289632@example.invalid`.
- Owner: `d5394eb0-cd88-48ae-936b-be50e19e890a`.
- Danh tính thử được cấp bằng Auth Admin, có xác nhận email cho riêng test identity; sau đó đăng nhập bằng mật khẩu qua giao diện Production thực.
- Đây **không phải** bằng chứng hoàn thành signup công khai, nhận email xác minh, phục hồi mật khẩu hoặc Google OAuth. Không gửi email đến ai; không thay đổi cấu hình xác minh email toàn hệ thống.
- Thông tin truy cập được lưu riêng trong [tệp truy cập local](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/credentials.private.json>); không đưa mật khẩu vào báo cáo.

Mô phỏng nén thời gian cho giai đoạn **10/2025–09/2026**, không phải quan sát người dùng trong 12 tháng thật. Mỗi tháng replay Lead → Proposal → Won/Lost/Active bằng các lần ghi authenticated riêng, thêm tương tác, báo giá và tiền thu; sau đó xuất hai báo cáo từ UI và đối soát độc lập. Các ngày nghiệp vụ thuộc giai đoạn giả lập, còn ngày hệ thống quan sát/ghi revision là ngày audit thật; không giả tạo lịch sử hệ thống năm trước.

| Bộ dữ liệu 12 tháng | Số lượng |
|---|---:|
| Khách hàng hư cấu | 24 |
| Cơ hội và lead | 96 |
| Won / Lost / Active qualified / Lead | 48 / 24 / 12 / 12 |
| Tương tác, đã xác nhận ID liên kết cloud | 384 |
| Báo giá, gồm bản cũ bị từ chối và bản chấp nhận | 96 |
| Đơn có hồ sơ công nợ | 48 |
| Biên nhận tiền | 72 |
| Bộ chi phí nhập hàng, freight và duty | 48 |
| Catalog gồm 2 brand và 96 assignment | 98 |
| Báo cáo / dashboard lưu cloud | 2 / 1 |

Ngoài bộ năm, audit còn dùng Capture để ghi một tương tác sau năm, chọn đúng deal, rồi dùng Plan để ghi kết quả gửi proposal giả lập và đánh dấu hoàn thành. Dấu hoàn thành còn nguyên sau reload; Weekly review được mở lại để kiểm tra. Hai tương tác chẩn đoán này được tách khỏi số kỳ vọng của năm.

## Đối soát số liệu chuẩn

Số kỳ vọng được tính từ kịch bản và tỷ giá khai báo độc lập với hàm tính của Memoire. Dùng tỷ giá planning cố định tương ứng bảng ngày 01/08/2026 của sản phẩm; không dùng tỷ giá ngân hàng lịch sử và không xác nhận lãi/lỗ kế toán.

| Chỉ tiêu, USD | Kỳ vọng cuối năm | Kết quả |
|---|---:|---|
| Qualified pipeline còn mở | 222,000.00 | Khớp |
| Won deal value | 763,846.15 | Khớp |
| Giá trị 48 đơn | 763,846.15 | Khớp |
| Tiền đã thu | 412,384.62 | Khớp |
| Còn phải thu | 359,076.92 | Khớp trong sai số làm tròn schedule |
| Khách trả dư | 7,615.38 | Sai khác tổng thô 0.00231 USD, từ làm tròn từng installment |
| Landed cost | 511,776.92 | Khớp local; UI cloud 48/48 costed |
| Gross margin planning | 252,069.23 / 33% | Khớp local và UI Margin |
| Win rate | 48 / 72 = 66.67% | Khớp; không tính lead vào mẫu số |

Không lấy cash received trừ outstanding để suy ra doanh thu; không coi won value là tiền đã vào ngân hàng. Sai số từng schedule được ghi lại trong evidence, không nới tolerance để che sai lệch lớn.

**12/12 checkpoint local và 24/24 ZIP báo cáo UI Production đã khớp** các chỉ tiêu chính. Chi phí được đối soát local từng tháng và thêm cloud sau replay năm; không tuyên bố đã nhập chi phí bằng UI mỗi tháng.

## Các lỗi đã xác nhận

### F01 — P1: ZIP xuất cloud không dùng được để restore đầy đủ

**Tái hiện:** vào Settings → Export → Download ZIP trên tài khoản thật. Manifest có `complete: false`, warning `commercial_history_coverage: column commercial_history_coverage.id does not exist`. Đưa chính JSON này vào bộ lập kế hoạch restore: bị từ chối với `This cloud export is incomplete. Export again before replacing a workspace.` Lặp lại sau khi owner gọi thành công `activate_commercial_history`; lỗi vẫn xảy ra.

**Nguyên nhân:** [api/export.ts:136](<E:/Antigravity project/Memoire/api/export.ts:136>) chỉ khai báo thứ tự đặc biệt cho commercial_targets; bảng coverage rơi xuống mặc định `id` dù nó được định danh bằng user_id. Không phải lỗi thiếu bảng catalog từng được báo ngày 02/10.

**Tác động:** nút Download ZIP tạo được file, nhưng file không phục hồi đầy đủ được. UI/restore đã cảnh báo và từ chối đúng; không có bằng chứng mất dữ liệu hiện hữu. **Chưa chứng nhận bản sao phục hồi tài khoản này.**

**Điều kiện đóng lỗi:** export order bằng khóa thật của từng bảng; ZIP không còn gap; rehearsal restore có dữ liệu, lineage/coverage/revisions và kiểm tra đối chiếu sau restore trên workspace cô lập.

Bằng chứng: [backup-evidence.json](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/backup-evidence.json>), [ZIP hiện có, incomplete](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/northstar-workspace-backup.zip>).

### F02 — P1: Draft mới hơn thay giá trị đơn đã chốt

**Tái hiện:** đơn đầu đã có accepted quote 10,000 USD. Thêm một Draft 20,000 USD cùng opportunity, ngày mới hơn. Cloud chấp nhận; báo cáo Collections tăng order value từ 763,846.15 lên 773,846.15 USD, dù khách chưa chấp nhận giá mới.

**Nguyên nhân:** [orderToCash.ts:436](<E:/Antigravity project/Memoire/src/utils/orderToCash.ts:436>) chỉ loại Rejected, rồi lấy quote mới nhất; [orderToCash.ts:292](<E:/Antigravity project/Memoire/src/utils/orderToCash.ts:292>) dùng nó làm amount và payment term của committed order.

**Điều kiện đóng lỗi:** có quy tắc rõ cho giá và điều khoản đã được khách chấp nhận; Draft/Sent/Expired không được tự sửa nghĩa vụ của accepted order. Kiểm tra cả currency, payment terms và mốc delivery/payment khi revision mới chưa được chấp nhận.

Bằng chứng: [probe-draft-revision.zip](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/probe-draft-revision.zip>).

### F03 — P1: Biên nhận cùng ID bị cộng hai lần

**Tái hiện:** gửi payload authenticated chứa hai bản giống nhau của receipt ID đầu tiên, trị giá 4,000 USD. Cloud chấp nhận. UI export tăng received từ 412,384.62 lên 416,384.62 USD.

**Nguyên nhân:** [receivables.ts:351](<E:/Antigravity project/Memoire/src/utils/receivables.ts:351>) cộng từng phần tử không kiểm tra ID; [orderReceivableStore.ts:93](<E:/Antigravity project/Memoire/src/services/orderReceivableStore.ts:93>) append receipt không bảo vệ idempotency. Đây là kiểm tra payload import/REST; không tuyên bố đã tái hiện bằng hai click vào nút Record.

**Điều kiện đóng lỗi:** retry cùng receipt identity không làm tăng tiền; cùng ID nhưng nội dung khác phải báo conflict. Không dedupe theo số tiền/ngày vì hai khoản chuyển thật có thể trùng các trường đó.

Bằng chứng: [probe-duplicate-receipt.zip](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/probe-duplicate-receipt.zip>).

### F04 — P1: Tiền có ngày nhận trong tương lai vẫn là đã thu

**Tái hiện ở engine và cloud:** đổi hai receipt tổng 10,000 USD sang 01/01/2099. Report hiện tại vẫn cộng toàn bộ vào received. **Tái hiện bằng UI:** Collections cho nhập receipt 500 USD ngày 01/01/2099, nút Record lưu cloud thành công.

**Nguyên nhân:** [receivables.ts:351](<E:/Antigravity project/Memoire/src/utils/receivables.ts:351>) không giới hạn receipt date theo ngày của view; ngày nhập trong [CashCollectionPage.tsx](<E:/Antigravity project/Memoire/src/features/revenue/CashCollectionPage.tsx:483>) không bị chặn khi ở tương lai.

**Điều kiện đóng lỗi:** định nghĩa riêng expected payment và receipt thực nhận; future receipt bị từ chối hoặc giữ ngoài số đã thu. Test date boundary theo timezone và kỳ báo cáo, không chỉ kiểm tra chuỗi ngày hợp lệ.

Bằng chứng: [future-date-ui.png](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/future-date-ui.png>), [probe-future-receipts.zip](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/probe-future-receipts.zip>).

### F05 — P1: Lịch sử biên nhận đổi nhãn tiền mà không đổi giá trị

**Tái hiện:** mở hồ sơ EUR đầu tiên trong Collections, tiền reporting là USD. Receipt thực là **1,260 EUR**, nhưng lịch sử hiển thị **1,260 USD**. Nếu trình bày bằng USD theo planning rate đã chọn, giá trị tương ứng phải là **1,453.85 USD**.

**Nguyên nhân:** [CashCollectionPage.tsx:518](<E:/Antigravity project/Memoire/src/features/revenue/CashCollectionPage.tsx:518>) đưa `receipt.amount` gốc vào formatter của reporting currency.

**Điều kiện đóng lỗi:** hiển thị amount gốc với receipt.currency hoặc convert đúng rồi hiển thị reporting currency; giữ khả năng đối chiếu với original bank receipt.

Bằng chứng: [euro-receipt-ui.png](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/euro-receipt-ui.png>), [euro-collections.txt](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/euro-collections.txt>).

### F06 — P2: Orders tiếp tục báo chờ tiền cho đơn đã thu đủ

**Tái hiện:** `SIM-2025-10-1-R2` giá 10,000 USD, đã có hai receipt tổng 10,000 USD. Collections coi nó Collected, outstanding 0. Orders vẫn là **Deposit due**, **353d stalled**, **3 of 5 steps done**. Invoice overdue summary của Orders có 48 đơn trong khi Collections chỉ còn 24 đơn có dư nợ.

**Nguyên nhân:** trạng thái milestone order đọc quote/manual marks qua [orderToCash.ts](<E:/Antigravity project/Memoire/src/utils/orderToCash.ts:277>), không đọc receipts/delivery/invoice dates đã biết trong hồ sơ receivable. Quote giữ trạng thái Due nên tạo trạng thái vận hành cũ.

**Tác động:** phải nhập/tick lại để các bề mặt đồng ý; có thể tạo việc thu tiền không còn cần thiết. Không coi tổng “exposed” của Orders là cùng định nghĩa với accounts receivable để kết luận nó phải bằng outstanding.

**Điều kiện đóng lỗi:** trạng thái derived nhận bằng chứng thực thu đã ghi; một receipt không cần nhập lại ở một mô-đun khác; có rule cho partial/full/overpaid và giữ provenance của manual marks.

Bằng chứng: [orders-risk.txt](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/orders-risk.txt>), [orders-risk.png](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/orders-risk.png>).

### F07 — P2: Link vào Collections tự chuyển về Orders

**Tái hiện:** mở `/app/revenue?view=collections&orderId=<ID của đơn>`. Sau khi effect chạy, URL thành `/app/revenue`, Collections heading biến mất và trở về Orders. Người dùng không đến được dòng thu tiền mà link hứa mở.

**Nguyên nhân:** [CashCollectionPage.tsx:108](<E:/Antigravity project/Memoire/src/features/revenue/CashCollectionPage.tsx:108>) xóa toàn bộ search params để bỏ orderId, đồng thời xóa `view=collections` mà MoneyPage cần để chọn trang.

**Điều kiện đóng lỗi:** chỉ xóa param dùng một lần; giữ view và filter hợp lệ. Test sau effect ổn định, không chỉ thấy heading trong frame chuyển trang.

Bằng chứng: [collections-deeplink.png](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/collections-deeplink.png>), [probe-evidence.json](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/probe-evidence.json>).

## Những phần đã đạt trong phạm vi audit

- Baseline `npm run check`: build, lint, API typecheck, contract suite; **2,078 tests, 0 failures**. Lint các script audit mới cũng đạt.
- Login thật bằng UI, load/save nguồn cloud; trình duyệt mới đọc 84 qualified records từ 96 nguồn mà không seed cache dữ liệu.
- Tải 10 trang chính ở 1440px và 390px: có nội dung, không lỗi JS được thu, không catalog REST failure, không tràn ngang. Timing 1.8–3.9 giây là thời lượng probe có chèn thời gian chờ/chụp; không phải benchmark performance hoặc latency cam kết.
- Hai saved reports và dashboard dùng nguồn chung, các ZIP cuối năm được đối soát với oracle độc lập.
- Missing FX/amount hiện dưới dạng thiếu; duplicate opportunity identity và duplicate receivable-per-order bị từ chối. Invalid catalog reference bị chặn thay vì xuất báo cáo sai.
- Tài khoản thứ hai dùng token của chính nó không đọc được dữ liệu Northstar trong bảy bảng được kiểm tra; tài khoản kiểm tra này đã được xóa. Không suy rộng thành chứng nhận mọi bảng, mọi write path hoặc mọi vai trò.
- Browser regressions trên Production trong sandbox demo riêng: Reports, Dashboards, product linkage và Next-Gen opportunity flow đạt; có kiểm tra quota, archive/restore definitions, lỗi refresh/stale state, demo isolation và viewport hẹp. Đây là bằng chứng demo browser, không thay thế kiểm tra cloud owner thật.
- Full workspace ZIP có warning rõ và bộ restore từ chối file incomplete: cơ chế từ chối an toàn đạt, chức năng export/restore end-to-end chưa đạt vì F01.

Quan sát UX để kiểm tra tiếp: bảng onboarding nổi che phần lớn vùng thao tác trên mobile ngay cả với bộ dữ liệu đã mô phỏng một năm; có thể đóng/thu gọn, nhưng mặc định gây cản trở. Không đánh giá thời gian thao tác của người thật, độ hài lòng, retention hay ROI từ số tự động.

## Ưu tiên xử lý

1. **F01** trước: tạo được backup và restore rehearsal hoàn chỉnh của owner trước những sửa chữa dữ liệu lớn.
2. **F02–F05**: chốt contract nghĩa vụ đã chấp nhận, identity receipt, ngày thực thu và currency. Viết regression từ các ca độc lập đã tái hiện, rồi kiểm tra lại cloud và UI.
3. **F06–F07**: đồng nhất trạng thái order/receipt và đường dẫn đến hành động.
4. Chạy lại mô phỏng và fault injection; đối chiếu số chuẩn và sources/revisions; chỉ đóng từng lỗi khi bằng chứng đạt, không chỉ khi bộ test nền xanh.

Phần chưa chứng nhận: signup/email/OAuth, restore thành công có dữ liệu, offline-sync conflict nhiều thiết bị, tải lớn hơn bộ này, biến động FX lịch sử, thuế/credit note/refund/accounting, hoạt động doanh nghiệp thật hay giá trị thương mại trong 12 tháng.

## Evidence và cách tái hiện

- [Live checkpoints, UI và cloud counts](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/live-evidence.json>).
- [Đối soát local 12 tháng và các probes](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/calculation-evidence.json>).
- [Probes Production và xác nhận trả lại baseline](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/probe-evidence.json>).
- [Xác nhận 384 activity links trên cloud](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/activity-link-evidence.json>).
- [Capture → deal → Plan → hoàn thành → reload](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/operating-ui-evidence.json>), [Plan đã hoàn thành](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/plan-completed.png>).
- [Trạng thái cloud cuối audit](<E:/Antigravity project/Memoire/.audit/global-b2b-year-2026-10-03/final-state.json>): 386 activities gồm 384 của năm và 2 lượt chẩn đoán Capture/Plan, 72 receipts, 48 costs, 96 quotes và một completion record của Plan; các bản ghi fault injection về tiền đã được trả lại.
- [Nguồn fixture có oracle độc lập](<E:/Antigravity project/Memoire/scripts/fixtures/global-b2b-year.mjs>).
- [Runner đối soát local](<E:/Antigravity project/Memoire/scripts/audit-global-b2b-year.mjs>), [runner cloud năm](<E:/Antigravity project/Memoire/scripts/audit-global-b2b-year-live.mjs>), [runner fault injection](<E:/Antigravity project/Memoire/scripts/audit-global-b2b-year-probes.mjs>).

Local runner không gọi cloud. Hai runner Production cần `--production-qc`, đọc secrets private và chỉ thao tác owner hư cấu được tạo cho QC. Chạy local runner rồi cloud runner với cùng một `MEMOIRE_YEAR_AUDIT_DIR` mới để replay; cloud runner từ chối chạy lại tài khoản audit đã hoàn tất. Không dùng để ghi đè một tài khoản có dữ liệu thực. Evidence trước khi bổ sung các lượt Capture/Plan/cost ghi chính xác checkpoint nó đo; không sửa lại receipt cũ để giả là đã đo mọi thứ ở thời điểm đó.

Phương thức cấp test identity tham khảo [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Không đưa service-role vào trình duyệt. Các thao tác nguồn nghiệp vụ/đối soát dùng quyền authenticated của owner thử.

## Checkpoint theo tháng

| Tháng | Qualified / đơn | Pipeline USD | Won value USD | Thu USD | Còn phải thu USD |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 7 / 4 | 13,000.00 | 42,076.92 | 22,519.23 | 19,980.76 |
| 2025-11 | 14 / 8 | 27,000.00 | 88,076.92 | 47,192.31 | 41,769.23 |
| 2025-12 | 21 / 12 | 42,000.00 | 138,000.00 | 74,019.23 | 65,365.38 |
| 2026-01 | 28 / 16 | 58,000.00 | 191,846.15 | 103,000.00 | 90,769.23 |
| 2026-02 | 35 / 20 | 75,000.00 | 249,615.38 | 134,134.62 | 117,980.76 |
| 2026-03 | 42 / 24 | 93,000.00 | 311,307.69 | 167,423.08 | 147,000.00 |
| 2026-04 | 49 / 28 | 112,000.00 | 376,923.08 | 202,865.38 | 177,826.92 |
| 2026-05 | 56 / 32 | 132,000.00 | 446,461.54 | 240,461.54 | 210,461.54 |
| 2026-06 | 63 / 36 | 153,000.00 | 519,923.08 | 280,211.54 | 244,903.84 |
| 2026-07 | 70 / 40 | 175,000.00 | 597,307.69 | 322,115.38 | 281,153.84 |
| 2026-08 | 77 / 44 | 198,000.00 | 678,615.38 | 366,173.08 | 319,211.54 |
| 2026-09 | 84 / 48 | 222,000.00 | 763,846.15 | 412,384.62 | 359,076.92 |
