Memoire — rà soát sản phẩm vòng 2 • 11/10/2026

Đã đi qua 10 khu vực chính và các luồng hỗ trợ: 73 ảnh hợp lệ; 249 kiểm tra tự động có sẵn đạt. Có 24 điểm cần thay đổi hoặc cải tiến: 4 ưu tiên cao (P1), 12 ưu tiên vừa (P2), 8 cải tiến tiếp theo (P3). Bốn P1 là trạng thái đã thanh toán trên Quote, số tiền chưa thu trong Ask, Capture tiếng Việt và tiền tệ của mục tiêu doanh số.

Đánh giá: nhập và liên kết Brand, cùng cách tính khoản thu, tốt hơn vòng 1. Việc cần làm tiếp là thống nhất cách tính và diễn giải giữa các màn hình. Giữ 10 khu vực hiện tại; hoàn thiện các đường đi và định nghĩa dữ liệu trước khi thêm module. Chưa sửa mã ứng dụng hay triển khai phiên bản mới trong vòng rà soát này. Mã nguồn kiểm tra: 545b27b779260d7425729820334ef486cca33a4f.


Điểm đang làm tốt


- Intake Brand có catalog ID và Others manual required; duplicate được chặn, qualify giữ identity và tên gốc. Những sửa này giải quyết phần lớn dữ liệu brand trôi nổi ở happy path.

- Collections, Reports CSV và Dashboard cùng trả55.769,23USD outstanding sau receipt; margin240triệuVND/36,9% tính đúng. Confirmed date và planning date được phân biệt.

- Leads là queue riêng, không lẫn qualified pipeline ở report mặc định; mobile lead cards và drawer có action footer rõ. MEDDIC không coi deal amount là business impact.

- Reports/Dashboard giữ captured-run metadata, source drilldown và missing amount/rate. Không suy ra cash từ Won deal value.

- Search vào dialog, có kết quả theo record và Escape đóng; empty Others bị chặn. Demo label, exportZIP, restore guard và normal reset/exit đều có đường phục hồi rõ.

- Pricing phân biệt preview0USD, Personal10USD sau preview và Team chưa bán. Contact form nói rõ purpose và không cần account approval.


Phạm vi từng nhóm tính năng


| Khu vực | Tính năng đã rà | Bước / loại bằng chứng | Giới hạn |

|---|---|---|---|

| Today | Picture, ranked3 moves, Watch-list, nudges, lead prompts, Start the day | 2,3,9,42,63,64 · Runtime demo + production anchor | Snooze/Done không được thử lại vòng2; không xem dismiss là đã giải quyết commercial risk. |

| Plan | Week board, commitments, customer composer, history, dated work vs weekly priorities | 13–15 · Runtime demo + source | Paste/import và xác nhận cùng work được đọc nguồn; không import dữ liệu thật. |

| Leads | Queue/filter/search, create, Brand/Others validation, qualify sameID, nurture/disqualify surfaces, mobile | 16–19,59,60 · Runtime demo + source | Đã tạo và qualify Lead hư cấu; disqualify/nurture không commit vòng2. |

| Accounts | Book, orphan repair hints, customer overview, people, link to coverage/revenue/opportunities | 21–25 · Runtime demo + source | CSV/contact import và merge đọc nguồn; chưa thực hiện merge hoặc import production. |

| Opportunities | Qualified detail, original fields/classification, identity, MEDDIC, forecast evidence, legacy links | 18–20,25,37 · Runtime demo + source | Close-out/delete và foreign-account cloud write không thực hiện; What-if/pricing đọc nguồn và unit checks. |

| Money / Orders | Quote editor, manual payment, fulfillment, Collections trigger/date basis, partial receipts, costs and margin | 3–12,29–32,41,56 · Runtime demo + pure probes | P&L/expenses/supplier commitments/targets được đối chiếu nguồn đã triển khai; không tạo expense/supplier transaction mới. |

| Review | Changes, Scoreboard, Business Review, commitments, analytics, lead conversion, next-week priorities | 33–36,56 · Runtime demo + source | Weekly scope đã đối chiếu; không gửi brief, shared invitation hay canonical exchange. |

| Products & Brands | Catalog, stable identity, alias/retire controls, duplicate validation, current classification, report handoff | 1,17,26,27 · Production đọc-only + demo + unit checks | Rename/retire/bulk legacy promotion đọc nguồn; chưa thực hiện cloud mutation vòng2. |

| Reports | Population, presets, filters/columns, details/grouping, captured metadata, CSV export, save, dashboard handoff | 27–30,61 · Runtime demo + ZIP inspection + unit checks | CSV totals khớp; PDF preset11 cột bị disable, chưa xuất PDF thực tế. Archive/restore definition chưa thực hiện. |

| Dashboards | Create from report, save, widget total, sources, contributors, captured-run identity | 31,32 · Runtime demo + source | Save/drilldown dùng report snapshot; nhiều-widget scale và cloud save chưa nghiệm thu vòng2. |

| Capture / Ask / Search | VN note, multi-action dates, buying signals, supported/unsupported intents, account scope guard, global search/Escape | 37–42,47,57 · Runtime demo + pure probes | Ghi chú VN lỗi chỉ preview rồi discard; không gửi follow-up. Không khẳng định hỗ trợ mọi cách nói/ngôn ngữ. |

| People / Objections | Role confirmation, MEDDIC contradiction check, objection status/evidence/owner form | 23,43–45 · Runtime demo + source + unit checks | Form objection chỉ preview; không đổi role hoặc resolution trên production. |

| Vault / Playbook / Assets | Graph and text alternative, gap ranking→Ask, learned patterns, reusable asset library | 46–50 · Runtime demo + source + pure probes | Không import/share asset; không có nghiệm thu full graph keyboard navigation. |

| Operating priorities | Must-win list, initiative hypothesis/decision/activity linkage/value currency | 48,62 · Runtime demo + source | FormSGD của record cũ có payload currency; tạo mới dùng reporting currency. Không coi label này là lỗi tiền. |

| Settings / data recovery | 5 categories, currency/FX/pricing assumptions, sync status, exportZIP, restore boundary, reset/exit demo | 51–55,64,76 · Demo runtime + production đọc-only + unit checks | Production sender chưa cấu hình; real restore/undo/profile save/billing/delete chưa thực hiện. |

| Public / onboarding / auth | Landing, signup/login, forgot/verify, pricing, use cases/guide/privacy/contact/404; first-run source | 65–75 · Public local runtime + source | Không tạo account hoặc gửi email/contact request. Verify delivery, reset token, OAuth và merchant checkout chưa kiểm chứng. |

| Internal / administrative gates | Founder import review redirect; admin/validation-feedback entitlement and source routes | 63 · Runtime gate + source inventory | Không có thao tác admin, production import hoặc security penetration test. |


Từng điểm cần xử lý



### R2-01 · P1 · Quote có thể ghi Paid khi chưa có tiền thu


Lỗi đã tái hiện. Bước 3, 5, 7, 9.

Đổi Payment của quote Summit sang Paid và lưu thành công. Collections vẫn cho thấy 650 triệu VND chưa thu. Sau khi phục hồi Due và ghi khoản thu thử 100 triệu VND, còn 550 triệu VND. Đây là hai định nghĩa Paid cùng tồn tại.

Tác động: Người dùng có thể ngừng đòi tiền vì tin nhãn Paid trên quote, trong khi sổ khoản thu chưa có bằng chứng.

Đề nghị: Lấy trạng thái thu tiền từ receipt ledger. Nếu cần xác nhận thủ công ngoài sổ, ghi thành bằng chứng đối soát có số tiền, ngày và nguồn; đừng dùng một lựa chọn Paid độc lập.

Điều kiện đạt: Không receipt: mọi màn hình đều chưa thu. Thu một phần: mọi màn hình cùng số dư. Thu đủ hoặc hoàn tiền: quote, Orders, Collections, Today và Reports cùng trạng thái; không tạo receipt ngầm khi chỉ sửa quote.

Nguồn: [src/utils/commercialFulfillment.ts:23](<E:/Antigravity project/Memoire/src/utils/commercialFulfillment.ts:23>), [src/utils/revenueView.ts:157](<E:/Antigravity project/Memoire/src/utils/revenueView.ts:157>), [src/features/quotes/QuotesPage.tsx:500](<E:/Antigravity project/Memoire/src/features/quotes/QuotesPage.tsx:500>).


### R2-02 · P1 · Ask tính tiền chưa thu bằng giá trị gốc, bỏ qua thu một phần


Lỗi đã tái hiện. Bước 9, 29, 30, 41.

Sau receipt 100 triệu VND, Collections và CSV báo 55.769,23 USD còn phải thu; Ask vẫn nói 59,6K USD committed, not collected. Chênh lệch 3.846,15 USD chính là receipt đã ghi. In motion và Pending payment dùng số dư đúng, nên câu trả lời còn tự mâu thuẫn.

Tác động: Một câu hỏi về tiền trả lại số dư lớn hơn thực tế và làm mất niềm tin vào các màn hình đã tính đúng.

Đề nghị: Dùng totalOutstandingBase từ cùng receivables engine cho câu hỏi khoản phải thu. Nếu vẫn cần gross order value, đặt tên riêng và hiển thị bên cạnh received/outstanding.

Điều kiện đạt: Receipt 100 triệu VND làm mọi câu trả lời về outstanding giảm đúng 3.846,15 USD. Kiểm tra receipt nhiều loại tiền, thiếu FX và receipt trùng; số thiếu phải giữ unavailable.

Nguồn: [src/utils/orderToCash.ts:430](<E:/Antigravity project/Memoire/src/utils/orderToCash.ts:430>), [src/features/v31/askMemoireInsightAnswers.ts:188](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts:188>), [src/features/v31/askMemoireInsightAnswers.ts:663](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts:663>).


### R2-03 · P1 · Capture tiếng Việt hiểu sai phủ định PO và gắn nhầm hạn của hai việc


Lỗi đã tái hiện. Bước 37.

Ghi chú nói chưa duyệt ngân sách, chưa xác nhận PO, chưa nhận hàng. Preview vẫn có Purchase order signal. Câu gửi báo giá vào thứ ba tuần sau, gọi lại ngày 20/10/2026 chỉ sinh một việc gửi báo giá, hạn 20/10; mất cuộc gọi lại. Với ngày ghi 11/10, thứ ba tuần sau là 13/10.

Tác động: Tín hiệu mua hàng trở nên lạc quan và Plan có thể nhắc sai ngày. Lỗi xảy ra trước lưu, dù người dùng vẫn được quyền sửa preview.

Đề nghị: Xử lý phủ định trong từng mệnh đề tiếng Việt; tách các hành động qua dấu phẩy/liên từ và gắn ngày ở phạm vi hành động. Nhãn signal cần phân biệt PO được nhắc tới với PO đã xác nhận.

Điều kiện đạt: Ca ghi chú giữ PO chưa xác nhận; đề xuất riêng gửi báo giá 13/10 và gọi lại 20/10. Thử thêm không, chưa, hủy, có thể, nếu, tuần sau, ngày tháng và hai khách trong một ghi chú. Không tự nâng stage hay xác nhận bằng chứng.

Nguồn: [src/utils/salesActivityClassifier.ts:575](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:575>), [src/utils/salesActivityClassifier.ts:723](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:723>), [src/utils/salesActivityClassifier.ts:680](<E:/Antigravity project/Memoire/src/utils/salesActivityClassifier.ts:680>).


### R2-04 · P1 · Scoreboard bỏ currency của mục tiêu doanh số


Lỗi đã tái hiện. Bước 51, 56.

Export thật của demo lưu Q4 2,5 tỷ VND và năm 10 tỷ VND. Scoreboard ở reporting USD hiển thị 2,5B USD và 10B USD. Mục tiêu Q4 đúng theo FX hiện tại là 96.153,85 USD; vì vậy mức đạt khoảng 52% bị báo 0%.

Tác động: Gap, tỷ lệ đạt, run-rate và câu dự báo đều sai theo tỷ lệ 26.000 lần trong ca VND sang USD.

Đề nghị: Chuyển từng target.amount bằng target.currency trước khi cộng. Giữ currency trong kiểu đầu vào Scoreboard; chặn tỷ lệ đạt nếu thiếu FX.

Điều kiện đạt: VND, USD, SGD và mục tiêu pha nhiều currency quy đổi nhất quán với Money/forecast. Chuyển reporting currency không đổi mức đạt thực chất. Mục tiêu thiếu currency/rate báo chưa tính được, không thành 0%.

Nguồn: [src/utils/outcomeScoreboard.ts:143](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:143>), [src/utils/outcomeScoreboard.ts:290](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:290>), [src/services/commercialKernel/targetStore.ts:11](<E:/Antigravity project/Memoire/src/services/commercialKernel/targetStore.ts:11>).


### R2-05 · P2 · Coverage suy diễn quá mức từ các deal đã ghi


Lỗi ý nghĩa đã tái hiện và đối chiếu nguồn. Bước 24, 25.

Coverage nói 5/8 customers buy, dù có khách chỉ có deal Active hoặc Lead. Ô không có record được gọi chưa từng chào bán. Others xuất hiện như một dòng hàng để upsell. Mã nguồn tạo cột từ brand có trên deal, nên catalog Brand chưa có deal không xuất hiện.

Tác động: Người dùng nhận khuyến nghị bán chéo trên một giả định không được dữ liệu chứng minh, trong khi dòng hàng chưa bán cho ai lại bị bỏ sót.

Đề nghị: Lấy hàng từ Accounts và cột từ catalog Brand đang hoạt động. Tách Won, quoted, active, Lead và chưa có record. Ghi chưa có giao dịch được ghi nhận, không suy ra chưa từng chào bán. Others là vùng cần chuẩn hóa; chỉ dùng cho bán chéo khi người dùng chọn một dòng cụ thể.

Điều kiện đạt: Brand mới không có deal vẫn có cột. Lead không được tính đã mua. Khách có deal nhưng chưa quote không được tính đã chào. Unknown/Others không tự thành mục tiêu upsell; giữ các tên manual để phân loại.

Nguồn: [src/utils/coverageMatrix.ts:84](<E:/Antigravity project/Memoire/src/utils/coverageMatrix.ts:84>), [src/utils/coverageMatrix.ts:157](<E:/Antigravity project/Memoire/src/utils/coverageMatrix.ts:157>), [src/features/coverage/PortfolioCoveragePage.tsx](<E:/Antigravity project/Memoire/src/features/coverage/PortfolioCoveragePage.tsx>).


### R2-06 · P2 · Review có hai kết quả thắng khác nhau cho cùng tuần


Mâu thuẫn phạm vi đã tái hiện. Bước 33, 36, 56.

Oct 5–11: Changes/Business review báo 1 win và 18,5K USD; Scoreboard báo 2 wins và 43,5K USD. Scoreboard kết hợp retro với Won/Lost không có retro; Business review chỉ đọc outcomes. Vì vậy chưa thể nói một số đúng và số kia sai nếu chưa thống nhất phạm vi và nguồn ngày.

Tác động: Người dùng không biết lấy số nào để báo cáo tuần. Nguồn suy ra từ updatedAt còn có thể đưa deal thiếu ngày đóng vào tuần sửa record.

Đề nghị: Một tập closed outcomes dùng chung cho summary, scoreboard và brief; hiển thị nguồn ngày đóng, tách ngày xác nhận với ngày suy ra và không âm thầm xem ngày sửa record là ngày thắng.

Điều kiện đạt: Cùng kỳ/cùng phạm vi có cùng count/value ở cả ba nơi. Deal không có ngày đóng được đưa vào nhóm chưa biết ngày; chỉnh ghi chú không làm đổi tuần thắng. Retro bổ sung sau không nhân đôi deal.

Nguồn: [src/features/reviews/ReviewScoreboardPanel.tsx:97](<E:/Antigravity project/Memoire/src/features/reviews/ReviewScoreboardPanel.tsx:97>), [src/utils/weeklyBusinessReview.ts:105](<E:/Antigravity project/Memoire/src/utils/weeklyBusinessReview.ts:105>), [src/utils/outcomeScoreboard.ts:166](<E:/Antigravity project/Memoire/src/utils/outcomeScoreboard.ts:166>).


### R2-07 · P2 · Form Opportunity nói đã link Account dù Account chưa tồn tại


Lỗi đã tái hiện. Bước 18, 19, 21.

Lead Atlas thử nghiệm được qualify, giữ đúng ID và Others. Overview nói chưa có Account record, nhưng thông báo ở form lại xanh: Linked to a customer you already have. knownAccountNames có cả tên gõ trên opportunity nên tự xác nhận chính record vừa tạo.

Tác động: Thông báo khiến người dùng tưởng đã giải quyết dữ liệu khách trôi nổi.

Đề nghị: Typeahead có thể dùng tên từ cả book; thông báo đã liên kết chỉ dùng Account record/ID thực. Đưa hành động tạo hoặc gộp Account ngay tại cảnh báo thiếu link.

Điều kiện đạt: Tên chỉ tồn tại trên lead/deal không được ghi đã link. Sau create/merge Account, Overview, form và Accounts đồng ý về một identity. Không tự tạo account trùng chỉ vì qualify lead.

Nguồn: [src/features/opportunities/OpportunitiesPage.tsx:346](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:346>), [src/features/opportunities/OpportunitiesPage.tsx:3192](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:3192>), [src/features/opportunities/OpportunitiesPage.tsx:5390](<E:/Antigravity project/Memoire/src/features/opportunities/OpportunitiesPage.tsx:5390>).


### R2-08 · P2 · Một số đường điều hướng làm mất khách hoặc deal đang xử lý


Lỗi đã tái hiện. Bước 20, 22, 24, 39.

/app/deals/:id trở về danh sách mà không mở deal. Coverage nhận accountName=Apex Labs nhưng hiển thị cả 8 khách. Account Open opportunities/Open revenue và Ask Open Accounts có đường đi quá chung, không giữ khách vừa hỏi.

Tác động: Người dùng phải tìm lại context, dễ mở nhầm record giữa một danh sách lớn.

Đề nghị: Dùng các handoff có entity ID và filter được kiểm tra; giữ ID khi redirect đường cũ. Link từ account nên tới đúng account-scoped list/drawer; nếu filter không hỗ trợ thì đừng ghi ngầm trong URL.

Điều kiện đạt: Mở bookmark deal cũ vào đúng drawer; Account→Coverage/Money/Opportunities chỉ đúng khách. Back trở lại danh sách/filter trước; ID không hợp lệ báo thiếu record chứ không lặng lẽ mở tất cả.

Nguồn: [src/App.tsx:269](<E:/Antigravity project/Memoire/src/App.tsx:269>), [src/features/coverage/PortfolioCoveragePage.tsx](<E:/Antigravity project/Memoire/src/features/coverage/PortfolioCoveragePage.tsx>), [src/features/accounts/AccountsPage.tsx](<E:/Antigravity project/Memoire/src/features/accounts/AccountsPage.tsx>).


### R2-09 · P2 · Số linked records của catalog và Records của report khác phạm vi


Cải tiến cách đọc số. Bước 1, 26, 27.

PMM trong demo có 4 linked records, report qualified chỉ có 2 vì loại Leads. Production cũng có linked count lớn hơn số qualified. Hai số có thể đều đúng, nhưng nhãn trên catalog chưa cho biết population.

Tác động: Đúng vấn đề người dùng nêu từ đầu: cảm giác Brand chưa record, dù thật ra đang nhìn hai tập dữ liệu khác nhau.

Đề nghị: Catalog hiển thị số Leads, qualified active và closed riêng; link View performance report giải thích phạm vi mặc định. Cho bộ lọc All/Leads/Qualified bằng cùng định nghĩa ở Reports.

Điều kiện đạt: 4 links của PMM giải thích được thành 2 Leads + 2 qualified records; đổi population của report khớp count tương ứng. Dữ liệu Others manual vẫn giữ tên gốc và assignment ID.

Nguồn: [src/features/portfolio/PortfolioPage.tsx:142](<E:/Antigravity project/Memoire/src/features/portfolio/PortfolioPage.tsx:142>), [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>).


### R2-10 · P2 · Playbook áp thiếu sót MEDDIC của deal cho Leads


Lỗi phạm vi đã tái hiện. Bước 49.

Business impact not measurable 8x bao gồm 5 qualified active và 3 Leads. Source chỉ lọc status Active, không loại stage Lead. Chính Leads đã có bộ bằng chứng Fit/Contact/Need/Engagement/Next move khác.

Tác động: Cảnh báo cấp High bị phình to vì đánh giá cuộc nói chuyện ban đầu như deal cần bảo vệ forecast.

Đề nghị: Tách pattern cho Leads với pattern cho qualified pipeline; chỉ chấm các tiêu chí phù hợp stage. Giữ threshold tối thiểu và tránh chữ often khi chỉ có một quan sát.

Điều kiện đạt: Ba Leads không cộng vào MEDDIC deal gap. Lead được đánh giá bằng qualification evidence; frequency và các khách liên quan giải thích được, có bộ lọc scope.

Nguồn: [src/utils/salesPlaybook.ts:81](<E:/Antigravity project/Memoire/src/utils/salesPlaybook.ts:81>), [src/utils/salesPlaybook.ts:300](<E:/Antigravity project/Memoire/src/utils/salesPlaybook.ts:300>).


### R2-11 · P2 · Vai trò chưa xác nhận vẫn được trình bày như Champion


Cải tiến ý nghĩa vai trò. Bước 23, 43.

Dr. Avery có nhãn Champion trên account/map trong khi Role confirmed chưa được tick. MEDDIC giữ đúng việc chưa tính đây là bằng chứng Strong.

Tác động: Phần nhìn nhanh mạnh hơn bằng chứng thật, nhất là khi người đọc chỉ xem map hoặc account.

Đề nghị: Dùng Proposed/Tentative Champion cho vai trò chưa xác nhận; phân biệt job title với quyền quyết định đã kiểm chứng; cho biết nguồn và lần xác nhận.

Điều kiện đạt: Bỏ tick confirmed làm các badge/map chuyển sang tentative; phân loại và MEDDIC không mâu thuẫn. Không suy ra Economic Buyer chỉ từ tên chức danh.

Nguồn: [src/features/stakeholders/StakeholdersPage.tsx](<E:/Antigravity project/Memoire/src/features/stakeholders/StakeholdersPage.tsx>), [src/features/accounts/AccountsPage.tsx](<E:/Antigravity project/Memoire/src/features/accounts/AccountsPage.tsx>), [src/utils/meddicLite.ts](<E:/Antigravity project/Memoire/src/utils/meddicLite.ts>).


### R2-12 · P2 · Preset Which payments need attention còn đưa đơn đã thu đủ


Cải tiến preset. Bước 28, 29, 30.

Preset trả 4 orders, trong đó 2 đã collected. Số tiền tổng và CSV đúng. Đây là sự lệch giữa câu hỏi chọn và population trả về, không phải sai phép cộng.

Tác động: Danh sách công việc thu tiền lẫn lịch sử đã hoàn tất.

Đề nghị: Mặc định outstanding>0 hoặc thiếu evidence cần xử lý; có lựa chọn Include collected để xem toàn bộ lịch sử. Giữ unknown amount/date cần attention, không loại sạch bằng filter số.

Điều kiện đạt: Ca demo chỉ còn Summit và Orion trong attention; đơn thu đủ nằm trong history. Missing value/rate hoặc ngày chưa xác nhận vẫn có đường xem rõ.

Nguồn: [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>), [src/domain/reports/reportQuestions.ts:6](<E:/Antigravity project/Memoire/src/domain/reports/reportQuestions.ts:6>).


### R2-13 · P2 · Nudge biến giá trị chưa biết thành 0 USD


Lỗi đã đối chiếu DOM và nguồn. Bước 18, 63.

Atlas thử nghiệm không có amount/currency; main priority nói missing evidence nhưng nudge Weak pipeline ghi 0 USD. DOM lưu được ở bước63; ảnh63 chỉ hiển thị phần trên Today, không phải vị trí của nudge.

Tác động: Dữ liệu thiếu bị trình bày như giá trị zero có thật.

Đề nghị: Giữ null xuyên suốt RevenueActionItem và nudge; hiển thị Amount not recorded hoặc không in số. Nếu phải sắp xếp, dùng độ rủi ro/tuổi và không diễn giải giá trị unknown là 0.

Điều kiện đạt: Amount trống không render 0; amount zero thực vẫn render 0 và được phân biệt. Missing FX không biến thành cash zero hoặc mất record.

Nguồn: [src/utils/revenueView.ts:231](<E:/Antigravity project/Memoire/src/utils/revenueView.ts:231>), [src/utils/proactiveNudges.ts:219](<E:/Antigravity project/Memoire/src/utils/proactiveNudges.ts:219>), [src/utils/proactiveNudges.ts:210](<E:/Antigravity project/Memoire/src/utils/proactiveNudges.ts:210>).


### R2-14 · P2 · Vault gửi sang câu hỏi Ask không hỗ trợ


Lỗi handoff và giới hạn ngôn ngữ đã tái hiện. Bước 38, 40, 41, 47.

Vault tạo Who signs at Northstar Foods? nhưng Ask trả unsupported. Câu tiếng Việt Khách nào còn nợ tiền? cũng chưa hỗ trợ; English Where is money stuck? có đáp án. Unsupported lại gợi ý việc chung Send revised quote và missing decision maker không gắn đúng câu hỏi.

Tác động: App tự gợi một đường không đi được, và hướng người dùng sang một việc có vẻ liên quan nhưng thiếu căn cứ.

Đề nghị: Dùng chung intent registry cho gợi ý của Vault và parser của Ask. Hỗ trợ cách hỏi tiếng Việt phổ biến, hoặc hiện rõ các câu có hỗ trợ. Unsupported phải trung tính và gợi câu gần nghĩa, không phát sinh business advice toàn workspace.

Điều kiện đạt: Mọi suggested question của Today/Vault đều có handler. Who signs trả đúng stakeholder/unknown của khách. Câu tiếng Việt về nợ dẫn tới receivables; unsupported không tự gợi gửi quote cho khách khác.

Nguồn: [src/features/vault/BusinessVaultPage.tsx](<E:/Antigravity project/Memoire/src/features/vault/BusinessVaultPage.tsx>), [src/features/v31/AskMemoirePage.tsx](<E:/Antigravity project/Memoire/src/features/v31/AskMemoirePage.tsx>), [src/features/v31/askMemoireInsightAnswers.ts](<E:/Antigravity project/Memoire/src/features/v31/askMemoireInsightAnswers.ts>).


### R2-15 · P3 · Reports mặc định quá nhiều cột để in và khó đọc trên desktop


Cải tiến bố cục và đầu ra. Bước 28, 29, 61.

Collections preset có 11 cột; Print/save PDF giới hạn8 nên nút mặc định bị tắt. Trên desktop1280, text bị xuống dòng rất hẹp. Chọn preset khi đang ở cuối trang cũng khiến kết quả nằm ngoài vùng nhìn.

Tác động: Một chức năng xuất hiện ngay cạnh kết quả nhưng không dùng được ở cấu hình mặc định; người dùng phải tự đoán cách giảm cột.

Đề nghị: Có layout PDF riêng với tối đa8 cột hoặc landscape/pagination; chọn các cột cần hành động trước và giữ horizontal table scroll thay vì ép chữ. Sau đổi câu hỏi, báo results updated và đưa focus về heading kết quả.

Điều kiện đạt: Mỗi preset mặc định có đầu ra PDF dùng được; CSV giữ đủ cột và tất cả records. Preview được đọc ở1280 và390px; đổi template nhận được thông báo và focus rõ.

Nguồn: [src/features/reports/ReportsPage.tsx](<E:/Antigravity project/Memoire/src/features/reports/ReportsPage.tsx>).


### R2-16 · P3 · Plan mặc định giấu ngày hôm nay khi hôm nay là Chủ nhật


Cải tiến mặc định lịch. Bước 13.

Audit diễn ra Chủ nhật11/10; week board mặc định Monday–Friday, phải Show weekend mới thấy hôm nay. Cách chia dated work và weekly commitments đã rõ hơn vòng1.

Tác động: Người dùng mở Plan hôm nay nhưng không thấy cột của ngày đang làm việc.

Đề nghị: Tự hiện current day nếu là weekend; ghi rõ Monday–Friday view và nhớ lựa chọn lịch theo workspace.

Điều kiện đạt: Mở Plan thứ bảy/chủ nhật có hôm nay hoặc lời nhắc rõ; không tạo thêm task hay thay đổi ngày của task.

Nguồn: [src/features/plan/WeeklyPlanPage.tsx:182](<E:/Antigravity project/Memoire/src/features/plan/WeeklyPlanPage.tsx:182>), [src/features/timeline/TimelinePage.tsx](<E:/Antigravity project/Memoire/src/features/timeline/TimelinePage.tsx>).


### R2-17 · P3 · Nhập landed cost làm tên đơn khuất ở desktop


Cải tiến form chi phí. Bước 11, 12.

Cost form rộng phải cuộn ngang khi focus các trường bên phải; tên order phía trái khuất ở viewport1280. Goods và Extras cho phép currency khác nhau, đúng nhu cầu nhưng dễ nhập nhầm. Phép tính650m−400m−10m=240m VND và36,9% đạt.

Tác động: Người nhập mất dấu đơn đang sửa trong một tác vụ có nhiều số tiền.

Đề nghị: Đặt cost editor trong drawer hoặc giữ Order identity sticky; ưu tiên cùng currency cho extras khi chưa có lựa chọn, nhưng cho đổi riêng khi cần.

Điều kiện đạt: Tên khách/order và currency luôn thấy khi sửa; không ép mọi currency giống nhau. Kết quả multi-currency và missing cost vẫn đúng.

Nguồn: [src/features/revenue/CostAnalysisPage.tsx](<E:/Antigravity project/Memoire/src/features/revenue/CostAnalysisPage.tsx>).


### R2-18 · P3 · Catalog phẳng thiếu tìm kiếm và bộ lọc khi danh mục lớn


Cải tiến quản lý catalog. Bước 1, 26.

Demo17 entries hiện trong một danh sách gồm Business unit/Brand/Product group/Product. Duplicate Tailin được chặn. Chưa có tìm tên/kind/status ngay ở catalog list; Find a deal chỉ phục vụ assignment.

Tác động: Đội có nhiều principal và hàng trăm sản phẩm khó tìm record để sửa alias, parent hoặc retire.

Đề nghị: Thêm search, kind/status/parent filters và paging cho catalog; giữ direct assignment semantics và không roll up child totals nếu chưa có quy tắc phân bổ bundle.

Điều kiện đạt: Tìm đúng entry theo tên/alias/code; retired dễ xem nhưng không dùng cho intake mới. Rename/alias không đổi stableID hay nhân đôi linked records.

Nguồn: [src/features/portfolio/PortfolioPage.tsx](<E:/Antigravity project/Memoire/src/features/portfolio/PortfolioPage.tsx>).


### R2-19 · P3 · Một số nhãn lộ mã nội bộ hoặc nói sai nơi mở


Cải tiến chữ và nhãn. Bước 3, 31, 57.

Quote mở từ Today vẫn ghi Opened from Orders. Dashboard filter hiển thị tên kèm đuôi ID. Search header dùng ⌘K trên Windows. Các nhãn nhỏ này không làm hỏng record nhưng làm người dùng bối rối.

Tác động: Thông tin về đường đi và cách dùng không khớp với thao tác thật.

Đề nghị: Dùng tên surface thật hoặc bỏ eyebrow cố định; giấu ID trừ trường hợp cần phân biệt tên trùng; chọn Ctrl/Command theo nền tảng.

Điều kiện đạt: Today/Orders/Account vào quote có nhãn đúng; filter dùng tên thân thiện với tooltip ID khi cần; phím gợi ý khớp hệ điều hành.

Nguồn: [src/features/quotes/QuotesPage.tsx:264](<E:/Antigravity project/Memoire/src/features/quotes/QuotesPage.tsx:264>), [src/features/dashboards/DashboardsPage.tsx](<E:/Antigravity project/Memoire/src/features/dashboards/DashboardsPage.tsx>), [src/components/layout/TopNav.tsx](<E:/Antigravity project/Memoire/src/components/layout/TopNav.tsx>).


### R2-20 · P2 · Verify-email báo đã gửi dù không có recipient context


Lỗi trạng thái đã tái hiện. Bước 69.

Mở trực tiếp /verify-email, không đăng ký hay gửi email, trang vẫn nói We have sent a verification link. Nút resend chỉ có khi location.state.email còn tồn tại, nên refresh/deep link không có đường gửi lại.

Tác động: Người dùng chờ một email không được xác nhận bởi hành động vừa thực hiện và không biết sửa thiếu context thế nào.

Đề nghị: Phân biệt signup/resend accepted với trạng thái không có email; cho nhập lại email hoặc quay lại signup/login bằng lời giải thích rõ. Chỉ nói request accepted, không suy ra email đã đến inbox.

Điều kiện đạt: Truy cập trực tiếp/refresh không báo sent. Người vừa signup thấy email đã che bớt và resend có phản hồi thật. Kiểm thử delivery/expiry riêng bằng tài khoản test khi có sender.

Nguồn: [src/features/auth/VerifyEmailPage.tsx:14](<E:/Antigravity project/Memoire/src/features/auth/VerifyEmailPage.tsx:14>), [src/features/auth/VerifyEmailPage.tsx:45](<E:/Antigravity project/Memoire/src/features/auth/VerifyEmailPage.tsx:45>).


### R2-21 · P3 · Marketing gọi chênh Quoted−Paid là tiền không về ngân hàng


Cải tiến ý nghĩa minh họa. Bước 71, 72.

Minh họa Quoted412K, Ordered255K, Paid74K được gọi338K never made it to the bank. Trong đó157K mới là báo giá chưa thành order; chưa thể coi toàn bộ338K là tiền đã kiếm được hoặc khoản phải thu.

Tác động: Thông điệp quảng bá mạnh hơn ý nghĩa dữ liệu mà sản phẩm đã cố phân biệt Won và cash.

Đề nghị: Gọi đây là quoted-to-cash gap và tách phần chưa được đặt hàng, committed unpaid, delivered not invoiced và overdue confirmed. Khớp tên Money/Orders/Collections đang dùng.

Điều kiện đạt: Minh họa không gọi báo giá chưa nhận là nợ hay cash đã kiếm. Chú giải rõ funnel stock/cohort và đơn vị; không cần thay con số demo.

Nguồn: [src/components/marketing/charts.tsx](<E:/Antigravity project/Memoire/src/components/marketing/charts.tsx>), [src/features/useCases/UseCasesPage.tsx](<E:/Antigravity project/Memoire/src/features/useCases/UseCasesPage.tsx>), [src/features/guides/QuoteToCashPage.tsx](<E:/Antigravity project/Memoire/src/features/guides/QuoteToCashPage.tsx>).


### R2-22 · P3 · Thông tin trước đăng ký và hỗ trợ nhập mật khẩu còn mỏng


Cải tiến đăng ký và đăng nhập. Bước 66, 68, 74.

Signup có policy12+ ký tự và autocomplete; chưa có liên kết Privacy/Terms tại form, không có show-password. Form liên hệ lại có purpose và Privacy link rõ. Thông báo cloud unconfigured ở localhost là cấu hình audit chủ ý, không phải lỗi production.

Tác động: Người dùng đăng ký khó kiểm tra mật khẩu dài và phải quay về footer để hiểu cách dùng dữ liệu.

Đề nghị: Đưa Privacy/Terms/Product boundaries phù hợp cạnh form; thêm show/hide password có tên, trạng thái và hoạt động bằng keyboard. Không yêu cầu thêm bước nếu không cần.

Điều kiện đạt: Links mở được; show/hide không thay nội dung, focus hay password-manager autocomplete. Không đưa technical setup text cho end-user trên deployment đã cấu hình.

Nguồn: [src/features/auth/SignupPage.tsx](<E:/Antigravity project/Memoire/src/features/auth/SignupPage.tsx>), [src/features/auth/LoginPage.tsx](<E:/Antigravity project/Memoire/src/features/auth/LoginPage.tsx>).


### R2-23 · P3 · Dashboard gọi record zero là contributing Outstanding


Cải tiến cách giải thích nguồn. Bước 31, 32.

Only records contributing to Outstanding trả4/4, gồm2 đơn outstanding0. Zero là giá trị hợp lệ trong phép tổng nên không phải lỗi tổng tiền; từ contributing khiến người dùng kỳ vọng chỉ còn đơn có số dư.

Tác động: Drilldown số tiền đang mắc kẹt vẫn chứa record không mắc kẹt.

Đề nghị: Đổi nhãn Valid values included in this measure hoặc thêm Only non-zero. Giữ tùy chọn xem toàn population để đối soát missing/excluded.

Điều kiện đạt: Valid4, non-zero2 trong ca này; unknown không được đưa vào nhóm valid. Count, total và excluded reasons giải thích được từ captured report run.

Nguồn: [src/features/dashboards/DashboardsPage.tsx](<E:/Antigravity project/Memoire/src/features/dashboards/DashboardsPage.tsx>).


### R2-24 · P2 · Privacy còn mô tả cơ chế shared brief đã nghỉ


Nội dung cũ đã đối chiếu nguồn. Bước 73.

Privacy mô tả brief nằm trong URL fragment, không uploaded, ai có link đều đọc và không expiry. App hiện redirect /share/brief về home, trong khi SharedWorkspacesPanel dùng cấu hình và invitation/account sync. Không có share nào được thực hiện trong audit.

Tác động: Người đọc không có lời giải thích đúng cho chức năng sharing đang tồn tại.

Đề nghị: Đối chiếu từng tuyên bố privacy/boundaries với các cơ chế hiện tại; mô tả rõ link retired, permission-based shared workspace và dữ liệu được sync. Đây là review tính chính xác nội dung sản phẩm, không kết luận pháp lý.

Điều kiện đạt: Tài liệu mô tả đúng đường đang dùng; old link được giải thích đã nghỉ. Hành vi quyền, invite accept/decline và revoke được kiểm chứng bằng hai account test trước khi tuyên bố về access.

Nguồn: [src/features/legal/LegalPage.tsx:80](<E:/Antigravity project/Memoire/src/features/legal/LegalPage.tsx:80>), [src/App.tsx:113](<E:/Antigravity project/Memoire/src/App.tsx:113>), [src/features/reviews/SharedWorkspacesPanel.tsx](<E:/Antigravity project/Memoire/src/features/reviews/SharedWorkspacesPanel.tsx>).


Điểm cần kiểm chứng thêm / giới hạn vận hành


- **C1 · FX override là browser-local:** WorkspaceSettings ghi rõ rate override ở browser. Cần hai thiết bị của cùng owner để xác nhận một report có cùng FX basis. Nếu chưa đồng bộ, nên có per-account FX version hoặc banner về thiết bị đang dùng; chưa xác nhận một production discrepancy.

- **C2 · Opportunity và Brand assignment vẫn là hai lần ghi:** opportunityStore.ts:246–261 ghi deal trước, link Brand sau; catch trả warning repair, không transaction. Cần fault injection để nghiệm thu không có dữ liệu trôi nổi khi link thất bại; đề xuất durable pending repair hoặc atomic write. Happy path liên kết catalog/Others đã đạt.

- **C3 · InitiativeSGD không phải lỗi khi payload nóiSGD:** OperatingSystemPage.tsx:107 tạo mới với reporting currency; dòng304/387 giữ currency của record cũ. Không đổi currency của số đã nhập chỉ vì đổi reporting currency. Loại giả thuyết labelSGD sai khỏi danh sách defect.

- **D1 · Email digest chưa hoạt động trên deployment hiện tại:** Production Settings ở bước76 nói sender/scheduled delivery chưa được cấu hình. Lưu preference không làm email tới inbox. Cần cấu hình và nghiệm thu sender, cron, unsubscribe, owner isolation trước khi xem là feature hoàn tất.

- **D2 · Cảnh báo sync ở tab cũ tự hồi phục:** Khi quay lại tab production cũ có Sync issue bên cạnh Catalog cloud sync completed. Mở Settings đã trở về Cloud available/None known unsynced, không bấm Retry và không console error. Ghi nhận incident, chưa kết luận mất dữ liệu hay lỗi sync kéo dài.


Trình tự đề nghị


Thứ tự xử lý đề nghị: (1) canonical money/target currency cho R2-01,02,04; (2) mệnh đề Capture và các action-date cho R2-03; (3) Review, Account identity, Coverage và Lead/Playbook scope cho R2-05–14; (4) preset, layout, catalog scale và public copy cho P3 cùng Verify/Privacy. Sau mỗi phần, lặp lại đúng fixture và tiêu chí đạt, rồi mới mở rộng kiểm tra. Nghiệm thu hai account/cloud recovery và sender là một checkpoint riêng;249 checks hiện tại không thay được các ca acceptance mới.


Bằng chứng và giới hạn


- Production chỉ đọc qua tài khoản QC hư cấu đang mở; local demo có seed riêng, cloud intentionally disabled. Lỗi chức năng được tái hiện trên local đúng source SHA545b27b; chưa tuyên bố đã tái hiện tất cả bằng production mutation.

- 76 lần chụp,73 ảnh nhận,3 ảnh loại vì sai transition/vị trí (6,35,58). Ảnh được đọc từ chính file đã lưu. DOM cùng bước chứa phần ngoài viewport; phát hiện dựa DOM được nói rõ.

- 249 kiểm tra tự động hiện tại đạt (162 core +87 supporting). Đây là bộ kiểm tra có sẵn, không chứng minh các lỗi mới đã sửa. Pure probes xác nhận hành vi lỗi hiện tại; không được dùng như một acceptance PASS.

- Không chạy full check/build lại vì không thay app source. Không push/deploy, không migration, không đổi production record hoặc người nhận dữ liệu.

- Restore/undo vào tài khoản thật, storage quota/offline failure, hai-owner race, invitation/revoke access, OAuth, password change, digest delivery, billing/checkout, admin và cloud import là named gaps. Có source review/unit coverage ở một số nhóm, chưa có runtime acceptance vòng2.

- Mobile là viewport390x844 trong browser; không đại diện Safari/Android/installed PWA thật. Keyboard Search focus/Escape và required field đã thử; chưa đánh giá toàn bộ tab order, contrast, touch targets hay screen reader. Không tuyên bố đạt WCAG.

- Đã reset và exit local demo sau thử nghiệm. Quote Paid đã phục hồi Due trước receipt test; Atlas lead, receipt100M, margin cost và saved demo report/dashboard được loại theo sample cleanup. Dữ liệu thật và cloud được giữ nguyên.

- Không gọi các count khác population, zero hợp lệ trong contributor set, SGD có payload currency, native datalist hoặc gate founder là lỗi phép tính. Timeout do thao tác automation tìm nút export trước Run được loại; export đã tải thành công.


Các bước và ảnh đã lưu


| Bước | Nội dung | Sức khỏe | Liên quan |

|---:|---|---|---|

| 1 | Brand trên production | Cải tiến | R2-09, R2-18 |

| 2 | Today | Ổn trong ca thử | — |

| 3 | Today mở quote | Cải tiến | R2-01, R2-19 |

| 4 | Lưu Paid thử nghiệm | Cần sửa | — |

| 5 | Quote giữ Paid | Cần sửa | R2-01 |

| 6 | Ảnh chuyển trang | Loại ảnh | — |

| 7 | Collections đối chiếu Paid | Cần sửa | R2-01 |

| 8 | Lịch thu mở rộng | Cải tiến | — |

| 9 | Ghi receipt một phần | Ổn trong ca thử | R2-01, R2-02 |

| 10 | Margin thiếu cost | Ổn trong ca thử | — |

| 11 | Form cost | Cải tiến | R2-17 |

| 12 | Margin đã tính | Ổn trong ca thử | R2-17 |

| 13 | Plan tuần | Cải tiến | R2-16 |

| 14 | Composer cam kết | Cải tiến | — |

| 15 | Plan lịch sử | Ổn trong ca thử | — |

| 16 | Leads queue | Ổn trong ca thử | — |

| 17 | Others cần tên manual | Ổn trong ca thử | — |

| 18 | Qualify Lead | Cải tiến | R2-07, R2-13 |

| 19 | Thông báo Account link | Cần sửa | R2-07 |

| 20 | Đường deal cũ | Cần sửa | R2-08 |

| 21 | Accounts book | Cải tiến | R2-07 |

| 22 | Account overview | Cải tiến | R2-08 |

| 23 | Account people | Cải tiến | R2-11 |

| 24 | Coverage | Cần sửa | R2-05, R2-08 |

| 25 | Coverage mở deal mới | Ổn trong ca thử | R2-05 |

| 26 | Catalog chặn trùng | Cải tiến | R2-09, R2-18 |

| 27 | Report Brand | Cải tiến | R2-09 |

| 28 | Preset khoản thu | Cải tiến | R2-12, R2-15 |

| 29 | Kết quả khoản thu | Cải tiến | R2-02, R2-12, R2-15 |

| 30 | Report CSV pack | Ổn trong ca thử | R2-02, R2-12 |

| 31 | Dashboard từ report | Cải tiến | R2-19, R2-23 |

| 32 | Dashboard source records | Cải tiến | R2-23 |

| 33 | Review thay đổi | Cần sửa | R2-06 |

| 34 | Review analytics | Cải tiến | — |

| 35 | Ảnh cuộn chưa tới bảng | Loại ảnh | — |

| 36 | Business review | Cần sửa | R2-06 |

| 37 | Capture tiếng Việt | Cần sửa | R2-03 |

| 38 | Ask câu tiếng Việt | Giới hạn | R2-14 |

| 39 | Ask về Apex | Cải tiến | R2-08 |

| 40 | Ask không hỗ trợ | Cần sửa | R2-14 |

| 41 | Ask về tiền | Cần sửa | R2-02, R2-14 |

| 42 | Ask guard khi thiếu khách | Ổn trong ca thử | — |

| 43 | Stakeholder chưa xác nhận | Cải tiến | R2-11 |

| 44 | Objections ledger | Cải tiến | — |

| 45 | Form objection | Giới hạn | — |

| 46 | Vault map và text | Cải tiến | — |

| 47 | Vault chuyển Ask | Cần sửa | R2-14 |

| 48 | Initiative editor | Cải tiến | — |

| 49 | Playbook | Cần sửa | R2-10 |

| 50 | Assets | Giới hạn | — |

| 51 | Settings Workspace | Ổn trong ca thử | R2-04 |

| 52 | Settings Account | Giới hạn | — |

| 53 | Settings Billing | Giới hạn | — |

| 54 | Settings Privacy | Cải tiến | — |

| 55 | Settings Export | Ổn trong ca thử | — |

| 56 | Scoreboard đối chiếu | Cần sửa | R2-04, R2-06 |

| 57 | Global Search | Cải tiến | R2-19 |

| 58 | Ảnh mobile chưa đúng trang | Loại ảnh | — |

| 59 | Leads mobile | Ổn trong ca thử | — |

| 60 | Lead form mobile | Ổn trong ca thử | — |

| 61 | Reports mobile | Cải tiến | R2-15 |

| 62 | Must-win priorities | Ổn trong ca thử | — |

| 63 | Founder import gate / Today | Giới hạn | R2-13 |

| 64 | Reset demo | Ổn trong ca thử | — |

| 65 | Landing | Cải tiến | — |

| 66 | Login | Giới hạn | R2-22 |

| 67 | Forgot password | Giới hạn | — |

| 68 | Signup | Cải tiến | R2-22 |

| 69 | Verify-email thiếu context | Cần sửa | R2-20 |

| 70 | Pricing | Ổn trong ca thử | — |

| 71 | Use Cases | Cải tiến | R2-21 |

| 72 | Quote-to-cash guide | Cải tiến | R2-21 |

| 73 | Privacy public | Cần sửa | R2-24 |

| 74 | Contact form | Giới hạn | R2-22 |

| 75 | 404 | Ổn trong ca thử | — |

| 76 | Sync production | Giới hạn | — |


Gallery theo thứ tự



### Bước 1 · Brand trên production · Cải tiến


![Bước 1: Brand trên production](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/01-production-brands.png>)

Production authenticated simulated QC R5 account. Catalog linked counts include Lead-stage records, while performance excludes Leads; inspect whether difference is explained. No cloud writes.

DOM: [01-production-brands.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/01-production-brands.txt>)


### Bước 2 · Today · Ổn trong ca thử


![Bước 2: Today](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/02-today.png>)

Local sample scope. Compare priority moves and overdue figure with Collections; assess action link specificity.

DOM: [02-today.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/02-today.txt>)


### Bước 3 · Today mở quote · Cải tiến


![Bước 3: Today mở quote](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/03-today-to-quote.png>)

Start the day from Today opened Quotes with selected overdue quote editor. Context says Opened from Orders although origin was Today. Compare action named Check collection with destination/edit form.

DOM: [03-today-to-quote.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/03-today-to-quote.txt>)


### Bước 4 · Lưu Paid thử nghiệm · Cần sửa


![Bước 4: Lưu Paid thử nghiệm](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/04-quote-paid.png>)

Changed sample Summit quote Payment to Paid and saved successfully; no payment receipt entered. Compare Collections for same opportunity ID.

DOM: [04-quote-paid.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/04-quote-paid.txt>)


### Bước 5 · Quote giữ Paid · Cần sửa


![Bước 5: Quote giữ Paid](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/05-quote-paid-status.png>)

Sample quote Q-DEMO-SUMMIT-01 persisted Payment Paid without recording receipt. Screenshot displays status, DOM shows Quote updated.

DOM: [05-quote-paid-status.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/05-quote-paid-status.txt>)


### Bước 7 · Collections đối chiếu Paid · Cần sửa


![Bước 7: Collections đối chiếu Paid](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/07-collections-paid-conflict.png>)

Accepted Collections view. Same Summit quote manually Paid remains 25000 USD confirmed overdue in receipts ledger; cash calculation does not invent a receipt.

DOM: [07-collections-paid-conflict.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/07-collections-paid-conflict.txt>)


### Bước 8 · Lịch thu mở rộng · Cải tiến


![Bước 8: Lịch thu mở rộng](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/08-collection-expanded.png>)

Expanded Summit: 25000 USD amount, Received 0 USD, outstanding 25000 USD. Amount input explicitly VND, received-on/how recorded. Delivery date input blank while trigger comes from recorded milestones; explain inherited date near field.

DOM: [08-collection-expanded.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/08-collection-expanded.txt>)


### Bước 9 · Ghi receipt một phần · Ổn trong ca thử


![Bước 9: Ghi receipt một phần](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/09-partial-receipt.png>)

Recorded fictional receipt 100000000 VND on current date. Remaining Summit balance became 21153.85 USD, from 25000. Receipt listed exactly once; remove control present, no accounting export or bank sync implied.

DOM: [09-partial-receipt.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/09-partial-receipt.txt>)


### Bước 10 · Margin thiếu cost · Ổn trong ca thử


![Bước 10: Margin thiếu cost](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/10-margin.png>)

Local sample currently has no recorded order costs; inspect missing-cost disclosure and guided input. New partial receipt only changes cash, not sale value or landed cost.

DOM: [10-margin.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/10-margin.txt>)


### Bước 11 · Form cost · Cải tiến


![Bước 11: Form cost](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/11-margin-cost-form.png>)

Cost recording on a local sample order; assess blank cost, FX and margin basis.

DOM: [11-margin-cost-form.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/11-margin-cost-form.txt>)


### Bước 12 · Margin đã tính · Ổn trong ca thử


![Bước 12: Margin đã tính](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/12-margin-calculated.png>)

650m sold, 400m goods plus 10m freight VND => 240m gross/650m =36.923%; UI 9.2K USD/37%. Missing costs excluded.

DOM: [12-margin-calculated.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/12-margin-calculated.txt>)


### Bước 13 · Plan tuần · Cải tiến


![Bước 13: Plan tuần](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/13-plan-week.png>)

Frozen weekly priorities distinguished from dated execution; Sunday hidden by default despite selected current day; backlog label zero carried vs visible overdue current-week bill.

DOM: [13-plan-week.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/13-plan-week.txt>)


### Bước 14 · Composer cam kết · Cải tiến


![Bước 14: Composer cam kết](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/14-commitment-customer.png>)

Customer search Northstar has no suggestion in seeded local demo; no opportunity selector. Typed customer allowed, assess lineage in source.

DOM: [14-commitment-customer.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/14-commitment-customer.txt>)


### Bước 15 · Plan lịch sử · Ổn trong ca thử


![Bước 15: Plan lịch sử](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/15-history.png>)

Captured original text vs accepted linked deal is explicit, but source/hash/internal tags dominate visible cards.

DOM: [15-history.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/15-history.txt>)


### Bước 16 · Leads queue · Ổn trong ca thử


![Bước 16: Leads queue](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/16-leads-queue.png>)

Three local leads separated from qualified pipeline; evidence and scheduled nurture visible.

DOM: [16-leads-queue.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/16-leads-queue.txt>)


### Bước 17 · Others cần tên manual · Ổn trong ca thử


![Bước 17: Others cần tên manual](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/17-lead-others-validation.png>)

Others selected with blank manual name: native required validation prevents creation.

DOM: [17-lead-others-validation.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/17-lead-others-validation.txt>)


### Bước 18 · Qualify Lead · Cải tiến


![Bước 18: Qualify Lead](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/18-qualified-opportunity.png>)

Same newly created lead becomes Discovery, Others manual brand retained, contact retained in stakeholder option. Account warning says no account record, while details hint claims already-linked existing customer.

DOM: [18-qualified-opportunity.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/18-qualified-opportunity.txt>)


### Bước 19 · Thông báo Account link · Cần sửa


![Bước 19: Thông báo Account link](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/19-account-link-hint.png>)

Details claims linked to an existing customer although overview reports no matching Account record. Recommendation base hint on verified account ID.

DOM: [19-account-link-hint.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/19-account-link-hint.txt>)


### Bước 20 · Đường deal cũ · Cần sửa


![Bước 20: Đường deal cũ](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/20-legacy-deal-link.png>)

Known legacy App.tsx deal-ID route redirects to generic opportunity list, loses specific deal query/drawer.

DOM: [20-legacy-deal-link.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/20-legacy-deal-link.txt>)


### Bước 21 · Accounts book · Cải tiến


![Bước 21: Accounts book](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/21-accounts-book.png>)

Account exposure displays qualified active pipeline, not receivables; sample Summit has 0 active deals despite overdue cash. Orphan account repair visible.

DOM: [21-accounts-book.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/21-accounts-book.txt>)


### Bước 22 · Account overview · Cải tiến


![Bước 22: Account overview](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/22-account-overview.png>)

Account detail connects quotes, qualified deals, contact count and dated history. Some Open revenue/opportunities actions lose current account scope.

DOM: [22-account-overview.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/22-account-overview.txt>)


### Bước 23 · Account people · Cải tiến


![Bước 23: Account people](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/23-account-people.png>)

Imported contact names are context, no authority assumed; recorded account-wide role badge lacks per-opportunity confirmation context.

DOM: [23-account-people.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/23-account-people.txt>)


### Bước 24 · Coverage · Cần sửa


![Bước 24: Coverage](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/24-coverage.png>)

Account filter retained from detail; statuses explicit first-touch/proposed/won vs opportunity stage. Inspect hierarchy and no invented gaps.

DOM: [24-coverage.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/24-coverage.txt>)


### Bước 25 · Coverage mở deal mới · Ổn trong ca thử


![Bước 25: Coverage mở deal mới](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/25-coverage-new-opportunity.png>)

Empty matrix cell prefilled customer and Scitek catalog Brand in new Opportunity drawer. No save performed.

DOM: [25-coverage-new-opportunity.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/25-coverage-new-opportunity.txt>)


### Bước 26 · Catalog chặn trùng · Cải tiến


![Bước 26: Catalog chặn trùng](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/26-catalog-duplicate.png>)

Duplicate normalized Brand name is rejected. Catalog is a long flat list, no search/kind filter visible at 17 entries.

DOM: [26-catalog-duplicate.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/26-catalog-duplicate.txt>)


### Bước 27 · Report Brand · Cải tiến


![Bước 27: Report Brand](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/27-reports-performance.png>)

Results first, qualified scope, missing money preserved; catalog PMM 4 linked versus report 2 explained by Leads exclusion, but no easy lead segmentation on catalog.

DOM: [27-reports-performance.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/27-reports-performance.txt>)


### Bước 28 · Preset khoản thu · Cải tiến


![Bước 28: Preset khoản thu](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/28-reports-collections.png>)

Collections preset auto-runs; inspect actual received amount, confirmed overdue and due basis after local partial receipt.

DOM: [28-reports-collections.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/28-reports-collections.txt>)


### Bước 29 · Kết quả khoản thu · Cải tiến


![Bước 29: Kết quả khoản thu](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/29-report-cash-result.png>)

Actual ledger aligns with Collections 55,769.23 outstanding,21,153.85 confirmed overdue,29,230.77 receipts. Payments attention preset includes 2 fully collected rows.

DOM: [29-report-cash-result.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/29-report-cash-result.txt>)


### Bước 30 · Report CSV pack · Ổn trong ca thử


![Bước 30: Report CSV pack](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/30-report-exported.png>)

Local saved report re-run then CSV pack downloaded; includes full filtered rows, summary, run metadata; first pre-run attempt was audit automation timeout, not product export defect.

DOM: [30-report-exported.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/30-report-exported.txt>)


### Bước 31 · Dashboard từ report · Cải tiến


![Bước 31: Dashboard từ report](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/31-dashboard-from-report.png>)

Saved report generates auto-run unsaved dashboard. Filters expose raw ID suffixes even unique labels. Snapshot time/source coverage explicit.

DOM: [31-dashboard-from-report.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/31-dashboard-from-report.txt>)


### Bước 32 · Dashboard source records · Cải tiến


![Bước 32: Dashboard source records](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/32-dashboard-source.png>)

Source inspect preserves captured run; checkbox includes zero outstanding rows as contributing. Define contributing versus in-scope wording.

DOM: [32-dashboard-source.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/32-dashboard-source.txt>)


### Bước 33 · Review thay đổi · Cần sửa


![Bước 33: Review thay đổi](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/33-review-weekly.png>)

Weekly scoreboard: 2 won/43.5K USD; Business review same Oct5–11 says 1 won/18.5K USD. Changes uses close-out ledger while scoreboard infers stage Won. Targets seed 10B USD with demo base USD: unrealistic.

DOM: [33-review-weekly.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/33-review-weekly.txt>)


### Bước 34 · Review analytics · Cải tiến


![Bước 34: Review analytics](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/34-review-analytics.png>)

Analytic scopes include outcome history versus present book; low sample warning exists but advice says big deals are failing from only 6 outcomes. Need more cautious language and source links.

DOM: [34-review-analytics.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/34-review-analytics.txt>)


### Bước 36 · Business review · Cần sửa


![Bước 36: Business review](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/36-review-business-outcomes.png>)

Same-week business review includes only Northstar480m VND,18.5K USD (closeout-based), requiring explicit source basis/union dedupe for consistency.

DOM: [36-review-business-outcomes.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/36-review-business-outcomes.txt>)


### Bước 37 · Capture tiếng Việt · Cần sửa


![Bước 37: Capture tiếng Việt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/37-capture-vietnamese-negation.png>)

Vietnamese note: chưa xác nhận PO becomes Purchase order signal; gửi báo giá thứ ba tuần sau incorrectly gets Oct20 belonging to second callback clause. Nothing saved.

DOM: [37-capture-vietnamese-negation.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/37-capture-vietnamese-negation.txt>)


### Bước 38 · Ask câu tiếng Việt · Giới hạn


![Bước 38: Ask câu tiếng Việt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/38-ask-money-vietnamese.png>)

Asked common Vietnamese cash phrase Khách nào còn nợ tiền?; DOM response unsupported, screenshot still initial ask state. Use follow-up capture for answer evidence.

DOM: [38-ask-money-vietnamese.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/38-ask-money-vietnamese.txt>)


### Bước 39 · Ask về Apex · Cải tiến


![Bước 39: Ask về Apex](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/39-ask-account-answer.png>)

Account lookup lists two qualified opportunities; Open Accounts action generic loses account scope.

DOM: [39-ask-account-answer.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/39-ask-account-answer.txt>)


### Bước 40 · Ask không hỗ trợ · Cần sửa


![Bước 40: Ask không hỗ trợ](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/40-ask-unsupported-money.png>)

Common Vietnamese cash phrasing is unsupported; generic suggested next action Send revised quote appears unrelated to question. Support phrase or show close supported cash preset without unrelated advice.

DOM: [40-ask-unsupported-money.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/40-ask-unsupported-money.txt>)


### Bước 41 · Ask về tiền · Cần sửa


![Bước 41: Ask về tiền](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/41-ask-supported-cash.png>)

Supported preset shows money from same ledger with recorded due basis; compare unsupported Vietnamese phrase.

DOM: [41-ask-supported-cash.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/41-ask-supported-cash.txt>)


### Bước 42 · Ask guard khi thiếu khách · Ổn trong ca thử


![Bước 42: Ask guard khi thiếu khách](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/42-ask-followup-context.png>)

Global draft refuses multiple accounts and requests explicit account; good guard.

DOM: [42-ask-followup-context.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/42-ask-followup-context.txt>)


### Bước 43 · Stakeholder chưa xác nhận · Cải tiến


![Bước 43: Stakeholder chưa xác nhận](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/43-stakeholder-confirmation.png>)

Dr Avery labeled Champion in account map, but Role confirmed by evidence unchecked; MEDDIC correctly refuses strong champion. Surface tentative/confirmed on same map.

DOM: [43-stakeholder-confirmation.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/43-stakeholder-confirmation.txt>)


### Bước 44 · Objections ledger · Cải tiến


![Bước 44: Objections ledger](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/44-objections.png>)

Status filters, proof needed and dates clear. At-stake amount includes won Summit25K, so state/scope label needed to distinguish sales blocker from delivery dispute.

DOM: [44-objections.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/44-objections.txt>)


### Bước 45 · Form objection · Giới hạn


![Bước 45: Form objection](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/45-objection-form.png>)

Required objection text, IDs via scope resolution, separate response/proof/resolution fields. No save performed.

DOM: [45-objection-form.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/45-objection-form.txt>)


### Bước 46 · Vault map và text · Cải tiến


![Bước 46: Vault map và text](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/46-vault-library.png>)

Vault provides map plus text list and explicit missing facts; relationship amount does not label inclusion of lost deal values. Gap actions send exact question to Ask.

DOM: [46-vault-library.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/46-vault-library.txt>)


### Bước 47 · Vault chuyển Ask · Cần sửa


![Bước 47: Vault chuyển Ask](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/47-vault-to-ask-gap.png>)

System-generated Who signs at Northstar Foods question: verify meaningful fact answer versus name lookup shortcut.

DOM: [47-vault-to-ask-gap.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/47-vault-to-ask-gap.txt>)


### Bước 48 · Initiative editor · Cải tiến


![Bước 48: Initiative editor](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/48-initiative-editor.png>)

Initiative has objective/owner/next action/explicit activity links and hypothesis. Value field fixed SGD while app reports USD; status free text. No save.

DOM: [48-initiative-editor.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/48-initiative-editor.txt>)


### Bước 49 · Playbook · Cần sửa


![Bước 49: Playbook](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/49-playbook.png>)

Metrics gap counts all 8 active records, including 3 unqualified Leads. Low/medium sample badges exist, but single completed action labeled often unclear.

DOM: [49-playbook.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/49-playbook.txt>)


### Bước 50 · Assets · Giới hạn


![Bước 50: Assets](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/50-assets.png>)

Sales asset library supports draft/reuse status; no real sharing performed.

DOM: [50-assets.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/50-assets.txt>)


### Bước 51 · Settings Workspace · Ổn trong ca thử


![Bước 51: Settings Workspace](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/51-settings-workspace.png>)

Reporting currency USD; explicit planning FX date, separate financing assumptions; honest demo-local sync, disabled retry and backup recovery explanation. Read-only.

DOM: [51-settings-workspace.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/51-settings-workspace.txt>)


### Bước 52 · Settings Account · Giới hạn


![Bước 52: Settings Account](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/52-settings-account.png>)

Demo account has no real profile and explains sign-in requirement. Password, OAuth and profile cloud save not executed.

DOM: [52-settings-account.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/52-settings-account.txt>)


### Bước 53 · Settings Billing · Giới hạn


![Bước 53: Settings Billing](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/53-settings-billing.png>)

Demo plan clearly sample and cloud billing not configured. No checkout or financial action.

DOM: [53-settings-billing.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/53-settings-billing.txt>)


### Bước 54 · Settings Privacy · Cải tiến


![Bước 54: Settings Privacy](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/54-settings-privacy.png>)

Data & Privacy gives explicit source boundaries and links terms/privacy; inspected copy, no disclosure or sharing action.

DOM: [54-settings-privacy.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/54-settings-privacy.txt>)


### Bước 55 · Settings Export · Ổn trong ca thử


![Bước 55: Settings Export](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/55-settings-export.png>)

Demo ZIP downloaded successfully; restore disabled in demo, deletion control observed but not activated. Actual ZIP contents will be inspected offline.

DOM: [55-settings-export.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/55-settings-export.txt>)


### Bước 56 · Scoreboard đối chiếu · Cần sửa


![Bước 56: Scoreboard đối chiếu](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/56-review-scoreboard-confirmed.png>)

Oct5–11 Scoreboard 2 wins / 43,461.54 USD, whereas Business review 1 win /18,461.54. Also displays Q4 2.5B USD and annual10B USD targets; verify stored target currency before treating as calculation defect.

DOM: [56-review-scoreboard-confirmed.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/56-review-scoreboard-confirmed.txt>)


### Bước 57 · Global Search · Cải tiến


![Bước 57: Global Search](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/57-global-search.png>)

Search Apex returns canonical account and two opportunities. Focus enters dialog; Escape dismissal checked separately. Header shortcut uses Command glyph in Windows environment: copy polish opportunity.

DOM: [57-global-search.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/57-global-search.txt>)


### Bước 59 · Leads mobile · Ổn trong ca thử


![Bước 59: Leads mobile](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/59-mobile-leads-confirmed.png>)

Verified /app/leads at390x844. Mobile lead cards and bottom navigation; no document-wide overflow observed via DOM check.

DOM: [59-mobile-leads-confirmed.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/59-mobile-leads-confirmed.txt>)


### Bước 60 · Lead form mobile · Ổn trong ca thử


![Bước 60: Lead form mobile](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/60-mobile-lead-form.png>)

390x844 Lead drawer. BrandSelect catalog/options retained; form scrolls internally and footer actions visible; empty required Customer keeps save disabled. Cancel without save.

DOM: [60-mobile-lead-form.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/60-mobile-lead-form.txt>)


### Bước 61 · Reports mobile · Cải tiến


![Bước 61: Reports mobile](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/61-mobile-reports.png>)

390x844 Reports: results, preset choices and customization present in DOM; screenshot verifies top result layout only. No formal end-to-end screen-reader/mobile-device acceptance. Configuration is scroll-intensive.

DOM: [61-mobile-reports.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/61-mobile-reports.txt>)


### Bước 62 · Must-win priorities · Ổn trong ca thử


![Bước 62: Must-win priorities](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/62-operating-priorities.png>)

Supporting Must-win work keeps initiative separate from Today ranked queue, shows one explicit local sample priority and unrecorded value as Not set.

DOM: [62-operating-priorities.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/62-operating-priorities.txt>)


### Bước 63 · Founder import gate / Today · Giới hạn


![Bước 63: Founder import gate / Today](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/63-founder-import.png>)

Founder import route is gated and redirected to Today in demo; no import file or cloud commit tested. Today nudge renders unknown-value Atlas deal as 0 USD, whereas main priority correctly says missing evidence. Source follow-up required.

DOM: [63-founder-import.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/63-founder-import.txt>)


### Bước 64 · Reset demo · Ổn trong ca thử


![Bước 64: Reset demo](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/64-demo-reset.png>)

Reset through normal demo recovery restored4 open qualified deals and overdue25K USD, removing Atlas trial and100M receipt. Sample definition cleanup is covered by sampleData source; no production data changed. Demo then exited normally.

DOM: [64-demo-reset.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/64-demo-reset.txt>)


### Bước 65 · Landing · Cải tiến


![Bước 65: Landing](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/65-public-landing.png>)

Exited demo successfully to landing; no console errors. Value proposition, sample demo CTA, signup and pricing publicly discoverable. No form submission.

DOM: [65-public-landing.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/65-public-landing.txt>)


### Bước 66 · Login · Giới hạn


![Bước 66: Login](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/66-login.png>)

Login has labelled email/password with appropriate input types and forgot-password link. Local cloud is intentionally unconfigured; no auth submission, OAuth or email delivery tested. Screenshot has no show-password control.

DOM: [66-login.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/66-login.txt>)


### Bước 67 · Forgot password · Giới hạn


![Bước 67: Forgot password](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/67-forgot-password.png>)

Recovery page labelled email and explicit return-to-login; no email submitted. Delivery, expiry and recovery link not exercised.

DOM: [67-forgot-password.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/67-forgot-password.txt>)


### Bước 68 · Signup · Cải tiến


![Bước 68: Signup](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/68-signup.png>)

Signup labels, name/email/autocomplete/password policy visible. No account created. Privacy/terms links absent from the signup surface; consider providing context before submission.

DOM: [68-signup.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/68-signup.txt>)


### Bước 69 · Verify-email thiếu context · Cần sửa


![Bước 69: Verify-email thiếu context](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/69-verify-email-without-state.png>)

Direct /verify-email without signup/email state still says We have sent a verification link, but offers no resend action. No email was sent in this audit; refresh/deep link loses recipient context.

DOM: [69-verify-email-without-state.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/69-verify-email-without-state.txt>)


### Bước 70 · Pricing · Ổn trong ca thử


![Bước 70: Pricing](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/70-pricing.png>)

Preview free without card or trial countdown; Personal10USD monthly after preview; Team marked Later and not sold. No purchase or checkout tested.

DOM: [70-pricing.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/70-pricing.txt>)


### Bước 71 · Use Cases · Cải tiến


![Bước 71: Use Cases](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/71-public-use-cases.png>)

Use Cases public information read; customer scenarios and sample illustrations, no external form submission.

DOM: [71-public-use-cases.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/71-public-use-cases.txt>)


### Bước 72 · Quote-to-cash guide · Cải tiến


![Bước 72: Quote-to-cash guide](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/72-guide-quote-to-cash.png>)

Quote-to-cash guide publicly readable and ties milestones to commercial follow-up. No claim of invoice issuance or bank integration verified.

DOM: [72-guide-quote-to-cash.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/72-guide-quote-to-cash.txt>)


### Bước 73 · Privacy public · Cần sửa


![Bước 73: Privacy public](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/73-public-privacy.png>)

Privacy document accessible from footer; audit checks discoverability and product description only, not legal compliance.

DOM: [73-public-privacy.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/73-public-privacy.txt>)


### Bước 74 · Contact form · Giới hạn


![Bước 74: Contact form](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/74-public-contact.png>)

Contact request labels and purpose reviewed; no details entered and no request sent.

DOM: [74-public-contact.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/74-public-contact.txt>)


### Bước 75 · 404 · Ổn trong ca thử


![Bước 75: 404](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/75-not-found.png>)

Unknown public route gives clear Page not found and recovery destinations instead of blank screen.

DOM: [75-not-found.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/75-not-found.txt>)


### Bước 76 · Sync production · Giới hạn


![Bước 76: Sync production](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/76-production-sync-recovery.png>)

Read-only production Settings: cloud available, none known unsynced changes after page load. Old-tab Sync issue recovered during navigation, without clicking Retry. Notification panel explicitly states scheduled sender is not configured; preferences alone do not deliver email.

DOM: [76-production-sync-recovery.txt](<E:/Antigravity project/Memoire/docs/qa/evidence/product-audit-round2-2026-10-11/76-production-sync-recovery.txt>)


Ảnh6,35,58 bị loại vì transition/vị trí chưa đúng; không được dùng để kết luận defect. Export và probes dùng dữ liệu mẫu có chủ ý. Source inventory là danh sách file/route để quản lý phạm vi, không có nghĩa mọi nhánh của149 file đã được runtime-tested.