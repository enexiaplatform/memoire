# Memoire: Portfolio Management, Dashboards và Reports

Ngày: 2026-10-01. Trạng thái: đề xuất sản phẩm để review; chưa phải phạm vi release được duyệt, chưa triển khai tính năng.

## 1. Khuyến nghị

Phát triển ba năng lực trên cùng dữ liệu thương mại của Memoire:

- **Portfolio Management**: tổ chức danh mục BU, brand, nhóm sản phẩm và sản phẩm; biết danh mục nào cần được đầu tư hoặc xử lý.
- **Dashboards**: theo dõi và khám phá hiệu quả của danh mục bằng các góc nhìn tùy chỉnh.
- **Reports**: chọn dữ liệu, trường, điều kiện và cách tổng hợp; lưu cấu hình và xuất kết quả có thể kiểm tra.

Ba năng lực phục vụ cùng một vòng lặp: tổ chức danh mục → hiểu kết quả và rủi ro → xem bản ghi giải thích kết quả → hành động trong workflow hiện tại → review lại. Chỉ số và dữ liệu nguồn dùng chung; người dùng không nhập lại số liệu vào dashboard hoặc report.

Giả định làm việc cho bản đầu: một người phụ trách nhiều brand/BU trên dữ liệu họ sở hữu hoặc được cấp quyền rõ ràng. Nhu cầu tập đoàn vẫn được giữ trong mô hình danh mục, nhưng quyền tổng hợp dữ liệu nhiều nhân viên/pháp nhân là một giai đoạn riêng. Câu hỏi về đối tượng sử dụng đã được gửi cho người dùng; giả định này cần cập nhật khi có câu trả lời.

## 2. Căn cứ hiện tại và giới hạn của kết luận

Đã đối chiếu tài liệu và mã nguồn trong checkout ngày 2026-10-01; chưa đo hành vi khách hàng, chưa phỏng vấn người dùng cho ba năng lực mới và chưa kiểm tra Production trong công việc này.

| Căn cứ | Quan sát | Hàm ý thiết kế |
|---|---|---|
| `README.md`, `docs/positioning.md` | Memoire phục vụ vòng lặp từ tương tác khách hàng tới cam kết, đơn hàng và tiền; có bảy điểm đến chính | Các năng lực mới phải làm sâu vòng lặp này và có điểm vào dễ tìm |
| `src/services/opportunityStore.ts` | Opportunity đã có `brand`, `productOrSolution`, channel, currency; brand/product chưa là danh mục quản trị bằng ID | Cần chuẩn hóa danh mục và quan hệ; giữ khả năng đọc dữ liệu cũ |
| `src/utils/brandPerformance.ts`, `BrandPerformancePanel.tsx` | Đã có pipeline, committed, won/lost và win rate theo brand; win rate cần ít nhất ba deal đã quyết định | Mở rộng engine hiện có, không xây một bộ KPI cạnh tranh |
| `src/utils/coverageMatrix.ts`, Portfolio Coverage | Đã có ma trận khách hàng × brand và khoảng trống tiếp cận | Giữ workflow này; không gọi ô trống là nhu cầu thị trường đã được xác minh |
| `ReviewAnalyticsSection.tsx` | Đã có biểu đồ cố định, xuất CSV và PNG; Review có các brief Markdown | Khoảng trống là builder và cấu hình tái sử dụng, không phải khả năng vẽ/xuất từ số không |
| `src/config/featureRegistry.ts` | Hồ sơ quyết định ghi nhận Pipeline Defense bị bỏ vì không có workspace lưu brief/review pack và việc viết lại deal tạo trùng lặp | Report mới phải tự sinh từ bản ghi, có một mục đích sử dụng rõ; cần kiểm chứng sử dụng trước khi mở rộng |
| `docs/architecture/shared-workspaces.md` | Sharing chỉ cho phép xem/review các promise được chọn, không cấp quyền xem toàn bộ dữ liệu chủ sở hữu | Không dùng sharing hiện tại làm quyền truy cập báo cáo toàn BU |
| `docs/architecture/memoire-final-system-map.md` | M28 có lịch sử cho 12 nhóm nguồn; lịch sử Activities/Quotes/Receivables chưa đầy đủ; Production còn phụ thuộc P1 | Không hứa tái dựng lịch sử chính xác cho mọi chỉ số hoặc coi mã local là đã live |
| `src/utils/money.ts`, `src/utils/orderMargin.ts` | Quy đổi tiền có tỷ giá lập kế hoạch và override; margin có kiểm tra thiếu chi phí/tỷ giá | Dùng lại quy tắc và hiển thị độ phủ; không gọi kết quả là số kế toán đã xác nhận |

Tài liệu positioning tháng 7 ghi team/integrations ngoài phạm vi beta; system map tháng 10 mô tả các lớp sharing và trao đổi đã triển khai cục bộ. Đối với câu hỏi “đã có gì”, lấy system map mới cùng mã nguồn làm căn cứ. Đối với đối tượng sản phẩm và mục đích sử dụng, giữ định hướng personal commercial control tower. Chưa có bằng chứng cho một nền tảng quản trị tập đoàn đầy đủ.

Tham chiếu đã đọc:

- [Salesforce Report Builder](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_using_report_builder): report type quyết định bản ghi và trường có thể dùng; người dùng chọn fields, filters và grouping.
- [Salesforce Dashboard Builder](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_visualizing_data): widget trực quan hóa dữ liệu từ report nguồn.
- [Salesforce Report Formats](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_report_formats): bảng chi tiết, summary và matrix phục vụ những nhu cầu khác nhau.
- [Tableau Data Model](https://help.tableau.com/current/pro/desktop/en-us/datasource_datamodel.htm): quan hệ giữa các bảng cần giữ mức chi tiết của dữ liệu, tránh nhân bản measure khi join.
- [Tableau Dashboard Actions](https://help.tableau.com/current/pro/desktop/en-us/actions_dashboards.htm): chọn một phần của biểu đồ có thể lọc hoặc mở góc nhìn liên quan.

Những thiết kế bên dưới là suy luận và đề xuất cho Memoire, không phải nhu cầu khách hàng đã được xác nhận hay cam kết ngang bằng Salesforce/Tableau.

## 3. Ranh giới ba năng lực

| Năng lực | Câu hỏi chính | Dữ liệu mới thực sự cần lưu | Phần dùng lại |
|---|---|---|---|
| Portfolio Management | Tôi phụ trách những danh mục nào và nên tập trung ở đâu? | Danh mục, phân loại, liên kết, mục tiêu theo phạm vi | Deals, accounts, commitments, money, coverage |
| Dashboards | Trong phạm vi này, kết quả/rủi ro đang như thế nào? | Layout, widget, bộ lọc và tham chiếu report | Kết quả truy vấn và công thức chỉ số dùng chung |
| Reports | Tôi cần danh sách/tổng hợp nào để kiểm tra hoặc trình bày? | Định nghĩa report; snapshot khi người dùng chọn giữ một lần chạy | Các bản ghi nguồn và định nghĩa chỉ số |

```mermaid
flowchart LR
  P[Danh mục và phân loại] --> S[Dữ liệu thương mại hiện tại]
  S --> Q[Trường, chỉ số và truy vấn dùng chung]
  Q --> R[Reports]
  R --> D[Dashboards]
  R --> X[Export hoặc snapshot]
  D --> B[Mở bản ghi nguồn]
  B --> A[Hành động trong Today, Plan, Deals hoặc Money]
  A --> S
```

Danh mục là dữ liệu nền; report là câu hỏi được lưu; dashboard là cách trình bày nhiều câu hỏi. Export là kết quả một lần chạy, không thay thế dữ liệu vận hành.

## 4. Portfolio Management

### Ý nghĩa và mô hình danh mục

Tên phù hợp với ý tưởng hiện tại là **Portfolio Management** hoặc **Products & Brands**. “Product Management” thường gợi thêm discovery, backlog, sprint và delivery của đội phát triển sản phẩm; những việc đó chưa xuất hiện trong nhu cầu đã nêu.

Không ép mọi doanh nghiệp vào chuỗi Group → BU → Brand → Section → Product. Một brand có thể được bán bởi nhiều BU; nhóm sản phẩm có thể cắt ngang nhiều brand. Cần phân biệt:

- **Đơn vị kinh doanh**: cây tổ chức có quan hệ cha/con; người dùng có thể gọi cấp tương ứng là Group, Division, BU hoặc Section. Bản đầu cây này chỉ phân loại dữ liệu, không tạo quyền truy cập.
- **Brand**: danh tính thương hiệu/principal có ID ổn định, tên, alias đã được người dùng xác nhận và trạng thái active/retired.
- **Nhóm sản phẩm**: phân loại mặt hàng/dịch vụ; có thể có cây riêng khi cần. Không dùng cùng một loại “group” cho cả phòng ban và dòng sản phẩm.
- **Product/Solution**: sản phẩm hoặc giải pháp bán ra, có ID, mã tùy chọn, brand mặc định, nhóm mặc định, mô tả và trạng thái thương mại như chuẩn bị bán/đang bán/tạm dừng/ngừng bán.
- **Nhóm báo cáo/tag**: bộ sưu tập tùy chọn như “Strategic 2027”, có thể chồng lấn; dùng để lọc, không mặc nhiên là các nhóm cộng được.

Ví dụ: Group A có BU Healthcare và BU Industrial; Brand X có sản phẩm thuộc cả hai BU. BU của một giao dịch là đơn vị phụ trách giao dịch đó, không được suy ra chỉ từ brand.

### Bản đầu cần có

1. Thêm, sửa, tìm kiếm và ngừng sử dụng danh mục; đổi tên không làm mất liên kết.
2. Chọn BU/brand/product ngay trong Opportunity; hỗ trợ tìm nhanh và tạo danh mục ở cùng thao tác khi cần, tránh phải hoàn tất setup trước khi capture.
3. Tái dùng liên kết Opportunity cho quote, order và các payment/cost liên quan; không nhập brand lần nữa trên từng module. Bản ghi không liên kết vẫn hiện là chưa phân loại.
4. Trang chi tiết danh mục: pipeline, kết quả bán, đơn hàng, tiền thu, rủi ro và bản ghi nguồn. Có nút mở Opportunities, Money hoặc tạo công việc qua workflow hiện tại.
5. Mục tiêu theo phạm vi và kỳ, mở rộng Commercial Targets hiện có; phải chỉ rõ mục tiêu là giá trị đơn hàng, tiền thu hay chỉ số khác. Không tạo “target revenue” mơ hồ.
6. Ma trận Accounts × Brand/nhóm sản phẩm tái dùng Portfolio Coverage; cho phép danh mục mới chưa có deal vẫn xuất hiện. Phân biệt chưa tiếp cận, có trao đổi, có cơ hội và đã mua khi dữ liệu chứng minh được.
7. Preview mapping tên cũ sang danh mục mới, giữ giá trị nguồn và các mục chưa giải quyết. Không tự gộp hai thương hiệu chỉ vì giống tên.

Trang danh mục cần trả lời: danh mục nào có giá trị đang tiến triển, danh mục nào bị chặn, khách hàng nào chưa được tiếp cận và người phụ trách cần làm gì tiếp. Không thêm một điểm “product health” chung nếu chưa có định nghĩa và nguồn đủ rõ.

### Một deal có nhiều sản phẩm

Bản đầu mỗi Opportunity có một phạm vi báo cáo chính: BU, brand và product/solution nếu xác định được. Giữ tên mô tả cũ khi chưa mapping được. Các tag phụ không nhân đôi tiền.

Đối với deal bán một bundle nhiều sản phẩm, cho phép ghi nhận bundle là đối tượng thương mại và hiển thị “chưa phân bổ theo sản phẩm” khi cần. Không ép người dùng chọn một sản phẩm để có số đẹp. Tổng deal vẫn nằm trong tổng danh mục có thể xác định được, còn chiều product chưa xác định nằm trong bucket riêng.

Khi bổ sung phân tích nhiều sản phẩm, phải có breakdown lượng/giá trị hoặc phân bổ được người dùng nhập/xác nhận, với kiểm tra tổng. Tiền thu, chi phí và margin theo từng sản phẩm chỉ xuất hiện khi có phân bổ riêng hoặc một phương pháp phân bổ được công bố rõ là ước tính. Không sao chép toàn bộ 100 triệu của deal sang từng sản phẩm trong bundle.

Với ví dụ 100 triệu chia 60/40: có thể báo giá trị deal theo product là 60 và 40 nếu breakdown hợp lệ. Một khoản thu 50 triệu không tự trở thành 30/20 triệu thu thật cho từng product; cần allocation riêng hoặc ghi rõ phân bổ theo tỷ trọng là suy tính.

### Phần bổ sung hợp lý sau bản đầu

Commercial initiative như ra mắt một dòng sản phẩm có thể liên kết mục tiêu, cơ hội và cam kết trong Plan. Bản đầu dùng lại những đối tượng đó; chỉ thêm một thực thể initiative khi có workflow lặp lại không biểu diễn được. Quản lý inventory, BOM, R&D backlog và sprint cần bài toán riêng trước khi đưa vào Memoire.

## 5. Quy tắc dữ liệu và chỉ số dùng chung

Đây là điều kiện để hai người xem dashboard và report cùng hiểu một con số. Xây một lớp định nghĩa có thể tái dùng trên các engine hiện tại; không cần tái kiến trúc toàn bộ Kernel.

Mỗi chỉ số cần: tên dễ hiểu, ID/version, nguồn và mức chi tiết, công thức, tập bản ghi được tính, ngày dùng để chia kỳ, currency/tỷ giá, cách xử lý null, ngưỡng mẫu nếu có, nguồn bị thiếu và ID bản ghi để mở chi tiết.

| Chỉ số | Định nghĩa đề xuất | Điều kiện và quyết định phục vụ |
|---|---|---|
| Giá trị đơn hàng xác nhận | Tổng order hợp lệ theo tiêu chí committed hiện có, một lần cho mỗi order | Chọn nguồn giá trị chuẩn; không cộng lại quote và opportunity; giúp đánh giá kết quả thương mại |
| Tiền đã thu được ghi nhận | Tổng Payment Receipts đã được người dùng ghi nhận, theo ngày nhận tiền | Nhãn phản ánh nguồn ghi nhận trong Memoire; không tuyên bố đã đối soát ngân hàng |
| Lợi nhuận gộp và margin | Giá trị bán trừ các khoản cost phù hợp trên phần đơn đủ dữ liệu; tỷ lệ = tổng lợi nhuận / tổng giá trị bán tương ứng | Công khai độ phủ cost/tỷ giá; không lấy trung bình các phần trăm margin |
| Pipeline đủ điều kiện | Tổng estimatedValue của các opportunity Active, loại Lead stage | Hỗ trợ ưu tiên; không gọi là doanh thu đã đạt. Cần reconciliation với các màn hình cũ có tập tính khác |
| Win rate | Số Won / (Won + Lost), theo ngày đóng thực tế trong kỳ và phạm vi chọn | Giữ ngưỡng ít nhất ba decided như engine brand hiện tại, hiện cả số mẫu; không coi ngưỡng này là ý nghĩa thống kê |
| Giá trị đang có blocker | Tổng exposure theo order/deal hoặc money gate có blocker, khử trùng lặp trong từng tập | Không cộng các loại exposure chồng lấn; gated không có nghĩa đã mất tiền |
| Độ phủ danh mục | Tỷ lệ account × line đủ điều kiện có trạng thái được định nghĩa rõ | Tách “đã tiếp cận” khỏi “đã mua”; ô trống là khoảng trống dữ liệu/tiếp cận, chưa phải nhu cầu có thật |
| Độ phủ dữ liệu | Số bản ghi có phân loại/chi phí/ngày/tỷ giá hợp lệ trên tập tương ứng | Đi kèm các KPI để biết có thể tin và so sánh tới đâu |

Mặc định ưu tiên ba outcome: giá trị đơn hàng, tiền thu và lợi nhuận gộp. Chỉ hiện chỉ số có đủ nguồn; thiếu dữ liệu phải là unavailable/partial và có hướng bổ sung. Pipeline, blockers và coverage là chỉ số giải thích, không thêm hàng chục KPI cho mọi portfolio.

Các quy tắc bắt buộc:

- **Mức chi tiết**: Opportunities, Quotes, Orders, Payment Receipts, Activities và Commitments là những tập dữ liệu khác nhau. Đếm activity không làm một deal thành ba deal.
- **Quan hệ**: dùng ID/link đã xác minh; không join bằng tên khách hàng gần giống. Tổng hợp nguồn con trước khi ghép với nguồn cha khi cần.
- **Missing khác zero**: thiếu giá trị, tỷ giá hoặc cost được đếm và hiện độ phủ; chỉ số tổng bộ phận phải được ghi rõ là bộ phận.
- **Tiền**: cùng một chỉ số dùng cùng reporting currency và cùng bộ tỷ giá đã khóa cho một lần chạy. Giữ nguyên tiền gốc, nguồn tỷ giá và ngày áp dụng; không hứa tỷ giá live.
- **Ngày**: pipeline hiện tại và đơn đóng trong tháng dùng hai ngữ nghĩa khác nhau. Không dùng updatedAt thay close date; bản ghi thiếu ngày vào bucket riêng.
- **Mẫu số**: tỷ lệ tính lại từ số lượng/giá trị gốc sau lọc, không cộng hoặc lấy trung bình tỷ lệ của các BU. Các account đi qua nhiều BU cần COUNT DISTINCT khi tổng hợp toàn phạm vi.
- **Phân loại**: chuyển một product sang BU khác không tự viết lại báo cáo cũ. Cần phân biệt cấu trúc hiện tại với cấu trúc tại thời điểm giao dịch; chế độ lịch sử chỉ được mở khi có mapping/history tương ứng.
- **Lead**: giữ mô hình Lead là một stage của Opportunity, không tạo entity Lead mới cho builder.
- **Nguồn ngoài**: receipt chưa được chấp nhận chỉ nằm trong dataset quan sát có nhãn riêng; không tự cộng vào KPI kinh doanh chính thức.
- **Rủi ro**: dùng lại ý nghĩa và lý do từ Kernel; không biến visualization thành một engine ra quyết định mới.

## 6. Reports

### Trải nghiệm tạo report

Chọn template hoặc bắt đầu từ dataset → chọn cột → lọc → group/tổng hợp → preview → lưu → chạy/xuất hoặc thêm vào dashboard.

Dataset là các tập dữ liệu có ý nghĩa được Memoire chuẩn bị: Opportunities, Accounts, Orders & Collections, Commitments; mở rộng Activities và nguồn Kernel theo nhu cầu. Các dataset tổng hợp như Portfolio Performance dùng những measure đã định nghĩa. Builder không để người dùng tự ghép mọi bảng khi ý nghĩa của quan hệ chưa được kiểm soát.

Mỗi dataset công bố “một dòng tương ứng với gì”. Cho phép dùng **mọi trường đã đăng ký, có nghĩa và được cấp quyền** của dataset đó, gồm trường mô tả, ngày, enum, tiền và chỉ số suy ra hợp lệ. Không hứa mọi thuộc tính kỹ thuật/JSON đều tự trở thành trường báo cáo hữu ích.

Bản đầu builder hỗ trợ:

- Tìm và chọn/reorder cột, đổi nhãn trình bày mà không đổi nghĩa nguồn.
- Filter có kiểu phù hợp: date range, trạng thái, BU/brand, amount range, empty/not empty; nhóm điều kiện AND/OR đơn giản.
- Bảng chi tiết và grouped summary; SUM, COUNT DISTINCT và tỷ lệ được đăng ký; sort và subtotal.
- Preview có nhãn nếu chỉ là mẫu; số dòng toàn bộ và trạng thái nguồn khi chạy.
- Lưu, duplicate, đổi tên, xóa định nghĩa; sửa template thành bản riêng, có mô tả mục đích.
- Drill-through từ nhóm/tổng sang bản ghi có quyền xem, giữ nguyên filter.
- Export toàn kết quả trong giới hạn công bố; không lặng lẽ xuất mỗi trang đang xem.

Matrix/pivot hai chiều là giai đoạn sau khi grouped summary đúng. Formula tùy chỉnh bắt đầu từ phép toán có kiểu và measure được duyệt; không có SQL/JavaScript tự do. Khi có nhu cầu trường tùy chỉnh, thêm registry field có kiểu, validation và quyền riêng, rồi đưa vào report; đây là mở rộng data model, không phải một checkbox trong builder.

### Template ban đầu

1. **Portfolio Performance**: scope BU/brand, pipeline đủ điều kiện, số và giá trị đơn, win rate và dữ liệu thiếu.
2. **Collections & Blockers**: order, account, phạm vi danh mục, tiền thu/còn phải thu, due date, blocker và next action. Không chồng lẫn exposure thành một tổng mới.

Sau khi hai template được dùng lặp lại, mở thêm margin và account coverage; các nội dung weekly review hiện có tiếp tục dùng được. Tránh thư viện hàng chục template trước khi biết người dùng thực sự mang report nào tới cuộc họp.

### Report definition, lần chạy và snapshot

Định nghĩa report lưu cách hỏi dữ liệu; lần chạy lấy dữ liệu theo phạm vi/quyền hiện tại. Khi người dùng chọn giữ snapshot, lưu kết quả được chọn cùng definition version, metric versions, filter, timezone, ngày dùng để chia kỳ, currency/tỷ giá, thời điểm chạy, nguồn/độ phủ và phân loại sử dụng.

Snapshot giữ “kết quả đã xuất lúc đó”; không tự chứng minh dữ liệu đúng và không thay thế Time Machine. Muốn tái dựng một ngày quá khứ cần history đủ cho mọi nguồn của chỉ số; những nguồn chưa có history phải được ghi rõ là không hỗ trợ. Không tự lưu toàn bộ raw Evidence hoặc data nhạy cảm vào mỗi lần chạy.

### Export

Slice đầu: CSV dữ liệu và PDF qua print layout cho bản trình bày, có footer nêu scope/kỳ/currency/độ phủ. CSV giữ số máy đọc được, tiền tách currency, có xử lý an toàn nội dung công thức spreadsheet. PDF có heading lặp, phân trang và không cắt bảng.

XLSX là mở rộng gần sau đó nếu người dùng cần tiếp tục xử lý trong Excel: giữ kiểu số/ngày, sheet data và metadata. PNG dùng cho chart kế thừa khả năng hiện có. CSV/PDF phục vụ hai mục đích khác nhau, không ép một format xử lý mọi việc. Report export khác workspace backup và không được dùng để restore workspace.

Gửi theo lịch hoặc chia sẻ report trực tuyến chỉ phát triển sau khi có nguồn đọc phía server, quyền người nhận và kiểm tra delivery. Một browser không mở không thể bảo đảm chạy lịch; không đưa nút hẹn lịch vào bản đầu mà thiếu hạ tầng thực hiện.

## 7. Dashboards

### Trải nghiệm và thành phần

Từ một report đã chạy được, chọn “Add to dashboard”, chọn cách hiển thị, sắp xếp/kích thước rồi lưu. Người dùng cũng có thể bắt đầu từ dashboard template; hệ thống tạo các report nguồn tương ứng để họ xem và sửa.

Bản đầu có KPI card, bar/stacked bar, line và table. Account × brand coverage tái dùng ma trận hiện có; heatmap tổng quát phát triển khi nhu cầu pivot được xác nhận. Donut chỉ phù hợp với ít nhóm và tỷ trọng không chồng lấn; funnel chỉ hiện khi có stage/cohort hợp lệ, tránh coi phân bố stage hiện tại là tỷ lệ chuyển đổi.

Customization gồm metric/dimension hợp lệ, bộ lọc, nhãn, thứ tự và kích thước widget, màu theo quy ước trạng thái, title và mô tả. Có nút sắp xếp bằng bàn phím bên cạnh thao tác kéo thả; mobile chuyển thành một cột, có bảng dữ liệu thay thế cho chart.

Dashboard template đầu: **Portfolio Overview**, gồm kết quả đơn hàng, pipeline theo brand, nguồn blocker và danh sách cần follow-up. Widget có thể ẩn/hiện theo độ phủ nguồn; số không khả dụng không biến thành zero.

### Tương tác và tính nhất quán

- Bộ lọc chung theo kỳ, BU, brand và phạm vi dữ liệu. Widget không hỗ trợ một chiều lọc phải được đánh dấu rõ, không tạo cảm giác toàn trang đã cùng lọc.
- Click một bar/điểm mở hoặc lọc report nguồn, rồi mở record/Commercial Thread.
- Dashboard và report dùng cùng definition và cùng kết quả một lần chạy; không có hai hàm tính tiền song song.
- Report thay đổi có version mới: dashboard chỉ theo version mới sau preview/xác nhận hoặc giữ version đã chọn. Không âm thầm thay đổi ý nghĩa một dashboard đã dùng.
- Các widget phục vụ một lần review dùng bộ đầu vào nhất quán; nguồn tải lệch thời điểm/thiếu phải hiện partial. Không gọi nhiều lần đọc API là một snapshot nguyên tử.
- Hiện data mode, thời điểm cập nhật theo nguồn và độ phủ; thời điểm tính chart không phải bằng chứng dữ liệu nguồn vừa được cập nhật.

Ảnh/logo và ghi chú ngắn có thể thêm khi giúp giải thích báo cáo. Free-form design canvas và hàng chục chart đặc biệt cần bằng chứng sử dụng trước khi đầu tư.

## 8. Điểm vào và alignment với Memoire

Giữ bảy điểm đến chính cho đề xuất đầu. Đây là lựa chọn thiết kế phù hợp với sản phẩm hiện tại, có thể thay đổi bằng một quyết định IA rõ ràng khi kiểm chứng chứng minh cần thiết; không phải lý do để giấu tính năng mới.

- **Review**: các tab Review, Dashboards, Reports. Analytics hiện tại trở thành dashboard mặc định và chuyển dần sang định nghĩa chung; tránh giữ hai bộ analytics tương đương.
- **Portfolio**: nút có nhãn rõ “Products & Brands” ở Review và quản lý cấu trúc trong Settings; các record cho phép mở thẳng danh mục đã liên kết.
- **Accounts**: giữ Portfolio Coverage trong ngữ cảnh cross-sell, lấy danh mục chuẩn thay vì chỉ suy từ brand trên deal.
- **Opportunities/Leads**: nhập phạm vi danh mục một lần; bộ lọc và drill-through dùng lại liên kết đó.
- **Money**: mở report collections/margin đã lọc, tái dùng dữ liệu Orders, Collections và Margin.
- **Today/Plan**: chứa hành động từ bản ghi/rủi ro; không bị thay thành một trang dashboard tự do. Pin một KPI có thể thử sau khi chứng minh giúp công việc hằng ngày.
- **Search**: tìm danh mục và report/dashboard đã lưu, không tạo entity khách hàng/deal thứ hai.

Danh mục Products & Brands là một màn hình quản lý có công việc riêng, không chỉ là một dropdown. Dashboard builder và report builder có chỗ làm việc đủ rộng, nhưng không cần thêm ba mục primary nav chỉ vì có ba tên tính năng.

## 9. Dữ liệu, quyền và độ bền

Bổ sung có giới hạn: master data danh mục, mapping/assignment và định nghĩa report/dashboard. KPI vẫn được suy ra. Mục tiêu mở rộng hệ thống target sẵn có. Snapshot chỉ persist khi cần giữ kết quả; không lưu lại mọi chart thành bản sao dữ liệu thương mại.

Các ID danh mục và reference mới phải đi qua cloud/local save round-trip, record-field coverage, import, export, restore và cache invalidation. Bản ghi lifecycle cần revision/lineage theo hợp đồng thích hợp; tên/alias thay đổi không được làm vỡ lịch sử. Archive ưu tiên hơn xóa cứng khi còn record tham chiếu. Definition dùng version rõ; đọc version chưa hiểu phải báo không hỗ trợ, không reset về mặc định.

Quyền xem report/dashboard và quyền đọc dữ liệu nguồn là hai kiểm tra riêng. Người xem không nhận quyền dữ liệu vì được chia sẻ layout. Bản đầu owner-only; filter BU không là access control. Demo không vào cloud/report live; có thể xuất demo riêng với nhãn rõ và không trộn vào export thật.

Sharing hiện tại không mở đủ dữ liệu cho report doanh nghiệp. Bản doanh nghiệp cần: organization membership, role, quyền đọc theo BU/bản ghi/trường, kiểm tra export, nguồn ingestion có quyền, và quyết định về nhiều pháp nhân. Tổng tập đoàn còn cần quy tắc phân bổ/intercompany và chính sách currency. Đây là một mở rộng sản phẩm có điều kiện, không phải chỉ thêm trường organizationId.

Builder không gọi AI để tính số hay tự hoàn tất cam kết. Các đề xuất tiếp theo chỉ mở workflow/command hiện có; việc thay đổi trạng thái thương mại vẫn theo quyền và xác nhận hiện tại.

Bản local có thể dùng dữ liệu owner-scoped sẵn có. Trước khi cam kết quy mô lớn, đo số dòng, thời gian preview, bộ nhớ và export; công bố giới hạn hoặc dùng truy vấn tổng hợp phía server khi cần. Không hứa khả năng xử lý của Tableau chỉ từ một dashboard chạy được trên sample.

## 10. Trình tự phát triển

| Giai đoạn | Kết quả | Điều kiện chuyển tiếp |
|---|---|---|
| A. Chốt nghĩa dữ liệu | Danh mục có ID, mapping dữ liệu cũ, field/metric definitions, kiểm tra tập Lead/qualified pipeline, target scope | Rename, orphan, dữ liệu chưa phân loại và totals được xử lý nhất quán |
| B. Slice đầu xuyên cả ba năng lực | Quản lý brand/BU/product cơ bản, hai report template, chọn cột/filter/group đơn giản, một dashboard tùy chỉnh widget cơ bản, drill-through, CSV/print PDF | Tạo một lần dữ liệu rồi xem/xuất được cùng số và quay lại công việc nguồn |
| C. Report customization sâu hơn | Saved reports, duplicate, grouping đầy đủ, formula có kiểu, snapshot và XLSX | Người dùng thực sự dùng report lặp lại; quyền, totals và exports đúng |
| D. Dashboard customization sâu hơn | Nhiều dashboard, resize/reorder, chart interaction, filter scope, pivot/heatmap khi cần | Mỗi widget giải thích được con số và không có metric engine thứ hai |
| E. Quản trị nhiều người/BU | Quyền tổ chức, dữ liệu liên người dùng, source scheduling và delivery | Nhu cầu quản lý nhóm được xác nhận; authority, data ingestion và Production đủ điều kiện |

Không định ngày hoàn thành hoặc hiệu quả thương mại khi chưa ước lượng trên backlog đã chốt. Không tự gắn đề xuất này thành M29 hoặc sửa lại trạng thái hoàn thành của roadmap M12–M28.

Slice B đã đưa cả ba ý tưởng tới trải nghiệm sử dụng được. Phần được trì hoãn là độ rộng, không phải bỏ Reports hoặc Dashboards khỏi bản đầu. Report definition/engine cần có trước dashboard builder vì dashboard dùng nó làm nguồn.

## 11. Nghiệm thu và kiểm chứng giá trị

### Chức năng và tính đúng

- Tạo một brand/product chưa có deal: nó có mặt trong danh mục/coverage và hiện “chưa có dữ liệu”, không biến mất.
- Đổi tên brand: deal cũ giữ liên kết; preview merge cần người dùng xác nhận; unmapped giữ nguyên nguồn.
- Một deal 100 triệu, hai quote versions và ba commitments vẫn chỉ mang 100 triệu vào tổng pipeline hợp lệ, không phải 200/300/600 triệu. Quote dataset có thể có hai dòng theo grain của nó và được ghi rõ.
- Deal thuộc hai reporting groups chồng lấn: mỗi góc nhìn có thể chứa nó, nhưng tổng toàn danh mục khử trùng lặp; không cộng hai group thành 200 triệu.
- Bundle chưa breakdown không sinh số product-specific. Breakdown 60/40 cộng về 100; phần còn thiếu vào bucket chưa phân bổ.
- Lead không vào qualified pipeline; kết quả báo cáo giải thích mọi chênh lệch với engine cũ trước khi chuyển UI sang nghĩa mới.
- Lọc BU/brand/kỳ: dashboard, report, drill-through và export đồng nhất trên cùng lần chạy; null, timezone và tỷ giá đều giữ nghĩa.
- Margin chỉ từ phần order đủ cost; không cộng phần trăm hoặc coi cost thiếu là zero. Có ba closed deals mới có brand win rate, luôn hiện mẫu số.
- Report current, frozen snapshot và historical reconstruction được phân biệt bằng nhãn; thiếu history không tạo trend tưởng tượng.
- Một report bị thiếu nguồn hoặc mất quyền hiển thị trạng thái rõ và không cho export giả toàn bộ. Preview giới hạn và export toàn bộ được phân biệt.
- Owner khác, shared reviewer và demo không đọc được dữ liệu ngoài quyền, kể cả qua aggregate/drill-through/export. Restore không làm sống lại quyền đã thu hồi.
- Saved definitions và master data sống qua đổi thiết bị/restore; export báo thiếu được nhận diện. PDF không cắt nội dung và các file CSV/XLSX giữ đúng giá trị.

### Giá trị cần đo khi thử nghiệm

Theo dõi ba kết quả: thời gian từ chọn phạm vi tới báo cáo dùng được; tỷ lệ người có nhu cầu quay lại chạy saved report/dashboard trong kỳ review tiếp theo; số lần người dùng mở bản ghi và hoàn tất một bước thương mại có liên quan. Đo thêm guardrail: thời gian nhập dữ liệu, lỗi reconciliation, tỷ lệ nguồn thiếu và ảnh hưởng tới core capture/commitment loop.

Các event đo hành vi chỉ mang taxonomy/ID kỹ thuật tối thiểu, không thu nội dung khách hàng. Baseline và ngưỡng go/no-go cần thống nhất sau thử nghiệm, không đặt một tỷ lệ adoption tùy ý. Click chart không tự chứng minh doanh thu tăng; report export không chứng minh người nhận đã sử dụng.

Nếu report không được dùng lặp lại, kiểm tra câu hỏi/dataset và chất lượng nguồn trước khi thêm chart hoặc template. Nếu người dùng cần dùng Excel do Memoire thiếu một vài trường thực sự có giá trị, ưu tiên field coverage. Nếu phần lớn yêu cầu là xem dữ liệu của nhiều nhân viên, chuyển sang chốt giai đoạn E thay vì giả vờ filter BU đáp ứng quản trị tập đoàn.

## 12. Quyết định còn mở

1. Đối tượng bản đầu: một người quản lý nhiều danh mục, nhóm cùng làm việc hay tập đoàn ngay từ đầu. Khuyến nghị mặc định là phương án đầu; phương án tập đoàn sẽ đổi thứ tự ưu tiên về quyền/dữ liệu.
2. “Section/group” là phòng ban, nhóm sản phẩm hay nhóm báo cáo? Mô hình đã tách ba nghĩa; cần kiểm chứng với cấu trúc thật khi có dữ liệu.
3. Deal nhiều sản phẩm có phổ biến và có breakdown đáng tin không? Câu trả lời quyết định khi nào thêm allocation/line-level analysis.
4. Report nào được dùng trong cuộc họp nào và cần CSV, XLSX hay PDF? Hai template đề xuất là giả thuyết để bắt đầu.

Đề xuất này hoàn tất bước phát triển ý tưởng thành phạm vi và kế hoạch có thể review. Bước triển khai đầu tiên nên là A và B theo một backlog giới hạn; quyết định release và điều kiện P1 vẫn cần được xử lý độc lập.
