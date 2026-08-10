-- CreateIndex
CREATE INDEX `transactions_category_date_idx` ON `transactions`(`categories_category_id`, `date_timestamp`);
