'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Button, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatVnd, PAYMENT_METHOD_LABEL, SOURCE_LABEL } from '@/lib/format';
import type { Order } from '@/lib/types';

/** Hỏi lại server mỗi 3 giây khi đơn đang chờ chuyển khoản — SePay báo tiền về thì đơn tự đổi trạng thái. */
const POLL_MS = 3000;

/** UC07 — mã QR + thông tin chuyển khoản, chờ SePay báo tiền về. */
function TransferPanel({ order, onPaidCash }: { order: Order; onPaidCash: (o: Order) => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = order.transfer;
  const canConfirmCash = user.role === 'cashier' || user.role === 'admin';

  async function payCash() {
    // Số tiền còn phải thu do server tính (transfer.amount) — frontend không tự tính tiền.
    const due = t ? formatVnd(t.amount) : 'đủ';
    if (!window.confirm(`Xác nhận đã thu ${due} tiền mặt cho đơn ${order.code}?`)) return;
    setSaving(true);
    setError(null);
    try {
      onPaidCash(await api<Order>(`/orders/${order.id}/pay-cash`, { method: 'POST' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không cập nhật được đơn, vui lòng thử lại');
    } finally {
      setSaving(false);
    }
  }

  async function copyContent() {
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t.content);
      setCopied(true);
    } catch {
      /* trình duyệt chặn clipboard → thu ngân đọc nội dung cho khách */
    }
  }

  return (
    <section aria-label="Thanh toán chuyển khoản" className="w-full max-w-[380px] rounded-xl border-2 border-primary bg-surface p-4 text-center print:hidden">
      <h2 className="font-bold">Quét mã để chuyển khoản</h2>
      {t ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh QR ngoài (qr.sepay.vn), không qua tối ưu ảnh của Next */}
          <img src={t.qrUrl} alt={`Mã QR chuyển khoản ${formatVnd(t.amount)} cho đơn ${order.code}`} width={240} height={240} className="mx-auto mt-3 h-60 w-60 rounded-lg bg-white object-contain" />
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-sm">
            <dt className="text-muted">Ngân hàng:</dt>
            <dd className="text-right font-semibold">{t.bank}</dd>
            <dt className="text-muted">Số tài khoản:</dt>
            <dd className="tabular text-right font-semibold">{t.accountNo}</dd>
            {t.accountName && (
              <>
                <dt className="text-muted">Chủ tài khoản:</dt>
                <dd className="text-right">{t.accountName}</dd>
              </>
            )}
            <dt className="text-muted">Số tiền:</dt>
            <dd className="tabular text-right text-lg font-bold">{formatVnd(t.amount)}</dd>
            <dt className="text-muted">Nội dung:</dt>
            <dd className="text-right">
              <span className="tabular rounded bg-secondary px-2 py-0.5 font-bold">{t.content}</span>{' '}
              <button type="button" onClick={copyContent} className="text-xs underline">
                {copied ? 'Đã chép' : 'Chép'}
              </button>
            </dd>
          </dl>
          {order.amountReceived > 0 && (
            <p className="mt-2 text-sm">
              Đã nhận {formatVnd(order.amountReceived)} / {formatVnd(order.total)} — còn thiếu {formatVnd(t.amount)}
            </p>
          )}
        </>
      ) : (
        <Alert>Chưa cấu hình tài khoản nhận chuyển khoản — thu tiền mặt.</Alert>
      )}
      <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted" role="status" aria-live="polite">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        Đang chờ tiền về… đơn chưa chuyển sang quầy pha
      </p>
      {error && (
        <div className="mt-2 text-left">
          <Alert>⚠ {error}</Alert>
        </div>
      )}
      {canConfirmCash && (
        <Button variant="secondary" className="mt-3 w-full" loading={saving} onClick={payCash}>
          💵 Khách trả tiền mặt
        </Button>
      )}
    </section>
  );
}

/** UC03 — đọc lại đơn đã lưu từ server theo mã CP-…, không dùng dữ liệu giỏ hàng trên trình duyệt. */
export default function ReceiptPage() {
  const { code } = useParams<{ code: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Vừa nhận đủ tiền trong lúc đang xem → hiện thông báo thành công. */
  const [justPaid, setJustPaid] = useState(false);
  /** Hết phiên khi đang chờ tiền về → dừng hỏi server, báo đăng nhập lại. */
  const [sessionExpired, setSessionExpired] = useState(false);

  const load = useCallback(() => api<Order>(`/orders/${encodeURIComponent(code)}`), [code]);

  useEffect(() => {
    load()
      .then(setOrder)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không tải được hóa đơn'));
  }, [load]);

  const waiting = order?.paymentStatus === 'unpaid';
  useEffect(() => {
    if (!waiting || sessionExpired) return;
    const timer = setInterval(() => {
      load()
        .then((o) => {
          setOrder(o);
          if (o.paymentStatus === 'paid') setJustPaid(true);
        })
        .catch((e: unknown) => {
          // 401: hết phiên → dừng hỏi; lỗi khác (mạng chập chờn) → lần sau thử lại
          if (e instanceof ApiError && e.status === 401) setSessionExpired(true);
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, sessionExpired, load]);

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <Alert>⚠ {error}</Alert>
        <Link href="/checkout" className="underline">
          ← Về màn bán hàng
        </Link>
      </div>
    );
  }
  if (!order) return <Spinner label="Đang tải hóa đơn…" />;

  return (
    <div className="flex flex-col items-center gap-4 py-4 md:flex-row md:items-start md:justify-center">
      <article className="tabular w-full max-w-[380px] bg-surface p-6 text-sm shadow-md print:max-w-none print:shadow-none">
        <header className="text-center">
          <p className="text-lg font-bold">CoffeePOS</p>
          <p className="text-xs text-muted">Quán cà phê · Cảm ơn quý khách</p>
          <p className="mt-3 border-t border-dashed border-border pt-3 font-bold">HÓA ĐƠN BÁN HÀNG</p>
        </header>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Mã đơn:</dt>
          <dd className="text-right font-bold">{order.code}</dd>
          <dt className="text-muted">Thời gian:</dt>
          <dd className="text-right">{formatDateTime(order.createdAt)}</dd>
          <dt className="text-muted">Thu ngân:</dt>
          <dd className="text-right">{order.cashier.fullName}</dd>
          <dt className="text-muted">Nguồn:</dt>
          <dd className="text-right">
            {SOURCE_LABEL[order.source]}
            {order.partnerCode && ` · ${order.partnerCode}`}
          </dd>
          <dt className="text-muted">Thanh toán:</dt>
          <dd className="text-right">
            {PAYMENT_METHOD_LABEL[order.paymentMethod]} · <span className={waiting ? 'font-bold text-danger' : ''}>{order.paymentLabel}</span>
          </dd>
        </dl>
        <table className="mt-3 w-full border-t border-dashed border-border">
          <thead>
            <tr className="text-left">
              <th className="py-2 font-semibold">Món</th>
              <th className="py-2 text-right font-semibold">SL</th>
              <th className="py-2 text-right font-semibold">Đ.giá</th>
              <th className="py-2 text-right font-semibold">T.tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="py-1 pr-2">
                  {i.productName}
                  {i.size && ` (${i.size})`}
                  {i.note && <span className="block text-xs text-muted">{i.note}</span>}
                </td>
                <td className="py-1 text-right">{i.quantity}</td>
                <td className="py-1 text-right">{i.unitPrice.toLocaleString('vi-VN')}</td>
                <td className="py-1 text-right">{i.lineTotal.toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.note && <p className="mt-2 text-xs text-muted">Ghi chú: {order.note}</p>}
        <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-border pt-3">
          <span className="font-bold">TỔNG CỘNG</span>
          <span className="text-xl font-bold">{formatVnd(order.total)}</span>
        </div>
        <p className="mt-6 text-center text-xs text-muted">Hẹn gặp lại quý khách!</p>
      </article>

      <div className="flex w-full max-w-[380px] flex-col gap-3 md:w-auto">
      {sessionExpired && (
        <div className="w-full max-w-[380px] print:hidden">
          <Alert>
            Phiên đăng nhập đã hết hạn — không cập nhật được trạng thái tiền về.{' '}
            <Link href={`/login?next=/receipt/${order.code}`} className="font-semibold underline">
              Đăng nhập lại
            </Link>
          </Alert>
        </div>
      )}
      {waiting && (
        <TransferPanel
          order={order}
          onPaidCash={(o) => {
            setOrder(o);
            setJustPaid(true);
          }}
        />
      )}
      {justPaid && !waiting && (
        <div className="w-full max-w-[380px] print:hidden">
          <Alert kind="success">✓ Đã nhận đủ tiền — đơn đã chuyển sang quầy pha.</Alert>
        </div>
      )}
      <div className="flex w-full max-w-[380px] gap-2 md:w-48 md:flex-col print:hidden">
        <Button size="lg" className="flex-1 md:w-full md:flex-none" onClick={() => window.print()}>
          🖨 In hóa đơn
        </Button>
        <Link
          href="/checkout"
          className="inline-flex h-14 flex-1 md:flex-none items-center justify-center rounded-lg border border-border bg-surface font-semibold hover:bg-secondary md:w-full"
        >
          + Đơn mới
        </Link>
      </div>
      </div>
    </div>
  );
}
