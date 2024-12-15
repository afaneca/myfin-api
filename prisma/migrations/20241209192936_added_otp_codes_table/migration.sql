-- CreateTable
CREATE TABLE `otp_codes` (
    `otp_id` BIGINT NOT NULL AUTO_INCREMENT,
    `users_user_id` BIGINT NOT NULL,
    `code` VARCHAR(200) NOT NULL,
    `used` BOOLEAN NOT NULL,
    `created_at` BIGINT NOT NULL,
    `expires_at` BIGINT NOT NULL,

    UNIQUE INDEX `otp_codes_pk_2`(`code`),
    INDEX `otp_codes_users_user_id_fk`(`users_user_id`),
    PRIMARY KEY (`otp_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `otp_codes` ADD CONSTRAINT `otp_codes_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
