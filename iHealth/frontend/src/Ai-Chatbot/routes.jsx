/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Route definitions for the Ai-Chatbot frontend module.
 *         Exports the ChatPage as the default route for this module.
 */
import React from "react";
import { ChatProvider } from "./Context/ChatContext";
import ChatPage from "./pages/ChatPage";

/**
 * Main module component — wraps ChatPage with ChatProvider context.
 * Use this as the entry point when mounting the Ai-Chatbot module.
 */
function AiChatbotModule() {
  return (
    <ChatProvider>
      <ChatPage />
    </ChatProvider>
  );
}

export default AiChatbotModule;
