import { MAX_RANGE_DAYS, ReportRangeError, resolveRange, vnDate, vnStartOfDay } from './report-range';

describe('vnDate / vnStartOfDay — ngày theo giờ Việt Nam', () => {
  it('17:00 UTC đã sang ngày hôm sau ở Việt Nam', () => {
    expect(vnDate(new Date('2026-11-26T16:59:59Z'))).toBe('2026-11-26');
    expect(vnDate(new Date('2026-11-26T17:00:00Z'))).toBe('2026-11-27');
  });

  it('00:00 giờ Việt Nam = 17:00 UTC ngày hôm trước', () => {
    expect(vnStartOfDay('2026-11-26')?.toISOString()).toBe('2026-11-25T17:00:00.000Z');
  });

  it.each(['2026-02-30', '2026-13-01', '26-11-2026', ''])('"%s" không phải ngày có thật → null', (d) => {
    expect(vnStartOfDay(d)).toBeNull();
  });
});

describe('resolveRange — khoảng báo cáo', () => {
  const now = new Date('2026-11-26T03:00:00Z'); // 10:00 sáng 26/11 giờ Việt Nam

  it('mặc định 7 ngày gần nhất, tính cả hôm nay', () => {
    const r = resolveRange(undefined, undefined, now);
    expect(r).toMatchObject({ from: '2026-11-20', to: '2026-11-26' });
    expect(r.days).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(r.start.toISOString()).toBe('2026-11-19T17:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-26T17:00:00.000Z');
  });

  it('kỳ trước cùng độ dài, liền trước kỳ đang xem', () => {
    const r = resolveRange('2026-11-20', '2026-11-26', now);
    expect(r.previous).toMatchObject({ from: '2026-11-13', to: '2026-11-19' });
    expect(r.previous.end).toEqual(r.start);
    expect(r.previous.start.toISOString()).toBe('2026-11-12T17:00:00.000Z');
  });

  it('một ngày: from = to', () => {
    const r = resolveRange('2026-11-26', '2026-11-26', now);
    expect(r.days).toEqual(['2026-11-26']);
    expect(r.previous).toMatchObject({ from: '2026-11-25', to: '2026-11-25' });
  });

  it('chỉ có from hoặc chỉ có to → lấy 7 ngày từ / tới ngày đó', () => {
    expect(resolveRange('2026-11-01', undefined, now)).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
    expect(resolveRange(undefined, '2026-11-07', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
  });

  it('qua tháng, qua năm nhuận', () => {
    expect(resolveRange('2028-02-27', '2028-03-01', now).days).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it.each([
    ['2026-11-27', '2026-11-20', 'trước hoặc bằng'],
    ['2026-02-30', '2026-03-01', 'không có thật'],
    ['2026-02-01', '2026-02-30', 'Ngày kết thúc'],
    ['2025-01-01', '2026-11-26', `tối đa ${MAX_RANGE_DAYS} ngày`],
  ])('%s → %s: lỗi "%s"', (from, to, msg) => {
    expect(() => resolveRange(from, to, now)).toThrow(ReportRangeError);
    expect(() => resolveRange(from, to, now)).toThrow(msg);
  });

  it(`đúng ${MAX_RANGE_DAYS} ngày vẫn hợp lệ`, () => {
    expect(resolveRange('2025-11-26', '2026-11-26', now).days).toHaveLength(MAX_RANGE_DAYS);
  });
});
