import { ApiProperty } from '@nestjs/swagger';
import { OrderSource, OrderStatus, PaymentMethod, PaymentStatus, Size } from '../../generated/prisma/enums';
import { UserRefDto } from '../../products/dto/product-response.dto';

export class OrderItemResponseDto {
  /** @example 1 */
  id: number;
  /** @example 2 */
  productId: number;
  /**
   * Tên món lúc bán (chụp lại, đổi tên sau không ảnh hưởng)
   * @example "Cà phê sữa đá"
   */
  productName: string;
  @ApiProperty({ enum: Size, nullable: true, example: 'L', description: 'null với món không có size' })
  size: Size | null;
  /**
   * Đơn giá lúc bán, đã gồm phụ thu size (VNĐ)
   * @example 35000
   */
  unitPrice: number;
  /** @example 2 */
  quantity: number;
  /** @example 70000 */
  lineTotal: number;
  /** @example "Ít đường" */
  note: string | null;
}

/** Thông tin để khách quét QR chuyển khoản — chỉ có khi đơn chuyển khoản chưa thanh toán (UC07). */
export class TransferInfoDto {
  /** @example "MBBank" */
  bank: string;
  /** @example "0123456789" */
  accountNo: string;
  /** @example "QUAN CA PHE ABC" */
  accountName: string | null;
  /**
   * Số tiền còn phải chuyển (VNĐ)
   * @example 45000
   */
  amount: number;
  /**
   * Nội dung chuyển khoản bắt buộc — server dò mã này trong giao dịch SePay gửi về
   * @example "CP000001"
   */
  content: string;
  /** Ảnh mã VietQR (qr.sepay.vn) đã điền sẵn số tiền + nội dung */
  qrUrl: string;
}

export class OrderDto {
  /** @example 1 */
  id: number;
  /**
   * Mã in trên hóa đơn
   * @example "CP-000001"
   */
  code: string;
  @ApiProperty({ enum: OrderSource, example: 'counter' })
  source: OrderSource;
  /** Mã đơn GrabFood / ShopeeFood */
  partnerCode: string | null;
  /** @example "Ít đá" */
  note: string | null;
  @ApiProperty({ enum: OrderStatus, example: 'pending' })
  status: OrderStatus;
  /** @example "Chờ pha" */
  statusLabel: string;
  /**
   * Tổng tiền do server tính từ giá trong DB (BR01)
   * @example 98000
   */
  total: number;
  @ApiProperty({ enum: PaymentMethod, example: 'cash' })
  paymentMethod: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus, example: 'paid', description: 'unpaid: đơn chuyển khoản chưa nhận đủ tiền, chưa hiện ở quầy pha (BR06)' })
  paymentStatus: PaymentStatus;
  /** @example "Đã thanh toán" */
  paymentLabel: string;
  /** Thời điểm nhận đủ tiền */
  paidAt: Date | null;
  /** Nhân viên xác nhận thu tiền mặt; null khi SePay báo tiền về hoặc chưa thanh toán */
  @ApiProperty({ type: UserRefDto, nullable: true })
  paidBy: UserRefDto | null;
  /**
   * Tổng tiền chuyển khoản đã nhận cho đơn (VNĐ)
   * @example 0
   */
  amountReceived: number;
  @ApiProperty({ type: TransferInfoDto, nullable: true })
  transfer: TransferInfoDto | null;
  createdAt: Date;
  updatedAt: Date;
  cashier: UserRefDto;
  items: OrderItemResponseDto[];
}

export class OrderListDto {
  items: OrderDto[];
}
