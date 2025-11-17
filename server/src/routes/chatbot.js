const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { prisma } = require('../db/prisma');
const { getAvailableRoomCount, getRoomPrice } = require('../services/roomService');

const router = express.Router();

// ===== Khởi tạo client Gemini mới =====
const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// ===== Model ID =====
const MODEL_ID = "gemini-2.5-flash";

console.log("✅ Chatbot route loaded - using Gemini 2.5 Flash API (v1.29.0)");


// D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js

// ... (các require khác)

const MAX_RETRIES = 3;
const DELAY_MS = 2000; // 2 giây chờ ban đầu

/**
 * Gọi API Gemini với cơ chế thử lại (retry) khi gặp lỗi 503/429.
 */
async function callGeminiWithRetry(params) {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            console.log(`🌀 Thử gọi Gemini API (Lần ${i + 1}/${MAX_RETRIES})...`);
            // Gọi hàm API chính
            const result = await client.models.generateContent(params);
            return result; // Thành công, thoát khỏi vòng lặp và trả về kết quả

        } catch (error) {
            // Kiểm tra lỗi 503 (Overloaded) hoặc 429 (Rate Limit)
            if (error.status === 503 || error.status === 429) {
                console.warn(`⚠️ Gemini bị quá tải (${error.status}). Đang chờ ${DELAY_MS * (i + 1)}ms trước khi thử lại...`);
                // Chờ đợi (delay) tăng dần
                await new Promise(resolve => setTimeout(resolve, DELAY_MS * (i + 1)));
            } else {
                // Nếu là lỗi khác (ví dụ: 400 Bad Request, 401 Unauthorized), thì ném lỗi ngay
                throw error;
            }
        }
    }
    // Nếu thất bại sau tất cả các lần thử
    throw new Error("API Gemini vẫn bị quá tải sau nhiều lần thử. Vui lòng thử lại sau.");
}

// ... (Router.post ở dưới)
router.post("/message", async (req, res) => {
    console.log("📥 Nhận request từ frontend:", req.body);
    let session = null;
    try {
        const { message, sessionId } = req.body;
        if (!message) return res.status(400).json({ error: "Thiếu message" });

        // 1. Đảm bảo session tồn tại (tạo mới nếu chưa có)
        session = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        });

        if (!session) {
            console.warn(`⚠️ Session ${sessionId} không tồn tại, tạo session mới...`);
            session = await prisma.chatSession.create({
                data: {
                    //id: sessionId, // <-- Phải thêm ID nếu bạn đang sử dụng ID từ Frontend
                    guestId: 1,
                    startedAt: new Date(),
                },
            });
        }

        // 2. Lấy lịch sử hội thoại
        const history = await prisma.chatMessage.findMany({
            where: { sessionId: session.id },
            orderBy: { createdAt: "asc" },
            take: 10,
        });

        // 3. Prompt hệ thống (MỚI: Dùng config.systemInstruction)
        // D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js

        const systemPrompt = `
    Bạn là trợ lý ảo của khách sạn Wendy Hotel.

    [THÔNG TIN KHÁCH SẠN CỨNG]:
    - **Phòng Tiêu Chuẩn:** Diện tích 20m², 1 giường Queen size. Có máy sấy tóc, Smart TV, Tủ lạnh mini, Điều hòa, Bàn làm việc . Phù hợp cho 2 người.
    - **Phòng 2 Giường Đơn:** Diện tích 25m², 2 giường đơn. Có tủ quần áo, bình đun nước, Tủ lạnh, Máy sấy tóc, Smart TV. Tối đa 2 người .
    - **Phòng Sang Trọng Giường Đôi:** Diện tích 40m², 2 giường King size. Có tủ quần áo, bình đun nước, Tủ lạnh, Máy sấy tóc, Smart TV. Tối đa 4 người, phù hợp cho nhóm bạn hoặc gia đình nhỏ. Có kèm bữa sáng.
    - **Tiện ích Khách sạn:** Có hồ bơi ngoài trời, Wifi tốc độ cao, và dịch vụ giặt là (có tính phí).

    [QUY TẮC SỬ DỤNG TOOLS]:
    - Khi khách hỏi về phòng trống, hãy gọi hàm "check_room_availability" với tham số (**date_from**, **date_to**, room_type).
    - Đảm bảo định dạng ngày là yyyy-mm-dd. **Nếu khách chỉ hỏi 1 ngày (ví dụ: ngày 13/11), hãy đặt date_from là 2025-11-13 và date_to là 2025-11-14 (ngày tiếp theo).**
    - Khi khách hỏi có bao nhiêu loại phòng thì là 3 loại: "Phòng tiêu chuẩn", "Phòng 2 giường đơn", "Phòng sang trọng giường đôi".
    - Khi khách hỏi về **giá** hoặc **chi phí** phòng, hãy gọi hàm "**check_room_price**" (**room_type**).
    - Khi khách hỏi về mô tả, tiện ích, hoặc dịch vụ, hãy ưu tiên trả lời dựa trên phần [THÔNG TIN KHÁCH SẠN CỨNG] trên.
    - Cái gì không có trong phạm vi chức năng của bạn, đừng cố trả lời, đừng bịa ra thông tin.
`;

        // Gom toàn bộ hội thoại
        const contents = [
            ...history.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            })),
            { role: "user", parts: [{ text: message }] },
        ];

        // 4. Khai báo tools (function calling)
        const tools = [{
            functionDeclarations: [{
                name: "check_room_availability",
                description: "Kiểm tra số lượng phòng trống theo khoảng ngày và loại phòng",
                parameters: {
                    type: "object",
                    properties: {
                        date_from: { type: "string", description: "Ngày bắt đầu kiểm tra (yyyy-mm-dd)" },
                        date_to: { type: "string", description: "Ngày kết thúc kiểm tra (yyyy-mm-dd)" }, // ✅ THÊM date_to
                        room_type: { type: "string" },
                    },
                    required: ["date_from", "date_to", "room_type"], // ✅ CẬP NHẬT required
                },
            },
            {
                name: "check_room_price",
                description: "Kiểm tra giá phòng theo loại phòng (Hình thức thuê: Ngày, Thời điểm: Cơ bản).",
                parameters: {
                    type: "object",
                    properties: {
                        room_type: { type: "string", description: "Tên loại phòng bằng tiếng Việt" },
                    },
                    required: ["room_type"], // Chỉ cần room_type
                },
            }
            ],
        }];
        const roomCheckSchema = {
            type: "object",
            properties: {
                function_call: {
                    type: "object",
                    description: "Chứa lời gọi hàm check_room_availability.",
                    // Cấu trúc nội bộ của function_call tương tự như Gemini trả về
                    properties: {
                        name: { type: "string" },
                        args: {
                            type: "object",
                            // 🚨 ĐÃ SỬA: Phải định nghĩa các thuộc tính bên trong 'args'
                            properties: {
                                date_from: { type: "string", description: "Ngày bắt đầu, định dạng yyyy-mm-dd" },
                                date_to: { type: "string", description: "Ngày kết thúc, định dạng yyyy-mm-dd" }, // ✅ THÊM date_to
                                room_type: { type: "string", description: "Tên loại phòng bằng tiếng Việt" }
                            },
                            required: ["date_from", "date_to", "room_type"]
                        }
                    }
                }
            },
            required: ["function_call"]
        };
        // ===== Lần gọi API thứ nhất: Quyết định gọi hàm hay trả lời text =====
        const result = await callGeminiWithRetry({
            model: MODEL_ID,
            contents,
            tools,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                // Cung cấp schema cho cấu trúc phản hồi JSON mong muốn
                responseSchema: roomCheckSchema
            }, // Sửa: Dùng systemInstruction
        });

        console.log("🔍 Gemini raw:", JSON.stringify(result, null, 2));

        // 5. Trích xuất Function Call (có Fallback Parsing)
        let call = null;
        // Nếu chế độ JSON được bật, phản hồi sẽ nằm trong result.text dưới dạng chuỗi JSON
        if (result.text) {
            try {
                const jsonResponse = JSON.parse(result.text);
                // Trích xuất lời gọi hàm từ đối tượng JSON
                call = jsonResponse.function_call;
                console.log("🔍 Đã trích xuất Function Call từ JSON có cấu trúc.");
            } catch (e) {
                // Nếu Gemini vẫn trả về text không phải JSON, lỗi sẽ nằm ở đây
                console.error("❌ Lỗi Parsing JSON từ Gemini:", e);
            }
        }
        // ✅ FALLBACK: Nếu không có structured call, phân tích text output (Lỗi đã gặp)
        // D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js (Trong khối if (!call && result.text...) )




        // 6. Xử lý Function Call
        if (call && call.name === "check_room_availability") {
            // SỬA: Lấy 2 ngày
            const { date_from, date_to, room_type } = call.args;

            // Kiểm tra và chuẩn hóa ngày
            const fromDate = new Date(date_from);
            const toDate = new Date(date_to);

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                const errReply = `Dữ liệu ngày tháng không hợp lệ (Bắt đầu: ${date_from}, Kết thúc: ${date_to}). Vui lòng thử lại.`;
                return res.json({ reply: errReply });
            }

            // 🚨 XÓA BỎ TOÀN BỘ LOGIC TRUY VẤN PRISMA CŨ Ở ĐÂY 🚨

            // ✅ GỌI SERVICE LAYER MỚI
            const availableRoomCount = await getAvailableRoomCount(
                fromDate, // Ngày bắt đầu
                toDate,   // Ngày kết thúc
                room_type
            );

            console.log("🛠️ Kết quả DB:", `Tìm thấy ${availableRoomCount} phòng.`);

            const dateRangeText = (date_from === date_to)
                ? `vào ngày ${date_from}`
                : `từ ngày ${date_from} đến ngày ${date_to}`;

            const replyText =
                availableRoomCount > 0
                    ? `Hiện tại còn ${availableRoomCount} phòng ${room_type} trống ${dateRangeText}.`
                    : `Rất tiếc, hiện tại tất cả phòng ${room_type} đã được đặt ${dateRangeText}.`;

            // ... (Logic Lần gọi 2 tiếp tục như cũ)



            // ===== Lần gọi API thứ hai: Tạo câu trả lời tự nhiên =====
            const updatedContents = [...contents];

            // Thêm YÊU CẦU GỌI HÀM của AI (role: model)
            // Dán code này để thay thế toàn bộ logic tạo updatedContents cũ

            // 1. Thêm YÊU CẦU GỌI HÀM của AI (role: model) vào lịch sử
            updatedContents.push({
                role: "model",
                parts: [{
                    functionCall: {
                        name: call.name, // Lấy tên hàm (ví dụ: check_room_availability)
                        args: call.args || call.function?.arguments || {}, // Lấy tham số
                    },
                }],
            });

            // 2. Thêm KẾT QUẢ HÀM (từ DB) với role: "function" vào lịch sử
            updatedContents.push({
                role: "function",
                parts: [{
                    functionResponse: {
                        name: call.name, // Tên hàm phải khớp
                        response: {
                            message: replyText, // Gửi câu trả lời DB thô
                            count: availableRoomCount.length, // Gửi số lượng phòng
                        },
                    }
                }],
            });

            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: updatedContents,
                config: { systemInstruction: systemPrompt },
            });
            console.log("🛠️ Lần gọi 2 thành công!");

            const finalReply = followUp.text;

            // 7. Lưu lịch sử
            await prisma.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });
            await prisma.chatMessage.create({ data: { sessionId: session.id, role: "assistant", content: finalReply } });

            // Gửi câu trả lời tự nhiên về Frontend
            return res.json({ reply: finalReply });
        }

        // ✅ Xử lý Function Call: check_room_price (MỚI)
        else if (call && call.name === "check_room_price") {
            const { room_type } = call.args || call.function?.arguments || {};

            // GỌI SERVICE LAYER MỚI
            const priceData = await getRoomPrice(room_type);

            let replyText;
            if (priceData && priceData.price) {
                // Định dạng tiền tệ VND
                const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(priceData.price);
                replyText = `Giá niêm yết của ${priceData.roomName} là ${formattedPrice} mỗi đêm (áp dụng cho hình thức thuê ngày, thời điểm cơ bản).`;
            } else {
                replyText = `Rất tiếc, tôi không tìm thấy thông tin giá cho loại phòng "${room_type}" với hình thức thuê ngày, thời điểm cơ bản.`;
            }

            // Gửi lại kết quả để Gemini viết lại thành câu tự nhiên (Lần gọi 2)
            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: [
                    ...contents,
                    // 1. Thêm YÊU CẦU GỌI HÀM của AI (role: model)
                    {
                        role: "model",
                        parts: [{
                            functionCall: {
                                name: call.name,
                                args: call.args || call.function?.arguments || {},
                            },
                        }],
                    },
                    // 2. Thêm KẾT QUẢ HÀM (từ DB) với role: "function"
                    {
                        role: "function",
                        parts: [{
                            functionResponse: {
                                name: call.name,
                                response: { message: replyText, price: priceData?.price || null },
                            },
                        }],
                    }
                ],
            });

            const finalReply = followUp.text;

            // Lưu lịch sử
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply });
        }

        // 8. Nếu Gemini không gọi function (Chỉ trả lời text)
        const reply = result.text || "Xin lỗi, tôi chưa hiểu câu hỏi này của bạn.";

        await prisma.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });
        await prisma.chatMessage.create({ data: { sessionId: session.id, role: "assistant", content: reply } });

        res.json({ reply });
    } catch (err) {
        console.error("❌ Lỗi Chatbot:", err);
        // Nếu lỗi xảy ra trước khi có session, ta vẫn phải trả lời user
        res.status(500).json({ error: "Lỗi hệ thống trong quá trình xử lý: " + err.message });
    }
});

module.exports = router;
