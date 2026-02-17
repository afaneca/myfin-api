-- CreateTable
CREATE TABLE `goals` (
    `goal_id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` LONGTEXT NULL,
    `priority` INTEGER NOT NULL,
    `amount` BIGINT NOT NULL,
    `due_date` BIGINT NULL,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NULL,
    `users_user_id` BIGINT NOT NULL,

    UNIQUE INDEX `goal_id_UNIQUE`(`goal_id`),
    INDEX `fk_goals_users1_idx`(`users_user_id`),
    UNIQUE INDEX `uq_name_user_id`(`name`, `users_user_id`),
    PRIMARY KEY (`goal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goal_has_account` (
    `goals_goal_id` BIGINT NOT NULL,
    `accounts_account_id` BIGINT NOT NULL,
    `match_type` VARCHAR(45) NOT NULL,
    `match_value` DECIMAL(16, 6) NOT NULL,

    INDEX `fk_goal_has_account_goals1_idx`(`goals_goal_id`),
    INDEX `fk_goal_has_account_accounts1_idx`(`accounts_account_id`),
    PRIMARY KEY (`goals_goal_id`, `accounts_account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `goal_has_account` ADD CONSTRAINT `goal_has_account_goals_goal_id_fk` FOREIGN KEY (`goals_goal_id`) REFERENCES `goals`(`goal_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `goal_has_account` ADD CONSTRAINT `goal_has_account_accounts_account_id_fk` FOREIGN KEY (`accounts_account_id`) REFERENCES `accounts`(`account_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
