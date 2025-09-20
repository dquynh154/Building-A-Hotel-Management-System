"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatWidget() {
    const API = process.env.NEXT_PUBLIC_API ?? ""; // ví dụ: http://localhost:3001/api
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Tạo session khi mount
    useEffect(() => {
        const createSession = async () => {
            try {
                setLoading(true);
                if (!API) throw new Error("Thiếu NEXT_PUBLIC_API trong .env.local");
                const r = await fetch(`${API}/chat/session`, { method: "POST" });
                if (!r.ok) throw new Error(`Tạo session lỗi: ${r.status}`);
                const d = await r.json();
                setSessionId(d.sessionId);
                setError(null);
                console.log("SessionId:", d.sessionId);
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Không tạo được session");
            } finally {
                setLoading(false);
            }
        };
        createSession();
    }, [API]);

    const send = async () => {
        try {
            const text = inputRef.current?.value?.trim();
            if (!text) return;
            if (!sessionId) {
                setError("Chưa sẵn sàng (đang tạo session)...");
                return;
            }
            setBusy(true);
            setError(null);

            // add user message
            setMessages((prev) => [...prev, { role: "user", content: text }]);
            inputRef.current!.value = "";

            const r = await fetch(`${API}/chat/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, message: text }),
            });

            if (!r.ok) {
                const t = await r.text();
                throw new Error(`Gửi thất bại (${r.status}): ${t}`);
            }

            const { reply } = await r.json();
            setMessages((prev) => [...prev, { role: "assistant", content: reply || "..." }]);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Có lỗi khi gửi tin nhắn");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 w-96 rounded-2xl shadow-lg bg-white border flex flex-col overflow-hidden text-gray-800">
            {/* Header */}
            <div className="bg-blue-600 text-white font-semibold px-4 py-2">
                Hỗ trợ lễ tân
            </div>

            {/* Messages */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3 text-sm bg-gray-50">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <span
                            className={`px-3 py-2 rounded-lg max-w-[70%] break-words ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"
                                }`}
                        >
                            {m.content}
                        </span>
                    </div>
                ))}

                {loading && (
                    <div className="text-center text-gray-400">Đang khởi tạo phiên chat...</div>
                )}
                {!loading && messages.length === 0 && !error && (
                    <div className="text-center text-gray-400">Hãy nhập câu hỏi để bắt đầu trò chuyện...</div>
                )}
                {error && (
                    <div className="text-center text-red-600 text-sm">{error}</div>
                )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t p-2 bg-white">
                <input
                    ref={inputRef}
                    placeholder="Hãy nhập câu hỏi..."
                    onKeyDown={(e) => e.key === "Enter" && !busy && send()}
                    className="flex-1 bg-white text-gray-900 placeholder:text-gray-400 border rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 caret-blue-600"
                />
                <button
                    type="button"
                    onClick={send}
                    disabled={busy || loading || !sessionId}
                    className={`px-4 py-2 rounded-lg text-white transition
                     ${busy || loading || !sessionId ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                    title={!sessionId ? "Đang tạo session..." : ""}
                >
                    {busy ? "..." : "Gửi"}
                </button>
            </div>
        </div>
    );
}
