/*
  Warnings:

  - A unique constraint covering the columns `[SODIENTHOAI_KH]` on the table `KHACH_HANG` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `chinh_sach` MODIFY `GIO_CHECKIN` TIME(0) NOT NULL DEFAULT '14:00:00',
    MODIFY `GIO_CHECKOUT` TIME(0) NOT NULL DEFAULT '12:00:00';

-- CreateIndex
CREATE UNIQUE INDEX `KHACH_HANG_SODIENTHOAI_KH_key` ON `KHACH_HANG`(`SODIENTHOAI_KH`);
