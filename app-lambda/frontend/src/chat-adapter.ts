import type { ChatModelAdapter } from "@assistant-ui/react";
import { config } from "../../../config";

export const chatAdapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    const payload = messages.map((m) => ({
      role: m.role,
      content: m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    }));
    const res = await fetch(config.lambdaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
      signal: abortSignal,
    });
    return res.json();
  },
};
