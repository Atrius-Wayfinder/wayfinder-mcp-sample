# Browser-Direct AI Chat with MCP Server

A minimal single-page app that connects directly from the browser to Azure OpenAI and an MCP (Model Context Protocol) server. No backend needed.

> **Warning**: This approach exposes API keys in the browser. Use only for prototyping/POC.

## Architecture

```
Browser (React SPA)
  ├── Azure OpenAI API  (chat completions with tools)
  └── MCP Server        (tool definitions + tool execution)
```

## Dependencies

```bash
npm install @assistant-ui/react openai
```

## MCP Client

A minimal client that talks to the MCP server using JSON-RPC over HTTP:

```js
const MCP_URL = "https://mcp.example.com/YOUR_PATH";

class MCPClient {
  sessionId = null;
  tools = null;
  nextId = 1;

  async request(method, params = {}) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    // Server may respond with SSE or plain JSON
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
    return this.request("tools/call", { name, arguments: args });
  }
}
```

## Chat Adapter

The adapter fetches MCP tools then drives the OpenAI tool-calling loop, streaming text to the UI:

```js
import OpenAI from "openai";

const DEPLOYMENT = "gpt-4o-mini";

const openai = new OpenAI({
  baseURL: "https://YOUR_ENDPOINT/openai/deployments/" + DEPLOYMENT,
  apiKey: "YOUR_API_KEY",
  defaultQuery: { "api-version": "2024-12-01-preview" },
  defaultHeaders: { "api-key": "YOUR_API_KEY" },
  dangerouslyAllowBrowser: true,
});

const mcpClient = new MCPClient();

const chatAdapter = {
  async *run({ messages, abortSignal }) {
    // Get MCP tools
    const mcpTools = await mcpClient.listTools();
    const tools = mcpTools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));

    // Convert messages to OpenAI format
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    }));

    let fullText = "";

    // Tool-calling loop
    for (let step = 0; step < 10; step++) {
      const stream = await openai.chat.completions.create(
        { model: DEPLOYMENT, messages: history, tools, stream: true },
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

      // Execute tool calls and feed results back
      history.push({
        role: "assistant",
        content: stepText || null,
        tool_calls: [...toolCalls.values()].map((tc) => ({
          id: tc.id, type: "function", function: tc.function,
        })),
      });

      for (const tc of toolCalls.values()) {
        const result = await mcpClient.callTool(tc.function.name, JSON.parse(tc.function.arguments));
        const text = result.content?.map((c) => c.text ?? JSON.stringify(c)).join("\n") ?? JSON.stringify(result);
        history.push({ role: "tool", tool_call_id: tc.id, content: text });
      }
    }
  },
};
```

## React UI

Wire the adapter into assistant-ui:

```jsx
import {
  AssistantRuntimeProvider, useLocalRuntime,
  ThreadPrimitive, ComposerPrimitive, MessagePrimitive,
} from "@assistant-ui/react";

function Thread() {
  return (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Viewport>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => <MessagePrimitive.Root><MessagePrimitive.Content /></MessagePrimitive.Root>,
            AssistantMessage: () => <MessagePrimitive.Root><MessagePrimitive.Content /></MessagePrimitive.Root>,
          }}
        />
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input placeholder="Type a message..." />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

export default function App() {
  const runtime = useLocalRuntime(chatAdapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## Key Concepts

- **`useLocalRuntime`**: Manages chat state. Takes a `ChatModelAdapter` with a `run` function.
- **`run` async generator**: Yields `{ content: [...] }` objects. Each yield updates the displayed message (cumulative, not delta).
- **MCP protocol**: JSON-RPC over HTTP. Initialize session → list tools → call tools.
- **Tool-calling loop**: Send messages + tools to OpenAI → execute any `tool_calls` via MCP → append results → repeat until no more tool calls.
