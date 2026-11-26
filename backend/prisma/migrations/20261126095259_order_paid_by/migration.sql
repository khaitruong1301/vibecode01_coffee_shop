-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Đơn tiền mặt cũ: người thu tiền = thu ngân tạo đơn.
UPDATE "orders" SET "paid_by_id" = "cashier_id" WHERE "payment_method" = 'cash' AND "payment_status" = 'paid' AND "paid_by_id" IS NULL;

-- Chỉ nhận giao dịch tiền vào / tiền ra (UC07).
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_transfer_type_valid" CHECK ("transfer_type" IN ('in', 'out'));
