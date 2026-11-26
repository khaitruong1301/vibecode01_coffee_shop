import { IsOptional, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class RevenueQuery {
  /**
   * Ngày bắt đầu (giờ Việt Nam, tính cả ngày này). Bỏ trống → 7 ngày gần nhất
   * @example "2026-11-20"
   */
  @IsOptional()
  @Matches(DATE, { message: 'Ngày bắt đầu phải có dạng YYYY-MM-DD' })
  from?: string;

  /**
   * Ngày kết thúc (giờ Việt Nam, tính cả ngày này). Bỏ trống → hôm nay
   * @example "2026-11-26"
   */
  @IsOptional()
  @Matches(DATE, { message: 'Ngày kết thúc phải có dạng YYYY-MM-DD' })
  to?: string;
}
