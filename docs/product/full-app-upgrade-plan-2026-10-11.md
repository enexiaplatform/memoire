# Memoire — kế hoạch tối ưu và nâng cấp toàn app

Ngày: 11/10/2026. Trạng thái: **24/24 sửa đổi đã phát hành; CI master đạt, production READY và live QC có bằng chứng. Email Digest tạm hoãn theo yêu cầu người dùng.**

Baseline hiện tại: `545b27b779260d7425729820334ef486cca33a4f`; 24 điểm vòng 2 (4 P1, 12 P2, 8 P3), 17 nhóm tính năng, 73 ảnh hợp lệ và 249 checks có sẵn của lần audit. Các số này là bằng chứng audit đã lưu, không phải kiểm tra mới trong lần lập plan.

## Quyết định sản phẩm

Ưu tiên một lần ghi dữ liệu, khôi phục đúng context và hành động đúng lúc, theo positioning hiện tại của Memoire. Hoàn thiện các shared calculations, identity và handoff trong 10 khu vực đã có. Toàn bộ 24 điểm nằm trong phạm vi, cùng Brand durability và các khoảng trống runtime đã ghi nhận.

Giữ các phần đã đạt vòng trước: catalog ID/Others validation, partial receipts, confirmed/planned date basis, owner/sample isolation và captured-run report metadata. Các tài liệu kiến trúc cũ có dòng pending deployment chỉ dùng để hiểu contract; trạng thái release phải đối chiếu bằng chứng mới hơn.

## Các nguyên tắc phải giữ

- Brand phải là một liên kết catalog còn hợp lệ hoặc Others kèm tên nhập tay. Không tạo Brand mới âm thầm từ text; giữ tên gốc và lịch sử phân loại.
- Paid/partial/outstanding lấy từ receipt ledger và cùng FX basis. Won/quoted/committed không được trình bày như cash.
- Dữ liệu thiếu giữ unknown; zero chỉ dùng khi số zero đã được ghi. Ngày planning và ngày xác nhận là hai loại bằng chứng.
- Một scope dùng chung định nghĩa population, thời kỳ và nguồn ngày ở cả UI/report/export. Rename/retire không làm đổi record identity.
- Capture và lời khuyên là đề xuất có căn cứ; không tự xác nhận PO, buyer role, stage hoặc commercial outcome.
- Link giữa các màn hình giữ entity ID và filter. Người dùng có đường Back, missing-record state và recovery khi save/sync thất bại.
- Owner/sample isolation, history và backup tiếp tục là giới hạn bắt buộc. Giữ 10 khu vực điều hướng hiện tại.

## Sáu đợt triển khai

| Đợt | Kết quả cần đạt | Các điểm | Điều kiện chuyển đợt |
|---|---|---|---|
| 1. Số tiền đúng, Capture đúng | Cùng một khoản thu hoặc mục tiêu có cùng ý nghĩa ở mọi màn hình; ghi chú tiếng Việt giữ đúng phủ định và hạn của từng việc. | R2-01, R2-02, R2-04, R2-03, R2-13 | Cả 4 P1 và lỗi unknown thành zero đạt ca tái hiện mới; các màn hình dùng chung nguồn tính. Chỉ sửa Quote không phát sinh receipt. |
| 2. Brand và khách hàng có liên kết bền vững | Mỗi Brand trên Lead/Opportunity trỏ tới catalog hoặc Others có tên manual; đổi trang vẫn giữ đúng khách và đúng deal. | R2-07, R2-08, R2-09, R2-05, R2-18 | Không có record mới được báo lưu hoàn tất khi thiếu Brand assignment. Ca lỗi lưu, offline, đổi owner và retry đạt; danh sách bản ghi cũ cần sửa được đối soát. |
| 3. Các gợi ý và việc hằng ngày có căn cứ | Ask nhận được câu hỏi do app gợi ý; Leads dùng tiêu chí của Leads; vai trò người mua hiện đúng mức xác nhận; Plan thấy hôm nay. | R2-11, R2-10, R2-14, R2-16 | Tất cả suggested questions có handler và customer scope. Không có lời khuyên từ khách khác trong unsupported fallback; Plan cuối tuần giữ đúng ngày. |
| 4. Review, Reports và Money dễ đối soát | Một kỳ review có một tập kết quả; danh sách đòi tiền chỉ rõ khoản cần xử lý; CSV/PDF và nguồn Dashboard giải thích được. | R2-06, R2-12, R2-15, R2-23, R2-17, R2-19 | Review 3 màn hình khớp cùng kỳ/cùng scope; default presets in được; valid/non-zero/missing phân biệt; sửa cost luôn thấy order. |
| 5. Đăng ký, phục hồi và nội dung sản phẩm chính xác | Verify không nói đã gửi email khi chưa có yêu cầu hợp lệ; form có links và password controls; public copy mô tả đúng cash và sharing. | R2-20, R2-22, R2-24, R2-21 | Direct link/refresh/resend không mất đường phục hồi. Nội dung public không mô tả retired flow như đang hoạt động; rights được kiểm tra bằng hai account test. |
| 6. Độ bền dữ liệu và nghiệm thu toàn app | Đóng các khoảng trống về cloud, FX, restore, permissions và gửi thông báo; phát hành có bằng chứng. | C1/C2/D1/D2 và nghiệm thu toàn app | Các mục C1/C2/D1/D2 có kết luận riêng; 17 nhóm tính năng có acceptance matrix; checks, CI và live smoke đạt trên đúng commit phát hành. |

Thứ tự phụ thuộc: đợt 1 → đợt 2 → đợt 3 → đợt 4 → đợt 5 → nghiệm thu đợt 6. Chuẩn bị môi trường auth/cloud và spike C1/C2/D1 từ đầu để tránh dồn blocker vào cuối. Mỗi đợt đi từng phần, có checkpoint riêng.

S/M/L là độ lớn tương đối: S chủ yếu UI/copy; M có shared logic hoặc một flow; L nhiều màn hình/semantics/persistence. Không cam kết ngày hoàn tất từ nhãn này. Cần chốt thiết kế persistence Brand, FX và phạm vi provider trước khi ước lượng lịch triển khai.

## Thiết kế riêng cho yêu cầu Brand

1. Intake chọn Brand từ catalog; Others phải có tên manual. UI tạo/sửa Lead, Opportunity, Capture và import cùng đi qua validation dùng chung. Không tạo catalog entry từ spelling chưa xác nhận.
2. Lưu original brand text riêng với classification/assignment. Alias/rename giữ stable ID; retired không được chọn cho record mới nhưng lịch sử vẫn đọc đúng.
3. Bản ghi lưu có kết quả rõ: đã lưu và liên kết / đang chờ hoàn tất liên kết / bị từ chối. Không dùng warning nhỏ rồi xem record thiếu link là hoàn tất.
4. Kiểm chứng lỗi ở giữa hai lần ghi. Chọn transaction nếu có thể; nếu dùng journal phải bền vững theo owner và command ID, có retry/repair không trùng. Pending phải tồn tại qua reload và được hoàn tất trước khi đóng yêu cầu này.
5. Rà dữ liệu cũ: catalog exact/verified aliases, assignment bị thiếu, original text khác, Others. Preview mappings rồi sửa liên kết; tên chưa giải quyết được chuyển vào Others kèm tên gốc sau review. Không fuzzy-match tự động.
6. Catalog cho All links/Leads/Qualified/Closed và xem từng record nguồn. Coverage lấy active Brands từ catalog, không chỉ Brand xuất hiện trên deal.
7. Hoàn tất khi cả record mới và record cũ trong phạm vi cleanup có assignment hợp lệ, report count giải thích được và fault injection đạt.

## Backlog triển khai đủ 24 điểm

### Đợt 1: Số tiền đúng, Capture đúng

Bắt đầu ngay từ bộ fixture vòng 2. Chốt ý nghĩa Paid và quy tắc ngày trước khi sửa giao diện.

#### R2-01 · P1 · Quote có thể ghi Paid khi chưa có tiền thu

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Giữ trạng thái thu tiền là phép suy ra từ ledger. Quote Paid cũ không có receipt chuyển sang cần đối soát, vẫn giữ dấu vết khai báo; không dựng khoản thu thay thế.

**Điều kiện đạt:** Không receipt: mọi màn hình đều chưa thu. Thu một phần: mọi màn hình cùng số dư. Thu đủ hoặc hoàn tiền: quote, Orders, Collections, Today và Reports cùng trạng thái; không tạo receipt ngầm khi chỉ sửa quote.

**Kiểm chứng:** Unit về projection tiền + browser từ Today/Quote/Orders/Collections.

**Nguồn:** [src/utils/commercialFulfillment.ts:23](<E:/Antigravity project/Memoire/src/utils/commercialFulfillment.ts:23>), [src/utils/revenueView.ts:157](<E:/Antigravity project/Memoire/src/utils/revenueView.ts:157>), [src/features/quotes/QuotesPage.tsx:500](<E:/Antigravity project/Memoire/src/features/quotes/QuotesPage.tsx:500>).

#### R2-02 · P1 · Ask tính tiền chưa thu bằng giá trị gốc, bỏ qua thu một phần

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-01.

**Sửa:** Ask đọc cùng outstanding engine; gross commitment là chỉ số riêng. Giữ reporting currency, FX basis, unknown và số đếm excluded.

**Điều kiện đạt:** Receipt 100 triệu VND làm mọi câu trả lời về outstanding giảm đúng 3.846,15 USD. Kiểm tra receipt nhiều loại tiền, thiếu FX và receipt trùng; số thiếu phải giữ unavailable.

**Kiểm chứng:** Đối chiếu Ask, Collections, Report CSV và Dashboard sau từng receipt.

**Nguồn:** [src/utils/orderToCash.ts:430](<E:/Antigravity project/Memoire/src/utils/orderToCash.ts:430>), [src/features/v31/askMemoireInsightAnswers.ts:188](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts:188>), [src/features/v31/askMemoireInsightAnswers.ts:663](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts:663>).

#### R2-04 · P1 · Scoreboard bỏ currency của mục tiêu doanh số

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Giữ currency trên target đầu vào; đổi tiền trước cộng. Thiếu currency/rate làm tỷ lệ và gap chưa tính được, kèm danh sách nguồn thiếu.

**Điều kiện đạt:** VND, USD, SGD và mục tiêu pha nhiều currency quy đổi nhất quán với Money/forecast. Chuyển reporting currency không đổi mức đạt thực chất. Mục tiêu thiếu currency/rate báo chưa tính được, không thành 0%.

**Kiểm chứng:** Unit các target VND/USD/SGD/mixed; đổi reporting currency và kiểm tra attainment.

**Nguồn:** [src/utils/outcomeScoreboard.ts:143](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:143>), [src/utils/outcomeScoreboard.ts:290](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:290>), [src/services/commercialKernel/targetStore.ts:11](<E:/Antigravity project/Memoire/src/services/commercialKernel/targetStore.ts:11>).

#### R2-03 · P1 · Capture tiếng Việt hiểu sai phủ định PO và gắn nhầm hạn của hai việc

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Tách mệnh đề trước khi gắn ngày/tín hiệu; dùng clock/timezone truyền vào. Preview vẫn yêu cầu người dùng xác nhận các thay đổi quan trọng.

**Điều kiện đạt:** Ca ghi chú giữ PO chưa xác nhận; đề xuất riêng gửi báo giá 13/10 và gọi lại 20/10. Thử thêm không, chưa, hủy, có thể, nếu, tuần sau, ngày tháng và hai khách trong một ghi chú. Không tự nâng stage hay xác nhận bằng chứng.

**Kiểm chứng:** Bộ câu Việt/Anh có phủ định, giả định, hai hành động và hai khách; preview/save/reload/Plan.

**Nguồn:** [src/utils/salesActivityClassifier.ts:575](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:575>), [src/utils/salesActivityClassifier.ts:723](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:723>), [src/utils/salesActivityClassifier.ts:680](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:680>).

#### R2-13 · P2 · Nudge biến giá trị chưa biết thành 0 USD

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Giữ nullable amount qua projection và nudge; giá trị zero thật khác chưa ghi/thiếu FX. Ưu tiên rủi ro vẫn hoạt động mà không bịa tiền.

**Điều kiện đạt:** Amount trống không render 0; amount zero thực vẫn render 0 và được phân biệt. Missing FX không biến thành cash zero hoặc mất record.

**Kiểm chứng:** Today priority/nudge/Ask với null, 0, positive và FX unavailable.

**Nguồn:** [src/utils/revenueView.ts:231](<E:/Antigravity project/Memoire/src/utils/revenueView.ts:231>), [src/utils/proactiveNudges.ts:219](<E:/Antigravity project/Memoire/src/utils/proactiveNudges.ts:219>), [src/utils/proactiveNudges.ts:210](<E:/Antigravity project/Memoire/src/utils/proactiveNudges.ts:210>).

### Đợt 2: Brand và khách hàng có liên kết bền vững

Kiểm chứng C2 trước thiết kế đường lưu; sửa Account identity và handoff trước Coverage và report count.

#### R2-07 · P2 · Form Opportunity nói đã link Account dù Account chưa tồn tại

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Typeahead được gợi tên chưa có Account, nhưng nhãn Linked chỉ xuất hiện với identity đã kiểm chứng. Cung cấp Create/link/merge có preview; qualify không tự sinh Account trùng.

**Điều kiện đạt:** Tên chỉ tồn tại trên lead/deal không được ghi đã link. Sau create/merge Account, Overview, form và Accounts đồng ý về một identity. Không tự tạo account trùng chỉ vì qualify lead.

**Kiểm chứng:** Lead-only name → qualify → create/link Account → reload; trùng tên và owner khác.

**Nguồn:** [src/features/opportunities/OpportunitiesPage.tsx:346](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:346>), [src/features/opportunities/OpportunitiesPage.tsx:3192](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:3192>), [src/features/opportunities/OpportunitiesPage.tsx:5390](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:5390>).

#### R2-08 · P2 · Một số đường điều hướng làm mất khách hoặc deal đang xử lý

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: R2-07.

**Sửa:** Chuẩn hóa entity ID + filter cho route handoff. Redirect URL cũ giữ ID; account-scoped destinations có badge filter và nút clear. Invalid ID có missing-record state.

**Điều kiện đạt:** Mở bookmark deal cũ vào đúng drawer; Account→Coverage/Money/Opportunities chỉ đúng khách. Back trở lại danh sách/filter trước; ID không hợp lệ báo thiếu record chứ không lặng lẽ mở tất cả.

**Kiểm chứng:** Bookmark cũ, Account→Coverage/Money/Opportunity, Ask→Account, refresh và Back/Forward.

**Nguồn:** [src/App.tsx:269](<E:/Antigravity project/Memoire/src/App.tsx:269>), [src/features/coverage/PortfolioCoveragePage.tsx](<E:/Antigravity project/Memoire/src/features/coverage/PortfolioCoveragePage.tsx>), [src/features/accounts/AccountsPage.tsx](<E:/Antigravity project/Memoire/src/features/accounts/AccountsPage.tsx>).

#### R2-09 · P2 · Số linked records của catalog và Records của report khác phạm vi

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Catalog nêu All links/Leads/Qualified active/Closed. Report handoff dùng cùng population definition; không chỉ sửa nhãn để giấu chênh lệch.

**Điều kiện đạt:** 4 links của PMM giải thích được thành 2 Leads + 2 qualified records; đổi population của report khớp count tương ứng. Dữ liệu Others manual vẫn giữ tên gốc và assignment ID.

**Kiểm chứng:** PMM: 4 links = 2 Leads + 2 qualified; chọn từng population và đối soát count/source IDs.

**Nguồn:** [src/features/portfolio/PortfolioPage.tsx:142](<E:/Antigravity project/Memoire/src/features/portfolio/PortfolioPage.tsx:142>), [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>).

#### R2-05 · P2 · Coverage suy diễn quá mức từ các deal đã ghi

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: R2-07, R2-09.

**Sửa:** Coverage dùng Accounts và active catalog Brands; orphan customers/Others có nhóm cần phân loại. Có record không đồng nghĩa đã mua; không có record không chứng minh chưa từng chào bán.

**Điều kiện đạt:** Brand mới không có deal vẫn có cột. Lead không được tính đã mua. Khách có deal nhưng chưa quote không được tính đã chào. Unknown/Others không tự thành mục tiêu upsell; giữ các tên manual để phân loại.

**Kiểm chứng:** Browser + engine cho Brand chưa có deal, Lead-only, active, quoted, won, retired và Others.

**Nguồn:** [src/utils/coverageMatrix.ts:84](<E:/Antigravity project/Memoire/src/utils/coverageMatrix.ts:84>), [src/utils/coverageMatrix.ts:157](<E:/Antigravity project/Memoire/src/utils/coverageMatrix.ts:157>), [src/features/coverage/PortfolioCoveragePage.tsx](<E:/Antigravity project/Memoire/src/features/coverage/PortfolioCoveragePage.tsx>).

#### R2-18 · P3 · Catalog phẳng thiếu tìm kiếm và bộ lọc khi danh mục lớn

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-09.

**Sửa:** Search theo tên/alias/code và lọc kind/status/parent, phân trang khi cần. Catalog stable IDs và direct assignments tiếp tục là nền tảng.

**Điều kiện đạt:** Tìm đúng entry theo tên/alias/code; retired dễ xem nhưng không dùng cho intake mới. Rename/alias không đổi stableID hay nhân đôi linked records.

**Kiểm chứng:** Dataset scale có kiểm soát, search/filter/page; rename/alias/retire giữ assignments và loại retired khỏi intake mới.

**Nguồn:** [src/features/portfolio/PortfolioPage.tsx](<E:/Antigravity project/Memoire/src/features/portfolio/PortfolioPage.tsx>).

### Đợt 3: Các gợi ý và việc hằng ngày có căn cứ

Sau Capture và khoản phải thu ở đợt 1, cùng entity handoff ở đợt 2.

#### R2-11 · P2 · Vai trò chưa xác nhận vẫn được trình bày như Champion

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Một helper role label cho Account, Stakeholder map và detail: tentative/confirmed cùng semantics MEDDIC. Chỉ hiển thị nguồn hoặc ngày xác nhận đã được lưu.

**Điều kiện đạt:** Bỏ tick confirmed làm các badge/map chuyển sang tentative; phân loại và MEDDIC không mâu thuẫn. Không suy ra Economic Buyer chỉ từ tên chức danh.

**Kiểm chứng:** Bật/tắt role confirmed, reload các màn hình và MEDDIC; job title không tự cấp quyền quyết định.

**Nguồn:** [src/features/stakeholders/StakeholdersPage.tsx](<E:/Antigravity project/Memoire/src/features/stakeholders/StakeholdersPage.tsx>), [src/features/accounts/AccountsPage.tsx](<E:/Antigravity project/Memoire/src/features/accounts/AccountsPage.tsx>), [src/utils/meddicLite.ts](<E:/Antigravity project/Memoire/src/utils/meddicLite.ts>).

#### R2-10 · P2 · Playbook áp thiếu sót MEDDIC của deal cho Leads

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-09.

**Sửa:** Chia learning population thành Leads và qualified pipeline; tận dụng qualification engine hiện tại và threshold mẫu của từng pattern.

**Điều kiện đạt:** Ba Leads không cộng vào MEDDIC deal gap. Lead được đánh giá bằng qualification evidence; frequency và các khách liên quan giải thích được, có bộ lọc scope.

**Kiểm chứng:** Fixture 3 Leads không cộng vào MEDDIC deal gap; source list giải thích đúng frequency.

**Nguồn:** [src/utils/salesPlaybook.ts:81](<E:/Antigravity project/Memoire/src/utils/salesPlaybook.ts:81>), [src/utils/salesPlaybook.ts:300](<E:/Antigravity project/Memoire/src/utils/salesPlaybook.ts:300>).

#### R2-14 · P2 · Vault gửi sang câu hỏi Ask không hỗ trợ

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: R2-02, R2-08, R2-11.

**Sửa:** Chung registry cho supported intents và suggested questions của Today/Vault/Ask. Hỗ trợ câu Việt phổ biến; unsupported có fallback trung tính và câu gần nghĩa.

**Điều kiện đạt:** Mọi suggested question của Today/Vault đều có handler. Who signs trả đúng stakeholder/unknown của khách. Câu tiếng Việt về nợ dẫn tới receivables; unsupported không tự gợi gửi quote cho khách khác.

**Kiểm chứng:** Who signs at Northstar Foods?; Khách nào còn nợ tiền?; mọi generated question và unknown intent.

**Nguồn:** [src/features/vault/BusinessVaultPage.tsx](<E:/Antigravity project/Memoire/src/features/vault/BusinessVaultPage.tsx>), [src/features/v31/AskMemoirePage.tsx](<E:/Antigravity project/Memoire/src/features/v31/AskMemoirePage.tsx>), [src/features/v31/askMemoireInsightAnswers.ts](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts>).

#### R2-16 · P3 · Plan mặc định giấu ngày hôm nay khi hôm nay là Chủ nhật

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: S. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Hiện current weekend day khi mở Plan nếu chưa chọn view; nhớ lựa chọn rõ của người dùng. Giữ task dates và week boundaries.

**Điều kiện đạt:** Mở Plan thứ bảy/chủ nhật có hôm nay hoặc lời nhắc rõ; không tạo thêm task hay thay đổi ngày của task.

**Kiểm chứng:** Thứ sáu/bảy/chủ nhật/thứ hai, timezone và explicit Monday–Friday preference.

**Nguồn:** [src/features/plan/WeeklyPlanPage.tsx:182](<E:/Antigravity project/Memoire/src/features/plan/WeeklyPlanPage.tsx:182>), [src/features/timeline/TimelinePage.tsx](<E:/Antigravity project/Memoire/src/features/timeline/TimelinePage.tsx>).

### Đợt 4: Review, Reports và Money dễ đối soát

Dùng money basis của đợt 1 và population/identity của đợt 2. Sửa preset trước PDF layout; chốt close-date basis trước Review copy.

#### R2-06 · P2 · Review có hai kết quả thắng khác nhau cho cùng tuần

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: L. Phụ thuộc: R2-04.

**Sửa:** Một closed-outcome projection có dedupe theo opportunity và nguồn ngày đóng. Ngày sửa ghi chú không phải ngày thắng; thiếu ngày đưa vào nhóm chưa biết kỳ.

**Điều kiện đạt:** Cùng kỳ/cùng phạm vi có cùng count/value ở cả ba nơi. Deal không có ngày đóng được đưa vào nhóm chưa biết ngày; chỉnh ghi chú không làm đổi tuần thắng. Retro bổ sung sau không nhân đôi deal.

**Kiểm chứng:** So sánh Changes/Scoreboard/Business Review; sửa note, thêm retro sau, kiểm tra không đổi tuần hoặc nhân đôi.

**Nguồn:** [src/features/reviews/ReviewScoreboardPanel.tsx:97](<E:/Antigravity project/Memoire/src/features/reviews/ReviewScoreboardPanel.tsx:97>), [src/utils/weeklyBusinessReview.ts:105](<E:/Antigravity project/Memoire/src/utils/weeklyBusinessReview.ts:105>), [src/utils/outcomeScoreboard.ts:166](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:166>).

#### R2-12 · P2 · Preset Which payments need attention còn đưa đơn đã thu đủ

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-02.

**Sửa:** Attention = outstanding dương hoặc thiếu bằng chứng cần xử lý. Include collected là lựa chọn rõ; missing FX/amount không bị loại vì filter numeric.

**Điều kiện đạt:** Ca demo chỉ còn Summit và Orion trong attention; đơn thu đủ nằm trong history. Missing value/rate hoặc ngày chưa xác nhận vẫn có đường xem rõ.

**Kiểm chứng:** Demo 2 attention + 2 collected history, thêm ca unknown; CSV và dashboard dùng cùng filtered rows.

**Nguồn:** [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>), [src/domain/reports/reportQuestions.ts:6](<E:/Antigravity project/Memoire/src/domain/reports/reportQuestions.ts:6>).

#### R2-15 · P3 · Reports mặc định quá nhiều cột để in và khó đọc trên desktop

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-12.

**Sửa:** PDF có layout riêng từ cùng captured run; CSV giữ đầy đủ dữ liệu. Table có minimum column width/scroll; đổi preset đưa focus đến results heading.

**Điều kiện đạt:** Mỗi preset mặc định có đầu ra PDF dùng được; CSV giữ đủ cột và tất cả records. Preview được đọc ở1280 và390px; đổi template nhận được thông báo và focus rõ.

**Kiểm chứng:** Print preview/PDF thực của từng preset, nhiều trang; desktop 1280, mobile 390, keyboard và CSV parity.

**Nguồn:** [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>).

#### R2-23 · P3 · Dashboard gọi record zero là contributing Outstanding

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: S. Phụ thuộc: R2-12.

**Sửa:** Drilldown phân biệt all eligible/valid values/non-zero/missing/excluded, giữ nguồn và timestamp của captured run; không xóa zero khỏi phép tổng.

**Điều kiện đạt:** Valid4, non-zero2 trong ca này; unknown không được đưa vào nhóm valid. Count, total và excluded reasons giải thích được từ captured report run.

**Kiểm chứng:** Fixture valid 4, non-zero 2; record unknown không vào valid; totals và CSV nguồn không đổi.

**Nguồn:** [src/features/dashboards/DashboardsPage.tsx](<E:/Antigravity project/Memoire/src/features/dashboards/DashboardsPage.tsx>).

#### R2-17 · P3 · Nhập landed cost làm tên đơn khuất ở desktop

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: R2-01.

**Sửa:** Drawer hoặc sticky order header giữ khách/order/currency khi nhập cost. Extras mặc định theo order cho lần nhập mới; vẫn hỗ trợ nhiều currency.

**Điều kiện đạt:** Tên khách/order và currency luôn thấy khi sửa; không ép mọi currency giống nhau. Kết quả multi-currency và missing cost vẫn đúng.

**Kiểm chứng:** 650m−400m−10m = 240m VND, 36,9%; multi-currency, missing FX/cost và mobile save/cancel.

**Nguồn:** [src/features/revenue/CostAnalysisPage.tsx](<E:/Antigravity project/Memoire/src/features/revenue/CostAnalysisPage.tsx>).

#### R2-19 · P3 · Một số nhãn lộ mã nội bộ hoặc nói sai nơi mở

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: S. Phụ thuộc: R2-08.

**Sửa:** Quote origin lấy từ handoff hoặc bỏ nhãn cố định. Filters dùng tên; ID chỉ trong tooltip khi cần phân biệt. Shortcut khớp platform.

**Điều kiện đạt:** Today/Orders/Account vào quote có nhãn đúng; filter dùng tên thân thiện với tooltip ID khi cần; phím gợi ý khớp hệ điều hành.

**Kiểm chứng:** Today/Orders/Account mở quote; tên trùng; Windows Ctrl và macOS Command.

**Nguồn:** [src/features/quotes/QuotesPage.tsx:264](<E:/Antigravity project/Memoire/src/features/quotes/QuotesPage.tsx:264>), [src/features/dashboards/DashboardsPage.tsx](<E:/Antigravity project/Memoire/src/features/dashboards/DashboardsPage.tsx>), [src/components/layout/TopNav.tsx](<E:/Antigravity project/Memoire/src/components/layout/TopNav.tsx>).

### Đợt 5: Đăng ký, phục hồi và nội dung sản phẩm chính xác

Dùng định nghĩa tiền đã thống nhất ở đợt 1. Sharing copy dựa trên cơ chế hiện tại và acceptance ở đợt 6.

#### R2-20 · P2 · Verify-email báo đã gửi dù không có recipient context

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Định nghĩa trạng thái thiếu recipient/request accepted/verified. Deep link thiếu context cho nhập lại email; refresh giữ context tối thiểu có hạn, tránh đưa recipient vào URL.

**Điều kiện đạt:** Truy cập trực tiếp/refresh không báo sent. Người vừa signup thấy email đã che bớt và resend có phản hồi thật. Kiểm thử delivery/expiry riêng bằng tài khoản test khi có sender.

**Kiểm chứng:** Direct visit, refresh, resend accepted/error/rate limit, expired token và verified redirect trong môi trường auth test.

**Nguồn:** [src/features/auth/VerifyEmailPage.tsx:14](<E:/Antigravity project/Memoire/src/features/auth/VerifyEmailPage.tsx:14>), [src/features/auth/VerifyEmailPage.tsx:45](<E:/Antigravity project/Memoire/src/features/auth/VerifyEmailPage.tsx:45>).

#### R2-22 · P3 · Thông tin trước đăng ký và hỗ trợ nhập mật khẩu còn mỏng

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: S. Phụ thuộc: R2-20.

**Sửa:** Privacy/Terms ở cạnh signup; show/hide password có accessible name/state. Giữ autocomplete và input value khi toggle; auth error có đường phục hồi.

**Điều kiện đạt:** Links mở được; show/hide không thay nội dung, focus hay password-manager autocomplete. Không đưa technical setup text cho end-user trên deployment đã cấu hình.

**Kiểm chứng:** Keyboard, password manager, focus, legal links; auth test đăng ký/login/logout/reset/OAuth nếu provider bật.

**Nguồn:** [src/features/auth/SignupPage.tsx](<E:/Antigravity project/Memoire/src/features/auth/SignupPage.tsx>), [src/features/auth/LoginPage.tsx](<E:/Antigravity project/Memoire/src/features/auth/LoginPage.tsx>).

#### R2-24 · P2 · Privacy còn mô tả cơ chế shared brief đã nghỉ

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: M. Phụ thuộc: không có ticket trước bắt buộc.

**Sửa:** Privacy mô tả sync và permission-based sharing hiện tại; retired brief URL có giải thích. Không hứa recall bản sao đã chia sẻ hoặc access chưa được nghiệm thu.

**Điều kiện đạt:** Tài liệu mô tả đúng đường đang dùng; old link được giải thích đã nghỉ. Hành vi quyền, invite accept/decline và revoke được kiểm chứng bằng hai account test trước khi tuyên bố về access.

**Kiểm chứng:** Đối chiếu source/UI copy và hai test accounts: invite accept/decline, reviewer/reader, revoke, fresh acceptance sau restore.

**Nguồn:** [src/features/legal/LegalPage.tsx:80](<E:/Antigravity project/Memoire/src/features/legal/LegalPage.tsx:80>), [src/App.tsx:113](<E:/Antigravity project/Memoire/src/App.tsx:113>), [src/features/reviews/SharedWorkspacesPanel.tsx](<E:/Antigravity project/Memoire/src/features/reviews/SharedWorkspacesPanel.tsx>).

#### R2-21 · P3 · Marketing gọi chênh Quoted−Paid là tiền không về ngân hàng

Trạng thái: Implemented; bằng chứng và giới hạn trong [báo cáo nghiệm thu](../qa/full-app-upgrade-2026-10-13.md). Cỡ: S. Phụ thuộc: R2-01, R2-02.

**Sửa:** Dùng đúng quoted→ordered→received→outstanding và định nghĩa gross pipeline. Các chart minh họa được ghi rõ là minh họa.

**Điều kiện đạt:** Minh họa không gọi báo giá chưa nhận là nợ hay cash đã kiếm. Chú giải rõ funnel stock/cohort và đơn vị; không cần thay con số demo.

**Kiểm chứng:** Đối chiếu con số và labels trên Landing/Use cases/Guide/Pricing với cùng money glossary.

**Nguồn:** [src/components/marketing/charts.tsx](<E:/Antigravity project/Memoire/src/components/marketing/charts.tsx>), [src/features/useCases/UseCasesPage.tsx](<E:/Antigravity project/Memoire/src/features/useCases/UseCasesPage.tsx>), [src/features/guides/QuoteToCashPage.tsx](<E:/Antigravity project/Memoire/src/features/guides/QuoteToCashPage.tsx>).

## Các hạng mục độ bền và vận hành

### C2 · Chặn Brand trôi nổi khi lưu thất bại

Khoảng trống độ bền đã thấy trong nguồn; cần fault injection.

**Cách xử lý:** Spike chọn atomic save nếu persistence hiện tại hỗ trợ; nếu cần schema, kiểm tra shared Supabase/Helm và recovery gate trước. Pending repair phải hiện rõ và được hoàn tất trước khi đóng yêu cầu Brand.

**Điều kiện đạt:** Inject lỗi sau opportunity write, quota, mất mạng, reload, retry và đổi owner. Phải có atomic write hoặc journal theo owner, command ID và repair bền vững; record thiếu link không được tính là save hoàn tất. Retry không tạo deal/assignment trùng. Dữ liệu cũ có danh sách đối soát và sửa tới 100% catalog/Others manual hợp lệ.

### C1 · Cùng owner trên hai thiết bị có cùng FX basis

Ứng viên cần xác minh, chưa phải lỗi production đã tái hiện.

**Cách xử lý:** Chưa tự đồng bộ mọi override. Kiểm tra semantics, preferences và backup hiện tại trước; không đổi currency của số gốc.

**Điều kiện đạt:** Hai thiết bị, cùng dữ liệu và cùng declared FX version cho cùng totals. Nếu browser-local overrides khác nhau, report ghi rõ basis; sau chốt design, sửa sync/version hoặc cảnh báo khác basis.

### D1 · Nghiệm thu email digest và scheduler

**Tạm hoãn theo yêu cầu người dùng ngày 12/10/2026: “tạm thời ko làm Email Digest”.** Không cấu hình sender, scheduler hoặc gửi email trong đợt này.

**Cách xử lý:** Chuẩn bị checklist/config từ đầu. Việc cần sender credentials hoặc recipient test phải có môi trường được phép; mục chưa đủ điều kiện giữ pending, không đánh dấu feature hoàn tất.

**Điều kiện đạt:** Provider test, scheduler, timezone, opt-in/out, unsubscribe, chống gửi trùng, chỉ dữ liệu đúng owner; kiểm tra inbox test và failed delivery. Preference saved khác delivery accepted/delivered.

### D2 · Kiểm chứng sync recovery của tab cũ

Incident đã hồi phục; chưa kết luận mất dữ liệu.

**Cách xử lý:** Tái hiện có log và bounded fixture; chỉ sửa khi có nguyên nhân xác định. Không biến cảnh báo thoáng qua thành bug mất dữ liệu.

**Điều kiện đạt:** Offline→online, tab cũ, logout/login owner khác, local unsynced queue và reload. UI phân biệt local saved/pending/cloud synced; recovery không nhân đôi hoặc chuyển dữ liệu sang owner khác.

C3 (SGD trên initiative cũ) đã loại khỏi defect: giữ currency trong payload; không đổi đơn vị của số đã lưu khi đổi reporting currency.

## Nghiệm thu từng nhóm tính năng

Mỗi nhóm dưới đây cần bổ sung runtime acceptance cho các khoảng trống; đọc nguồn/unit test không được thay bằng kết luận full flow đã đạt.

| Nhóm | Phạm vi kiểm tra | Phần chưa nghiệm thu vòng 2 |
|---|---|---|
| Today | Picture, ranked3 moves, Watch-list, nudges, lead prompts, Start the day | Snooze/Done không được thử lại vòng2; không xem dismiss là đã giải quyết commercial risk. |
| Plan | Week board, commitments, customer composer, history, dated work vs weekly priorities | Paste/import và xác nhận cùng work được đọc nguồn; không import dữ liệu thật. |
| Leads | Queue/filter/search, create, Brand/Others validation, qualify sameID, nurture/disqualify surfaces, mobile | Đã tạo và qualify Lead hư cấu; disqualify/nurture không commit vòng2. |
| Accounts | Book, orphan repair hints, customer overview, people, link to coverage/revenue/opportunities | CSV/contact import và merge đọc nguồn; chưa thực hiện merge hoặc import production. |
| Opportunities | Qualified detail, original fields/classification, identity, MEDDIC, forecast evidence, legacy links | Close-out/delete và foreign-account cloud write không thực hiện; What-if/pricing đọc nguồn và unit checks. |
| Money / Orders | Quote editor, manual payment, fulfillment, Collections trigger/date basis, partial receipts, costs and margin | P&L/expenses/supplier commitments/targets được đối chiếu nguồn đã triển khai; không tạo expense/supplier transaction mới. |
| Review | Changes, Scoreboard, Business Review, commitments, analytics, lead conversion, next-week priorities | Weekly scope đã đối chiếu; không gửi brief, shared invitation hay canonical exchange. |
| Products & Brands | Catalog, stable identity, alias/retire controls, duplicate validation, current classification, report handoff | Rename/retire/bulk legacy promotion đọc nguồn; chưa thực hiện cloud mutation vòng2. |
| Reports | Population, presets, filters/columns, details/grouping, captured metadata, CSV export, save, dashboard handoff | CSV totals khớp; PDF preset11 cột bị disable, chưa xuất PDF thực tế. Archive/restore definition chưa thực hiện. |
| Dashboards | Create from report, save, widget total, sources, contributors, captured-run identity | Save/drilldown dùng report snapshot; nhiều-widget scale và cloud save chưa nghiệm thu vòng2. |
| Capture / Ask / Search | VN note, multi-action dates, buying signals, supported/unsupported intents, account scope guard, global search/Escape | Ghi chú VN lỗi chỉ preview rồi discard; không gửi follow-up. Không khẳng định hỗ trợ mọi cách nói/ngôn ngữ. |
| People / Objections | Role confirmation, MEDDIC contradiction check, objection status/evidence/owner form | Form objection chỉ preview; không đổi role hoặc resolution trên production. |
| Vault / Playbook / Assets | Graph and text alternative, gap ranking→Ask, learned patterns, reusable asset library | Không import/share asset; không có nghiệm thu full graph keyboard navigation. |
| Operating priorities | Must-win list, initiative hypothesis/decision/activity linkage/value currency | FormSGD của record cũ có payload currency; tạo mới dùng reporting currency. Không coi label này là lỗi tiền. |
| Settings / data recovery | 5 categories, currency/FX/pricing assumptions, sync status, exportZIP, restore boundary, reset/exit demo | Production sender chưa cấu hình; real restore/undo/profile save/billing/delete chưa thực hiện. |
| Public / onboarding / auth | Landing, signup/login, forgot/verify, pricing, use cases/guide/privacy/contact/404; first-run source | Không tạo account hoặc gửi email/contact request. Verify delivery, reset token, OAuth và merchant checkout chưa kiểm chứng. |
| Internal / administrative gates | Founder import review redirect; admin/validation-feedback entitlement and source routes | Không có thao tác admin, production import hoặc security penetration test. |

## Mười hành trình xuyên suốt

- **J1 — Brand & Lead lifecycle:** Lead catalog/Others → save/reload → qualify cùng ID → đổi alias/retire → repair legacy; lỗi lưu/retry không orphan hoặc duplicate.
- **J2 — Account & coverage:** Lead-only customer → link/create/merge → People tentative/confirmed → Coverage → scoped Money/Opportunity → Back.
- **J3 — Conversation to action:** VN negation + hai việc/hai hạn → preview chỉnh → save → Plan/Today; câu nhiều khách cần resolver rõ.
- **J4 — Quote to cash:** No receipt → partial → full → overpaid → sửa/xóa receipt theo command hiện có; Quote/Orders/Collections/Ask/Report khớp. Nếu chưa có refund command, ghi giới hạn và chốt contract riêng.
- **J5 — Money & targets:** Multi-currency/missing FX, costs/margin, expenses/supplier commitments/P&L và targets; gốc tiền không đổi khi đổi reporting currency.
- **J6 — Outcome & learning:** Close won/lost → date basis → retro bổ sung → Review 3 màn hình → Playbook tách Lead/qualified; chỉnh note không đổi tuần thắng.
- **J7 — Reports & dashboards:** Population/filter → CSV/PDF → save/reload/archive/restore definition → dashboard nhiều widget → sources valid/non-zero/missing/stale.
- **J8 — Daily execution:** Today Done/Snooze → Plan commitments/weekend/history/import preview → initiative/objection/assets → thấy đúng source và trạng thái thực.
- **J9 — Identity, recovery & access:** Auth verify/reset/OAuth test → hai owners/thiết bị → quota/offline/recovery → backup restore/undo → sharing accept/decline/revoke; không nâng quyền từ dữ liệu restore.
- **J10 — Public, settings & operational gates:** Public links/pricing/contact test, notification delivery test, billing sandbox nếu bật; founder/admin gates và cloud import đúng entitlement.

## Thước đo hoàn tất

| Thước đo | Mục tiêu nghiệm thu |
|---|---|
| Brand mới hợp lệ | 100% bản ghi được báo save hoàn tất có assignment catalog hoặc Others manual; 0 orphan sau retry/failure. |
| Brand cũ được đối soát | 100% bản ghi hiện hữu trong phạm vi cleanup có link hoặc Others manual hợp lệ trước khi đóng yêu cầu Brand. |
| Money parity | 0 chênh lệch ngoài quy tắc làm tròn/settled tolerance hiện hành khi cùng snapshot/scope/FX; unknown count cũng khớp. |
| Handoff & suggestions | 100% các đường và generated questions trong acceptance matrix giữ scope và có handler. |
| Review parity | Cùng kỳ/cùng source basis có count/value khớp; 0 duplicated outcomes sau retro bổ sung. |
| Readability & recovery | Preset mặc định xuất PDF được; desktop 1280 và mobile 390 có tên record, action và error/recovery rõ; không có keyboard trap. |
| Release evidence | 24/24 điểm có bằng chứng mới; không đóng candidate bằng code review đơn thuần. CI kết thúc đạt, deployment READY đúng SHA và live checks đạt. |

Các mục tiêu trên áp dụng cho corpus kiểm thử đã khai báo; không suy ra 100% trên mọi dữ liệu production chỉ từ fixture. Báo cáo cleanup thực phải ghi owner scope, tổng records và unresolved count.

## Kiểm thử, phát hành và phục hồi

1. Mỗi đợt: tái hiện đúng ca trước sửa → chốt contract → thay đổi tối thiểu ở shared derivation → unit regression cho logic rủi ro → browser acceptance có ảnh/DOM đúng thời điểm → cập nhật trạng thái và bằng chứng.
2. Các đợt có thể tạo commit riêng; không ghi Done khi chỉ pass tests có sẵn. 249 checks của audit là baseline của lần rà soát, không phải chứng nhận các fix tương lai.
3. Trước phát hành chạy npm run check trên final commit, không lặp toàn suite sau mỗi sửa chữ đơn giản. Dùng suites hiện hữu và bổ sung ca thật đang bị bỏ sót; không sửa test để giữ kết quả sai.
4. Giữ snapshot dữ liệu trước/sau để phân biệt expected fixture changes với mất dữ liệu. Local fiction trước; cloud bằng test owners và record ID có dấu SIMULATED trong phạm vi được phép.
5. Nếu thay schema: inspect catalog/ledger/shared Helm, backup ngoài checkout, restore rehearsal, exact migration dry-run, RLS/owner checks. Không suy ra schema ready từ Vercel READY.
6. Release: đúng commit → final CI đạt → Vercel READY đúng commit → live smoke cả desktop/mobile + money/Brand integrity. Record release receipt, known limits và recovery path.
7. Rollback ứng dụng về commit đã kiểm chứng; dữ liệu không được rollback mù theo UI version. Schema/history repair chỉ theo recovery đã rehearsed; pending Brand commands phải tiếp tục tương thích.
8. Auth/email/billing/sharing thực tế còn phụ thuộc provider và môi trường test. Thiếu điều kiện thì giữ named pending item và giới hạn công bố tương ứng; không đánh dấu toàn app nghiệm thu hoàn tất.

## Bằng chứng và cách theo dõi

Nguồn audit: [docs/qa/product-audit-round2-2026-10-11.html](<E:/Antigravity project/Memoire/docs/qa/product-audit-round2-2026-10-11.html>) và [docs/qa/evidence/product-audit-round2-2026-10-11/audit-manifest.json](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/audit-manifest.json>).

Backlog JSON đi cùng chứa phase, dependencies, acceptance và completionEvidence. Chuyển Planned → In progress → Verified chỉ khi có đúng fixture/input, output, source commit và bằng chứng mới; Published cần thêm CI/deployment/live checks. Candidate ghi Confirmed/Rejected/Remaining limitation riêng.

Kế hoạch này chưa thực hiện sửa ứng dụng, cleanup dữ liệu hay gửi email. Không có phiên bản mới được triển khai trong lần lập kế hoạch.
