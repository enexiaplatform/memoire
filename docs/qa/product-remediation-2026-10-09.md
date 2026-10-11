# Xử lý các điểm rà soát Memoire — cập nhật 11/10/2026

Các phần được sửa và nghiệm thu riêng theo ưu tiên trong [báo cáo rà soát](<E:/Antigravity project/Memoire/docs/qa/product-improvement-audit-2026-10-08.md>). Trạng thái dưới đây thuộc bản local, chưa phải triển khai production. Ảnh của audit gốc được giữ nguyên để còn đối chiếu trước/sau.

## Phần 01 — Account coverage (F05)

**Thay đổi:** hoạt động gắn với Opportunity được quy về Account của Opportunity khi đọc danh sách “Nothing at all”. Trước đây, Analytics so tên Opportunity với tên Account nên năm khách hàng đã có hoạt động vẫn bị xếp vào danh sách không có hoạt động.

- Dùng ID trong liên kết Opportunity trước tên hiển thị, kể cả khi hồ sơ đổi tên hoặc tên trong activity còn trống.
- Ưu tiên Account ID của Opportunity khi có; tên Account và merge aliases vẫn hỗ trợ hồ sơ cũ.
- Hai Opportunity trùng tên không được ghi nhận hoạt động thay cho nhau. Liên kết trỏ tới hồ sơ đã mất cũng không được đổi sang một hồ sơ cùng tên.
- Activity của một Opportunity được tính cho Account, nhưng không làm Opportunity khác của cùng Account biến mất khỏi danh sách chưa được tiếp cận. Activity trực tiếp gắn với Account giữ cách đọc phạm vi Account hiện có.
- Chỉ đọc activity trong kỳ đã chọn. Brand, Internal và Unresolved không được tính như activity của Account chỉ vì cùng tên.
- Bỏ cách loại trùng theo tiền tố tên Account; “Apex Labs” và “Apex Labs Extended” không tự coi là cùng khách hàng.

**Kiểm chứng đã thực hiện:** 14 tình huống hồi quy mới, 14 kiểm thử liên quan có sẵn và contract Activity Ledger đều pass. Trên Analytics local demo, năm Account đã có hoạt động không còn nằm trong “Nothing at all”; QC workflow vẫn được báo 17 ngày im lặng, và những hồ sơ khác chưa có hoạt động vẫn còn trong danh sách. Lần nghiệm thu riêng F05 giữ phạm vi Account coverage. Nhãn Lead và phạm vi qualified pipeline đã được sửa tiếp trong F06 bên dưới.

**Kiểm tra toàn app:** `npm run check` hoàn tất với exit code 0: build, type checks, lint, 2.158 kiểm thử (0 fail) và toàn bộ contract checks trong chuỗi này đều pass. [Log kiểm chứng](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-01-check.log>). Chưa deploy hoặc nghiệm thu cloud production.

**Các file chính:** [activityAnalytics.ts](<E:/Antigravity project/Memoire/src/utils/activityAnalytics.ts:305>), [activityLedger.ts](<E:/Antigravity project/Memoire/src/utils/activityLedger.ts:272>), [14 kiểm thử hồi quy](<E:/Antigravity project/Memoire/test/unit/activityCoverageGaps.test.mjs>).

![Analytics sau sửa Account coverage](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-01-account-coverage.jpg>)

## Các phần đã triển khai tiếp

Có thay đổi trong bản local cho toàn bộ 20 nhóm F01–F20 và ba điểm C01–C03 của audit. Bảng này ghi rõ cách xử lý và bằng chứng đã có; kiểm chứng production là một bước riêng. Các đề xuất trong audit được thực hiện theo mục đích sử dụng, giữ khả năng đọc lại bản ghi gốc.

| Mã | Thay đổi hiện tại | Kiểm chứng |
|---|---|---|
| F01 | Metrics chỉ nhận bằng chứng tác động kinh doanh định lượng; giá deal, tên sản phẩm và việc nhắc ROI không tự thành Strong. Phân biệt đã xác nhận, chưa xác nhận và câu phủ định. | Kiểm thử các dạng bằng chứng; bảng Opportunity thực tế hiện Metrics Missing khi chỉ có giá và mô tả sản phẩm. |
| F02 | Các trường quy trình đủ không vượt qua blocker về buying evidence. Gợi ý gọi đúng phần thiếu; nhãn checkpoint không còn hứa rằng deal đã đủ điều kiện lên stage. | Hồi quy blocker/stage gap; đọc bảng và drawer Opportunity. |
| F03 | Tách confirmed overdue khỏi lịch dự kiến: cần điều khoản và ngày trigger đã ghi. PO chưa nhận không bị gọi payment overdue. Today, Orders, Collections, report và money flow đọc cùng cơ sở; tuổi nợ và lịch dự kiến được ghi rõ. | Trên demo: Summit 25K USD quá hạn đã xác nhận; Orion 34.6K USD là ngày kế hoạch cần xác nhận. Kiểm thử điều khoản, invoice/delivery và PO pending. |
| F04 | Thu trừ chi được gọi Recorded net cash flow. Order book nói rõ expected orders và mốc Contract / PO xác nhận đơn. | Kiểm tra copy trên các màn hình, brief và export liên quan. |
| F05 | Sửa Account coverage theo ID, không mượn touch giữa các Opportunity hoặc Account gần giống tên. | 14 ca hồi quy và ảnh phần 01. |
| F06 | Lead được tách khỏi active pipeline, forecast risk và role coverage. Khi mở Lead, drawer giữ contact, need, next step và Brand; bỏ MEDDIC, probability và phân tích forecast dành cho Opportunity. | Kiểm thử pipeline/risk; kiểm tra Lead mới cùng Apex nhưng không có contact/need của deal anh em. |
| F07 | Capture đọc cuộc gọi và lời hứa tiếng Việt, ngày/tháng theo ghi chú. Ask hiểu các nhóm câu hỏi đã hỗ trợ, giữ tên riêng và yêu cầu chọn Opportunity khi một Account có nhiều hồ sơ. | Lưu ghi chú tiếng Việt: Phone call, Apex/Validation Expansion, hạn 12/10 và công việc vào Plan đúng ngày; Ask mơ hồ và Ask theo hồ sơ cụ thể. |
| F08 | Người dùng xác nhận các nguồn mô tả cùng công việc; Plan và promise reading giữ một danh tính, bảo toàn câu gốc, có thể tách lại. Completion dùng nhóm liên kết; weekly snapshot được ghi rõ là lịch sử review riêng. | Thực tế ghép 12 → 11 mục, tách lại 12; hồi quy completion, nguồn khác Account và xung đột nhóm. |
| F09 | Brand được chọn bằng catalog ID hoặc Others + tên thủ công. Alias/đổi tên giữ liên kết. Import đồng thời dùng chung một Others. Classification không được bỏ link khi tên Brand còn được ghi. Các tên chưa có record tiếp tục hiện trạng thái cần xử lý. Stakeholder/objection có ID của deal khác không được đổi sang hồ sơ cùng Account. | 7 ca Brand: rename, qualify, alias, clearing, concurrent intake, lưu lỗi và chặn unlink/unnamed Others; Lead thực tế hiện Others được chọn trong catalog. |
| F10 | Next action và ngày nằm đầu drawer. Commercial analysis và lịch sử thu gọn; full analysis vẫn mở được. Lead có nhãn Edit/Save Lead. | Kiểm tra drawer và các section trên giao diện. |
| F11 | Today tập trung ba việc chính; các bản đọc hỗ trợ được thu gọn. Review giữ khung thay đổi, lý do, cam kết tiếp theo, với full commercial brief mở khi cần. | Kiểm tra Today/Review, guard copy và các fold. |
| F12 | Reports mở bằng kết quả tự chạy; kết quả đứng trước builder cả về hiển thị và thứ tự đọc. Có câu hỏi Brand, thiếu next action, nguồn Lead và Collections. Đổi scope không giữ kết quả cũ như kết quả mới. | Auto-run 8 qualified records, 3 Lead bị loại; preset hợp lệ; ảnh Reports. |
| F13 | Dashboard từ report tự chạy preview. Drill-down mặc định là dòng đóng góp đúng measure, có lựa chọn toàn bộ scope. Hủy request cũ khi đổi scope/owner. | Scitek có 3 hồ sơ trong scope, pipeline drill-down chỉ 2 Active contributors; kiểm thử pipeline/Won/win-rate contributor. |
| F14 | Ghim cột tên và cột hành động/coverage ở các bảng Accounts, Opportunities, Leads, Stakeholders và Objections. Lead trên điện thoại tiếp tục dùng thẻ. | Ở 1239 px, bảng Opportunity rộng 1380.7 px nhưng tên và nút Open đều nằm trong vùng nhìn; ở 390 px trang không tràn ngang. |
| F15 | RecordDrawer và Plan detail dùng modal chung: giữ Tab/Shift+Tab trong dialog, Escape đóng, trả focus về nút mở và giữ vùng nền không nhận focus. | Probe bàn phím thực tế: Close → Shift+Tab → Reset demo data → Tab → Close; Escape trả focus Reset demo. Trạng thái inert có sẵn của navigation được giữ. |
| F16 | Demo có 8 qualified Opportunities, 3 Leads, catalog/assignment, quote IDs đúng, receipts 660m VND, milestones, targets và guest initiatives. Workspace đọc đúng sample scope cho promise/evidence/kernel records. Reset nạp lại bộ đầy đủ thay vì xóa rồi để trống. | Kiểm thử fixture và tách sample/real guest promises; Collections có receipts thật trong mẫu; Reset bỏ QA Lead và khôi phục 3 Leads. |
| F17 | Playbook dùng recorded responses, số mẫu và giới hạn diễn giải. Vault dùng recorded thay vì ngụ ý mọi dữ kiện đã được xác nhận. | Copy contract và kiểm tra nhãn nguồn. |
| F18 | Sharing trình bày người, quyền, lời hứa và nội dung chia sẻ theo bước. Statement có preview dễ đọc; dữ liệu nhận vào có preview và chưa tự thành accepted fact. Công việc derived từ Plan không được chọn làm statement có thể phát hành. | Preview giả lập hiển thị From/To, promise, người chịu trách nhiệm, ngày, trạng thái, evidence. Issue/Receive đều bị chặn trước xác nhận. Không phát hành hoặc cấp quyền thật. |
| F19 | Metric basis dùng chung giải thích population, kỳ đọc, FX ngày 01/08, dữ liệu thiếu, current outcomes, Won value, cash và net cash flow. Overdue report có version và trường planned balance riêng. | Today/Reports/Products/Dashboard cùng active qualified pipeline 164,230.77 USD ở scope demo đã kiểm tra; có mẫu số và nguồn đóng góp. |
| F20 | Data to complete tập hợp lỗi theo record và có link tới hồ sơ nguồn. Coverage có Retry và giữ lần đọc trước khi refresh lỗi. Plan/milestone không báo Saved khi local write bị từ chối. Copy connection dùng ngôn ngữ vận hành. | Hồi quy durable writes/cache; kiểm tra link source Opportunity/Lead/Quote/Brand. Cloud recovery/quota trên tài khoản thật chưa nghiệm thu. |
| C01 | Portfolio write invalidate đúng collection; Coverage lắng nghe thay đổi catalog. | Warm-cache regression, không chỉ kiểm tra tên event. |
| C02 | Receipts và milestones invalidate đúng receivableRecords/milestoneRecords. Plan invalidate kể cả local write. | Warm-cache regression cho bốn store. |
| C03 | Notifications chỉ báo lưu khi row phản hồi khớp owner và đủ trường; zero row, lệch owner, trường chưa đổi không thành thành công. Load lỗi có retry, callback cũ không sửa owner mới. | Hồi quy receipt; còn cần kiểm tra authenticated cloud write và actual email delivery. |

## Kiểm tra giao diện có chứng cứ

Các lần thử 09/10 và 11/10 dùng demo browser local tại 127.0.0.1:5184, với cloud bị vô hiệu hóa. Tên QA và các lời hứa thử nghiệm là giả lập. Các file sau là ảnh hoặc trạng thái UI tại thời điểm kiểm tra, không phải ảnh production:

| Chứng cứ | Kết quả nhìn thấy |
|---|---|
| [Reports](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-02-reports.png>) | Kết quả có ngay, builder thu gọn, scope và FX rõ. |
| [Dashboard contributors](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-03-dashboard-contributors.png>) | 2 dòng đóng góp trong 3 dòng Scitek. |
| [Brand Others](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-05-brand-others.txt>) | Lead QA giữ tên gốc QA custom principal, assignment chọn Others. |
| [Capture tiếng Việt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-06-vietnamese-capture.png>) | Lời hứa ngày 12/10 vào Plan, giữ ghi chú gốc. |
| [Ghép/tách Plan](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-07-plan-group.png>) | Có xác nhận cùng việc và nút tách lại. |
| [Collections](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-08-collections.png>) | Confirmed overdue và Planning dates to confirm riêng. |
| [Receipt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-08-receipt.txt>) | Khoản thu 480m VND và delivered date trong đơn mẫu. |
| [Ask mơ hồ](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-09-ask-ambiguity.png>) | Không chọn ngẫu nhiên một deal của Apex. |
| [Ask theo scope](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-09-ask-scoped.txt>) | Trả lời Validation Expansion và link đúng nguồn. |
| [Desktop](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-10-desktop-table.png>) / [Mobile](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-11-mobile-leads.png>) | Cột hành động được ghim, Lead có thẻ và không tràn trang. |
| [Probe focus](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-12-focus.json>) | Tab hai chiều, Escape và trả focus được đo bằng DOM/bàn phím. |
| [Reset demo](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-13-reset-demo.txt>) | QA Lead biến mất, ba Lead mẫu trở lại. |
| [Sharing preview](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-14-sharing-preview.png>) | Người nhận và nội dung được xem trước; chưa phát hành. |
| [Received preview](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-14-received-preview.txt>) | Nguồn ngoài được gọi issuer claim, nhận không tự thành chấp nhận. |
| [Chặn bỏ Brand link](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/part-15-brand-link-guard.txt>) | Không lưu classification không có Brand khi tên Brand còn được ghi. |

## Phạm vi nghiệm thu và giới hạn còn lại

- Bản mã local đã được triển khai các thay đổi. Chuỗi kiểm tra cuối ngày 11/10/2026 hoàn tất với exit code 0; có log bên dưới.
- Brand và Opportunity nằm ở hai collection. Nếu lỗi xảy ra sau khi deal đã được ghi nhưng assignment chưa ghi được, kết quả phải báo partial save và hướng tới Products & Brands để sửa; không coi đó là giao dịch nguyên tử và không tạo lại deal. Kiểm thử quota xác nhận nhánh này.
- Dữ liệu lịch sử chưa có link được đưa vào hàng xử lý có lý do. Việc nhận tên cũ vào catalog cần lựa chọn của chủ dữ liệu; không tự đoán alias, người liên hệ, payment hoặc classification.
- Sharing qua tài khoản thật vẫn cần account reference chính xác và người nhận chấp nhận. Giao diện giải thích cách lấy reference; chưa có directory tra người bằng email. Không cấp quyền hoặc gửi statement trong nghiệm thu này.
- Notifications giữ UTC offset cố định hiện có, có hướng dẫn cập nhật khi đổi múi giờ/DST. Chưa chuyển scheduler sang IANA timezone, chưa thử phát email thật và chưa nghiệm thu cập nhật trên tài khoản cloud có RLS.
- Các ca quota/cache/scope có kiểm thử local; backup/restore, lỗi mạng, sync conflict và cách phục hồi trên cloud production cần một môi trường nghiệm thu có tài khoản phù hợp. Chưa push, deploy hay thay đổi schema production.

## Kết quả kiểm tra cuối

Ngày 11/10/2026, chuỗi npm run check hoàn tất với **exit code 0**: build server/app, type checks, lint, **2.190 kiểm thử — 2.190 pass, 0 fail**, và toàn bộ contract checks trong chuỗi đều pass. [Log đầy đủ](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/final-check-2026-10-11.log>).

Kiểm tra giao diện ngày 11/10 ghi nhận không có console error trong phiên demo đã đọc. Sau QC, Reset demo đã dọn QA Lead và lời hứa thử nghiệm; Reports mở trên 8 qualified records / 11 sources, loại 3 Lead, tự chạy và giữ đủ catalog. Viewport đã trả về mặc định.

Các bản sửa chưa được commit, push hoặc deploy. Chưa ghi nhận kết quả nghiệm thu tài khoản cloud, email delivery, chia sẻ thật, hay production release.

![Reports sau sửa và sau dọn dữ liệu thử](<E:/Antigravity project/Memoire/docs/qa/evidence/product-remediation-2026-10-09/final-reports-2026-10-11.png>)
