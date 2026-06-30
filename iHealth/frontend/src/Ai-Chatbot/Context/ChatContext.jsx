/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason React Context provider for the Ai-Chatbot module state.
 *         Provides shared chat state to all child components.
 */
import React, { createContext, useContext, useState, useRef } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState("voice");
  const [voiceActive, setVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState(null);

  // Refs for sync state
  const messagesRef = useRef([]);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const voiceActiveRef = useRef(false);

  const value = {
    messages, setMessages,
    mode, setMode,
    voiceActive, setVoiceActive,
    isListening, setIsListening,
    isSpeaking, setIsSpeaking,
    isProcessing, setIsProcessing,
    streamingText, setStreamingText,
    interimText, setInterimText,
    inputValue, setInputValue,
    error, setError,
    messagesRef,
    isProcessingRef,
    isSpeakingRef,
    voiceActiveRef,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

export default ChatContext;
