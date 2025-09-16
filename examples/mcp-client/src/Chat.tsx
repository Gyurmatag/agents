import { use, useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import { isToolUIPart } from "ai";

// Minimal, framework-free chat UI inspired by the provided design

const toolsRequiringConfirmation: string[] = [];

type ToolUIPart = {
  type: string;
  state: string;
  toolCallId: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ToolInvocationCard({
  part,
  onAddResult
}: {
  part: ToolUIPart;
  onAddResult: (toolCallId: string, result: unknown) => void;
}) {
  const toolName = part.type.replace("tool-", "");
  const needsConfirmation = toolsRequiringConfirmation.includes(toolName);

  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <div className="tool-name">Tool: {toolName}</div>
        <div className={`tool-state ${part.state}`}>state: {part.state}</div>
      </div>
      {part.input !== undefined && (
        <pre className="tool-io">{JSON.stringify(part.input, null, 2)}</pre>
      )}
      {part.errorText && <div className="tool-error">{part.errorText}</div>}
      {part.state === "input-available" && (
        <div className="tool-actions">
          <button
            type="button"
            onClick={() =>
              onAddResult(
                part.toolCallId,
                needsConfirmation ? { approved: true } : { acknowledged: true }
              )
            }
          >
            {needsConfirmation ? "Approve" : "Acknowledge"}
          </button>
        </div>
      )}
      {part.state === "output-available" && part.output !== undefined && (
        <pre className="tool-io">{JSON.stringify(part.output, null, 2)}</pre>
      )}
    </div>
  );
}

const hasOpenAiKeyPromise = fetch("/check-open-ai-key").then((res) =>
  res.json<{ success: boolean }>()
);

function HasOpenAIKey() {
  // React 19 use() to suspend during fetch
  const hasOpenAiKey = use(hasOpenAiKeyPromise);
  if (hasOpenAiKey.success) return null;
  return (
    <div className="key-banner">
      <div className="key-banner-inner">
        <div className="key-banner-title">OpenAI API Key Not Configured</div>
        <div className="key-banner-text">
          Requests to the API will not work until an OpenAI API key is
          configured. Set a Workers secret named <code>OPENAI_API_KEY</code>.
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Ensure a stable session id so the Durable Object session is stable
  let sessionId = localStorage.getItem("sessionId");
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2, 10);
    localStorage.setItem("sessionId", sessionId);
  }

  const agent = useAgent({ agent: "my-agent", name: sessionId });

  const { messages, addToolResult, clearHistory, status, sendMessage, stop } =
    useAgentChat({ agent });

  const [input, setInput] = useState("");

  const handleSubmit = async (
    e: React.FormEvent,
    extraData?: Record<string, unknown>
  ) => {
    e.preventDefault();
    if (!input.trim()) return;
    const message = input;
    setInput("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }]
    });
  };

  useEffect(() => {
    messages.length > 0 && scrollToBottom();
  }, [messages, scrollToBottom]);

  const pendingToolCallConfirmation = messages.some((m: any) =>
    m.parts?.some(
      (part: any) =>
        isToolUIPart(part) &&
        part.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          part.type.replace("tool-", "") as string
        )
    )
  );

  return (
    <div className="chat-shell">
      <HasOpenAIKey />

      <div className="chat-head">
        <div className="chat-title">AI Chat Agent</div>
        <div className="chat-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setShowDebug((v) => !v)}
          >
            {showDebug ? "Hide Debug" : "Show Debug"}
          </button>
          <button type="button" className="ghost" onClick={clearHistory}>
            Clear
          </button>
        </div>
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-title">Welcome to AI Chat</div>
            <div className="empty-text">
              Start a conversation with your AI assistant. Try asking about
              weather or local time.
            </div>
          </div>
        )}

        {messages.map((m: any, index: number) => {
          const isUser = m.role === "user";
          const showAvatar =
            index === 0 || messages[index - 1]?.role !== m.role;
          return (
            <div key={m.id} className={`row ${isUser ? "right" : "left"}`}>
              {showDebug && (
                <pre className="debug">{JSON.stringify(m, null, 2)}</pre>
              )}
              <div className={`bubble ${isUser ? "user" : "assistant"}`}>
                {m.parts?.map((part: any, i: number) => {
                  if (part.type === "text") {
                    return (
                      <div key={`${m.id}-${i}`} className="text-part">
                        {part.text}
                        <div className="meta">
                          {formatTime(
                            m.metadata?.createdAt
                              ? new Date(m.metadata.createdAt)
                              : new Date()
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (isToolUIPart(part)) {
                    return (
                      <ToolInvocationCard
                        key={`${part.toolCallId}-${i}`}
                        part={part as unknown as ToolUIPart}
                        onAddResult={(toolCallId, result) =>
                          addToolResult({
                            tool: (part.type as string).replace("tool-", ""),
                            toolCallId,
                            output: result
                          })
                        }
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(e);
          setTextareaHeight("auto");
        }}
      >
        <textarea
          disabled={pendingToolCallConfirmation}
          placeholder={
            pendingToolCallConfirmation
              ? "Please respond to the tool confirmation above..."
              : "Send a message..."
          }
          className="chat-textarea"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            setTextareaHeight(`${e.target.scrollHeight}px`);
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              // @ts-expect-error React typing in DOM
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void handleSubmit(e as unknown as React.FormEvent);
              setTextareaHeight("auto");
            }
          }}
          rows={2}
          style={{ height: textareaHeight }}
        />
        <div className="chat-buttons">
          {status === "submitted" || status === "streaming" ? (
            <button type="button" onClick={stop} aria-label="Stop generation">
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={pendingToolCallConfirmation || !input.trim()}
              aria-label="Send message"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
