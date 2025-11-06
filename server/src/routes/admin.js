const admin = require('express').Router();
const { prisma, Prisma } = require('../db/prisma');

/** Lấy danh sách đơn đặt trực tuyến cần xử lý
 *  GET /admin/dat-truoc?status=pending|alloc|all
 *  - pending: HĐ CONFIRMED nhưng CT_DAT_TRUOC chưa ALLOCATED hết
 *  - alloc:   HĐ đã ALLOCATED đủ
 *  - all:     tất cả
 */
admin.get('/dat-truoc', async (req, res, next) => {
    try {
        const rawStatus = String(req.query.status || 'pending').toLowerCase();
        const take = Math.max(1, Math.min(50, Number(req.query.take) || 10));
        const skip = Math.max(0, Number(req.query.skip) || 0);

        // 1) Chọn điều kiện cơ bản theo status
        let whereHop = {};
        if (rawStatus === 'pending') {
            whereHop = { HDONG_TRANG_THAI: 'PENDING' };
        } else if (rawStatus === 'confirmed' || rawStatus === 'needs_action') {
            whereHop = { HDONG_TRANG_THAI: 'CONFIRMED' };
        } else {
            // fallback: pending
            whereHop = { HDONG_TRANG_THAI: 'PENDING' };
        }

        // 2) Lấy danh sách hợp đồng theo điều kiện cơ bản
        const hopsBase = await prisma.hOP_DONG_DAT_PHONG.findMany({
            where: whereHop,
            orderBy: { HDONG_TAO_LUC: 'desc' },
            take,
            skip,
            select: {
                HDONG_MA: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
                HDONG_TIENCOCYEUCAU: true,
                HDONG_TAO_LUC: true,
                HDONG_TRANG_THAI: true,
                KHACH_HANG: { select: { KH_MA: true, KH_HOTEN: true, KH_EMAIL: true, KH_SDT: true } },
            },
        });

        let hops = hopsBase;

        // 3) Nếu là needs_action → lọc những HĐ CHƯA có bất kỳ CTSD nào
        if (rawStatus === 'needs_action' && hopsBase.length) {
            const ids = hopsBase.map(h => h.HDONG_MA);

            // Lấy tất cả hợp đồng đã có ít nhất 1 CHI_TIET_SU_DUNG
            // (không giả định tên field trạng thái; chỉ cần biết tồn tại là đã "được xếp phòng")
            const ctsdExist = await prisma.cHI_TIET_SU_DUNG.findMany({
                where: { HDONG_MA: { in: ids } },
                select: { HDONG_MA: true },
                distinct: ['HDONG_MA'],
            });

            const assigned = new Set(ctsdExist.map(x => x.HDONG_MA));
            hops = hopsBase.filter(h => !assigned.has(h.HDONG_MA));
        }

        // 4) Map HĐ → CT_DAT_TRUOC để lễ tân thấy khách đặt loại phòng nào, bao nhiêu
        const ids = hops.map(h => h.HDONG_MA);
        const lines = ids.length
            ? await prisma.cT_DAT_TRUOC.findMany({
                where: { HDONG_MA: { in: ids } },
                select: {
                    CTDP_ID: true, HDONG_MA: true,
                    SO_LUONG: true, DON_GIA: true, TONG_TIEN: true, TRANG_THAI: true,
                    LOAI_PHONG: { select: { LP_MA: true, LP_TEN: true } },
                },
            })
            : [];

        const byHop = new Map();
        for (const l of lines) {
            if (!byHop.has(l.HDONG_MA)) byHop.set(l.HDONG_MA, []);
            byHop.get(l.HDONG_MA).push(l);
        }

        res.json({
            items: hops.map(h => ({ ...h, CT: byHop.get(h.HDONG_MA) || [] })),
            total: hops.length,
        });
    } catch (e) {
        next(e);
    }
});

/** Auto allocate: xếp phòng thật cho các dòng CT_DAT_TRUOC
 *  POST /admin/dat-truoc/:hdong/allocate
 *  body: { force?: boolean }  // force=true bỏ qua nếu đã allocated một phần (xếp bù phần thiếu)
 */
admin.post('/dat-truoc/:hdong/allocate', async (req, res, next) => {
    const hdong_ma = Number(req.params.hdong);
    const force = Boolean(req.body?.force);
    if (!Number.isInteger(hdong_ma)) return res.status(400).json({ message: 'HDONG_MA không hợp lệ' });

    try {
        const out = await prisma.$transaction(async (tx) => {
            // 1) Đọc HĐ + các dòng giữ chỗ
            const hd = await tx.hOP_DONG_DAT_PHONG.findUnique({
                where: { HDONG_MA: hdong_ma },
                select: {
                    HDONG_MA: true,
                    HDONG_NGAYDAT: true,
                    HDONG_NGAYTRA: true,
                    CT_DAT_TRUOC: { select: { CTDP_ID: true, LP_MA: true, SO_LUONG: true, TRANG_THAI: true } },
                },
            });
            if (!hd) throw new Error('Không tìm thấy hợp đồng');
            if (!hd.CT_DAT_TRUOC?.length) throw new Error('Hợp đồng không có dòng đặt trước');

            const fromDt = hd.HDONG_NGAYDAT;  // UTC đã lưu 07:00 check-in
            const toDt = hd.HDONG_NGAYTRA;  // UTC đã lưu 05:00 check-out

            const createdRooms = []; // để trả về

            // 2) Với mỗi LP_MA, tìm phòng còn trống trong khoảng và tạo CHI_TIET_SU_DUNG
            for (const row of hd.CT_DAT_TRUOC) {
                const lp = Number(row.LP_MA);
                const need = Number(row.SO_LUONG || 0);
                if (need <= 0) continue;

                // Nếu đã ALLOCATED toàn bộ và không force thì bỏ qua
                if (row.TRANG_THAI === 'ALLOCATED' && !force) continue;

                // Phòng đã được gán vào HĐ này (nếu force) => đếm để xếp bù
                const current = await tx.$queryRaw`
          SELECT COUNT(*) AS CNT
          FROM CHI_TIET_SU_DUNG CT
          JOIN PHONG P ON P.PHONG_MA = CT.PHONG_MA
          WHERE CT.HDONG_MA = ${hdong_ma} AND P.LP_MA = ${lp}
        `;
                const already = Number(current?.[0]?.CNT || 0);
                const remain = Math.max(0, need - already);
                if (remain === 0) continue;

                // Tìm danh sách phòng trống theo khoảng thời gian này
                const freeRooms = await tx.$queryRaw`
          SELECT P.PHONG_MA
          FROM PHONG P
          WHERE P.LP_MA = ${lp}
            AND P.PHONG_MA NOT IN (
              SELECT CT.PHONG_MA
              FROM CHI_TIET_SU_DUNG CT
              JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
              WHERE COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ${toDt}
                AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ${fromDt}
            )
          LIMIT ${remain}
        `;
                if (freeRooms.length < remain) {
                    throw new Error(`LP ${lp}: Không đủ phòng trống (cần ${remain}, còn ${freeRooms.length})`);
                }

                // Tạo CTSD cho danh sách phòng chọn được
                const data = freeRooms.map(r => ({
                    HDONG_MA: hdong_ma,
                    PHONG_MA: Number(r.PHONG_MA),
                    // tên cột dưới có thể khác chút tùy schema của bạn — chỉnh lại nếu cần:
                    CTSD_TRANG_THAI: 'ACTIVE',
                    CTSD_NGAY_BAT_DAU: fromDt,
                    CTSD_NGAY_KET_THUC: toDt,
                }));
                if (data.length) {
                    await tx.cHI_TIET_SU_DUNG.createMany({ data });
                    createdRooms.push(...data.map(d => d.PHONG_MA));
                }

                // Đánh dấu dòng CT_DAT_TRUOC đã ALLOCATED (khi đã đủ số lượng)
                await tx.cT_DAT_TRUOC.update({
                    where: { CTDP_ID: row.CTDP_ID },
                    data: { TRANG_THAI: 'ALLOCATED' },
                });
            }

            return { ok: true, rooms: createdRooms };
        });

        res.json(out);
    } catch (e) { next(e); }
});

/** Check-in nhanh: set trạng thái HĐ + mốc thời gian thực tế (optional)
 *  POST /admin/checkin/:hdong
 */
admin.post('/checkin/:hdong', async (req, res, next) => {
    try {
        const hdong_ma = Number(req.params.hdong);
        if (!Number.isInteger(hdong_ma)) return res.status(400).json({ message: 'HDONG_MA không hợp lệ' });

        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: hdong_ma },
            data: { HDONG_TRANG_THAI: 'CHECKED_IN', HDONG_NGAYTHUCNHAN: new Date() },
            select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_NGAYTHUCNHAN: true },
        });
        res.json(hd);
    } catch (e) { next(e); }
});

/** Check-out nhanh (chưa xuất hóa đơn cuối) — tùy bạn hoàn thiện
 *  POST /admin/checkout/:hdong
 */
admin.post('/checkout/:hdong', async (req, res, next) => {
    try {
        const hdong_ma = Number(req.params.hdong);
        if (!Number.isInteger(hdong_ma)) return res.status(400).json({ message: 'HDONG_MA không hợp lệ' });

        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: hdong_ma },
            data: { HDONG_TRANG_THAI: 'CHECKED_OUT', HDONG_NGAYTHUCTRA: new Date() },
            select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_NGAYTHUCTRA: true },
        });
        res.json(hd);
    } catch (e) { next(e); }
});

module.exports = admin;
