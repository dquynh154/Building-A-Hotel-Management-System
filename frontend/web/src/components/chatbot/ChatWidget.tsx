'use client';

import { useEffect, useState } from 'react';

interface Action {
    type: 'LINK';
    url: string;
    label: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    action?: Action;
}

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<number | null>(null);

    // Khởi tạo sessionId nếu chưa có (giữ logic cũ)
    useEffect(() => {
        const saved = localStorage.getItem("chat_session");
        if (saved) {
            setSessionId(Number(saved));
        }
    }, []);


    // Gửi tin nhắn
    const sendMessage = async () => {
        if (!input.trim()) return;

        const messageContent = input; // lưu lại trước khi clear
        setInput('');
        setLoading(true);

        // Thêm tin nhắn user vào UI ngay lập tức
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: messageContent },
        ]);

        try {
            const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
            const res = await fetch(`${BASE}/chatbot/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageContent, sessionId }),
            });

            const data = await res.json();
            // if (data.newSessionId) {
            //     localStorage.setItem("chat_session", data.newSessionId);
            //     setSessionId(() => Number(data.newSessionId));  // ép React update lại state
            // }

            if (data.newSessionId && data.newSessionId !== sessionId) {
                setSessionId(data.newSessionId);
                localStorage.setItem('chat_session', String(data.newSessionId));
                console.log(`✅ Session ID updated to: ${data.newSessionId}`);
            }

            const assistantReply =
                data.reply || 'Xin lỗi, tôi chưa hiểu câu hỏi này.';
            const assistantAction = data.action;
            // Nếu reply là chuỗi gọi function thô thì ẩn đi
            // if (assistantReply.includes('check_room_availability')) {
            //     setMessages((prev) => [
            //         ...prev,
            //         {
            //             role: 'assistant',
            //             content:
            //                 'Đã có lỗi xảy ra trong quá trình xử lý dữ liệu. Vui lòng thử lại.',
            //         },
            //     ]);
            // } else {
            //     setMessages((prev) => [
            //         ...prev,
            //         { role: 'assistant', content: assistantReply },
            //     ]);
            // }

            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: assistantReply, action: assistantAction},
            ]);
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
    const handleKeyDown = (e: any) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Nút bong bóng chat ở góc phải dưới */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
                >
                    💬
                </button>
            )}

            {/* Khung chat nổi */}
            {open && (
                <div className="fixed bottom-4 right-4 z-40 w-full max-w-sm h-[480px] rounded-2xl bg-white shadow-2xl flex flex-col border border-gray-200">
                    {/* Header */}
                    <div className="flex items-center justify-between rounded-t-2xl bg-blue-600 px-4 py-2 text-white">
                        <div>
                            <div className="text-sm font-semibold">
                                Trợ lý ảo Wendy Hotel
                            </div>
                            <div className="text-xs text-blue-100">
                                Hỏi tôi về phòng, đặt phòng, dịch vụ...
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-full p-1 text-white/80 hover:bg-white/10"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Vùng tin nhắn */}
                    <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3">
                        {messages.length === 0 && !loading && (
                            <p className="mt-10 text-center text-xs text-gray-400">
                                💬 Hãy bắt đầu trò chuyện với trợ lý ảo của khách sạn nhé.
                            </p>
                        )}

                        {messages.map((m, i) => (
                            <div
                                key={i}
                                // ✅ THAY ĐỔI: Dùng flex-col để chứa cả bong bóng và nút
                                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                {/* KHỐI NỘI DUNG TIN NHẮN (Bong bóng) */}
                                <div
                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${m.role === 'user'
                                        ? 'rounded-br-none bg-blue-500 text-white'
                                        : 'rounded-bl-none bg-gray-200 text-gray-800'
                                        }`}
                                >
                                    {/* ✅ CHỈ GIỮ LẠI NỘI DUNG VĂN BẢN */}
                                    {m.content}
                                </div>

                                {/* ✅ KHỐI NÚT HÀNH ĐỘNG (ĐỘC LẬP) */}
                                {m.role === 'assistant' && m.action && (
                                    <a
                                        href={m.action.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        // ✅ THÊM mt-2 VÀ width-auto 
                                        className="mt-2 w-auto rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700 transition duration-150 ease-in-out"
                                    >
                                        {m.action.label}
                                    </a>
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="rounded-2xl bg-gray-200 px-3 py-2 text-sm text-gray-600 animate-pulse">
                                    Đang trả lời...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ô nhập + nút gửi */}
                    <div className="flex items-center gap-2 border-t px-2 py-2">
                        <input
                            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:ring focus:ring-blue-200"
                            placeholder="Nhập câu hỏi của bạn..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={loading}
                        />
                        <button
                            type="button"
                            onClick={sendMessage}
                            disabled={loading}
                            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            Gửi
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
