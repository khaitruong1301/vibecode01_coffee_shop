-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'transfer');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid');

-- CreateEnum
CREATE TYPE "BankTxStatus" AS ENUM ('matched', 'partial', 'already_paid', 'unmatched', 'outgoing');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'paid';

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" SERIAL NOT NULL,
    "sepay_id" INTEGER NOT NULL,
    "gateway" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(50) NOT NULL,
    "transfer_type" VARCHAR(10) NOT NULL,
    "amount" INTEGER NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "reference_code" VARCHAR(100),
    "transaction_date" TIMESTAMPTZ(6) NOT NULL,
    "order_id" INTEGER,
    "status" "BankTxStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_sepay_id_key" ON "bank_transactions"("sepay_id");

-- CreateIndex
CREATE INDEX "bank_transactions_order_id_idx" ON "bank_transactions"("order_id");

-- CreateIndex
CREATE INDEX "bank_transactions_created_at_idx" ON "bank_transactions"("created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_status_idx" ON "orders"("payment_status", "status");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Đơn cũ đều là tiền mặt, đã thanh toán lúc tạo.
UPDATE "orders" SET "paid_at" = "created_at" WHERE "paid_at" IS NULL;

-- Ràng buộc nghiệp vụ thanh toán (UC07, BR06) — lớp chặn cuối nếu code bỏ sót.
-- Đã thanh toán ⇔ có paid_at.
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_at_consistent" CHECK (("payment_status" = 'paid') = ("paid_at" IS NOT NULL));
-- Chỉ đơn chuyển khoản mới có thể chưa thanh toán.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unpaid_only_transfer" CHECK ("payment_status" = 'paid' OR "payment_method" = 'transfer');
-- Chuyển khoản chỉ dùng cho đơn tại quầy (đơn GrabFood/ShopeeFood do đối tác thu tiền).
ALTER TABLE "orders" ADD CONSTRAINT "orders_transfer_counter_only" CHECK ("payment_method" = 'cash' OR "source" = 'counter');
-- Đơn chưa thanh toán không được pha (BR06).
ALTER TABLE "orders" ADD CONSTRAINT "orders_unpaid_not_prepared" CHECK ("payment_status" = 'paid' OR "status" = 'pending');
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_amount_nonnegative" CHECK ("amount" >= 0);
