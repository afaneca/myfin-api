-- Rename fees_taxes to fees_taxes_amount
ALTER TABLE `invest_transactions` CHANGE COLUMN `fees_taxes` `fees_taxes_amount` BIGINT DEFAULT 0;

-- Add new fees_taxes_units column
ALTER TABLE `invest_transactions` ADD COLUMN `fees_taxes_units` DECIMAL(16, 6) DEFAULT NULL;
