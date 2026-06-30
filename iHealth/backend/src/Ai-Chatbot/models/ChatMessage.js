/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason MongoDB schema for chat messages. Stores individual messages
 *         within chat sessions including intent, results, and role.
 */

/*
const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ["user", "assistant", "system"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  intent: {
    type: String,
    enum: ["greeting", "doctor_search", "rag", null],
    default: null,
  },
  results: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  provider: {
    type: String,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
*/

class ChatMessage {
  constructor({ messageId, sessionId, role, content, intent = null, results = null }) {
    this.messageId = messageId;
    this.sessionId = sessionId;
    this.role = role;
    this.content = content;
    this.intent = intent;
    this.results = results;
    this.provider = null;
    this.metadata = {};
    this.createdAt = new Date();
  }

  toJSON() {
    return {
      messageId: this.messageId,
      sessionId: this.sessionId,
      role: this.role,
      content: this.content,
      intent: this.intent,
      results: this.results,
      provider: this.provider,
      metadata: this.metadata,
      createdAt: this.createdAt,
    };
  }
}

module.exports = ChatMessage;
