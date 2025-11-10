/*
  Warnings:

  - A unique constraint covering the columns `[CTDP_ID]` on the table `DANH_GIA` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `danh_gia` ADD COLUMN `CTDP_ID` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `DANH_GIA_CTDP_ID_key` ON `DANH_GIA`(`CTDP_ID`);

-- AddForeignKey
ALTER TABLE `DANH_GIA` ADD CONSTRAINT `DANH_GIA_CTDP_ID_fkey` FOREIGN KEY (`CTDP_ID`) REFERENCES `CT_DAT_TRUOC`(`CTDP_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
