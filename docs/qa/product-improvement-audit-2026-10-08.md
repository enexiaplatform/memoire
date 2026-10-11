# Rà soát sản phẩm Memoire — 08–09/10/2026

Quan sát bắt đầu ngày 08/10; báo cáo được hoàn thiện ngày 09/10/2026, múi giờ Asia/Saigon. Tên thư mục giữ ngày bắt đầu để các ảnh và tham chiếu liên tục.

Các phát hiện và ảnh dưới đây giữ trạng thái lúc audit. Xem [tiến độ xử lý từng phần](<E:/Antigravity project/Memoire/docs/qa/product-remediation-2026-10-09.md>) để biết phần nào đã sửa và kiểm chứng sau đó.

Memoire đã có phần lớn thành phần cần thiết để theo dõi một công việc bán hàng từ Lead đến thu tiền. Điều cần cải thiện trước tiên là **độ nhất quán của kết luận và thứ tự của công việc**, vì cùng một hồ sơ có thể được các màn hình diễn giải khác nhau. Sau đó mới nên mở rộng biểu đồ, tự động hóa hoặc tính năng phối hợp.

Đánh giá này dựa trên thao tác thực tế trong app, ảnh chụp được kiểm tra trong lần chạy này và đối chiếu mã nguồn. Những đề xuất về thiết kế là nhận định sản phẩm; chúng không được trình bày như lỗi kỹ thuật đã chứng minh.

## Phạm vi và giới hạn

- Bản mã: `e72d04b` cùng các thay đổi chưa commit trong workspace, bao gồm sửa liên kết Brand ở lượt trước. Vì vậy đây là đánh giá **bản local hiện tại**, không phải xác nhận bản production đã có sửa Brand.
- Môi trường kiểm tra: app local, dữ liệu mẫu trong một trình duyệt riêng, kết nối cloud bị vô hiệu hóa bằng cấu hình của tiến trình thử. Không sửa dữ liệu thật, gửi thư, chia sẻ quyền, thanh toán hoặc triển khai.
- Đã đi qua 10 khu vực chính, các màn hình theo ngữ cảnh, 46 bước kiểm tra và đối chứng tiếng Việt/tiếng Anh. Kiểm tra điện thoại ở khung 390 × 844; đây là kiểm tra bố cục trong trình duyệt, chưa phải kiểm tra thiết bị thật.
- Đã chạy mới 103 kiểm thử liên quan đến qualification, Capture, Coverage, tuổi phản đối và Vault replay: 103 pass, 0 fail. Các thử nghiệm nhỏ bổ sung tái hiện việc Account bị coi là chưa chạm tới và Metrics được đánh giá Strong khi chưa có lợi ích khách hàng định lượng.
- Chưa kiểm tra đầu cuối trong lần này: đăng nhập cloud/OAuth, email xác minh và đặt lại mật khẩu, đồng bộ hai thiết bị, phân quyền hai tài khoản, khôi phục cloud, thanh toán, gửi digest, quyền admin/founder, connector trực tiếp và khối lượng dữ liệu production. Những phần này được ghi rõ ở bảng phạm vi; không được coi là đã pass.
- Không đưa ra chứng nhận accessibility, security hay tính đúng đắn kế toán. Bàn phím được thử ở một modal cụ thể; chưa đo toàn bộ contrast, screen reader, zoom hoặc chuyển động.
- Một report mẫu được lưu trong demo để kiểm tra đường Report → Dashboard → hồ sơ nguồn. Các ghi chú Capture đối chứng không được lưu.

Ảnh gốc, ghi nhận bước và kết quả thử nằm trong thư mục [evidence](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08>). [Bản xem ảnh theo từng bước](<E:/Antigravity project/Memoire/docs/qa/product-improvement-audit-2026-10-08.html>) đặt ghi chú bên cạnh ảnh tương ứng.

## Những điểm nên giữ

1. Lead chuyển sang Opportunity trên cùng hồ sơ, giúp giữ lịch sử và bằng chứng.
2. Today có ba việc ưu tiên và đường đi đến hồ sơ cụ thể; không phải một dashboard chỉ để nhìn.
3. Orders, Collections và Margin đã là ba góc đọc trong Money; thiếu cost được báo là thiếu, không tự biến thành lợi nhuận bằng không.
4. Capture có bản xem trước, sửa từng trường và mô tả tác động trước khi lưu. Dữ liệu nguồn bên ngoài được phân biệt với sự thật đã chấp nhận.
5. Reports ghi population, thời điểm chạy, tiền tệ, nguồn và số hồ sơ; Dashboard có đường xem hồ sơ nguồn. Mẫu report không công bố win rate khi chỉ có hai deal đã quyết định.
6. Brand đã được sửa theo hướng catalog ID hoặc Others có tên nhập tay ở bản local. Hướng này nên được dùng nhất quán cho các danh tính khác.
7. Giao diện điện thoại có thẻ Lead thay cho bảng lớn, và biểu mẫu có nút lưu cố định.
8. Settings mô tả nơi lưu dữ liệu, trạng thái sync và giới hạn restore tương đối rõ. Source có bước preview và undo restore; thao tác restore thật chưa chạy trong audit này.

## Thang ưu tiên và mức bằng chứng

**P1:** ảnh hưởng đến hiểu đúng dữ liệu, việc cần làm hoặc khả năng thao tác. **P2:** giảm công nhập, tìm kiếm, đọc và lỗi thao tác. **P3:** mở rộng hoặc hoàn thiện sau khi luồng chính ổn định. Đây là ưu tiên đề xuất, không phải cam kết thời gian.

**Thực tế:** đã nhìn thấy/tái hiện trong app hoặc bằng đầu vào thử riêng. **Diễn đạt:** phép tính có thể đúng theo mô hình hiện tại nhưng nhãn/kết luận dễ bị hiểu quá mức. **Đề xuất:** cải thiện sản phẩm cần lựa chọn thiết kế. **Cần tái hiện:** nguồn có dấu hiệu đáng kiểm tra, chưa xác nhận tác động đầu cuối.

## Các phát hiện chính

### F01 — Metrics có thể Strong khi chưa có lợi ích khách hàng định lượng — P1, thực tế

Trong hồ sơ service renewal của Apex, Metrics đạt 4/4 và bằng chứng hiện ra chỉ là `Estimated value: 520,000,000 VND`. Đối chứng độc lập với một hồ sơ 12.000 USD, tên sản phẩm `Compliance solution`, không có evidence, cũng trả về Metrics Strong và không có gap. `reviewMetrics` đang dùng giá trị bán hàng làm metric, còn từ khóa chung trong tên sản phẩm làm business impact.

**Cải thiện:** tách giá trị deal với lợi ích khách hàng. Ghi baseline, mục tiêu, đơn vị, người xác nhận và nguồn; dữ liệu chưa đủ chỉ nên Partial. Metrics trong MEDDPICC đề cập giá trị định lượng mà giải pháp đem lại, theo [mô tả của MEDDICC](https://meddicc.com/meddpicc-sales-methodology-and-process). Việc chỉ có giá bán không chứng minh phần này.

**Nghiệm thu:** deal chỉ có giá bán và tên sản phẩm chung không thể Strong. Bằng chứng giảm thời gian, giảm chi phí hoặc tăng năng lực phải có số đo và cơ sở xác nhận phù hợp. Nguồn: `src/utils/meddicLite.ts:166`; bước 09, ảnh 09b; `evidence/.../probes.json`.

### F02 — Cùng deal vừa Ready to advance vừa thiếu bằng chứng cho stage hiện tại — P1, thực tế

Service renewal ở Proposal hiển thị “Ready to advance”, đề nghị tiến tới Negotiation và “Nothing here puts this deal on the watch-list”. Ngay phía dưới, MEDDIC nói evidence chỉ hỗ trợ Qualification, thiếu champion và chưa thể bảo vệ forecast. Các chiều đánh giá khác nhau đang bị biến thành các chỉ dẫn tổng thể mâu thuẫn.

**Cải thiện:** một kết luận hành động chung, bên dưới phân rõ tiến độ thủ tục, bằng chứng mua hàng và trạng thái forecast. Khi còn blocker, nói “checkpoint đã đủ, còn thiếu champion để bảo vệ forecast” và chỉ rõ việc cần xác nhận.

**Nghiệm thu:** mọi màn hình cùng deal dùng cùng kết luận và cùng bộ blocker; “ready” luôn nói rõ ready cho hành động nào. Nguồn: `src/features/opportunities/OpportunitiesPage.tsx`; bước 08–09.

### F03 — Ngày dự kiến và mốc PO đang tạo ra nhãn Payment/Invoice overdue quá chắc — P1, thực tế + diễn đạt

Today coi Orion là “Payment overdue: Pending PO”. Edit quote của chính Orion lại có PO Pending, Payment Not due và ngày Payment due trống. Money at risk gắn “Invoice overdue” cho hai order còn ở To confirm; một khoản không có payment term và app đang lấy ngày giả định từ order. Collections có giải thích assumption, nhưng nhãn cảnh báo và hành động “Chase payment” vẫn dễ bị hiểu là nghĩa vụ thanh toán đã được xác nhận.

Nguồn cho thấy `buildRevenueView` chiếu collection schedule lên trạng thái quote để đọc cảnh báo, còn `moneyAtRisk` dùng receivable overdue để tạo nhãn invoice dù không yêu cầu có invoice. Đây là vấn đề phân biệt cơ sở dữ liệu và diễn đạt, không kết luận phép trừ bị sai.

**Cải thiện:** chia “đến hạn đã xác nhận”, “dự kiến theo điều khoản”, “thiếu điều khoản/ngày”. Chỉ gọi invoice overdue khi có invoice và ngày đến hạn phù hợp. Nếu còn chờ PO, ưu tiên xác nhận PO hoặc điều khoản; nếu có deposit phải thu trước PO, hiển thị đúng căn cứ đó.

**Nghiệm thu:** người dùng mở cảnh báo và thấy đúng installment, điều khoản, sự kiện kích hoạt, ngày xác nhận và số còn phải thu. Dữ liệu giả định không vào tổng overdue đã xác nhận. Nguồn: `src/utils/revenueView.ts:149`, `src/utils/moneyAtRisk.ts:137`, `src/utils/receivables.ts:280`; bước 02, 10–11, 27.

### F04 — Thu trừ chi được gọi Realized profit — P1, diễn đạt

Analytics hiển thị Realized profit −7,2K USD; card mô tả `Collected − paid out`. Source tính `collectedRevenueBase - paidExpensesBase`. Con số này mô tả dòng tiền thuần của các bản ghi được đưa vào, chưa tự chứng minh lợi nhuận đã thực hiện của đơn hàng hay kỳ kế toán.

**Cải thiện:** đổi nhãn thành “Recorded net cash flow”, hiển thị phạm vi thu/chi và tỷ lệ đầy đủ dữ liệu. Giữ margin của từng order trong Money với giá vốn và basis riêng. Nếu mở tính năng lợi nhuận theo kỳ, phải định nghĩa kỳ và các đầu vào trước.

**Nghiệm thu:** thu chưa có nhưng order có margin không làm người dùng hiểu order đang lỗ chỉ vì cash chưa về. Export dùng cùng nhãn với UI. Nguồn: `src/utils/cashPosition.ts:84`, `src/features/reviews/ReviewAnalyticsSection.tsx:247`; bước 14/35.

### F05 — Account đã có touch bị liệt kê là không có touch trong 30 ngày — P1, thực tế

Analytics nói có 5 khách hàng được chạm tới và 5/5 active deals được tiếp cận, nhưng danh sách “Nothing at all last 30 days” vẫn chứa Apex, Delta, Northstar, Orion và Summit. Đối chứng một event gắn với Opportunity cũng đưa Account của Opportunity vào coverage gap.

`buildCoverageGaps` đối chiếu tên subject của activity trực tiếp với tên Account; subject của một activity có thể là tên Opportunity. Vì vậy activity ở deal không được quy về Account khi tìm account gap.

**Cải thiện:** nối bằng Opportunity ID → Account ID; dùng cùng ánh xạ ở touched, untouched, silence và drill-down. Nurture Lead được đọc riêng khỏi qualified deal.

**Nghiệm thu:** một touch của bất kỳ deal thuộc Account loại Account đó khỏi danh sách “không có touch”, trong cùng phạm vi thời gian. Nguồn: `src/utils/activityAnalytics.ts:305`; bước 14/35; `probes.json`.

### F06 — Lead chưa qualify bị đưa vào Weak forecast risk — P1, thực tế

Today đưa Delta Nutrition / Second QC line vào cảnh báo revenue “Weak pipeline”, trong khi Leads đang đề nghị qualify chính hồ sơ đó. Source tạo pipeline risks từ mọi opportunity Active, thiếu điều kiện qualified; Today truyền toàn bộ collection vào engine này.

**Cải thiện:** dùng một population predicate cho qualified pipeline ở Today, Money, Review, Stakeholders và các cảnh báo forecast. Lead có hàng việc riêng: liên hệ, qualify, nurture hoặc disqualify.

**Nghiệm thu:** Lead không xuất hiện như qualified pipeline/forecast risk trước khi qualify; qualify giữ nguyên ID và lịch sử, sau đó mới đổi population. Nguồn: `src/utils/revenueView.ts:221`, `src/features/dashboard/DashboardPage.tsx:362`; bước 02, 04, 28.

### F07 — Capture và Ask chưa phục vụ tốt ghi chú/câu hỏi tiếng Việt — P1 cho cách sử dụng hiện tại, thực tế

Ghi chú “Đã gọi Dr. Avery tại Apex Labs… Tôi sẽ gửi báo giá Tailin 12000 USD vào ngày 12/10/2026” được link đúng Account/deal, nhưng touch thành Demo / technical discussion, How Not stated, Next action và Due date trống. Bản tiếng Anh tương đương nhận Phone call, next action và 12/10 đúng. Câu hỏi tiếng Việt về Apex bị Ask từ chối, trong khi câu tiếng Anh trả lời được.

**Cải thiện:** khai báo ngôn ngữ hỗ trợ, bổ sung quy tắc tiếng Việt và ghi chú pha tiếng Anh, ngày dd/mm, “ngày mai/thứ Sáu/tuần sau”, “tôi sẽ/cần gửi”. Đưa các trường quan trọng chưa nhận được ra trước nút lưu. Nếu câu hỏi chưa hỗ trợ, cho chọn ý định có sẵn và giữ ngữ cảnh Account.

**Nghiệm thu:** bộ đối chứng hai ngôn ngữ cho cùng ý định tạo cùng facts; không suy đoán một cuộc gọi thành demo kỹ thuật; ngày mơ hồ được hỏi/sửa trước lưu. Nguồn: bước 20–22, 24; ảnh và bản ghi Capture trong evidence.

### F08 — Một công việc có thể tồn tại ở next action, capture promise và weekly commitment — P2, thực tế + đề xuất

Plan có việc gửi revised quote từ next action của Apex và việc gửi revised quote được trích từ Capture. Weekly commitment snapshot lại có câu bao gồm quote và checklist. Số hoàn thành 1/3 của tuần, 0/6 trên Plan và 7 open promises đều có thể đúng theo mỗi nguồn, nhưng người dùng phải hiểu và cập nhật nhiều đơn vị công việc. Bản ghi thread cũng có thể nói “không có commitment” dù next action có ngày.

**Cải thiện:** cho người dùng xem một công việc với các nguồn liên quan; đề nghị liên kết/đối chiếu thay vì tự gộp chỉ vì câu chữ gần giống. Completion của canonical commitment được đọc lại trên Plan và Review; snapshot tuần giữ lịch sử nhưng có đường tới công việc hiện tại.

**Nghiệm thu:** một lần hoàn thành cập nhật đúng công việc trên các màn hình; hai lời hứa thật sự khác nhau vẫn giữ riêng. Nguồn: bước 03, 13, 36, 42.

### F09 — Cần áp dụng kỷ luật liên kết danh tính trên toàn app — P1 về dữ liệu, đề xuất

Brand đã có catalog/Others ở bản local. Accounts vẫn có hàng sửa tên xuất hiện trong Leads nhưng chưa có account record; People tách contact trong profile với stakeholder canonical; Capture hiển thị trường gốc “Not captured” cạnh liên kết đã xác nhận. Đây là các nguồn dễ khiến người dùng nghĩ dữ liệu bị mất hoặc tạo lại bản ghi.

**Cải thiện:** Customer, Person, Brand, Product và Quote đều có lựa chọn record hiện có, tạo record mới rõ ràng, hoặc trạng thái pending review có lý do. Với Brand: catalog ID hoặc Others + tên gốc; alias không tạo Brand trùng. Giữ text gốc để truy nguyên và không tự biến nó thành phân loại đã chấp nhận.

**Nghiệm thu:** mỗi tên đã dùng truy được về record/nhóm Others/trạng thái chưa xác nhận; sửa tên catalog không làm mất liên kết; import có preview unresolved trước commit. Nguồn: bước 05–07, 15, 20, 28, 36; sửa Brand hiện tại nằm trong `src/domain/portfolio/brandSelection.ts` và `src/services/opportunityStore.ts`.

### F10 — Drawer Opportunity quá dài cho công việc hàng ngày — P2, thực tế

Hồ sơ service renewal có 41 controls, chiều cao nội dung 6.407 px trong vùng 820 px, khoảng 7,8 lần chiều cao vùng đọc. Nhiều phần chưa có dữ liệu như forecast premises, simulation, obligations, policies, prerequisites và buyer progress xuất hiện trước Best move, MEDDIC và Details.

**Cải thiện:** đầu hồ sơ giữ customer, deal, stage, giá trị, next action, blocker và điều mới nhất. Chia tabs hoặc sections: Tổng quan, Bằng chứng & People, Quote & Money, Lịch sử; các mô hình nâng cao mở khi cần. Không bỏ dữ liệu hoặc khả năng truy nguyên.

**Nghiệm thu:** đọc tình trạng và sửa next action trong phần đầu; section trống không kéo dài mặc định; đường tới advanced vẫn rõ. Nguồn: bước 09.

### F11 — Today và Review lặp lại quá nhiều bản đọc và lời khuyên — P2, thực tế

Today có Morning brief, Your 3 moves, Five questions, Leads, Money in motion và Watch-list; nhiều phần nhắc cùng Orion/Summit. Review lại có nhiều briefs, scoreboard, next-week priorities và attention queue.

**Cải thiện:** Today có hình tổng quan nhỏ, ba việc chính và phần “cần xác nhận”; phần đọc thêm thu gọn. Review đi theo ba câu: tuần này thay đổi gì, vì sao, tuần tới cam kết gì. Brief/export là các định dạng của cùng một bản review.

**Nghiệm thu:** cùng vấn đề xuất hiện một lần trong hàng hành động, các cảnh báo hỗ trợ tập hợp dưới nó; không làm mất sự phân biệt giữa việc có hạn và lời khuyên. Nguồn: bước 02–03, 13–14, 37.

### F12 — Reports yêu cầu cấu hình trước khi người dùng thấy câu trả lời — P2, thực tế + đề xuất

Mẫu report lập tức hiện builder với population, columns, AND/OR, groups và measures. Hai mẫu hiện tại quá rộng cho các câu hỏi thường ngày; trên điện thoại thư viện chiếm phần đầu, kết quả cần cuộn xa hơn.

**Cải thiện:** mở một report bằng kết quả đã chạy; “Chỉnh báo cáo” là bước sau. Thêm preset theo công việc: pipeline theo Brand, đơn tới hạn thu, deal thiếu next action, Lead theo nguồn, margin thiếu cost, khách hàng ít được tiếp cận. Advanced builder vẫn giữ cho nhu cầu tự cấu hình.

**Nghiệm thu:** chọn câu hỏi → có câu trả lời và nguồn trước; sửa filter không làm người dùng nhầm kết quả cũ là kết quả mới. Nguồn: bước 16–17, 40.

### F13 — Dashboard cần xem trước tự động và nguồn đóng góp cho từng chỉ số — P2, thực tế + đề xuất

Đường từ saved report chuẩn bị dashboard draft, nhưng cần bấm Refresh mới có số. Click bar có 7 source records trong scope dù qualified pipeline chỉ đến từ 5 Active deals; UI có giải thích scope nhưng còn tốn công đối chiếu.

**Cải thiện:** chạy preview khi tạo từ report; widget hiển thị thời điểm chạy, scope và trạng thái cần refresh. Drill-down mặc định cho các dòng đóng góp vào measure đã click; có lựa chọn “toàn bộ scope” khi cần. Version và snapshot context tiếp tục được giữ.

**Nghiệm thu:** widget không trống sau handoff thành công; tổng dòng đóng góp khớp measure, và các hồ sơ không đóng góp được giải thích. Nguồn: bước 18–19.

### F14 — Bảng desktop che cột hành động dù chỉ có ít hồ sơ — P2, thực tế

Ở khung mặc định khoảng 1.239 px, bảng Leads, Accounts, Stakeholders và Objections cần cuộn ngang; next move, coverage hoặc at stake bị cắt. Mobile Leads lại có thẻ đọc thuận hơn.

**Cải thiện:** ưu tiên cột tên, trạng thái và next action; details mở trong drawer, cho người dùng chọn cột. Ghim tên/hành động ở bảng cần nhiều cột; matrix dùng trình bày phù hợp thay vì cố nhét mọi trường.

**Nghiệm thu:** các quyết định thường ngày đọc được mà không phải tìm thanh cuộn ngang; bảng phức tạp vẫn truy được dữ liệu đầy đủ. Nguồn: bước 04, 06, 08, 28, 30, 38.

### F15 — Focus bàn phím thoát khỏi modal RecordDrawer — P1 accessibility, thực tế

Trong Stakeholder drawer, Tab từ nút cuối Delete đưa focus ra BODY trong khi dialog vẫn mở và có aria-modal=true. Source chỉ focus lúc mở, Escape và trả focus khi đóng; chưa có vòng focus hoặc inert cho nền.

**Cải thiện:** dùng một modal primitive chung có focus trap, Escape, trả focus và vô hiệu hóa vùng nền. Kiểm tra lại mọi modal dùng primitive này, đặc biệt Leads, Stakeholders và Objections.

**Nghiệm thu:** Tab/Shift+Tab luôn ở trong dialog, Escape đóng, focus trở về nút đã mở; background không nhận focus. Nguồn: `src/components/ui/RecordDrawer.tsx:41`; bước 29, `29-focus-probe.json`. Ảnh chỉ chứng minh trạng thái modal; kết luận focus dựa thêm vào phép thử bàn phím và DOM, không dựa ảnh đơn thuần.

### F16 — Worked example chưa thể hiện một vòng đời danh mục và tiền đầy đủ — P2, thực tế

Demo có deals nhưng catalog Brand bằng 0, 7 qualified deals chưa phân loại, Coverage trống, Must-win trống. Có note “payment received” nhưng bộ Collections chưa có receipt tương ứng; các tên cơ hội trong quote và deal cũng khác nhau. Người mới có thể hiểu đây là lỗi app trước khi hiểu các tầng xác nhận.

**Cải thiện:** seed một bộ ví dụ nhất quán từ Lead → qualify → Brand/Product → Quote → PO → delivery → invoice → receipt; giữ thêm một ví dụ intentionally missing có nhãn giải thích. Report và Dashboard mẫu chạy ngay trên bộ đó.

**Nghiệm thu:** ví dụ có thể được truy từ đầu tới cuối bằng ID; note nhận tiền có bước đề nghị xác nhận receipt, và giải thích rõ note chưa tự tạo tiền. Nguồn: bước 01, 10–17, 34, 36, 41. Những sai khác fixture không được dùng để kết luận mọi dữ liệu thật đều lỗi.

### F17 — Kết luận học hỏi và độ đầy đủ cần nói đúng mức chứng cứ — P2, diễn đạt

Playbook gọi phản hồi là “proven” và “most reliably” với 1/1 resolved. Vault cho Validation Expansion 7/7 known; con số này là độ có dữ liệu, không tự chứng minh buying evidence đã được xác nhận.

**Cải thiện:** “Đã ghi nhận hiệu quả trong 1 trường hợp”; số mẫu, thời điểm và giới hạn áp dụng xuất hiện cạnh nội dung. Tách recorded/confirmed/current ở knowledge completeness và stakeholder coverage.

**Nghiệm thu:** không gọi một mẫu là xu hướng đáng tin; người dùng phân biệt đã ghi với đã xác nhận. Nguồn: bước 07, 28, 31, 33.

### F18 — Công cụ nâng cao cần ngôn ngữ và bước chuẩn bị phù hợp với người bán hàng — P2, thực tế + đề xuất

Review có Shared workspaces, External promise statements, Federated threads, Cross-company prerequisites. Khi mở, người dùng phải xử lý party references, account reference, JSON và integrity/signature khái niệm. Source đã có guard xác nhận và tách received claim khỏi accepted fact; đây là điểm tốt nên giữ.

**Cải thiện:** đặt trong khu vực phối hợp nâng cao theo nhu cầu; wizard chọn người, lời hứa, phạm vi chia sẻ, xem trước và xác nhận. JSON/protocol/reference chỉ mở cho admin hoặc người cần tích hợp. Trước khi mời/chia sẻ thật phải hiện đúng người nhận và nội dung.

**Nghiệm thu:** người dùng hoàn thành một tình huống phối hợp thông thường mà không nhập UUID/JSON; trạng thái draft, synced, sent, received và accepted không bị gộp. Nguồn: bước 42–43; các panel tương ứng trong `src/features/reviews` và `ConnectorExportIntake.tsx`. Chưa thử chia sẻ thật.

### F19 — Chỉ số cần cùng từ điển, population và thời gian — P2, thực tế + đề xuất

Analytics có các tỷ lệ từ current Won/Lost, outcome history và forecast calibration, với các mẫu khác nhau. Reports dùng current classification và all-time outcomes, cũng có ngưỡng tối thiểu riêng. UI đã có một số mẫu số và lời giải thích, nhưng người dùng vẫn phải tự đối chiếu. Totals là USD trong khi nhiều dòng là VND; planning FX là ngày 01/08/2026 và có override trong browser.

**Cải thiện:** một từ điển metric dùng chung; mỗi card có population, ngày, nguồn, FX basis và completeness. Current pipeline, won value, cash collected, snapshot lịch sử và outcome cohort phải có tên riêng. Cho xem giá trị gốc và quy đổi cạnh nhau khi đối chiếu.

**Nghiệm thu:** cùng câu hỏi/cùng scope cho cùng kết quả trên Today, Review, Report và Dashboard; đổi scope luôn nhìn thấy. Nguồn: bước 08, 14, 17, 19, 25, 35.

### F20 — Recovery nên phục vụ việc giải quyết cụ thể, không chỉ thông báo chung — P2, đề xuất + phạm vi giới hạn

Settings có sync/recovery và giới hạn restore rõ. App cũng có nhiều hàng sửa dữ liệu riêng: tên chưa có Account, Brand chưa phân loại, capture chưa xác nhận, cost còn thiếu. Đăng nhập local chưa có cloud còn hiện tên biến cấu hình kỹ thuật cho người dùng.

**Cải thiện:** một nơi tổng hợp “cần kiểm tra” theo record và lý do; mỗi hàng có hành động sửa trực tiếp. Status “saved locally”, “synced”, “conflict”, “retry” phải rõ đến collection/record khi có sự cố. Lỗi vận hành cho người dùng dùng ngôn ngữ đơn giản; chi tiết cấu hình dành cho quản trị.

**Nghiệm thu:** mở một vấn đề dẫn đúng record và trường cần sửa; retry không che partial save; backup/restore cho biết từng collection đã tới cloud hay chưa. Nguồn: bước 06, 15, 25–26, 44–45. Khôi phục, lỗi quota và đồng bộ cloud cần được kiểm tra thực tế ở môi trường phù hợp trước khi coi là đạt.

## Các điểm nguồn cần tái hiện trước khi ghi thành lỗi đầu cuối

| Mã | Dấu hiệu trong bản mã hiện tại | Tác động cần kiểm tra | Cách xác nhận |
|---|---|---|---|
| C01, P1 | `portfolioStore.persist` phát event nhưng không invalidate collection `portfolioRecords`; Coverage đọc workspace cache và không lắng nghe event này. | Coverage/Vault có thể giữ phân loại cũ sau sửa Brand. Reports tự force load nên chưa có căn cứ kết luận Reports gặp cùng lỗi. | Load Coverage, sửa catalog/classification, quay lại Coverage không reload toàn trang; kiểm tra ID và nhãn. |
| C02, P1 | Loader cache dùng `receivableRecords`/`milestoneRecords`; store gọi invalidate `orderReceivables`/`orderMilestones`. Cache phân loại bằng tên chính xác cuối key. | Thu tiền hoặc đánh dấu milestone có thể chưa tới màn hình khác đang đọc collection cache. | Warm Today/Review, cập nhật receipt/milestone, quay lại và đối chiếu; chạy cả guest và signed-in. |
| C03, P2 | Notifications cập nhật toggle trước khi lưu; nhánh lỗi nói “unchanged” nhưng chưa rollback state. Save success có thể nói “Sending at” dù health báo sender chưa cấu hình. Scheduler dùng UTC offset cố định. | UI có thể làm người dùng tưởng tùy chọn đã lưu hoặc email sẽ gửi; giờ gửi cần kiểm tra khi offset thay đổi. | Giả lập save thất bại, health unavailable/unconfigured, đổi timezone; kiểm tra persisted state và delivery status. |

Nguồn C01: `src/services/portfolioStore.ts:34`, `src/features/coverage/PortfolioCoveragePage.tsx:78`, `src/services/workspaceData.ts:134`. C02: cùng loader và các order stores; `src/services/workspaceDataCache.ts:90`. C03: `src/features/settings/NotificationsPanel.tsx`. Đây là **danh sách cần tái hiện**, không phải tuyên bố cloud production đang lỗi.

## Rà soát từng tính năng

UI = đã thao tác/quan sát trong lần này; Source = đọc mã/contract nhưng chưa chạy nghiệp vụ thật; Hạn chế = chưa đủ môi trường/dữ liệu. Mỗi hàng dưới đây là một điểm đánh giá, không nhất thiết là một bug riêng.

| # | Tính năng / điểm kiểm tra | Đánh giá và cải thiện đề xuất | Bằng chứng / ưu tiên |
|---|---|---|---|
| 01 | 10 khu vực điều hướng chính | Giữ cấu trúc đã được duyệt. Nhóm theo công việc hằng ngày, hồ sơ, phân tích; dùng cùng tên giữa route/search/tab. | UI + registry; P2 |
| 02 | Điều hướng theo ngữ cảnh | Giữ Quotes/People/Objections/Coverage gắn với customer/deal. Luôn giữ selected record khi đi sang màn hình khác. | 07, 24, 27–34; P2 |
| 03 | Mobile More | Năm mục ngắn hoạt động rõ; đưa Leads/Money vào More theo nhu cầu, kiểm tra active state và đường quay lại. | 37–40; P2 |
| 04 | Route alias cũ | `/app/activity` tới Analytics; Ledger ở Plan History. Cần một cách gọi rõ giữa history, activity và analytics. | 35–36 + App.tsx; P2 |
| 05 | Welcome | Cho hiểu mục tiêu trước nhập liệu. Nên dẫn tới một công việc đầu tiên có kết quả rõ thay vì khám phá tất cả. | 01; P2 |
| 06 | Reporting currency lúc bắt đầu | Chọn được đơn vị; giải thích tiền tệ của deal khác tiền tệ tổng. Cảnh báo rate thiếu đúng tại phép tính. | 01, 25; P2 |
| 07 | Start real / worked example / import | Ba lựa chọn có ý nghĩa. Demo cần catalog, receipt và reporting samples đầy đủ. | 01, F16; P2 |
| 08 | Getting-started coach | Có thể mở lại guide. Tiến độ nên dựa trên việc tạo/cập nhật record hữu ích, không chỉ mở trang. | 02, 25; P2 |
| 09 | Chuyển demo → account thật | UI nói sample không được copy vào account. Giữ; thử owner/mode switching cloud riêng. | 45 + source; Hạn chế |
| 10 | Capture note | Preview và sửa trước lưu là đúng hướng. Tiếng Việt/ghi chú pha ngôn ngữ cần nâng cấp. | 20–22, F07; P1 |
| 11 | Capture quick details | Giữ cho người không muốn paste; ưu tiên customer, điều xảy ra, next action và ngày. | UI chế độ + source; P2 |
| 12 | Paste email/thread | Giữ attribution nguồn và review trước chấp nhận. Cần phân biệt người hứa, người nhận và reply trong chuỗi. | 20/43 + source; P2; chưa thử mọi chuỗi |
| 13 | Dictation | Nút có mặt; chỉ hỗ trợ khi người dùng cho quyền. Cần fallback nhập tay và báo language hỗ trợ. | UI, không bật microphone; Hạn chế |
| 14 | Entity resolution | Match Apex/deal tốt. Thể hiện confirmed link khác parsed text; không tạo customer từ mọi cụm danh từ. | 21–22, 36; P1 |
| 15 | Confirm and correct | Những trường chưa nhận được phải dễ thấy; không thu gọn lỗi ngày/next action trước save. | 21–22; P1 |
| 16 | Post-capture review | Tách receipt nguồn khỏi facts là đúng. Gom vào một hàng review dễ thực hiện, tránh nhiều nơi phải accept. | 20/43 + source; P2 |
| 17 | Capture learning aliases | Giữ sửa alias có kiểm soát; chuyển quản lý alias xuống nâng cao/settings, không chiếm luồng ghi chú mỗi ngày. | 20; P2 |
| 18 | External observations / connector export | Phân biệt input chưa xác minh rất tốt. Thêm preview mapping/duplicates/partial results bằng ngôn ngữ bán hàng. | 43 + source; P2 |
| 19 | Search toàn app | Apex trả Account và hai deal rõ. Bổ sung kết quả note/Brand/Product khi phù hợp; giữ scope và record ID. | 23; P2 |
| 20 | Ask / insight | Có giới hạn và nguồn rõ. Câu hỏi Account có nhiều deal nên trả overview hoặc yêu cầu chọn; Open deal nên tới đúng hồ sơ. | 24; P1/P2 |
| 21 | Today picture | Pipeline, silence, cash, plan là bốn câu hỏi đúng. Chuẩn hóa population/basis của từng số. | 02, F03/F06; P1 |
| 22 | Your 3 moves | Giữ giới hạn ba. Hợp nhất lý do cùng record và tránh đếm hai hành động gần nhau là hai ưu tiên. | 02, F08/F11; P2 |
| 23 | Proactive nudges | Snooze/dismiss hữu ích. Mark done phải nói rõ đã hoàn thành việc hay chỉ xử lý cảnh báo; không tự kết luận evidence/payment. | 02; P2 |
| 24 | Morning brief / Five questions | Hữu ích nhưng lặp các hành động phía dưới. Thu gọn phần đọc thêm; lời cảnh báo dùng cùng cơ sở. | 02, 37; P2 |
| 25 | Lead queue | New/needs action/ready rõ, có nurture. Trạng thái revisit “needs action” trước hai ngày nên nói rõ là sắp đến hạn. | 04/38; P2 |
| 26 | Add Lead | Gọn hơn drawer deal. Đưa Customer trước Brand; catalogue chọn sau khi biết ngữ cảnh. | 05/39; P2 |
| 27 | Qualification Lead → Opportunity | Giữ cùng record. Khi người dùng qualify Lead 0/5, hiện thiếu gì và ghi rõ xác nhận lựa chọn. | 04/38 + source; P2 |
| 28 | Nurture / reschedule / disqualify | Giữ vì phù hợp triage. Phải phân biệt disqualified Lead với Lost qualified deal trong learning. | UI + source; P1 invariant |
| 29 | Lead nguồn và funnel | Nguồn có detail tốt. Tách imported baseline khỏi chuyển đổi đã quan sát; denominators hiện đúng scope. | 13/42 + source; P2 |
| 30 | Account list | Có orphan-name repair. Dùng linked identity tại nhập liệu; next move phải đọc được trong bảng. | 06, F09/F14; P1/P2 |
| 31 | Account status/profile | Need follow-up và Dormant/Strategic đang thuộc các chiều khác nhau. Đổi label để không đọc thành mâu thuẫn. | 06–07; P2 |
| 32 | Account overview | Có next action và commercial loop. Đưa People/Memory/Money tabs gần đầu để vào việc nhanh. | 07; P2 |
| 33 | People / contact profile | Profile contacts và canonical People cần reconcile preview, không tự giả định buying authority. | 07/28; P1 |
| 34 | Account merge / import | Source có store/lịch sử liên kết. Preview tên trùng, alias, unmatched Brand/Person trước commit; thử dữ liệu thật riêng. | Source; P1, Hạn chế |
| 35 | Stakeholder role matrix | Gap có nút bổ sung tốt. Tách role ghi nhận/role xác nhận; đếm Leads riêng khỏi open qualified deals. | 28–29; P1/P2 |
| 36 | Opportunity list / filters | Nhiều filter mạnh; ẩn Imported/FY shortcuts nếu không có dữ liệu tương ứng, dùng kỳ động. | 08; P2 |
| 37 | Next action / close date | Hai trường thúc đẩy việc làm, nên ở đầu drawer. Không biến ngày trống thành hoàn tất hay đúng hạn. | 09; P1/P2 |
| 38 | Sales-flow checkpoints | Giữ để thấy thủ tục đã tới đâu; hạn chế kết luận toàn deal Ready khi buying evidence còn blocker. | 09b, F02; P1 |
| 39 | MEDDIC qualification | Dùng checklist định lượng và evidence rõ; sửa Metrics false Strong. | 09 + probes, F01; P1 |
| 40 | Forecast defensibility / recorded close claims | Phân biệt premise đã ghi với xác suất là tốt. Hiện khi có dated claim, đừng chiếm nhiều chỗ khi trống. | 09/35 + source; P2 |
| 41 | Scenario / simulation / policies | Giữ dưới advanced. Các kết quả giả định phải luôn có inputs và không ghi đè record thật. | 09 + source; P2; chưa chạy mọi scenario |
| 42 | Conditions / requirements / dependencies | Có giá trị cho deal phức tạp. Bắt đầu bằng blocker dễ hiểu, rồi mới mở mô hình prerequisite chi tiết. | 09 + source; P2 |
| 43 | Win/loss retro / historical trail | Giữ thời điểm và giá trị thực tế; tách outcome history khỏi current status. Chưa test replay cloud trong lần này. | 09/13/35 + source; P1 |
| 44 | Quotes | Theo dõi validity/PO/delivery/payment hữu ích. Một nguồn trạng thái hoặc hai basis hiển thị rõ, tránh lệch Today. | 27/F03; P1 |
| 45 | Committed orders | Procurement/90% là heuristic hiện tại. Tách dự kiến đặt hàng với PO/contract đã xác nhận. | 10 + probes; P1 diễn đạt |
| 46 | Order milestones | Trình tự dễ hiểu. Mỗi tick cần thời điểm/căn cứ; thêm receipt khi paid thay vì chỉ một status. | 10/27 + source; P1 |
| 47 | Payment schedule | Hiển thị Read as hữu ích. Event-anchored date không được thay bằng giả định mà mất nhãn. | 11/27 + source; P1 |
| 48 | Collections / partial receipts | Có missing/assumed labels tốt. Tổng confirmed overdue tách khỏi planning assumptions. | 11/F03; P1 |
| 49 | Money at risk | Có hành động cụ thể. Nhãn invoice/deposit/PO phải khớp bằng chứng và loại tiền đang bị chặn. | 10/F03; P1 |
| 50 | Cost Analysis / Margin | Thiếu cost được báo đúng. Thêm completeness, hiệu lực cost và landed-cost currency trước so sánh margin. | 12/25 + source; P2 |
| 51 | Suppliers / quarterly target / coverage | Source có commitments và target. Làm đường nhập ngay từ context của order/scoreboard; cần thử lifecycle thực tế riêng. | 13 + source; P2, Hạn chế |
| 52 | P&L / expenses | P&L bị flag; không dùng cash surplus làm profit trên Analytics. Chưa kiểm tra accounting thật. | Source/F04; P1 |
| 53 | Plan board / backlog | Backlog opt-in đã có. Đưa board công việc lên trước các summary dài. | 03; P2 |
| 54 | Typed tasks / paste plan | Giữ ngày và provenance. Liên kết task với canonical work, preview duplicate trước paste. | 03 + source; P2 |
| 55 | Completion và weekly snapshot | Hai đơn vị đo khác nhau phải giải thích; ưu tiên một identity cho cùng công việc. | 03/13/F08; P2 |
| 56 | History day/week/month | Filter và activity-date rõ. Raw parsed fields và confirmed link cần có tên riêng; giảm tags kỹ thuật mặc định. | 36; P2 |
| 57 | Weekly review | Có Changes/Why/next week, tốt. Gom briefs và bỏ kết luận hành động trùng. | 13/42; P2 |
| 58 | Weekly/monthly scoreboard | Có so sánh, target link. Ghi clearly observed period, current snapshot và baseline khi thiếu lịch sử. | 13/42; P2 |
| 59 | Attention budget | Lựa chọn không tự assign/schedule là rõ. Gắn chosen item với thực tế lập lịch ở bước sau. | 42; P2 |
| 60 | Learning & Analytics | Nhiều chiều phân tích, chart/table hữu ích. Sửa untouched, cash/profit và cohort glossary trước thêm KPI. | 14/35; P1 |
| 61 | Forecast calibration / follow-up impact | Phân tích hữu ích khi outcome đủ. Tách association khỏi tác động nhân quả và hiện denominator. | 35 + source; P2 |
| 62 | Brand/BU/Product catalog | Giữ ID/aliases/version. Catalog list và ô tìm kiếm nên trước form thêm mới; archive/merge phải giữ liên kết. | 15 + source; P1/P2 |
| 63 | Brand picker / Others | Đúng hướng sửa local. Others luôn giữ tên tay và classification; tạo Brand mới từ Others bằng reconcile preview. | 05/39 + source; P1 |
| 64 | Classification deal | Giữ original text. Thêm hàng batch cho unassigned/unmatched, undo và preview affected reports. | 15; P2 |
| 65 | Brand performance | Phân biệt original text diagnostic với accepted catalog totals. Include Others và Unassigned bằng nhãn riêng. | 15/17 + source; P1 |
| 66 | Portfolio Coverage | Empty state hướng dẫn sai trọng tâm khi catalog thiếu; dẫn Manage Brands + classify deals. Chưa coi ô trống là nhu cầu thật. | 34/F16/C01; P2 |
| 67 | Report templates/builder | Result-first với presets theo câu hỏi; advanced builder tùy chọn. | 16–17/40; P2 |
| 68 | Report source/filters/measures | Population và per-run context tốt. Thêm completeness và khóa scope đồng nhất cho grouped summary. | 17; P1/P2 |
| 69 | Saved/version/archive reports | Dùng definition đã lưu cho dashboard đúng. Hiển thị tên người sửa/giờ/version khi signed-in; archive có đường phục hồi. | 17/40 + source; P2 |
| 70 | CSV/PDF report export | UI có controls; chưa đọc file export trong lượt này. Khi kiểm tra phải đối chiếu số, scope, FX, missing và toàn bộ trang. | 17; Hạn chế |
| 71 | Dashboard editor/handoff | Tự chạy preview sau chọn report; view và edit tách rõ. | 18; P2 |
| 72 | Dashboard source drill-down | Chọn contributing rows mặc định; full scope là một lựa chọn. | 19; P2 |
| 73 | Dashboard refresh/history | Giữ run/version timestamps; cho biết snapshot cũ khi definition thay đổi. Chưa test cloud concurrency. | 18–19 + source; P2, Hạn chế |
| 74 | Objection ledger | Required proof + tuổi + exposure hữu ích. Resolution cần nguồn/bằng chứng; không cộng trùng exposure của một deal. | 30 + source; P1/P2 |
| 75 | Playbook | Hữu ích khi rút từ own history. Một mẫu chỉ là một lần được ghi nhận, chưa thành proven trend. | 31/F17; P2 |
| 76 | Sales Assets / starter packs | Có preview và editable templates. Thêm version, approved/draft, nguồn và ngày hiệu lực; template không tự thành chứng cứ. | 32 + source; P2 |
| 77 | Vault Library/Map/Timeline | Quan hệ và gaps có ích; ưu tiên search/list, map là lựa chọn. Không đồng nhất known với confirmed. | 33 + source; P2 |
| 78 | Knowledge replay | Có tests để tránh replay jump-cut. Chưa thử mọi bàn đồ/thiết bị thật; giảm chuyển động theo preference. | Source + fresh tests; P3 |
| 79 | FX/pricing settings | Planning rate có ngày là minh bạch. Khi share/report cần cùng FX basis; ghi rõ local override chưa đồng bộ. | 25/F19; P2 |
| 80 | Sync/storage/recovery | Status khá rõ trong demo. Gộp issue list theo record và verify C01–C02 trước khẳng định current. | 25–26 + source; P1/P2 |
| 81 | Export/restore/undo | Có preview, per-collection report và undo theo source. Demo chặn restore rõ. Cần verify restore thật riêng. | 26 + source; Hạn chế |
| 82 | Account/profile/login/OAuth/reset | Form labels và autocomplete có. Lỗi cấu hình kỹ thuật không nên là hướng dẫn cho end user; cloud flow chưa chạy. | 44–45 + source; P2, Hạn chế |
| 83 | Email digests | Opt-in là đúng. Delivery readiness, failed save và offset cần thử; preference saved không đồng nghĩa sent. | 25 + source/C03; Hạn chế |
| 84 | Billing/entitlement | Source có hosted checkout và tiers. Price/offer/trial copy phải lấy cùng config; chưa thanh toán hay đổi subscription. | Source; Hạn chế |
| 85 | Team/shared workspace | Preview phạm vi và member acceptance là tốt. Dùng human-readable identity thay account-reference input. | 42 + source; P2, cloud Hạn chế |
| 86 | External statements/trust capsule | Source tách integrity khỏi issuer authentication và accepted facts. Giữ; wizard cần ngôn ngữ dễ hiểu. | 42 + source; P2 |
| 87 | Federation/cross-company/protocol | Có attribution/prerequisites; chưa cần chiếm luồng tuần mặc định. Cần nghiệm thu với hai bên thật khi mở rộng. | 42 + source; P3, Hạn chế |
| 88 | Founder import/cohort/admin/API/SDK | Registry/source có gate. Đánh giá khả năng truy cập và contract không thay thế thử quyền production, secrets hoặc server acceptance. | Source; Hạn chế |
| 89 | Trang giới thiệu/use cases/pricing/legal | Landing định vị rõ. “Your data is never shared” cần nói rõ cơ chế người dùng chủ động share; giá/trial đồng nhất config. Chưa audit pháp lý. | 46 + source; P2, Hạn chế |
| 90 | Accessibility/failure/scale | Mobile bố cục tốt, modal focus có lỗi. Cần suite keyboard/screen reader/zoom và dữ liệu lớn; tests pass không chứng minh mọi UI/semantics đúng. | 29, 37–40; P1/P2 |

## Thứ tự triển khai đề xuất

### Đợt 1 — Làm cho kết luận đáng tin

1. Sửa account touch roll-up và qualified population (F05–F06).
2. Sửa Metrics và kết luận readiness dùng chung (F01–F02).
3. Chuẩn hóa tiền: confirmed/planned/missing, invoice/payment basis, cash/margin labels (F03–F04).
4. Tái hiện và sửa cache invalidation C01–C02 nếu xác nhận; kiểm tra “sửa xong → đổi màn hình → thấy số mới”.
5. Sửa focus modal (F15).

Điểm dừng nghiệm thu: cùng hồ sơ cho cùng kết luận trên các màn hình; mỗi tổng có nguồn và mức đầy đủ; không dùng nguồn giả định để phát biểu như sự kiện đã xác nhận.

### Đợt 2 — Giảm nhập lại và công đối chiếu

1. Hoàn thiện Brand catalog/Others ở mọi đường nhập và xử lý legacy bằng preview; tiếp tục canonical Customer/Person/Product links (F09).
2. Capture/Ask tiếng Việt theo các câu thật người dùng thường viết (F07).
3. Liên kết next action, capture promise và Plan; giữ weekly snapshot để đọc lịch sử (F08).
4. Một hàng “cần kiểm tra dữ liệu” có đường sửa trực tiếp (F20).
5. Rút gọn drawer và các bảng; hành động thường ngày ở đầu (F10/F14).

Điểm dừng nghiệm thu: một lần ghi một công việc đủ để tìm lại, lập lịch, hoàn thành và xem kết quả; không phải nhập lại cùng thực thể hay cập nhật ba checkbox.

### Đợt 3 — Làm rõ phân tích và mở rộng theo nhu cầu

1. Today/Review đơn giản hơn (F11).
2. Reports mở bằng kết quả, presets theo câu hỏi; Dashboard tự preview và có contributing rows (F12–F13).
3. Demo thống nhất cả danh mục, tiền và report (F16).
4. Learning nói đúng mức mẫu và evidence (F17/F19).
5. Wizard phối hợp nâng cao, sau khi cloud/permissions/delivery đã có acceptance riêng (F18/C03).

Không đề nghị tạo thêm module chính lúc này. Các cải thiện trên phần lớn thuộc luồng, dữ liệu và cách đọc của những màn hình đã có.

## Nhật ký 46 bước và tình trạng

“Ổn” chỉ có nghĩa bước được quan sát dùng được trong phạm vi audit; không phải chứng nhận toàn bộ feature. Ảnh và ghi chú của từng bước được trình bày trong bản HTML cùng tên.

| Bước | Nội dung | Tình trạng / ghi chú |
|---|---|---|
| 01 | Welcome, currency, chọn worked example | Dùng được; demo chưa đầy đủ F16. |
| 02 | Today desktop | Cần sửa diễn giải money và Lead forecast; giảm lặp. |
| 03 | Plan upcoming/commitments | Dùng được; đối chiếu identity công việc F08. |
| 04 | Lead queue desktop | Dùng được; bảng cắt cột hành động. |
| 05 | New Lead/Brand picker | Dùng được; Customer nên đứng trước Brand. |
| 06 | Accounts list/orphan names | Có repair; canonical links và cột next move cần cải thiện. |
| 07 | Account overview, People, Memory, Coverage | Nhiều context tốt; tabs/chất lượng contact cần rõ hơn. |
| 08 | Opportunities list | Filters mạnh; readiness/population cần thống nhất. |
| 09 | Opportunity drawer, readiness, MEDDIC | Cần sửa P1; 41 fields, nội dung 6.407 px. |
| 10 | Money Orders/at risk | Cần rõ commitment và cơ sở overdue. |
| 11 | Collections | Có assumption label; confirmed/planned cần tách tổng. |
| 12 | Margin thiếu cost | Empty state đúng; chưa test nhập cost trong audit. |
| 13 | Weekly Review | Có vòng tuần tốt; nhiều nguồn work/brief cần gom. |
| 14 | Learning & Analytics | Cần sửa untouched và cash/profit. |
| 15 | Products & Brands | Bản local có catalog linking; demo catalog trống. |
| 16 | Reports builder | Chạy được; cần result-first. |
| 17 | Run/save report | 7/10 records, pipeline khớp 189.230,77 USD; nguồn rõ. |
| 18 | Report → Dashboard | Handoff dùng được; preview cần tự refresh. |
| 19 | Dashboard drill-down | Truy nguồn được; contributing rows cần riêng. |
| 20 | Capture note/learning/recent | Preview tốt; quá nhiều nội dung phụ. |
| 21 | Capture tiếng Việt | Thiếu touch/next action/date; P1 với cách dùng hiện tại. |
| 22 | Capture tiếng Anh đối chứng | Nhận cuộc gọi, next action, ngày đúng ở ví dụ này. |
| 23 | Search Apex | Trả đúng Account và hai deal; dùng được. |
| 24 | Ask Anh/Việt | Anh trả một deal; tiếng Việt không được hỗ trợ tốt; cần scope rõ. |
| 25 | Workspace Settings | Currency/sync/storage rõ; cloud không được thử. |
| 26 | Export/Restore screen | Preview/guard hiện rõ; restore và file export chưa chạy. |
| 27 | Quote Orion | PO Pending, payment Not due; lệch diễn giải với Today. |
| 28 | Stakeholder role matrix | Gap/action tốt; table overflow và confirmed-role cần rõ. |
| 29 | Bàn phím trong Stakeholder modal | Focus thoát modal; P1, có DOM probe bổ sung ảnh. |
| 30 | Objection ledger | Required proof/age hữu ích; cần cột action dễ đọc. |
| 31 | Playbook | Nội dung tái dùng được; 1/1 chưa nên gọi proven. |
| 32 | Assets/starter packs | Library dùng được; version/approval/source cần rõ. |
| 33 | Vault Library/map | Quan hệ có ích; recorded khác confirmed. |
| 34 | Portfolio Coverage | Demo thiếu catalog; empty state nên dẫn tạo/classify Brand. |
| 35 | Route Activity → Analytics | Có route alias; phát hiện account coverage gap. |
| 36 | Plan History | Lịch/links dùng được; parsed text và confirmed link dễ nhầm. |
| 37 | Today 390 × 844 | Không tràn trang quan sát; cần cuộn nhiều trước action. |
| 38 | Leads 390 × 844 | Thẻ responsive tốt; hành động nằm dưới nội dung khá dài. |
| 39 | New Lead 390 × 844 | Sticky save tốt; trường chính cần ưu tiên. |
| 40 | Reports 390 × 844 | Layout co được; thư viện/builder trước kết quả. |
| 41 | Must-win work | Empty state hoạt động; demo và import hướng dẫn chưa đủ. |
| 42 | Review coordination/sharing/statements | Có guard/phạm vi; UX còn nhiều reference kỹ thuật; chưa share thật. |
| 43 | External source intake | Unverified input rõ; cần mapping wizard; không nhập nguồn thật. |
| 44 | Login | Form quan sát được; cloud/OAuth chặn bởi cấu hình môi trường. |
| 45 | Signup | Tách demo rõ; signup/email verification chưa chạy. |
| 46 | Landing | Định vị rõ; copy về sharing cần phù hợp capability hiện tại. |

## Kiểm chứng và hồ sơ kỹ thuật

- [Kết quả 103 kiểm thử](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/targeted-tests.log>).
- [Đối chứng Metrics, touch roll-up và heuristic committed](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/probes.json>).
- [Focus ngoài dialog](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/29-focus-probe.json>).
- Các ảnh là ảnh gốc của lần audit, không phải mockup đề xuất. Bản HTML có ảnh theo bước, ghi chú, mức bằng chứng và giới hạn.
- Mã nguồn app không được sửa trong lượt audit này. Những sửa Brand ở lượt trước được giữ nguyên; audit chưa deploy.

### Ba bằng chứng đại diện

![Bước 09: Ready to advance và evidence chỉ hỗ trợ Qualification cùng một hồ sơ](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/09b-readiness.jpg>)

![Bước 21: Ghi chú tiếng Việt chưa nhận được cuộc gọi, việc làm và ngày](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/21-capture-vietnamese.jpg>)

![Bước 22: Bản tiếng Anh tương đương nhận next action và ngày hẹn](<E:/Antigravity project/Memoire/docs/qa/evidence/product-improvement-2026-10-08/22-capture-english.jpg>)
