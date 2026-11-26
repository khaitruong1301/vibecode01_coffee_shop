// Chạy (chỉ dev): npm run db:seed-demo                → thêm đơn mẫu đã thanh toán cho 30 ngày gần nhất
//                 npm run db:seed-demo -- --days 60    → số ngày khác (1–366)
//                 npm run db:seed-demo -- --clear      → xoá đơn mẫu
// Để dashboard doanh thu (UC08) có số liệu khi dùng thử. Đơn mẫu có ghi chú DEMO_NOTE để xoá được; giá tính bằng pricing.ts.
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config';
import { PrismaClient } from '../generated/prisma/client';
import type { OrderSource, Size } from '../generated/prisma/enums';
import { priceOrder, type LineInput } from '../pricing/pricing';

export const DEMO_NOTE = '[demo]';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Số đơn tương đối theo giờ (giờ Việt Nam) — cao điểm 7h–9h sáng, trưa và chiều. */
const HOUR_WEIGHT: Record<number, number> = {
  6: 3, 7: 12, 8: 14, 9: 9, 10: 6, 11: 6, 12: 8, 13: 7, 14: 6, 15: 8, 16: 8, 17: 6, 18: 5, 19: 5, 20: 4, 21: 3,
};

/** PRNG có seed — chạy lại cho cùng kết quả. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rand: () => number, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

function parseArgs(argv: string[]) {
  const i = argv.indexOf('--days');
  const days = i >= 0 ? Number(argv[i + 1]) : 30;
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('--days phải là số nguyên 1–366');
  return { days, clear: argv.includes('--clear') };
}

async function main() {
  if (config.isProduction) throw new Error('Không tạo đơn mẫu trên production');
  const { days, clear } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    if (clear) {
      const { count } = await prisma.order.deleteMany({ where: { note: DEMO_NOTE, bankTransactions: { none: {} } } });
      process.stdout.write(`Đã xoá ${count} đơn mẫu.\n`);
      return;
    }

    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, price: true, hasSize: true, category: { select: { name: true } } },
    });
    const cashiers = await prisma.user.findMany({ where: { role: 'cashier', isActive: true }, select: { id: true } });
    if (!products.length || !cashiers.length) throw new Error('Chưa có món / thu ngân — chạy npm run db:seed trước');

    const rand = rng(20261126);
    // Đồ uống bán chạy hơn bánh.
    const productWeights: [(typeof products)[number], number][] = products.map((p) => [p, p.hasSize ? 3 + rand() * 5 : 1 + rand()]);
    const now = Date.now();
    const todayVn = Math.floor((now + VN_OFFSET_MS) / DAY_MS) * DAY_MS; // 00:00 hôm nay theo giờ VN, biểu diễn như UTC
    let created = 0;

    for (let d = days - 1; d >= 0; d--) {
      const dayStartVn = todayVn - d * DAY_MS;
      const weekday = new Date(dayStartVn).getUTCDay();
      const base = weekday === 0 || weekday === 6 ? 150 : 115;
      const count = Math.round(base * (0.8 + rand() * 0.4));
      const data = [];

      for (let n = 0; n < count; n++) {
        const hour = pickWeighted(rand, Object.entries(HOUR_WEIGHT).map(([h, w]) => [Number(h), w] as [number, number]));
        const paidAt = new Date(dayStartVn + hour * 3600_000 + Math.floor(rand() * 3600_000) - VN_OFFSET_MS);
        if (paidAt.getTime() > now) continue; // không tạo đơn ở tương lai

        const lines: LineInput[] = [];
        const lineCount = pickWeighted(rand, [[1, 60], [2, 30], [3, 10]]);
        const used = new Set<number>();
        for (let l = 0; l < lineCount; l++) {
          const p = pickWeighted(rand, productWeights);
          if (used.has(p.id)) continue;
          used.add(p.id);
          const size: Size | null = p.hasSize ? pickWeighted<Size>(rand, [['S', 20], ['M', 55], ['L', 25]]) : null;
          lines.push({ productId: p.id, size, quantity: pickWeighted(rand, [[1, 80], [2, 15], [3, 5]]) });
        }
        const priced = priceOrder(lines, products);

        const source = pickWeighted<OrderSource>(rand, [['counter', 75], ['grabfood', 15], ['shopeefood', 10]]);
        const transfer = source === 'counter' && rand() < 0.3;
        data.push({
          cashierId: cashiers[Math.floor(rand() * cashiers.length)].id,
          source,
          partnerCode: source === 'counter' ? null : `${source === 'grabfood' ? 'GF' : 'SF'}-${Math.floor(100000 + rand() * 900000)}`,
          note: DEMO_NOTE,
          status: 'done' as const,
          total: priced.total,
          paymentMethod: transfer ? ('transfer' as const) : ('cash' as const),
          paymentStatus: 'paid' as const,
          paidAt,
          createdAt: new Date(paidAt.getTime() - (transfer ? 60_000 : 0)),
          items: {
            create: priced.lines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              size: l.size,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
            })),
          },
        });
      }

      await prisma.$transaction(data.map((o) => prisma.order.create({ data: o, select: { id: true } })));
      created += data.length;
    }
    process.stdout.write(`Đã thêm ${created} đơn mẫu cho ${days} ngày gần nhất. Xoá bằng: npm run db:seed-demo -- --clear\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
