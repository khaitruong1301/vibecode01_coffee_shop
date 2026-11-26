# Database

Nguồn chính: `backend/prisma/schema.prisma` · migration: `backend/prisma/migrations/` · PostgreSQL 17, DB `coffeepos` (chính), `coffeepos_test` (e2e).
Tiền: `Int` (VNĐ). Thời điểm: `timestamptz(6)`, phiên DB luôn UTC. Field Prisma camelCase ↔ cột snake_case.

## 1. Quan hệ

```
users 1─n orders 1─n order_items n─1 products n─1 categories
users 1─n products (updated_by_id — người sửa giá lần cuối)
orders 1─n bank_transactions (order_id? — giao dịch SePay khớp đơn, UC07)
users 1─n orders (paid_by_id — người xác nhận thu tiền mặt)
```

## 2. Bảng

| Bảng (model) | Cột chính | Ghi chú |
|---|---|---|
| `users` (User) | `username` unique, `password_hash`, `full_name`, `role` (Role), `is_active`, `token_version` | bcrypt; tài khoản khóa không đăng nhập / dùng token được; `token_version` tăng khi đăng xuất / đổi mật khẩu → token cũ bị từ chối (migration `user_token_version`) |
| `categories` (Category) | `name` unique, `sort_order` | |
| `products` (Product) | `category_id`, `name` unique, `price`, `has_size`, `is_active`, `image_url?`, `updated_by_id?` | `price` là giá size S/M; giá L do code tính (BR05) |
| `orders` (Order) | `cashier_id`, `source` (OrderSource), `partner_code?`, `note?`, `status` (OrderStatus), `total`, `payment_method` (PaymentMethod, mặc định `cash`), `payment_status` (PaymentStatus, mặc định `paid`), `paid_at?` (mặc định lúc tạo), `paid_by_id?` | mã `CP-000123` suy ra từ `id`, không lưu; nội dung chuyển khoản `CP000123`. Đơn chuyển khoản tạo với `unpaid` + `paid_at` null. `paid_by_id` = nhân viên xác nhận thu tiền mặt, null khi SePay báo tiền về (migration `order_payment_sepay`, `order_paid_at_default`, `order_paid_by`) |
| `bank_transactions` (BankTransaction) | `sepay_id` unique, `gateway`, `account_number`, `transfer_type` (`in`/`out`), `amount`, `content`, `reference_code?`, `transaction_date`, `order_id?`, `status` (BankTxStatus) | giao dịch SePay gửi qua webhook (UC07); `sepay_id` unique chống xử lý trùng khi SePay gửi lại |
| `order_items` (OrderItem) | `order_id`, `product_id`, `product_name`, `size?`, `unit_price`, `quantity`, `line_total`, `note?` | chụp tên + đơn giá lúc bán; `size` null với món không size |

`users`, `products`, `orders`, `bank_transactions` có `created_at`, `updated_at`.

## 3. Enum

| Enum | Giá trị |
|---|---|
| `Role` | `cashier`, `barista`, `admin` (Chủ quán) |
| `OrderStatus` | `pending` (Chờ pha) → `preparing` (Đang pha) → `ready` (Xong — chờ giao) → `done` (Đã giao) |
| `OrderSource` | `counter`, `grabfood`, `shopeefood` |
| `Size` | `S`, `M`, `L` |
| `PaymentMethod` | `cash` (Tiền mặt), `transfer` (Chuyển khoản) |
| `PaymentStatus` | `paid` (Đã thanh toán), `unpaid` (Chờ chuyển khoản) |
| `BankTxStatus` | `matched` (đủ tiền, đơn sang đã thanh toán) · `partial` (chưa đủ) · `already_paid` (đơn đã thanh toán trước) · `unmatched` (không khớp đơn) · `outgoing` (tiền ra) |

## 4. Ràng buộc & index

| Ràng buộc | Nội dung | Luật |
|---|---|---|
| `products_price_positive` | `price > 0` | BR01 |
| `order_items_quantity_range` | `quantity BETWEEN 1 AND 50` | BR02 |
| `order_items_amount_positive` | `unit_price > 0 AND line_total = unit_price * quantity` | BR01 |
| `orders_total_positive` | `total > 0` | BR03 |
| `orders_partner_code_required` | `source = 'counter'` hoặc có `partner_code` khác rỗng | UC04 |
| `orders_paid_at_consistent` | `payment_status = 'paid'` ⇔ có `paid_at` | UC07 |
| `orders_unpaid_only_transfer` | chỉ đơn `transfer` mới có thể `unpaid` | UC07 |
| `orders_transfer_counter_only` | `transfer` chỉ cho đơn `counter` | UC07 |
| `orders_unpaid_not_prepared` | đơn `unpaid` phải ở `pending` | BR06 |
| `bank_transactions_amount_nonnegative` | `amount >= 0` | UC07 |
| `bank_transactions_transfer_type_valid` | `transfer_type IN ('in', 'out')` | UC07 |

CHECK constraint được thêm thủ công trong migration `init`, `order_payment_sepay` và `order_paid_by` — lớp chặn cuối nếu code bỏ sót; vi phạm trả 400.

- Khóa ngoại: `products → categories` RESTRICT · `products.updated_by_id → users` SET NULL · `orders → users` RESTRICT · `orders.paid_by_id → users` SET NULL · `order_items → orders` CASCADE · `order_items → products` RESTRICT · `bank_transactions.order_id → orders` RESTRICT.
- Index: `orders(status, created_at)`, `orders(payment_status, status)`, `order_items(order_id)`, `products(category_id)`, `bank_transactions(order_id)`, `bank_transactions(created_at)`.

## 5. Dữ liệu mẫu (`backend/src/seed/`)

- 7 tài khoản (mật khẩu `Coffee@123` ở dev; production dùng `SEED_PASSWORD` — bắt buộc): `chuquan` (admin), `thungan1..3` (cashier), `phache1..3` (barista).
- 4 danh mục, 13 món (2 món bánh không size, 1 món ngừng bán "Sinh tố bơ").
- Chỉ nạp khi bảng `users` trống — khởi động lại container không ghi đè giá đã sửa. e2e dùng `resetDatabase()` (TRUNCATE + nạp lại) trên DB test.
