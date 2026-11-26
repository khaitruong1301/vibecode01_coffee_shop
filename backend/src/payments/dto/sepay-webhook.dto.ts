import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MAX_INT4 = 2_147_483_647;

/** Cắt chuỗi quá dài thay vì từ chối — mất giao dịch còn tệ hơn mất vài ký tự cuối nội dung. */
const clip = (max: number) => ({ value }: { value: unknown }) => (typeof value === 'string' ? value.slice(0, max) : value);

/**
 * Dữ liệu SePay gửi khi có giao dịch (định dạng JSON). Chỉ khai báo field dùng tới —
 * field khác (`accumulated`, `subAccount`, `description`…) bị ValidationPipe whitelist bỏ qua.
 */
export class SepayWebhookDto {
  /**
   * ID giao dịch trên SePay — dùng chống xử lý trùng
   * @example 92704
   */
  @IsInt({ message: 'id giao dịch phải là số nguyên' })
  @Min(1, { message: 'id giao dịch không hợp lệ' })
  @Max(MAX_INT4, { message: 'id giao dịch không hợp lệ' })
  id: number;

  /**
   * Ngân hàng
   * @example "MBBank"
   */
  @Transform(clip(100))
  @IsString({ message: 'gateway phải là chuỗi' })
  gateway: string;

  /**
   * Thời gian giao dịch phía ngân hàng (giờ Việt Nam)
   * @example "2026-11-26 14:02:37"
   */
  @IsString({ message: 'transactionDate phải là chuỗi' })
  @MaxLength(30, { message: 'transactionDate không hợp lệ' })
  transactionDate: string;

  /** @example "0123456789" */
  @Transform(clip(50))
  @IsString({ message: 'accountNumber phải là chuỗi' })
  accountNumber: string;

  /**
   * Mã thanh toán SePay tự nhận diện (nếu đã cấu hình tiền tố) — có thể null
   * @example "CP000001"
   */
  @IsOptional()
  @Transform(clip(100))
  @IsString({ message: 'code phải là chuỗi' })
  code?: string | null;

  /**
   * Nội dung chuyển khoản — server tìm mã đơn CP000123 trong đây (quá 500 ký tự thì cắt bớt khi lưu)
   * @example "NGUYEN VAN A chuyen tien CP000001"
   */
  @IsOptional()
  @Transform(clip(500))
  @IsString({ message: 'content phải là chuỗi' })
  content?: string | null;

  @ApiProperty({ enum: ['in', 'out'], example: 'in', description: 'in = tiền vào, out = tiền ra' })
  @IsIn(['in', 'out'], { message: 'transferType chỉ nhận in hoặc out' })
  transferType: 'in' | 'out';

  /**
   * Số tiền giao dịch (VNĐ)
   * @example 45000
   */
  @IsInt({ message: 'Số tiền phải là số nguyên' })
  @Min(0, { message: 'Số tiền không được âm' })
  @Max(2_000_000_000, { message: 'Số tiền quá lớn' })
  transferAmount: number;

  /** @example "MBVCB.3278907687" */
  @IsOptional()
  @Transform(clip(100))
  @IsString({ message: 'referenceCode phải là chuỗi' })
  referenceCode?: string | null;
}

export class SepayAckDto {
  /** SePay coi webhook thành công khi nhận HTTP 200 + `{"success": true}` */
  success: true;
}
