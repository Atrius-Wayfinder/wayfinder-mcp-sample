import OpenAI from "openai";
import { config } from "../../../config";

const MCP_URL = `${config.mcpBaseUrl}/${config.mcpAccountId}?venueId=${config.mcpVenueId}`;

const openai = new OpenAI({
  baseURL: `${config.openAiEndpoint}/openai/deployments/${config.openAiDeployment}`,
  apiKey: config.openAiApiKey,
  defaultQuery: { "api-version": config.openAiApiVersion },
  defaultHeaders: { "api-key": config.openAiApiKey },
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

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers: CORS };
  }

  const { messages } = JSON.parse(event.body || "{}");
  const mcpClient = new MCPClient();

  const mcpTools = await mcpClient.listTools();
  const tools = mcpTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description || "", parameters: t.inputSchema },
  }));

  const history: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < 10; step++) {
    const response = await openai.chat.completions.create({ model: config.openAiDeployment, messages: history, tools });
    const msg = response.choices[0].message;

    if (!msg.tool_calls?.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ content: [{ type: "text", text: msg.content || "" }] }) };
    }

    history.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });

    for (const tc of msg.tool_calls) {
      const result = await mcpClient.callTool(tc.function.name, JSON.parse(tc.function.arguments));
      const text = result.content?.map((c) => c.text ?? JSON.stringify(c)).join("\n") ?? JSON.stringify(result);
      history.push({ role: "tool", tool_call_id: tc.id, content: text });
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ content: [{ type: "text", text: "No response." }] }) };
};
