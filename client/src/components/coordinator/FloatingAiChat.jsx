import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Minimize2, Send, Sparkles, X, Maximize2 } from "lucide-react";
import clsx from "clsx";
import Spinner from "../ui/Spinner";
import { endpoints } from "../../lib/api";

const SUGGESTIONS = [
  "How many open blood needs right now?",
  "Which blood types are in shortage?",
  "Upcoming transfusions this week?",
  "How many donors can donate today?",
];

export default function FloatingAiChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi — I'm your BloodBridge assistant. Ask about donors, open needs, shortages, or patient schedules.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (open && !minimized) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, busy, open, minimized]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await endpoints.nlQuery(q);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: r.answer, intent: r.intent },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Try again.", err: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Panel */}
      <div
        className={clsx(
          "fixed z-50 bottom-24 right-6 w-[min(100vw-2rem,420px)] transition-all duration-300 origin-bottom-right",
          open && !minimized
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none",
        )}
      >
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-ink-200/80 bg-white flex flex-col h-[min(70vh,560px)]">
          <header className="px-4 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-blood-600 text-white flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                BloodBridge AI
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              </div>
              <div className="text-[11px] text-white/75 truncate">
                Ask about donors, needs & schedules
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setMinimized(false); }}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gradient-to-b from-ink-50/80 to-white">
            {messages.map((m, i) => (
              <ChatBubble key={i} msg={m} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-ink-500 animate-fade-up">
                <Spinner /> Thinking…
              </div>
            )}
          </div>

          <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-ink-100 bg-white">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => send(s)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-ink-50 hover:bg-indigo-50 text-ink-600 hover:text-indigo-700 border border-ink-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="p-3 border-t border-ink-100 bg-white flex gap-2 shrink-0"
          >
            <input
              className="input flex-1 !py-2.5"
              placeholder="Ask anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn-primary !px-3.5 !rounded-xl"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Minimized pill */}
      {open && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed z-50 bottom-24 right-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all animate-pop-in"
        >
          <Bot className="w-4 h-4" />
          <span className="text-sm font-medium">AI chat</span>
        </button>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => {
          if (open && minimized) {
            setMinimized(false);
          } else {
            setOpen((v) => !v);
            setMinimized(false);
          }
        }}
        className={clsx(
          "fixed z-50 bottom-6 right-6 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 group",
          open && !minimized
            ? "bg-ink-700 scale-90 opacity-0 pointer-events-none"
            : "bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:scale-105 hover:shadow-2xl",
        )}
        aria-label="Open AI assistant"
      >
        <span className="absolute inset-0 rounded-full bg-indigo-400/30 animate-ping-slow group-hover:animate-none" />
        <Bot className="w-6 h-6 text-white relative z-10" />
      </button>
    </>
  );
}

function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={clsx("flex gap-2 animate-fade-up", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5" />
        </div>
      )}
      <div
        className={clsx(
          "max-w-[85%] text-sm rounded-2xl px-3.5 py-2.5 leading-relaxed",
          isUser
            ? "bg-blood-600 text-white rounded-br-md shadow-sm"
            : msg.err
              ? "bg-blood-50 text-blood-800 border border-blood-100 rounded-bl-md"
              : "bg-white text-ink-800 border border-ink-100 shadow-sm rounded-bl-md",
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}
