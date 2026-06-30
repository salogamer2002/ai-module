/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Route definitions for the AI-Chatbot module.
 *         All endpoints mounted under /api/v1/chatbot by index.js.
 */

const express = require("express");
const router = express.Router();

const controller = require("../controllers/chatbotController");
const {
  validateMessage,
  validateStreamChat,
  validateTTS,
  validateSession,
  validateSessionId,
  validateFeedback,
} = require("../validators/chatbotValidator");

// ═══════════════════════════════════════════════════════════════
//  CORE AI ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/chatbot/message — Non-streaming query (supervisor → agent pipeline)
router.post("/message", validateMessage, controller.handleQuery);

// POST /api/v1/chatbot/stream — SSE streaming LLM with agent pipeline
router.post("/stream", validateStreamChat, controller.handleStreamChat);

// POST /api/v1/chatbot/chat — Non-streaming chat fallback
router.post("/chat", validateStreamChat, controller.handleChat);

// ═══════════════════════════════════════════════════════════════
//  TTS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/chatbot/tts — Smart 3-tier auto-fallback TTS
router.post("/tts", validateTTS, controller.handleTTS);

// POST /api/v1/chatbot/tts/cartesia — Direct Cartesia TTS
router.post("/tts/cartesia", validateTTS, controller.handleTTSCartesia);

// ═══════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/chatbot/session — Create a new chat session
router.post("/session", validateSession, controller.createSession);

// GET /api/v1/chatbot/sessions — Get all sessions for a user
router.get("/sessions", controller.getUserSessions);

// GET /api/v1/chatbot/messages/:sessionId — Get conversation messages
router.get("/messages/:sessionId", validateSessionId, controller.getSessionMessages);

// DELETE /api/v1/chatbot/session/:id — Delete a session
router.delete("/session/:id", validateSessionId, controller.deleteSession);

// ═══════════════════════════════════════════════════════════════
//  FEEDBACK & HEALTH
// ═══════════════════════════════════════════════════════════════

// POST /api/v1/chatbot/feedback — Submit feedback on a response
router.post("/feedback", validateFeedback, controller.handleFeedback);

// GET /api/v1/chatbot/health — Health check
router.get("/health", controller.handleHealth);

module.exports = router;
