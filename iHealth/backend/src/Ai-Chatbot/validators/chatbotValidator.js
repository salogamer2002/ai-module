/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Input validation middleware for the AI-Chatbot module.
 *         Validates request bodies and params before they reach controllers.
 *         Production-hardened with XSS/HTML sanitization.
 */

/**
 * Strips dangerous HTML/script tags from user input (XSS prevention).
 * @param {string} str - Raw input string
 * @returns {string} Sanitized string
 */
function sanitizeInput(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}
function validateMessage(req, res, next) {
  const { message } = req.body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Query cannot be empty. 'message' field is required." });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: "Message exceeds maximum length of 5000 characters." });
  }
  req.body.message = sanitizeInput(message.trim());
  next();
}

/**
 * Validates messages array for POST /stream and POST /chat endpoints.
 */
function validateStreamChat(req, res, next) {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required and cannot be empty." });
  }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.role || !msg.content) {
      return res.status(400).json({ error: `Invalid message at index ${i}: role and content are required.` });
    }
    if (!["user", "assistant", "system"].includes(msg.role)) {
      return res.status(400).json({ error: `Invalid role '${msg.role}' at index ${i}. Must be user, assistant, or system.` });
    }
    // Sanitize user-provided content
    if (msg.role === "user") {
      msg.content = sanitizeInput(msg.content);
    }
  }
  next();
}

/**
 * Validates text body for POST /tts endpoints.
 */
function validateTTS(req, res, next) {
  const { text } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > 10000) {
    return res.status(400).json({ error: "Text exceeds maximum length of 10000 characters for TTS." });
  }
  next();
}

/**
 * Validates session creation body.
 */
function validateSession(req, res, next) {
  const { userId } = req.body;
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    return res.status(400).json({ error: "'userId' is required to create a session." });
  }
  req.body.userId = userId.trim();
  next();
}

/**
 * Validates sessionId route parameter.
 */
function validateSessionId(req, res, next) {
  const { sessionId, id } = req.params;
  const sid = sessionId || id;
  if (!sid || typeof sid !== "string" || sid.trim().length === 0) {
    return res.status(400).json({ error: "Valid session ID is required." });
  }
  next();
}

/**
 * Validates feedback body.
 */
function validateFeedback(req, res, next) {
  const { messageId, rating } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: "'messageId' is required." });
  }
  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: "'rating' must be a number between 1 and 5." });
  }
  next();
}

module.exports = {
  validateMessage,
  validateStreamChat,
  validateTTS,
  validateSession,
  validateSessionId,
  validateFeedback,
};
