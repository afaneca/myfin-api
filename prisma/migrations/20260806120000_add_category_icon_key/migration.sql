ALTER TABLE categories
  ADD COLUMN icon_key VARCHAR(45) NOT NULL DEFAULT 'category' AFTER color_gradient;
