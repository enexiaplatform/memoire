# Nghiên cứu visualization cao cấp cho Memoire

Ngày: 13/10/2026. Phạm vi: nghiên cứu tác phẩm, cơ chế tương tác và phương pháp thiết kế. Đây là tài liệu nghiên cứu, chưa phải thiết kế được nghiệm thu hay bản triển khai mới.

## Vì sao bản Visual Explorer đầu tiên chưa đạt

Bản đầu có khả năng lọc, nhưng hình thức vẫn là các hộp biểu đồ có trọng lượng gần ngang nhau. Đồ thị chính chủ yếu trải các điểm theo giai đoạn; nó chưa đưa ra một câu hỏi kinh doanh sắc nét. Độ phân tán ngang chỉ giúp tách điểm, không cho thấy một quan hệ mới. Ma trận đang là bảng có màu, thiếu tổ chức để làm nổi các mẫu phân bố. Danh sách dài phía dưới chiếm quá nhiều không gian. Dữ liệu giả lập dùng phép chia dư nên tạo nhịp lặp đều, khiến ảnh kiểm tra trông như một sơ đồ dựng sẵn. Các kiểm thử đúng dữ liệu không chứng minh chất lượng thị giác.

## Những tác phẩm và phương pháp đã nghiên cứu

| Nguồn gốc | Cách họ làm | Bài học rút ra cho Memoire |
|---|---|---|
| [UNESCO Constellation — Nadieh Bremer](https://www.visualcinnamon.com/portfolio/intangible-cultural-heritage/) | Tác giả mô tả community detection kết hợp bố trí mạng qua nhiều bước, dùng Canvas và D3. Đã xem trực tiếp [bản tương tác](https://ich.unesco.org/dive/constellation/): chọn Family làm nổi các liên kết, phần nền được giữ mờ. | Bố trí phải phản ánh cấu trúc dữ liệu. Nhãn có phân cấp. Khi chọn một thực thể, phải thấy cả liên hệ và bối cảnh của nó. |
| [The Rhythm of Food — Moritz Stefaner](https://der-mo.net/projects/the-rhythm-of-food) | Phân tích đường thời gian trước, rồi phát triển đồng hồ năm để thể hiện tính mùa vụ. Góc thể hiện tuần trong năm, bán kính thể hiện mức quan tâm, màu thể hiện năm. Chú thích giải thích các đỉnh. | Chọn hình học theo câu hỏi. Với Memoire, trước hết kiểm tra xem có nhịp theo mùa hay chỉ có thay đổi theo thời gian; không dùng biểu đồ tròn chỉ vì đẹp. |
| [Gapminder — hướng dẫn chính thức](https://www.gapminder.org/tools/assets/guide.pdf) | Cho đổi trục, kích thước, màu, thời gian; chọn thực thể và theo dõi trails; có zoom và điều khiển độ mờ của phần không được chọn. | Một thực thể giữ danh tính xuyên suốt quá trình khám phá. Timeline cần lịch sử quan sát thật, không dựng lại từ trạng thái hiện tại. |
| [Financial Times — Visual Vocabulary](https://ft-interactive.github.io/visual-vocabulary-templates/) | Chọn biểu đồ từ quan hệ dữ liệu quan trọng nhất: so sánh, thay đổi, phân bố, tương quan… | Mỗi góc nhìn phải có nhiệm vụ rõ; không chọn danh sách chart trước rồi tìm dữ liệu để lấp vào. |
| [Crossfilter](https://square.github.io/crossfilter/) và [Vega CrossFilter](https://vega.github.io/vega/docs/transforms/crossfilter/) | Dùng chỉ mục và bộ lọc theo chiều dữ liệu. Ví dụ của Vega giữ phân bố của một chiều bằng cách bỏ qua chính bộ lọc của chiều đó khi dựng góc nhìn tương ứng. | Không để việc chọn brand khiến bộ chọn brand chỉ còn một hàng. Luôn thấy các lựa chọn thay thế và phần nền để so sánh. |
| [The Pudding — Design](https://pudding.cool/process/how-to-make-dope-shit-part-2/) | Lưu tác phẩm tham khảo kèm nhận xét, xác định thông điệp, dựng thiết kế tĩnh và lặp trước khi lập trình. | Chất lượng thiết kế phải được đánh giá riêng trước khi gọi kiểm thử kỹ thuật là hoàn tất. |
| [deck.gl — tài liệu chính thức](https://deck.gl/docs) | Tách dữ liệu thành các lớp vẽ, hỗ trợ picking/highlighting/filtering và xử lý tập dữ liệu lớn bằng GPU. | Chọn renderer theo tải đo được. GPU có thể hỗ trợ độ dày và tương tác; nó không thay thế việc chọn cấu trúc thị giác. |

## Những khả năng đã kiểm tra trong mã Memoire

- `src/utils/knowledgeGraph.ts` đã có mô hình node/quan hệ cho customer, person, opportunity, brand, product và knowledge. Đây là điểm bắt đầu để đánh giá một mạng quan hệ có căn cứ. Chưa xác minh độ đầy đủ của các liên kết trong từng workspace.
- `src/domain/commercialKernel/opportunityChanges.ts` ghi nhận thay đổi stage, expected close period, estimated value và status. Có thể đánh giá khả năng dựng lịch sử từ sự kiện, nhưng phải kiểm tra giới hạn lưu lịch sử và các trường hợp import. Không được coi `updatedAt` là ngày chuyển giai đoạn.
- `src/utils/receivables.ts`, `activityLedger.ts`, `commercialJourney.ts` và `forecastCalibration.ts` là các nguồn hiện có cần đọc sâu cho các câu hỏi tiền, nhịp làm việc, hành trình và độ tin cậy. Chỉ sự tồn tại của module chưa chứng minh mọi biểu đồ đề xuất đều có đủ dữ liệu.

## Nguyên tắc cho lần thiết kế tiếp theo

1. Chọn câu hỏi mở đầu cụ thể: tiền tập trung ở đâu, cơ hội nào đang chững lại, hoặc các quan hệ thương mại kết nối ra sao. Câu trả lời phải hiện ra ở góc nhìn mặc định.
2. Dành phần lớn diện tích cho một visualization chính. Góc nhìn hỗ trợ và thông tin bản ghi chỉ xuất hiện theo mức độ cần thiết.
3. Tạo phân cấp bằng hình học, mật độ, nhãn và khoảng trống. Mỗi màu, kích thước và đường nối phải có nghĩa được định nghĩa.
4. Khi chọn, giữ phần không liên quan làm nền so sánh. Khi đổi góc nhìn, bảo toàn thực thể đang được theo dõi.
5. Dựng bản thiết kế desktop và mobile với dữ liệu có phân bố hợp lý, có ngoại lệ, có thiếu dữ liệu và có quan hệ đủ phong phú. Mọi dữ liệu giả lập phải được ghi rõ.
6. Kiểm tra thị giác ở ba trạng thái: tổng quan, một cụm được chọn, một bản ghi được mở. Xác nhận đọc được câu hỏi, đơn vị và kết quả mà không cần hover.
7. Đánh giá renderer sau khi đo mật độ và tải tương tác. SVG cho nhãn/trục, Canvas cho trường điểm hoặc cạnh dày, WebGL khi phép đo chứng minh cần thiết. Không mặc định thêm 3D.

Kết quả nghiên cứu: tiêu chuẩn mới là một không gian khám phá có bố cục và tương tác dựa trên ý nghĩa dữ liệu. Bản Visual Explorer đầu tiên chỉ là nền kỹ thuật để tham khảo, chưa đáp ứng tiêu chuẩn thị giác này.
