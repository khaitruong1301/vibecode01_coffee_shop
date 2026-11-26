import { findOrderId, parseSepayDate, qrImageUrl, reconcile, transferContent, type OrderPaymentState } from './payment-rules';

describe('transferContent', () => {
  it('đệm 6 chữ số, không dấu gạch', () => {
    expect(transferContent(123)).toBe('CF000123');
    expect(transferContent(1234567)).toBe('CF1234567');
  });
});

describe('findOrderId — mã đơn trong nội dung chuyển khoản', () => {
  it.each([
    ['CF000123', 123],
    ['cf-000123', 123],
    ['cp000123', 123], // tiền tố cũ CP — đơn tạo trước khi đổi sang CF
    ['CP-000123', 123],
    ['CF 000123', 123],
    ['MBVCB.3278907687.CF000045.CT tu 0123 NGUYEN VAN A', 45],
    ['NGUYEN VAN A chuyen tien CF000007 FT25330', 7],
    ['CF1234567', 1234567],
    ['CF2147483647', 2147483647],
  ])('"%s" → %d', (text, id) => {
    expect(findOrderId(text)).toBe(id);
  });

  it.each([
    ['chuyen tien mua cafe'],
    ['CF12345'], // thiếu chữ số
    ['XCF000123'], // dính chữ phía trước
    ['CF000000'], // id 0
    ['CF3278907687'], // vượt int4 — không thể là đơn thật
    [''],
  ])('"%s" → null', (text) => {
    expect(findOrderId(text)).toBeNull();
  });

  it('ưu tiên field đầu tiên có mã (code SePay rồi tới content)', () => {
    expect(findOrderId(null, 'abc CF000009')).toBe(9);
    expect(findOrderId('CF000001', 'CF000009')).toBe(1);
    expect(findOrderId(undefined, null)).toBeNull();
  });
});

describe('parseSepayDate — giờ Việt Nam → UTC', () => {
  it('đổi đúng múi giờ +07:00', () => {
    expect(parseSepayDate('2026-11-26 14:02:37')?.toISOString()).toBe('2026-11-26T07:02:37.000Z');
    expect(parseSepayDate('2026-11-26T00:30:00')?.toISOString()).toBe('2026-11-25T17:30:00.000Z');
  });

  it('sai định dạng → null', () => {
    expect(parseSepayDate('26/11/2026 14:02')).toBeNull();
    expect(parseSepayDate('2026-13-45 99:99:99')).toBeNull();
  });
});

describe('reconcile — đối soát giao dịch với đơn (BR06)', () => {
  const unpaid: OrderPaymentState = { total: 45000, paymentMethod: 'transfer', paymentStatus: 'unpaid', received: 0 };

  it('tiền ra → outgoing, không có đơn → unmatched', () => {
    expect(reconcile('out', 45000, unpaid)).toBe('outgoing');
    expect(reconcile('in', 45000, null)).toBe('unmatched');
  });

  it('đủ hoặc thừa tiền → matched', () => {
    expect(reconcile('in', 45000, unpaid)).toBe('matched');
    expect(reconcile('in', 50000, unpaid)).toBe('matched');
  });

  it('thiếu tiền → partial; chuyển thêm cho đủ → matched', () => {
    expect(reconcile('in', 20000, unpaid)).toBe('partial');
    expect(reconcile('in', 25000, { ...unpaid, received: 20000 })).toBe('matched');
  });

  it('đơn đã thanh toán (chuyển trùng, hoặc đơn tiền mặt) → already_paid', () => {
    expect(reconcile('in', 45000, { ...unpaid, paymentStatus: 'paid' })).toBe('already_paid');
    expect(reconcile('in', 45000, { ...unpaid, paymentMethod: 'cash', paymentStatus: 'paid' })).toBe('already_paid');
  });
});

describe('qrImageUrl', () => {
  it('dựng link QR SePay có số tiền + nội dung', () => {
    const url = new URL(qrImageUrl('MBBank', '0123456789', 45000, 'CF000001'));
    expect(url.origin + url.pathname).toBe('https://qr.sepay.vn/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      acc: '0123456789',
      bank: 'MBBank',
      amount: '45000',
      des: 'CF000001',
      template: 'compact',
    });
  });
});
