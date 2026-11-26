# Use case — CoffeePOS (phạm vi: Bán hàng)

Nguồn: Bài tập 1 buổi 7-8 "Kiểm thử và CI/CD trên CoffeePOS". Mã UC / BR / L dùng chung trong code, test và tài liệu; không đổi mã đã dùng, chỉ thêm mã mới.

Sơ đồ (PlantUML): `diagrams/01-tong-quan.puml` · `diagrams/02-ban-hang.puml`
Wireframe màn hình (draw.io, 9 trang): `../ui-ux/wireframe-man-hinh.drawio`

## 1. Bối cảnh

- Khoảng 150 đơn/ngày, cao điểm 7h–9h sáng; 2 quầy thu ngân; có đơn từ GrabFood, ShopeeFood.
- Nhân sự: 1 chủ quán, 1 quản lý, 3 thu ngân, 3 pha chế.
- Hệ thống hiện tại: Node.js 22 + `node:sqlite`, giao diện HTML + Bootstrap, deploy Vercel qua `api/index.js`, có `/api/health`.

## 2. Tác nhân

| Tác nhân | Loại | Việc làm |
|---|---|---|
| Nhân viên | trừu tượng | Đăng nhập; là cha của 3 vai bên dưới |
| Thu ngân | chính | Chọn món, size, thanh toán, in hóa đơn |
| Pha chế | chính | Nhận đơn ở màn quầy pha |
| Chủ quán (admin) | chính | Sửa giá, thêm món |
| GrabFood / ShopeeFood | hệ thống ngoài | Nguồn đơn giao đồ ăn |
| SePay | hệ thống ngoài | Báo giao dịch chuyển khoản vào tài khoản ngân hàng của quán (webhook) |

> Chưa rõ: đề có nhắc **quản lý** trong phần quy mô nhưng không mô tả quyền — hệ thống chưa có vai trò này.

## 3. Danh sách use case

| Mã | Tên | Tác nhân | Màn hình / API |
|---|---|---|---|
| UC01 | Đăng nhập, đăng xuất, đổi mật khẩu | Nhân viên | `/login`, `/account` → `/api/auth/*` (sai quá 5 lần / 15 phút bị khoá tạm) |
| UC02 | Bán hàng tại quầy (tạo đơn & thanh toán) | Thu ngân | `/checkout` → `POST /api/orders` |
| UC03 | In hóa đơn | Thu ngân | `/receipt/CP-000123` → `GET /api/orders/:code` |
| UC04 | Nhận đơn giao đồ ăn | Thu ngân, GrabFood/ShopeeFood | `/checkout` chọn nguồn + nhập mã đơn đối tác (nhập tay) |
| UC05 | Nhận đơn ở màn quầy pha | Pha chế | `/barista` → `GET /api/orders`, `PATCH /api/orders/:id/status` |
| UC06 | Quản lý sản phẩm (thêm món, sửa giá) | Chủ quán | `/products` → `GET/POST/PATCH /api/products` |
| UC07 | Thanh toán chuyển khoản QR (SePay) | Thu ngân, Chủ quán, SePay | `/checkout` chọn Chuyển khoản → `/receipt/CP-…` hiện QR · `POST /api/payments/sepay/webhook` · `/payments` → `GET /api/payments/transactions` |

Quan hệ: UC02, UC04, UC05, UC06 `<<include>>` UC01 · UC03 `<<extend>>` UC02 · UC07 `<<extend>>` UC02 · "Chọn size" `<<extend>>` "Chọn món".

## 4. Đặc tả UC02 — Bán hàng tại quầy

| Mục | Nội dung |
|---|---|
| Tác nhân | Thu ngân |
| Tiền điều kiện | Thu ngân đã đăng nhập (BR04) |
| Hậu điều kiện | Có 1 bản ghi `orders` + các bản ghi `order_items`; đơn hiện ở màn quầy pha; in được hóa đơn `CP-…` |

**Luồng chính**
1. Thu ngân mở `checkout.html`, chọn món, size, số lượng.
2. Bấm **Thanh toán** → trình duyệt gửi `POST /api/orders`.
3. Server kiểm tra đăng nhập (BR04) và kiểm tra đơn hợp lệ (BR02, BR03).
4. Server tính tổng tiền theo giá trong DB (BR01, BR05).
5. Server lưu `orders` + `order_items`, trả 201 kèm mã đơn.
6. Chuyển sang `receipt.html` để in hóa đơn (UC03).

**Luồng thay thế / ngoại lệ**
- 3a. Chưa đăng nhập → 401, không lưu đơn.
- 3b. Đơn không có món → 400.
- 3c. Có món với số lượng < 1 hoặc > 50 (gồm số âm, 0, số thập phân) → 400.
- 4a. Món không tồn tại → 400.

## 4b. Đặc tả UC07 — Thanh toán chuyển khoản QR (SePay)

| Mục | Nội dung |
|---|---|
| Tác nhân | Thu ngân (chính), Chủ quán, SePay (hệ thống ngoài) |
| Tiền điều kiện | Server đã cấu hình `SEPAY_BANK`, `SEPAY_ACCOUNT_NO` (+ `SEPAY_ACCOUNT_NAME`) và `SEPAY_WEBHOOK_KEY`; chủ quán đã tạo webhook trên SePay trỏ tới `/api/payments/sepay/webhook` và khai báo cấu trúc mã thanh toán tiền tố `CF` (hướng dẫn trên trang `/payments`) |
| Hậu điều kiện | Đơn `payment_status = paid`, có `paid_at`; giao dịch lưu ở `bank_transactions` gắn với đơn; đơn hiện ở màn quầy pha |

**Luồng chính**
1. Thu ngân chọn món (UC02), ở mục "Khách trả" chọn **Chuyển khoản**, bấm **Thanh toán chuyển khoản**.
2. Server tạo đơn `transfer` / `unpaid` (chưa hiện ở quầy pha — BR06), trả mã QR VietQR (số tiền + nội dung `CF000123`).
3. Màn hóa đơn hiện QR; khách quét bằng app ngân hàng và chuyển tiền.
4. SePay gọi webhook kèm API key; server tìm mã đơn trong nội dung, cộng dồn tiền đã nhận.
5. Đủ tiền → đơn chuyển sang đã thanh toán; màn hóa đơn (hỏi lại mỗi 3 giây) báo "Đã nhận đủ tiền", đơn hiện ở quầy pha.

**Luồng thay thế / ngoại lệ**
- 1a. Đơn GrabFood / ShopeeFood → không có lựa chọn chuyển khoản (đối tác thu tiền); API → 400.
- 1b. Chưa cấu hình đủ tài khoản nhận tiền + webhook key → nút Chuyển khoản bị khoá; API → 400.
- 4a. Sai / thiếu API key → 401, không ghi gì. Chưa đặt key → 503.
- 4b. Chuyển thiếu → giao dịch `partial`, QR hiện số còn thiếu; chuyển thêm cho đủ → đơn đã thanh toán.
- 4c. Nội dung không có mã đơn / đơn không tồn tại / tiền vào tài khoản khác `SEPAY_ACCOUNT_NO` → giao dịch `unmatched` (chủ quán xem ở `/payments`, xử lý tay).
- 4d. Chuyển vào đơn đã thanh toán → `already_paid` (thu ngân hoàn tiền tay).
- 4e. SePay gửi lại cùng giao dịch → chỉ xử lý một lần.
- 5a. Khách đổi ý trả tiền mặt → thu ngân bấm **Khách trả tiền mặt** → đơn thành tiền mặt, đã thanh toán, lưu người xác nhận (`paid_by_id`); phần đã chuyển khoản (nếu có) vẫn ở `amountReceived`.
- 5b. Thu ngân rời màn hóa đơn khi khách chưa chuyển → đơn nằm ở mục "Đơn chờ chuyển khoản" trên `/payments`, mở lại được QR.

_Chưa có_: huỷ đơn chờ chuyển khoản bị bỏ dở; cảnh báo số tiền chuyển thừa cần hoàn.

## 5. Luật bán hàng

| Mã | Luật |
|---|---|
| BR01 | Giá bán lấy từ màn Sản phẩm; chỉ admin được sửa. Server không dùng giá do trình duyệt gửi. |
| BR02 | Mỗi món 1–50 ly mỗi đơn — tính theo món trong cả đơn (cùng món tách nhiều dòng khác size vẫn tối đa 50). |
| BR03 | Đơn phải có ít nhất một món. |
| BR04 | Chỉ nhân viên đã đăng nhập mới tạo được đơn — cụ thể: Thu ngân và Chủ quán; Pha chế không tạo đơn (403). |
| BR05 | Size L cộng 6.000đ vào giá món; S, M giữ giá gốc; món không size (bánh) luôn giá gốc _(thay đổi giữa chừng — test cũ phải chỉ ra chỗ cần sửa)_. |
| BR06 | Đơn chuyển khoản chỉ được pha khi đã nhận đủ tiền: chưa hiện ở quầy pha, không chuyển trạng thái pha được (409). Tiền mặt / đơn đối tác coi như đã thanh toán lúc tạo. Quầy pha xếp theo thời điểm thanh toán. |

## 6. Lỗi thật đã tìm thấy trong `server.js`

Bản NestJS trong repo đã chặn cả 3 lỗi; test tương ứng nằm trong `backend/test/orders.e2e-spec.ts` (tên test bắt đầu bằng mã L1/L2/L3).

| Mã | Lỗi | Vi phạm | Kết quả mong đợi khi sửa |
|---|---|---|---|
| L1 | `POST /api/orders` không gọi `authorize()` | BR04 | Không có phiên đăng nhập → 401 |
| L2 | `qty` âm vẫn trả 201 (integration test buổi 6 đã bắt được) | BR02 | → 400, không lưu đơn |
| L3 | Tổng tiền lấy `price` do trình duyệt gửi lên | BR01 | Tổng tính lại từ giá trong DB, bỏ qua `price` client gửi |

## 7. Cách hiện thực các luật

| Luật | Chỗ trong code |
|---|---|
| BR01, BR02, BR03, BR05 | `backend/src/pricing/pricing.ts` (hàm thuần) + DTO `backend/src/orders/dto/order.dto.ts` + CHECK constraint trong DB |
| BR04 | Guard toàn cục `JwtAuthGuard` (mọi route cần đăng nhập) + `@Roles('cashier', 'admin')` trên `POST /orders` |
| L3 | DTO không có field giá; ValidationPipe `whitelist` loại field lạ |
| Luồng pha chế | `backend/src/orders/order-status.ts`: Chờ pha → Đang pha → Xong — chờ giao → Đã giao, không nhảy bước |
| BR06, UC07 | `backend/src/payments/payment-rules.ts` (hàm thuần `findOrderId`, `reconcile`) + `orders.service.ts` (lọc `payment_status = paid`, chặn chuyển trạng thái) + CHECK `orders_unpaid_not_prepared` |

## 8. Câu hỏi của chủ quán

| Câu hỏi | Hướng trả lời |
|---|---|
| "Sửa giá xong làm sao biết không tính sai?" | Unit test `pricing.spec.ts` + e2e "chủ quán sửa giá → đơn mới tính giá mới, đơn cũ giữ giá cũ"; trên màn Sản phẩm có ô "Xem thử tính tiền" và ghi người sửa giá cuối |
| "Có cách nào chặn code lỗi trước khi lên máy bán hàng không?" | CI chạy test trên mỗi lần push/PR; test fail thì chặn deploy lên Vercel |
