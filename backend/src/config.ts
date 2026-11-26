// Đọc & kiểm tra biến môi trường tại một chỗ — không dùng process.env rải rác.
import 'dotenv/config';
import { resolve } from 'node:path';

export const DEV_JWT_SECRET = 'coffeepos-dev-secret-doi-truoc-khi-deploy';

/**
 * Cấu hình bắt buộc khi APP_ENV=production (server thật). Trả danh sách lỗi; rỗng = hợp lệ.
 * Tách hàm thuần để unit test được mà không phải khởi động app.
 */
export function productionConfigErrors(env: NodeJS.ProcessEnv): string[] {
  if (env.APP_ENV !== 'production') return [];
  const errors: string[] = [];
  const secret = env.JWT_SECRET ?? '';
  if (!secret || secret === DEV_JWT_SECRET) errors.push('JWT_SECRET chưa đặt hoặc đang dùng giá trị mặc định cho dev');
  else if (secret.length < 32) errors.push('JWT_SECRET phải dài tối thiểu 32 ký tự');
  if (env.SEED === 'true' && !env.SEED_PASSWORD) errors.push('SEED=true trên production cần SEED_PASSWORD (không dùng mật khẩu demo)');
  // Webhook SePay là tuỳ chọn; đã bật thì API key phải đủ dài để không đoán được.
  if (env.SEPAY_WEBHOOK_KEY && env.SEPAY_WEBHOOK_KEY.length < 24) errors.push('SEPAY_WEBHOOK_KEY phải dài tối thiểu 24 ký tự');
  return errors;
}

const prodErrors = productionConfigErrors(process.env);
if (prodErrors.length) {
  throw new Error(`Cấu hình production không an toàn:\n- ${prodErrors.join('\n- ')}`);
}

/**
 * Bật thanh toán chuyển khoản (UC07) khi có đủ tài khoản nhận tiền VÀ webhook key —
 * thiếu key thì SePay không báo được tiền về, đơn sẽ kẹt "Chờ chuyển khoản".
 */
export function transferEnabled(): boolean {
  const { bank, accountNo, webhookKey } = config.sepay;
  return !!(bank && accountNo && webhookKey);
}

const appEnv = process.env.APP_ENV ?? 'development';
const isProduction = appEnv === 'production';
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const config = {
  appEnv,
  isProduction,
  port: num(process.env.PORT, 4100),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5435/coffeepos',
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  usingDevSecret: (process.env.JWT_SECRET ?? DEV_JWT_SECRET) === DEV_JWT_SECRET,
  /** Phiên đăng nhập 12 tiếng (một ca dài). */
  jwtExpiresInSec: 12 * 60 * 60,
  cookieName: 'coffeepos_token',
  /** Đặt COOKIE_SECURE=true khi web chạy HTTPS: cookie chỉ gửi qua HTTPS + bật HSTS. */
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3100',
  /** Swagger UI tại /api/docs — mặc định tắt trên production, bật lại bằng SWAGGER_ENABLED=true. */
  swaggerEnabled: process.env.SWAGGER_ENABLED ? process.env.SWAGGER_ENABLED === 'true' : !isProduction,
  /** File báo cáo kiểm thử do `npm run test:report` (thư mục gốc) sinh ra; Docker mount ./reports vào /app/reports. */
  testReportPath: process.env.TEST_REPORT_PATH ?? resolve(process.cwd(), '../reports/test-report.json'),
  /**
   * Thanh toán chuyển khoản qua SePay (UC07). Thiếu `webhookKey` → webhook từ chối mọi request;
   * thiếu thông tin tài khoản → không tạo được đơn chuyển khoản.
   */
  sepay: {
    /** API key SePay gửi kèm header `Authorization: Apikey <key>`. */
    webhookKey: process.env.SEPAY_WEBHOOK_KEY ?? '',
    /** Mã ngân hàng theo SePay / VietQR, vd. MBBank, Vietcombank, ACB. */
    bank: process.env.SEPAY_BANK ?? '',
    accountNo: process.env.SEPAY_ACCOUNT_NO ?? '',
    accountName: process.env.SEPAY_ACCOUNT_NAME ?? '',
  },
  /** Chống dò mật khẩu: số lần đăng nhập SAI tối đa trong cửa sổ thời gian. */
  login: {
    maxFailsPerUser: num(process.env.LOGIN_MAX_FAILS_PER_USER, 5),
    maxFailsPerIp: num(process.env.LOGIN_MAX_FAILS_PER_IP, 20),
    windowSec: num(process.env.LOGIN_WINDOW_SEC, 15 * 60),
  },
};
