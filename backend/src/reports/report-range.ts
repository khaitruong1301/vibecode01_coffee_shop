// Khoảng ngày của báo cáo doanh thu (UC08) — hàm thuần, có unit test.
// Ngày tính theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè); DB lưu UTC.

/** Mặc định: 7 ngày gần nhất, tính cả hôm nay. */
export const DEFAULT_RANGE_DAYS = 7;
/** Khoảng tối đa một lần xem. */
export const MAX_RANGE_DAYS = 366;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class ReportRangeError extends Error {}

/** "YYYY-MM-DD" theo giờ Việt Nam của một thời điểm. */
export function vnDate(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 giờ Việt Nam của ngày "YYYY-MM-DD" → thời điểm UTC. Ngày không có thật (30/02) → null. */
export function vnStartOfDay(date: string): Date | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(utc).toISOString().slice(0, 10) !== date) return null;
  return new Date(utc - VN_OFFSET_MS);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface ReportRange {
  /** Ngày đầu, ngày cuối (tính cả hai), giờ Việt Nam. */
  from: string;
  to: string;
  /** [start, end) theo UTC — lọc `paid_at >= start AND paid_at < end`. */
  start: Date;
  end: Date;
  /** Mọi ngày trong khoảng, để điền 0 cho ngày không bán được. */
  days: string[];
  /** Kỳ trước cùng độ dài, ngay trước `from` — để so sánh. */
  previous: { from: string; to: string; start: Date; end: Date };
}

/**
 * Dựng khoảng báo cáo từ `from` / `to` (tuỳ chọn). Thiếu cả hai → 7 ngày gần nhất;
 * thiếu một đầu → lấy 7 ngày tính từ / tới đầu còn lại.
 */
export function resolveRange(from: string | undefined, to: string | undefined, now: Date = new Date()): ReportRange {
  const span = DEFAULT_RANGE_DAYS - 1;
  const toDate = to ?? (from ? addDays(from, span) : vnDate(now));
  const fromDate = from ?? addDays(toDate, -span);

  const start = vnStartOfDay(fromDate);
  const lastDay = vnStartOfDay(toDate);
  if (!start) throw new ReportRangeError(`Ngày bắt đầu "${fromDate}" không có thật`);
  if (!lastDay) throw new ReportRangeError(`Ngày kết thúc "${toDate}" không có thật`);
  if (lastDay < start) throw new ReportRangeError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');

  const count = Math.round((lastDay.getTime() - start.getTime()) / DAY_MS) + 1;
  if (count > MAX_RANGE_DAYS) throw new ReportRangeError(`Chỉ xem được tối đa ${MAX_RANGE_DAYS} ngày một lần`);

  const end = new Date(lastDay.getTime() + DAY_MS);
  const prevFrom = addDays(fromDate, -count);
  const prevTo = addDays(fromDate, -1);
  return {
    from: fromDate,
    to: toDate,
    start,
    end,
    days: Array.from({ length: count }, (_, i) => addDays(fromDate, i)),
    previous: { from: prevFrom, to: prevTo, start: new Date(start.getTime() - count * DAY_MS), end: start },
  };
}
