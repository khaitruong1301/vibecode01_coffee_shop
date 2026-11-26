import { config } from '../src/config';
import { createTestContext, type TestContext } from './helpers';

/**
 * UC07 — thanh toán chuyển khoản qua mã QR, SePay báo tiền về bằng webhook. BR06: đơn chưa nhận đủ tiền không được pha.
 * Biến SEPAY_* giả đặt trong test/setup-env.ts.
 */
describe('Thanh toán chuyển khoản SePay (e2e)', () => {
  let t: TestContext;
  const KEY = process.env.SEPAY_WEBHOOK_KEY as string;
  const hookAuth = { Authorization: `Apikey ${KEY}` };
  let nextSepayId = 1000;

  /** Payload đúng định dạng SePay gửi (kèm cả field không dùng). */
  const sepay = (over: Record<string, unknown> = {}) => ({
    id: nextSepayId++,
    gateway: 'MBBank',
    transactionDate: '2026-11-26 14:02:37',
    accountNumber: '0123456789',
    code: null,
    content: 'chuyen tien',
    transferType: 'in',
    transferAmount: 10000,
    accumulated: 19077000,
    subAccount: null,
    referenceCode: 'MBVCB.3278907687',
    description: 'BankAPINotify ...',
    ...over,
  });

  const hook = (body: object, headers: Record<string, string> = hookAuth) =>
    t.api().post('/api/payments/sepay/webhook').set(headers).send(body);

  /** Tạo đơn 1 ly Cà phê sữa đá size M. */
  async function createOrder(paymentMethod?: 'cash' | 'transfer') {
    const res = await t
      .api()
      .post('/api/orders')
      .set(t.as('thungan1'))
      .send({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity: 1 }], paymentMethod })
      .expect(201);
    return res.body as {
      id: number;
      code: string;
      total: number;
      paymentMethod: string;
      paymentStatus: string;
      paidAt: string | null;
      paidBy: { id: number; fullName: string } | null;
      amountReceived: number;
      transfer: { content: string; amount: number; qrUrl: string; bank: string; accountNo: string } | null;
    };
  }

  const getOrder = async (code: string) => (await t.api().get(`/api/orders/${code}`).set(t.as('thungan1')).expect(200)).body;
  const baristaIds = async () =>
    ((await t.api().get('/api/orders').set(t.as('phache1')).expect(200)).body.items as { id: number }[]).map((o) => o.id);

  beforeAll(async () => {
    t = await createTestContext();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('Tạo đơn', () => {
    it('mặc định tiền mặt: đã thanh toán ngay, không có QR', async () => {
      const o = await createOrder();
      expect(o).toMatchObject({ paymentMethod: 'cash', paymentStatus: 'paid', transfer: null, amountReceived: 0 });
      expect(o.paidAt).not.toBeNull();
    });

    it('chuyển khoản: chờ thanh toán, trả QR với số tiền + nội dung CP000123', async () => {
      const o = await createOrder('transfer');
      expect(o).toMatchObject({ paymentMethod: 'transfer', paymentStatus: 'unpaid', paidAt: null });
      expect(o.transfer).toMatchObject({ bank: 'MBBank', accountNo: '0123456789', amount: o.total, content: `CP${String(o.id).padStart(6, '0')}` });
      expect(o.transfer?.qrUrl).toContain('https://qr.sepay.vn/img?');
    });

    it('BR06: đơn chuyển khoản chưa thanh toán không hiện ở quầy pha, không chuyển trạng thái được', async () => {
      const o = await createOrder('transfer');
      expect(await baristaIds()).not.toContain(o.id);
      const res = await t.api().patch(`/api/orders/${o.id}/status`).set(t.as('phache1')).send({ status: 'preparing' }).expect(409);
      expect(res.body.error).toBe('Đơn chưa thanh toán, chưa được pha');
    });

    it('chuyển khoản chỉ cho đơn tại quầy → 400', async () => {
      const res = await t
        .api()
        .post('/api/orders')
        .set(t.as('thungan1'))
        .send({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity: 1 }], source: 'grabfood', partnerCode: 'GF-1', paymentMethod: 'transfer' })
        .expect(400);
      expect(res.body.error).toBe('Chuyển khoản chỉ dùng cho đơn tại quầy');
    });

    it('phương thức lạ → 400', async () => {
      await t
        .api()
        .post('/api/orders')
        .set(t.as('thungan1'))
        .send({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity: 1 }], paymentMethod: 'card' })
        .expect(400);
    });

    it('chưa cấu hình tài khoản ngân hàng → không tạo được đơn chuyển khoản', async () => {
      const saved = config.sepay.accountNo;
      config.sepay.accountNo = '';
      try {
        const res = await t
          .api()
          .post('/api/orders')
          .set(t.as('thungan1'))
          .send({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity: 1 }], paymentMethod: 'transfer' })
          .expect(400);
        expect(res.body.error).toBe('Chưa cấu hình tài khoản nhận chuyển khoản');
        const settings = await t.api().get('/api/payments/settings').set(t.as('thungan1')).expect(200);
        expect(settings.body.transferEnabled).toBe(false);
      } finally {
        config.sepay.accountNo = saved;
      }
    });
  });

  describe('Webhook — xác thực', () => {
    it('thiếu hoặc sai API key → 401, không ghi giao dịch', async () => {
      await hook(sepay(), {}).expect(401);
      await hook(sepay(), { Authorization: 'Apikey sai-key' }).expect(401);
      await hook(sepay(), { Authorization: `Bearer ${KEY}` }).expect(401);
      expect(await t.prisma.bankTransaction.count()).toBe(0);
    });

    it('không dùng được token đăng nhập của nhân viên thay API key', async () => {
      await hook(sepay(), t.as('chuquan')).expect(401);
    });

    it('chưa cấu hình SEPAY_WEBHOOK_KEY → 503 (webhook tắt)', async () => {
      const saved = config.sepay.webhookKey;
      config.sepay.webhookKey = '';
      try {
        await hook(sepay()).expect(503);
      } finally {
        config.sepay.webhookKey = saved;
      }
    });

    it('API key không phân biệt hoa thường ở tiền tố "Apikey"', async () => {
      await hook(sepay({ transferType: 'out' }), { Authorization: `APIKEY ${KEY}` }).expect(200);
    });

    it('dữ liệu sai định dạng → 400', async () => {
      await hook({ ...sepay(), transferAmount: 'abc' }).expect(400);
      await hook({ ...sepay(), transferType: 'both' }).expect(400);
      await hook({ ...sepay(), id: undefined }).expect(400);
    });
  });

  describe('Webhook — đối soát', () => {
    it('chuyển đủ tiền đúng nội dung → đơn đã thanh toán, hiện ở quầy pha, trả { success: true }', async () => {
      const o = await createOrder('transfer');
      const res = await hook(sepay({ content: `NGUYEN VAN A chuyen tien ${o.transfer?.content}`, transferAmount: o.total })).expect(200);
      expect(res.body).toEqual({ success: true });

      const after = await getOrder(o.code);
      expect(after).toMatchObject({ paymentStatus: 'paid', paymentLabel: 'Đã thanh toán', amountReceived: o.total, transfer: null });
      expect(after.paidAt).not.toBeNull();
      expect(await baristaIds()).toContain(o.id);
      await t.api().patch(`/api/orders/${o.id}/status`).set(t.as('phache1')).send({ status: 'preparing' }).expect(200);
    });

    it('ngân hàng đổi định dạng mã (cp-000123, có dấu gạch) vẫn khớp; ưu tiên field code của SePay', async () => {
      const a = await createOrder('transfer');
      await hook(sepay({ content: `ck ${a.code.toLowerCase()} cam on`, transferAmount: a.total })).expect(200);
      expect((await getOrder(a.code)).paymentStatus).toBe('paid');

      const b = await createOrder('transfer');
      await hook(sepay({ code: b.transfer?.content, content: 'noi dung bi cat', transferAmount: b.total })).expect(200);
      expect((await getOrder(b.code)).paymentStatus).toBe('paid');
    });

    it('chuyển thiếu → partial, QR hiện số còn thiếu; chuyển thêm cho đủ → đã thanh toán', async () => {
      const o = await createOrder('transfer');
      await hook(sepay({ content: o.transfer?.content, transferAmount: 10000 })).expect(200);
      const mid = await getOrder(o.code);
      expect(mid).toMatchObject({ paymentStatus: 'unpaid', amountReceived: 10000 });
      expect(mid.transfer.amount).toBe(o.total - 10000);

      await hook(sepay({ content: o.transfer?.content, transferAmount: o.total - 10000 })).expect(200);
      expect((await getOrder(o.code)).paymentStatus).toBe('paid');
      const txs = await t.prisma.bankTransaction.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' } });
      expect(txs.map((x) => x.status)).toEqual(['partial', 'matched']);
    });

    it('SePay gửi lại cùng id → chỉ xử lý một lần', async () => {
      const o = await createOrder('transfer');
      const body = sepay({ content: o.transfer?.content, transferAmount: 10000 });
      await hook(body).expect(200);
      await hook(body).expect(200);
      await Promise.all([hook(body), hook(body)]);
      expect(await t.prisma.bankTransaction.count({ where: { sepayId: body.id } })).toBe(1);
      expect((await getOrder(o.code)).amountReceived).toBe(10000);
    });

    it('chuyển vào đơn đã thanh toán → already_paid (không đổi đơn)', async () => {
      const cash = await createOrder('cash');
      await hook(sepay({ content: `CP${String(cash.id).padStart(6, '0')}`, transferAmount: cash.total })).expect(200);
      const tx = await t.prisma.bankTransaction.findFirstOrThrow({ where: { orderId: cash.id } });
      expect(tx.status).toBe('already_paid');
      expect((await getOrder(cash.code)).paymentMethod).toBe('cash');
    });

    it('không có mã đơn / đơn không tồn tại / tiền ra → vẫn ghi nhận, không gắn đơn', async () => {
      const a = sepay({ content: 'chuyen tien mua cafe' });
      const b = sepay({ content: 'CP999999' });
      const c = sepay({ content: 'CP000001', transferType: 'out' });
      for (const body of [a, b, c]) await hook(body).expect(200);
      const rows = await t.prisma.bankTransaction.findMany({ where: { sepayId: { in: [a.id, b.id, c.id] as number[] } }, orderBy: { sepayId: 'asc' } });
      expect(rows.map((r) => [r.status, r.orderId])).toEqual([
        ['unmatched', null],
        ['unmatched', null],
        ['outgoing', null],
      ]);
    });

    it('lưu thời điểm giao dịch giờ Việt Nam thành UTC', async () => {
      const body = sepay({ transactionDate: '2026-11-26 07:30:00', transferType: 'out' });
      await hook(body).expect(200);
      const row = await t.prisma.bankTransaction.findUniqueOrThrow({ where: { sepayId: body.id } });
      expect(row.transactionDate.toISOString()).toBe('2026-11-26T00:30:00.000Z');
    });
  });

  describe('Webhook — dữ liệu bất thường (review)', () => {
    it('thiếu SEPAY_WEBHOOK_KEY → tắt chuyển khoản (tránh đơn kẹt vì tiền về mà webhook từ chối)', async () => {
      const saved = config.sepay.webhookKey;
      config.sepay.webhookKey = '';
      try {
        const res = await t
          .api()
          .post('/api/orders')
          .set(t.as('thungan1'))
          .send({ items: [{ productId: t.productId('Cà phê sữa đá'), size: 'M', quantity: 1 }], paymentMethod: 'transfer' })
          .expect(400);
        expect(res.body.error).toBe('Chưa cấu hình tài khoản nhận chuyển khoản');
      } finally {
        config.sepay.webhookKey = saved;
      }
    });

    it('tiền vào tài khoản khác tài khoản cấu hình → unmatched, đơn không đổi', async () => {
      const o = await createOrder('transfer');
      const body = sepay({ accountNumber: '9999999999', content: o.transfer?.content, transferAmount: o.total });
      await hook(body).expect(200);
      const row = await t.prisma.bankTransaction.findUniqueOrThrow({ where: { sepayId: body.id } });
      expect(row).toMatchObject({ status: 'unmatched', orderId: null });
      expect((await getOrder(o.code)).paymentStatus).toBe('unpaid');
    });

    it('mã CP + số vượt int4 trong nội dung → unmatched (không lỗi 500)', async () => {
      const body = sepay({ content: 'MBVCB CP3278907687 chuyen tien' });
      await hook(body).expect(200);
      expect((await t.prisma.bankTransaction.findUniqueOrThrow({ where: { sepayId: body.id } })).status).toBe('unmatched');
    });

    it('nội dung quá 500 ký tự → cắt bớt rồi lưu, không mất giao dịch', async () => {
      const body = sepay({ content: `CP999998 ${'x'.repeat(800)}` });
      await hook(body).expect(200);
      const row = await t.prisma.bankTransaction.findUniqueOrThrow({ where: { sepayId: body.id } });
      expect(row.content).toHaveLength(500);
    });

    it('id SePay vượt int4 → 400 với thông báo tiếng Việt', async () => {
      const res = await hook(sepay({ id: 3_000_000_000 })).expect(400);
      expect(res.body.details.id).toBe('id giao dịch không hợp lệ');
    });
  });

  describe('Đơn chờ chuyển khoản + thứ tự quầy pha', () => {
    it('GET /orders?payment=unpaid → chỉ đơn chờ chuyển khoản, mới nhất trước', async () => {
      const a = await createOrder('transfer');
      const b = await createOrder('transfer');
      const res = await t.api().get('/api/orders?payment=unpaid').set(t.as('thungan1')).expect(200);
      const items = res.body.items as { id: number; paymentStatus: string }[];
      expect(items.every((o) => o.paymentStatus === 'unpaid')).toBe(true);
      const ids = items.map((o) => o.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
      await t.api().get('/api/orders?payment=abc').set(t.as('thungan1')).expect(400);
    });

    it('quầy pha xếp theo thời điểm thanh toán: đơn chuyển khoản trả muộn không chen lên trước', async () => {
      const late = await createOrder('transfer');
      const cash = await createOrder('cash');
      await hook(sepay({ content: late.transfer?.content, transferAmount: late.total })).expect(200);
      const ids = await baristaIds();
      expect(ids.indexOf(cash.id)).toBeLessThan(ids.indexOf(late.id));
    });

    it('người thu tiền: tiền mặt = thu ngân tạo đơn; SePay báo tiền về = null', async () => {
      const cash = await createOrder('cash');
      expect(cash.paidBy?.id).toBeDefined();
      const tr = await createOrder('transfer');
      expect(tr.paidBy).toBeNull();
      await hook(sepay({ content: tr.transfer?.content, transferAmount: tr.total })).expect(200);
      expect((await getOrder(tr.code)).paidBy).toBeNull();
    });
  });

  describe('Khách trả tiền mặt thay chuyển khoản', () => {
    it('thu ngân xác nhận → đơn tiền mặt đã thanh toán; bấm lại → 409', async () => {
      const o = await createOrder('transfer');
      const res = await t.api().post(`/api/orders/${o.id}/pay-cash`).set(t.as('thungan1')).expect(200);
      expect(res.body).toMatchObject({ paymentMethod: 'cash', paymentStatus: 'paid', transfer: null, paidBy: { fullName: expect.any(String) } });
      expect(await baristaIds()).toContain(o.id);
      const again = await t.api().post(`/api/orders/${o.id}/pay-cash`).set(t.as('thungan1')).expect(409);
      expect(again.body.error).toBe('Đơn đã được thanh toán');
    });

    it('pha chế không được xác nhận thu tiền → 403; chưa đăng nhập → 401; đơn không có → 404', async () => {
      const o = await createOrder('transfer');
      await t.api().post(`/api/orders/${o.id}/pay-cash`).set(t.as('phache1')).expect(403);
      await t.api().post(`/api/orders/${o.id}/pay-cash`).expect(401);
      await t.api().post('/api/orders/999999/pay-cash').set(t.as('thungan1')).expect(404);
    });
  });

  describe('Danh sách giao dịch + cấu hình', () => {
    it('thu ngân / chủ quán xem được, mới nhất trước, có nhãn + mã đơn', async () => {
      const res = await t.api().get('/api/payments/transactions?limit=5').set(t.as('thungan1')).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.length).toBeLessThanOrEqual(5);
      const ids = res.body.items.map((x: { id: number }) => x.id);
      expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
      expect(res.body.items[0]).toHaveProperty('statusLabel');
      expect(res.body.items.some((x: { orderCode: string | null }) => /^CP-\d{6}$/.test(x.orderCode ?? ''))).toBe(true);
    });

    it('pha chế → 403, chưa đăng nhập → 401, limit sai → 400', async () => {
      await t.api().get('/api/payments/transactions').set(t.as('phache1')).expect(403);
      await t.api().get('/api/payments/transactions').expect(401);
      await t.api().get('/api/payments/transactions?limit=0').set(t.as('chuquan')).expect(400);
    });

    it('settings: có tài khoản + webhook đã có key, KHÔNG lộ API key', async () => {
      const res = await t.api().get('/api/payments/settings').set(t.as('chuquan')).expect(200);
      expect(res.body).toEqual({
        transferEnabled: true,
        bank: 'MBBank',
        accountNo: '0123456789',
        accountName: 'QUAN CA PHE E2E',
        webhookKeyConfigured: true,
        webhookPath: '/api/payments/sepay/webhook',
      });
      expect(JSON.stringify(res.body)).not.toContain(KEY);
      await t.api().get('/api/payments/settings').expect(401);
    });
  });
});
