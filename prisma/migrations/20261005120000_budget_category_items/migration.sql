CREATE TABLE `budget_category_items` (
  `item_id` BIGINT NOT NULL AUTO_INCREMENT,
  `budgets_budget_id` BIGINT NOT NULL,
  `budgets_users_user_id` BIGINT NOT NULL,
  `categories_category_id` BIGINT NOT NULL,
  `direction` ENUM('EXPENSE', 'INCOME') NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `amount` BIGINT NOT NULL,
  `sort_order` INTEGER NOT NULL,
  PRIMARY KEY (`item_id`),
  INDEX `budget_items_parent_direction_order_idx` (`budgets_budget_id`, `budgets_users_user_id`, `categories_category_id`, `direction`, `sort_order`),
  CONSTRAINT `budget_items_allocation_fk` FOREIGN KEY (`budgets_budget_id`, `budgets_users_user_id`, `categories_category_id`) REFERENCES `budgets_has_categories` (`budgets_budget_id`, `budgets_users_user_id`, `categories_category_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
