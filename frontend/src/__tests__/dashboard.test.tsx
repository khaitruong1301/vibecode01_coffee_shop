import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { niceMax } from '@/app/(app)/dashboard/charts';
import DashboardPage from '@/app/(app)/dashboard/page';
import { addDays, formatDay, formatVndCompact, todayVn } from '@/lib/format';
import type { RevenueReport } from '@/lib/types';

vi.mock('@/components/AuthProvider', () => ({
  useRequireRole: () => true,
  useAuth: () => ({ user: { id: 1, username: 'chuquan', fullName: 'Chủ quán', role: 'admin' }, logout: vi.fn() }),
}));

const totals = { revenue: 220000, orders: 4, itemsSold: 6, avgOrderValue: 55000 };

function report(over: Partial<RevenueReport> = {}): RevenueReport {
  return {
    from: '2026-11-25',
    to: '2026-11-26',
    summary: { ...totals, previous: { revenue: 200000, orders: 4, itemsSold: 6, avgOrderValue: 50000 } },
    byDay: [
      { date: '2026-11-25', revenue: 100000, orders: 2 },
      { date: '2026-11-26', revenue: 120000, orders: 2 },
    ],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: hour === 7 ? 220000 : 0, orders: hour === 7 ? 4 : 0 })),
    bySource: [
      { source: 'counter', revenue: 165000, orders: 3 },
      { source: 'grabfood', revenue: 55000, orders: 1 },
      { source: 'shopeefood', revenue: 0, orders: 0 },
    ],
    byPaymentMethod: [
      { paymentMethod: 'cash', revenue: 220000, orders: 4 },
      { paymentMethod: 'transfer', revenue: 0, orders: 0 },
    ],
    byCategory: [{ category: 'Cà phê', revenue: 220000, quantity: 6 }],
    topProducts: [{ productId: 2, name: 'Cà phê sữa đá', revenue: 220000, quantity: 6 }],
    ...over,
  };
}

let respond: (url: string) => { status: number; body: unknown };
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ status: 200, body: report() });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    const r = respond(url);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dashboard doanh thu (UC08)', () => {
  it('mặc định 7 ngày gần nhất; hiện KPI kèm so sánh kỳ trước bằng biểu tượng + chữ', async () => {
    render(<DashboardPage />);
    const today = todayVn();
    const kpi = (await screen.findByText('Doanh thu', { selector: 'p' })).parentElement as HTMLElement;
    expect(kpi).toHaveTextContent('220.000đ');
    expect(calls[0]).toBe(`/api/reports/revenue?from=${addDays(today, -6)}&to=${today}`);
    expect(screen.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true');

    expect(within(kpi).getByText('▲ Tăng 10% so với kỳ trước')).toBeInTheDocument(); // doanh thu 200k → 220k
    expect(screen.getAllByText('= Không đổi so với kỳ trước')).toHaveLength(2); // số đơn 4 → 4, số ly 6 → 6
  });

  it('đủ các biểu đồ; thanh ngang ghi nhãn + số + tỉ lệ; có bảng số liệu', async () => {
    render(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Doanh thu theo ngày' });
    for (const title of ['Doanh thu theo ngày', 'Doanh thu theo giờ trong ngày', 'Theo nguồn đơn', 'Theo phương thức thanh toán', 'Theo danh mục', 'Top 10 món bán chạy']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    const source = screen.getByRole('list', { name: 'Doanh thu theo nguồn đơn' });
    expect(within(source).getByText('Tại quầy')).toBeInTheDocument();
    expect(within(source).getByText('3 đơn · 75% doanh thu')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Top 10 món theo doanh thu' })).getByText('1. Cà phê sữa đá')).toBeInTheDocument();

    const days = within(screen.getByRole('list', { name: 'Doanh thu theo ngày' })).getAllByRole('listitem');
    expect(days).toHaveLength(2);
    expect(days[1]).toHaveAccessibleName(`${formatDay('2026-11-26', { withYear: true, withWeekday: true })}: 120.000đ, 2 đơn`);
  });

  it('rê chuột lên cột → tooltip ngày, doanh thu, số đơn', async () => {
    render(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Doanh thu theo ngày' });
    const day = within(screen.getByRole('list', { name: 'Doanh thu theo ngày' })).getAllByRole('listitem')[0];
    await userEvent.hover(day);
    const tip = screen.getByRole('status');
    expect(tip).toHaveTextContent('T4 25/11/2026');
    expect(tip).toHaveTextContent('100.000đ');
    expect(tip).toHaveTextContent('2 đơn');
  });

  it('chọn nhanh "30 ngày" → gọi lại API với khoảng mới', async () => {
    render(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Doanh thu theo ngày' });
    await userEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    const today = todayVn();
    expect(calls.at(-1)).toBe(`/api/reports/revenue?from=${addDays(today, -29)}&to=${today}`);
    expect(screen.getByRole('button', { name: '30 ngày' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('khoảng không có đơn → lời nhắc, không vẽ biểu đồ', async () => {
    const zero = { revenue: 0, orders: 0, itemsSold: 0, avgOrderValue: 0 };
    respond = () => ({ status: 200, body: report({ summary: { ...zero, previous: zero } }) });
    render(<DashboardPage />);
    expect(await screen.findByText(/Chưa có đơn đã thanh toán trong khoảng này/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Doanh thu theo ngày' })).not.toBeInTheDocument();
  });

  it('lỗi từ server → hiện thông báo tiếng Việt + nút Thử lại', async () => {
    respond = () => ({ status: 400, body: { error: 'Chỉ xem được tối đa 366 ngày một lần' } });
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ xem được tối đa 366 ngày một lần');
    respond = () => ({ status: 200, body: report() });
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Doanh thu theo ngày' })).toBeInTheDocument();
  });
});

describe('Trục biểu đồ', () => {
  it.each([
    [0, 1],
    [7, 8],
    [11_464_000, 12_000_000],
    [12_500_000, 15_000_000],
    [31_000_000, 40_000_000],
    [100_000, 100_000],
  ])('niceMax(%d) = %d', (max, nice) => {
    expect(niceMax(max)).toBe(nice);
  });

  it('formatVndCompact rút gọn tiền cho trục', () => {
    expect(formatVndCompact(15_000_000)).toBe('15tr');
    expect(formatVndCompact(7_500_000)).toBe('7,5tr');
    expect(formatVndCompact(350_000)).toBe('350k');
    expect(formatVndCompact(0)).toBe('0');
  });
});
