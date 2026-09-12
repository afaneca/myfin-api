ALTER TABLE `invest_asset_evo_snapshot`
  ADD COLUMN `valuation_source` VARCHAR(20) NOT NULL DEFAULT 'legacy';
