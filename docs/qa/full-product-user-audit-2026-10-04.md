# Memoire — audit người dùng B2B global, vòng 4

Đây là snapshot phát hiện trên Production ngày 04/10. Kết quả sửa và tái kiểm tra nằm trong [báo cáo remediation ngày 05/10](full-product-remediation-2026-10-05.md); giữ nguyên kết luận lịch sử bên dưới để truy vết.

Ngày: 04/10/2026. Kết luận: **NO-GO cho việc dùng Memoire làm nguồn tin cậy duy nhất để điều hành tiền, dự báo quý và phục hồi dữ liệu** trên bản Production đã kiểm tra. Có **17 phát hiện mới: 6 P1, 9 P2, 2 P3**. Đây là kết quả audit; các phát hiện mới dưới đây **chưa được sửa hoặc phát hành trong vòng này**.

Đã thao tác ở **10/10 khu vực chính**, đồng thời kiểm tra Capture, Search/Ask, Settings, các chức năng trong hồ sơ thương mại, trang công khai và giao diện điện thoại. Điều này không đồng nghĩa mọi thao tác con đã đạt hoặc tất cả tính năng bị khóa đã được sử dụng. Ma trận dưới đây giữ riêng những phần đã dùng, chỉ xem trước, bị chặn hoặc chưa kiểm chứng.

## 1. Môi trường và giới hạn bằng chứng

- Production: https://www.memoire-official.com.
- Deployment đã xác nhận Ready/Production: `dpl_HTWZBbgxaRVfC4uKQDRZhfDC2hXr`; application SHA `beaa8ccde121b3e6c37a35ec84f0c4b154e1c7cf`.
- Doanh nghiệp giả lập: **[SIMULATED QC] Northstar Industrial Supply**, phân phối thiết bị và dịch vụ, giao dịch bằng USD/EUR/SGD, vận hành 12 tháng từ 10/2025 đến 09/2026, thêm một chu kỳ khách hàng mới tháng 10/2026.
- Tất cả khách hàng, ngân sách, báo giá, thanh toán, chấp thuận và bằng chứng QC đều là giả lập. Ghi receipt không phải chuyển tiền. Không gửi email cho khách hàng, ký hợp đồng, cấp quyền cho bên khác hoặc xóa tài khoản.
- Bằng chứng cục bộ: [journey và ảnh](../../.audit/full-product-user-2026-10-04/journey.json), [đối chiếu dữ liệu](../../.audit/full-product-user-2026-10-04/integrity-evidence.json), [kiểm tra các cột objections](../../.audit/full-product-user-2026-10-04/schema-read-evidence.json). Có **41 ảnh đã xem trực tiếp** và các bản ghi DOM đánh số 07–219; số checkpoint không phải số test độc lập.
- Snapshot ngay sau chuyển trang có thể còn nội dung trước. Những snapshot 98, 169–171, 174 và trạng thái trung gian trong lúc tải không được dùng riêng để kết luận lỗi. Dùng bản đã tải xong hoặc đối chiếu backend để xác nhận.
- Tệp credentials và export đầy đủ được giữ trong thư mục `.audit` bị Git bỏ qua; báo cáo không sao chép token hay dữ liệu đăng nhập. Liên kết bằng chứng cần workspace hiện tại, không tự đi theo một bản checkout mới.
- Không thay đổi mã ứng dụng, schema hoặc deployment trong vòng này. Các kiểm tra unit/API/concurrency của vòng 3 là lịch sử, **không được tính thành kiểm tra mới của vòng 4**. Xem [kết quả vòng 3](global-b2b-round3-remediation-2026-10-04.md).

## 2. Ma trận tính năng và hành trình người dùng

“Đã dùng” yêu cầu có hành động hoặc kết quả quan sát được; “đạt” chỉ áp dụng phạm vi được ghi trong hàng đó. Một phần đạt không xác nhận cả module đạt.

| # | Khu vực | Thao tác thực tế | Kết quả và giới hạn |
|---|---|---|---|
| 1 | Today | Đọc ưu tiên, pipeline, Money in motion; snooze, dismiss, done, restore/reset nudge; đi tới hồ sơ; xem trên điện thoại | Nudge hoạt động, có 3 bản cloud. Tiền và tín hiệu im lặng không thống nhất với nguồn khác: F10, F20. |
| 2 | Plan | Day/week/month/history; hoàn thành với ghi chú; thêm Desk work; Paste week hai việc; tạo lời hứa, dời hạn có lý do, Mark kept, xem lịch sử đã giải quyết | 5 plan items và 3 commercial commitments được đối chiếu cloud. Lời hứa và task có hai trạng thái chưa giải thích đủ: F17. Hàng trăm việc cũ lấn lịch: F18. |
| 3 | Leads | Tạo lead dịch vụ; nurture/dời lịch; disqualify; mở lại; qualify sang Discovery; ghi source, bước tiếp và điều kiện | Chu kỳ trạng thái hoạt động. Tạo/chọn khách hàng rồi lưu vẫn thiếu account ID: F11. Không tính thao tác qualify là bằng chứng buyer đã đồng ý. |
| 4 | Accounts | Tạo Atlas; sửa hồ sơ; People/Memory/Coverage; ghi stakeholder Champion; draft follow-up; archive/unarchive; nhập CSV qua ô dán; chống trùng; gộp hai fixture và Undo | Nhập 1 bản mới/skip 1 bản trùng đạt. Archive/unarchive đạt trong phiên. Merge hiển thị đúng, **Undo thất bại sau reload**: F26. Không kiểm chứng khôi phục archive trên thiết bị thứ hai. |
| 5 | Opportunities | Theo dõi lead đã qualify; điều kiện; quyết định; thử mô phỏng; Lost → reopen → Won với retrospective; evidence/requirement/money gate/timing/policy/incident trên deal cũ có account ID | Deal mới bị chặn quyết định/policy bởi F11. Deal cũ lưu được chuỗi bằng chứng, quyết định và policy; tồn tại sau reload. Link outcome tới close target chưa thành công; không tính là đạt. |
| 6 | Money | Orders/Collections/Margin; revision báo giá 28.500 → 28.000 USD; Accepted; PO/deposit/delivery/invoice milestones; 14.000 + 15.000 receipts; chi phí 20.400; supplier promise; Q4 target; đổi EUR, thử currency thiếu FX rồi trả USD | Receipt, cảnh báo thu vượt 1.000, số nợ 0 của đơn mới, margin 7.600/27,14% đúng. Dự báo quý sai F14; Today/Review đọc tiền khác F10. Không có thanh toán thật. |
| 7 | Review | Weekly/Learning/Analytics; What changed; custom weekly commitment; copy weekly brief; xem digest preview; account rhythm; coordination và các preview được liệt kê riêng | Weekly nhận đúng 2 receipts/29.000 USD mới. Analytics lại báo collected = 0: F10. Weekly commitment và knowledge note có cloud. Có cảnh báo tải incidents không đầy đủ, không xem review đó là đầy đủ. |
| 8 | Products & Brands | Tạo product/code; liên kết SenseWorks và product cho deal mới; xem performance; retire/reactivate product | Product active version 3, giữ 1 liên kết, cloud xác nhận. Coverage cũ không dùng phân loại đã duyệt: F19. Totals không phân bổ bundle hoặc roll up parent được giải thích trong UI. |
| 9 | Reports | Collections theo khách hàng QC-R4, group brand; run, drill nguồn; save/copy; archive/restore/reload; bộ lọc và trình dựng trên điện thoại | 28.000 order / 29.000 receipts / 0 outstanding đúng; report version 3 active trong cloud. “Show archived” là lọc riêng: F24. UI export chưa lấy được tệp để kiểm tra nội dung. |
| 10 | Dashboards | Tạo 2 widgets từ report; bar views; đổi thứ tự; lưu; refresh; archive/restore; inspect source records | Khôi phục giữ cấu hình và 29.000/0; inspect mở đúng order gốc, cùng captured run. Hai dashboard cloud. Export button có thể dùng sau refresh; chưa kiểm chứng tệp tải. |
| 11 | Quick Capture | Ghi customer meeting cho Atlas và deal mới, tên người và ghi chú giả lập | Activity cloud tồn tại; không thay quote/order từ ghi chú. |
| 12 | Raw Capture | Dán ghi chú EU Buyer 23 về meeting, giá/lead time và đề xuất tiếp theo; review, sửa type, unlink, chọn fact, save | Activity/commitment được tạo, nhưng type và link/fact review thiếu nhất quán: F15–F16. Tiền deal gốc không bị thay. |
| 13 | External observations | Nhận mẫu email observation và mẫu CRM connector; preview; duplicate; mẫu sai định dạng | Observation nhận và deduplicate; schema sai bị chặn. Claims chưa được nhận là bằng chứng thương mại đã xác nhận. Không kết nối mailbox/CRM thật. |
| 14 | Search | Tìm QC-R4, mở account/deal; giao diện điện thoại | Kết quả tìm record hoạt động. Chuyển sang Ask làm mất câu hỏi: F21. |
| 15 | Ask | Presets về tiền/follow-up; scoped draft; query ngoài phạm vi; kiểm tra nội dung giả lập | Không gửi khách hàng. Unsupported query vẫn nhận summary không trả lời câu hỏi: F22; không thấy bịa luật thuế. |
| 16 | Business Vault / Coverage | Timeline/map, lịch sử/relationship, customer × brand | Đọc được dữ liệu; dùng để đối chiếu F19–F20. |
| 17 | Stakeholders | Tạo Morgan Chen, Operations director/Champion; role, influence, stance và evidence | Một stakeholder cloud, tên hiển thị đúng. Không kiểm chứng liên hệ thật. |
| 18 | Objections | Tạo Local support; response/proof; resolve; thử hai Documentation responses trên deal cũ; đi khỏi trang và quay lại | Cảnh báo local preserved nhưng bản chờ không xuất hiện khi cloud trả rỗng: F13. Cloud objections = 0. |
| 19 | Must-win work / Operating System | Priority, experiment hypothesis, expected result, decision Adjust, save | Báo local preserved, cloud operating_context = 0. Không xác nhận bền vững trên thiết bị khác. Currency field cố định SGD: F25. |
| 20 | Playbook / Assets | Mở, đọc điều kiện kích hoạt, quay lại sau thêm objection responses | Library còn bị khóa; F13 làm response không vào cloud/không được tính. Không sử dụng được generator/library internals, **không ghi đạt**. |
| 21 | Decision observation | Ghi quyết định trên deal cũ; thử observation trước ngày quyết định; sửa thời điểm và lưu | Trước cutoff bị chặn; observation hợp lệ tồn tại cloud và sau reload. Không suy diễn quyết định gây ra kết quả. |
| 22 | Evidence / condition / requirement | Ghi synthetic buyer budget proof; liên kết điều kiện; required now; đọc Supported/Met sau reload | Cloud có evidence 1, conditions 2, requirements 2. Nội dung giả lập không phải chấp thuận khách hàng thật. |
| 23 | Policy / incident | Tạo version 1; mở incident với coordinator; thêm bằng chứng làm requirement/policy met | Policy và incident có cloud; incident vẫn open cần xử lý của người dùng. Không thử đủ mọi chuyển trạng thái/phiên bản. |
| 24 | Timing / money gate | Potential gate 24.000 USD; duration 3 ngày; thử gắn với close target | Duration/gate lưu; gắn outcome với target chưa thành công trong ngữ cảnh period tháng. Contractual date logic chưa đạt. |
| 25 | Contract obligations | Mở mapping và kiểm tra các trường tham chiếu cần có | **Chỉ xem trước/bị chặn prerequisite**; không có accepted contract/version hoặc obligation được lưu. |
| 26 | Internal coordination | Ghi internal promise với coordinator, agreement ref giả lập; copy selected preview | Promise cloud tồn tại. Không gửi notification cho người khác. |
| 27 | External statement | Xem trước statement trên promise đã Mark kept; fictional parties/ref | Preview đọc được; không có completion proof/recipient acceptance. **Không issue, không nhận là contract hoặc acceptance.** |
| 28 | Shared access | Refresh invitation list; mở Manage sharing | 0 invitations; xem form. Không cấp quyền, không có acceptance hay kiểm tra hai owner mới trong vòng này. |
| 29 | Federation / cross-company | Thử preview theo canonical thread/exchange; xem dependency | Bị chặn vì không có canonical thread hoặc checked exchange. Không coi negative guard là giao dịch liên công ty đạt. |
| 30 | Protocol / trust capsule | Đưa schema không hợp lệ vào preview | Validation từ chối đúng; chưa có valid signed exchange hoặc roundtrip giữa hai công ty. |
| 31 | Settings account/billing/privacy | Đọc account, plan, preferences và privacy | Không mua gói, không đổi credentials, không thử toàn bộ email/reset authentication. |
| 32 | Currency / planning FX | USD → EUR, xem quy đổi; thử AFN thiếu rate; trả USD | EUR quy đổi đúng theo planning rates; AFN yêu cầu manual rate trước apply. USD cuối được backend xác nhận. Không kiểm chứng FX thị trường trực tiếp. |
| 33 | Sync/recovery/storage | Retry, đọc status, quota và storage collection | Trạng thái mâu thuẫn F12. Không coi Retry là upload thành công toàn bộ pending records. |
| 34 | Export / restore | Click UI export; authenticated `/api/export`; synthetic backup restore preview | API export complete 56 tables/1.400 rows. UI báo download nhưng công cụ không lấy được tệp; chưa kiểm tra ZIP/CSV mới. Restore **chỉ preview**, không replace workspace. |
| 35 | Founder import | Mở route và kiểm tra founder gate | Không khả dụng cho account QC thường. Account CSV paste import ở hàng 4 đã dùng; không tương đương founder full-workbook import. |
| 36 | Public funnel | Home, pricing, use cases, quiet/cash guides, boundaries, privacy/terms; request access empty validation | Trang đọc được; inline validation hoạt động; copy trial mâu thuẫn F23. Không submit request hay accept legal terms. |
| 37 | Mobile | 390×844: Money, Today, Search, More, Reports và builder | Chuyển màn hình/form dùng được trong phạm vi này; đã trả viewport mặc định. Không phải chứng nhận mọi breakpoint/WCAG hoặc mọi form. |
| 38 | Retired/deep links | Xem ownership của Activity/legacy defense routes | Activity thuộc Plan History/Review. Defense cũ không được tính là module đang hoạt động mới. |

Các thao tác còn chưa phủ: Dictate/microphone, offline/PWA và reconnect thật, native upload thay vì paste cho account CSV, đầy đủ opportunity CSV import qua các CRM mapping, valid federation/trust roundtrip, gửi webhook/email, multi-owner sharing, restore thực và Undo restore, thay mật khẩu, xóa tài khoản, billing checkout, toàn bộ generator/assets bị gate. Không chạy hành động bên ngoài chỉ để biến một hàng thành “pass”.

## 3. Đối chiếu dữ liệu 12 tháng

Authenticated API export trước/sau đều báo manifest complete, 56 tables. Export cuối lúc **2026-10-04T11:53:03Z**, 1.400 rows. Tính độc lập từ dữ liệu nguồn, không lấy số trên màn hình làm oracle:

| Chỉ tiêu | Giá trị USD |
|---|---:|
| Order value | 791.846,15 |
| Recorded receipts | 441.384,62 |
| Outstanding, có chặn âm theo order | 359.076,92 |
| Landed cost | 532.176,92 |
| Gross margin của order | 259.669,23 |

Planning FX của workspace: USD = 1, EUR = 1,1538461538461537 USD, SGD = 0,7692307692307693 USD; ngày rate 01/08/2026. Assertions chấp nhận sai số dưới 0,02 USD và đạt. Gross margin không phải realized accounting profit. Thu vượt 1.000 USD của order mới khiến `order − receipts` toàn cục khác outstanding đã chặn âm; đây là kết quả đúng trong fixture này.

96 báo giá cũ giữ các trường tiền; 48 receivables và 48 cost records giữ dữ liệu tài chính; 96 cơ hội cũ giữ giá trị và stage/status. **Không khẳng định payload byte-for-byte bất biến**: normalizer đổi 48 PO status `Not received → Pending`, 48 delivery status `Not started → Not scheduled`, 96 discount và grossMarginEstimate từ thiếu sang null. Các thay đổi đó được ghi riêng trong integrity evidence.

Cloud cuối: 27 accounts raw (UI còn 26 vì bản merge của hai fixture chưa được Undo bền vững), 97 opportunities, 97 quotes, 49 receivables với **74 receipts**, 49 costs, 390 activities, 1 stakeholder, 0 objections, 5 plan items, 3 commitments, 1 decision, 1 decision observation, 1 evidence, 1 policy, 1 incident, 1 timing assertion, 2 money gates, 1 supplier commitment, 1 target, 1 knowledge note, 100 portfolio records, 3 report definitions, 2 dashboards, 524 state revisions, 1 account merge. Product QC active version 3; dashboard/report QC được restore.

Hai fixture import không có deal hoặc financial records. Bản merge còn trên cloud được giữ làm bằng chứng F26; không sửa trực tiếp backend để che lỗi. Reporting currency cuối là USD.

## 4. Phát hiện và điều kiện đóng lỗi

P1: chặn độ tin cậy của dữ liệu/luồng cốt lõi; P2: sai ngữ nghĩa, kết nối hoặc khả năng sử dụng có tác động đáng kể; P3: copy/nhãn/ngữ cảnh cần chỉnh. Severity là đánh giá sản phẩm trong hành trình đã chạy, không phải kết luận exploit bảo mật.

### F10 — P1 — Today/Review không dùng cùng sự thật về receipts

**Tái hiện:** dùng workspace có 74 receipts; xem Money Collections/Orders, report, dashboard rồi Today và Review Analytics. Collections và order mới tính 29.000 đã thu/0 còn nợ; tổng backend đã thu 441.384,62. Today Money in motion vẫn có 48 Pending payment/763,8K và không có Paid; Review Analytics ghi collected revenue 0, “Cash actually received”, “Nothing marked collected yet” trong khi cùng màn hình đã nhận won 791,8K. Account Atlas cũng còn PO follow-up sau milestones được ghi xong.

**Tác động:** người bán có thể chase khoản đã thu hoặc ra quyết định từ số collected = 0. Không dùng gross margin thay cho accounting profit khi sửa. Money at risk có trạng thái đã tải đúng 24 overdue; những số 48/92 quan sát khi tải chưa ổn định **không được dùng làm lỗi độc lập**.

**Hướng sửa/acceptance:** Today, account loop, Analytics và digest phải đọc canonical receipt/order state; thể hiện rõ kỳ và định nghĩa cash. Fixture này cho tổng receipts 441.384,62, order QC collected/0 outstanding nhất quán; skeleton/loading không trình bày số trung gian như kết quả hoàn chỉnh. Source entry: `src/features/reviews/ReviewAnalyticsSection.tsx` (model đang nhận quotes/expenses), `src/features/dashboard/TodayPicture.tsx` và money models cần rà tiếp.

**Bằng chứng:** [Today](../../.audit/full-product-user-2026-10-04/screenshots/02-today-money-disagreement.jpg), [Analytics DOM](../../.audit/full-product-user-2026-10-04/dom/64-analytics-year.txt), [dashboard drill đúng](../../.audit/full-product-user-2026-10-04/dom/218-dashboard-drill.txt), [account loop](../../.audit/full-product-user-2026-10-04/dom/199-account-detail-controls.txt).

### F11 — P1 — Chọn khách hàng chỉ lưu tên, mất canonical account ID

**Tái hiện:** tạo lead QC-R4, qualify, tạo/chọn Atlas trong form rồi save; backend opportunity có `account_id = null` dù tên hiển thị Atlas. Save Decision báo “Opportunity does not belong to this workspace”; Policy báo Policy/Requirement phải thuộc opportunity/workspace. Trên deal cũ có account ID, cùng chức năng lưu và reload được.

**Tác động:** khách hàng mới bị chặn ngay khi dùng quyết định có bằng chứng, dù record có vẻ liên kết đúng. Không diễn giải thành lỗi authorization xuyên owner.

**Hướng sửa/acceptance:** picker giữ ID+tên từ lựa chọn; resolve/backfill trong owner scope khi record cũ chỉ có tên, yêu cầu chọn nếu trùng. Luồng lead mới → account → condition/requirement → decision/policy phải lưu cloud và qua reload. Source: [OpportunitiesPage.tsx](../../src/features/opportunities/OpportunitiesPage.tsx), `onPick` khoảng 3137 hiện chỉ `update('accountName', name)`.

**Bằng chứng:** [lỗi decision](../../.audit/full-product-user-2026-10-04/screenshots/16-decision-owner-error.jpg), DOM [31](../../.audit/full-product-user-2026-10-04/dom/31-decision-retry.txt), [đối chứng deal cũ](../../.audit/full-product-user-2026-10-04/dom/131-kernel-reload.txt), export cuối.

### F12 — P1 — Retry sync báo thành công khi vẫn sync-failed

**Tái hiện:** Settings → Sync & recovery → Retry sync. Cùng region có `sync-failed`, “Cloud sync is unavailable”, unsynced changes và “Synced. Your workspace is up to date.”; header vẫn Sync issue.

**Tác động:** người dùng tin dữ liệu đã lên cloud rồi đổi thiết bị/đóng browser; pending objections/operating context chưa có trong export.

**Hướng sửa/acceptance:** loader trả kết quả từng collection; upload pending và xác nhận cloud trước khi recordSuccessfulSync. Partial failure không cập nhật last successful sync hay thông báo up to date. Source: [SyncRecoveryPanel.tsx](../../src/features/settings/SyncRecoveryPanel.tsx), khoảng 53–56.

**Bằng chứng:** [ảnh mâu thuẫn](../../.audit/full-product-user-2026-10-04/screenshots/22-sync-contradiction.jpg), [DOM Retry](../../.audit/full-product-user-2026-10-04/dom/82-sync-retry-result.txt).

### F13 — P1 — Objection được giữ local nhưng biến khỏi luồng đọc và không có recovery hữu dụng

**Tái hiện:** tạo objection và response, nhận “Cloud sync issue — your local copy is preserved”; thử cả Atlas mới và EU Buyer 23 cũ với hai Documentation responses; đi khỏi trang/reload. List có 0, cloud export có 0. Library không nhận đủ repeated response nên vẫn khóa. Operating System cũng báo local preserved, cloud 0; chưa kết luận cùng nguyên nhân insert.

**Tác động:** tri thức vừa ghi không tìm lại được trong product; người dùng không biết bản nào đang chờ và không thể dùng nó để tạo asset. Không khẳng định localStorage đã bị xóa vật lý.

**Hướng sửa/acceptance:** pending records theo owner phải được merge vào read path khi cloud trả []; có trạng thái/retry từng record và lỗi gốc có thể xử lý. Chọn account/deal phải gắn ID, không chỉ datalist tên. Phải chẩn đoán insert failure từ response thực, không tạo migration theo phỏng đoán. Đã đọc riêng 11 cột objections thành công; **không có bằng chứng missing column là nguyên nhân**. Source: [objectionStore.ts](../../src/services/objectionStore.ts), loadObjections hiện ưu tiên cloud hoàn toàn khi query thành công.

**Bằng chứng:** [cảnh báo local](../../.audit/full-product-user-2026-10-04/screenshots/35-objection-local-failure.jpg), [Library bị chặn](../../.audit/full-product-user-2026-10-04/screenshots/36-library-blocked-after-repeated-responses.jpg), DOM [193](../../.audit/full-product-user-2026-10-04/dom/193-objection-old-save-finished.txt), [195](../../.audit/full-product-user-2026-10-04/dom/195-objection-second-result.txt), schema-read evidence.

### F14 — P1 — Forecast dồn lịch sử vào quý hiện tại

**Tái hiện:** đặt Q4 FY2026 target 100.000 USD. UI ghi 791,8K won + 75K evidence-backed = 867% target; Q1–Q3 không có phần phân bổ tương ứng. Won cũ thuộc 10/2025–09/2026, expected close periods dạng `YYYY-MM`; đổi EUR chỉ quy đổi đúng cùng phép phân quý sai.

**Tác động:** cảnh báo “quý đã đủ” sai, che thiếu hụt cần bù. Source xác nhận fallback currentQuarter khi period không chứa `Q1..Q4`; trục năm/fiscal year cũng phải kiểm tra khi sửa.

**Hướng sửa/acceptance:** resolve tháng/ngày/năm tài chính trên cùng trục với target; không đưa undated hoặc prior-year won vào quý hiện tại mặc định. Q4 chỉ chứa các record thực sự thuộc Q4; missing date/FX phải hiện riêng. Source: [forecast.ts](../../src/domain/commercialKernel/forecast.ts), khoảng 182–191.

**Bằng chứng:** [ảnh 867%](../../.audit/full-product-user-2026-10-04/screenshots/26-quarter-target-all-orders.jpg), [DOM có target và kết quả](../../.audit/full-product-user-2026-10-04/dom/143-money-folds.txt).

### F15 — P2 — Capture sửa loại meeting nhưng summary/type cuối bị keyword delivery lấn

**Tái hiện:** ghi meeting có nhắc lead time, sửa type thành Customer meeting; preview còn mô tả delivery/fulfillment và kết quả lưu không theo lựa chọn mong muốn. Quick Capture chọn meeting rõ ràng là đối chứng hoạt động.

**Acceptance:** lựa chọn thủ công là quyết định cuối, parser không ghi đè khi save; summary và persisted activity cùng một type. Kiểm tra ghi chú có “delivery in 3 weeks” trong nội dung cuộc gặp.

**Bằng chứng:** [preview](../../.audit/full-product-user-2026-10-04/screenshots/05-capture-preview.jpg), [activity history](../../.audit/full-product-user-2026-10-04/dom/109-plan-history.txt).

### F16 — P2 — Capture link/fact review không phản ánh rõ sự mơ hồ và thao tác Unlink

**Tái hiện:** chỉ tên customer có nhiều deals nhưng draft đã chọn một deal/high confidence; summary còn yêu cầu chọn deal. Unlink vẫn giữ tên deal trong phần legacy; chọn value fact rồi save trả kết quả một thành công/một thất bại, chưa hướng dẫn recovery từng fact đủ rõ.

**Acceptance:** không tự xác nhận exact deal khi chỉ biết customer; Unlink xóa cả ID/display link; each fact giữ pending/failure state và retry không nhân đôi; không đổi giá trị deal khi người dùng chưa accept fact. Đối chiếu tiền deal gốc không đổi trong lần này là điểm đạt.

**Bằng chứng:** [partial facts](../../.audit/full-product-user-2026-10-04/screenshots/06-capture-partial-facts.jpg), [raw capture saved ở history](../../.audit/full-product-user-2026-10-04/dom/109-plan-history.txt).

### F17 — P2 — Task Done và promise Kept tách trạng thái nhưng copy khiến người dùng tưởng đã đóng cả hai

**Tái hiện:** đánh Done cho việc gửi proposal trong Plan, progress 100%; commercial promise tương ứng vẫn open và cần Mark kept riêng. Luồng tạo/dời/Mark kept trực tiếp hoạt động.

**Đánh giá:** hai loại trạng thái có thể hợp lý; lỗi nằm ở nghĩa và handoff chưa rõ, không phải phép tính progress. Acceptance: giải thích hoàn thành task có/không fulfill promise; cho xác nhận fulfill với evidence ngay cùng thao tác; Review chỉ tính promise thực đã hoàn thành.

**Bằng chứng:** [Done nhưng promise open](../../.audit/full-product-user-2026-10-04/screenshots/08-plan-completed-commitment-open.jpg), [DOM](../../.audit/full-product-user-2026-10-04/dom/10-plan-dual-promise.txt).

### F18 — P2 — Lịch 12 tháng bị hàng trăm overdue/carry-over lấn công việc hiện tại

**Tái hiện:** Plan week/month có khoảng 373 việc cũ; overdue/carry-over hàng trăm mục (checkpoint thấy 384 overdue/408 carried over). Việc mới khó tìm, lại trùng vai trò queue ưu tiên của Today.

**Acceptance:** lịch mặc định hiện công việc kỳ chọn; backlog gom nhóm/có filter và xử lý hàng loạt an toàn, không âm thầm xóa lời hứa. Người vận hành tìm và hoàn thành việc tuần mới mà không duyệt cả năm. Đây là lỗi scale/UX, không khẳng định dữ liệu trùng do insert bug.

**Bằng chứng:** [lịch tuần](../../.audit/full-product-user-2026-10-04/screenshots/07-plan-next-week.jpg), [DOM](../../.audit/full-product-user-2026-10-04/dom/07-next-week.txt).

### F19 — P2 — Coverage không nhận phân loại catalog đã duyệt

**Tái hiện:** Atlas/deal mới được gắn SenseWorks + product; report group SenseWorks có order 28.000. Coverage vẫn nói Atlas chưa từng được offered SenseWorks và relationship “—”.

**Acceptance:** mọi surface đọc accepted ID-linked classification; giữ original brand text làm provenance, không dùng nó thay phân loại đã xác nhận. Source: [coverageMatrix.ts](../../src/utils/coverageMatrix.ts) hiện dùng `opportunity.brand`.

**Bằng chứng:** [Coverage](../../.audit/full-product-user-2026-10-04/screenshots/14-account-coverage.jpg), [report group đúng](../../.audit/full-product-user-2026-10-04/dom/56-qc-grouped-report.txt), [Coverage DOM](../../.audit/full-product-user-2026-10-04/dom/75-coverage.txt).

### F20 — P2 — “Touched”/“going silent” dùng các mốc thời gian khác nhau

**Tái hiện:** Vault coi US Buyer 07 touched trong hai tuần gần đây trong khi rhythm ghi contact 79 ngày; Today mobile có Going silent 0 dù open deals có lịch sử im lặng dài. Edit/import recency có thể giải thích khác biệt, nhưng nhãn chưa phân biệt nó với tương tác khách hàng.

**Acceptance:** tách Last record updated và Last customer interaction; cảnh báo silence dùng cùng định nghĩa hoạt động thật ở Today/Review/Vault, ghi scope nếu subset khác. Không suy diễn record sửa hôm nay nghĩa là buyer đã phản hồi.

**Bằng chứng:** DOM [72 Vault](../../.audit/full-product-user-2026-10-04/dom/72-vault.txt), [71 Rhythm](../../.audit/full-product-user-2026-10-04/dom/71-rhythm-drill.txt), [149 Today mobile](../../.audit/full-product-user-2026-10-04/dom/149-mobile-search-dialog.txt).

### F21 — P2 — Search → Ask làm mất query

**Tái hiện:** search QC-R4 → Ask link đi tới `/app/ask?q=QC-R4`; textbox trống. Ask đọc `question`, không đọc `q`.

**Acceptance:** một contract query chung; giữ câu hỏi và context khi chuyển, test với escaped text/multiword; không auto-send bên ngoài. Source: [GlobalSearch.tsx](../../src/components/layout/GlobalSearch.tsx) và [AskMemoirePage.tsx](../../src/features/v31/AskMemoirePage.tsx), khoảng 78/485.

**Bằng chứng:** DOM [65 Search](../../.audit/full-product-user-2026-10-04/dom/65-global-search-qc.txt), [66 Ask](../../.audit/full-product-user-2026-10-04/dom/66-ask-qc.txt).

### F22 — P2 — Ask ngoài phạm vi trả summary thay cho thông báo giới hạn; draft thiếu nền tảng rõ ràng

**Tái hiện:** hỏi về luật thuế Đức 2027 nhận summary workspace không trả lời intent. Follow-up draft nhắc recent conversation trong ngữ cảnh chưa có recorded interactions ở thời điểm thử.

**Acceptance:** unsupported intent báo phạm vi và gợi ý câu hỏi dùng được; draft chỉ nêu interaction/commitment có source, hoặc ghi rõ mẫu chưa có bằng chứng. Không đánh giá đây là bịa thông tin luật thuế; answer không đưa luật thuế cụ thể.

**Bằng chứng:** DOM [68 ngoài phạm vi](../../.audit/full-product-user-2026-10-04/dom/68-ask-outside-scope.txt), [69 draft](../../.audit/full-product-user-2026-10-04/dom/69-ask-followup.txt).

### F23 — P2 — Funnel công khai mâu thuẫn về trial và điều kiện dùng Library

**Tái hiện:** Home/Pricing ghi free preview không trial clock; Use cases vẫn “Start your 7-day trial”; Request access nói trial starts. Copy “nothing held back” cần đọc cùng Library activation gate nhưng chưa làm kỳ vọng người mới rõ ràng.

**Acceptance:** pricing, use cases, access và onboarding dùng cùng entitlement; phân biệt activation do cần dữ liệu với paywall/trial. Không tự thay chính sách thương mại từ audit.

**Bằng chứng:** DOM [168 Pricing](../../.audit/full-product-user-2026-10-04/dom/168-public-pricing-ready.txt), [186 Use cases](../../.audit/full-product-user-2026-10-04/dom/186-public-usecases-ready.txt), [175 Access](../../.audit/full-product-user-2026-10-04/dom/175-public-request-ready.txt).

### F24 — P3 — “Show archived reports” thực tế chỉ hiện archived

**Tái hiện:** archive rồi restore report, checkbox còn checked → thư viện rỗng; uncheck hiện lại report active version 3. **Không mất report.**

**Acceptance:** đổi nhãn thành Archived only, hoặc include archived đúng với Show archived; sau restore chọn/report được nhìn thấy. [Bằng chứng DOM](../../.audit/full-product-user-2026-10-04/dom/162-report-active-after-restore.txt).

### F25 — P3 — Value at stake cố định SGD trong workspace USD

**Tái hiện:** Operating System priority field dùng SGD dù reporting currency USD; không nhập stake tiền trong lần này nên không có bằng chứng quy đổi sai đã lưu.

**Acceptance:** chọn currency rõ ràng hoặc theo workspace, lưu currency theo record; giữ missing amount missing. [Bằng chứng DOM](../../.audit/full-product-user-2026-10-04/dom/78-operating-system.txt).

### F26 — P1 — Undo merge không đi tới cloud, bản gộp hồi sinh sau reload

**Tái hiện:** nhập hai account mới `Import Fixture`/`Import Fixture Ltd`; Keep this name → list 1; Undo → list 2, suggestion trở lại. Export sau Undo vẫn có account_merges payload đang active, không `__deleted`. Reload Accounts → list còn 1, “Merged names” có 1 alias. Hai account raw vẫn có trong cloud, không bị xóa.

**Tác động:** lời hứa “nothing deleted / undo below” không đảm bảo recovery bền vững. Gộp nhầm customer có thể trở lại mà người dùng không biết.

**Nguyên nhân được source hỗ trợ:** [accountMergeStore.ts](../../src/services/accountMergeStore.ts) `deleteAccountMerge` lọc bản local rồi persist; sync generic chỉ upsert các records còn lại, không gửi tombstone/delete cho record đã bỏ. Cloud record cũ thắng ở lần load sau. Cần dùng owner-scoped deletion/tombstone có retry và xác nhận, không chỉ remove khỏi array.

**Acceptance:** merge → wait cloud → Undo → cloud tombstone/deleted → reload/second session vẫn có hai account độc lập; hoạt động/deal IDs giữ nguyên. Lỗi khi Undo phải hiển thị pending/recovery chứ không báo xong.

**Bằng chứng:** [hai tên sau Undo trong phiên](../../.audit/full-product-user-2026-10-04/screenshots/38-account-merge-undone.jpg), [hồi sinh sau reload](../../.audit/full-product-user-2026-10-04/screenshots/41-merge-undo-reverted.jpg), DOM [209](../../.audit/full-product-user-2026-10-04/dom/209-account-merged.txt), [210](../../.audit/full-product-user-2026-10-04/dom/210-account-merge-undone.txt), [219](../../.audit/full-product-user-2026-10-04/dom/219-merge-undo-after-reload.txt), export cuối.

## 5. Giá trị sản phẩm, dư thừa và thiếu hụt

**Giá trị mạnh nhất hiện có:** chuỗi một account/deal → evidence/requirement → action/promise → receipt/cost → grouped report → dashboard drill. Trên deal có canonical ID, kernel giữ được quyết định, quan sát, policy và bằng chứng sau reload. Report/dashboard công khai source, planning FX, missing context và thời điểm refresh giúp người bán tự đối chiếu. Overpayment guard không âm thầm coi thu vượt là sai số.

**Dư thừa gây chi phí sử dụng:** Today/Plan/Review cùng xếp việc cần làm nhưng không thống nhất queue và completion; raw brand/Coverage và catalog classification cùng mô tả portfolio nhưng đưa hai câu trả lời; quote payment statuses và canonical receipts cùng mô tả cash nhưng lệch. Không cần thêm một module để giải quyết những điểm này: cần thống nhất nguồn và nói rõ câu hỏi mỗi destination trả lời.

**Thiếu hụt cốt lõi:** pending-write ledger có thể đọc/retry từng record; liên kết ID từ lúc tạo lead/account; trục period/fiscal year chung; trạng thái promise có evidence completion; backlog có giới hạn và recovery được xác nhận trên cloud. Đây là các nền tảng khiến tính năng hiện có mang nghĩa đáng tin, cần ưu tiên trước mở thêm surface.

**Complexity chưa chứng minh được giá trị trong tài khoản thường:** Federation, trust/protocol, contract mapping và external statement có nhiều prerequisite/reference; UI review nhưng không có canonical thread/exchange để hoàn thành một vòng. Nên giải thích bước cần có bằng ngôn ngữ business và trình bày theo ngữ cảnh. Audit này chưa chứng minh nên xóa chúng; chưa đủ bằng chứng để quảng bá chúng như end-to-end đã đạt.

**Library gate:** cần dữ liệu trước khi tạo bài học là có lý do; cần cho người dùng thấy metric kích hoạt, nguồn record đang được tính và bước tiếp. Objection sync hỏng hiện biến gate thành ngõ cụt dù người dùng đã ghi response.

## 6. Những quan sát chưa được nâng thành lỗi xác nhận

- Restore preview trên backup tổng hợp format 18 đếm 1.839 records/46 stores, có hai tên history collection tương tự nhau. Chưa có restore thật hoặc tệp export UI mới, nên chỉ là candidate double-count trong preview.
- Forecast có đường fallback raw amount khi không có rate trong source; runtime thử AFN đã chặn apply đúng. Không ghi thành lỗi FX thất bại trên flow đã thử.
- Mobile mở welcome guide lại sau dùng tab mới. Có thể marker theo tab/session; chưa đủ chứng minh onboarding mất dữ liệu.
- Một deal Lost → reopen → Won xuất hiện cả 1 Lost và 1 Won trong tuần. Đó có thể là hai outcome episodes hợp lệ; cần chỉnh định nghĩa “deals” nếu metric đếm episodes, không kết luận 50% là phép tính sai.
- DOM trạng thái loading Collections có outstanding toàn bộ order trước khi receipts được tải; kết quả đã ổn định đúng. Cần loading UX, không dùng snapshot này để nói settled money conversion sai.
- Objection insert failure vẫn cần chẩn đoán nguyên nhân. Read schema đạt không chứng minh write permission/validation/trigger đạt.
- Không có security exploit xác nhận mới; không seal security draft cũ hoặc chứng nhận owner isolation từ test một owner. API export owner guard dùng để giữ đúng fixture, không thay cho negative access test.

## 7. Thứ tự sửa và cổng test lại

1. **Dữ liệu tin cậy:** F11 account ID; F13 pending write và nguyên nhân insert; F12 sync success. Test trên account mới và account cũ, cloud error/retry, reload và phiên thứ hai. Không thay schema shared Supabase trước khi xác định lỗi gốc.
2. **Tiền và thời gian:** F10 canonical receipts; F14 period/fiscal year. Dùng oracle 12 tháng ở mục 3 và fixture Q4 riêng; test đa tiền tệ, partial receipts, overpayment, missing date/rate, previous fiscal year.
3. **Recovery:** F26 Undo merge bền vững; giữ mọi original account/deal/activity, kiểm tra cloud failure/retry/tombstone.
4. **Handoff và scale:** F15–F20; test cùng một ghi chú qua Capture → Plan → promise → Review và cùng classification qua Coverage → Reports.
5. **Query và copy:** F21–F25; Search → Ask, unsupported intent, archive label, currency scope và trial copy theo entitlement hiện hành.

Chỉ đóng mỗi phát hiện khi có regression phù hợp và thao tác Production trên đúng SHA đã phát hành. Trước khi kết luận “đã dùng toàn bộ tính năng”, cần chạy thêm các hàng bị gate/prerequisite và kiểm chứng các hành động chưa thực hiện được nêu tại mục 2; không thay trạng thái Preview/Blocked thành Pass chỉ vì trang có thể mở.
