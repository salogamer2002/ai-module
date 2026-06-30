/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Database operations layer for the AI-Chatbot module.
 *         Uses in-memory Maps as fallback until MongoDB is connected.
 *         Swap to Mongoose calls when repo access is granted.
 */

const crypto = require("crypto");
const ChatSession = require("../models/ChatSession");
const ChatMessage = require("../models/ChatMessage");
const ChatFeedback = require("../models/ChatFeedback");

// ─── In-Memory Storage (replace with MongoDB when connected) ────
const sessions = new Map();
const messages = new Map(); // sessionId → ChatMessage[]
const feedbacks = new Map();

// ═══════════════════════════════════════════════════════════════
//  SESSION OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a new chat session.
 * @param {string} userId
 * @param {string} title
 * @returns {object} Created session
 */
function createSession(userId, title = "New Chat") {
  const sessionId = crypto.randomUUID();
  const session = new ChatSession({ sessionId, userId, title });
  sessions.set(sessionId, session);
  messages.set(sessionId, []);
  return session.toJSON();
}

/**
 * Finds a session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
function findSessionById(sessionId) {
  const session = sessions.get(sessionId);
  return session ? session.toJSON() : null;
}

/**
 * Finds all sessions for a user.
 * @param {string} userId
 * @returns {object[]}
 */
function findUserSessions(userId) {
  const results = [];
  for (const session of sessions.values()) {
    if (session.userId === userId && session.status !== "deleted") {
      results.push(session.toJSON());
    }
  }
  return results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Deletes a session (soft delete).
 * @param {string} sessionId
 * @returns {boolean}
 */
function deleteSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.status = "deleted";
  session.updatedAt = new Date();
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Saves a message to a session.
 * @param {string} sessionId
 * @param {string} role
 * @param {string} content
 * @param {string|null} intent
 * @param {object[]|null} results
 * @returns {object} Created message
 */
function saveMessage(sessionId, role, content, intent = null, results = null) {
  const messageId = crypto.randomUUID();
  const message = new ChatMessage({ messageId, sessionId, role, content, intent, results });

  if (!messages.has(sessionId)) {
    messages.set(sessionId, []);
  }
  messages.get(sessionId).push(message);

  // Update session
  const session = sessions.get(sessionId);
  if (session) {
    session.messageCount += 1;
    session.lastMessageAt = new Date();
    session.updatedAt = new Date();
    // Auto-title from first user message
    if (session.title === "New Chat" && role === "user") {
      session.title = content.substring(0, 50) + (content.length > 50 ? "..." : "");
    }
  }

  return message.toJSON();
}

/**
 * Finds all messages for a session.
 * @param {string} sessionId
 * @returns {object[]}
 */
function findMessagesBySession(sessionId) {
  const msgs = messages.get(sessionId) || [];
  return msgs.map((m) => m.toJSON());
}

// ═══════════════════════════════════════════════════════════════
//  FEEDBACK OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Saves feedback for a message.
 * @param {string} messageId
 * @param {string} sessionId
 * @param {number|null} rating
 * @param {string} comment
 * @returns {object} Created feedback
 */
function saveFeedback(messageId, sessionId, rating = null, comment = "") {
  const feedbackId = crypto.randomUUID();
  const feedback = new ChatFeedback({ feedbackId, messageId, sessionId, rating, comment });
  feedbacks.set(feedbackId, feedback);
  return feedback.toJSON();
}

module.exports = {
  createSession,
  findSessionById,
  findUserSessions,
  deleteSession,
  saveMessage,
  findMessagesBySession,
  saveFeedback,
};
