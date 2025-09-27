// module.exports = (err, req, res, next) => {
//     // Prisma unique constraint
//     if (err?.code === 'P2002') {
//         return res.status(409).json({ message: `Duplicate: ${err.meta?.target?.join(', ')}` });
//     }
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
// };


module.exports = (err, req, res, next) => {
    // Log server (đủ để debug)
    console.error('[ERROR]', err);

    // 1) Lỗi do bạn chủ động ném: cho phép set status/message tuỳ ý
    if (err && err.status) {
        return res.status(err.status).json({ message: err.message || 'Error' });
    }

    // 2) Một số lỗi Prisma hay gặp
    if (err?.code === 'P2002') {
        // Unique constraint
        return res
            .status(409)
            .json({ message: `Duplicate: ${err.meta?.target?.join(', ')}` });
    }
    if (err?.code === 'P2025') {
        // Record not found
        return res.status(404).json({ message: 'Record not found' });
    }

    // 3) (tuỳ chọn) Zod validation
    if (err?.name === 'ZodError') {
        return res.status(400).json({
            message: 'Validation error',
            errors: err.issues?.map(i => ({ path: i.path, message: i.message })) || []
        });
    }

    // 4) Mặc định
    return res.status(500).json({ message: err?.message || 'Server error' });
};
