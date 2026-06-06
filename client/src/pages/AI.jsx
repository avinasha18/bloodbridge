import { useState } from "react";
import { Send, Bot, Sparkles } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import Spinner from "../components/ui/Spinner";
import { endpoints } from "../lib/api";

const SUGGESTIONS = [
  "How many O Negative donors do we have?",
  "Show me upcoming transfusions this week",
  "How many at-risk donors are being over-contacted?",
  "What blood types are in critical shortage?",
  "How is the system performing today?",
];

export default function AI() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi — I'm BloodBridge AI. Ask me about donors, transfusions, performance, or shortages.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text) {
    const q = text ?? input;
    if (!q.trim()) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await endpoints.nlQuery(q);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: r.answer, intent: r.intent, data: r.data },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I hit an error: " + e.message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        subtitle="Bedrock-powered natural language interface for operators"
      />

      <Section title="Conversation">
        <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} content={m.content} intent={m.intent} data={m.data} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Spinner /> Thinking…
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            className="input flex-1"
            placeholder="Ask BloodBridge AI…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1 rounded-full bg-ink-100 text-ink-700 hover:bg-ink-200 transition-colors"
            >
              <Sparkles className="inline w-3 h-3 mr-1 text-indigo-500" />
              {s}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Message({ role, content, intent, data }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-blood-600 text-white rounded-br-none"
            : "bg-ink-100 text-ink-800 rounded-bl-none"
        }`}
      >
        <div className="whitespace-pre-line">{content}</div>
        {intent && intent !== "help" && (
          <div className="text-[11px] mt-1 opacity-70 font-mono">
            intent: {intent}
            {data && Object.keys(data).length > 0 && " · " + JSON.stringify(data)}
          </div>
        )}
      </div>
    </div>
  );
}
