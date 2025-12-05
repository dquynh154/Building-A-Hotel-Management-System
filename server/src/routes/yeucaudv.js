const r = require("express").Router();
const { prisma } = require("../db/prisma");


r.get('/requests/pending/service', async (req, res) => {
    // 1. Truy vấn các bản ghi CTDV có trạng thái 'PENDING'
    const pendingRequests = await prisma.cHI_TIET_DICH_VU.findMany({
        where: {
            // CTDV_TRANGTHAI: 'PENDING', // ✅ Tìm kiếm theo trạng thái PENDING mới
            CTDV_FROM: "CHATBOT"      // chỉ lấy yêu cầu khách gửi
        },
        include: {
            HOP_DONG_DAT_PHONG: { include: { KHACH_HANG: true } },
            DICH_VU: true,
            PHONG: true, // Cần include PHONG để lấy PHONG_MA
        },
    });

    // 2. Định dạng lại dữ liệu cho Frontend (dùng CTDV_MA làm REQ_ID)
    const formattedRequests = pendingRequests.map(r => ({
        HDONG_MA: r.HDONG_MA,
        PHONG_MA: r.PHONG_MA,
        PHONG_TEN: r.PHONG?.PHONG_TEN,
        CTSD_STT: r.CTSD_STT,
        DV_MA: r.DV_MA,
        CTDV_STT: r.CTDV_STT,

        DICH_VU_TEN: r.DICH_VU.DV_TEN,
        KH_HOTEN: r.HOP_DONG_DAT_PHONG?.KHACH_HANG?.KH_HOTEN || `Khách hàng #${r.HOP_DONG_DAT_PHONG?.KH_MA || '??'}`,
        REQUEST_TIME: r.CTDV_NGAY,
        CTDV_TRANGTHAI: r.CTDV_TRANGTHAI,

    }));

    return res.json(formattedRequests);
});


// POST /public/requests/service/approve
r.post('/requests/service/approve', async (req, res) => {
    const { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } = req.body;


    // 1. Cập nhật trạng thái CTDV
    const updatedService = await prisma.cHI_TIET_DICH_VU.updateMany({
        where: {
            HDONG_MA,
            PHONG_MA,
            CTSD_STT,
            DV_MA,
            CTDV_STT // ✅ Dùng tất cả 5 khóa chính để xác định bản ghi
        },
        data: {
            CTDV_TRANGTHAI: 'ACTIVE',
            CTDV_HUY_LUC: null,
            // Thêm các trường ngày duyệt/NV duyệt nếu có
        },
    });

    // Nếu không tìm thấy
    if (updatedService.count === 0) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu dịch vụ cần duyệt." });
    }

    return res.json({ message: 'Yêu cầu dịch vụ đã được chấp nhận.' });
});

// POST /public/requests/service/reject
r.post('/requests/service/reject', async (req, res) => {
    const { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } = req.body;

    // 1. Cập nhật trạng thái CTDV
    const updatedService = await prisma.cHI_TIET_DICH_VU.updateMany({
        where: {
            HDONG_MA,
            PHONG_MA,
            CTSD_STT,
            DV_MA,
            CTDV_STT // ✅ Dùng tất cả 5 khóa chính để xác định bản ghi
        },
        data: {
            CTDV_TRANGTHAI: 'CANCELLED', // ✅ Từ chối => CANCELLED
            CTDV_HUY_LUC: new Date(),
            CTDV_HUY_LYDO: "Bị từ chối bởi Lễ tân.",
        },
    });

    if (updatedService.count === 0) {
        return res.status(404).json({ error: "Không tìm thấy yêu cầu dịch vụ cần từ chối." });
    }

    return res.json({ message: 'Yêu cầu dịch vụ đã bị từ chối.' });
});


// GET /requests/service/history
r.get('/requests/service/history', async (req, res) => {
    try {
        const requests = await prisma.cHI_TIET_DICH_VU.findMany({
            where: {
                CTDV_FROM: "CHATBOT"   // chỉ lấy yêu cầu khách gửi
            },
            include: {
                PHONG: true,
                DICH_VU: true,
                HOP_DONG_DAT_PHONG: { include: { KHACH_HANG: true } }
            },
            orderBy: { CTDV_NGAY: "desc" }
        });

        const formatted = requests.map(r => ({
            HDONG_MA: r.HDONG_MA,
            PHONG_MA: r.PHONG_MA,
            PHONG_TEN: r.PHONG?.PHONG_TEN,
            CTSD_STT: r.CTSD_STT,
            DV_MA: r.DV_MA,
            CTDV_STT: r.CTDV_STT,

            DICH_VU_TEN: r.DICH_VU.DV_TEN,
            KH_HOTEN: r.HOP_DONG_DAT_PHONG?.KHACH_HANG?.KH_HOTEN,
            REQUEST_TIME: r.CTDV_NGAY,
            CTDV_TRANGTHAI: r.CTDV_TRANGTHAI,
        }));

        res.json(formatted);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi tải lịch sử yêu cầu dịch vụ." });
    }
});

module.exports = r;