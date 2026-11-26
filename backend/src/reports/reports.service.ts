import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { OrderSource, PaymentMethod } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { RevenueQuery } from './dto/revenue-query.dto';
import type { RevenueReportDto, RevenueTotalsDto } from './dto/revenue-report.dto';
import { ReportRangeError, resolveRange } from './report-range';

/** Giờ Việt Nam của `paid_at` — cộng thẳng 7 giờ (khớp `report-range.ts`), không phụ thuộc dữ liệu múi giờ của Postgres. */
const VN_PAID_AT = Prisma.sql`((o.paid_at AT TIME ZONE 'UTC') + interval '7 hours')`;
const TOP_PRODUCTS = 10;

/** SUM/COUNT trong SQL thô trả bigint → number (doanh thu VNĐ còn xa giới hạn số nguyên an toàn). */
const num = (v: bigint | number | null) => Number(v ?? 0);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UC08 — doanh thu theo khoảng ngày. Chỉ tính đơn **đã thanh toán**, xếp theo thời điểm thanh toán (`paid_at`):
   * đơn chuyển khoản chưa nhận đủ tiền chưa phải doanh thu (BR06).
   */
  async revenue(q: RevenueQuery): Promise<RevenueReportDto> {
    let range;
    try {
      range = resolveRange(q.from, q.to);
    } catch (e) {
      if (e instanceof ReportRangeError) throw new BadRequestException({ error: e.message });
      throw e;
    }
    const { start, end } = range;
    const paid = { paymentStatus: 'paid', paidAt: { gte: start, lt: end } } satisfies Prisma.OrderWhereInput;
    const rawFilter = Prisma.sql`o.payment_status = 'paid' AND o.paid_at >= ${start} AND o.paid_at < ${end}`;

    const [current, previous, days, hours, sources, methods, categories, products] = await Promise.all([
      this.totals(start, end),
      this.totals(range.previous.start, range.previous.end),
      this.prisma.$queryRaw<{ day: string; orders: number; revenue: bigint }[]>`
        SELECT to_char(${VN_PAID_AT}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders, SUM(o.total)::bigint AS revenue
        FROM orders o WHERE ${rawFilter} GROUP BY 1`,
      this.prisma.$queryRaw<{ hour: number; orders: number; revenue: bigint }[]>`
        SELECT EXTRACT(HOUR FROM ${VN_PAID_AT})::int AS hour, COUNT(*)::int AS orders, SUM(o.total)::bigint AS revenue
        FROM orders o WHERE ${rawFilter} GROUP BY 1`,
      this.prisma.order.groupBy({ by: ['source'], where: paid, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['paymentMethod'], where: paid, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ category: string; revenue: bigint; quantity: bigint }[]>`
        SELECT c.name AS category, SUM(oi.line_total)::bigint AS revenue, SUM(oi.quantity)::bigint AS quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE ${rawFilter}
        GROUP BY c.id, c.name
        ORDER BY revenue DESC, c.name`,
      this.prisma.$queryRaw<{ productId: number; name: string; revenue: bigint; quantity: bigint }[]>`
        SELECT p.id AS "productId", p.name AS name, SUM(oi.line_total)::bigint AS revenue, SUM(oi.quantity)::bigint AS quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE ${rawFilter}
        GROUP BY p.id, p.name
        ORDER BY revenue DESC, quantity DESC, p.name
        LIMIT ${TOP_PRODUCTS}`,
    ]);

    const dayMap = new Map(days.map((d) => [d.day, d]));
    const hourMap = new Map(hours.map((h) => [h.hour, h]));
    const sourceMap = new Map(sources.map((s) => [s.source, s]));
    const methodMap = new Map(methods.map((m) => [m.paymentMethod, m]));

    return {
      from: range.from,
      to: range.to,
      summary: { ...current, previous },
      byDay: range.days.map((date) => ({ date, revenue: num(dayMap.get(date)?.revenue ?? 0), orders: dayMap.get(date)?.orders ?? 0 })),
      byHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        revenue: num(hourMap.get(hour)?.revenue ?? 0),
        orders: hourMap.get(hour)?.orders ?? 0,
      })),
      bySource: Object.values(OrderSource).map((source) => ({
        source,
        revenue: sourceMap.get(source)?._sum.total ?? 0,
        orders: sourceMap.get(source)?._count._all ?? 0,
      })),
      byPaymentMethod: Object.values(PaymentMethod).map((paymentMethod) => ({
        paymentMethod,
        revenue: methodMap.get(paymentMethod)?._sum.total ?? 0,
        orders: methodMap.get(paymentMethod)?._count._all ?? 0,
      })),
      byCategory: categories.map((c) => ({ category: c.category, revenue: num(c.revenue), quantity: num(c.quantity) })),
      topProducts: products.map((p) => ({ productId: p.productId, name: p.name, revenue: num(p.revenue), quantity: num(p.quantity) })),
    };
  }

  private async totals(start: Date, end: Date): Promise<RevenueTotalsDto> {
    const where = { paymentStatus: 'paid', paidAt: { gte: start, lt: end } } satisfies Prisma.OrderWhereInput;
    const [orders, items] = await Promise.all([
      this.prisma.order.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.orderItem.aggregate({ where: { order: where }, _sum: { quantity: true } }),
    ]);
    const revenue = orders._sum.total ?? 0;
    const count = orders._count._all;
    return { revenue, orders: count, itemsSold: items._sum.quantity ?? 0, avgOrderValue: count ? Math.round(revenue / count) : 0 };
  }
}
