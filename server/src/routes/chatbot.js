const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { prisma } = require('../db/prisma');
const { getAvailableRoomCount, getRoomPrice } = require('../services/roomService');
const { checkBookingStatus, listPendingBookings } = require('../services/bookingService');
const { suggestRooms } = require('../services/roomSelectionService');
const { searchNearbyPlaces } = require('../services/placeService');
const { addServiceToBooking } = require('../services/hotelInteractionService');
const { handleDepositPaymentUpdate } = require('../services/depositPaymentService');
const router = express.Router();

// ===== Khởi tạo client Gemini mới =====
const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// ===== Model ID =====
const MODEL_ID = "gemini-2.5-flash";

console.log("✅ Chatbot route loaded - using Gemini 2.5 Flash API (v1.29.0)");
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
        // --- SESSION THEO KHÁCH ĐĂNG NHẬP (Cách B) ---

        // Lấy guestId từ request (nếu bạn có middleware auth)
        const guestId =
            req.user?.kind === "GUEST"
                ? req.user.sub   // sub = KH_MA
                : null;

        // Nếu FE gửi sessionId → thử tìm
        if (sessionId) {
            session = await prisma.chatSession.findUnique({
                where: { id: Number(sessionId) },
            });
        }

        // Nếu session không tồn tại → tạo session mới
        if (!session) {
            session = await prisma.chatSession.create({
                data: {
                    guestId: guestId,     // gắn đúng khách dùng chatbot
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
        const todayDate = new Date().toISOString().split('T')[0];
        const systemPrompt = `
    Bạn là trợ lý ảo của khách sạn Wendy Hotel. Bạn trả lời ngắn gọn, tự nhiên, rõ ràng.
    Hôm nay là ngày ${todayDate}. [THÔNG TIN CỨNG]  
    [THÔNG TIN KHÁCH SẠN CỨNG]:
    - Địa chỉ của khách sạn là: Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ. Số điện thoại: 0123456789
    - Phòng Tiêu Chuẩn: Diện tích 20m², 1 giường Queen size. Có máy sấy tóc, Smart TV, Tủ lạnh mini, Điều hòa, Bàn làm việc . Phù hợp cho 2 người.
    - Phòng 2 Giường Đơn: Diện tích 25m², 2 giường đơn. Có tủ quần áo, bình đun nước, Tủ lạnh, Máy sấy tóc, Smart TV. Tối đa 2 người .
    - Phòng Sang Trọng Giường Đôi: Diện tích 40m², 2 giường King size. Có tủ quần áo, bình đun nước, Tủ lạnh, Máy sấy tóc, Smart TV. Tối đa 4 người, phù hợp cho nhóm bạn hoặc gia đình nhỏ. Có kèm bữa sáng.
    - Tiện ích Khách sạn: Có hồ bơi ngoài trời, Wifi tốc độ cao, và dịch vụ giặt là (có tính phí).
    - Khi hỏi về chính sách của khách sạn: Giờ checkin: 14:00 và checkout: 12:00. Khi hủy đặt phòng không hoàn tiền.
    - Khi khách hỏi về **CÁCH ĐẶT PHÒNG** hoặc **QUY TRÌNH ĐẶT PHÒNG**, hãy trả lời bằng văn bản (KHÔNG gọi tool): "Quý khách có thể đặt phòng trực tiếp qua trang web của khách sạn, hoặc liên hệ qua số điện thoại 0123456789. Nếu quý khách muốn kiểm tra phòng trống, vui lòng cho biết ngày nhận phòng, ngày trả phòng và loại phòng mong muốn."
    
    [QUY TẮC SỬ DỤNG TOOLS]:
    - Khi khách hỏi về phòng trống, hãy gọi hàm "check_room_availability" với tham số (**date_from**, **date_to**, room_type).
    - Đảm bảo định dạng ngày là yyyy-mm-dd. **Nếu khách chỉ hỏi 1 ngày (ví dụ: ngày 13/11), hãy đặt date_from là 2025-11-13 và date_to là 2025-11-14 (ngày tiếp theo).**
    - Khi khách hỏi có bao nhiêu loại phòng thì là 3 loại: "Phòng tiêu chuẩn", "Phòng 2 giường đơn", "Phòng sang trọng giường đôi".
    - Khi khách hỏi về **giá** hoặc **chi phí** của một **LOẠI PHÒNG CỤ THỂ** (ví dụ: 'giá phòng tiêu chuẩn'), hãy gọi hàm "**check_room_price**" (**room_type**).
    - Khi khách hàng yêu cầu TƯ VẤN hoặc GỢI Ý chọn phòng** (dựa trên số người, ngân sách, hoặc tiện nghi), **hãy gọi hàm "suggest_room_type"**. Ưu tiên tool này hơn check_room_price khi có từ khóa về ngân sách.
    - Khi khách hỏi về đặt phòng của họ, trạng thái đặt chỗ, hoặc thông tin chi tiết đặt phòng, hãy gọi hàm "check_booking_status".
    -**QUAN TRỌNG VỀ ĐẶT PHÒNG:** Tool này chỉ cần **MỘT trong hai** tham số:
        1. Nếu khách cung cấp **Mã đặt phòng** (ví dụ: "kiểm tra đặt phòng mã 123"), **CHỈ trích xuất booking_code**.
        2. Nếu khách CHỈ cung cấp **Tên** (ví dụ: "đặt phòng của Nguyễn Văn A"), **CHỈ trích xuất guest_name**.
        3. **KHÔNG BAO GIỜ** yêu cầu hoặc trích xuất cả hai tham số cùng một lúc.
    - Khi khách hàng hỏi về các địa điểm lân cận (ví dụ: "quán ăn gần đây", "ATM gần khách sạn"), hãy gọi hàm "search_nearby_places" và trích xuất loại địa điểm (place_type).
    - Khi khách yêu cầu **DỊCH VỤ PHÒNG** hoặc **TIỆN ÍCH**, **luôn** tìm và trích xuất **room_number** nếu được cung cấp,  hãy gọi hàm "**request_hotel_service**" và trích xuất **item_keyword** cùng **quantity** (số lượng). Nếu không được cung cấp, hãy để trống và để logic backend xử lý.
    - **QUAN TRỌNG:** Nếu khách hàng báo cáo một thiết bị bị hư hỏng, không hoạt động, hoặc cần sửa chữa (ví dụ: máy lạnh hỏng, TV không bật), hãy trích xuất **item_keyword** là **"Sửa chữa"**. Sau đó, ghi lại chi tiết sự cố trong tin nhắn.
    - Khi khách hỏi về **THANH TOÁN CỌC**, **HOÀN TẤT ĐẶT PHÒNG**, hoặc **THANH TOÁN TIỀN ĐẶT CỌC**, hãy gọi hàm "**process_deposit_payment**" và **BẮT BUỘC** trích xuất **booking_code**.
    - Nếu khách hàng hỏi về **DANH SÁCH HỢP ĐỒNG CẦN THANH TOÁN** hoặc **HỢP ĐỒNG CHƯA CỌC**, hãy gọi hàm "**list_pending_bookings**".
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
                description: "Chỉ được sử dụng để trả lời giá hiện tại của MỘT LOẠI PHÒNG CỤ THỂ đã được khách hàng nêu tên (ví dụ: 'giá phòng tiêu chuẩn là bao nhiêu'). KHÔNG sử dụng tool này khi khách hàng yêu cầu tư vấn ngân sách.",
                parameters: {
                    type: "object",
                    properties: {
                        room_type: { type: "string", description: "Tên loại phòng bằng tiếng Việt" },
                    },
                    required: ["room_type"], // Chỉ cần room_type
                },
            },
            {
                name: "check_booking_status",
                description: "Kiểm tra trạng thái đặt phòng của khách hàng. **Chỉ cần cung cấp MỘT trong hai tham số: Mã đặt phòng (booking_code) HOẶC Tên khách hàng (guest_name).** Ưu tiên sử dụng Mã đặt phòng nếu khách cung cấp.",
                parameters: {
                    type: "object",
                    properties: {
                        guest_name: {
                            type: "string",
                            description: "Tên đầy đủ hoặc một phần tên của khách hàng đã đặt phòng. Chỉ cần tìm kiếm nếu booking_code không có."
                        },
                        booking_code: {
                            type: "string",
                            description: "Mã đặt phòng (HDONG_MA) của khách hàng."
                        }
                    },
                    required: [] // Không yêu cầu bắt buộc, vì khách có thể cung cấp 1 trong 2
                }
            },
            {
                name: "suggest_room_type",
                description: "Sử dụng tool này khi khách hàng yêu cầu TƯ VẤN/GỢI Ý chọn phòng, đặc biệt khi họ cung cấp các TIÊU CHÍ (số người, ngân sách, tiện nghi) chứ không phải hỏi giá phòng cụ thể. Luôn ưu tiên tool này hơn check_room_price khi có từ khóa về ngân sách.",
                parameters: {
                    type: "object",
                    properties: {
                        pax_count: {
                            type: "number",
                            description: "Số lượng người lớn sẽ ở trong phòng."
                        },
                        amenity_keywords: {
                            type: "string",
                            description: "Các tiện nghi hoặc yêu cầu đặc biệt (ví dụ: 'có bồn tắm', 'yên tĩnh', 'view đẹp', 'bữa sáng')."
                        },
                        price_range: {
                            type: "string",
                            description: "Khoảng ngân sách của khách hàng (ví dụ: 'rẻ', 'trung bình', 'dưới 1 triệu', 'cao cấp')."
                        }
                    },
                    required: [] // KHÔNG CÓ THAM SỐ BẮT BUỘC
                }
            },
            {
                name: "search_nearby_places",
                description: "Tìm kiếm các địa điểm lân cận khách sạn (như nhà hàng, quán cà phê, siêu thị, bệnh viện) dựa trên loại địa điểm mà khách hàng yêu cầu.",
                parameters: {
                    type: "object",
                    properties: {
                        place_type: {
                            type: "string",
                            description: "Loại địa điểm khách hàng muốn tìm (ví dụ: 'nhà hàng', 'quán cà phê', 'siêu thị', 'bệnh viện', 'ATM').**Luôn trích xuất max_distance_km nếu có số lượng đi kèm.**"
                        },
                        max_distance_km: {
                            type: "number",
                            description: "**DÙNG SỐ NÀY (ví dụ: 2) KHI KHÁCH HỎI KHOẢNG CÁCH**. Khoảng cách tối đa (km). Nếu không có, hàm sẽ mặc định là 1."
                        }
                    },
                    required: ["place_type"]
                }
            },
            {
                name: "request_hotel_service",
                description: "Gửi yêu cầu dịch vụ phòng (đồ ăn, đồ uống, Mì gói, Bia) hoặc tiện ích (thêm khăn tắm, sửa chữa máy lạnh, giặt ủi) cho khách hàng. **Luôn cố gắng trích xuất số lượng.**",
                parameters: {
                    type: "object",
                    properties: {
                        item_keyword: { type: "string", description: "Từ khóa món ăn/tiện ích (ví dụ: 'Mì gói', 'thêm khăn tắm', 'giặt ủi', 'sửa máy lạnh')." },
                        quantity: { type: "number", description: "Số lượng (ví dụ: 2 cái, 3 chai). Mặc định là 1 nếu không rõ." },
                        room_number: { type: "string", description: "Số hoặc tên phòng khách hàng muốn yêu cầu dịch vụ (ví dụ: '101', '305')." }
                    },
                    required: ["item_keyword"]
                }
            },
            {
                name: "process_deposit_payment",
                description: "Khởi tạo quy trình thanh toán tiền cọc (deposit) cho hợp đồng đã đặt (trạng thái PENDING) nhưng chưa hoàn tất. **Chức năng này không dùng cho thanh toán hóa đơn cuối cùng (MAIN Invoice).**",
                parameters: {
                    type: "object",
                    properties: {
                        booking_code: { type: "string", description: "Mã hợp đồng (HDONG_MA) khách hàng muốn thanh toán tiền cọc. Bắt buộc phải trích xuất." },
                        payment_method: { type: "string", description: "Phương thức thanh toán mong muốn (ví dụ: 'chuyển khoản', 'thẻ', 'tiền mặt'). Mặc định là 'BANK_QR'." }
                    },
                    required: ["booking_code"] // Chỉ cần mã hợp đồng là bắt buộc
                }
            },
            {
                name: "list_pending_bookings",
                description: "Liệt kê các hợp đồng đặt phòng đang ở trạng thái PENDING (chờ thanh toán cọc) của khách hàng đang đăng nhập.",
                parameters: {
                    type: "object",
                    properties: {
                        // Không cần tham số, vì nó sử dụng GUEST_ID từ session
                    },
                    required: []
                }
            },
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
                // responseMimeType: "application/json",
                // Cung cấp schema cho cấu trúc phản hồi JSON mong muốn
                // responseSchema: roomCheckSchema
            }, // Sửa: Dùng systemInstruction
        });

        console.log("🔍 Gemini raw:", JSON.stringify(result, null, 2));

        // 5. Trích xuất Function Call (có Fallback Parsing)
        let call = null;

        if (result.functionCalls && result.functionCalls.length > 0) {
            // Trường hợp 1: API trả về Function Call chuẩn (ưu tiên)
            call = result.functionCalls[0];
            console.log("🔍 Đã trích xuất Function Call từ cấu trúc chuẩn.");

        } else if (result.text) {
            let rawText = result.text.trim();

            // Xử lý lỗi Backtick: Loại bỏ dấu backtick (`) nếu có
            if (rawText.startsWith('`') && rawText.endsWith('`')) {
                rawText = rawText.substring(1, rawText.length - 1).trim();
            }

            // Thử phân tích JSON (nếu bạn bật responseMimeType: "application/json"
            try {
                const jsonResponse = JSON.parse(rawText);
                // Kiểm tra xem đó có phải là cấu trúc JSON chứa function_call không
                call = jsonResponse.function_call || jsonResponse;
                console.log("🔍 Đã trích xuất Function Call từ JSON.");

            } catch (e) {
                // Trường hợp 3: Gemini trả về chuỗi code thô (ví dụ: check_room_price(...))
                console.warn(`⚠️ Gemini trả về chuỗi code thô: ${rawText}`);

                // Thử Regex để trích xuất hàm và tham số từ chuỗi code thô
                const match = rawText.match(/(\w+)\s*\((.*?)\)/);

                if (match) {
                    const name = match[1];
                    const argsStr = match[2];
                    const args = {};

                    // Phân tích tham số (key="value")
                    const argRegex = /(\w+)=("([^"]*)"|(\d+)|([^,]*))/g;
                    let argMatch;

                    while ((argMatch = argRegex.exec(argsStr)) !== null) {
                        const key = argMatch[1];
                        // Lấy giá trị: ưu tiên Group 3 (chuỗi) hoặc Group 4 (số)
                        let value = argMatch[3] || argMatch[4] || argMatch[5];

                        // if (value && typeof value === 'string' && value.trim().length > 0) {
                        //     value = value.trim();
                        //     // Chuyển đổi giá trị số nếu cần
                        //     if (/^\d+$/.test(value)) {
                        //         value = parseInt(value, 10);
                        //     }
                        // }
                        if (key === 'room_number' || key === 'max_distance_km' || key === 'quantity') {
                            // Room number và các ID/code phải là string, chỉ quantity và max_distance_km là số.
                            // Tuy nhiên, vì room_number phải được giữ là chuỗi (dù có là số),
                            // ta chỉ parseInt cho quantity và max_distance_km nếu có thể, hoặc
                            // tốt nhất là chỉ chuyển đổi khi KHÔNG phải là room_number.

                            // GIẢI PHÁP TỐI ƯU HƠN: GIỮ LẠI LỖI CŨ VÀ THÊM ĐIỀU KIỆN

                            // Chuyển đổi giá trị số nếu cần
                            if (value && /^\d+$/.test(value) && key !== 'room_number') { // 👈 SỬA ĐỔI CHÍNH
                                value = parseInt(value, 10);
                            }
                        }
                        if (key && value !== undefined) {
                            args[key] = value;
                        }
                    }

                    // Gán lại cho biến call nếu nó là một tool hợp lệ
                    if (["check_room_availability", "check_room_price", "check_booking_status", "suggest_room_type", "search_nearby_places",
                        "request_hotel_service", "process_deposit_payment","list_pending_bookings"
                    ].includes(name)) {
                        call = { name, args };
                        console.log(`🔍 Đã phân tích tool từ chuỗi thô: ${name}`);
                    }
                } else {
                    console.log("❌ Không phân tích được thành tool call hợp lệ.");
                }
            }
        }

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
                            count: availableRoomCount, // Gửi số lượng phòng
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
            return res.json({ reply: finalReply, newSessionId: session.id });
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

            return res.json({ reply: finalReply, newSessionId: session.id });
            // D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js (Trong router.post, sau khối check_room_price)

        } else if (call && call.name === "check_booking_status") { // ✅ KHỐI MỚI
            const { guest_name, booking_code } = call.args;

            // 1. Lấy dữ liệu từ Service
            const bookingData = await checkBookingStatus(guest_name, booking_code);

            let replyText;

            if (bookingData && bookingData.error) {
                // Xử lý lỗi từ Service (ví dụ: mã đặt phòng không hợp lệ)
                replyText = bookingData.error;

            } else if (bookingData) {
                // Xử lý khi tìm thấy đặt phòng
                const roomType = bookingData.CHI_TIET_SU_DUNG[0]?.PHONG.LOAI_PHONG.LP_TEN || "chưa xác định";
                const checkInDate = new Date(bookingData.HDONG_NGAYDAT).toLocaleDateString('vi-VN');
                const bookingStatus = bookingData.HDONG_TRANG_THAI;

                replyText = `Thông tin đặt phòng của quý khách đã được tìm thấy (Mã: ${bookingData.HDONG_MA}):
- Khách hàng: ${bookingData.KHACH_HANG.KH_HOTEN}
- Loại phòng: ${roomType}
- Ngày nhận phòng: ${checkInDate}
- Trạng thái: ${bookingStatus}.`;

            } else {
                // Không tìm thấy đặt phòng nào
                replyText = "Rất tiếc, tôi không tìm thấy bất kỳ đặt phòng nào phù hợp với thông tin quý khách cung cấp. Vui lòng kiểm tra lại tên hoặc Mã đặt phòng (ID_HOPDONG).";
            }

            // 2. Gửi lại kết quả (replyText) cho Gemini để tạo câu trả lời tự nhiên
            // **Áp dụng logic Function Calling 2 bước (Model + Function Response)**
            const updatedContents = [...contents];

            updatedContents.push({
                role: "model",
                parts: [{ functionCall: { name: call.name, args: call.args } }],
            });

            updatedContents.push({
                role: "function",
                parts: [{ functionResponse: { name: call.name, response: { message: replyText, data: bookingData } } }],
            });

            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: updatedContents,
            });

            const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời chi tiết.";

            // 3. Lưu lịch sử
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply, newSessionId: session.id });

        } else if (call && call.name === "list_pending_bookings") { // ✅ KHỐI MỚI
            const GUEST_ID = session.guestId;

            let replyText;

            if (!GUEST_ID) {
                replyText = "Tôi xin lỗi, bạn cần đăng nhập để tôi có thể liệt kê các hợp đồng chờ cọc của bạn.";
            } else {
                // 1. GỌI SERVICE MỚI
                // Cần đảm bảo hàm listPendingBookings đã được import từ bookingService
                replyText = await listPendingBookings(GUEST_ID);
            }

            // 2. Gửi lại kết quả cho Gemini để tạo câu trả lời tự nhiên (Call 2)
            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: [
                    ...contents,
                    { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
                    { role: "function", parts: [{ functionResponse: { name: call.name, response: { message: replyText } } }] }
                ],
            });

            const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời chi tiết.";

            // 3. Lưu lịch sử và trả về
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply, newSessionId: session.id });
        } else if (call && call.name === "suggest_room_type") {
            const { pax_count, amenity_keywords, price_range } = call.args;

            // 1. Gọi Service Layer mới (giả sử bạn đã import nó)
            const suggestedRooms = await suggestRooms(
                pax_count,
                amenity_keywords,
                price_range
            );

            let replyText = "";

            if (suggestedRooms && suggestedRooms.length > 0) {
                // 2. Tạo phản hồi dữ liệu thô
                replyText = "Tôi đã tìm thấy các lựa chọn sau: \n"
                    + suggestedRooms.map(r =>
                        `${r.roomName} (${r.pax} người, ${r.price}) - Lý do: ${r.reasons.join(', ')}`
                    ).join('\n');
            } else {
                replyText = "Rất tiếc, không có loại phòng nào phù hợp với tất cả các tiêu chí bạn đưa ra. Bạn có thể thay đổi số người hoặc ngân sách không?";
            }

            // 3. Gửi lại kết quả cho Gemini (Call 2)
            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: [
                    ...contents,
                    // 1. Yêu cầu gọi hàm
                    { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
                    // 2. Kết quả hàm
                    { role: "function", parts: [{ functionResponse: { name: call.name, response: { message: replyText, suggestions: suggestedRooms } } }] }
                ],
            });

            const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời chi tiết.";

            // 4. Lưu lịch sử và trả về
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply, newSessionId: session.id });
            // D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js
            // ... (Sau khối xử lý suggest_room_type)

        } else if (call && call.name === "search_nearby_places") {
            // 1. Lấy tham số

            const { place_type } = call.args;
            let { max_distance_km } = call.args;
            console.log(`➡️ Tham số trích xuất: Type=${place_type}, Distance=${max_distance_km}`); // <-- Dòng này quan trọng

            if (!max_distance_km) {
                // Regex để tìm số theo sau là 'km', 'cây số', hoặc 'k'
                const distanceMatch = message.match(/(\d+)\s*(km|k|cây số|kilomet)/i);

                if (distanceMatch) {
                    // Lấy số từ Group 1
                    max_distance_km = parseInt(distanceMatch[1], 10);
                    console.log(`⚠️ FIX: Gán lại max_distance_km=${max_distance_km} từ tin nhắn gốc.`);
                }
            }
            // 2. Gọi Service Layer
            const places = await searchNearbyPlaces(
                place_type,
                max_distance_km
            );

            let replyText = "";
            if (places && places.length > 0) {
                replyText = `Tôi đã tìm thấy ${places.length} địa điểm ${place_type} gần khách sạn: \n`
                    + places.map((p, index) =>
                        `${index + 1}. ${p.name} tại địa chỉ ${p.address}(${p.distance}).`
                    ).join('\n');
            } else {
                replyText = `Rất tiếc, tôi không tìm thấy địa điểm ${place_type} nào trong phạm vi ${max_distance_km || 1} km.`;
            }

            // 3. Gửi lại kết quả cho Gemini (Call 2)
            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: [
                    ...contents,
                    { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
                    { role: "function", parts: [{ functionResponse: { name: call.name, response: { message: replyText, placesFound: places } } }] }
                ],
            });

            const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi tạo câu trả lời chi tiết.";

            // 4. Lưu lịch sử và trả về
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply, newSessionId: session.id });
            // D:\QUAN LY KHACH SAN\server\src\routes\chatbot.js (Thêm khối mới sau khối search_nearby_places)

        } else if (call && call.name === "request_hotel_service") {
            const { item_keyword, quantity, room_number } = call.args;

            // ⚠️ Lấy guestId từ session/login (Giả định guestId đã được gắn vào session)
            const GUEST_ID = session.guestId;

            let replyText;

            if (!GUEST_ID) {
                replyText = "Tôi xin lỗi, tôi cần bạn đăng nhập hoặc cung cấp mã đặt phòng để xác định phòng của bạn trước khi gửi yêu cầu dịch vụ.";
            } else {
                // 1. GỌI SERVICE MỚI (Ghi vào DB)
                const finalQuantity = quantity || 1;
                replyText = await addServiceToBooking(GUEST_ID, item_keyword, finalQuantity, room_number);
            }

            // 2. Gửi lại kết quả cho Gemini để tạo câu trả lời tự nhiên (Call 2)
            const followUp = await callGeminiWithRetry({
                model: MODEL_ID,
                contents: [
                    ...contents,
                    { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
                    { role: "function", parts: [{ functionResponse: { name: call.name, response: { message: replyText } } }] }
                ],
            });

            const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu.";

            // 3. Lưu lịch sử và trả về
            await prisma.chatMessage.createMany({
                data: [
                    { sessionId: session.id, role: "user", content: message },
                    { sessionId: session.id, role: "assistant", content: finalReply },
                ],
            });

            return res.json({ reply: finalReply, newSessionId: session.id });
        } else if (call && call.name === "process_deposit_payment") { // ✅ KHỐI MỚI
            const { booking_code, payment_method } = call.args;
            const GUEST_ID = session.guestId;

            let replyText;
            const finalPaymentMethod = payment_method || 'GATE_WAY';

            // 1. GỌI SERVICE (Kiểm tra/Cập nhật trạng thái)
            if (!GUEST_ID) {
                replyText = "Tôi xin lỗi, bạn cần đăng nhập để thực hiện giao dịch thanh toán cọc.";
            } else {
                // Giả định handleDepositPaymentUpdate trả về {status: 'NEEDS_PAYMENT' | 'SUCCESS' | 'ERROR', message: string, hdonMa: number | null, amount: number | null, email: string | null}
                const result = await handleDepositPaymentUpdate(GUEST_ID, booking_code, finalPaymentMethod);

                // 2. TẠO LINK NẾU CẦN THANH TOÁN
                let link = null;
                const hdon_ma = result.hdonMa;
                const amount = result.amount;
                const email = result.email;
                console.log("DEBUG LINK CHECK:", {
                    status: result.status,
                    hdonMa: hdon_ma,
                    amount: amount,
                    email: email
                });
                // Nếu Service trả về status NEEDS_PAYMENT và đủ tham số
                if (result.status === 'NEEDS_PAYMENT' && hdon_ma && amount && email) {
                    // Cấu trúc link dựa trên khachhang/pay-mock/page.tsx
                    link = `/khachhang/pay-mock?hdon_ma=${hdon_ma}&email=${encodeURIComponent(email)}&amount=${amount}`;
                    replyText = `${result.message} Vui lòng nhấn nút Thanh toán Cọc ngay để hoàn tất giao dịch.`;
                } else {
                    replyText = result.message; // Message Success, Error, hoặc Confirmed
                }

                // 3. Gửi lại kết quả cho Gemini để tạo câu trả lời tự nhiên (Call 2)
                const followUp = await callGeminiWithRetry({
                    model: MODEL_ID,
                    contents: [
                        ...contents,
                        { role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] },
                        { role: "function", parts: [{ functionResponse: { name: call.name, response: { message: replyText } } }] }
                    ],
                });

                const finalReply = followUp.text || "Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu thanh toán cọc.";

                // 4. Lưu lịch sử và trả về
                await prisma.chatMessage.createMany({
                    data: [
                        { sessionId: session.id, role: "user", content: message },
                        { sessionId: session.id, role: "assistant", content: finalReply },
                    ],
                });

                // 5. GỬI PHẢN HỒI CÓ CẤU TRÚC VỀ FRONTEND
                return res.json({
                    reply: finalReply,
                    newSessionId: session.id,
                    action: link ? { // Chỉ gửi action nếu có link
                        type: "LINK",
                        url: link,
                        label: "Thanh toán Cọc ngay"
                    } : null
                });
            }
        }



        // 8. Nếu Gemini không gọi function (Chỉ trả lời text)
        const reply = result.text || "Xin lỗi, tôi chưa hiểu câu hỏi này của bạn.";

        await prisma.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });
        await prisma.chatMessage.create({ data: { sessionId: session.id, role: "assistant", content: reply } });

        res.json({ reply, newSessionId: session.id });
    } catch (err) {
        console.error("❌ Lỗi Chatbot:", err);
        // Nếu lỗi xảy ra trước khi có session, ta vẫn phải trả lời user
        res.status(500).json({ error: "Lỗi hệ thống trong quá trình xử lý: " + err.message });
    }
});

module.exports = router;
