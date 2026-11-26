'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRequireRole } from '@/components/AuthProvider';
import { Alert, Button, Chip, Field, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { addDays, formatDay, formatVnd, formatVndCompact, PAYMENT_METHOD_LABEL, SOURCE_LABEL, todayVn } from '@/lib/format';
import type { RevenueReport, RevenueTotals } from '@/lib/types';
import { BarList, ChartCard, ColumnChart, type Bar } from './charts';

type Range = { from: string; to: string };

/** Các khoảng chọn nhanh, tính theo ngày giờ Việt Nam. */
function presets(today: string): { id: string; label: string; range: Range }[] {
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  return [
    { id: 'today', label: 'Hôm nay', range: { from: today, to: today } },
    { id: '7d', label: '7 ngày', range: { from: addDays(today, -6), to: today } },
    { id: '30d', label: '30 ngày', range: { from: addDays(today, -29), to: today } },
    { id: 'month', label: 'Tháng này', range: { from: monthStart, to: today } },
    { id: 'prev-month', label: 'Tháng trước', range: { from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd } },
  ];
}

const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : '0%');

/** So với kỳ trước: biểu tượng + chữ (không chỉ dựa vào màu). */
function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <p className="text-xs text-muted">{current === 0 ? 'Kỳ trước cũng chưa có' : 'Kỳ trước chưa có số liệu'}</p>;
  const change = (current - previous) / previous;
  const text = `${Math.abs(change * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  if (Math.abs(change) < 0.0005) return <p className="text-xs text-muted">= Không đổi so với kỳ trước</p>;
  return change > 0 ? (
    <p className="text-xs font-semibold text-success">▲ Tăng {text} so với kỳ trước</p>
  ) : (
    <p className="text-xs font-semibold text-danger">▼ Giảm {text} so với kỳ trước</p>
  );
}

function Kpi({ label, value, current, previous }: { label: string; value: string; current: number; previous: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 break-words text-lg font-bold sm:text-2xl">{value}</p>
      <Delta current={current} previous={previous} />
    </div>
  );
}

const KPIS: { key: keyof RevenueTotals; label: string; format: (n: number) => string }[] = [
  { key: 'revenue', label: 'Doanh thu', format: formatVnd },
  { key: 'orders', label: 'Số đơn', format: (n) => n.toLocaleString('vi-VN') },
  { key: 'avgOrderValue', label: 'Trung bình mỗi đơn', format: formatVnd },
  { key: 'itemsSold', label: 'Số ly / món đã bán', format: (n) => n.toLocaleString('vi-VN') },
];

/** UC08 — dashboard doanh thu của chủ quán. */
export default function DashboardPage() {
  const allowed = useRequireRole(['admin']);
  const [today] = useState(() => todayVn());
  const [range, setRange] = useState<Range>(() => ({ from: addDays(today, -6), to: today }));
  const [result, setResult] = useState<{ key: string; report?: RevenueReport; error?: string } | null>(null);
  const [reloads, setReloads] = useState(0);

  const key = `${range.from}|${range.to}|${reloads}`;
  const loading = result?.key !== key;
  const report = result?.report;

  const load = useCallback((r: Range, k: string) => {
    api<RevenueReport>(`/reports/revenue?from=${r.from}&to=${r.to}`)
      .then((data) => setResult({ key: k, report: data }))
      .catch((e: unknown) =>
        setResult({ key: k, error: e instanceof ApiError ? e.message : 'Không tải được báo cáo doanh thu' }),
      );
  }, []);

  useEffect(() => {
    if (allowed) load(range, key);
  }, [allowed, range, key, load]);

  if (!allowed) return null;

  const options = presets(today);
  const activePreset = options.find((p) => p.range.from === range.from && p.range.to === range.to)?.id;
  const s = report?.summary;
  const multiDay = report ? report.byDay.length > 1 : false;

  // Giờ: bỏ bớt các giờ đêm không bán, nhưng luôn giữ 6h–22h.
  const hours = report?.byHour ?? [];
  const sold = hours.filter((h) => h.orders > 0).map((h) => h.hour);
  const hourFrom = Math.min(6, ...sold);
  const hourTo = Math.max(22, ...sold);
  const hourRows = hours.filter((h) => h.hour >= hourFrom && h.hour <= hourTo);

  const totalRevenue = s?.revenue ?? 0;
  const shareBars = <T extends { revenue: number; orders: number }>(rows: T[], keyOf: (r: T) => string, labelOf: (r: T) => string): Bar[] =>
    rows.map((r) => ({
      key: keyOf(r),
      label: labelOf(r),
      value: r.revenue,
      valueText: formatVnd(r.revenue),
      sub: `${r.orders.toLocaleString('vi-VN')} đơn · ${pct(r.revenue, totalRevenue)} doanh thu`,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Doanh thu</h1>
          <p className="text-sm text-muted">
            {range.from === range.to
              ? formatDay(range.from, { withYear: true, withWeekday: true })
              : `${formatDay(range.from, { withYear: true })} – ${formatDay(range.to, { withYear: true })}`}{' '}
            · chỉ tính đơn đã thanh toán
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setReloads((n) => n + 1)} disabled={loading}>
          ↻ Làm mới
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div role="group" aria-label="Chọn nhanh khoảng ngày" className="flex flex-wrap gap-2">
          {options.map((p) => (
            <Chip key={p.id} active={activePreset === p.id} onClick={() => setRange(p.range)} className="min-h-11">
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label="Từ ngày">
            <Input
              type="date"
              value={range.from}
              max={today}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-40"
            />
          </Field>
          <Field label="Đến ngày">
            <Input
              type="date"
              value={range.to}
              max={today}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-40"
            />
          </Field>
        </div>
      </div>

      {result?.error && !loading && (
        <Alert>
          ⚠ {result.error}{' '}
          <button type="button" className="font-semibold underline" onClick={() => setReloads((n) => n + 1)}>
            Thử lại
          </button>
        </Alert>
      )}

      {loading && !report && <Spinner label="Đang tải doanh thu…" />}

      {report && s && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KPIS.map((k) => (
              <Kpi key={k.key} label={k.label} value={k.format(s[k.key])} current={s[k.key]} previous={s.previous[k.key]} />
            ))}
          </div>
          <p className="text-xs text-muted">
            Kỳ trước: {formatDay(addDays(report.from, -report.byDay.length), { withYear: true })} –{' '}
            {formatDay(addDays(report.from, -1), { withYear: true })} · doanh thu {formatVnd(s.previous.revenue)}
          </p>

          {s.orders === 0 ? (
            <Alert kind="info">Chưa có đơn đã thanh toán trong khoảng này. Chọn khoảng ngày khác để xem biểu đồ.</Alert>
          ) : (
            <>
              {multiDay && (
                <ChartCard
                  id="by-day"
                  title="Doanh thu theo ngày"
                  hint="Rê chuột hoặc dùng phím Tab lên từng cột để xem chi tiết"
                  table={{
                    head: ['Ngày', 'Doanh thu', 'Số đơn'],
                    rows: report.byDay.map((d) => [formatDay(d.date, { withWeekday: true }), formatVnd(d.revenue), d.orders]),
                  }}
                >
                  <ColumnChart
                    label="Doanh thu theo ngày"
                    formatAxis={formatVndCompact}
                    columns={report.byDay.map((d) => ({
                      key: d.date,
                      label: formatDay(d.date),
                      value: d.revenue,
                      title: formatDay(d.date, { withYear: true, withWeekday: true }),
                      lines: [formatVnd(d.revenue), `${d.orders.toLocaleString('vi-VN')} đơn`],
                    }))}
                  />
                </ChartCard>
              )}

              <ChartCard
                id="by-hour"
                title="Doanh thu theo giờ trong ngày"
                hint={multiDay ? 'Cộng dồn cả khoảng ngày — thấy giờ cao điểm để xếp ca' : 'Thấy giờ cao điểm để xếp ca'}
                table={{
                  head: ['Giờ', 'Doanh thu', 'Số đơn'],
                  rows: hourRows.map((h) => [`${h.hour}h–${h.hour + 1}h`, formatVnd(h.revenue), h.orders]),
                }}
              >
                <ColumnChart
                  label="Doanh thu theo giờ"
                  formatAxis={formatVndCompact}
                  columns={hourRows.map((h) => ({
                    key: String(h.hour),
                    label: `${h.hour}h`,
                    value: h.revenue,
                    title: `${h.hour}h – ${h.hour + 1}h`,
                    lines: [formatVnd(h.revenue), `${h.orders.toLocaleString('vi-VN')} đơn`],
                  }))}
                />
              </ChartCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard id="by-source" title="Theo nguồn đơn">
                  <BarList label="Doanh thu theo nguồn đơn" bars={shareBars(report.bySource, (r) => r.source, (r) => SOURCE_LABEL[r.source])} />
                </ChartCard>
                <ChartCard id="by-method" title="Theo phương thức thanh toán">
                  <BarList
                    label="Doanh thu theo phương thức thanh toán"
                    bars={shareBars(report.byPaymentMethod, (r) => r.paymentMethod, (r) => PAYMENT_METHOD_LABEL[r.paymentMethod])}
                  />
                </ChartCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard id="by-category" title="Theo danh mục">
                  <BarList
                    label="Doanh thu theo danh mục"
                    bars={report.byCategory.map((c) => ({
                      key: c.category,
                      label: c.category,
                      value: c.revenue,
                      valueText: formatVnd(c.revenue),
                      sub: `${c.quantity.toLocaleString('vi-VN')} ly / món · ${pct(c.revenue, totalRevenue)} doanh thu`,
                    }))}
                  />
                </ChartCard>
                <ChartCard id="top-products" title="Top 10 món bán chạy" hint="Xếp theo doanh thu">
                  <BarList
                    label="Top 10 món theo doanh thu"
                    bars={report.topProducts.map((p, i) => ({
                      key: String(p.productId),
                      label: `${i + 1}. ${p.name}`,
                      value: p.revenue,
                      valueText: formatVnd(p.revenue),
                      sub: `${p.quantity.toLocaleString('vi-VN')} ly / món`,
                    }))}
                  />
                </ChartCard>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
