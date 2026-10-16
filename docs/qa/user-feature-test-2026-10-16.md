# Memoire — kiểm thử theo hành vi người dùng

> Cập nhật sau sửa 16/10/2026: sáu lỗi xác nhận bên dưới đã được sửa và kiểm tra lại trên bản local. Xem [báo cáo sửa lỗi](<E:/Antigravity project/Memoire/docs/qa/user-audit-remediation-2026-10-16.md>). Các kết quả bên dưới là bằng chứng **trước sửa**, được giữ để đối chiếu.

Ngày kiểm thử: 15–16/10/2026 (Asia/Saigon). Chốt báo cáo: 16/10/2026.

**56 ca: 46 PASS, 6 FAIL, 4 BLOCKED.** Các ca là những kịch bản có giới hạn, không phải chứng nhận mọi biến thể tính năng đều đạt. Sáu lỗi dưới đây đã tái hiện qua UI và đối chiếu mã nguồn hiện tại.

## Phạm vi và môi trường

- Bản đang chạy: working tree tại `E:/Antigravity project/Memoire`, HEAD `b909221bacd9d34da9471416849513af64ddf8cc`, có thay đổi sẵn từ trước. Audit này không sửa mã ứng dụng.
- Trình duyệt in-app, localhost `127.0.0.1:5175`, demo mode, cấu hình backend placeholder. Dữ liệu hư cấu có dấu SIM; không ghi vào production hay CRM.
- Kiểm thủ công qua UI: nhập liệu, kiểm tra lỗi, lưu, reload, tìm kiếm/lọc, tiến trình thương mại, đối chiếu số giữa màn hình, drill-through và đọc file xuất tải từ UI. DOM chỉ dùng quan sát giao diện; không chèn bản ghi qua storage/API.
- Giao diện kiểm ở mặc định 1280×720, desktop 1440×900 và mobile 390×900. Viewport override được reset sau kiểm.
- Kết quả tự động từ các đợt trước không được cộng vào bằng chứng kiểm thủ công lần này. Không chạy lại full suite trong vòng kiểm UI này.
- Hai pha dữ liệu: pha A dùng nhãn SIM15 có Atlas/QC pilot; đã xuất backup. Khi thử kiểm tra xác nhận Clear local data, công cụ hết thời gian rồi về trang công khai, không quan sát được hộp thoại; chỉ sandbox hư cấu bị ảnh hưởng. Pha B dùng nhãn SIM16, tải lại demo và tạo các mẫu mới. Không so tổng số bản ghi giữa hai pha như một lỗi hồi quy.

## Lỗi đã xác nhận

### [P1] TARGET01 — Lưu chỉ tiêu không đổi vẫn làm sai tiền tệ

**Tái hiện:** Reporting currency USD, chỉ tiêu gốc 2.500.000.000 VND/quý. Money → Coverage → Edit targets → Save, không sửa ô nào → reload.

**Mong đợi:** Giữ nguyên giá trị tương đương khoảng 96.153,85 USD/quý.

**Thực tế:** Ô nhập lấy số thô 2.500.000.000 và ghi nhãn USD; Save lưu thành 2,5 tỷ USD/quý. Coverage Q4 từ khoảng 70% thành 0%, tổng chỉ tiêu năm 10 tỷ USD. Trạng thái sai còn sau reload.

**Ảnh hưởng:** Một lần lưu thông thường làm sai chỉ tiêu và tỷ lệ bao phủ; ưu tiên sửa trước khi dùng chỉ tiêu đa tiền tệ.

**Đối chiếu nguồn:** [src/features/revenue/CoveragePanel.tsx:108](<E:/Antigravity project/Memoire/src/features/revenue/CoveragePanel.tsx:108>). Editor khởi tạo từ target.amount thô (108–111), trong khi save đóng dấu getReportingCurrency() (48–50). Cần đổi giá trị sang đơn vị editor hoặc giữ đơn vị gốc nhất quán.

**Bằng chứng:** [20-target-currency-before.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/20-target-currency-before.jpg>), [20-target-currency-before.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/20-target-currency-before.txt>), [21-target-currency-after.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/21-target-currency-after.jpg>), [21-target-currency-after.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/21-target-currency-after.txt>).

### [P2] PLAN-02 — Hoàn thành việc từ Capture làm mất liên kết cơ hội

**Tái hiện:** Capture hoạt động gắn QC automation pilot và next action. Vào Plan, hoàn thành việc phát sinh từ hoạt động, điền người liên hệ và kết quả. Mở History của bản ghi hoàn thành.

**Mong đợi:** Bản ghi hoàn thành giữ liên kết tới cơ hội gốc.

**Thực tế:** Hoạt động gốc liên kết đúng; bản ghi hoàn thành mới hiển thị Opportunity: Not captured và Linked: Unlinked.

**Ảnh hưởng:** Lịch sử thực hiện bị rời khỏi cơ hội, làm thiếu bằng chứng khi xem tiến triển giao dịch.

**Đối chiếu nguồn:** [src/utils/planCompletionLog.ts:81](<E:/Antigravity project/Memoire/src/utils/planCompletionLog.ts:81>). planItemOpportunity chỉ tìm deal target hoặc opportunityId trong href (81–84). Href của việc từ hoạt động dùng activityId nên không giải quyết được cơ hội; activity mới nhận opportunityName rỗng (218–224). Phạm vi đã tái hiện: việc sinh từ Capture có liên kết cơ hội.

**Bằng chứng:** [09-history-completion-unlinked.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/09-history-completion-unlinked.txt>).

### [P2] QUOTE-01 — Báo giá chấp nhận và lưu số tiền âm

**Tái hiện:** Quotes → tạo/sửa báo giá Sent → Amount -10 USD → Save → reload.

**Mong đợi:** Chặn số tiền thương mại âm và giải thích lỗi tại ô nhập.

**Thực tế:** Danh sách báo giá vẫn hiển thị -10 USD sau reload.

**Ảnh hưởng:** Dữ liệu báo giá không hợp lệ có thể đi vào các bước thương mại sau. Không nhầm với điều chỉnh thu tiền âm hợp lệ đã kiểm riêng.

**Đối chiếu nguồn:** [src/features/quotes/QuotesPage.tsx:699](<E:/Antigravity project/Memoire/src/features/quotes/QuotesPage.tsx:699>). NumberInput dùng type=number không có giới hạn min (699–705); đường lưu được kiểm thử không từ chối số âm. Cần kiểm tra tại cả form và lớp lưu.

**Bằng chứng:** [10-negative-quote-persisted.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/10-negative-quote-persisted.jpg>), [10-negative-quote-persisted.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/10-negative-quote-persisted.txt>).

### [P2] ACC02 — Bộ lọc Strategic bỏ sót tài khoản đã đánh dấu

**Tái hiện:** Tạo tài khoản sạch [SIM USER 16OCT] Strategic only, potential Unknown → Mark strategic → quay lại danh sách → chọn chip Strategic.

**Mong đợi:** Tài khoản đã đánh dấu xuất hiện trong kết quả Strategic.

**Thực tế:** Badge Strategic và bộ đếm 1 xác nhận đánh dấu đã lưu; khi chọn chip Strategic, danh sách báo 0 of 6.

**Ảnh hưởng:** Người dùng không tìm được tài khoản chiến lược qua chính bộ lọc của danh sách.

**Đối chiếu nguồn:** [src/features/accounts/AccountsPage.tsx:2936](<E:/Antigravity project/Memoire/src/features/accounts/AccountsPage.tsx:2936>). Chip Strategic đặt quickFilter=keyAccounts (814–824); matchesQuickFilter chỉ đọc kaFlag (2932–2937), khác trạng thái đánh dấu Strategic. Quan sát ban đầu ở Apex bị ảnh hưởng ưu tiên follow-up; không kết luận nút Mark strategic không lưu.

**Bằng chứng:** [29-strategic-control.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/29-strategic-control.txt>), [30-strategic-counter-filter-mismatch.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/30-strategic-counter-filter-mismatch.jpg>), [30-strategic-counter-filter-mismatch.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/30-strategic-counter-filter-mismatch.txt>).

### [P2] CAP-02 — Capture đề xuất người tên “Dr” thay vì tên đầy đủ

**Tái hiện:** Nhập ghi chú có “Met Dr. Linh Simulation at Atlas Lab…” → Review extracted facts.

**Mong đợi:** Nhận tên đầy đủ hoặc bỏ qua đề xuất không đủ chắc chắn.

**Thực tế:** Đề xuất tạo người tên Dr. Đã sửa tay trước khi lưu để không tạo dữ liệu rác.

**Ảnh hưởng:** Nếu chấp nhận gợi ý, danh bạ và bằng chứng người tham gia bị sai.

**Đối chiếu nguồn:** [src/domain/commercialKernel/parseCapture.ts:372](<E:/Antigravity project/Memoire/src/domain/commercialKernel/parseCapture.ts:372>). Biểu thức NAMED (372–377) nhận từ viết hoa và dừng tại dấu chấm; “Dr.” bị hiểu thành tên. Đây là nhánh trích fact người, không suy rộng ra mọi bộ phân giải tên.

**Bằng chứng:** [07-capture-review-name-truncated.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/07-capture-review-name-truncated.jpg>), [07-capture-review-name-truncated.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/07-capture-review-name-truncated.txt>).

### [P3] MARGIN-01 — Màn hình Margin lộ chú thích mã nguồn

**Tái hiện:** Money → Margin.

**Mong đợi:** Chỉ hiển thị nội dung dành cho người dùng.

**Thực tế:** Hiện nguyên văn /* The link to Orders is gone: it is the tab immediately to the left of this view's own tab, on the same page. */.

**Ảnh hưởng:** Nhiễu phần thao tác và làm giao diện trông chưa hoàn thiện.

**Đối chiếu nguồn:** [src/features/revenue/CostAnalysisPage.tsx:88](<E:/Antigravity project/Memoire/src/features/revenue/CostAnalysisPage.tsx:88>). Chú thích đặt trực tiếp trong JSX thay vì cú pháp chú thích JSX nên trở thành text.

**Bằng chứng:** [12-margin-source-comment.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/12-margin-source-comment.jpg>), [12-margin-source-comment.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/12-margin-source-comment.txt>).

## Các luồng và số liệu đã đối chiếu

| Luồng | Kết quả trong phạm vi đã chạy |
| --- | --- |
| Onboarding / tiền tệ | SEK thiếu tỷ giá được hỏi bổ sung; tỷ giá 0 bị chặn; USD hoàn tất vào demo. |
| Products & Brands | Tạo Brand có mã/alias, tìm alias, sửa, retire/reactivate giữ cùng bản ghi đến version 4. Product mới tự điền Scitek và nhóm mặc định; phân loại deal CSV 2.500 USD làm unclassified 1→0, report đúng một deal. |
| Lead → Opportunity / Account / People | Lead Atlas giữ dữ liệu sau nurture và qualify, cùng ID vào Discovery; 10.000 USD, ngày đóng và liên kết Account/Champion đúng. Economic Buyer mới ở Apex làm thiếu buyer 5→4. |
| Capture / email | Quick Capture có review fact và next action; email hư cấu lưu đúng account/deal, hạn 20/10, contact sửa tay và nguồn pasted-email. Không gửi email. |
| Plan / lời hứa | Bắt buộc bằng chứng hoàn thành; 1/7 việc xong và promise mở 8→7. Việc thủ công sửa/reschedule 17/10 giữ sau reload; paste tuần nhận hai ngày; customer promise dời hạn có lý do rồi Kept, open 8→9→8. Lỗi liên kết completion ghi riêng PLAN-02. |
| Quote / tiến trình | Điều khoản 30% đặt cọc, 70% net30 được đọc đúng; Sent→Accepted→PO Received→Delivery Scheduled. Accepted trong Discovery chưa bị tính là đơn hàng Won. |
| Thu tiền | Won 10.000 USD: thu 3.000 còn 7.000; thu thêm 8.000 cảnh báo trả dư 1.000; điều chỉnh -1.000 đưa net về 10.000, dư nợ 0. Điều chỉnh âm ở thu tiền là tình huống hợp lệ. |
| Biên lợi nhuận | Giá vốn 6.000 + vận chuyển 500 + thuế 200 + khác 300 = 7.000 USD; lãi 3.000, margin 30%; các đơn thiếu cost không bị coi là cost bằng 0. |
| Reports / Dashboards / export | Atlas: 1 Won 10.000, pipeline 0; lưu, reload, mở bản ghi đúng ID. Dashboard metric và bar cùng 10.000, thứ tự lưu đúng; CSV trong ZIP khớp nguồn. Báo cáo archive 1→2, restore version 3 giữ cùng ID. |
| Review / Explorer | Tuần 1 Won 10.000 và net thu 10.000/3 receipts; tháng 4 Won 60.384,62. Recap và cam kết tuần tới giữ sau reload. Explorer search/mode/inspector giữ đúng deal; thiếu xác suất được công bố. |
| Today / Ask / tìm kiếm | Dismiss và snooze qua reload, bring back hoạt động. Ask phân biệt overdue xác nhận với ngày dự kiến; nháp Orion dựa trên ngữ cảnh. Global search tìm deal mới. |
| Objection / Assets / Playbook | Objection 1.500 USD làm debt 76,9→78,4K rồi resolve về 76,9K, note giữ sau reload. Proof asset lưu/tìm/copy đúng nội dung. Playbook tạo draft có nguồn và liên kết, còn chỉnh được. |
| Vault / Principal / Initiative | Fact lưu/tìm/map nối Apex; principal Scitek They owe me Document giữ sau reload. Initiative giữ hypothesis, next action, email liên kết, signal và quyết định Adjust. |
| CSV nhập và làm mới | 3 dòng cho Ready 1 / Duplicate 1 / Invalid 1; chỉ nhập một. Brand không hỗ trợ mapping được cảnh báo rõ. Refresh cùng ID 2.000→2.500 USD, uncheck Stage giữ Discovery, Evidence bảo vệ giữ nội dung gốc, next action cập nhật. |
| Mobile 390×900 | Others thiếu tên bị chặn inline, bổ sung thì lưu được. Receipt 2.600.000 VND quy đổi 100 USD: Summit còn 24.900 USD; Reports và Dashboard cùng 100 receipts, tổng outstanding 59.515,38. Table có cuộn nội bộ; không thấy tràn ngang toàn trang ở các màn hình đã đo. |
| Settings | Target margin 20→25 giữ qua reload rồi trả về 20. Hai bản backup đã tải; xác minh cấu trúc ZIP. Không suy ra restore đạt. |

Sau khi ghi bằng chứng TARGET01, chỉ tiêu giả lập đã được sửa lại qua UI thành 96.153,84615384616 USD/quý để tiếp tục các ca sau. Báo giá âm cũng được trả về 10.000 USD trước khi chạy chuỗi thu tiền. Đây là sửa dữ liệu mẫu, chưa phải sửa lỗi ứng dụng.

## Giới hạn và các cửa kiểm còn thiếu

| Ca | Trạng thái | Lý do / cần kiểm tiếp |
| --- | --- | --- |
| SET02 | BLOCKED | Profile, billing, reminders, cloud sync không khả dụng trong demo. Cần tài khoản kiểm thử và môi trường backend được cấu hình để xác minh lưu tài khoản, đồng bộ và luồng thanh toán. |
| SET03 | BLOCKED | Thử hộp xác nhận Clear local data gặp timeout công cụ. Không quan sát được confirm/dismiss, nên không kết luận có hay thiếu safeguard. Mã hiện tại có window.confirm. |
| SET04 | BLOCKED một phần | Xuất ZIP đạt, restore/preview/undo chưa chạy vì file chooser timeout. Demo cũng có thông báo yêu cầu Exit trước khi restore. Cần workspace test riêng và file không chứa dữ liệu thật. |
| AUTH01 | BLOCKED một phần | Blank login và invalid reset email có chặn form; signup có field/legal links. Chưa chạy tạo tài khoản, login/OAuth thật, gửi reset email hoặc billing vì backend placeholder. |

Không có bằng chứng chấp nhận production, phân quyền đa tài khoản, realtime đa thiết bị, email thực sự gửi, hoạt động offline/mất mạng, microphone/permission, toàn bộ tổ hợp bộ lọc và công thức report. Business Accounting/expense/P&L bị feature flag tắt ở giao diện hiện tại nên không kiểm luồng nhập expense. Các giới hạn này không được tính thành PASS.

Khi thu output và dừng server cuối phiên, có cảnh báo React trùng key `demo-activity-apex-budget` và `demo-activity-orion-pharma-tender-email` (log 06:46:59 và 06:47:05). Đây là dấu hiệu cần truy vết riêng; chưa gắn được với màn hình/bước tái hiện hay tác động nhìn thấy nên không cộng thành lỗi UI thứ bảy, cũng không kết luận console sạch.

## Hồ sơ bằng chứng

- [Bảng tra ca kiểm thử và thư viện ảnh](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/report.html>)
- [56 ca dạng JSON](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/cases.json>)
- [Danh mục file, SHA-256 và ghi chú chất lượng ảnh](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/manifest.json>)
- [Kiểm tra cấu trúc các ZIP tải từ UI](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/export-inspection.json>)
- [phase-a-workspace-export.zip](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/phase-a-workspace-export.zip>)
- [phase-b-workspace-export.zip](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/phase-b-workspace-export.zip>)
- [phase-a-dashboard-export.zip](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/phase-a-dashboard-export.zip>)

Ảnh được lưu tại cùng thư mục với DOM snapshot rồi mở lại để kiểm. Ảnh 06 bị loại vì chụp lúc loading. Ảnh 16 chỉ cho ngữ cảnh Review; bằng chứng cam kết dùng bản text. Ảnh 18 là quan sát sơ bộ đã được thay bằng đối chứng 29/30, không dùng để kết luận “Mark strategic không lưu”. Ảnh 26 chỉ chụp phần đầu dashboard mobile; số 100 được xác nhận trong DOM và đối chiếu desktop ở ảnh 33. Ảnh 34 thể hiện thông báo xuất thành công.

## Danh sách từng ca

PASS nghĩa là hành vi nêu trong ca đã đạt ở môi trường trên. FAIL là lỗi xác nhận, BLOCKED là còn bước không thể xác minh.

### ONB-01 · PASS · Onboarding

- Thao tác: Continue từ bước 1
- Mong đợi: Đến bước chọn tiền tệ
- Thực tế: Đến bước 2/3
- Bằng chứng: [01-onboarding-introduction.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/01-onboarding-introduction.jpg>)

### ONB-02 · PASS · Onboarding

- Thao tác: Chọn SEK chưa có rate; nhập 0; Use SEK
- Mong đợi: Hỏi rate và không nhận rate bằng 0
- Thực tế: Có hướng dẫn rate; báo Enter how many US dollars...
- Bằng chứng: [02-onboarding-invalid-rate.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/02-onboarding-invalid-rate.jpg>)

### ONB-03 · PASS · Onboarding

- Thao tác: Chọn USD, save; chọn worked example
- Mong đợi: Vào app có sample label
- Thực tế: Đi qua bước 3, navigation chính xuất hiện
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CAT-01 · PASS · Catalog

- Thao tác: Save blank Name
- Mong đợi: Required field prevents save
- Thực tế: Browser required validation
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CAT-02 · PASS · Catalog

- Thao tác: Create Brand with code and alias; reload; search alias; edit; retire; Active/Retired filters; reactivate
- Mong đợi: Stable record and correct states
- Thực tế: 18 entries; version 4 active; alias search works
- Bằng chứng: [04-brand-lifecycle.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/04-brand-lifecycle.jpg>)

### LEAD-01 · PASS · Leads

- Thao tác: Create catalog-linked lead with customer, contact, source, next step; save need and date with keyboard; reload
- Mong đợi: Details retained; unqualified excluded from pipeline
- Thực tế: 4/5 evidence; date Oct16 retained. Date fill helper alone does not dispatch change; keyboard confirmed.
- Bằng chứng: [05-lead-save.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/05-lead-save.jpg>)

### LEAD-02 · PASS · Leads

- Thao tác: Nurture for one month; reload
- Mong đợi: Retain record with revisit and reason
- Thực tế: Nurture Nov14; existing evidence and next step retained
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### LEAD-03 · PASS · Leads

- Thao tác: Qualify nurtured lead; open deal; set value and close date; reload
- Mong đợi: One original record moves to Discovery with details retained
- Thực tế: Same ID8e6d25d0; Brand/evidence/next step retained; value10000 USD saved
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PEOPLE-01 · PASS · Stakeholders

- Thao tác: Open contact created by lead, filter Unknown; set Champion/High/Supportive/evidence confirmed; save and reload
- Mong đợi: Unknown count decreases, person retained
- Thực tế: 7 people1unknown; filtered old Unknown no longer includes Dr.Linh
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### ACC-01 · PASS · Accounts

- Thao tác: Create Account matching qualified lead, open People/Memory/Coverage; reload
- Mong đợi: Account links qualified opportunity and existing person
- Thực tế: ACC0006,1deal10000USD,ChampionDr.Linh; historylinks
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CAP-01 · PASS · Capture

- Thao tác: Quick Capture account+deal+note+action+due date; review extracted facts; correct person; save
- Mong đợi: Activity and Plan item linked, facts require confirmation
- Thực tế: Activity linked to QC pilot; action Oct16; edited person saved2items
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CAP-02 · FAIL · Capture

- Thao tác: Note contains Met Dr. Linh Simulation
- Mong đợi: Recognize full person name or avoid proposing title alone
- Thực tế: Proposes new person named Dr; manually corrected before save
- Bằng chứng: [07-capture-review-name-truncated.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/07-capture-review-name-truncated.jpg>)

### PLAN-01 · PASS · Plan

- Thao tác: Complete auto-created task; select matching commercial promise; name contact and what happened
- Mong đợi: Require completion evidence; task done and promise kept
- Thực tế: 1of7 done; promise removed from open list
- Bằng chứng: [08-plan-completed.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/08-plan-completed.jpg>)

### PLAN-02 · FAIL · Plan History

- Thao tác: Finish task sourced from activity linked to QC pilot; inspect completion in History
- Mong đợi: Completion retains originating opportunity link
- Thực tế: New completion says OpportunityNotcaptured/LinkedUnlinked although source activity linked to QCpilot
- Bằng chứng: [09-history-completion-unlinked.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/09-history-completion-unlinked.txt>)

### QUOTE-01 · FAIL · Quotes

- Thao tác: Create/edit Sent quote amount -10 USD; save; reload
- Mong đợi: Reject negative commercial amount
- Thực tế: Quote list persists -10USD
- Bằng chứng: [10-negative-quote-persisted.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/10-negative-quote-persisted.jpg>)

### QUOTE-02 · PASS · Quotes

- Thao tác: Create linked10000USDquote with30%deposit70%net30;Sent→Accepted;ReceivedPO;Schedule delivery
- Mong đợi: Correct payment parser and commercial progress
- Thực tế: 30/70parsed;ReceivedPO,scheduledOct20,paymentdueNov14
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### MONEY-01 · PASS · Collections

- Thao tác: Open Collections for Accepted quote while dealDiscovery
- Mong đợi: Do not treat accepted quote as wonorder
- Thực tế: No committedorders, explainsProcurement/Won
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### MONEY-02 · PASS · Collections

- Thao tác: Won10000USD with reason;30/70schedule;record3000;reload;record8000
- Mong đợi: Deposit clears;7000remaining;overpayment1000explicit
- Thực tế: Correct3000/7000allocation and overpaymentwarning
- Bằng chứng: [11-collections-overpayment.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/11-collections-overpayment.jpg>)

### MONEY-03 · PASS · Collections

- Thao tác: Record negative1000adjustment after11000received
- Mong đợi: Net10000,zerooutstanding,nooverpayment
- Thực tế: Refund correction retained;warningremoved
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### MARGIN-01 · FAIL · Margin

- Thao tác: Open Money>Margin
- Mong đợi: Only user-facing copy
- Thực tế: Raw source comment /* The link to Orders is gone... */ rendered
- Bằng chứng: [12-margin-source-comment.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/12-margin-source-comment.jpg>)

### MARGIN-02 · PASS · Margin

- Thao tác: Goods6000+freight500+duty200+other300USD;save;reload
- Mong đợi: Cost7000,profit3000,margin30%;unknowncosts excluded
- Thực tế: Matches all amounts;1of5costed
- Bằng chứng: [13-margin-calculation.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/13-margin-calculation.jpg>)

### REPORT01 · PASS · Reports / catalog filter / save / reload / drill

- Thao tác: Choose Brand equals Atlas catalog entry; Run and save report; Reload; View 1 records
- Mong đợi: One Won row 10000 USD, no pipeline; drill links same opportunity.
- Thực tế: One record, Won 10000, pipeline 0, sample-size warning; saved version 1 retained filter; source opens same opportunity.
- Bằng chứng: [14-saved-report.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/14-saved-report.jpg>)

### DASH01 · PASS · Dashboard / create / widgets / reorder / reload

- Thao tác: Create from saved report; Metric Won value plus bar chart; Move chart up; Save and reload
- Mong đợi: Both views 10000 USD, saved order retained.
- Thực tế: Chart first, metric second; both retain saved report and 10000 USD.
- Bằng chứng: [15-dashboard-persisted.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/15-dashboard-persisted.jpg>)

### DASH02 · PASS · Dashboard drill and export

- Thao tác: Inspect metric source; export ZIP; inspect downloaded CSV
- Mong đợi: Same opportunity and 10000 USD in CSV
- Thực tế: Source table and report-1/details.csv match Atlas Won 10000 USD; metadata and summary present.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### REVIEW01 · PASS · Review scoreboard / recap / weekly commitments

- Thao tác: Weekly then Monthly; generate recap; add and confirm custom next-week commitment; reload
- Mong đợi: Correct 10000 weekly Won/net cash, preserved weekly commitment, distinct month totals.
- Thực tế: Weekly 1 Won/10000, cash10000 across3 receipts; month4Won60384.62; recap10activities; custom Oct19-25 commitment retained.
- Bằng chứng: [16-review-commitment.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/16-review-commitment.txt>)

### REVIEW02 · PASS · Explorer filter / modes / inspector

- Thao tác: Search QC automation; switch modes; return map and select circle
- Mong đợi: Selected same deal, missing probability disclosed.
- Thực tế: URL vxSelected same ID; selection pressed; missing probability excluded with notice.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### SET01 · PASS · Settings / workspace preferences

- Thao tác: Change target margin20→25; reload; restore20
- Mong đợi: Autosave survives reload
- Thực tế: 25 retained; restored20. Demo sync disabled and reminders require sign in.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### SET02 · BLOCKED · Settings / account / billing / privacy

- Thao tác: Open all five tabs; inspect account/billing/reminder/sync
- Mong đợi: Real account and billing cannot be exercised in demo
- Thực tế: Account profile, billing, reminders, cloud sync explicitly unavailable; privacy and local storage boundaries visible.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### SET03 · BLOCKED · Delete safeguard

- Thao tác: Attempted clear-local-data confirmation test
- Mong đợi: Dismiss confirmation and retain demo
- Thực tế: Browser action timed out, then landed on public home; no inspectable dialog remained. Source contains window.confirm; safeguard not validated. Only isolated fictional data affected; exported backup retained.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### SET04 · BLOCKED · Backup export and restore

- Thao tác: Export ZIP, inspect package; try file chooser for restore
- Mong đợi: Export available, restore preview and undo check
- Thực tế: Both phase-A and phase-B exports downloaded with JSON and README. Restore chooser timed out and reset automation runtime; restore/preview/undo not exercised. Screenshot34 confirms final export completion; restore stays BLOCKED.
- Bằng chứng: [34-final-backup-export.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/34-final-backup-export.jpg>)

### TODAY01 · PASS · Today nudges / dismiss / snooze

- Thao tác: Dismiss Summit; snooze Apex tomorrow; reload; bring back dismissed
- Mong đợi: Suppression survives reload and can be undone
- Thực tế: Both absent from watch-list after reload; restored dismissed via button.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### ASK01 · PASS · Ask / money / scoped followup

- Thao tác: Ask Where is money stuck; choose Orion account; draft followup
- Mong đợi: Money result with records and account-specific draft
- Thực tế: Summit confirmed overdue vs Orion planning date distinguished; Orion draft produced locally.
- Bằng chứng: [17-ask-followup.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/17-ask-followup.jpg>)

### ACC02 · FAIL · Accounts / Strategic quick filter

- Thao tác: Create clean Unknown-potential account; Mark strategic; verify badge/counter; select Strategic quick filter.
- Mong đợi: The marked account appears in Strategic results.
- Thực tế: Mark persists: account badge Strategic and counter 1. Strategic quick filter returns 0 of 6. Earlier Apex result was confounded by follow-up status; clean-account control confirms filter mismatch, not a failed save.
- Bằng chứng: [29-strategic-control.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/29-strategic-control.txt>), [30-strategic-counter-filter-mismatch.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/30-strategic-counter-filter-mismatch.jpg>)

### COVER01 · PASS · Coverage / gap to new deal

- Thao tác: Click Apex×Scitek gap; blank-name save; enter Coverage add-on1500; save
- Mong đợi: Prefill exact Account+catalog Brand; enforce name; saved record
- Thực tế: Apex/Scitek prefilled; empty name rejected; saved new ID05cf200b-93a7-4311-a157-e9bf672da1e3.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### OBJ01 · PASS · Objection create / resolve / reload

- Thao tác: Add high-impact validation objection linked to new deal1500; add proof/response; resolve with note; reload and Resolved filter
- Mong đợi: Debt +1500 when open, removed when resolved; note retained
- Thực tế: Open debt76.9→78.4→76.9K; resolved count2→3; linked objection retained.
- Bằng chứng: [19-objection-resolved.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/19-objection-resolved.jpg>)

### PEOPLE02 · PASS · Stakeholder create / role confirmation / search

- Thao tác: Create FinanceDirector linked Apex/add-on, EconomicBuyerHigh, evidence confirmed; reload/search
- Mong đợi: New person retained; account role gap reduced
- Thực tế: 7people; EconomicBuyer in Apex; missing buyer accounts5→4; search finds record.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### ASSET01 · PASS · Assets create / search / reload / copy

- Thao tác: Create proof asset text; save/reload; searchSIMUSER; CopyContent
- Mong đợi: Exact content retained and copied
- Thực tế: Assets4→5, Proof0→1, filtered1; clipboard matches fictional content.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PLAY01 · PASS · Playbook to reusable Asset draft

- Thao tác: Inspect pattern evidence; CreateAssetDraft via keyboard
- Mong đợi: Draft populated from source pattern and stays editable
- Thực tế: Title,type,content,evidence,account,opportunity and related pattern all prefilled; no automatic send/save.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### SEARCH01 · PASS · Global search

- Thao tác: Search Coverage add-on
- Mong đợi: Find new opportunity with account/stage
- Thực tế: Result [SIM USER16OCT]Coverageadd-on ApexLabs Discovery.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PLAN03 · PASS · Plan manual / edit / reschedule / month

- Thao tác: Add Fri desk item; reload; edit customer Apex+title; move dayOct17; Month
- Mong đợi: One manual item on Oct17 with same changes
- Thực tế: Retained after reload; Month Oct17 shows SIM16 checklist and Apex, Deskwork.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PROMISE01 · PASS · Commitment customer owes / reschedule / keep

- Thao tác: Record customer promise dueOct17; moveOct20 withreason; mark kept; reload
- Mong đợi: Explicit kept distinct from plan completion
- Thực tế: Open8→9→8; moved date then kept; settled1 retained afterreload.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PLAN04 · PASS · Paste week

- Thao tác: Paste Friday[Apex]scope and Saturday[Internal]checklist; preview and Add2
- Mong đợi: Two correct weekdays and account tags
- Thực tế: Preview2; Saturday internal checklist plus existing item shown; no unrecognized customer for Internal.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CAP03 · PASS · Pasted email / confirm / source / reload

- Thao tác: Paste fictional email with account+deal hints, due20Oct; review/correct contact; save/reload
- Mong đợi: One linked activity, correct next action/date and source
- Thực tế: Activity12, Apex/add-on linked, Morgan contact, Sendfinalscope20Oct, pasted-email source/hash.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### VAULT01 · PASS · Vault knowledge / search / reload / map

- Thao tác: Create Fact linked Apex with detail/source; reload/search; open; centre map
- Mong đợi: Knowledge retained and connected to Apex
- Thực tế: 52nodes Knowledge1; exact search result; memory detail and trueofApex connection.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### PRINCIPAL01 · PASS · Principal commitment

- Thao tác: RecordScitek owesDocument with detail and date; reload
- Mong đợi: Supplier-side promise retained
- Thực tế: Scitek validation certificate request appears under Yourprincipals, TheyoweMe.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### TARGET01 · FAIL · Quarterly target currency / no-op save

- Thao tác: USD reporting with seeded VND2.5B target; Edit targets; Save without changes; reload
- Mong đợi: Same equivalent96153.85USD target
- Thực tế: Editor raw2500000000 labelledUSD; no-op save converts target to2.5BUSD, coverage70%→0%; persists afterreload.
- Bằng chứng: [20-target-currency-before.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/20-target-currency-before.jpg>), [21-target-currency-after.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/21-target-currency-after.jpg>)

### INIT01 · PASS · Must-win initiative / experiment / linked activity / decision

- Thao tác: Create hypothesis+expectedsignal+nextaction; reload; link captured email; signal and Adjust; save/reload
- Mong đợi: Priority retains fields and explicit activity/decision
- Thực tế: 2active initiatives; new pilot and Adjust verdict retained.
- Bằng chứng: [28-initiative-reloaded.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/28-initiative-reloaded.txt>)

### MOBILE01 · PASS · 390px Lead form / Others validation / save

- Thao tác: ChooseOthersblank; submit; fillmanualBrand; save/reload/search
- Mong đợi: Blank manualname rejected; corrected lead saved; form usable
- Thực tế: Inline EnterabrandnameforOthers; drawer footer visible; corrected lead found afterreload.
- Bằng chứng: [22-mobile-others-validation.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/22-mobile-others-validation.jpg>)

### MOBILE02 · PASS · 390px Money Orders / Collections receipt

- Thao tác: UseMore→Money; openCollectionsSummit; record2600000VND mobile receipt; reload
- Mong đợi: Outstanding25000→24900USD; no viewport horizontal overflow
- Thực tế: Confirmedoverdue24.9K; receipt persisted, page375pxscroll375px.
- Bằng chứng: [23-mobile-orders.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/23-mobile-orders.jpg>), [24-mobile-collections.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/24-mobile-collections.jpg>)

### MOBILE03 · PASS · 390px Reports/Dashboard cross-surface receipts

- Thao tác: Payments-needing-attention report; save mobile; create dashboard; cardReceipts; save/reload
- Mong đợi: Receipt100USD same as Collections; usable page width
- Thực tế: Report receipts100, overdue24900, outstanding59515.38; saved Dashboardcard100; no page horizontaloverflow.
- Bằng chứng: [25-mobile-reports.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/25-mobile-reports.jpg>), [26-mobile-dashboard.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/26-mobile-dashboard.jpg>), [33-desktop-dashboard-source.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/33-desktop-dashboard-source.jpg>)

### AUTH01 · BLOCKED · Public auth forms

- Thao tác: OpenLogin, blanksubmit, ForgotPassword invalidemail, Signupinspect
- Mong đợi: Form validation and real authentication separated
- Thực tế: Blanklogin stayed with email focus; invalidresetemail stayed withoutsend. Signupfields/legal links present. Backend unavailable placeholder config; noaccountcreated/OAuth/resetemail/billing exercised.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.

### CSV01 · PASS · CSV import / mapping / duplicate / invalid

- Thao tác: Paste3rows; map8fields; Brandunmappedwarning; saveprofile; import1; reloadsearch
- Mong đợi: Onevalid,oneduplicate,oneinvalid; onlyoneimported
- Thực tế: Ready1Duplicate1Invalid1; 14total(+1), oneSIMCSV16 row2000USDDiscovery; missingBrandexplicitlywarned.
- Bằng chứng: [27-csv-preview.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/27-csv-preview.jpg>)

### CSV02 · PASS · CSV refresh / mapping reuse / protected fields

- Thao tác: Compare same row2000→2500+StageQualification+newaction; uncheckStage; leaveEvidenceprotected; Apply0new1update; reload
- Mong đợi: SameID,2500USD,Discoveryretained,evidenceold,nextactionnew
- Thực tế: ID9cd6e59c-bffa-4f8d-874f-5c12fbdfbe83 retained; total14; value2500,Discovery,ConfirmQAreviewer; old evidence kept.
- Bằng chứng: [32-csv-refresh-reloaded.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/32-csv-refresh-reloaded.txt>)

### ACC03 · PASS · Strategic clean-account control

- Thao tác: Create clean account Unknown potential; Mark strategic; navigate away and return.
- Mong đợi: Manual Strategic status is stored and counted.
- Thực tế: Clean account has Strategic badge and counter 1. Filter behavior is FAIL ACC02, not a pass.
- Bằng chứng: [29-strategic-control.txt](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/29-strategic-control.txt>)

### CAT03 · PASS · Product defaults / classify / reload / performance drill

- Thao tác: CreateValidationkit Product defaultScitek+Labworkflows; selectCSVdeal; product autofillsdefaults; setunit; Save; reload; product report
- Mong đợi: One 2500 USD deal correctly linked to selected product and defaults.
- Thực tế: Unclassified1→0; product1link pipeline2500; report oneCSVdealDiscovery2500USD.
- Bằng chứng: [31-product-report-linked.jpg](<E:/Antigravity project/Memoire/.memoire-private/user-feature-test-2026-10-15/31-product-report-linked.jpg>)

### REPORT02 · PASS · Report archive / restore

- Thao tác: Archiveexisting mobileCollections report; Archivedonly; Restore; uncheck; reload
- Mong đợi: Same report restored, version increments
- Thực tế: Version1→2archived→3active; same saved report retained.
- Bằng chứng: Quan sát UI trực tiếp; không có ảnh riêng cho ca này.
