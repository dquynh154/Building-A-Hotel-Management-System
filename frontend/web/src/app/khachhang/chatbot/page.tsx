'use client';

import { useEffect, useState } from 'react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatbotPage() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<number | null>(null);

    // Khởi tạo sessionId nếu chưa có
    useEffect(() => {
        const stored = localStorage.getItem('chat_session');
        if (stored) {
            setSessionId(parseInt(stored, 10));
        } else {
            // tạo session tạm (ở đây giả định 1 user 1 session)
            const newId = Math.floor(Math.random() * 100000);
            localStorage.setItem('chat_session', String(newId));
            setSessionId(newId);
        }
    }, []);

    // Gửi tin nhắn


    // Gửi tin nhắn
    const sendMessage = async () => {
        if (!input.trim() || !sessionId) return;

        const messageContent = input; // Lưu lại nội dung input trước khi xóa
        setInput('');
        setLoading(true);

        // 1. ✅ Thêm tin nhắn của người dùng vào giao diện ngay lập tức
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: messageContent },
        ]);

        try {
            const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
            const res = await fetch(`${BASE}/chatbot/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // SỬA: body sử dụng biến messageContent đã lưu
                body: JSON.stringify({ message: messageContent, sessionId }),
            });
            const data = await res.json();
            if (data.newSessionId && data.newSessionId !== sessionId) {
                setSessionId(data.newSessionId);
                localStorage.setItem('chat_session', String(data.newSessionId));
                console.log(`✅ Session ID updated to: ${data.newSessionId}`);
            }
            // 2. ✅ Thêm câu trả lời của Trợ lý vào mảng messages
            const assistantReply = data.reply || 'Xin lỗi, tôi chưa hiểu câu hỏi này.';

            // Cần kiểm tra nếu data.reply là chuỗi gọi hàm thô, ta không hiển thị nó
            if (assistantReply.includes('check_room_availability')) {
                // Nếu Backend trả về chuỗi gọi hàm thô (do lỗi), hãy ẩn nó đi và trả về lỗi chung
                setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: 'Đã có lỗi xảy ra trong quá trình xử lý dữ liệu. Vui lòng thử lại.' },
                ]);
            } else {
                // Nếu nhận được câu trả lời tự nhiên (finalReply)
                setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: assistantReply },
                ]);
            }

        } catch (err) {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Lỗi kết nối tới máy chủ chatbot.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Gửi bằng Enter
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F9F5EF]">
            <div className="bg-white shadow-xl rounded-2xl w-full max-w-md p-4 flex flex-col">
                <h1 className="text-xl font-semibold mb-3 text-center text-gray-800">
                    Trợ lý ảo Wendy Hotel
                </h1>

                <div className="flex-1 overflow-y-auto space-y-3 mb-3 h-[420px] p-2 border rounded-lg bg-gray-50">
                    {messages.length === 0 && (
                        <p className="text-center text-gray-400 text-sm mt-16">
                            💬 Hãy bắt đầu trò chuyện với trợ lý ảo của khách sạn nhé.
                        </p>
                    )}
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`px-3 py-2 max-w-[80%] rounded-2xl text-sm whitespace-pre-line ${m.role === 'user'
                                    ? 'bg-blue-500 text-white rounded-br-none'
                                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                                    }`}
                            >
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-200 text-gray-600 px-3 py-2 rounded-2xl text-sm animate-pulse">
                                Đang trả lời...
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <input
                        className="flex-1 text-gray-900 border rounded-xl p-2 text-sm outline-none focus:ring focus:ring-blue-200"
                        placeholder="Nhập câu hỏi của bạn..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm transition"
                    >
                        Gửi
                    </button>
                </div>
            </div>
        </div>
    );
}
