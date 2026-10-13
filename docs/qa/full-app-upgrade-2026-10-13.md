# Memoire — kết quả nâng cấp vòng 2

Cập nhật: 13/10/2026 (Asia/Saigon). Baseline: 545b27b779260d7425729820334ef486cca33a4f.

**24/24 sửa đổi đã triển khai.** Đây là kết luận về thay đổi mã và bằng chứng được ghi dưới đây; không tuyên bố mọi luồng provider và mọi dữ liệu production đã nghiệm thu đầy đủ. Phát hành: đang chờ CI và Vercel trên commit cuối. Receipt phát hành được lưu riêng sau khi kiểm tra live.

Email Digest / D1 tạm hoãn theo yêu cầu người dùng. Không đổi API digest, không cấu hình khóa, không gửi email. Không có migration Supabase và không sửa schema dùng chung với Helm.

## Kết quả chính

- Brand lưu theo catalog hoặc Others có tên gốc. Journal ghi trước, assignment ghi trước deal; lỗi cloud hiện pending, reload giữ thay đổi, retry cùng ID/ngày tạo không sinh bản trùng. Đây là journal phối hợp hai lần ghi, không phải transaction database; pending cần hoàn tất tại browser gốc trước khi dùng thiết bị khác.
- Paid chỉ là projection của receipt ledger. No receipt/partial/full/điều chỉnh không sửa thành tiền thu giả. P&L dùng ngày nhận receipt thật; Ask, Collections, Reports và Dashboard cùng số dư.
- Review và Coverage Money dùng ngày/số tiền chốt thực tế và cùng canonical outcomes; target giữ currency; missing amount/rate giữ unavailable. Ngày planning/edit không trở thành ngày Won.
- Capture tiếng Việt giữ phủ định; hai việc được lưu ngày 13/10 và 20/10. Vault gap hỏi đúng handler, unsupported Ask trả lời trung tính.
- Account, legacy deal và Plan links giữ scope/ID. Catalog giữ Brand chưa có deal; Coverage nói no recorded deal, không suy diễn never sold.

## 24 sửa đổi

| Điểm | Vấn đề | Trạng thái mã | Bằng chứng mới |
|---|---|---|---|
| R2-01 | Quote có thể ghi Paid khi chưa có tiền thu | Implemented | [10-quote-paid-proof.dom.txt](evidence/full-app-upgrade-2026-10-12/10-quote-paid-proof.dom.txt); [11-adjusted-collection.dom.txt](evidence/full-app-upgrade-2026-10-12/11-adjusted-collection.dom.txt); [test/unit/round2CriticalRegression.test.mjs](../../test/unit/round2CriticalRegression.test.mjs) |
| R2-02 | Ask tính tiền chưa thu bằng giá trị gốc, bỏ qua thu một phần | Implemented | [06-ask-partial-cash.dom.txt](evidence/full-app-upgrade-2026-10-12/06-ask-partial-cash.dom.txt); [23-payment-report-after-receipt.dom.txt](evidence/full-app-upgrade-2026-10-12/23-payment-report-after-receipt.dom.txt); [payments-report.zip](evidence/full-app-upgrade-2026-10-12/payments-report.zip) |
| R2-03 | Capture tiếng Việt hiểu sai phủ định PO và gắn nhầm hạn của hai việc | Implemented | [15-vietnamese-capture.dom.txt](evidence/full-app-upgrade-2026-10-12/15-vietnamese-capture.dom.txt); [16-capture-saved.dom.txt](evidence/full-app-upgrade-2026-10-12/16-capture-saved.dom.txt); [27-plan-capture-handoff.dom.txt](evidence/full-app-upgrade-2026-10-12/27-plan-capture-handoff.dom.txt) |
| R2-04 | Scoreboard bỏ currency của mục tiêu doanh số | Implemented | [19-review-period-targets.dom.txt](evidence/full-app-upgrade-2026-10-12/19-review-period-targets.dom.txt); [34-money-review-close-parity.dom.txt](evidence/full-app-upgrade-2026-10-12/34-money-review-close-parity.dom.txt); [test/unit/round2CriticalRegression.test.mjs](../../test/unit/round2CriticalRegression.test.mjs) |
| R2-05 | Coverage suy diễn quá mức từ các deal đã ghi | Implemented | [18-coverage-semantics.dom.txt](evidence/full-app-upgrade-2026-10-12/18-coverage-semantics.dom.txt); [36-unused-brand-coverage.dom.txt](evidence/full-app-upgrade-2026-10-12/36-unused-brand-coverage.dom.txt); [test/unit/round2ProductRegression.test.mjs](../../test/unit/round2ProductRegression.test.mjs) |
| R2-06 | Review có hai kết quả thắng khác nhau cho cùng tuần | Implemented | [19-review-period-targets.dom.txt](evidence/full-app-upgrade-2026-10-12/19-review-period-targets.dom.txt); [20-review-analytics.dom.txt](evidence/full-app-upgrade-2026-10-12/20-review-analytics.dom.txt); [test/unit/round2ProductRegression.test.mjs](../../test/unit/round2ProductRegression.test.mjs) |
| R2-07 | Form Opportunity nói đã link Account dù Account chưa tồn tại | Implemented | [src/features/opportunities/OpportunitiesPage.tsx](../../src/features/opportunities/OpportunitiesPage.tsx); [smoke-opportunities.dom.txt](evidence/full-app-upgrade-2026-10-12/smoke-opportunities.dom.txt) |
| R2-08 | Một số đường điều hướng làm mất khách hoặc deal đang xử lý | Implemented | [17-account-collections-scope.dom.txt](evidence/full-app-upgrade-2026-10-12/17-account-collections-scope.dom.txt); [27-plan-capture-handoff.dom.txt](evidence/full-app-upgrade-2026-10-12/27-plan-capture-handoff.dom.txt); [38-legacy-deal-id.dom.txt](evidence/full-app-upgrade-2026-10-12/38-legacy-deal-id.dom.txt) |
| R2-09 | Số linked records của catalog và Records của report khác phạm vi | Implemented | [02-brand-catalog.dom.txt](evidence/full-app-upgrade-2026-10-12/02-brand-catalog.dom.txt); [03-brand-report.dom.txt](evidence/full-app-upgrade-2026-10-12/03-brand-report.dom.txt); [14-others-linked-reload.dom.txt](evidence/full-app-upgrade-2026-10-12/14-others-linked-reload.dom.txt) |
| R2-10 | Playbook áp thiếu sót MEDDIC của deal cho Leads | Implemented | [12-lead-evidence.dom.txt](evidence/full-app-upgrade-2026-10-12/12-lead-evidence.dom.txt); [smoke-playbook.dom.txt](evidence/full-app-upgrade-2026-10-12/smoke-playbook.dom.txt); [src/utils/salesPlaybook.ts](../../src/utils/salesPlaybook.ts) |
| R2-11 | Vai trò chưa xác nhận vẫn được trình bày như Champion | Implemented | [28-people-role-evidence.dom.txt](evidence/full-app-upgrade-2026-10-12/28-people-role-evidence.dom.txt); [src/utils/meddicStakeholderMap.ts](../../src/utils/meddicStakeholderMap.ts) |
| R2-12 | Preset Which payments need attention còn đưa đơn đã thu đủ | Implemented | [23-payment-report-after-receipt.dom.txt](evidence/full-app-upgrade-2026-10-12/23-payment-report-after-receipt.dom.txt); [payments-report.zip](evidence/full-app-upgrade-2026-10-12/payments-report.zip) |
| R2-13 | Nudge biến giá trị chưa biết thành 0 USD | Implemented | [test/unit/round2ProductRegression.test.mjs](../../test/unit/round2ProductRegression.test.mjs); [src/utils/revenueView.ts](../../src/utils/revenueView.ts) |
| R2-14 | Vault gửi sang câu hỏi Ask không hỗ trợ | Implemented | [07-unsupported-ask.dom.txt](evidence/full-app-upgrade-2026-10-12/07-unsupported-ask.dom.txt); [21-vault-gap-links.dom.txt](evidence/full-app-upgrade-2026-10-12/21-vault-gap-links.dom.txt); [22-vault-question-answer.dom.txt](evidence/full-app-upgrade-2026-10-12/22-vault-question-answer.dom.txt) |
| R2-15 | Reports mặc định quá nhiều cột để in và khó đọc trên desktop | Implemented | [39-print-layout.json](evidence/full-app-upgrade-2026-10-12/39-print-layout.json); [23-payment-report-after-receipt.dom.txt](evidence/full-app-upgrade-2026-10-12/23-payment-report-after-receipt.dom.txt); [src/features/reports/reports.css](../../src/features/reports/reports.css) |
| R2-16 | Plan mặc định giấu ngày hôm nay khi hôm nay là Chủ nhật | Implemented | [27-plan-capture-handoff.dom.txt](evidence/full-app-upgrade-2026-10-12/27-plan-capture-handoff.dom.txt); [src/features/plan/WeeklyPlanPage.tsx](../../src/features/plan/WeeklyPlanPage.tsx) |
| R2-17 | Nhập landed cost làm tên đơn khuất ở desktop | Implemented | [32-cost-order-context.dom.txt](evidence/full-app-upgrade-2026-10-12/32-cost-order-context.dom.txt); [33-cost-saved.dom.txt](evidence/full-app-upgrade-2026-10-12/33-cost-saved.dom.txt) |
| R2-18 | Catalog phẳng thiếu tìm kiếm và bộ lọc khi danh mục lớn | Implemented | [02-brand-catalog.dom.txt](evidence/full-app-upgrade-2026-10-12/02-brand-catalog.dom.txt); [35-unused-brand-catalog.dom.txt](evidence/full-app-upgrade-2026-10-12/35-unused-brand-catalog.dom.txt) |
| R2-19 | Một số nhãn lộ mã nội bộ hoặc nói sai nơi mở | Implemented | [08-quote-receipt-proof.dom.txt](evidence/full-app-upgrade-2026-10-12/08-quote-receipt-proof.dom.txt); [24-dashboard-contributors.dom.txt](evidence/full-app-upgrade-2026-10-12/24-dashboard-contributors.dom.txt); [src/components/layout/TopNav.tsx](../../src/components/layout/TopNav.tsx) |
| R2-20 | Verify-email báo đã gửi dù không có recipient context | Implemented | [31-verify-direct-recovery.dom.txt](evidence/full-app-upgrade-2026-10-12/31-verify-direct-recovery.dom.txt); [scripts/verify-auth-recovery-contract.mjs](../../scripts/verify-auth-recovery-contract.mjs) |
| R2-21 | Marketing gọi chênh Quoted−Paid là tiền không về ngân hàng | Implemented | [src/components/marketing/charts.tsx](../../src/components/marketing/charts.tsx); [scripts/verify-trust-boundary-contract.mjs](../../scripts/verify-trust-boundary-contract.mjs) |
| R2-22 | Thông tin trước đăng ký và hỗ trợ nhập mật khẩu còn mỏng | Implemented | [30-signup-controls.dom.txt](evidence/full-app-upgrade-2026-10-12/30-signup-controls.dom.txt); [smoke-login.dom.txt](evidence/full-app-upgrade-2026-10-12/smoke-login.dom.txt) |
| R2-23 | Dashboard gọi record zero là contributing Outstanding | Implemented | [25-dashboard-zero-valid.dom.txt](evidence/full-app-upgrade-2026-10-12/25-dashboard-zero-valid.dom.txt); [26-dashboard-nonzero.dom.txt](evidence/full-app-upgrade-2026-10-12/26-dashboard-nonzero.dom.txt) |
| R2-24 | Privacy còn mô tả cơ chế shared brief đã nghỉ | Implemented | [smoke-privacy.dom.txt](evidence/full-app-upgrade-2026-10-12/smoke-privacy.dom.txt); [scripts/verify-trust-boundary-contract.mjs](../../scripts/verify-trust-boundary-contract.mjs) |

## Acceptance matrix: 17 nhóm

Browser local dùng dữ liệu demo hư cấu; các bản ghi bổ sung có nhãn SIMULATED QC. Screenshot/DOM là trạng thái tại thời điểm chụp; source/unit/contract không được gọi là full browser acceptance. Phiên production được mở là tài khoản QC hư cấu Orion Calibration Partners, không phải tài khoản dữ liệu thật của người dùng.

| Nhóm | Bằng chứng browser | Phạm vi / giới hạn |
|---|---|---|
| Today | [DOM](evidence/full-app-upgrade-2026-10-12/01-today.dom.txt) | Đã mở và đối chiếu nguồn receipt qua workspace projection; không dùng dismiss như bằng chứng thu tiền. |
| Plan | [DOM](evidence/full-app-upgrade-2026-10-12/27-plan-capture-handoff.dom.txt) | Capture tạo hai việc đúng ngày; link deal giữ ID. Mặc định cuối tuần đọc nguồn; không đổi đồng hồ hệ thống để giả nghiệm thu Chủ nhật. |
| Leads | [DOM](evidence/full-app-upgrade-2026-10-12/12-lead-evidence.dom.txt) | Others thiếu tên bị chặn; tạo Lead, tải lại và đối soát classification thật trong demo. |
| Accounts | [DOM](evidence/full-app-upgrade-2026-10-12/17-account-collections-scope.dom.txt) | Account → Collections giữ khách và số dư; orphan repair được hiển thị. |
| Opportunities | [DOM](evidence/full-app-upgrade-2026-10-12/38-legacy-deal-id.dom.txt) | Link cũ mở đúng ID; Brand validation và save faults được kiểm tra ở store. |
| Money / Orders | [DOM](evidence/full-app-upgrade-2026-10-12/34-money-review-close-parity.dom.txt) | No/partial/full/điều chỉnh receipt; cost và margin lưu trong demo; cash/P&L/date/FX có regression. |
| Review | [DOM](evidence/full-app-upgrade-2026-10-12/19-review-period-targets.dom.txt) | Cùng canonical close-outs; currency mục tiêu được đổi; ngày kế hoạch không thành ngày thắng. |
| Products & Brands | [DOM](evidence/full-app-upgrade-2026-10-12/14-others-linked-reload.dom.txt) | Catalog/Others, total/Lead/qualified/closed, tìm kiếm/bộ lọc và Brand zero được kiểm tra. |
| Reports | [DOM](evidence/full-app-upgrade-2026-10-12/23-payment-report-after-receipt.dom.txt) | CSV pack 11 cột và metadata khớp; print DOM 8 cột/2 rows. PDF từ hộp thoại hệ thống chưa xác nhận. |
| Dashboards | [DOM](evidence/full-app-upgrade-2026-10-12/25-dashboard-zero-valid.dom.txt) | Hai widget từ saved report; valid zero giữ lại, non-zero lọc riêng; totals khớp report. |
| Capture / Ask / Search | [DOM](evidence/full-app-upgrade-2026-10-12/16-capture-saved.dom.txt) | Ghi chú VN lưu thật trong demo; phủ định/hai hạn; Ask partial cash, unsupported và Vault handler. |
| People / Objections | [DOM](evidence/full-app-upgrade-2026-10-12/28-people-role-evidence.dom.txt) | People hiển thị Tentative; Objection ledger mở được; không đổi vai trò thật trên production. |
| Vault / Playbook / Assets | [DOM](evidence/full-app-upgrade-2026-10-12/22-vault-question-answer.dom.txt) | Câu hỏi gap nhận handler đúng; ba thư viện mở được; không phát sinh share/import asset. |
| Operating priorities | [DOM](evidence/full-app-upgrade-2026-10-12/smoke-operating-priorities.dom.txt) | Must-win work mở được; unit/contracts tiếp tục kiểm tra linkage và tiền gốc. |
| Settings / data recovery | [DOM](evidence/full-app-upgrade-2026-10-12/29-fx-basis-warning.dom.txt) | Cảnh báo FX local; restore/owner/quota được kiểm tra bằng runtime store/SQL tests. Không restore dữ liệu thật. |
| Public / onboarding / auth | [DOM](evidence/full-app-upgrade-2026-10-12/31-verify-direct-recovery.dom.txt) | Signup/password/Privacy/Terms/Verify trực tiếp; không gửi reset/verification email, không chạy OAuth/checkout. |
| Internal / administrative gates | [DOM](evidence/full-app-upgrade-2026-10-12/smoke-admin-gate.dom.txt) | Admin yêu cầu sign-in; Imports redirect đúng; server gate/RLS runtime tests. Không thao tác admin production. |

## Các mục vận hành và giới hạn

| Mục | Kết luận |
|---|---|
| C2 | Brand journal đã triển khai; tests quota, assignment refusal, lost acknowledgement, offline cloud, reload, same-ID retry và owner guard. Không chứng nhận cleanup 100% Brand cũ trên tài khoản thật; phiên production có sẵn là tài khoản QC. Tên legacy chưa xác nhận chỉ được phân loại sau lựa chọn catalog/Others của chủ sở hữu. |
| C1 | Đã cảnh báo custom FX là browser-local; CSV ghi đủ basis/rates. Cùng basis được kiểm tra ở engine. Chưa có nghiệm thu trên hai thiết bị vật lý độc lập; không tuyên bố FX overrides đã cloud-sync. |
| D1 | Tạm hoãn bởi người dùng. |
| D2 | Runtime real stores với network client thay thế xác nhận pending/reload/retry/owner isolation. Incident tab cũ ban đầu không được tái hiện; không kết luận mất dữ liệu production. |
| PDF | Preset 11 cột có nút in; print DOM 8 cột chứa 2 rows và cùng totals. Browser điều khiển bị timeout khi mở hộp thoại in hệ thống; chưa có file PDF thực tế. CSV pack đã tải và đối soát. |
| Provider / access | Không gửi email, tạo account mới, OAuth, billing, invitation hoặc revoke người thật; các contract/server tests đạt không thay cho nghiệm thu provider đầu cuối. |

## Kiểm tra và phục hồi

Kiểm tra cuối: npm run check gồm build, API typecheck, lint, unit tests và toàn bộ contract/runtime checks. Số test và trạng thái cuối được ghi trong [checks](evidence/full-app-upgrade-2026-10-12/checks.json) sau khi process kết thúc. Không dùng kết quả audit cũ để chứng nhận code mới.

Đối soát dữ liệu hư cấu: receipt 100 triệu VND → Summit còn 550 triệu VND / 21.153,85 USD; thêm 550 triệu → Collected/Paid; bỏ khoản mô phỏng 550 triệu → quay về partial. Attention report: 2/4 source orders; outstanding 55.769,23 USD; recorded receipts trong scope 3.846,15 USD. Dashboard cùng số. Q4 Won 50.384,62 USD và target 96.153,85 USD khớp Review/Money.

Rollback ứng dụng về baseline đã triển khai trước đó; giữ receipt ledger/catalog và pending journal. Không rollback dữ liệu mù theo phiên bản giao diện. Bằng chứng fixture không chứng nhận dữ liệu thực hoặc một giao dịch ngân hàng.
