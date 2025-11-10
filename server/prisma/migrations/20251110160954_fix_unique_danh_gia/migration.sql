/*
  Warnings:

  - A unique constraint covering the columns `[HDONG_MA,CTDP_ID]` on the table `DANH_GIA` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `danh_gia` DROP FOREIGN KEY `DANH_GIA_CTDP_ID_fkey`;

-- DropForeignKey
ALTER TABLE `danh_gia` DROP FOREIGN KEY `DANH_GIA_HDONG_MA_fkey`;

-- DropIndex
DROP INDEX `DANH_GIA_CTDP_ID_key` ON `danh_gia`;

-- DropIndex
DROP INDEX `DANH_GIA_HDONG_MA_key` ON `danh_gia`;

-- CreateIndex
CREATE UNIQUE INDEX `DANH_GIA_HDONG_MA_CTDP_ID_key` ON `DANH_GIA`(`HDONG_MA`, `CTDP_ID`);

-- AddForeignKey
-- ALTER TABLE `LUU_TRU_KHACH` ADD CONSTRAINT `LUU_TRU_KHACH_KH_MA_fkey` FOREIGN KEY (`KH_MA`) REFERENCES `KHACH_HANG`(`KH_MA`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- ALTER TABLE `HOP_DONG_DAT_PHONG` ADD CONSTRAINT `HOP_DONG_DAT_PHONG_KH_MA_fkey` FOREIGN KEY (`KH_MA`) REFERENCES `KHACH_HANG`(`KH_MA`) ON DELETE RESTRICT ON UPDATE CASCADE;
