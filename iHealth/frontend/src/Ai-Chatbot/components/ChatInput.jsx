/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Chat input form component for text mode.
 */
import React from "react";

function ChatInput({ inputValue, setInputValue, isProcessing, onSubmit }) {
  return (
    <form className="chat-input-container" onSubmit={onSubmit}>
      <div className="chat-input-wrapper">
        <input
          className="chat-input"
          type="text"
          placeholder="Ask ARIA anything about health…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isProcessing}
          aria-label="Chat message input"
        />
        <button
          className="chat-send-btn"
          type="submit"
          disabled={!inputValue.trim() || isProcessing}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </form>
  );
}

export default ChatInput;
