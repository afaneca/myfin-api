/*
  Warnings:

  - A unique constraint covering the columns `[name,users_user_id]` on the table `tags` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `uq_name` ON `tags`;

-- CreateIndex
CREATE UNIQUE INDEX `uq_name` ON `tags`(`name`, `users_user_id`);
