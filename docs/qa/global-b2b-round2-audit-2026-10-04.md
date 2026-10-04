# Memoire — Vòng test và audit B2B thứ hai, 04/10/2026

**Kết luận: chưa thông qua QC toàn vòng.** Các ca cơ sở và sửa lỗi F01–F07 tiếp tục qua kiểm tra; phát hiện **hai lỗi sản phẩm mới**, gồm P1 mất khoản thu khi đồng bộ và P2 lịch trả tiền vượt giá trị hợp đồng. Hai lỗi này vẫn mở; vòng này chưa sửa hoặc phát hành mã ứng dụng.

Doanh nghiệp Northstar Industrial Supply và mọi giao dịch là giả lập. Phép thử ghi cloud chỉ dùng tài khoản QC đã giữ lại từ vòng trước. Mọi bản ghi công nợ đã được hoàn trả và đối soát nội dung đầy đủ sau thử nghiệm.

## Bản đang được kiểm tra

- Tên miền: https://www.memoire-official.com.
- Vercel: `dpl_FhcgggxzP1yvV3QPbBtbsksxCrqr`, trạng thái `READY`.
- Git SHA ứng dụng: `153fd6014c876c484d2cfd19ab56c10bffc22ddb`, nhánh Production `master`.
- Project ứng dụng và đích Supabase được đối chiếu với cấu hình Memoire. SHA hiện tại của checkout `58e68d6` chỉ bổ sung báo cáo đóng lỗi so với bản ứng dụng này.
- Bằng chứng độc lập của vòng này: `.audit/global-b2b-round2-2026-10-04/`. File riêng chứa thông tin đăng nhập hoặc dữ liệu khôi phục không được đưa vào Git.

## F08 — P1: đồng bộ ghi đè mất các khoản thu

**Trạng thái: mở. Tái hiện trên cloud và giao diện Production.** Một người dùng sử dụng laptop và điện thoại cũng gặp điều kiện này; không cần workspace nhiều thành viên.

| Ca tái hiện | Kỳ vọng | Kết quả thực tế |
| --- | --- | --- |
| Mở hai phiên A/B trên cùng đơn chưa thu. A ghi 111 USD, chờ cloud trả thành công. B ghi 222 USD từ màn hình đã mở trước đó. | Giữ cả hai receipt, tổng mới 333 USD. | Cloud chỉ còn receipt 222 USD; receipt 111 USD biến mất. |
| Hai phiên mở hai đơn khác nhau. E ghi 555 USD trên đơn thứ nhất; F ghi 666 USD trên đơn thứ hai. | Thay đổi đơn thứ hai không sửa đơn thứ nhất. | Receipt 555 USD của đơn thứ nhất biến mất khi F lưu đơn thứ hai. |
| C ghi 333 USD; chặn riêng yêu cầu ghi công nợ để giả lập lỗi kết nối. D ghi 444 USD thành công. Cho C kết nối lại rồi tải lại trang. | Khoản chờ đồng bộ vẫn được giữ hoặc được đưa vào xử lý xung đột. | Sau tải lại, cả browser của C và cloud chỉ giữ 444 USD; 333 USD mất khỏi dữ liệu làm việc. |

Hai ca cùng đơn và mất kết nối được tái hiện lại trong lần chạy độc lập; ca khác đơn mở rộng phạm vi ảnh hưởng. Browser không có lỗi runtime trong các lần tái hiện thành công. Lúc chặn ghi, giao diện có báo `Sync issue`; cảnh báo này không giữ được receipt khi tải lại.

Nguyên nhân được đối chiếu với mã:

- [orderReceivableStore.ts](../../src/services/orderReceivableStore.ts#L156) lưu toàn bộ danh sách công nợ sau một thay đổi.
- [cloudJsonCollectionStore.ts](../../src/services/cloudJsonCollectionStore.ts#L46) upsert toàn bộ payload của các dòng được gửi, không kiểm tra phiên bản hiện tại trên máy chủ. Bản sao cũ của các đơn khác cũng được gửi.
- [cloudJsonCollectionStore.ts](../../src/services/cloudJsonCollectionStore.ts#L173) chọn nguyên bản ghi theo `updatedAt`; không bảo toàn các thao tác receipt đang chờ. Một bản cloud mới hơn có thể thay thế bản local chứa khoản chưa đồng bộ.

Điều kiện đóng lỗi: ghi đúng bản ghi đã đổi; máy chủ chống ghi đè từ phiên bản cũ; giữ thao tác thu/xóa/sửa đang chờ cùng mã định danh và phát hiện xung đột. Chỉ hợp nhất mảng theo mã receipt sẽ chưa đủ vì có thể làm sống lại khoản đã xóa. Chạy lại đủ ba ca trên, thêm retry, xóa receipt đồng thời và sửa ngày giao hàng trong lúc phiên khác ghi tiền. Cần xác nhận dữ liệu sau reload từ cả hai thiết bị, không chỉ ngay sau click.

Bằng chứng: `concurrent-first-run.json`, `concurrent-payments-evidence.json`, ảnh `concurrent-session-a.png`, `concurrent-session-b.png`, `different-orders-stale-write.png`, `failed-sync-before-refresh.png`, `failed-sync-after-refresh.png`. Script tái hiện ở cùng thư mục; khối `finally` đóng các phiên trước khi hoàn trả dữ liệu.

## F09 — P2: lịch trả tiền vượt trần hợp đồng tạo công nợ không có thật

**Trạng thái: mở. Tái hiện ở hàm lưu, kiểm tra phục hồi và giao diện dùng mã Production với dữ liệu browser cách ly.** Phạm vi là lịch operator/legacy/import; không khẳng định form Collections hiện tại cho phép nhập trực tiếp hai đợt này.

Ca thử dùng hợp đồng 10.000 USD đã thu đủ 4.000 + 6.000 USD. Lịch override có hai đợt, mỗi đợt 100%. `saveOrderReceivableTerms` chấp nhận; `buildRestorePlan` cũng chấp nhận backup chứa lịch này.

Kết quả: lịch tổng cộng 20.000 USD; Collections báo còn nợ 10.000 USD và đơn chưa thu đủ, dù giá trị hợp đồng và tiền thực nhận đều là 10.000 USD. Giao diện báo thêm khoản quá hạn 354 ngày. Đây là số dư tăng do lịch sai, không phải thay đổi hợp đồng được chấp nhận.

- [paymentTerms.ts](../../src/utils/paymentTerms.ts#L379) giới hạn từng tỷ lệ riêng lẻ; không giới hạn tổng lịch.
- [receivables.ts](../../src/utils/receivables.ts#L331) bổ sung khi lịch thiếu giá trị hợp đồng nhưng không từ chối lịch vượt trần.
- Bộ kiểm tra backup xác minh các receipt xung đột nhưng chưa từ chối lịch vượt giá trị hợp đồng.

Điều kiện đóng lỗi: từ chối lịch vượt trần, hoặc đưa vào trạng thái cần sửa với giải thích rõ trước khi dùng làm công nợ. Bảo vệ cả hàm ghi, đường phục hồi và bộ tính nhận dữ liệu cũ. Kiểm tra lịch phần trăm, số tiền cố định, lịch hỗn hợp và sai số làm tròn đa tiền tệ; không tự giảm hoặc đổi điều khoản đã lưu mà thiếu thông báo.

Bằng chứng: `restore-schedules-evidence.json`, `overscheduled-contract-demo.png`, `overscheduled-contract-demo.txt`. Giao diện tái hiện sử dụng sample browser riêng; bộ kiểm tra chặn và đếm REST requests, kết quả **0 cloud requests**, không có runtime error.

## Kết quả qua kiểm tra

| Phạm vi | Bằng chứng vòng này |
| --- | --- |
| 12 mốc tháng và phép tính đối kháng | Đối soát pipeline, won, win rate, đơn hàng, tiền thu, công nợ, thu dư, giá vốn và lợi nhuận. Receipt trùng, ngày tương lai và quote chưa Accepted không làm sai kết quả. |
| Giao diện tài khoản thật | Desktop và mobile 390px; deep link giữ Collections/tham số khác; từ chối khoản thu tương lai và không ghi cloud; receipt EUR giữ nhãn EUR; Orders nhận đúng thu đủ/thu một phần. |
| Báo cáo và backup thực | CSV Collections khớp oracle. ZIP từ giao diện đủ 56 bảng, 1.290 dòng, 488 revision; manifest hoàn chỉnh và không có cảnh báo. |
| Diễn tập phục hồi có dữ liệu | Database cách ly phục hồi 41 collection chuẩn, giữ lineage, mốc bảo đảm lịch sử và 488 revision. Gọi lại lịch sử trả `no_op`; số tiền và lợi nhuận sau phục hồi khớp. |
| Chặn backup sai | Từ chối dòng công nợ khác owner, manifest sai số dòng, format tương lai, receipt cùng mã khác nội dung và JSON hỏng trước khi ghi. |
| Phiên đăng nhập thật | UI password login; UI logout xóa session; truy cập Reports sau logout phải đăng nhập; đăng nhập lại mở được Reports. Không dùng session tự tiêm cho bài này. |
| Lịch sử và commercial dependency | Browser sample: drawer lịch sử chỉ đọc, reload, mốc trước bảo đảm lịch sử, chuyển timezone, cutoff sai và quay về hiện tại; Money Gate tạo liên kết và đọc cùng giá trị trên Opportunity/Money. |
| Kiểm tra tự động có trọng tâm | 64 test tiền/đơn/receipt và 25 test backup/owner: **89 test qua, 0 thất bại**. Contract offline Capture qua; đây là kiểm tra contract, không được tính thành thử PWA mất mạng thực tế. |

Vòng này không chạy lại toàn bộ `npm run check`; con số 2.085 test trong báo cáo đóng lỗi trước là kết quả vòng phát hành trước. Các ca fail do bộ kiểm tra dùng regex chứa dấu ngoặc hoặc yêu cầu cache chưa được Reports nạp đã được chỉnh và chạy lại; không tính thành lỗi sản phẩm hoặc kết quả qua chưa hoàn tất.

## Đối soát sau mọi phép thử gây lỗi

Kiểm tra cuối đọc lại từ cloud bằng phiên đăng nhập mới và so sánh toàn bộ payload của 48 bản ghi công nợ với snapshot trước thử, không chỉ số dòng.

| Chỉ tiêu | Kết quả cuối |
| --- | ---: |
| Opportunities / quotes / công nợ / chi phí | 96 / 96 / 48 / 48 |
| Receipts | 72 |
| Đơn thu đủ / còn mở | 24 / 24 |
| Đã thu, USD | 412.384,6154 |
| Còn phải thu, USD | 359.076,9215 |
| Lợi nhuận gộp, USD | 252.069,2308 |

Các số khớp oracle với sai số dưới 0,01 USD. Bằng chứng `final-owner-state.json` ghi `allReceivablePayloadsRestored: true`. Không ghi vào dữ liệu khách hàng thực hoặc thay đổi schema/billing.

## Sai lệch tài liệu và giới hạn kết luận

README dòng 11 còn nói Production pending P1, và dòng 35 nói navigation mới chưa triển khai. Hai câu không khớp deployment hiện được xác minh. Đây là vấn đề tài liệu P3, cần đồng bộ với trạng thái phát hành và các lỗi mới đang mở; báo cáo này không sửa lại tài liệu lịch sử để biến kết quả cũ thành kết quả mới.

Phạm vi tiếp tục là workspace cá nhân của doanh nghiệp giả lập. Chưa xác minh self-service signup/email delivery, tải đồng thời quy mô lớn hoặc toàn bộ mô hình chia sẻ/RLS nhiều chủ sở hữu. Lịch sử sample kiểm tra hành vi màn hình; không chứng minh có lịch sử quan sát thật trong 12 tháng. Các mốc tháng là mô phỏng dữ liệu và đối soát vận hành, không phải sổ kế toán được chứng nhận.

**Thứ tự xử lý tiếp theo: F08 trước, F09 sau; sau đó chạy lại đúng các ca tái hiện, kiểm tra hồi quy và cập nhật trạng thái release.**
