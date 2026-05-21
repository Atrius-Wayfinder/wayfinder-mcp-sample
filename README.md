# Wayfinder MCP Demo

Demos for integrating the [Wayfinder](https://atrius.com) MCP server with Azure OpenAI in a React chat UI.

## Approaches

### [Browser Direct](app-browser-direct/README.md)
React SPA that calls Azure OpenAI and the MCP server directly from the browser. No backend required — API keys are exposed, suitable for prototyping only.

→ [Code walkthrough](doc-browser-direct.md)

### [Lambda Backend](app-lambda/README.md)
React SPA backed by an AWS Lambda that handles all AI and MCP communication server-side. API keys stay secure.

→ [Code walkthrough](doc-lambda.md)

## Configuration

All shared settings (MCP server, OpenAI endpoint, API keys, Lambda URL) are in [`config.ts`](config.ts) at the project root. It must be configured before using this project.
