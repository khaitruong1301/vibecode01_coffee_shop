import { ApiProperty } from '@nestjs/swagger';
import { BankTxStatus } from '../../generated/prisma/enums';

export class BankTransactionDto {
  /** @example 1 */
  id: number;
  /**
   * ID giao dịch trên SePay
   * @example 92704
   */
  sepayId: number;
  /** @example "MBBank" */
  gateway: string;
  /** @example "0123456789" */
  accountNumber: string;
  @ApiProperty({ enum: ['in', 'out'], example: 'in' })
  transferType: string;
  /** @example 45000 */
  amount: number;
  /** @example "NGUYEN VAN A chuyen tien CP000001" */
  content: string;
  /** @example "MBVCB.3278907687" */
  referenceCode: string | null;
  /** Thời điểm giao dịch phía ngân hàng (UTC) */
  transactionDate: Date;
  /** Thời điểm CoffeePOS nhận webhook */
  createdAt: Date;
  @ApiProperty({ enum: BankTxStatus, example: 'matched' })
  status: BankTxStatus;
  /** @example "Đã khớp đơn" */
  statusLabel: string;
  /**
   * Mã đơn được gắn (null nếu không khớp)
   * @example "CP-000001"
   */
  orderCode: string | null;
}

export class BankTransactionListDto {
  items: BankTransactionDto[];
}

export class PaymentSettingsDto {
  /** Đã cấu hình đủ ngân hàng + số tài khoản → thu ngân chọn được "Chuyển khoản" */
  transferEnabled: boolean;
  /** @example "MBBank" */
  bank: string | null;
  /** @example "0123456789" */
  accountNo: string | null;
  /** @example "QUAN CA PHE ABC" */
  accountName: string | null;
  /** Đã đặt SEPAY_WEBHOOK_KEY (webhook chỉ nhận request có API key đúng) */
  webhookKeyConfigured: boolean;
  /**
   * Đường dẫn webhook — ghép với địa chỉ web để dán vào SePay
   * @example "/api/payments/sepay/webhook"
   */
  webhookPath: string;
}
