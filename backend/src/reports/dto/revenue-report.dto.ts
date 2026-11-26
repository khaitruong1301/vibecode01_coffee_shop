import { ApiProperty } from '@nestjs/swagger';
import { OrderSource, PaymentMethod } from '../../generated/prisma/enums';

export class RevenueTotalsDto {
  /**
   * Doanh thu (VNĐ) — tổng tiền các đơn đã thanh toán
   * @example 4250000
   */
  revenue: number;
  /** @example 98 */
  orders: number;
  /**
   * Số ly / cái đã bán
   * @example 176
   */
  itemsSold: number;
  /**
   * Giá trị trung bình mỗi đơn (VNĐ, làm tròn); 0 khi chưa có đơn
   * @example 43367
   */
  avgOrderValue: number;
}

export class RevenueSummaryDto extends RevenueTotalsDto {
  /** Kỳ trước cùng độ dài, liền trước kỳ đang xem — để so sánh */
  previous: RevenueTotalsDto;
}

export class RevenueByDayDto {
  /** @example "2026-11-26" */
  date: string;
  /** @example 612000 */
  revenue: number;
  /** @example 14 */
  orders: number;
}

export class RevenueByHourDto {
  /**
   * Giờ trong ngày (giờ Việt Nam), 0–23
   * @example 7
   */
  hour: number;
  /** @example 980000 */
  revenue: number;
  /** @example 23 */
  orders: number;
}

export class RevenueBySourceDto {
  @ApiProperty({ enum: OrderSource, example: 'counter' })
  source: OrderSource;
  /** @example 3100000 */
  revenue: number;
  /** @example 72 */
  orders: number;
}

export class RevenueByPaymentMethodDto {
  @ApiProperty({ enum: PaymentMethod, example: 'cash' })
  paymentMethod: PaymentMethod;
  /** @example 2600000 */
  revenue: number;
  /** @example 61 */
  orders: number;
}

export class RevenueByCategoryDto {
  /** @example "Cà phê" */
  category: string;
  /** @example 2100000 */
  revenue: number;
  /** @example 70 */
  quantity: number;
}

export class TopProductDto {
  /** @example 2 */
  productId: number;
  /**
   * Tên món hiện tại
   * @example "Cà phê sữa đá"
   */
  name: string;
  /** @example 1250000 */
  revenue: number;
  /** @example 42 */
  quantity: number;
}

export class RevenueReportDto {
  /** @example "2026-11-20" */
  from: string;
  /** @example "2026-11-26" */
  to: string;
  summary: RevenueSummaryDto;
  /** Mọi ngày trong khoảng, ngày không bán được = 0 */
  byDay: RevenueByDayDto[];
  /** Đủ 24 giờ (0–23), cộng dồn cả khoảng */
  byHour: RevenueByHourDto[];
  /** Đủ 3 nguồn, kể cả nguồn không có đơn */
  bySource: RevenueBySourceDto[];
  /** Đủ 2 phương thức */
  byPaymentMethod: RevenueByPaymentMethodDto[];
  /** Theo danh mục hiện tại của món, doanh thu cao trước */
  byCategory: RevenueByCategoryDto[];
  /** Tối đa 10 món doanh thu cao nhất */
  topProducts: TopProductDto[];
}
