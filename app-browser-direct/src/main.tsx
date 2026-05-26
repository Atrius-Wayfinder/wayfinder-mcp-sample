import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { Thread } from "./Thread";
import { chatAdapter } from "./chat-adapter";
import "./styles.css";

function App() {
  return (
    <AssistantRuntimeProvider runtime={useLocalRuntime(chatAdapter)}>
      <div className="app">
        <header className="app-header">
          <h1>Wayfinder Chat (Browser Direct)</h1>
        </header>
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
