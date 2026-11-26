'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth, useRequireRole } from '@/components/AuthProvider';
import { Alert, Button, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatVnd } from '@/lib/format';
import type { BankTransaction, BankTxStatus, Order, PaymentSettings } from '@/lib/types';

/** Tự làm mới danh sách giao dịch. */
const REFRESH_MS = 10_000;

/** Trạng thái đối soát luôn có biểu tượng + chữ — không dựa vào màu. */
const TX_BADGE: Record<BankTxStatus, { icon: string; cls: string }> = {
  matched: { icon: '✓', cls: 'bg-success text-white' },
  partial: { icon: '◐', cls: 'bg-secondary text-foreground' },
  already_paid: { icon: '!', cls: 'bg-danger text-white' },
  unmatched: { icon: '?', cls: 'bg-secondary text-foreground' },
  outgoing: { icon: '↑', cls: 'bg-secondary text-foreground' },
};

function TxBadge({ tx }: { tx: BankTransaction }) {
  const b = TX_BADGE[tx.status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>
      <span aria-hidden>{b.icon}</span>
      {tx.statusLabel}
    </span>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={ok ? 'text-success' : 'text-danger'}>
        {ok ? '✓' : '✕'}
      </span>
      <span>
        <span className="sr-only">{ok ? 'Đã có: ' : 'Chưa có: '}</span>
        {children}
      </span>
    </li>
  );
}

/** Chủ quán: hướng dẫn điền form "Thêm Webhook" trên SePay. */
function WebhookSetup({ settings }: { settings: PaymentSettings }) {
  const url = `${window.location.origin}${settings.webhookPath}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* trình duyệt chặn clipboard → chép tay */
    }
  }

  return (
    <section aria-labelledby="sepay-setup" className="rounded-xl border border-border bg-surface p-4">
      <h2 id="sepay-setup" className="text-lg font-bold">
        Kết nối SePay
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        <Check ok={settings.transferEnabled}>
          Tài khoản nhận tiền
          {settings.transferEnabled ? (
            <>
              : <b>{settings.bank}</b> · <span className="tabular">{settings.accountNo}</span>
              {settings.accountName && ` · ${settings.accountName}`}
            </>
          ) : (
            <> — đặt <code>SEPAY_BANK</code>, <code>SEPAY_ACCOUNT_NO</code>, <code>SEPAY_ACCOUNT_NAME</code> trên server</>
          )}
        </Check>
        <Check ok={settings.webhookKeyConfigured}>
          API key webhook{settings.webhookKeyConfigured ? ' đã đặt' : <> — đặt <code>SEPAY_WEBHOOK_KEY</code> (≥ 24 ký tự) trên server</>}
        </Check>
      </ul>

      <h3 className="mt-4 font-semibold">Điền form “Thêm Webhook” trên SePay</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
        <li>
          <b>Cơ bản</b> — Tên: <i>CoffeePOS</i> · URL nhận webhook:
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-secondary px-2 py-1">{url}</code>
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? 'Đã chép' : 'Chép URL'}
            </Button>
          </div>
          <span className="mt-1 block">
            Loại giao dịch: <b>Tiền vào</b> · Định dạng: <b>JSON</b> · Bật <b>Tự động gửi lại khi server trả lỗi</b>.
          </span>
        </li>
        <li>
          <b>Tài khoản</b> — chọn tài khoản ngân hàng {settings.accountNo ? <span className="tabular">{settings.accountNo}</span> : 'nhận tiền'}.
        </li>
        <li>
          <b>Bảo mật</b> — kiểu <b>API Key</b>, dán đúng giá trị <code>SEPAY_WEBHOOK_KEY</code> (SePay gửi header{' '}
          <code>Authorization: Apikey …</code>).
        </li>
        <li>
          Khách chuyển khoản với nội dung <code>CP000123</code> (in trên mã QR của từng đơn) — đơn tự chuyển sang “Đã thanh toán”.
        </li>
      </ol>
    </section>
  );
}

/** UC07 — giao dịch chuyển khoản SePay gửi về và kết quả đối soát với đơn. */
export default function PaymentsPage() {
  const allowed = useRequireRole(['cashier', 'admin']);
  const { user } = useAuth();
  const [items, setItems] = useState<BankTransaction[] | null>(null);
  const [pending, setPending] = useState<Order[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        api<{ items: BankTransaction[] }>('/payments/transactions?limit=100'),
        api<{ items: Order[] }>('/orders?payment=unpaid&limit=50'),
      ])
        .then(([tx, unpaid]) => {
          setItems(tx.items);
          setPending(unpaid.items);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không tải được giao dịch')),
    [],
  );

  useEffect(() => {
    if (!allowed) return;
    load();
    api<PaymentSettings>('/payments/settings')
      .then(setSettings)
      .catch(() => setSettings(null));
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [allowed, load]);

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Chuyển khoản</h1>
        <Button variant="secondary" size="sm" onClick={load}>
          ↻ Làm mới
        </Button>
      </div>

      {user.role === 'admin' && settings && <WebhookSetup settings={settings} />}

      {error && <Alert>⚠ {error}</Alert>}

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="rounded-xl border border-border bg-surface p-4">
          <h2 id="pending-title" className="text-lg font-bold">
            Đơn chờ chuyển khoản <span className="text-sm font-normal text-muted">· {pending.length} đơn chưa nhận đủ tiền, chưa sang quầy pha</span>
          </h2>
          <ul className="mt-2 divide-y divide-border">
            {pending.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/receipt/${o.code}`} className="font-semibold underline">
                    {o.code}
                  </Link>{' '}
                  <span className="text-muted">· {formatDateTime(o.createdAt)} · {o.cashier.fullName}</span>
                </span>
                <span className="tabular">
                  {o.amountReceived > 0 && <span className="text-muted">đã nhận {formatVnd(o.amountReceived)} / </span>}
                  <b>{formatVnd(o.total)}</b>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="tx-title" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="tx-title" className="text-lg font-bold">
          Giao dịch SePay gửi về <span className="text-sm font-normal text-muted">· tự làm mới mỗi 10 giây</span>
        </h2>
        {!items ? (
          !error && <Spinner label="Đang tải giao dịch…" />
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-muted">Chưa có giao dịch nào. Khi khách chuyển khoản, SePay sẽ gửi về đây.</p>
        ) : (
          <div role="region" aria-label="Bảng giao dịch" tabIndex={0} className="mt-3 overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-semibold">Thời gian</th>
                  <th className="py-2 pr-3 text-right font-semibold">Số tiền</th>
                  <th className="py-2 pr-3 font-semibold">Nội dung</th>
                  <th className="py-2 pr-3 font-semibold">Đơn</th>
                  <th className="py-2 font-semibold">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id} className="border-b border-border align-top last:border-0">
                    <td className="tabular whitespace-nowrap py-2 pr-3">{formatDateTime(tx.transactionDate)}</td>
                    <td className={`tabular whitespace-nowrap py-2 pr-3 text-right font-semibold ${tx.transferType === 'out' ? 'text-muted' : ''}`}>
                      {tx.transferType === 'out' ? '−' : '+'}
                      {formatVnd(tx.amount)}
                    </td>
                    <td className="max-w-xs break-words py-2 pr-3">
                      {tx.content || <span className="text-muted">(trống)</span>}
                      <span className="block text-xs text-muted">
                        {tx.gateway} · {tx.accountNumber}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {tx.orderCode ? (
                        <Link href={`/receipt/${tx.orderCode}`} className="font-semibold underline">
                          {tx.orderCode}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <TxBadge tx={tx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
