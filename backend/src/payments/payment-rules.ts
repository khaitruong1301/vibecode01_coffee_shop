// Luật thanh toán chuyển khoản (UC07, BR06) — hàm thuần, không đụng DB, có unit test.
import type { BankTxStatus } from '../generated/prisma/enums';

/** `orders.id` là int4 — mã lớn hơn không thể là đơn thật (và làm câu truy vấn lỗi). */
export const MAX_ORDER_ID = 2_147_483_647;

/** Giao dịch tính vào số tiền khách đã chuyển cho đơn. */
export const RECEIVED_STATUSES: BankTxStatus[] = ['matched', 'partial', 'already_paid'];

/**
 * Tiền tố mã thanh toán — phải trùng "Cấu trúc mã thanh toán" trên SePay
 * (tiền tố `CF`, hậu tố 6–10 ký tự, kiểu "Số nguyên") để SePay nhận diện được field `code`.
 */
export const PAYMENT_CODE_PREFIX = 'CF';

/** Nội dung chuyển khoản in trong mã QR: CF000123 (không dấu gạch — nhiều ngân hàng bỏ ký tự đặc biệt). */
export function transferContent(orderId: number): string {
  return `${PAYMENT_CODE_PREFIX}${String(orderId).padStart(6, '0')}`;
}

/**
 * Tìm mã đơn trong nội dung chuyển khoản. Ngân hàng có thể chèn thêm chữ trước/sau, đổi hoa thường,
 * giữ hoặc bỏ dấu gạch: "MBVCB.123.CF000123.CT tu ..." · "cf-000123" · "CF 000123".
 * Vẫn nhận tiền tố cũ `CP` — đơn tạo trước khi đổi sang `CF` (QR in `CP000123`) vẫn khớp được.
 */
export function findOrderId(...texts: (string | null | undefined)[]): number | null {
  for (const text of texts) {
    if (!text) continue;
    const m = /(?<![A-Z0-9])C[FP][-\s]?(\d{6,10})(?!\d)/i.exec(text);
    if (m) {
      const id = Number(m[1]);
      if (id > 0 && id <= MAX_ORDER_ID) return id;
    }
  }
  return null;
}

/** SePay gửi `transactionDate` dạng "2026-11-26 14:02:37" theo giờ Việt Nam → Date (UTC). Sai định dạng → null. */
export function parseSepayDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface OrderPaymentState {
  total: number;
  paymentMethod: 'cash' | 'transfer';
  paymentStatus: 'paid' | 'unpaid';
  /** Tổng tiền các giao dịch tiền vào đã gắn với đơn trước giao dịch này. */
  received: number;
}

/**
 * Đối soát một giao dịch với đơn (BR06):
 * - tiền ra → `outgoing`; không có đơn (không có mã / đơn không tồn tại / sai tài khoản nhận) → `unmatched`
 * - đơn đã thanh toán (kể cả đơn tiền mặt) → `already_paid` (chuyển trùng / thừa, thu ngân hoàn tiền tay)
 * - đơn chuyển khoản chưa thanh toán: cộng dồn mọi lần chuyển, đủ tổng → `matched` (đơn thành đã thanh toán), chưa đủ → `partial`
 * - nhánh "chưa thanh toán nhưng không phải chuyển khoản" không xảy ra (CHECK `orders_unpaid_only_transfer`), vẫn giữ để an toàn → `unmatched`
 */
export function reconcile(transferType: 'in' | 'out', amount: number, order: OrderPaymentState | null): BankTxStatus {
  if (transferType === 'out') return 'outgoing';
  if (!order) return 'unmatched';
  if (order.paymentStatus === 'paid') return 'already_paid';
  if (order.paymentMethod !== 'transfer') return 'unmatched';
  return order.received + amount >= order.total ? 'matched' : 'partial';
}

export const PAYMENT_LABEL = { paid: 'Đã thanh toán', unpaid: 'Chờ chuyển khoản' } as const;

export const BANK_TX_LABEL: Record<BankTxStatus, string> = {
  matched: 'Đã khớp đơn',
  partial: 'Chưa đủ tiền',
  already_paid: 'Đơn đã thanh toán trước',
  unmatched: 'Không khớp đơn',
  outgoing: 'Tiền ra',
};

/** Ảnh QR VietQR do SePay dựng — app ngân hàng quét sẽ điền sẵn số tiền + nội dung. */
export function qrImageUrl(bank: string, accountNo: string, amount: number, content: string): string {
  const q = new URLSearchParams({ acc: accountNo, bank, amount: String(amount), des: content, template: 'compact' });
  return `https://qr.sepay.vn/img?${q.toString()}`;
}
