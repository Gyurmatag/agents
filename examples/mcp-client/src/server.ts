import { type AgentNamespace, routeAgentRequest } from "agents";
import { MCPClientManager } from "agents/mcp/client";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";

type Env = {
  MyAgent: AgentNamespace<AIChatAgent>;
  HOST: string;
  OPENAI_API_KEY?: string;
};

// model is configured per-request with the API key from the environment

export class MyAgent extends AIChatAgent<Env, never> {
  mcp = new MCPClientManager("my-agent", "1.0.0");

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const provider = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const model = provider("gpt-4o-2024-11-20");
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions: {}
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks with MCP connections.`,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async onRequest(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.endsWith("add-mcp") && request.method === "POST") {
      const mcpServer = (await request.json()) as { url: string; name: string };
      await this.addMcpServer(mcpServer.name, mcpServer.url, this.env.HOST);
      return new Response("Ok", { status: 200 });
    }

    if (reqUrl.pathname.endsWith("remove-mcp") && request.method === "POST") {
      const body = (await request.json()) as { id?: string; name?: string };
      // remove by id is authoritative if provided; otherwise by name
      if (body?.id) {
        await this.removeMcpServer(body.id);
        return new Response("Ok", { status: 200 });
      }
      if (body?.name) {
        // look up id by name from current state and remove
        const current = this.getMcpServers();
        const entry = Object.entries(current.servers).find(
          ([, s]) => s.name === body.name
        );
        if (entry) {
          await this.removeMcpServer(entry[0]);
          return new Response("Ok", { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }
      return new Response("Bad Request", { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const success = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length);
      return new Response(JSON.stringify({ success }), {
        headers: { "content-type": "application/json" }
      });
    }

    return (
      (await routeAgentRequest(request, env, { cors: true })) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
