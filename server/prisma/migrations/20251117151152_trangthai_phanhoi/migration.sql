/*
  Warnings:

  - Added the required column `PH_SUA_LUC` to the `PHAN_HOI` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `phan_hoi` ADD COLUMN `PH_SUA_LUC` DATETIME(3) NOT NULL,
    ADD COLUMN `PH_TRANG_THAI` ENUM('DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED') NOT NULL DEFAULT 'PUBLISHED';

-- CreateIndex
CREATE INDEX `PHAN_HOI_DG_MA_idx` ON `PHAN_HOI`(`DG_MA`);

-- CreateIndex
CREATE INDEX `PHAN_HOI_PH_TRANG_THAI_PH_TAO_LUC_idx` ON `PHAN_HOI`(`PH_TRANG_THAI`, `PH_TAO_LUC`);
