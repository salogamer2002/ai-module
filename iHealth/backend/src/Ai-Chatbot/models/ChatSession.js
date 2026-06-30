/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason MongoDB schema for chat sessions. Tracks user conversations
 *         with the AI chatbot. Ready for MongoDB integration when repo access is granted.
 */

// ─── Schema Definition (Mongoose-ready) ─────────────────────────
// When MongoDB is connected, uncomment mongoose lines and use the schema.
// For now, this serves as the data model contract.

/*
const mongoose = require("mongoose");

const ChatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: "New Chat",
  },
  status: {
    type: String,
    enum: ["active", "archived", "deleted"],
    default: "active",
  },
  messageCount: {
    type: Number,
    default: 0,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("ChatSession", ChatSessionSchema);
*/

// ─── In-Memory Model (active until MongoDB is connected) ────────
class ChatSession {
  constructor({ sessionId, userId, title = "New Chat" }) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.title = title;
    this.status = "active";
    this.messageCount = 0;
    this.lastMessageAt = new Date();
    this.metadata = {};
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      title: this.title,
      status: this.status,
      messageCount: this.messageCount,
      lastMessageAt: this.lastMessageAt,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = ChatSession;
