-- AlterTable
ALTER TABLE `invest_asset_evo_snapshot` ADD COLUMN `cost_amount` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `income_amount` BIGINT NOT NULL DEFAULT 0;
