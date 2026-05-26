import { ThreadPrimitive, ComposerPrimitive, MessagePrimitive } from "@assistant-ui/react";

export function Thread() {
  return (
    <ThreadPrimitive.Root className="thread">
      <ThreadPrimitive.Viewport className="thread-viewport">
        <ThreadPrimitive.Empty>
          <div className="thread-empty">Ask about the venue...</div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="message user-message">
                <div className="message-bubble user-bubble"><MessagePrimitive.Content /></div>
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="message assistant-message">
                <div className="message-bubble assistant-bubble"><MessagePrimitive.Content /></div>
              </MessagePrimitive.Root>
            ),
          }}
        />
      </ThreadPrimitive.Viewport>
      <div className="composer-wrapper">
        <ComposerPrimitive.Root className="composer">
          <ComposerPrimitive.Input placeholder="Ask about the venue..." className="composer-input" />
          <ComposerPrimitive.Send className="composer-send">Send</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}
