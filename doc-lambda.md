# Lambda-Backed AI Chat with MCP Server

A minimal setup where an AWS Lambda acts as a middle layer between the browser and Azure OpenAI + MCP server. API keys stay server-side.

## Architecture

```
Browser (React SPA)  ──POST──▶  AWS Lambda  ──▶  Azure OpenAI
                                    │
                                    └──▶  MCP Server
```

The browser sends chat messages to the Lambda. The Lambda fetches MCP tools, runs the OpenAI tool-calling loop, and returns the final response.

## Lambda Handler

The Lambda embeds the same MCP client as the browser-direct approach (see `doc-browser-direct.md`), plus an HTTP handler:

```js
import OpenAI from "openai";

const DEPLOYMENT = "gpt-4o-mini";
const MCP_URL = "https://mcp.example.com/YOUR_PATH";

const openai = new OpenAI({
  baseURL: "https://YOUR_ENDPOINT/openai/deployments/" + DEPLOYMENT,
  apiKey: "YOUR_API_KEY",
  defaultQuery: { "api-version": "2024-12-01-preview" },
  defaultHeaders: { "api-key": "YOUR_API_KEY" },
});

// MCP client (same as browser-direct, included here directly)
class MCPClient { /* ... see doc-browser-direct.md ... */ }

export const handler = async (event) => {
  const { messages } = JSON.parse(event.body || "{}");
  const mcpClient = new MCPClient();

  // Get MCP tools
  const mcpTools = await mcpClient.listTools();
  const tools = mcpTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const history = messages.map((m) => ({ role: m.role, content: m.content }));

  // Tool-calling loop
  for (let step = 0; step < 10; step++) {
    const response = await openai.chat.completions.create({
      model: DEPLOYMENT,
      messages: history,
      tools,
    });

    const msg = response.choices[0].message;

    if (!msg.tool_calls?.length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ content: [{ type: "text", text: msg.content || "" }] }),
      };
    }

    // Execute tool calls and feed results back
    history.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });

    for (const tc of msg.tool_calls) {
      const result = await mcpClient.callTool(tc.function.name, JSON.parse(tc.function.arguments));
      const text = result.content?.map((c) => c.text ?? JSON.stringify(c)).join("\n") ?? JSON.stringify(result);
      history.push({ role: "tool", tool_call_id: tc.id, content: text });
    }
  }
};
```

## Frontend Chat Adapter

The frontend is simpler — it just POSTs messages to the Lambda URL:

```js
const LAMBDA_URL = "https://YOUR_LAMBDA_URL/";

const chatAdapter = {
  async run({ messages, abortSignal }) {
    const payload = messages.map((m) => ({
      role: m.role,
      content: m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    }));

    const res = await fetch(LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
      signal: abortSignal,
    });

    return await res.json();
  },
};
```

## React UI

Same as the browser-direct approach — see `doc-browser-direct.md` for the `Thread` and `App` components. The only difference is using the Lambda adapter above instead of the streaming one.

## Comparison

| | Browser-Direct | Lambda |
|---|---|---|
| API keys | Exposed in browser | Secured server-side |
| Streaming | Yes | No (full response) |
| MCP connection | Browser → MCP | Lambda → MCP (no CORS issues) |
