require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

(async () => {
    try {
        const result = await client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [{ text: "Hãy viết lời chào thân thiện cho khách khi đến khách sạn Wendy." }],
                },
            ],
        });

        const text = result.text;

        if (!text) {
            console.log("🧾 Raw response:", JSON.stringify(result, null, 2));
            console.log("❌ Lỗi: Không nhận được text. Xem raw response để kiểm tra lỗi API.");
        } else {
            console.log("✅ Phản hồi:", text);
        }
    } catch (err) {
        console.error("❌ Lỗi:", err.message);
    }
})();
