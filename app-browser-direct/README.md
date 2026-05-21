# Wayfinder Chat — Browser Direct

React SPA that connects directly from the browser to Azure OpenAI and the Wayfinder MCP server. No backend required.

> **Warning**: API keys are exposed in the browser. For prototyping/POC only.

## 1. Configure

Edit [`config.ts`](../config.ts) at the project root:

```ts
export const config = {
  mcpAccountId: "YOUR_WAYFINDER_ACCOUNT_ID",  // from your Wayfinder dashboard
  mcpVenueId: "YOUR_VENUE_ID",                // e.g. "phx"
  openAiEndpoint: "https://YOUR_RESOURCE.openai.azure.com",
  openAiApiKey: "YOUR_AZURE_API_KEY",
  openAiDeployment: "YOUR_MODEL_DEPLOYMENT",   // e.g. "gpt-4o-mini"
  openAiApiVersion: "2024-12-01-preview",
  // ...
};
```

## 2. Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

## How it works

The app uses a [Vite dev proxy](vite.config.ts) to forward requests to the MCP server and Azure OpenAI, avoiding CORS restrictions. The chat adapter fetches available MCP tools on first message, then drives the OpenAI tool-calling loop — streaming text to the UI while executing any tool calls against the MCP server.
