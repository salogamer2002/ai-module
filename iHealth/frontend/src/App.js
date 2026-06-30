/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Root App component — mounts the Ai-Chatbot module.
 *         Thin shell that imports the module entry point.
 */
import React from 'react';
import AiChatbotModule from './Ai-Chatbot/routes';

function App() {
  return <AiChatbotModule />;
}

export default App;
