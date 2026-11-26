# API

Base URL: `http://localhost:4100/api` (trực tiếp) · `http://localhost:3100/api` (qua frontend) · JSON camelCase · thời điểm ISO 8601 UTC · tiền VNĐ số nguyên.

**Swagger UI: http://localhost:4100/api/docs** · OpenAPI JSON: `/api/docs-json` — sinh tự động từ DTO (plugin `@nestjs/swagger`, đọc class-validator + JSDoc `@example`) và decorator trên controller; là nguồn chi tiết nhất cho request/response. File này là bản tóm tắt. Tắt bằng `SWAGGER_ENABLED=false`.

## 1. Quy ước chung

**Xác thực**: `POST /auth/login` đặt cookie httpOnly `coffeepos_token` (12 giờ) **và** trả `token`. Endpoint khác nhận `Authorization: Bearer <token>` (ưu tiên) hoặc cookie. Mọi endpoint cần đăng nhập trừ khi ghi "công khai" (guard toàn cục).

**Vai trò**: `cashier` (Thu ngân) · `barista` (Pha chế) · `admin` (Chủ quán).

**Webhook SePay** (`POST /payments/sepay/webhook`) là route công khai duy nhất ghi dữ liệu: không dùng phiên đăng nhập mà xác thực bằng header `Authorization: Apikey <SEPAY_WEBHOOK_KEY>` (so sánh hằng thời gian). Chưa đặt key → 503.

**Lỗi**: `{ "error": "<tiếng Việt>" }`; lỗi validate thêm `details` theo đường dẫn trường.

```json
{ "error": "Dữ liệu không hợp lệ", "details": { "items.0.quantity": "Số lượng tối thiểu là 1" } }
```

| Status | Khi nào |
|---|---|
| 400 | dữ liệu sai (DTO), vi phạm luật bán hàng (món ngừng bán, thiếu size, > 50 ly/món), vi phạm CHECK |
| 401 | chưa đăng nhập, token sai / hết hạn, tài khoản bị khóa |
| 403 | sai vai trò |
| 404 | không tìm thấy |
| 409 | trùng dữ liệu (tên món), chuyển trạng thái sai thứ tự / bị người khác cập nhật trước, pha đơn chưa thanh toán (BR06), thu tiền mặt cho đơn đã thanh toán |
| 429 | đăng nhập / nhập mật khẩu hiện tại sai quá 5 lần mỗi tài khoản hoặc 20 lần mỗi IP trong 15 phút — kèm header `Retry-After` (giây) |
| 500 | lỗi hệ thống (không lộ chi tiết) |
| 503 | webhook SePay khi server chưa đặt `SEPAY_WEBHOOK_KEY` |

**Field lạ bị bỏ qua**: ValidationPipe `whitelist` loại mọi field không khai báo — gửi `price`, `total` lên cũng không có tác dụng.

## 2. Danh sách endpoint

| Method | Đường dẫn | Vai trò | Mô tả | UC |
|---|---|---|---|---|
| GET | `/docs` · `/docs-json` | công khai | Swagger UI · OpenAPI 3 JSON | — |
| GET | `/health` | công khai | API + kết nối DB | — |
| POST | `/auth/login` | công khai | đăng nhập | UC01 |
| POST | `/auth/logout` | công khai | xóa cookie + **thu hồi mọi token** của tài khoản (204) | UC01 |
| GET | `/auth/me` | đã đăng nhập | tài khoản hiện tại | UC01 |
| PATCH | `/auth/password` | đã đăng nhập | đổi mật khẩu; thu hồi phiên ở thiết bị khác, cấp token + cookie mới | UC01 |
| GET | `/categories` | đã đăng nhập | danh mục | UC06 |
| GET | `/products` | đã đăng nhập | menu đang bán; `?all=true` gồm món ngừng bán (chỉ admin, khác → 403) | UC02, UC06 |
| POST | `/products` | admin | thêm món | UC06 |
| PATCH | `/products/:id` | admin | sửa tên / danh mục / giá / size / ẩn-hiện | UC06 |
| POST | `/orders` | cashier, admin | tạo đơn = bấm Thanh toán; `paymentMethod: transfer` → đơn chờ chuyển khoản kèm mã QR | UC02, UC04, UC07 |
| GET | `/orders` | đã đăng nhập | danh sách đơn **đã thanh toán**, `?status=pending,preparing,ready` (mặc định), `?limit=` ≤ 200, thanh toán trước lên trước; `?payment=unpaid` → đơn chờ chuyển khoản, mới nhất trước (chỉ cashier, admin — barista 403) | UC05, UC07 |
| GET | `/orders/:code` | đã đăng nhập | chi tiết đơn theo mã `CP-000123` (sai định dạng / không có → 404) | UC03 |
| PATCH | `/orders/:id/status` | barista, admin | chuyển sang bước kế tiếp (đơn chưa thanh toán → 409) | UC05 |
| POST | `/orders/:id/pay-cash` | cashier, admin | khách trả tiền mặt thay chuyển khoản → đơn đã thanh toán, `paidBy` = người bấm (200); đã thanh toán → 409 | UC07 |
| POST | `/payments/sepay/webhook` | công khai + API key | SePay báo giao dịch; luôn trả `{ "success": true }` khi đã ghi nhận | UC07 |
| GET | `/payments/transactions` | cashier, admin | giao dịch SePay đã nhận, mới nhất trước, `?limit=` ≤ 500 (mặc định 100) | UC07 |
| GET | `/payments/settings` | đã đăng nhập | có bật chuyển khoản không, tài khoản nhận tiền, webhook đã có key chưa (không trả key) | UC07 |
| GET | `/reports/revenue` | admin | dashboard doanh thu theo khoảng ngày `?from=&to=` (YYYY-MM-DD, giờ Việt Nam; mặc định 7 ngày gần nhất, tối đa 366 ngày): tổng quan + kỳ trước, theo ngày, giờ, nguồn đơn, phương thức thanh toán, danh mục, top 10 món | UC08 |
| GET | `/quality/report` | admin | báo cáo kiểm thử tự động (đọc `reports/test-report.json`); chưa có → 404, file hỏng → 500 | — |

## 3. Chi tiết

### POST `/auth/login`

```json
{ "username": "thungan1", "password": "Coffee@123" }
```
**200** → `{ "user": { "id": 2, "username": "thungan1", "fullName": "Thu ngân Lan", "role": "cashier" }, "token": "eyJ..." }` + `Set-Cookie`. Sai → 401 `Sai tên đăng nhập hoặc mật khẩu` (cùng thông báo cho mọi trường hợp, kể cả tên không tồn tại). Sai quá nhiều → 429.

Token JWT gồm `sub`, `role`, `ver` (= `users.token_version`). Đăng xuất / đổi mật khẩu tăng `token_version` → token cũ trả 401 `Phiên đăng nhập đã kết thúc`.

### PATCH `/auth/password`

```json
{ "currentPassword": "Coffee@123", "newPassword": "CaPhe2026!" }
```
Mật khẩu mới: 8–72 ký tự (≤ 72 byte), có chữ và số, khác mật khẩu cũ, không chứa tên đăng nhập, không thuộc danh sách phổ biến (gồm `Coffee@123`). **200** → như đăng nhập (token + cookie mới). Lỗi: 400 `details.currentPassword` / `details.newPassword`; 429 khi nhập sai mật khẩu hiện tại quá nhiều.

### GET `/products`

```json
{
  "items": [{
    "id": 2, "name": "Cà phê sữa đá", "category": { "id": 1, "name": "Cà phê" },
    "price": 29000, "priceL": 35000, "hasSize": true, "isActive": true, "imageUrl": null,
    "updatedAt": "2026-11-19T13:02:59.000Z", "updatedBy": { "id": 1, "fullName": "Chủ quán" }
  }],
  "sizeSurcharge": { "S": 0, "M": 0, "L": 6000 }
}
```
`priceL` do server tính (`null` nếu món không có size).

### POST / PATCH `/products`

```json
{ "name": "Cà phê muối", "categoryId": 1, "price": 39000, "hasSize": true, "isActive": true }
```
`price`: số nguyên 1.000–1.000.000. PATCH nhận một phần các field. Lưu `updatedBy` = người sửa. Trùng tên → 409; danh mục không tồn tại → 400.

### POST `/orders` (UC02, UC04)

```json
{
  "source": "counter",
  "note": "Ít đá",
  "items": [
    { "productId": 2, "size": "L", "quantity": 2, "note": "Ít đường" },
    { "productId": 11, "quantity": 1 }
  ]
}
```
- `items`: 1–50 dòng; `quantity` số nguyên 1–50; `size` S/M/L, bắt buộc với món có size, bị bỏ qua với món không size.
- Cùng một món ở nhiều dòng: tổng số lượng tối đa 50 (BR02).
- `source`: `counter` (mặc định) / `grabfood` / `shopeefood`; khác `counter` thì bắt buộc `partnerCode`.
- `paymentMethod` (UC07): `cash` (mặc định — đã thu, `paymentStatus: paid`, `paidBy` = thu ngân) / `transfer` (chỉ đơn `counter`, server phải cấu hình đủ `SEPAY_BANK` + `SEPAY_ACCOUNT_NO` + `SEPAY_WEBHOOK_KEY`; đơn `paymentStatus: unpaid`, chưa hiện ở quầy pha — BR06).
- Server lấy giá từ DB, tính `unitPrice`, `lineTotal`, `total` (BR01, BR05).

**201**:
```json
{
  "id": 1, "code": "CP-000001", "source": "counter", "partnerCode": null, "note": "Ít đá",
  "status": "pending", "statusLabel": "Chờ pha", "total": 98000,
  "paymentMethod": "cash", "paymentStatus": "paid", "paymentLabel": "Đã thanh toán", "paidAt": "...", "paidBy": { "id": 2, "fullName": "Thu ngân Lan" },
  "amountReceived": 0, "transfer": null,
  "createdAt": "...", "updatedAt": "...", "cashier": { "id": 2, "fullName": "Thu ngân Lan" },
  "items": [
    { "id": 1, "productId": 2, "productName": "Cà phê sữa đá", "size": "L", "unitPrice": 35000, "quantity": 2, "lineTotal": 70000, "note": "Ít đường" },
    { "id": 2, "productId": 11, "productName": "Bánh croissant", "size": null, "unitPrice": 28000, "quantity": 1, "lineTotal": 28000, "note": null }
  ]
}
```
Đơn chuyển khoản chưa thanh toán có thêm `transfer` (số tiền **còn thiếu**, nội dung bắt buộc, ảnh QR):
```json
"paymentMethod": "transfer", "paymentStatus": "unpaid", "paymentLabel": "Chờ chuyển khoản", "paidAt": null, "amountReceived": 0,
"transfer": { "bank": "MBBank", "accountNo": "0123456789", "accountName": "QUAN CA PHE ABC", "amount": 98000,
              "content": "CF000001", "qrUrl": "https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=98000&des=CF000001&template=compact" }
```
Lỗi: 401 (chưa đăng nhập), 403 (pha chế), 400 (đơn rỗng, số lượng sai, món ngừng bán / không tồn tại, thiếu size, thiếu mã đơn đối tác, chuyển khoản cho đơn đối tác, chưa cấu hình tài khoản nhận chuyển khoản).

### PATCH `/orders/:id/status` (UC05)

```json
{ "status": "preparing" }
```
Chỉ đi tới bước kế tiếp: `pending → preparing → ready → done`. Sai thứ tự, đơn chưa thanh toán (BR06) hoặc đơn vừa được người khác cập nhật → 409. **200** → object đơn.

### POST `/payments/sepay/webhook` (UC07)

Cấu hình trên SePay (Thêm Webhook): URL `<địa chỉ web>/api/payments/sepay/webhook` · loại giao dịch **Tiền vào** · định dạng **JSON** · bảo mật **API Key** = `SEPAY_WEBHOOK_KEY` · bật tự động gửi lại khi lỗi.

```http
Authorization: Apikey <SEPAY_WEBHOOK_KEY>
```
```json
{
  "id": 92704, "gateway": "MBBank", "transactionDate": "2026-11-26 14:02:37", "accountNumber": "0123456789",
  "code": null, "content": "NGUYEN VAN A chuyen tien CF000001", "transferType": "in", "transferAmount": 98000,
  "accumulated": 19077000, "subAccount": null, "referenceCode": "MBVCB.3278907687", "description": "..."
}
```
- Chỉ đọc `id`, `gateway`, `transactionDate` (giờ Việt Nam → lưu UTC), `accountNumber`, `code`, `content`, `transferType`, `transferAmount`, `referenceCode`; field khác bị bỏ qua.
- Chuỗi quá dài (`content` > 500 ký tự…) bị cắt bớt khi lưu, không từ chối. `id` vượt int4 → 400.
- Mã đơn tìm trong `code` rồi `content`: `CF000001`, chấp nhận `cf-000001`, `CF 000001`, có chữ trước/sau; vẫn nhận tiền tố cũ `CP` (đơn tạo trước khi đổi sang `CF`); số vượt int4 không coi là mã đơn. Tiền tố `CF` khớp "Cấu trúc mã thanh toán" trên SePay (tiền tố `CF`, hậu tố 6–10 ký tự, Số nguyên) để SePay điền được field `code`.
- Chỉ tiền vào **đúng `accountNumber` = `SEPAY_ACCOUNT_NO`** mới được gắn đơn.
- Đối soát (`backend/src/payments/payment-rules.ts`): tiền ra → `outgoing`; không có mã / đơn không tồn tại / sai tài khoản nhận → `unmatched`; đơn đã thanh toán (kể cả đơn tiền mặt) → `already_paid`; cộng dồn mọi lần chuyển, đủ tổng → `matched` (đơn sang đã thanh toán, hiện ở quầy pha), chưa đủ → `partial`. Chuyển thừa vẫn là `matched` — thu ngân tự hoàn phần thừa.
- Cùng `id` gửi lại (kể cả đồng thời) chỉ ghi một lần. Khoá dòng đơn khi đối soát để hai giao dịch về cùng lúc không cộng sai.

**200** `{ "success": true }` · 401 sai / thiếu key · 400 sai định dạng · 503 chưa đặt key.

### GET `/payments/transactions` (UC07)

**200** `{ "items": [{ "id", "sepayId", "gateway", "accountNumber", "transferType", "amount", "content", "referenceCode", "transactionDate", "createdAt", "status", "statusLabel", "orderCode" }] }` — `statusLabel`: Đã khớp đơn / Chưa đủ tiền / Đơn đã thanh toán trước / Không khớp đơn / Tiền ra.

### GET `/payments/settings` (UC07)

`transferEnabled` = có đủ ngân hàng + số tài khoản + webhook key.

**200** `{ "transferEnabled": true, "bank": "MBBank", "accountNo": "0123456789", "accountName": "QUAN CA PHE ABC", "webhookKeyConfigured": true, "webhookPath": "/api/payments/sepay/webhook" }`

### GET `/reports/revenue` (UC08)

Chỉ chủ quán (thu ngân, pha chế → 403). Doanh thu = tổng `total` của đơn **đã thanh toán** (`payment_status = paid`), xếp theo thời điểm thanh toán `paid_at` — đơn chuyển khoản chưa nhận đủ tiền chưa tính (BR06). Ngày, giờ theo giờ Việt Nam (UTC+7). Xử lý khoảng ngày: `backend/src/reports/report-range.ts` (hàm thuần, có unit test).

| Query | Ý nghĩa |
|---|---|
| `from`, `to` | `YYYY-MM-DD`, tính cả hai đầu. Bỏ trống cả hai → 7 ngày gần nhất (tới hôm nay); thiếu một đầu → 7 ngày tính từ / tới đầu còn lại |

**200**
```json
{
  "from": "2026-11-20", "to": "2026-11-26",
  "summary": { "revenue": 4250000, "orders": 98, "itemsSold": 176, "avgOrderValue": 43367,
               "previous": { "revenue": 3900000, "orders": 90, "itemsSold": 160, "avgOrderValue": 43333 } },
  "byDay": [{ "date": "2026-11-20", "revenue": 612000, "orders": 14 }],
  "byHour": [{ "hour": 7, "revenue": 980000, "orders": 23 }],
  "bySource": [{ "source": "counter", "revenue": 3100000, "orders": 72 }],
  "byPaymentMethod": [{ "paymentMethod": "cash", "revenue": 2600000, "orders": 61 }],
  "byCategory": [{ "category": "Cà phê", "revenue": 2100000, "quantity": 70 }],
  "topProducts": [{ "productId": 2, "name": "Cà phê sữa đá", "revenue": 1250000, "quantity": 42 }]
}
```
- `previous`: kỳ trước cùng số ngày, liền trước `from`.
- `byDay` đủ mọi ngày, `byHour` đủ 24 giờ, `bySource` đủ 3 nguồn, `byPaymentMethod` đủ 2 phương thức (không có đơn = 0). `byCategory` theo danh mục **hiện tại** của món, `topProducts` tối đa 10 món, đều xếp doanh thu cao trước.
- **400** `from`/`to` sai định dạng (kèm `details`), ngày không có thật (30/02), `from` sau `to`, quá 366 ngày.
