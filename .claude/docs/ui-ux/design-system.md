# Design system — CoffeePOS

Biến theme thật nằm ở `frontend/src/app/globals.css` (`@theme`), dùng qua class Tailwind (`bg-primary`, `text-muted`, `border-border`…). Wireframe: `wireframe-man-hinh.drawio`.

## 1. Màu (tông cà phê)

| Biến | Giá trị | Dùng cho |
|---|---|---|
| `--color-primary` | `#6F4E37` | Nút chính, điểm nhấn |
| `--color-primary-foreground` | `#FFFFFF` | Chữ trên nền primary |
| `--color-secondary` | `#F5EBDD` | Nền thẻ món, vùng phụ |
| `--color-background` | `#FAF7F2` | Nền trang |
| `--color-surface` | `#FFFFFF` | Thẻ, modal |
| `--color-foreground` | `#2B1D14` | Chữ chính |
| `--color-muted` | `#8A7768` | Chữ phụ |
| `--color-border` | `#E6DCCF` | Viền |
| `--color-success` / `--color-warning` / `--color-danger` | `#2E732` / `#ED8B00` / `#C62828` | Trạng thái |

Giá trị đang dùng trong `globals.css` khác bảng trên ở 3 chỗ: `--color-muted` `#7A675A` và `--color-warning` `#B26A00` (đậm hơn để chữ đủ tương phản trên nền sáng), `--color-success` `#2E7D32`; thêm `--color-primary-hover` `#5A3E2B`.

Trạng thái kiểm thử (trang `/quality`) luôn có biểu tượng + chữ: ✓ Đạt (`success`) · ✕ Không đạt (`danger`) · ○ Chưa làm · – Chưa chạy · ⊕ Gộp · ⚙ Đã cấu hình (`secondary`). Thanh coverage: phần tô = đạt/không đạt, nền = sắc nhạt cùng màu, vạch đứng = ngưỡng; luôn kèm số % và bảng.

Nhãn trạng thái: Chờ pha · Đang pha · Xong — chờ giao · Đã giao (màn quầy pha) · Đang bán = chữ trắng trên `success` · Ngừng bán = chữ `foreground` trên `secondary` (màn sản phẩm; đã kiểm tra tương phản bằng axe). Lỗi dùng `danger`, ghi chú pha chế dùng `warning`.

## 2. Chữ & khoảng cách
- Font: chuỗi font hệ thống (`--font-sans`: Be Vietnam Pro nếu máy có, rồi Segoe UI / system-ui…) — không tải font lúc build để Docker build không phụ thuộc mạng. Số tiền dùng class `tabular`.
- Bo góc: `rounded-lg` (input, nút) · `rounded-xl` (thẻ, modal). Nút `size="lg"` cao 56px, `md` 44px cho màn POS.

## 3. Component dùng chung (`frontend/src/components/ui.tsx`)

| Component | Ghi chú |
|---|---|
| `Button` | `variant`: primary / secondary / ghost / danger · `size`: sm (36px) / md (44px) / lg (56px) · `loading` hiện vòng xoay và khóa nút |
| `Input` | `invalid` tô viền đỏ; mặc định `w-full`, truyền class `w-*` để đặt chiều rộng khác |
| `Field` | nhãn + `error` (đỏ) hoặc `hint` (xám) dưới ô |
| `Chip` | nút dạng viên (`active`, `aria-pressed`, `disabled` mờ + con trỏ cấm) — nguồn đơn, phương thức thanh toán, danh mục, size, bộ lọc |
| `Alert` | `kind`: error / success / info |
| `Modal` | đóng bằng Esc, bấm nền, nút ×; `footer` cho nút hành động |
| `Spinner` | trạng thái đang tải kèm nhãn |

Khác: `AuthProvider` (phiên + `useRequireRole`), `Navbar` (menu theo vai trò, ẩn khi in).

Biểu đồ (`frontend/src/app/(app)/dashboard/charts.tsx`, chỉ dùng cho dashboard) — vẽ bằng HTML/CSS, không thêm thư viện:

| Component | Ghi chú |
|---|---|
| `ColumnChart` | cột theo thời gian, một chuỗi số liệu màu `primary` (đang rê / focus: `primary-hover`), lưới gạch `border`, trục y 3 mốc làm tròn (`niceMax`, tiền rút gọn `formatVndCompact`: 1,5tr · 350k), tooltip `role="status"`; mỗi cột là `li` focus được, có tên đọc đầy đủ |
| `BarList` | thanh ngang so sánh độ lớn: nhãn + số + dòng phụ ghi thẳng (không cần chú giải), rãnh `secondary`, thanh `primary` |
| `ChartCard` | khung biểu đồ: tiêu đề, gợi ý, "Xem bảng số liệu" (`details` + bảng trong vùng cuộn focus được) |

Một màu dữ liệu duy nhất (`primary`) vì mỗi biểu đồ chỉ một chuỗi; tăng / giảm luôn có ▲ / ▼ + chữ, không chỉ dựa vào màu `success` / `danger`.

## 4. Màn hình

| Route | Vai trò | Nội dung | UC |
|---|---|---|---|
| `/login` | công khai | Form đăng nhập, `?next=` quay lại trang trước | UC01 |
| `/` | đã đăng nhập | Chuyển tới trang mặc định: thu ngân → `/checkout`, pha chế → `/barista`, chủ quán → `/products` | — |
| `/checkout` | cashier, admin | Nguồn đơn (+ mã đơn đối tác), tìm/lọc món, chọn size, giỏ (−/+ số lượng 1–50, lỗi theo dòng), tạm tính, "Khách trả: Tiền mặt / Chuyển khoản" (chỉ đơn tại quầy; Chuyển khoản khoá khi chưa cấu hình tài khoản), nút Thanh toán / Thanh toán chuyển khoản; giỏ lưu `sessionStorage`; 401 → hộp thoại đăng nhập lại | UC02, UC04, UC07 |
| `/receipt/[code]` | đã đăng nhập | Hóa đơn đọc từ server (dòng "Thanh toán: phương thức · trạng thái"), nút In (ẩn khi in) và Đơn mới. Đơn chờ chuyển khoản: khung QR (ngân hàng, số TK, số tiền còn thiếu, nội dung + nút Chép), "Đang chờ tiền về…", hỏi lại server mỗi 3 giây, nút "Khách trả tiền mặt" (thu ngân/chủ quán); tiền về → thông báo "Đã nhận đủ tiền"; hết phiên → dừng hỏi, báo "Đăng nhập lại" | UC03, UC07 |
| `/payments` | cashier, admin | Menu "Chuyển khoản": mục "Đơn chờ chuyển khoản" (link mở lại QR, đã nhận / tổng) khi có; bảng giao dịch SePay (thời gian, ±số tiền, nội dung, link đơn, nhãn kết quả có biểu tượng), tự làm mới 10 giây; chủ quán thấy thêm khung "Kết nối SePay" (trạng thái cấu hình + URL webhook để chép + cách điền form SePay, cấu trúc mã thanh toán tiền tố CF) | UC07 |
| `/barista` | barista, admin | 3 cột Chờ pha / Đang pha / Xong — chờ giao, tự làm mới 5 giây, không hiện giá | UC05 |
| `/account` | đã đăng nhập | Thông tin tài khoản + đổi mật khẩu (kiểm tra phía client, lỗi theo từng ô, báo thu hồi phiên thiết bị khác); mở bằng tên người dùng trên thanh menu | UC01 |
| `/dashboard` | admin | Menu "Doanh thu": chọn nhanh Hôm nay / 7 ngày / 30 ngày / Tháng này / Tháng trước + ô Từ ngày – Đến ngày; 4 ô số liệu (doanh thu, số đơn, trung bình mỗi đơn, số ly / món) kèm ▲ Tăng / ▼ Giảm / = Không đổi so với kỳ trước; biểu đồ cột doanh thu theo ngày (khi > 1 ngày) và theo giờ (tooltip khi rê chuột / Tab); thanh ngang theo nguồn đơn, phương thức thanh toán, danh mục, top 10 món (nhãn + số + tỉ lệ ghi thẳng); mỗi biểu đồ có "Xem bảng số liệu"; khoảng không có đơn → lời nhắc | UC08 |
| `/quality` | admin | Báo cáo kiểm thử: ô tổng quan, khung **★ Vừa thay đổi** (test trong file đã sửa trên nhánh hiện tại so với `main`, nhãn ★ Mới / ✎ Vừa sửa, viền trái `primary` + nền `secondary`, lên đầu danh sách; hạng mục có huy hiệu "N vừa thay đổi", lọc "★ Vừa thay đổi"), 15 hạng mục (mở xem từng test, lọc Không đạt / Chưa làm), coverage có vạch ngưỡng, load test, smoke, lần chạy CI trên GitHub, lỗi phát hiện, khuyến nghị; chưa có báo cáo → hướng dẫn `npm run test:report` | — |
| `/products` | admin | Bảng món (giá S/M, giá L tự tính, người sửa cuối), lọc, ẩn/mở bán; hộp thoại thêm/sửa có "Xem thử tính tiền" | UC06 |

## 5. Thuật ngữ thống nhất

| Dùng | Không dùng |
|---|---|
| Đơn hàng | Order |
| Món | Item |
| Pha chế / Quầy pha | Barista (trên giao diện) |
| Thanh toán | Checkout |
| Tại quầy / GrabFood / ShopeeFood | Counter |
| Tiền mặt / Chuyển khoản · Đã thanh toán / Chờ chuyển khoản | Cash / Transfer · Paid / Unpaid |
| Chủ quán | Admin (trên giao diện) |
