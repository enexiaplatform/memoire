# Memoire — sửa lỗi và tái kiểm tra audit B2B global

Ngày 05/10/2026. Báo cáo này tiếp nối [audit vòng 4](full-product-user-audit-2026-10-04.md), dùng cùng doanh nghiệp giả lập Northstar Industrial Supply và dữ liệu vận hành 10/2025–09/2026, cộng chu kỳ QC-R4 tháng 10/2026. Mô phỏng không phải 12 tháng sử dụng thật, bằng chứng khách hàng thật hay sổ kế toán được chứng nhận.

Đã sửa 17 phát hiện F10–F26 và 4 vấn đề bổ sung được phát hiện trong vòng tái kiểm tra. Có kiểm tra hành vi người dùng, đối chiếu cloud, kiểm tra thuật toán và hợp đồng tích hợp. Phát hành và chấp nhận Production được ghi ở phần cuối; việc kiểm tra localhost dùng database thật của tài khoản QC không tự xác nhận code đã được phát hành.

## Các phát hiện và bằng chứng sửa

| Mã | Sửa đổi | Bằng chứng và phạm vi xác nhận |
|---|---|---|
| F10 | Today, Review, Accounts, Money flow và cảnh báo dùng order/receipt/milestone theo ID. Một order không bị nhân bởi revision quote; tiền thu một phần/thu vượt giữ nguyên. Phân biệt giá trị đơn đã tất toán với cash collected. | Test 14K/28K, revision 55K, overpayment 29K, receipt mồ côi; Review hiển thị collected 441,4K USD, outstanding 359,1K. Orders giải thích stage totals là full order value; Collections sở hữu actual cash. |
| F11 | Tạo/sửa opportunity xác định canonical account ID; bổ sung ID thiếu khi có đúng một account cùng owner. Ghi bất đồng bộ bị chặn khi session owner thay đổi, kể cả A→B→A. | Opportunity QC-R4 được cloud xác nhận account ID của Atlas; test unique/ambiguous/demo/owner generation. Không thay ID của 96 deal lịch sử. |
| F12 | Retry đợi hàng ghi, pending objection/context và receipts; lỗi không bị một lần đọc thành công xóa mất. Chỉ cập nhật lần sync thành công sau khi toàn chuỗi hoàn tất. | UI cố ý dùng tên account không tồn tại: giữ bản local, báo lỗi, không đổi timestamp thành công. Sửa tên Atlas rồi Retry thành công, cùng ID được ghi lên cloud. |
| F13 | Objection codec phù hợp schema hiện tại; giữ/merge pending local khi cloud trả rỗng; upsert ID ổn định. Experiment/Offer giữ semantic type trong payload và map sang enum được hỗ trợ. | Pending objection tồn tại sau reload, sau sửa link ghi thành công. Hai objection addressed trên cloud mở Library; Assets save/copy và Playbook→asset draft→save đã dùng. Experiment lưu cloud và reload đúng loại. |
| F14 | YYYY-MM, tháng có tên và fiscal year được phân kỳ đúng; không đẩy ngày thiếu/không hợp lệ vào quý hiện tại; FX thiếu bị loại và giải thích. Khuyến nghị phục hồi forecast phân biệt phạm vi cả năm với quý hiện tại. | Q4 FY2026: target 100K, won 28K, supported 0, coverage 28%, shortfall 72K. Unit kiểm tra tháng, fiscal start, historical year, undated và FX. |
| F15 | Loại và summary đã được người dùng xác nhận được giữ khi lưu. | Note chứa delivery, sửa Customer meeting và summary; cloud xác nhận Customer meeting đúng wording. |
| F16 | Deal mơ hồ không auto-preselect, không điền tên legacy để tự tạo High confidence. Chọn account-only giữ rõ ràng; Unlink xóa ID và tên legacy. Save theo scope đã xác nhận. | EU Buyer 23 có nhiều deal: medium suggestions, field deal rỗng, saved record có linked ID và opportunity name null. Exact/ambiguous scope tests. Partial fact recovery giữ cơ chế idempotent hiện có; chưa có fault injection toàn bộ từng fact trong vòng này. |
| F17 | Hoàn thành task không được trình bày như hoàn thành commercial promise. Drawer có lựa chọn promise, mặc định giữ open; bằng chứng bắt buộc khi xác nhận promise. | UI chọn duy nhất “Send the QC-R4 proposal…” và ghi kết quả giả lập: open giảm 388→387, selected promise completed; cloud completion evidence chứa activity ID thực. Không gửi email. |
| F18 | Backlog mặc định ẩn, có toggle và giới hạn 12 items/day, mở tiếp được; dữ liệu không bị xóa. | 408 carried items: mặc định 2 việc tuần; bật lại có 410 items, “Show 12 more (397 remaining)”. |
| F19 | Coverage và Target Plan dùng phân loại portfolio đã duyệt thay cho brand thô; accepted unassigned không bị brand cũ lấp vào. | Hàng Atlas hiển thị Won tại SenseWorks, 28K USD, không báo whitespace sai cho line này. |
| F20 | Vault sử dụng interaction date thay updatedAt để mô tả chuyển động; next action quá hạn không miễn Going silent. Nudge quá hạn không tạo thêm silence nudge trùng. | Today 8 going silent trong tập QC; test motion và proactive nudge, hợp đồng đồng nhất tín hiệu. Không dùng edit timestamp làm customer touch. |
| F21 | Search chuyển `question`, Ask hỗ trợ cả alias `q`. | UI nhập câu hỏi thuế Canada, URL và answer giữ nguyên câu hỏi. |
| F22 | Unsupported intent trả giới hạn rõ ràng; draft không nói có recent conversation khi chưa có touch. | UI trả “cannot answer … recorded workspace”, không trả summary như câu trả lời thuế. Draft fallback/intent được kiểm tra bằng tests/contracts; không gửi khách hàng. |
| F23 | Public funnel dùng copy free preview theo feature flag; Library giải thích activation progress và tách billing. | Build/prerender và commercial/funnel contracts; Library đã mở bằng hai support responses. Không tạo checkout hay đổi gói. |
| F24 | “Archived reports only” mô tả đúng filter; restore tự tắt filter và chọn report khôi phục. | QC report archive version 4→restore active version 5; UI mở Edit saved report, cloud sync completed, active library còn record sau reload. |
| F25 | Operating System ghi currency workspace, đọc currency payload; giữ SGD ở record legacy. Experiment hiển thị đúng loại thay Initiative. | New experiment 2.468 USD; cloud currency USD, semantic experiment, supported enum initiative. |
| F26 | Undo merge ghi tombstone cloud đủ mới và flush pending; loader không phục sinh merge đã undo. | Accounts 26→27 sau undo và reload; cloud merge payload `__deleted=true`. |
| F27 (mới) | Date input Operating System giữ ngày khi chuyển focus và ghi lên cloud. | Experiment next date 2026-10-20 còn nguyên sau reload và trong cloud. |
| F28 (mới) | Playbook không khẳng định “repeat across deals” khi các objection chỉ liên kết account; dùng “captured records”. | Hai account-level objections tạo pattern; title chính xác; asset draft chỉ nêu captured evidence, không biến thành acceptance. |
| F29 (mới) | Phủ định payment/delivery không trở thành positive buying signal; clause khẳng định độc lập vẫn được giữ. | UI “No delivery or payment happened” có buyingSignals rỗng; unit kiểm tra no/not/didn't và clause payment received độc lập. Đây là xử lý phủ định tiếng Anh theo rule, không phải hiểu mọi ngôn ngữ. |
| F30 (mới) | Tiến độ/summary/day counters của Plan dùng cùng scope với việc đang hiển thị. Today tính tuần hiện tại riêng, vẫn nêu overdue incl. backlog. | Trước sửa: 2/410 dù backlog ẩn. Sau sửa: 2/2, 100%, Monday 1/1; bật backlog 2/410. Test 408 overdue records bảo toàn source và mọi counter. |

## Đối chiếu cloud và tiền

Export xác thực: complete, 56 tables, 1.436 rows trước phát hành. Hai asset QC mới, hai addressed objections, một experiment, merge tombstone và promise completion evidence đều được đọc lại từ export. Không thay đổi schema; database dùng chung với Helm không có DDL trong vòng này.

| Chỉ tiêu | USD |
|---|---:|
| Accepted order value | 791.846,1538 |
| Receipts thực ghi | 441.384,6154 |
| Outstanding, từng order chặn dưới tại 0 | 359.076,9231 |
| Landed cost | 532.176,9231 |
| Gross margin | 259.669,2308 |

74 receipts; 97 quotes, 97 opportunities, 49 receivables, 49 costs. Các tổng trên **đã bao gồm** order QC-R4 28K và receipts 29K, không cộng thêm lần nữa. Order đó thu vượt 1K, outstanding 0; landed cost 20,4K và gross margin 7,6K. Vì overpayment, received + outstanding có thể lớn hơn order value.

Đã so sánh ID và financial fields của 96 quotes, 96 opportunities, 48 receivables, 48 costs gốc với snapshot trước audit: giữ nguyên tiền, currency, receipts, stage/status của chúng. Các quote fields phi tài chính đã được codec chuẩn hóa trong audit (Not received→Pending, Not started→Not scheduled, missing→null); không tuyên bố raw export bất biến byte.

## Kiểm tra phát hành

Build/prerender, lint, API typecheck đạt. Các hợp đồng trong `npm run check` được chạy đủ 113 nhóm, 113 đạt; full unit suite cuối 2.116/2.116 đạt, 0 fail/skip, chạy với concurrency 2 để phù hợp máy QC. Ca bổ sung kiểm tra relational write trả lỗi sau khi đọc thành công: recovery đợi đúng lỗi trước khi kết luận. Deployment acceptance được cập nhật bên dưới.

Bằng chứng riêng trong `.audit/round4-remediation-2026-10-04/`: `unit-final.log`, `contracts.json`, `contracts.log`, `build-final.log`, `lint-final.log`, `api-final.log`, `plan-completion.dom.txt`, `ask-unsupported.dom.txt`, `capture-confirmed.dom.txt`, `review-cash.dom.txt`, `forecast-period.dom.txt`, `coverage-catalog.dom.txt`, `report-restored.dom.txt`, screenshots experiment/sync/merge. `.audit/full-product-user-2026-10-04/` giữ export trước/sau và integrity evidence. Credentials và full private export không được đưa vào Git hoặc deployment.

## Giới hạn còn lại của chứng nhận

Ma trận audit gốc có 38 nhóm và đã đi qua 10/10 primary destinations. Vòng sửa này bổ sung sử dụng thực tế Library, Assets và Playbook trước đó bị gate, cùng recovery thất bại/thành công, task/promise evidence và archive/restore. Điều này không chứng nhận mọi thao tác con của toàn sản phẩm.

Chưa có valid signed federation/trust roundtrip hai doanh nghiệp, multi-owner sharing acceptance, chuyển tiền/billing thật, gửi email/webhook, microphone, native PWA/offline/reconnect, đầy đủ CRM import mapping hoặc restore replace workspace/undo restore thật trong vòng này. Guard và prerequisite đúng không đồng nghĩa luồng external hoàn tất. Không tự cấp quyền hoặc mua gói để đánh dấu pass. Chưa có chứng nhận security/WCAG/load test toàn sản phẩm. Các test receipt concurrency vòng 3 là bằng chứng lịch sử riêng; vòng này bảo toàn và chạy lại unit/contracts, không nhận đã lặp lại tất cả browser cases đa thiết bị.

## Chấp nhận Production

Đang chờ kết quả phát hành artifact đã kiểm tra và smoke test live. Chưa dùng phần này để tuyên bố Production đã được sửa.

Bản đầu `38e3c43` đã Ready, export xác thực và đối soát tiền đạt, rồi promote tới domain chính thức. Browser acceptance trên phiên cũ phát hiện phần F12 còn sót: pending relational writes chưa được drain, và thông báo success còn tồn tại khi lỗi đến muộn. Không coi lần acceptance đó là hoàn tất. Bản bổ sung đợi kernel writes, nêu nguyên nhân cụ thể và thay thông báo success bằng failure nếu trạng thái thay đổi. Đồng thời sửa duplicate sibling keys ở Review được phát hiện trong console localhost.
