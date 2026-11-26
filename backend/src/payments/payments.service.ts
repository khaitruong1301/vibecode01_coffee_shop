import { Injectable, Logger } from '@nestjs/common';
import { config, transferEnabled } from '../config';
import { Prisma } from '../generated/prisma/client';
import type { BankTxStatus } from '../generated/prisma/enums';
import { orderCode } from '../orders/order-code';
import { PrismaService } from '../prisma/prisma.service';
import type { BankTransactionDto, BankTransactionListDto, PaymentSettingsDto } from './dto/payment-response.dto';
import type { SepayWebhookDto } from './dto/sepay-webhook.dto';
import { BANK_TX_LABEL, findOrderId, parseSepayDate, RECEIVED_STATUSES, reconcile } from './payment-rules';

export const SEPAY_WEBHOOK_PATH = '/api/payments/sepay/webhook';

type TxRow = Prisma.BankTransactionGetPayload<{ select: typeof txSelect }>;
const txSelect = {
  id: true,
  sepayId: true,
  gateway: true,
  accountNumber: true,
  transferType: true,
  amount: true,
  content: true,
  referenceCode: true,
  transactionDate: true,
  createdAt: true,
  status: true,
  orderId: true,
} satisfies Prisma.BankTransactionSelect;

function toTxDto(t: TxRow): BankTransactionDto {
  return {
    id: t.id,
    sepayId: t.sepayId,
    gateway: t.gateway,
    accountNumber: t.accountNumber,
    transferType: t.transferType,
    amount: t.amount,
    content: t.content,
    referenceCode: t.referenceCode,
    transactionDate: t.transactionDate,
    createdAt: t.createdAt,
    status: t.status,
    statusLabel: BANK_TX_LABEL[t.status],
    orderCode: t.orderId ? orderCode(t.orderId) : null,
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * UC07 — SePay báo có giao dịch. Idempotent: SePay gửi lại cùng `id` thì bỏ qua.
   * Đối soát + cập nhật đơn trong một transaction, khoá dòng đơn để hai giao dịch về cùng lúc không cộng sai.
   */
  async handleSepay(dto: SepayWebhookDto): Promise<BankTransactionDto> {
    const existing = await this.prisma.bankTransaction.findUnique({ where: { sepayId: dto.id }, select: txSelect });
    if (existing) return toTxDto(existing);

    // Chỉ tiền vào đúng tài khoản đã cấu hình mới được gắn đơn (SePay có thể gửi giao dịch của tài khoản khác / tài khoản phụ).
    const ownAccount = !config.sepay.accountNo || dto.accountNumber.trim() === config.sepay.accountNo.trim();
    const orderId = dto.transferType === 'in' && ownAccount ? findOrderId(dto.code, dto.content) : null;
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        let status: BankTxStatus;
        let linkedOrderId: number | null = null;
        if (orderId) {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
          const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { total: true, paymentMethod: true, paymentStatus: true },
          });
          const agg = order
            ? await tx.bankTransaction.aggregate({
                where: { orderId, transferType: 'in', status: { in: RECEIVED_STATUSES } },
                _sum: { amount: true },
              })
            : null;
          status = reconcile(dto.transferType, dto.transferAmount, order && { ...order, received: agg?._sum.amount ?? 0 });
          if (order && status !== 'unmatched') linkedOrderId = orderId;
          if (status === 'matched') {
            await tx.order.updateMany({
              where: { id: orderId, paymentStatus: 'unpaid' },
              data: { paymentStatus: 'paid', paidAt: new Date() },
            });
          }
        } else {
          status = reconcile(dto.transferType, dto.transferAmount, null);
        }
        return tx.bankTransaction.create({
          data: {
            sepayId: dto.id,
            gateway: dto.gateway,
            accountNumber: dto.accountNumber,
            transferType: dto.transferType,
            amount: dto.transferAmount,
            content: dto.content ?? '',
            referenceCode: dto.referenceCode ?? null,
            transactionDate: parseSepayDate(dto.transactionDate) ?? new Date(),
            orderId: linkedOrderId,
            status,
          },
          select: txSelect,
        });
      });
      this.logger.log(`SePay #${dto.id} ${dto.transferType} ${dto.transferAmount}đ → ${row.status}${row.orderId ? ` (${orderCode(row.orderId)})` : ''}`);
      return toTxDto(row);
    } catch (e) {
      // SePay gửi lại đúng lúc lần trước đang ghi → trùng sepay_id: coi như đã xử lý.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return toTxDto(await this.prisma.bankTransaction.findUniqueOrThrow({ where: { sepayId: dto.id }, select: txSelect }));
      }
      throw e;
    }
  }

  async list(limit = 100): Promise<BankTransactionListDto> {
    const rows = await this.prisma.bankTransaction.findMany({ orderBy: { id: 'desc' }, take: limit, select: txSelect });
    return { items: rows.map(toTxDto) };
  }

  settings(): PaymentSettingsDto {
    const { bank, accountNo, accountName, webhookKey } = config.sepay;
    return {
      transferEnabled: transferEnabled(),
      bank: bank || null,
      accountNo: accountNo || null,
      accountName: accountName || null,
      webhookKeyConfigured: !!webhookKey,
      webhookPath: SEPAY_WEBHOOK_PATH,
    };
  }
}
