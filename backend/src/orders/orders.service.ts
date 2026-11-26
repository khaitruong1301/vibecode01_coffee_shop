import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { config, transferEnabled } from '../config';
import { Prisma } from '../generated/prisma/client';
import type { OrderStatus } from '../generated/prisma/enums';
import { priceOrder, PricingError } from '../pricing/pricing';
import { PAYMENT_LABEL, qrImageUrl, RECEIVED_STATUSES, transferContent } from '../payments/payment-rules';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/order.dto';
import type { OrderDto, OrderListDto, TransferInfoDto } from './dto/order-response.dto';
import { orderCode, parseOrderCode } from './order-code';
import { canTransition, STATUS_LABEL } from './order-status';

const orderInclude = {
  cashier: { select: { id: true, fullName: true } },
  paidBy: { select: { id: true, fullName: true } },
  items: { orderBy: { id: 'asc' } },
  // Tiền khách đã chuyển cho đơn (UC07)
  bankTransactions: { where: { transferType: 'in', status: { in: RECEIVED_STATUSES } }, select: { amount: true } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function transferInfo(o: OrderRow, received: number): TransferInfoDto | null {
  if (o.paymentMethod !== 'transfer' || o.paymentStatus !== 'unpaid' || !transferEnabled()) return null;
  const { bank, accountNo, accountName } = config.sepay;
  const amount = Math.max(o.total - received, 0);
  const content = transferContent(o.id);
  return { bank, accountNo, accountName: accountName || null, amount, content, qrUrl: qrImageUrl(bank, accountNo, amount, content) };
}

export function toOrderDto(o: OrderRow): OrderDto {
  const received = o.bankTransactions.reduce((sum, t) => sum + t.amount, 0);
  return {
    id: o.id,
    code: orderCode(o.id),
    source: o.source,
    partnerCode: o.partnerCode,
    note: o.note,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    total: o.total,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    paymentLabel: PAYMENT_LABEL[o.paymentStatus],
    paidAt: o.paidAt,
    paidBy: o.paidBy,
    amountReceived: received,
    transfer: transferInfo(o, received),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    cashier: o.cashier,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      size: i.size,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      note: i.note,
    })),
  };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** UC02/UC04 — tạo đơn: giá lấy từ DB, tổng do server tính, lưu orders + order_items trong một lần ghi. */
  async create(dto: CreateOrderDto, user: AuthUser) {
    const ids = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, price: true, hasSize: true },
    });

    let priced: ReturnType<typeof priceOrder>;
    try {
      priced = priceOrder(dto.items, products);
    } catch (e) {
      if (e instanceof PricingError) throw new BadRequestException({ error: e.message });
      throw e;
    }

    const source = dto.source ?? 'counter';
    const paymentMethod = dto.paymentMethod ?? 'cash';
    if (paymentMethod === 'transfer') {
      if (source !== 'counter') throw new BadRequestException({ error: 'Chuyển khoản chỉ dùng cho đơn tại quầy' });
      if (!transferEnabled()) throw new BadRequestException({ error: 'Chưa cấu hình tài khoản nhận chuyển khoản' });
    }
    // Nested create của Prisma chạy trong một transaction: hoặc lưu cả đơn + món, hoặc không lưu gì.
    const order = await this.prisma.order.create({
      data: {
        cashierId: user.id,
        source,
        partnerCode: source === 'counter' ? null : dto.partnerCode,
        note: dto.note || null,
        total: priced.total,
        // Tiền mặt: đã thu ngay. Chuyển khoản: chờ SePay báo tiền về (BR06).
        paymentMethod,
        paymentStatus: paymentMethod === 'cash' ? 'paid' : 'unpaid',
        paidAt: paymentMethod === 'cash' ? new Date() : null,
        paidById: paymentMethod === 'cash' ? user.id : null,
        items: { create: priced.lines.map((l, i) => ({ ...l, note: dto.items[i].note || null })) },
      },
      include: orderInclude,
    });
    return toOrderDto(order);
  }

  /**
   * Quầy pha (mặc định): chỉ đơn đã thanh toán (BR06), thanh toán trước pha trước — đơn chuyển khoản trả muộn không chen lên đầu.
   * `payment = 'unpaid'` (UC07): đơn đang chờ chuyển khoản, mới nhất trước — để thu ngân mở lại QR / thu tiền mặt.
   */
  async list(statuses: OrderStatus[] | undefined, limit = 100, payment: 'paid' | 'unpaid' = 'paid'): Promise<OrderListDto> {
    const rows =
      payment === 'unpaid'
        ? await this.prisma.order.findMany({
            where: { paymentStatus: 'unpaid' },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: orderInclude,
          })
        : await this.prisma.order.findMany({
            where: { paymentStatus: 'paid', status: { in: statuses?.length ? statuses : ['pending', 'preparing', 'ready'] } },
            orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], // cao điểm 7h–9h: đơn trả tiền trước lên trước
            take: limit,
            include: orderInclude,
          });
    return { items: rows.map(toOrderDto) };
  }

  /** UC03 — đọc lại đơn đã lưu theo mã CP-… để in hóa đơn. */
  async findByCode(code: string) {
    const id = parseOrderCode(code);
    const order = id ? await this.prisma.order.findUnique({ where: { id }, include: orderInclude }) : null;
    if (!order) throw new NotFoundException({ error: 'Không tìm thấy đơn hàng' });
    return toOrderDto(order);
  }

  /** UC05 — chuyển trạng thái pha chế, chỉ đi tới bước kế tiếp. */
  async updateStatus(id: number, to: OrderStatus) {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { status: true, paymentStatus: true } });
    if (!current) throw new NotFoundException({ error: 'Không tìm thấy đơn hàng' });
    if (current.paymentStatus !== 'paid') throw new ConflictException({ error: 'Đơn chưa thanh toán, chưa được pha' });
    if (!canTransition(current.status, to)) {
      throw new ConflictException({
        error: `Không thể chuyển đơn từ "${STATUS_LABEL[current.status]}" sang "${STATUS_LABEL[to]}"`,
      });
    }
    // Cập nhật có điều kiện: hai pha chế bấm cùng lúc thì chỉ một người thành công.
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: current.status, paymentStatus: 'paid' },
      data: { status: to },
    });
    if (count === 0) throw new ConflictException({ error: 'Đơn vừa được người khác cập nhật, vui lòng tải lại' });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    return toOrderDto(order);
  }

  /** UC07 — khách không chuyển khoản mà trả tiền mặt: thu ngân xác nhận, đơn sang đã thanh toán và hiện ở quầy pha. */
  async payCash(id: number, user: AuthUser) {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { paymentStatus: true } });
    if (!current) throw new NotFoundException({ error: 'Không tìm thấy đơn hàng' });
    // Cập nhật có điều kiện: tiền chuyển khoản về cùng lúc thì chỉ một bên thắng.
    const { count } = await this.prisma.order.updateMany({
      where: { id, paymentStatus: 'unpaid' },
      // Tiền đã chuyển khoản (nếu có) vẫn giữ ở bank_transactions → amountReceived = phần chuyển khoản, còn lại là tiền mặt.
      data: { paymentMethod: 'cash', paymentStatus: 'paid', paidAt: new Date(), paidById: user.id },
    });
    if (count === 0) throw new ConflictException({ error: 'Đơn đã được thanh toán' });
    this.logger.log(`${orderCode(id)}: ${user.username} xác nhận khách trả tiền mặt thay chuyển khoản`);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    return toOrderDto(order);
  }
}
