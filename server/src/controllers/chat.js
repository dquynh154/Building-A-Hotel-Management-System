const { prisma } = require("../db/prisma");
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

exports.newSession = async (_req, res) => {
    const s = await prisma.chatSession.create({ data: {} });
    res.json({ sessionId: s.id });
};

exports.sendMessage = async (req, res) => {
    const { sessionId, message } = req.body;
    console.log("📩 Nhận tin nhắn từ FE:", { sessionId, message }); 
    if (!sessionId || !message) return res.status(400).json({ message: "Missing fields" });

    await prisma.chatMessage.create({ data: { sessionId, role: "user", content: message } });

    // Gọi LLM (tạm: endpoint giả)
    const prompt = `Bạn là trợ lý lễ tân khách sạn, trả lời ngắn gọn, lịch sự.\nCâu hỏi: ${message}`;
    let answer = "Xin lỗi, tôi chưa trả lời được câu này.";
    try {
        const r = await fetch(process.env.LLM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.LLM_API_KEY}` },
            body: JSON.stringify({ prompt })
        });
        const data = await r.json();
        answer = data.text || answer;
    } catch { }
    await prisma.chatMessage.create({ data: { sessionId, role: "assistant", content: answer } });
    res.json({ reply: answer });
};

exports.history = async (req, res) => {
    const { sessionId } = req.query;
    const msgs = await prisma.chatMessage.findMany({ where: { sessionId: Number(sessionId) }, orderBy: { createdAt: "asc" } });
    res.json(msgs);
};
