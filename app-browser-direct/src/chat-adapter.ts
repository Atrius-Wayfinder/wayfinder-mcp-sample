import OpenAI from "openai";
import type { ChatModelAdapter } from "@assistant-ui/react";
import { config } from "../../config";

const MCP_URL = `/mcp-proxy/${config.mcpAccountId}?venueId=${config.mcpVenueId}`;

const openai = new OpenAI({
  baseURL: `${window.location.origin}/openai-proxy/openai/deployments/${config.openAiDeployment}`,
  apiKey: config.openAiApiKey,
  defaultQuery: { "api-version": config.openAiApiVersion },
  defaultHeaders: { "api-key": config.openAiApiKey },
  dangerouslyAllowBrowser: true,
});

class MCPClient {
  sessionId = null;
  tools = null;
  nextId = 1;

  async request(method, params = {}) {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data.result) return data.result;
        }
      }
    }
    return (await res.json()).result;
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "demo", version: "1.0.0" },
    });
  }

  async listTools() {
    if (this.tools) return this.tools;
    if (!this.sessionId) await this.initialize();
    this.tools = (await this.request("tools/list")).tools;
    return this.tools;
  }

  async callTool(name, args) {
    if (!this.sessionId) await this.initialize();
    return this.request("tools/call", { name, arguments: args });
  }
}

const mcpClient = new MCPClient();

export const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const mcpTools = await mcpClient.listTools();
    const tools = mcpTools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description || "", parameters: t.inputSchema },
    }));

    const history: any[] = messages.map((m) => ({
      role: m.role,
      content: m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    }));

    let fullText = "";

    for (let step = 0; step < 10; step++) {
      const stream = await openai.chat.completions.create(
        { model: config.openAiDeployment, messages: history, tools, stream: true },
        { signal: abortSignal }
      );

      let stepText = "";
      const toolCalls = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          stepText += delta.content;
          yield { content: [{ type: "text", text: fullText + stepText }] };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const cur = toolCalls.get(tc.index) || { id: "", function: { name: "", arguments: "" } };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.function.name += tc.function.name;
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
            toolCalls.set(tc.index, cur);
          }
        }
      }

      fullText += stepText;
      if (toolCalls.size === 0) break;

      history.push({
        role: "assistant",
        content: stepText || null,
        tool_calls: [...toolCalls.values()].map((tc) => ({ id: tc.id, type: "function", function: tc.function })),
      });

      for (const tc of toolCalls.values()) {
        const result = await mcpClient.callTool(tc.function.name, JSON.parse(tc.function.arguments));
        const text = result.content?.map((c) => c.text ?? JSON.stringify(c)).join("\n") ?? JSON.stringify(result);
        history.push({ role: "tool", tool_call_id: tc.id, content: text });
      }
    }
  },
};
