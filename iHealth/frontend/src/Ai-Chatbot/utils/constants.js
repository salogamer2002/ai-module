/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Shared constants for the Ai-Chatbot frontend module.
 */

// API base path for the chatbot module
export const API_BASE = "/api/v1/chatbot";

// Legacy API base (backwards compatible)
export const API_LEGACY = "/api";

// API Key for backend authentication (set via environment variable)
// In dev, the proxy forwards requests so no key needed unless CHATBOT_API_KEY is set
export const API_KEY = process.env.REACT_APP_CHATBOT_API_KEY || "";

// SpeechRecognition cross-browser support
export const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * Returns common headers for API calls including auth.
 * @returns {object} Headers object
 */
export function getApiHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  return headers;
}
