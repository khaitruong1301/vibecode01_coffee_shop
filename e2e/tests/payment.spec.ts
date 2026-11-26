import { expect, test } from '@playwright/test';
import { addToCart, API, login } from './helpers';

/** UC07 — chuyển khoản QR qua SePay, chạy trên stack Docker thật (docker-compose.e2e.yml có key + tài khoản giả). */
test.describe.configure({ mode: 'serial' });

const KEY = 'e2e-sepay-webhook-key-0123456789abcdef';
let sepayId = Date.now() % 1_000_000_000;

test.describe('Thanh toán chuyển khoản SePay', () => {
  test('thu ngân chọn Chuyển khoản → hóa đơn hiện QR; SePay báo tiền về → tự chuyển "Đã thanh toán", hiện ở quầy pha (BR06)', async ({ page, request }) => {
    await login(page, 'thungan1', /\/checkout$/);
    await addToCart(page, 'Cà phê sữa đá', 'L');
    await page.getByRole('button', { name: /Chuyển khoản/ }).click();
    await page.getByRole('button', { name: /Thanh toán chuyển khoản/ }).click();
    await expect(page).toHaveURL(/\/receipt\/CP-\d{6}$/);

    const panel = page.getByRole('region', { name: 'Thanh toán chuyển khoản' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('img', { name: /Mã QR chuyển khoản/ })).toHaveAttribute('src', /^https:\/\/qr\.sepay\.vn\/img\?/);
    await expect(panel).toContainText('0123456789');
    await expect(panel).toContainText('35.000đ');
    const content = (await panel.locator('span.tabular').first().textContent())?.trim() ?? '';
    expect(content).toMatch(/^CF\d{6}$/);
    const code = page.url().split('/').pop() as string;

    // Chưa trả tiền → quầy pha chưa thấy đơn
    const barista = await request.post(`${API}/api/auth/login`, { data: { username: 'phache1', password: 'Coffee@123' } });
    const token = (await barista.json()).token as string;
    const before = await request.get(`${API}/api/orders`, { headers: { Authorization: `Bearer ${token}` } });
    expect(((await before.json()).items as { code: string }[]).map((o) => o.code)).not.toContain(code);

    // SePay gọi webhook — sai key bị từ chối, đúng key được ghi nhận
    const payload = {
      id: ++sepayId, gateway: 'MBBank', transactionDate: '2026-11-26 14:02:37', accountNumber: '0123456789',
      code: null, content: `NGUYEN VAN A chuyen tien ${content}`, transferType: 'in', transferAmount: 35000,
      accumulated: 0, subAccount: null, referenceCode: 'FT-E2E', description: '',
    };
    expect((await request.post(`${API}/api/payments/sepay/webhook`, { data: payload, headers: { Authorization: 'Apikey sai' } })).status()).toBe(401);
    const ok = await request.post(`${API}/api/payments/sepay/webhook`, { data: payload, headers: { Authorization: `Apikey ${KEY}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ success: true });

    // Hóa đơn tự cập nhật (hỏi lại server mỗi 3 giây)
    await expect(page.getByText(/Đã nhận đủ tiền/)).toBeVisible({ timeout: 10_000 });
    await expect(panel).toBeHidden();
    await expect(page.locator('article')).toContainText('Đã thanh toán');

    const after = await request.get(`${API}/api/orders`, { headers: { Authorization: `Bearer ${token}` } });
    expect(((await after.json()).items as { code: string }[]).map((o) => o.code)).toContain(code);

    // Trang Chuyển khoản liệt kê giao dịch đã khớp đơn
    await page.getByRole('link', { name: 'Chuyển khoản' }).click();
    await expect(page).toHaveURL(/\/payments$/);
    const row = page.getByRole('row', { name: new RegExp(code) });
    await expect(row).toContainText('Đã khớp đơn');
    await expect(row).toContainText('+35.000đ');
  });

  test('khách đổi ý trả tiền mặt → thu ngân xác nhận, đơn đã thanh toán', async ({ page }) => {
    await login(page, 'thungan1', /\/checkout$/);
    await addToCart(page, 'Bạc xỉu', 'M');
    await page.getByRole('button', { name: /Chuyển khoản/ }).click();
    await page.getByRole('button', { name: /Thanh toán chuyển khoản/ }).click();
    await expect(page.getByRole('region', { name: 'Thanh toán chuyển khoản' })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Khách trả tiền mặt/ }).click();
    await expect(page.getByText(/Đã nhận đủ tiền/)).toBeVisible();
    await expect(page.locator('article')).toContainText('Tiền mặt');
  });
});
