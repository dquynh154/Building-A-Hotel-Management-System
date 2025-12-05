/*
  Warnings:

  - You are about to drop the column `hOP_DONG_DAT_PHONGHDONG_MA` on the `chi_tiet_dich_vu` table. All the data in the column will be lost.
  - You are about to drop the column `pHONGPHONG_MA` on the `chi_tiet_dich_vu` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `chi_tiet_dich_vu` DROP FOREIGN KEY `CHI_TIET_DICH_VU_hOP_DONG_DAT_PHONGHDONG_MA_fkey`;

-- DropForeignKey
ALTER TABLE `chi_tiet_dich_vu` DROP FOREIGN KEY `CHI_TIET_DICH_VU_pHONGPHONG_MA_fkey`;

-- DropIndex
DROP INDEX `CHI_TIET_DICH_VU_hOP_DONG_DAT_PHONGHDONG_MA_fkey` ON `chi_tiet_dich_vu`;

-- DropIndex
DROP INDEX `CHI_TIET_DICH_VU_pHONGPHONG_MA_fkey` ON `chi_tiet_dich_vu`;

-- AlterTable
ALTER TABLE `chi_tiet_dich_vu` DROP COLUMN `hOP_DONG_DAT_PHONGHDONG_MA`,
    DROP COLUMN `pHONGPHONG_MA`;

-- AddForeignKey
ALTER TABLE `CHI_TIET_DICH_VU` ADD CONSTRAINT `CHI_TIET_DICH_VU_HDONG_MA_fkey` FOREIGN KEY (`HDONG_MA`) REFERENCES `HOP_DONG_DAT_PHONG`(`HDONG_MA`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CHI_TIET_DICH_VU` ADD CONSTRAINT `CHI_TIET_DICH_VU_PHONG_MA_fkey` FOREIGN KEY (`PHONG_MA`) REFERENCES `PHONG`(`PHONG_MA`) ON DELETE RESTRICT ON UPDATE CASCADE;
