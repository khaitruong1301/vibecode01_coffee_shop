'use client';

// Biểu đồ cho dashboard doanh thu (UC08) — vẽ bằng HTML/CSS + màu theme, không thêm thư viện.
// Mỗi biểu đồ một chuỗi số liệu (một màu `primary`); số liệu luôn có bảng đi kèm cho trình đọc màn hình.
import { useState, type ReactNode } from 'react';

/** Làm tròn lên mốc đẹp (1 / 1,5 / 2 / … / 8 × 10ⁿ, nửa mốc vẫn là số tròn) để trục y dễ đọc mà không thừa nhiều khoảng trống. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= max) ?? 10;
  return Math.round(step * pow);
}

export interface Column {
  key: string;
  /** Nhãn dưới trục x. */
  label: string;
  value: number;
  /** Dòng tiêu đề + các dòng phụ trong tooltip. */
  title: string;
  lines: string[];
}

/** Biểu đồ cột theo thời gian, có lưới mờ, trục y 3 mốc, tooltip khi rê chuột / focus bằng bàn phím. */
export function ColumnChart({
  columns,
  formatAxis,
  label,
  maxLabels = 12,
}: {
  columns: Column[];
  formatAxis: (n: number) => string;
  /** Tên biểu đồ cho trình đọc màn hình. */
  label: string;
  maxLabels?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(...columns.map((c) => c.value), 0));
  const ticks = [top, top / 2, 0];
  const every = Math.max(1, Math.ceil(columns.length / maxLabels));
  const n = columns.length;
  const act = active !== null ? columns[active] : null;

  return (
    <div className="flex gap-2" onMouseLeave={() => setActive(null)}>
      <div aria-hidden className="tabular flex h-52 w-12 shrink-0 flex-col justify-between text-right text-xs text-muted">
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
            {formatAxis(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-52">
          {ticks.map((t, i) => (
            <div key={t} aria-hidden className={`absolute inset-x-0 border-t ${i === 2 ? 'border-muted/50' : 'border-dashed border-border'}`} style={{ top: `${(i / 2) * 100}%` }} />
          ))}
          <ul aria-label={label} className="absolute inset-0 flex items-end gap-0.5">
            {columns.map((c, i) => (
              <li
                key={c.key}
                tabIndex={0}
                aria-label={`${c.title}: ${c.lines.join(', ')}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end rounded-t focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div
                  className={`w-full rounded-t-sm transition-colors ${active === i ? 'bg-primary-hover' : 'bg-primary'}`}
                  style={{ height: `${(c.value / top) * 100}%` }}
                />
              </li>
            ))}
          </ul>
          {act && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 mb-2 w-max max-w-48 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
              style={{
                bottom: `${(act.value / top) * 100}%`,
                left: `${((active + 0.5) / n) * 100}%`,
                transform: `translateX(${active < n * 0.2 ? '-10%' : active > n * 0.8 ? '-90%' : '-50%'})`,
              }}
            >
              <p className="font-semibold">{act.title}</p>
              {act.lines.map((l) => (
                <p key={l} className="tabular text-muted">
                  {l}
                </p>
              ))}
            </div>
          )}
        </div>
        <div aria-hidden className="mt-1 flex gap-0.5 text-xs text-muted">
          {columns.map((c, i) => (
            <span key={c.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
              {i % every === 0 ? c.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Số hiển thị bên phải thanh (đã định dạng). */
  valueText: string;
  /** Dòng phụ dưới nhãn, vd. "12 đơn · 35%". */
  sub?: string;
}

/** Thanh ngang so sánh độ lớn — nhãn và số ghi thẳng trên từng dòng, không cần chú giải. */
export function BarList({ bars, label }: { bars: Bar[]; label: string }) {
  const max = Math.max(...bars.map((b) => b.value), 0) || 1;
  return (
    <ul aria-label={label} className="space-y-3">
      {bars.map((b) => (
        <li key={b.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{b.label}</span>
            <span className="tabular shrink-0 font-semibold">{b.valueText}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${(b.value / max) * 100}%` }} />
          </div>
          {b.sub && <p className="tabular mt-0.5 text-xs text-muted">{b.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Khung một biểu đồ: tiêu đề, mô tả ngắn, biểu đồ, bảng số liệu thu gọn. */
export function ChartCard({
  id,
  title,
  hint,
  children,
  table,
  className = '',
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
  table?: { head: string[]; rows: (string | number)[][] };
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-border bg-surface p-4 ${className}`}>
      <h2 id={id} className="font-bold">
        {title}
      </h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
      {table && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">Xem bảng số liệu</summary>
          <div
            role="region"
            aria-label={`Bảng số liệu: ${title}`}
            tabIndex={0}
            className="mt-2 max-h-72 overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  {table.head.map((h, i) => (
                    <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 0 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={String(r[0])} className="border-b border-border last:border-0">
                    {r.map((cell, i) => (
                      <td key={i} className={`tabular py-1.5 pr-3 ${i > 0 ? 'text-right' : ''}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
