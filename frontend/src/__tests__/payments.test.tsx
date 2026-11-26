import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentsPage from '@/app/(app)/payments/page';
import ReceiptPage from '@/app/(app)/receipt/[code]/page';
import type { BankTransaction, Order, PaymentSettings, Role } from '@/lib/types';

let role: Role = 'cashier';
vi.mock('next/navigation', () => ({ useParams: () => ({ code: 'CP-000007' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/AuthProvider', () => ({
  useRequireRole: () => true,
  useAuth: () => ({ user: { id: 1, username: 'u', fullName: 'Thu Ngân', role }, logout: vi.fn() }),
}));

const unpaid: Order = {
  id: 7,
  code: 'CP-000007',
  source: 'counter',
  partnerCode: null,
  note: null,
  status: 'pending',
  statusLabel: 'Chờ pha',
  total: 45000,
  paymentMethod: 'transfer',
  paymentStatus: 'unpaid',
  paymentLabel: 'Chờ chuyển khoản',
  paidAt: null,
  paidBy: null,
  amountReceived: 0,
  transfer: {
    bank: 'MBBank',
    accountNo: '0123456789',
    accountName: 'QUAN CA PHE',
    amount: 45000,
    content: 'CP000007',
    qrUrl: 'https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=45000&des=CP000007&template=compact',
  },
  createdAt: '2026-11-26T07:00:00Z',
  cashier: { id: 1, fullName: 'Thu Ngân' },
  items: [{ id: 1, productId: 2, productName: 'Cà phê sữa đá', size: 'L', unitPrice: 45000, quantity: 1, lineTotal: 45000, note: null }],
};
const paid: Order = { ...unpaid, paymentStatus: 'paid', paymentLabel: 'Đã thanh toán', paidAt: '2026-11-26T07:01:00Z', amountReceived: 45000, transfer: null };

const SETTINGS: PaymentSettings = {
  transferEnabled: true,
  bank: 'MBBank',
  accountNo: '0123456789',
  accountName: 'QUAN CA PHE',
  webhookKeyConfigured: false,
  webhookPath: '/api/payments/sepay/webhook',
};

const TXS: BankTransaction[] = [
  {
    id: 2, sepayId: 92705, gateway: 'MBBank', accountNumber: '0123456789', transferType: 'in', amount: 45000,
    content: 'NGUYEN VAN A CP000007', referenceCode: null, transactionDate: '2026-11-26T07:01:00Z', createdAt: '2026-11-26T07:01:02Z',
    status: 'matched', statusLabel: 'Đã khớp đơn', orderCode: 'CP-000007',
  },
  {
    id: 1, sepayId: 92704, gateway: 'MBBank', accountNumber: '0123456789', transferType: 'out', amount: 10000,
    content: '', referenceCode: null, transactionDate: '2026-11-26T06:00:00Z', createdAt: '2026-11-26T06:00:02Z',
    status: 'outgoing', statusLabel: 'Tiền ra', orderCode: null,
  },
];

type Route = (init?: RequestInit) => { status: number; body?: unknown };
let routes: Record<string, Route>;
const calls: string[] = [];

beforeEach(() => {
  role = 'cashier';
  calls.length = 0;
  routes = {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const r = routes[url]?.(init) ?? { status: 404, body: { error: 'Không tìm thấy' } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Hóa đơn chuyển khoản (UC07)', () => {
  it('đơn chờ chuyển khoản → hiện QR, số tài khoản, số tiền, nội dung; tự cập nhật khi tiền về', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = unpaid;
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: current });
    render(<ReceiptPage />);

    const panel = await screen.findByRole('region', { name: 'Thanh toán chuyển khoản' });
    expect(within(panel).getByRole('img', { name: /Mã QR chuyển khoản 45\.000đ/ })).toHaveAttribute('src', unpaid.transfer?.qrUrl);
    expect(within(panel).getByText('0123456789')).toBeInTheDocument();
    expect(within(panel).getByText('CP000007')).toBeInTheDocument();
    expect(screen.getByText('Chờ chuyển khoản')).toBeInTheDocument();

    current = paid;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText(/Đã nhận đủ tiền/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Thanh toán chuyển khoản' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
  });

  it('chuyển thiếu → hiện số đã nhận và số còn thiếu', async () => {
    routes['/api/orders/CP-000007'] = () => ({
      status: 200,
      body: { ...unpaid, amountReceived: 20000, transfer: { ...unpaid.transfer, amount: 25000 } },
    });
    render(<ReceiptPage />);
    expect(await screen.findByText(/Đã nhận 20\.000đ \/ 45\.000đ — còn thiếu 25\.000đ/)).toBeInTheDocument();
  });

  it('khách trả tiền mặt → xác nhận, gọi pay-cash, đơn thành đã thanh toán', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: unpaid });
    routes['/api/orders/7/pay-cash'] = () => ({ status: 200, body: { ...paid, paymentMethod: 'cash' } });
    render(<ReceiptPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Khách trả tiền mặt/ }));
    expect(calls).toContain('POST /api/orders/7/pay-cash');
    expect(await screen.findByText(/Đã nhận đủ tiền/)).toBeInTheDocument();
  });

  it('pay-cash bị từ chối (409) → hiện lỗi, giữ khung QR', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: unpaid });
    routes['/api/orders/7/pay-cash'] = () => ({ status: 409, body: { error: 'Đơn đã được thanh toán' } });
    render(<ReceiptPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Khách trả tiền mặt/ }));
    expect(await screen.findByText(/Đơn đã được thanh toán/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Thanh toán chuyển khoản' })).toBeInTheDocument();
  });

  it('huỷ hộp xác nhận → không gọi API; pha chế không thấy nút thu tiền mặt', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: unpaid });
    const { unmount } = render(<ReceiptPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Khách trả tiền mặt/ }));
    expect(calls).not.toContain('POST /api/orders/7/pay-cash');
    unmount();

    role = 'barista';
    render(<ReceiptPage />);
    await screen.findByRole('region', { name: 'Thanh toán chuyển khoản' });
    expect(screen.queryByRole('button', { name: /Khách trả tiền mặt/ })).not.toBeInTheDocument();
  });

  it('hết phiên khi đang chờ tiền về → dừng hỏi server, báo đăng nhập lại', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let expired = false;
    routes['/api/orders/CP-000007'] = () => (expired ? { status: 401, body: { error: 'Vui lòng đăng nhập' } } : { status: 200, body: unpaid });
    render(<ReceiptPage />);
    await screen.findByRole('region', { name: 'Thanh toán chuyển khoản' });
    expired = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText(/Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/login?next=/receipt/CP-000007');
    const before = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(calls.length).toBe(before);
  });

  it('server chưa cấu hình tài khoản (transfer null) → nhắc thu tiền mặt', async () => {
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: { ...unpaid, transfer: null } });
    render(<ReceiptPage />);
    expect(await screen.findByText(/Chưa cấu hình tài khoản nhận chuyển khoản/)).toBeInTheDocument();
  });

  it('chép nội dung chuyển khoản', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: unpaid });
    render(<ReceiptPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chép' }));
    expect(writeText).toHaveBeenCalledWith('CP000007');
    expect(screen.getByRole('button', { name: 'Đã chép' })).toBeInTheDocument();
  });

  it('đơn tiền mặt → không có khung QR', async () => {
    routes['/api/orders/CP-000007'] = () => ({ status: 200, body: { ...paid, paymentMethod: 'cash' } });
    render(<ReceiptPage />);
    expect(await screen.findByText('Tiền mặt', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Thanh toán chuyển khoản' })).not.toBeInTheDocument();
  });

  it('không tìm thấy đơn → báo lỗi', async () => {
    render(<ReceiptPage />);
    expect(await screen.findByText(/Không tìm thấy/)).toBeInTheDocument();
  });
});

describe('Trang Chuyển khoản (UC07)', () => {
  beforeEach(() => {
    routes['/api/payments/transactions?limit=100'] = () => ({ status: 200, body: { items: TXS } });
    routes['/api/payments/settings'] = () => ({ status: 200, body: SETTINGS });
    routes['/api/orders?payment=unpaid&limit=50'] = () => ({ status: 200, body: { items: [] } });
  });

  it('có đơn chờ chuyển khoản → liệt kê với link mở lại QR và số tiền đã nhận', async () => {
    routes['/api/orders?payment=unpaid&limit=50'] = () => ({ status: 200, body: { items: [{ ...unpaid, amountReceived: 20000 }] } });
    render(<PaymentsPage />);
    const section = await screen.findByRole('region', { name: /Đơn chờ chuyển khoản/ });
    expect(within(section).getByRole('link', { name: 'CP-000007' })).toHaveAttribute('href', '/receipt/CP-000007');
    expect(within(section).getByText(/đã nhận 20\.000đ/)).toBeInTheDocument();
  });

  it('thu ngân: thấy danh sách giao dịch, nhãn kết quả, link đơn; không thấy hướng dẫn webhook', async () => {
    render(<PaymentsPage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Đã khớp đơn')).toBeInTheDocument();
    expect(within(table).getByText('Tiền ra')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'CP-000007' })).toHaveAttribute('href', '/receipt/CP-000007');
    expect(within(table).getByText('+45.000đ')).toBeInTheDocument();
    expect(within(table).getByText('−10.000đ')).toBeInTheDocument();
    expect(within(table).getByText('(trống)')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kết nối SePay' })).not.toBeInTheDocument();
  });

  it('chủ quán: thấy URL webhook để dán vào SePay + trạng thái cấu hình', async () => {
    role = 'admin';
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<PaymentsPage />);
    expect(await screen.findByRole('heading', { name: 'Kết nối SePay' })).toBeInTheDocument();
    const url = `${window.location.origin}/api/payments/sepay/webhook`;
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(screen.getByText(/Đã có:/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chép URL' }));
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('chủ quán, chưa cấu hình gì → nhắc đặt biến môi trường', async () => {
    role = 'admin';
    routes['/api/payments/settings'] = () => ({
      status: 200,
      body: { ...SETTINGS, transferEnabled: false, bank: null, accountNo: null, accountName: null },
    });
    render(<PaymentsPage />);
    expect(await screen.findByText('SEPAY_BANK')).toBeInTheDocument();
    expect(screen.getAllByText('SEPAY_WEBHOOK_KEY', { selector: 'code' }).length).toBeGreaterThan(1);
  });

  it('chưa có giao dịch → trạng thái rỗng', async () => {
    routes['/api/payments/transactions?limit=100'] = () => ({ status: 200, body: { items: [] } });
    render(<PaymentsPage />);
    expect(await screen.findByText(/Chưa có giao dịch nào/)).toBeInTheDocument();
  });

  it('lỗi tải → hiện lỗi; Làm mới tải lại thành công', async () => {
    let fail = true;
    routes['/api/payments/transactions?limit=100'] = () => (fail ? { status: 500, body: { error: 'Lỗi hệ thống' } } : { status: 200, body: { items: TXS } });
    render(<PaymentsPage />);
    expect(await screen.findByText(/Lỗi hệ thống/)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/Lỗi hệ thống/)).not.toBeInTheDocument();
  });
});
