// Hiển thị tiền / ngày giờ thống nhất. Server lưu UTC; giao diện luôn hiển thị giờ Việt Nam.
const TZ = 'Asia/Ho_Chi_Minh';

export function formatVnd(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export const SOURCE_LABEL = { counter: 'Tại quầy', grabfood: 'GrabFood', shopeefood: 'ShopeeFood' } as const;
export const ROLE_LABEL = { cashier: 'Thu ngân', barista: 'Pha chế', admin: 'Chủ quán' } as const;
export const PAYMENT_METHOD_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' } as const;

/** Tiền rút gọn cho trục biểu đồ: 1.250.000 → "1,25tr" · 350.000 → "350k". */
export function formatVndCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString('vi-VN');
}

/** Hôm nay theo giờ Việt Nam, dạng "YYYY-MM-DD". */
export function todayVn(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

/** Cộng ngày cho chuỗi "YYYY-MM-DD" (không phụ thuộc múi giờ máy). */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "2026-11-26" → "26/11" (thêm năm khi `withYear`), kèm thứ khi `withWeekday`: "T5 26/11". */
export function formatDay(date: string, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const [y, m, d] = date.split('-');
  const day = `${d}/${m}${opts.withYear ? `/${y}` : ''}`;
  return opts.withWeekday ? `${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${day}` : day;
}
