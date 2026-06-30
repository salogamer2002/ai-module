/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason API helper functions for the Ai-Chatbot frontend module.
 *         Wraps all backend endpoint calls with authentication headers.
 *         Production-hardened with timeouts, safe parsing, and error handling.
 */

import { API_BASE, getApiHeaders } from "./constants";

/** Default timeout for non-streaming requests (15 seconds) */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Creates an AbortController with a timeout.
 * @param {number} ms - Timeout in milliseconds
 * @returns {{controller: AbortController, clear: function}}
 */
function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Safely parse JSON response — never throws on malformed JSON.
 * @param {Response} res - Fetch response
 * @returns {Promise<object>}
 */
async function safeJsonParse(res) {
  try {
    return await res.json();
  } catch (e) {
    return { error: `Failed to parse response (status ${res.status})` };
  }
}

/**
 * Send a non-streaming message to the chatbot.
 * @param {string} message - User message text
 * @returns {Promise<object>} Response with intent, response, results
 */
export async function sendMessage(message) {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(`${API_BASE}/message`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ message }),
      signal,
    });
    clear();
    return safeJsonParse(res);
  } catch (err) {
    clear();
    if (err.name === "AbortError") {
      return { error: "Request timed out. Please try again." };
    }
    return { error: err.message || "Network error" };
  }
}

/**
 * Open an SSE streaming connection for chat.
 * @param {object[]} messages - Conversation messages array
 * @returns {Promise<Response>} Fetch Response with readable stream
 */
export async function streamChat(messages) {
  return fetch(`${API_BASE}/stream`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({ messages }),
  });
}

/**
 * Request TTS audio from the backend (3-tier fallback).
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Response>} Audio response or error
 */
export async function requestTTS(text) {
  const { signal, clear } = withTimeout(10000);
  try {
    const res = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ text }),
      signal,
    });
    clear();
    return res;
  } catch (err) {
    clear();
    throw err;
  }
}

/**
 * Request TTS audio via Cartesia directly.
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Response>}
 */
export async function requestTTSCartesia(text) {
  const { signal, clear } = withTimeout(10000);
  try {
    const res = await fetch(`${API_BASE}/tts/cartesia`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ text }),
      signal,
    });
    clear();
    return res;
  } catch (err) {
    clear();
    throw err;
  }
}

/**
 * Create a new chat session.
 * @param {string} userId
 * @param {string} title
 * @returns {Promise<object>}
 */
export async function createSession(userId, title) {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(`${API_BASE}/session`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ userId, title }),
      signal,
    });
    clear();
    return safeJsonParse(res);
  } catch (err) {
    clear();
    return { error: err.message || "Network error" };
  }
}

/**
 * Get health check status.
 * @returns {Promise<object>}
 */
export async function getHealth() {
  const { signal, clear } = withTimeout(5000);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal });
    clear();
    return safeJsonParse(res);
  } catch (err) {
    clear();
    return { status: "unreachable", error: err.message };
  }
}

