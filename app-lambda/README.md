# Wayfinder Chat — Lambda

React SPA backed by an AWS Lambda that handles all Azure OpenAI and MCP communication server-side.

## 1. Configure

Edit [`config.ts`](../config.ts) at the project root with your Wayfinder and Azure OpenAI credentials:

```ts
export const config = {
  mcpAccountId: "YOUR_WAYFINDER_ACCOUNT_ID",
  mcpVenueId: "YOUR_VENUE_ID",
  openAiEndpoint: "https://YOUR_RESOURCE.openai.azure.com",
  openAiApiKey: "YOUR_AZURE_API_KEY",
  openAiDeployment: "YOUR_MODEL_DEPLOYMENT",
  openAiApiVersion: "2024-12-01-preview",
  // lambdaUrl is set automatically after deploy
};
```

## 2. Set up AWS credentials

The deploy script reads credentials from `.env.local` at the project root:

```bash
# wayfinder-mcp-demo/.env.local
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...      # only needed for temporary/SSO credentials
```

Alternatively, configure the AWS CLI directly (`aws configure`) — the deploy script will use the default profile if `.env.local` is absent.

The AWS account needs permission to create IAM roles and Lambda functions.

## 3. Deploy the Lambda

```bash
cd lambda
npm install
npm run deploy
```

This builds the function, deploys it to AWS, and **automatically updates `lambdaUrl` in `config.ts`** with the live endpoint.

## 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5174

## How it works

The frontend sends the chat history to the Lambda via a single POST request. The Lambda connects to the Wayfinder MCP server to discover tools, runs the OpenAI tool-calling loop to completion, then returns the final response. The frontend has no direct knowledge of MCP or OpenAI.
