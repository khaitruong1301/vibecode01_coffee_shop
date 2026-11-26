import { createTestContext, type TestContext } from './helpers';

/**
 * UC08 — dashboard doanh thu cho chủ quán. Chỉ đơn đã thanh toán, theo thời điểm thanh toán, giờ Việt Nam.
 * Đơn được dời `paid_at` về tháng 01/2026 để không lẫn với đơn tạo lúc chạy test.
 */
describe('Báo cáo doanh thu (e2e)', () => {
  let t: TestContext;
  const URL = '/api/reports/revenue';

  async function createOrder(body: Record<string, unknown>) {
    const res = await t.api().post('/api/orders').set(t.as('thungan1')).send(body).expect(201);
    return res.body as { id: number; total: number };
  }
  const coffee = (quantity = 1) => ({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity }] });
  const payAt = (id: number, iso: string) => t.prisma.order.update({ where: { id }, data: { paidAt: new Date(iso) } });

  beforeAll(async () => {
    t = await createTestContext();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('Phân quyền', () => {
    it('chưa đăng nhập → 401', async () => {
      await t.api().get(URL).expect(401);
    });

    it.each(['thungan1', 'phache1'])('%s không phải chủ quán → 403', async (u) => {
      await t.api().get(URL).set(t.as(u)).expect(403);
    });
  });

  describe('Khoảng ngày', () => {
    it('mặc định 7 ngày gần nhất: đủ 7 ngày, 24 giờ, 3 nguồn, 2 phương thức', async () => {
      const res = await t.api().get(URL).set(t.as('chuquan')).expect(200);
      expect(res.body.byDay).toHaveLength(7);
      expect(res.body.byDay[6].date).toBe(res.body.to);
      expect(res.body.byHour.map((h: { hour: number }) => h.hour)).toEqual([...Array(24).keys()]);
      expect(res.body.bySource.map((s: { source: string }) => s.source)).toEqual(['counter', 'grabfood', 'shopeefood']);
      expect(res.body.byPaymentMethod.map((m: { paymentMethod: string }) => m.paymentMethod)).toEqual(['cash', 'transfer']);
    });

    it.each([
      ['?from=26-11-2026', 'from', 'YYYY-MM-DD'],
      ['?to=2026/11/26', 'to', 'YYYY-MM-DD'],
    ])('%s sai định dạng → 400 kèm details.%s', async (qs, field, msg) => {
      const res = await t.api().get(URL + qs).set(t.as('chuquan')).expect(400);
      expect(res.body.details[field]).toContain(msg);
    });

    it.each([
      ['?from=2026-11-27&to=2026-11-20', 'trước hoặc bằng'],
      ['?from=2026-02-30&to=2026-03-02', 'không có thật'],
      ['?from=2024-01-01&to=2026-11-26', 'tối đa 366 ngày'],
    ])('%s → 400 "%s"', async (qs, msg) => {
      const res = await t.api().get(URL + qs).set(t.as('chuquan')).expect(400);
      expect(res.body.error).toContain(msg);
    });
  });

  describe('Số liệu', () => {
    let a: { id: number; total: number };
    let b: { id: number; total: number };
    let c: { id: number; total: number };
    let grab: { id: number; total: number };
    let prev: { id: number; total: number };

    beforeAll(async () => {
      a = await createOrder(coffee(2));
      b = await createOrder({ ...coffee(1), paymentMethod: 'transfer' });
      c = await createOrder(coffee(3));
      grab = await createOrder({ ...coffee(1), source: 'grabfood', partnerCode: 'GF-123' });
      prev = await createOrder(coffee(1));
      const unpaid = await createOrder({ ...coffee(5), paymentMethod: 'transfer' }); // chưa nhận tiền → không phải doanh thu

      // b: khách chuyển khoản đủ → đã thanh toán
      await t.prisma.order.update({ where: { id: b.id }, data: { paymentStatus: 'paid', paidAt: new Date() } });
      await payAt(a.id, '2026-01-10T00:30:00Z'); // 07:30 ngày 10/01 giờ Việt Nam
      await payAt(b.id, '2026-01-10T16:59:00Z'); // 23:59 ngày 10/01
      await payAt(c.id, '2026-01-10T17:00:00Z'); // 00:00 ngày 11/01
      await payAt(grab.id, '2026-01-11T05:15:00Z'); // 12:15 ngày 11/01
      await payAt(prev.id, '2026-01-09T03:00:00Z'); // kỳ trước
      await t.prisma.order.update({ where: { id: unpaid.id }, data: { createdAt: new Date('2026-01-10T02:00:00Z') } });
    });

    it('tổng quan chỉ tính đơn đã thanh toán, kèm kỳ trước cùng độ dài', async () => {
      const { body } = await t.api().get(`${URL}?from=2026-01-10&to=2026-01-11`).set(t.as('chuquan')).expect(200);
      const revenue = a.total + b.total + c.total + grab.total;
      expect(body).toMatchObject({ from: '2026-01-10', to: '2026-01-11' });
      expect(body.summary).toMatchObject({ revenue, orders: 4, itemsSold: 7, avgOrderValue: Math.round(revenue / 4) });
      expect(body.summary.previous).toMatchObject({ revenue: prev.total, orders: 1, itemsSold: 1 });
    });

    it('chia ngày và giờ theo giờ Việt Nam (17:00 UTC đã là ngày hôm sau)', async () => {
      const { body } = await t.api().get(`${URL}?from=2026-01-10&to=2026-01-11`).set(t.as('chuquan')).expect(200);
      expect(body.byDay).toEqual([
        { date: '2026-01-10', revenue: a.total + b.total, orders: 2 },
        { date: '2026-01-11', revenue: c.total + grab.total, orders: 2 },
      ]);
      const hour = (h: number) => body.byHour[h];
      expect(hour(7)).toEqual({ hour: 7, revenue: a.total, orders: 1 });
      expect(hour(23)).toEqual({ hour: 23, revenue: b.total, orders: 1 });
      expect(hour(0)).toEqual({ hour: 0, revenue: c.total, orders: 1 });
      expect(hour(12)).toEqual({ hour: 12, revenue: grab.total, orders: 1 });
      expect(hour(9)).toEqual({ hour: 9, revenue: 0, orders: 0 });
    });

    it('theo nguồn đơn, phương thức thanh toán, danh mục, top món', async () => {
      const { body } = await t.api().get(`${URL}?from=2026-01-10&to=2026-01-11`).set(t.as('chuquan')).expect(200);
      expect(body.bySource).toEqual([
        { source: 'counter', revenue: a.total + b.total + c.total, orders: 3 },
        { source: 'grabfood', revenue: grab.total, orders: 1 },
        { source: 'shopeefood', revenue: 0, orders: 0 },
      ]);
      expect(body.byPaymentMethod).toEqual([
        { paymentMethod: 'cash', revenue: a.total + c.total + grab.total, orders: 3 },
        { paymentMethod: 'transfer', revenue: b.total, orders: 1 },
      ]);
      const revenue = a.total + b.total + c.total + grab.total;
      expect(body.byCategory).toEqual([{ category: expect.any(String), revenue, quantity: 7 }]);
      expect(body.topProducts).toEqual([{ productId: t.productId('Cà phê sữa đá'), name: 'Cà phê sữa đá', revenue, quantity: 7 }]);
    });

    it('khoảng không có đơn → toàn số 0, không lỗi', async () => {
      const { body } = await t.api().get(`${URL}?from=2025-06-01&to=2025-06-03`).set(t.as('chuquan')).expect(200);
      expect(body.summary).toMatchObject({ revenue: 0, orders: 0, itemsSold: 0, avgOrderValue: 0 });
      expect(body.byDay).toHaveLength(3);
      expect(body.byCategory).toEqual([]);
      expect(body.topProducts).toEqual([]);
    });
  });
});
