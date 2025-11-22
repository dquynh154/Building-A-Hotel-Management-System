const pub = require('express').Router();
const { prisma } = require('../db/prisma');
const crypto = require('crypto');
const qs = require('qs');
const { Prisma } = require('@prisma/client'); // <-- THÊM DÒNG NÀY để dùng Prisma.Decimal
const NV_MA_DEFAULT = Number(process.env.DEFAULT_NV_MA || 1);
const { VNP_TMN_CODE, VNP_HASH_SECRET, APP_URL, DEFAULT_NV_MA } = process.env;
const nodemailer = require('nodemailer');

// Helper: lấy giá theo ngày (HT_MA=1) tại ngày fromDt; ưu tiên SPECIAL, fallback BASE
async function getPriceForDay(tx, lpMa, atDateTime) {
    const sp = await tx.$queryRaw`
    SELECT MIN(g.DG_DONGIA) AS PRICE
    FROM DON_GIA g
    JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
    JOIN THOI_DIEM_SPECIAL s ON s.TD_MA = t.TD_MA
    WHERE g.HT_MA = 1
      AND g.LP_MA = ${lpMa}
      AND s.TD_NGAY_BAT_DAU <= ${atDateTime}
      AND s.TD_NGAY_KET_THUC >= ${atDateTime}
  `;
    let price = Number(sp?.[0]?.PRICE || 0);
    if (!price) {
        const base = await tx.$queryRaw`
      SELECT MIN(g.DG_DONGIA) AS PRICE
      FROM DON_GIA g
      JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
      JOIN THOI_DIEM_BASE b ON b.TD_MA = t.TD_MA
      WHERE g.HT_MA = 1
        AND g.LP_MA = ${lpMa}
    `;
        price = Number(base?.[0]?.PRICE || 0);
    }
    return price;
}
const pad = (n) => String(n).padStart(2, '0');

function makeCheckInUTC(ymd /* 'YYYY-MM-DD' */) {
    const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 7, 0, 0)); // 14:00 VN = 07:00 UTC
}
function makeCheckOutUTC(ymd /* 'YYYY-MM-DD' */) {
    const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 5, 0, 0)); // 12:00 VN = 05:00 UTC
}
function toSqlUTC(dt /* Date in UTC */) {
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}


// POST /public/dat-truoc/prepare
// body: { from:'YYYY-MM-DD', to:'YYYY-MM-DD', adults:number, items:[{lp_ma:number, qty:number}], guests:any }
// POST /public/dat-truoc/prepare
pub.post('/dat-truoc/prepare', async (req, res) => {
    try {
        // const { from, to, adults = 1, items = [], kh_ma } = req.body || {};
        const { from, to, adults = 1, items = [], kh_ma, stay_guests = [], ghi_chu } = req.body || {};
        if (!from || !to) return res.status(400).json({ message: 'from/to bắt buộc (YYYY-MM-DD)' });
        if (!kh_ma) return res.status(400).json({ message: 'Thiếu kh_ma (khách phải đăng nhập trước khi đặt)' });
        if (!Array.isArray(items) || items.length === 0)
            return res.status(400).json({ message: 'Danh sách loại phòng rỗng' });

        const checkinUtc = makeCheckInUTC(String(from).slice(0, 10));
        const checkoutUtc = makeCheckOutUTC(String(to).slice(0, 10));
        const fromDt = toSqlUTC(checkinUtc);   // 'YYYY-MM-DD HH:mm:ss' (UTC)
        const toDt = toSqlUTC(checkoutUtc);  // 'YYYY-MM-DD HH:mm:ss' (UTC)

        const nights = Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 86400000));
        const NV_MA_DEFAULT = Number(process.env.DEFAULT_NV_MA || 1);
        const tileCoc = Number(process.env.DEFAULT_DEPOSIT_RATE || 20); // % cọc (bạn đã dùng 50%)

        const out = await prisma.$transaction(async (tx) => {
            // 1) Kiểm tra tồn cho từng loại phòng
            for (const it of items) {
                const lp = Number(it.lp_ma);
                const need = Number(it.qty || 0);
                if (!lp || need <= 0) throw new Error(`Item không hợp lệ: ${JSON.stringify(it)}`);

                // tổng phòng theo loại
                const totalRow = await tx.$queryRaw`
          SELECT COUNT(*) AS TOTAL
          FROM PHONG WHERE LP_MA = ${lp}
        `;
                const TOTAL = Number(totalRow?.[0]?.TOTAL || 0);

                // phòng đã bận (đã gán vào CTSD) trong khoảng ngày
                const usedRow = await tx.$queryRaw`
          SELECT COUNT(DISTINCT P.PHONG_MA) AS USED
          FROM CHI_TIET_SU_DUNG CT
          JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
          JOIN PHONG P ON P.PHONG_MA = CT.PHONG_MA
          WHERE P.LP_MA = ${lp}
            AND H.HDONG_TRANG_THAI IN ('PENDING','CONFIRMED','CHECKED_IN')
            AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ${toDt}
            AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ${fromDt}
        `;
                const USED = Number(usedRow?.[0]?.USED || 0);

                // số lượng đã GIỮ CHỖ qua CT_DAT_TRUOC (join HĐ để lấy khoảng ngày)
                const heldRow = await tx.$queryRaw`
          SELECT COALESCE(SUM(CT.SO_LUONG),0) AS HELD
          FROM CT_DAT_TRUOC CT
          JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
          WHERE CT.LP_MA = ${lp}
            AND CT.TRANG_THAI IN ('CONFIRMED','ALLOCATED')
            AND H.HDONG_TRANG_THAI IN ('PENDING','CONFIRMED','CHECKED_IN') 
            AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ${toDt}
            AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ${fromDt}
        `;
                const HELD = Number(heldRow?.[0]?.HELD || 0);

                const AVAI = TOTAL - USED - HELD;
                if (AVAI < need) throw new Error(`Loại phòng ${lp} không đủ (còn ${AVAI}).`);
            }

            // 2) TÍNH GIÁ
            let total = 0;
            const details = [];
            for (const it of items) {
                const lp = Number(it.lp_ma);
                const qty = Number(it.qty || 0);
                const unit = await getPriceForDay(tx, lp, fromDt); // HT_MA=1
                const sub = unit * qty * nights;
                total += sub;
                details.push({ LP_MA: lp, QTY: qty, UNIT_PRICE: unit, SUBTOTAL: sub });
            }
            const deposit = Math.round(total * tileCoc / 100);

            // 3) TẠO HỢP ĐỒNG (đủ cột NOT NULL)
            const hopdong = await tx.hOP_DONG_DAT_PHONG.create({
                data: {
                    KHACH_HANG: { connect: { KH_MA: Number(kh_ma) } }, // bắt buộc: nested connect
                    HINH_THUC_THUE: { connect: { HT_MA: 1 } },    // hình thức giá: theo ngày
                    HDONG_NGAYDAT: checkinUtc,   // 07:00 UTC ~ 14:00 VN
                    HDONG_NGAYTRA: checkoutUtc,  // 05:00 UTC ~ 12:00 VN
                    HDONG_TONGTIENDUKIEN: new Prisma.Decimal(total),
                    HDONG_TILECOCAPDUNG: new Prisma.Decimal(tileCoc),
                    HDONG_TIENCOCYEUCAU: new Prisma.Decimal(deposit),
                    HDONG_TRANG_THAI: 'PENDING',
                    HDONG_GHICHU: ghi_chu || null,
                },
                select: { HDONG_MA: true },
            });

            if (Array.isArray(stay_guests) && stay_guests.length) {
                for (const g of stay_guests) {
                    if (g.role === 'guest_primary') {
                        let newKH;
                        const exist = await tx.kHACH_HANG.findFirst({
                            where: { KH_SDT: g.phone },
                            select: { KH_MA: true },
                        });
                        if (exist) newKH = exist;
                        else newKH = await tx.kHACH_HANG.create({
                            data: {
                                KH_HOTEN: `${g.firstName} ${g.lastName}`.trim(),
                                KH_SDT: g.phone || null,
                                KH_EMAIL: g.email || null,
                            },
                        });
                        await tx.lUU_TRU_KHACH.create({
                            data: {
                                HDONG_MA: hopdong.HDONG_MA,
                                KH_MA: newKH.KH_MA,
                                LA_KHACH_CHINH: true,
                                LA_KHACH_DAT: false,
                            },
                        });
                    } else if (g.role === 'booker_primary') {
                        // Người đăng nhập vừa là khách chính + khách đặt
                        await tx.lUU_TRU_KHACH.create({
                            data: {
                                HDONG_MA: hopdong.HDONG_MA,
                                KH_MA: Number(kh_ma),
                                LA_KHACH_CHINH: true,
                                LA_KHACH_DAT: true,
                            },
                        });
                    } else if (g.role === 'booker') {
                        // Người đặt (đặt cho người khác)
                        await tx.lUU_TRU_KHACH.create({
                            data: {
                                HDONG_MA: hopdong.HDONG_MA,
                                KH_MA: Number(kh_ma),
                                LA_KHACH_CHINH: false,
                                LA_KHACH_DAT: true,
                            },
                        });
                    }
                }
            }

            // 4) TẠO HÓA ĐƠN (đặt cọc)
            const invoice = await tx.hOA_DON.create({
                data: {
                    NV_MA: NV_MA_DEFAULT,
                    HDON_TONG_TIEN: new Prisma.Decimal(total),
                    HDON_GIAM_GIA: new Prisma.Decimal(0),
                    HDON_PHI: new Prisma.Decimal(0),
                    HDON_COC_DA_TRU: new Prisma.Decimal(0),
                    HDON_THANH_TIEN: new Prisma.Decimal(deposit),
                    HDON_TRANG_THAI: 'ISSUED',
                    HDON_LOAI: "DEPOSIT",
                    HDON_CHITIET_JSON: {
                        type: 'DEPOSIT',
                        hdong_ma: hopdong.HDONG_MA,
                        from, to, nights, adults,
                        deposit_rate: tileCoc,
                        items: items.map(it => {
                            const d = details.find(x => x.LP_MA === Number(it.lp_ma));
                            return {
                                lp_ma: Number(it.lp_ma),
                                qty: Number(it.qty),
                                unit_price: d?.UNIT_PRICE || 0,
                                subtotal: d?.SUBTOTAL || 0,
                            };
                        }),

                    },
                },
            });

            // 5) Link HĐ ↔ Hóa đơn
            await tx.hOA_DON_HOP_DONG.create({
                data: { HDON_MA: invoice.HDON_MA, HDONG_MA: hopdong.HDONG_MA },
            });

            // 6) Tạo bản ghi THANH_TOAN trạng thái INITIATED (để theo dõi)
            // const pay = await tx.tHANH_TOAN.create({
            //     data: {
            //         HDON_MA: invoice.HDON_MA,
            //         TT_PHUONG_THUC: 'GATEWAY',
            //         TT_NHA_CUNG_CAP: 'MOCK',
            //         TT_TRANG_THAI_GIAO_DICH: 'INITIATED',
            //         TT_SO_TIEN: new Prisma.Decimal(deposit),
            //     },
            // });

            return {
                hdon_ma: Number(invoice.HDON_MA),
                hdong_ma: Number(hopdong.HDONG_MA),
                // payment_id: Number(pay.TT_MA),
                nights,
                total: Number(total),
                deposit: Number(deposit),
            };
        });

        return res.json(out);
    } catch (e) {
        console.error('ERR /public/dat-truoc/prepare:', e);
        return res.status(500).json({ message: 'Lỗi máy chủ', detail: String(e?.message || e) });
    }
});


// GET /public/pay/status?txnRef=... | ?hdon_ma=...
pub.get('/pay/status', async (req, res, next) => {
    try {
        const { txnRef, hdon_ma } = req.query;
        let pay = null;

        if (txnRef) {
            pay = await prisma.tHANH_TOAN.findFirst({ where: { TT_MA_GIAO_DICH: String(txnRef) } });
        } else if (hdon_ma) {
            pay = await prisma.tHANH_TOAN.findFirst({
                where: { HDON_MA: Number(hdon_ma) },
                orderBy: { TT_MA: 'desc' },
            });
        }

        if (!pay) return res.json({ status: 'NOT_FOUND' });

        return res.json({
            status: pay.TT_TRANG_THAI_GIAO_DICH, // INITIATED | PAID | FAILED | ...
            hdon_ma: Number(pay.HDON_MA),
            txnRef: String(pay.TT_MA_GIAO_DICH || ''),
            amount: Number(pay.TT_SO_TIEN),
        });
    } catch (e) { next(e); }
});


pub.post('/pay/vnpay/create', async (req, res, next) => {
    try {
        const { hdon_ma, amount, returnUrl } = req.body;
        if (!hdon_ma) return res.status(400).json({ message: 'Thiếu HDON_MA' });
        // Fake gateway cho dev local
        if (process.env.PAY_GATEWAY === 'fake') {
            const vnp_TxnRef = 'FAKE_' + Date.now();

            // Tạo bản ghi thanh toán ở trạng thái INITIATED
            await prisma.tHANH_TOAN.create({
                data: {
                    HDON_MA: Number(hdon_ma),
                    TT_PHUONG_THUC: 'GATEWAY',
                    TT_NHA_CUNG_CAP: 'FAKE',
                    TT_TRANG_THAI_GIAO_DICH: 'INITIATED',
                    TT_SO_TIEN: new Prisma.Decimal(amount),
                    TT_MA_GIAO_DICH: vnp_TxnRef,
                    TT_GHI_CHU: 'Cọc FAKE',
                },
            });

            const pay_url = `${process.env.APP_URL || 'http://localhost:3000'}`
                + `/khachhang/pay-mock?hdon_ma=${encodeURIComponent(hdon_ma)}`
                + `&amount=${encodeURIComponent(amount)}`
                + `&return=${encodeURIComponent(returnUrl || `${process.env.APP_URL}/khachhang/dat-phong/ket-qua`)}`;

            return res.json({ pay_url });
        }
        const vnp_TmnCode = process.env.VNP_TMN_CODE;
        const vnp_HashSecret = process.env.VNP_HASH_SECRET;
        const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
        const vnp_ReturnUrl = returnUrl || `${process.env.APP_URL}/khachhang/dat-phong/ket-qua`;

        const vnp_TxnRef = String(Date.now()); // mã giao dịch của bạn
        const now = new Date();
        const ymdHMS = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

        let params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef,
            vnp_OrderInfo: `Coc hoa don ${hdon_ma}`,
            vnp_OrderType: 'other',
            vnp_Amount: Number(amount) * 100, // VNPay nhân 100
            vnp_ReturnUrl,
            vnp_IpAddr: (req.headers['x-forwarded-for'] || req.ip || '').toString().replace('::ffff:', '') || '127.0.0.1',
            vnp_CreateDate: ymdHMS,
        };

        // ký HMAC
        params = Object.keys(params).sort().reduce((o, k) => (o[k] = params[k], o), {});
        const signData = qs.stringify(params, { encode: false });
        if (!VNP_TMN_CODE || !VNP_HASH_SECRET) {
            return res.status(500).json({ message: 'Thiếu VNP_TMN_CODE hoặc VNP_HASH_SECRET (chưa nạp .env?)' });
        }
        params.vnp_SecureHash = crypto.createHmac('sha512', vnp_HashSecret).update(signData).digest('hex');

        const pay_url = vnp_Url + '?' + qs.stringify(params, { encode: false });

        // === GHI NHẬN GIAO DỊCH THEO SCHEMA CỦA BẠN ===
        // Lưu ý: enum của bạn cần có các giá trị phù hợp, ví dụ:
        // PHUONGTHUC_TT: ONLINE (hoặc VNPAY)
        // TRANGTHAI_TT : INITIATED | PENDING | PAID | FAILED | CANCELED (ít nhất có INITIATED/PAID/FAILED)
        await prisma.tHANH_TOAN.create({
            data: {
                HDON_MA: Number(hdon_ma),
                TT_PHUONG_THUC: 'GATEWAY',      // hoặc 'VNPAY' nếu enum có
                TT_NHA_CUNG_CAP: 'VNPAY',
                TT_TRANG_THAI_GIAO_DICH: 'INITIATED',
                TT_SO_TIEN: new Prisma.Decimal(amount),
                TT_MA_GIAO_DICH: vnp_TxnRef,   // map vào cột này
                TT_GHI_CHU: 'Cọc VNPay',
            },
        });

        // Trả về URL để FE redirect – không trả object Prisma (tránh lỗi serialize Decimal/BigInt)
        res.json({ pay_url });
    } catch (e) { next(e); }
});

// POST /public/pay/mock/confirm  { hdon_ma:number, success:boolean }
pub.post('/pay/mock/confirm', async (req, res, next) => {
    try {
        const { hdon_ma, success, email } = req.body || {};
        if (!hdon_ma) return res.status(400).json({ message: 'missing hdon_ma' });

        const last = await prisma.tHANH_TOAN.findFirst({
            where: { HDON_MA: Number(hdon_ma) },
            orderBy: { TT_MA: 'desc' },
        });
        if (!last) return res.status(404).json({ message: 'payment not found' });

        await prisma.tHANH_TOAN.update({
            where: { TT_MA: last.TT_MA },
            data: { TT_TRANG_THAI_GIAO_DICH: success ? 'SUCCEEDED' : 'FAILED' },
        });
        if (success) {
            const link = await prisma.hOA_DON_HOP_DONG.findFirst({
                where: { HDON_MA: Number(hdon_ma) }
            });

            // Lấy items từ hóa đơn để tạo CT_DAT_TRUOC
            const inv = await prisma.hOA_DON.findUnique({
                where: { HDON_MA: Number(hdon_ma) },
                select: { HDON_CHITIET_JSON: true }
            });
            const meta = inv?.HDON_CHITIET_JSON || {};
            console.log("DEBUG meta.items =", meta?.items);

            const nights = Number(meta?.nights || 1);
            const items = Array.isArray(meta?.items) ? meta.items : [];
            // 🔍 Bổ sung tên loại phòng từ DB
            const lpIds = items.map(it => Number(it.lp_ma)).filter(Boolean);

            let lpMap = {};
            if (lpIds.length > 0) {
                const loaiPhongs = await prisma.lOAI_PHONG.findMany({
                    where: { LP_MA: { in: lpIds } },
                    select: { LP_MA: true, LP_TEN: true },
                });
                lpMap = Object.fromEntries(loaiPhongs.map(lp => [lp.LP_MA, lp.LP_TEN]));
            }

            // Gắn thêm tên loại phòng vào từng item
            for (const it of items) {
                it.LP_TEN = lpMap[it.lp_ma] || "Không rõ";
            }

            const total = items.reduce((sum, it) => sum + (it.unit_price || 0) * (it.qty || 0) * nights, 0);

            if (link && items.length) {
                // Tạo CT_DAT_TRUOC cho từng loại đã đặt
                for (const it of items) {
                    const lp = Number(it.lp_ma);
                    const qty = Number(it.qty || 0);
                    const unit = Number(it.unit_price || 0);
                    await prisma.cT_DAT_TRUOC.create({
                        data: {
                            HDONG_MA: link.HDONG_MA,
                            LP_MA: lp,
                            SO_LUONG: qty,
                            DON_GIA: unit,
                            TONG_TIEN: unit * qty * nights,
                            TRANG_THAI: 'CONFIRMED', // hoặc 'ALLOCATED' tùy quy ước
                        },
                    });
                }

                // Cập nhật HĐ & HĐơn
                await prisma.hOP_DONG_DAT_PHONG.update({
                    where: { HDONG_MA: link.HDONG_MA },
                    data: { HDONG_TRANG_THAI: 'CONFIRMED' }, // đổi theo enum của bạn
                });
                await prisma.hOA_DON.update({
                    where: { HDON_MA: Number(hdon_ma) },
                    data: { HDON_TRANG_THAI: 'PAID', HDON_COC_DA_TRU: last.TT_SO_TIEN }, // cộng tiền cọc vào hóa đơn
                });
            }


            // === GỬI EMAIL XÁC NHẬN ===
            if (email) {
                const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
                    where: { HDONG_MA: link?.HDONG_MA },
                    include: { KHACH_HANG: true },
                });

                // ✅ Helper định dạng tiền
                const fmtVND = (n) => {
                    try {
                        return (n ?? 0).toLocaleString("vi-VN", {
                            style: "currency",
                            currency: "VND",
                        });
                    } catch {
                        return `${n} ₫`;
                    }
                };

                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: process.env.MAIL_USER,
                        pass: process.env.MAIL_PASS,
                    },
                });

                const name = booking?.KHACH_HANG?.KH_HOTEN || "Quý khách";
                const roomName = meta?.items?.map(it => it.LP_TEN).join(", ") || "Không rõ";
                const from = booking?.HDONG_NGAYDAT
                    ? new Date(booking.HDONG_NGAYDAT).toLocaleDateString("vi-VN")
                    : "—";
                const to = booking?.HDONG_NGAYTRA
                    ? new Date(booking.HDONG_NGAYTRA).toLocaleDateString("vi-VN")
                    : "—";
                const nights = meta?.nights || 1;
                const deposit = last.TT_SO_TIEN || 0;
                //const total = meta?.total || deposit;
                const sdt = booking?.KHACH_HANG?.KH_SDT || "-";

                const html = `
<div style="font-family:'Segoe UI',Roboto,sans-serif;background:#f8f8f8;padding:24px;">
  <div style="max-width:720px;margin:auto;background:#fff;border-radius:10px;overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:30px;">
              
    <div style="text-align:center;margin-bottom:12px;">
  <h2 style="margin:4px 0 2px 0;color:#004b91;font-size:22px;">Khách sạn Wendy</h2>
  <h3 style="margin:0;color:#222;font-weight:700;letter-spacing:0.5px;">PHIẾU ĐẶT PHÒNG</h3>
  <p style="margin:0;font-size:12px;color:#666;">ĐC:  Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ — SĐT: 0123456789</p>
</div>

    <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
    
<!-- Thông tin khách + ngày -->
<table style="width:100%;font-size:14px;margin-top:10px;border-collapse:collapse;">
  <tr>
    <!-- Cột trái -->
    <td style="vertical-align:top;padding:4px 0;">
      <p style="margin:4px 0;"><b>Khách hàng:</b> ${name}</p>
      <p style="margin:4px 0;"><b>SĐT:</b> ${sdt}</p>
    </td>

    <!-- Cột phải -->
    <td style="vertical-align:top;text-align:right;padding:4px 0;">
      <p style="margin:4px 0;"><b>Ngày nhận:</b> ${from}</p>
      <p style="margin:4px 0;"><b>Ngày trả:</b> ${to}</p>
    </td>
  </tr>
</table>



    <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #ccc;padding:8px;text-align:left;">Nội dung</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:center;">Số đêm</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:right;">Đơn giá</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:right;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(it => `
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">${it.name || it.LP_TEN || "Không rõ"}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">${nights}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">${fmtVND(it.unit_price)}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">${fmtVND((it.unit_price || 0) * (it.qty || 1) * nights)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <table style="width:100%;margin-top:20px;font-size:14px;">
      <tr>
        <td style="padding:6px 0;">Tiền cọc:</td>
        <td style="padding:6px 0;text-align:right;"><b style="color:#b3834c;">${fmtVND(Number(deposit))}</b></td>
      </tr>
      <tr>
        <td style="padding:6px 0;">Tổng tiền dự kiến:</td>
        <td style="padding:6px 0;text-align:right;"><b>${fmtVND(total)}</b></td>
      </tr>
    </table>

    <p style="margin-top:24px;font-size:13px;color:#555;">
      Nếu có thắc mắc, vui lòng liên hệ 
      <a href="mailto:wendyhotel.booking@gmail.com" style="color:#b3834c;text-decoration:none;">
        wendyhotel.booking@gmail.com
      </a>.
    </p>

    <p style="margin-top:24px;font-size:13px;color:#555;">
      Chúng tôi mong sớm được chào đón bạn tại Wendy Hotel!<br>
      — Đội ngũ hỗ trợ khách hàng Wendy Hotel
    </p>

    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
    <div style="text-align:center;font-size:12px;color:#888;">
      © 2025 Wendy Hotel — Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ<br>Hotline: 0123 456 789
    </div>
  </div>
</div>
`;



                await transporter.sendMail({
                    from: `"Wendy Hotel" <${process.env.MAIL_USER}>`,
                    to: email,
                    subject: "Xác nhận đặt phòng – Thanh toán cọc thành công",
                    html,
                });

                console.log(`✅ Đã gửi email xác nhận đến ${email}`);
            }
        }

        // TODO (tuỳ bạn): cập nhật HOP_DONG_DAT_PHONG/CT_DAT_TRUOC/HOA_DON cho khớp trạng thái
        return res.json({ ok: true });
    } catch (e) { next(e); }
});



// GET /public/loai-phong?take=6&skip=0
pub.get('/loai-phong', async (req, res, next) => {
    try {
        const take = Math.max(1, Math.min(50, Number(req.query.take) || 6));
        const skip = Math.max(0, Number(req.query.skip) || 0);

        const grouped = await prisma.pHONG.groupBy({
            by: ['LP_MA'],
            _count: { _all: true },
        });
        const countMap = Object.fromEntries(grouped.map(g => [g.LP_MA, g._count._all]));

        const rows = await prisma.lOAI_PHONG.findMany({
            where: { LP_TRANGTHAI: 'DANG_KINH_DOANH' },
            select: {
                LP_MA: true, LP_TEN: true, LP_SONGUOI: true, LP_TRANGTHAI: true,
                images: {
                    select: { URL: true, IS_MAIN: true, ORD: true },
                    orderBy: [{ IS_MAIN: 'desc' }, { ORD: 'asc' }, { URL: 'asc' }],
                    take: 1,
                },
            },
            orderBy: { LP_MA: 'asc' },
            take, skip,
        });

        res.json({
            items: rows.map(r => ({
                LP_MA: r.LP_MA,
                LP_TEN: r.LP_TEN,
                LP_SONGUOI: r.LP_SONGUOI,
                LP_TRANGTHAI: r.LP_TRANGTHAI,
                ROOM_COUNT: countMap[r.LP_MA] ?? 0,
                IMG_URL: r.images?.[0]?.URL || null,
            })),
        });
    } catch (e) { next(e); }
});

// GET /public/loai-phong-trong?from=YYYY-MM-DD&to=YYYY-MM-DD&adults=1&take=50&skip=0
// pub.get('/loai-phong-trong', async (req, res, next) => {
//     try {
//         const from = String(req.query.from || '').slice(0, 10);
//         const to = String(req.query.to || '').slice(0, 10);
//         const adults = Math.max(1, Number(req.query.adults || 1));
//         const take = Math.max(1, Math.min(50, Number(req.query.take) || 50));
//         const skip = Math.max(0, Number(req.query.skip) || 0);

//         if (!from || !to) return res.status(400).json({ message: 'from/to required (YYYY-MM-DD)' });

//         const rows = await prisma.$queryRawUnsafe(`
//   WITH
//   total_per_type AS (
//     SELECT LP.LP_MA, LP.LP_TEN, LP.LP_SONGUOI, LP.LP_TRANGTHAI,
//            COUNT(P.PHONG_MA) AS TOTAL_ROOMS
//     FROM LOAI_PHONG LP
//     JOIN PHONG P ON P.LP_MA = LP.LP_MA
//     WHERE LP.LP_TRANGTHAI = 'DANG_KINH_DOANH'
//       AND LP.LP_SONGUOI >= ?
//     GROUP BY LP.LP_MA, LP.LP_TEN, LP.LP_SONGUOI, LP.LP_TRANGTHAI
//   ),
//   occupied_by_range AS (
//     SELECT DISTINCT P.PHONG_MA, P.LP_MA
//     FROM CHI_TIET_SU_DUNG CTSD
//     JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CTSD.HDONG_MA
//     JOIN PHONG P ON P.PHONG_MA = CTSD.PHONG_MA
//     WHERE H.HDONG_TRANG_THAI NOT IN ('CANCELLED','NO_SHOW')
//       AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ?
//       AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ?
//   ),
//   cover_image AS (
//     SELECT i.LP_MA,
//            (SELECT ii.URL FROM LOAI_PHONG_IMAGE ii
//              WHERE ii.LP_MA = i.LP_MA
//              ORDER BY ii.IS_MAIN DESC, ii.ORD ASC, ii.IMG_ID ASC
//              LIMIT 1) AS IMG_URL
//     FROM LOAI_PHONG_IMAGE i
//     GROUP BY i.LP_MA
//   ),
//   /* GIÁ SPECIAL (HT_MA=1) nếu ngày 'from' nằm trong khoảng */
//   price_special AS (
//     SELECT g.LP_MA, MIN(g.DG_DONGIA) AS PRICE
//     FROM DON_GIA g
//     JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
//     JOIN THOI_DIEM_SPECIAL s ON s.TD_MA = t.TD_MA
//     WHERE g.HT_MA = 1
//       AND s.TD_NGAY_BAT_DAU <= ?
//       AND s.TD_NGAY_KET_THUC >= ?
//     GROUP BY g.LP_MA
//   ),
//   /* GIÁ BASE mặc định (HT_MA=1) nếu không có SPECIAL */
//   price_base AS (
//     SELECT g.LP_MA, MIN(g.DG_DONGIA) AS PRICE
//     FROM DON_GIA g
//     JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
//     JOIN THOI_DIEM_BASE b ON b.TD_MA = t.TD_MA
//     WHERE g.HT_MA = 1
//     GROUP BY g.LP_MA
//   )
//   SELECT
//     t.LP_MA, t.LP_TEN, t.LP_SONGUOI, t.LP_TRANGTHAI,
//     CAST(t.TOTAL_ROOMS - COALESCE(b.BOOKED_CNT, 0) AS UNSIGNED) AS ROOM_COUNT,
//     c.IMG_URL,
//     COALESCE(ps.PRICE, pb.PRICE) AS PRICE
//   FROM total_per_type t
//   LEFT JOIN (
//     SELECT LP_MA, COUNT(*) AS BOOKED_CNT
//     FROM occupied_by_range
//     GROUP BY LP_MA
//   ) b ON b.LP_MA = t.LP_MA
//   LEFT JOIN cover_image  c ON c.LP_MA  = t.LP_MA
//   LEFT JOIN price_special ps ON ps.LP_MA = t.LP_MA
//   LEFT JOIN price_base   pb ON pb.LP_MA = t.LP_MA
//   WHERE (t.TOTAL_ROOMS - COALESCE(b.BOOKED_CNT, 0)) > 0
//   ORDER BY t.LP_MA
//   LIMIT ? OFFSET ?;
// `,
//             Number(adults),
//             `${to} 00:00:00`, `${from} 00:00:00`,
//             `${from} 00:00:00`, `${from} 00:00:00`,
//             Number(take), Number(skip)
//         );



//         // BigInt -> Number để trả JSON an toàn
//         const items = rows.map(r =>
//             Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))
//         );
//         res.json({ items });
//     } catch (e) {
//         console.error('ERR /public/loai-phong-trong:', e);
//         res.status(500).json({ message: 'Lỗi máy chủ', detail: String(e?.message || e) });
//     }
// });

// GET /public/loai-phong-trong?from=YYYY-MM-DD&to=YYYY-MM-DD&adults=1&take=50&skip=0
pub.get('/loai-phong-trong', async (req, res, next) => {
    try {
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        const includeEmpty = String(req.query.includeEmpty || '').toLowerCase() === 'true';
        const adults = Math.max(1, Number(req.query.adults || 1));
        const take = Math.max(1, Math.min(50, Number(req.query.take) || 50));
        const skip = Math.max(0, Number(req.query.skip) || 0);
        if (!from || !to) return res.status(400).json({ message: 'from/to required (YYYY-MM-DD)' });

        const fromDt = `${from} 14:00:00`;
        const toDt = `${to} 12:00:00`;
        const whereClause = includeEmpty
            ? ''
            : 'WHERE (t.TOTAL_ROOMS - COALESCE(b.BOOKED_CNT, 0) - COALESCE(h.HELD, 0)) > 0';

        const rows = await prisma.$queryRawUnsafe(`
      WITH
      total_per_type AS (
        SELECT LP.LP_MA, LP.LP_TEN, LP.LP_SONGUOI, LP.LP_TRANGTHAI,
               COUNT(P.PHONG_MA) AS TOTAL_ROOMS
        FROM LOAI_PHONG LP
        JOIN PHONG P ON P.LP_MA = LP.LP_MA
        WHERE LP.LP_TRANGTHAI = 'DANG_KINH_DOANH'
          AND LP.LP_SONGUOI >= ${adults}
        GROUP BY LP.LP_MA, LP.LP_TEN, LP.LP_SONGUOI, LP.LP_TRANGTHAI
      ),
      occupied_by_range AS (
        SELECT DISTINCT P.PHONG_MA, P.LP_MA
        FROM CHI_TIET_SU_DUNG CTSD
        JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CTSD.HDONG_MA
        JOIN PHONG P ON P.PHONG_MA = CTSD.PHONG_MA
        WHERE H.HDONG_TRANG_THAI NOT IN ('CANCELLED','NO_SHOW')
          AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < '${toDt}'
          AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > '${fromDt}'
      ),
      held_qty AS (
        SELECT CT.LP_MA, COALESCE(SUM(CT.SO_LUONG),0) AS HELD
        FROM CT_DAT_TRUOC CT
        JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
        WHERE CT.TRANG_THAI IN ('CONFIRMED','ALLOCATED')
          AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < '${toDt}'
          AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > '${fromDt}'
        GROUP BY CT.LP_MA
      ),
      cover_image AS (
        SELECT i.LP_MA,
               (SELECT ii.URL FROM LOAI_PHONG_IMAGE ii
                 WHERE ii.LP_MA = i.LP_MA
                 ORDER BY ii.IS_MAIN DESC, ii.ORD ASC, ii.IMG_ID ASC
                 LIMIT 1) AS IMG_URL
        FROM LOAI_PHONG_IMAGE i
        GROUP BY i.LP_MA
      ),
      all_images AS (
  SELECT 
    LP_MA,
    CONCAT('[', GROUP_CONCAT(
      JSON_OBJECT('URL', URL)
      ORDER BY IS_MAIN DESC, ORD ASC SEPARATOR ','
    ), ']') AS IMAGE_LIST
  FROM LOAI_PHONG_IMAGE
  GROUP BY LP_MA
),
      price_special AS (
        SELECT g.LP_MA, MIN(g.DG_DONGIA) AS PRICE
        FROM DON_GIA g
        JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
        JOIN THOI_DIEM_SPECIAL s ON s.TD_MA = t.TD_MA
        WHERE g.HT_MA = 1
          AND s.TD_NGAY_BAT_DAU <= '${fromDt}'
          AND s.TD_NGAY_KET_THUC >= '${fromDt}'
        GROUP BY g.LP_MA
      ),
      price_base AS (
        SELECT g.LP_MA, MIN(g.DG_DONGIA) AS PRICE
        FROM DON_GIA g
        JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
        JOIN THOI_DIEM_BASE b ON b.TD_MA = t.TD_MA
        WHERE g.HT_MA = 1
        GROUP BY g.LP_MA
      )
      SELECT
        t.LP_MA, t.LP_TEN, t.LP_SONGUOI, t.LP_TRANGTHAI,
        CAST(t.TOTAL_ROOMS - COALESCE(b.BOOKED_CNT, 0) - COALESCE(h.HELD, 0) AS UNSIGNED) AS ROOM_COUNT,
        c.IMG_URL,ai.IMAGE_LIST,
        COALESCE(ps.PRICE, pb.PRICE) AS PRICE
      FROM total_per_type t
      LEFT JOIN (
        SELECT LP_MA, COUNT(*) AS BOOKED_CNT
        FROM occupied_by_range
        GROUP BY LP_MA
      ) b ON b.LP_MA = t.LP_MA
      LEFT JOIN held_qty    h ON h.LP_MA = t.LP_MA
      LEFT JOIN cover_image c ON c.LP_MA = t.LP_MA
      LEFT JOIN price_special ps ON ps.LP_MA = t.LP_MA
      LEFT JOIN price_base   pb ON pb.LP_MA = t.LP_MA
      LEFT JOIN all_images ai ON ai.LP_MA = t.LP_MA
      ${whereClause}
ORDER BY t.LP_MA

      LIMIT ${take} OFFSET ${skip};
    `);

        // BigInt -> Number để trả JSON an toàn
        const items = rows.map(r =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))
        );
        for (const r of items) {
            if (typeof r.IMAGE_LIST === 'string') {
                try {
                    r.LOAI_PHONG_IMAGE = JSON.parse(r.IMAGE_LIST).map(url => ({ URL: url }));
                } catch {
                    r.LOAI_PHONG_IMAGE = [];
                }
            } else {
                r.LOAI_PHONG_IMAGE = [];
            }
            delete r.IMAGE_LIST;
        }
        res.json({ items });
    } catch (e) {
        console.error('ERR /public/loai-phong-trong:', e);
        res.status(500).json({ message: 'Lỗi máy chủ', detail: String(e?.message || e) });
    }
});


// GET /public/loai-phong/:id/images
pub.get('/loai-phong/:id/images', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID không hợp lệ' });
        const imgs = await prisma.lOAI_PHONG_IMAGE.findMany({
            where: { LP_MA: id },
            select: { IMG_ID: true, URL: true, IS_MAIN: true, ORD: true },
            orderBy: [{ IS_MAIN: 'desc' }, { ORD: 'asc' }, { IMG_ID: 'asc' }],
        });
        res.json(imgs);
    } catch (e) { next(e); }
});


// GET /public/khachhang/my-bookings?kh_ma=...
// (Trong môi trường thật, lấy KH_MA từ token đăng nhập: req.guest?.KH_MA)
pub.get('/khachhang/my-bookings', async (req, res, next) => {
    try {
        const kh_ma = Number(req.guest?.KH_MA || req.query.kh_ma);
        if (!kh_ma) return res.status(401).json({ message: 'Chưa đăng nhập' });

        // 1) Lấy hợp đồng của KH
        const hops = await prisma.hOP_DONG_DAT_PHONG.findMany({
            where: { KH_MA: kh_ma },
            orderBy: { HDONG_TAO_LUC: 'desc' },
            select: {
                HDONG_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
                HDONG_TIENCOCYEUCAU: true,
                HDONG_TONGTIENDUKIEN: true,
                HDONG_TAO_LUC: true,
            },
        });

        const ids = hops.map(h => h.HDONG_MA);

        // 2) Lấy các dòng CT_DAT_TRUOC (khách đặt theo loại phòng)
        let ct = [];
        if (ids.length) {
            ct = await prisma.cT_DAT_TRUOC.findMany({
                where: { HDONG_MA: { in: ids } },
                select: {
                    CTDP_ID: true, HDONG_MA: true,
                    SO_LUONG: true, DON_GIA: true, TONG_TIEN: true, TRANG_THAI: true,
                    LOAI_PHONG: { select: { LP_MA: true, LP_TEN: true } },
                },
            });
        }
        const ctMap = new Map();
        for (const row of ct) {
            if (!ctMap.has(row.HDONG_MA)) ctMap.set(row.HDONG_MA, []);
            ctMap.get(row.HDONG_MA).push(row);
        }

        // 3) Lấy hóa đơn "DEPOSIT" gắn với HĐ (chọn hóa đơn mới nhất, ưu tiên hóa đơn chưa PAID)
        let depRows = [];
        if (ids.length) {
            const idList = ids.join(',');
            const q = `
        SELECT hh.HDONG_MA, h.HDON_MA, h.HDON_TRANG_THAI, h.HDON_THANH_TIEN
        FROM HOA_DON_HOP_DONG hh
        JOIN HOA_DON h ON h.HDON_MA = hh.HDON_MA
        WHERE hh.HDONG_MA IN (${idList})
          AND JSON_UNQUOTE(JSON_EXTRACT(h.HDON_CHITIET_JSON,'$.type')) = 'DEPOSIT'
        ORDER BY h.HDON_MA DESC
      `;
            depRows = await prisma.$queryRawUnsafe(q);
        }
        const depMap = new Map(); // map HDONG_MA -> deposit invoice row
        for (const r of depRows) {
            const k = Number(r.HDONG_MA);
            // Lấy cái đầu tiên chưa PAID; nếu không có thì giữ cái mới nhất
            if (!depMap.has(k)) depMap.set(k, r);
            const cur = depMap.get(k);
            if (cur.HDON_TRANG_THAI === 'PAID' && r.HDON_TRANG_THAI !== 'PAID') {
                depMap.set(k, r);
            }
        }

        res.json({
            items: hops.map(h => ({
                ...h,
                CT: ctMap.get(h.HDONG_MA) || [],
                DEPOSIT_INVOICE: depMap.get(h.HDONG_MA) || null,
            })),
        });
    } catch (e) { next(e); }
});

// GET /public/hoa-don/:id
pub.get('/hoa-don/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const inv = await prisma.hOA_DON.findUnique({
            where: { HDON_MA: id },
            include: {
                LIEN_KET: {
                    include: {
                        HOP_DONG_DAT_PHONG: {
                            include: {
                                KHACH_HANG: true,
                                CT_DAT_TRUOC: { include: { LOAI_PHONG: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        const hd = inv.LIEN_KET?.[0]?.HOP_DONG_DAT_PHONG;
        res.json({
            ...inv,
            HOP_DONG_DAT_PHONG: hd || null,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Lỗi máy chủ', detail: String(e) });
    }
});

// POST /public/khachhang/cancel-booking
pub.post('/khachhang/cancel-booking', async (req, res, next) => {
    try {
        const { kh_ma, hdong_ma } = req.body || {};
        if (!kh_ma || !hdong_ma)
            return res.status(400).json({ message: 'Thiếu mã khách hoặc mã hợp đồng' });

        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: Number(hdong_ma) },
            select: { KH_MA: true, HDONG_TRANG_THAI: true },
        });

        if (!hd)
            return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        if (hd.KH_MA !== Number(kh_ma))
            return res.status(403).json({ message: 'Bạn không có quyền huỷ hợp đồng này' });
        if (['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].includes(hd.HDONG_TRANG_THAI))
            return res.status(400).json({ message: 'Không thể huỷ hợp đồng ở trạng thái hiện tại' });

        // cập nhật trạng thái
        let note = 'Khách huỷ đặt phòng';
        if (hd.HDONG_TRANG_THAI === 'CONFIRMED')
            note = 'Khách huỷ – giữ lại tiền cọc';

        const updated = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: Number(hdong_ma) },
            data: { HDONG_TRANG_THAI: 'CANCELLED', HDONG_GHICHU: note },
        });

        // (tùy chọn) cập nhật hóa đơn nếu cần
        await prisma.hOA_DON.updateMany({
            where: { HDONG_MA: Number(hdong_ma) },
            data: { HDON_TRANG_THAI: 'VOID' },
        });

        res.json({ ok: true, updated });
    } catch (e) {
        console.error('ERR /public/khachhang/cancel-booking', e);
        next(e);
    }
});

// POST /public/khachhang/review
// POST /public/khachhang/review
pub.post('/khachhang/review', async (req, res, next) => {
    try {
        const { kh_ma, hdong_ma, ctdp_id, sao, tieu_de, noi_dung, dinh_kem = [] } = req.body || {};

        const KH_MA = Number(kh_ma);
        const HDONG_MA = Number(hdong_ma);
        const CTDP_ID = ctdp_id ? Number(ctdp_id) : null;
        const STARS = Number(sao);

        if (!KH_MA || !HDONG_MA) return res.status(400).json({ message: 'Thiếu kh_ma hoặc hdong_ma' });
        if (!Number.isFinite(STARS) || STARS < 1 || STARS > 5) return res.status(400).json({ message: 'Số sao phải 1–5' });
        if (!tieu_de?.trim()) return res.status(400).json({ message: 'Thiếu tiêu đề đánh giá' });

        // 1) Quyền + trạng thái
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA },
            select: { KH_MA: true, HDONG_TRANG_THAI: true },
        });
        if (!hd || hd.KH_MA !== KH_MA) return res.status(403).json({ message: 'Bạn không có quyền đánh giá đơn này' });
        if (hd.HDONG_TRANG_THAI !== 'CHECKED_OUT')
            return res.status(400).json({ message: 'Chỉ đánh giá hợp đồng đã trả phòng' });

        // 2) Nếu có CTDP_ID, xác thực thuộc đúng hợp đồng
        if (CTDP_ID) {
            const ct = await prisma.cT_DAT_TRUOC.findUnique({
                where: { CTDP_ID },
                select: { HDONG_MA: true },
            });
            if (!ct || ct.HDONG_MA !== HDONG_MA)
                return res.status(403).json({ message: 'Chi tiết đặt phòng không thuộc hợp đồng này' });
        }

        // 3) Kiểm tra đã có đánh giá chưa
        const existed = await prisma.dANH_GIA.findFirst({
            where: { HDONG_MA, CTDP_ID: CTDP_ID ?? null, KH_MA },
            select: { DG_MA: true },
        });
        if (existed) {
            return res.status(400).json({
                message: CTDP_ID ? 'Bạn đã đánh giá loại phòng này rồi' : 'Bạn đã đánh giá tổng thể đơn này rồi',
            });
        }

        // 4) Tạo đánh giá + đính kèm (dùng create thay vì nested createMany)
        const review = await prisma.dANH_GIA.create({
            data: {
                KH_MA: KH_MA,
                HDONG_MA: HDONG_MA,
                CTDP_ID: CTDP_ID,
                DG_SAO: STARS,
                DG_TIEU_DE: tieu_de.trim(),
                DG_NOI_DUNG: noi_dung || null,
                DG_TRANG_THAI: 'PUBLISHED',
                DINH_KEMS: {
                    create: (Array.isArray(dinh_kem) ? dinh_kem : [])
                        .filter(f => f?.url)
                        .map(f => ({
                            DKDG_LOAI: f.loai || 'IMAGE',
                            DKDG_URL: f.url,
                            DKDG_CHUTHICH: f.ghi_chu || null,
                        })),
                },
            },
            include: { DINH_KEMS: true },
        });

        res.json({ ok: true, review });
    } catch (e) {
        // Log rõ mã Prisma để soi nhanh (P2002 unique, P2003 FK, ...)
        console.error('ERR /public/khachhang/review:', e.code, e.meta, e.message);
        next(e);
    }
});


const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 📂 tạo thư mục nếu chưa có
const uploadDir = path.resolve(__dirname, '../../uploads/review');
fs.mkdirSync(uploadDir, { recursive: true });

// cấu hình lưu file
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueName}${ext}`);
    },
});

const upload = multer({ storage });

// ✅ API upload hình đánh giá
pub.post('/upload-review', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Chưa có file' });

        // tạo URL công khai
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/review/${req.file.filename}`;
        res.json({ ok: true, url: fileUrl });
    } catch (e) {
        next(e);
    }
});
// GET /public/khachhang/reviews?kh_ma=...
pub.get('/khachhang/reviews', async (req, res, next) => {
    try {
        const kh_ma = Number(req.query.kh_ma);
        if (!kh_ma) return res.status(400).json({ message: 'Thiếu kh_ma' });

        const rows = await prisma.dANH_GIA.findMany({
            where: { KH_MA: kh_ma },
            select: { HDONG_MA: true, CTDP_ID: true, DG_SAO: true, DG_TIEU_DE: true, DG_TAO_LUC: true },
        });

        res.json({ items: rows });
    } catch (e) {
        next(e);
    }
});

// GET /public/khachhang/review-detail?hdong_ma=... [&kh_ma=...]
pub.get('/khachhang/review-detail', async (req, res, next) => {
    try {
        const hdong_ma = Number(req.query.hdong_ma);
        const kh_ma = Number(req.guest?.KH_MA || req.query.kh_ma || 0); // tùy bạn có cần ràng buộc chủ sở hữu không
        if (!hdong_ma) return res.status(400).json({ message: 'Thiếu hdong_ma' });

        // Tổng thể (CTDP_ID = null)
        const overall = await prisma.dANH_GIA.findFirst({
            where: { HDONG_MA: hdong_ma, ...(kh_ma ? { KH_MA: kh_ma } : {}), CTDP_ID: null },
            select: {
                DG_MA: true, DG_SAO: true, DG_TIEU_DE: true, DG_NOI_DUNG: true, DG_TAO_LUC: true
            },
        });

        // Các đánh giá theo từng CTDP_ID + lấy tên loại phòng
        const rows = await prisma.$queryRawUnsafe(`
      SELECT dg.CTDP_ID, dg.DG_SAO, dg.DG_TIEU_DE, dg.DG_NOI_DUNG, dg.DG_TAO_LUC,
             ct.LP_MA, lp.LP_TEN
      FROM DANH_GIA dg
      LEFT JOIN CT_DAT_TRUOC ct ON ct.CTDP_ID = dg.CTDP_ID
      LEFT JOIN LOAI_PHONG   lp ON lp.LP_MA   = ct.LP_MA
      WHERE dg.HDONG_MA = ${hdong_ma}
        ${kh_ma ? `AND dg.KH_MA = ${kh_ma}` : ``}
        AND dg.CTDP_ID IS NOT NULL
      ORDER BY dg.DG_TAO_LUC DESC
    `);

        res.json({ overall: overall || null, rooms: rows || [] });
    } catch (e) { next(e); }
});

// =====================
// GET /public/danh-gia
// =====================
pub.get('/danh-gia', async (req, res, next) => {
    try {
        const take = Math.max(1, Math.min(50, Number(req.query.take) || 10));
        const page = Math.max(1, Number(req.query.page) || 1);
        const skip = (page - 1) * take;

        const order = (req.query.order || 'desc').toString().toLowerCase() === 'asc' ? 'asc' : 'desc';
        const status = (req.query.status || 'PUBLISHED').toString();

        const stars = req.query.stars ? Number(req.query.stars) : null; // lọc đúng số sao
        const minStars = req.query.minStars ? Number(req.query.minStars) : null; // hoặc từ sao trở lên
        const hasText = (req.query.hasText || '') === '1';
        const hasMedia = (req.query.hasMedia || '') === '1';
        const q = (req.query.q || '').toString().trim();
        const hdong_ma = req.query.hdong_ma ? Number(req.query.hdong_ma) : null;

        // where an toàn: chỉ bám theo field của bảng DANH_GIA để tránh sai tên quan hệ
        const where = {
            DG_TRANG_THAI: status,
            ...(hdong_ma ? { HDONG_MA: hdong_ma } : {}),
            ...(stars && stars >= 1 && stars <= 5 ? { DG_SAO: stars } : {}),
            ...(minStars && minStars >= 1 && minStars <= 5 ? { DG_SAO: { gte: minStars } } : {}),
            ...(hasText ? { DG_NOI_DUNG: { not: null, notIn: [''] } } : {}),
            ...(hasMedia ? { DINH_KEMS: { some: {} } } : {}),
            ...(q ? {
                OR: [
                    { DG_TIEU_DE: { contains: q } },
                    { DG_NOI_DUNG: { contains: q } },
                ]
            } : {}),
        };

        // lấy danh sách DANH_GIA + đính kèm
        const [rows, total] = await Promise.all([
            prisma.dANH_GIA.findMany({
                where,
                orderBy: { DG_TAO_LUC: order },
                skip,
                take,
                select: {
                    DG_MA: true, DG_SAO: true, DG_TIEU_DE: true, DG_NOI_DUNG: true, DG_TAO_LUC: true,
                    KH_MA: true, CTDP_ID: true, HDONG_MA: true,
                    // lấy đính kèm từ relation plural bạn đã dùng khi create: DINH_KEMS
                    DINH_KEMS: {
                        select: { DKDG_URL: true, DKDG_LOAI: true, DKDG_CHUTHICH: true }
                    },
                    PHAN_HOI: {
                        select: {
                            PH_NOIDUNG: true,
                            PH_TRANG_THAI: true,
                            PH_TAO_LUC: true,
                            PH_SUA_LUC: true,
                            NHAN_VIEN: { select: { NV_HOTEN: true } },
                        },
                    },
                },  
            }),
            prisma.dANH_GIA.count({ where })
        ]);

        // map KH tên + avatar (khỏi join raw)
        const khIds = [...new Set(rows.map(r => r.KH_MA).filter(Boolean))];
        const khs = khIds.length
            ? await prisma.kHACH_HANG.findMany({
                where: { KH_MA: { in: khIds } },
                select: { KH_MA: true, KH_HOTEN: true }
            })
            : [];
        const khMap = new Map(khs.map(k => [k.KH_MA, k]));

        // map tên loại phòng qua CTDP_ID
        const ctdpIds = [...new Set(rows.map(r => r.CTDP_ID).filter(Boolean))];
        const cts = ctdpIds.length
            ? await prisma.cT_DAT_TRUOC.findMany({
                where: { CTDP_ID: { in: ctdpIds } },
                select: {
                    CTDP_ID: true,
                    LOAI_PHONG: { select: { LP_TEN: true } }
                }
            })
            : [];
        const lpMap = new Map(cts.map(ct => [ct.CTDP_ID, ct.LOAI_PHONG?.LP_TEN || null]));

        // dựng output phẳng cho FE
        const items = rows.map((r) => {
            // chỉ expose phản hồi nếu đã PUBLISHED
            let REPLY = null;
            if (r.PHAN_HOI && r.PHAN_HOI.PH_TRANG_THAI === 'PUBLISHED') {
                REPLY = {
                    content: r.PHAN_HOI.PH_NOIDUNG,
                    status: r.PHAN_HOI.PH_TRANG_THAI,
                    createdAt: r.PHAN_HOI.PH_TAO_LUC,
                    updatedAt: r.PHAN_HOI.PH_SUA_LUC,
                    staffName: r.PHAN_HOI.NHAN_VIEN?.NV_HOTEN || null,
                };
            }

            return {
                DG_MA: r.DG_MA,
                DG_SAO: r.DG_SAO,
                DG_TIEU_DE: r.DG_TIEU_DE,
                DG_NOI_DUNG: r.DG_NOI_DUNG,
                HDONG_MA: r.HDONG_MA,
                DG_TAO_LUC: r.DG_TAO_LUC,
                KH_TEN: khMap.get(r.KH_MA)?.KH_HOTEN || null,
                LP_TEN: lpMap.get(r.CTDP_ID) || null,
                DINH_KEM_DANH_GIA: r.DINH_KEMS, // FE đang normalize key này
                REPLY,                           // 👈 FE sẽ đọc để hiển thị phản hồi
            };
        });

        res.json({ items, total });
    } catch (e) {
        console.error('ERR GET /public/danh-gia:', e);
        res.status(500).json({ message: 'Server error at /public/danh-gia', error: String(e?.message || e) });
    }
});

// ===========================
// GET /public/danh-gia/summary
// ===========================
pub.get('/danh-gia/summary', async (req, res) => {
    try {
        const status = (req.query.status || 'PUBLISHED').toString();
        const where = { DG_TRANG_THAI: status };

        const [avgObj, byStars, withText, withMedia] = await Promise.all([
            prisma.dANH_GIA.aggregate({
                _avg: { DG_SAO: true },
                where
            }),
            prisma.dANH_GIA.groupBy({
                by: ['DG_SAO'],
                _count: { _all: true },
                where
            }),
            prisma.dANH_GIA.count({
                where: { ...where, DG_NOI_DUNG: { not: null, notIn: [''] } }
            }),
            prisma.dANH_GIA.count({
                where: { ...where, DINH_KEMS: { some: {} } }
            }),
        ]);

        /** @type {{[k:number]: number}} */
        const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        byStars.forEach(g => {
            const s = Number(g.DG_SAO);
            if (s >= 1 && s <= 5) result[s] = g._count._all;
        });

        res.json({
            avg: Number(avgObj._avg.DG_SAO || 0),
            byStars: result,
            withText,
            withMedia
        });
    } catch (e) {
        console.error('ERR GET /public/danh-gia/summary:', e);
        res.status(500).json({ message: 'Server error at /public/danh-gia/summary' });
    }
});




module.exports = pub;
