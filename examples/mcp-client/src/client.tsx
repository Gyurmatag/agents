import { useAgent } from "agents/react";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { MCPServersState } from "agents";
import { agentFetch } from "agents/client";
import { nanoid } from "nanoid";
import Chat from "./Chat";

let sessionId = localStorage.getItem("sessionId");
if (!sessionId) {
  sessionId = nanoid(8);
  localStorage.setItem("sessionId", sessionId);
}
// TODO: clear sessionId on logout

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const mcpUrlInputRef = useRef<HTMLInputElement>(null);
  const mcpNameInputRef = useRef<HTMLInputElement>(null);
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });

  const agent = useAgent({
    agent: "my-agent",
    name: sessionId!,
    onClose: () => setIsConnected(false),
    onMcpUpdate: (mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    },
    onOpen: () => setIsConnected(true)
  });

  function openPopup(authUrl: string) {
    window.open(
      authUrl,
      "popupWindow",
      "width=600,height=800,resizable=yes,scrollbars=yes,toolbar=yes,menubar=no,location=no,directories=no,status=yes"
    );
  }

  const handleMcpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mcpUrlInputRef.current || !mcpUrlInputRef.current.value.trim()) return;
    const serverUrl = mcpUrlInputRef.current.value;

    if (!mcpNameInputRef.current || !mcpNameInputRef.current.value.trim())
      return;
    const serverName = mcpNameInputRef.current.value;
    agentFetch(
      {
        agent: "my-agent",
        host: agent.host,
        name: sessionId!,
        path: "add-mcp"
      },
      {
        body: JSON.stringify({ name: serverName, url: serverUrl }),
        method: "POST"
      }
    );
    setMcpState({
      ...mcpState,
      servers: {
        ...mcpState.servers,
        placeholder: {
          auth_url: null,
          capabilities: null,
          instructions: null,
          name: serverName,
          server_url: serverUrl,
          state: "connecting"
        }
      }
    });
  };

  return (
    <div className="container">
      <div className="status-indicator">
        <div className={`status-dot ${isConnected ? "connected" : ""}`} />
        {isConnected ? "Connected to server" : "Disconnected"}
      </div>

      <div className="mcp-servers">
        <form className="mcp-form" onSubmit={handleMcpSubmit}>
          <input
            type="text"
            ref={mcpNameInputRef}
            className="mcp-input name"
            placeholder="MCP Server Name"
          />
          <input
            type="text"
            ref={mcpUrlInputRef}
            className="mcp-input url"
            placeholder="MCP Server URL"
          />
          <button type="submit">Add MCP Server</button>
        </form>
      </div>

      <div className="mcp-section">
        <h2>MCP Servers</h2>
        {Object.entries(mcpState.servers).map(([id, server]) => (
          <div key={id} className={"mcp-server"}>
            <div>
              <b>{server.name}</b> <span>({server.server_url})</span>
              <div className="status-indicator">
                <div
                  className={`status-dot ${server.state === "ready" ? "connected" : ""}`}
                />
                {server.state} (id: {id})
              </div>
            </div>
            {server.state === "authenticating" && server.auth_url && (
              <button
                type="button"
                onClick={() => openPopup(server.auth_url as string)}
              >
                Authorize
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                agentFetch(
                  {
                    agent: "my-agent",
                    host: agent.host,
                    name: sessionId!,
                    path: "remove-mcp"
                  },
                  {
                    body: JSON.stringify({ id }),
                    method: "POST"
                  }
                );
                setMcpState((prev) => {
                  const next = { ...prev, servers: { ...prev.servers } };
                  delete next.servers[id];
                  return next;
                });
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="messages-section">
        <h2>Chat</h2>
        <Chat />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
