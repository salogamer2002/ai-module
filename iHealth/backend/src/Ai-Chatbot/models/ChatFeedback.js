/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason MongoDB schema for chat feedback. Stores user ratings and
 *         comments on AI responses for quality improvement.
 */

/*
const mongoose = require("mongoose");

const ChatFeedbackSchema = new mongoose.Schema({
  feedbackId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  messageId: {
    type: String,
    required: true,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  comment: {
    type: String,
    default: "",
  },
  helpful: {
    type: Boolean,
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("ChatFeedback", ChatFeedbackSchema);
*/

class ChatFeedback {
  constructor({ feedbackId, messageId, sessionId, rating = null, comment = "", helpful = null }) {
    this.feedbackId = feedbackId;
    this.messageId = messageId;
    this.sessionId = sessionId;
    this.rating = rating;
    this.comment = comment;
    this.helpful = helpful;
    this.createdAt = new Date();
  }

  toJSON() {
    return {
      feedbackId: this.feedbackId,
      messageId: this.messageId,
      sessionId: this.sessionId,
      rating: this.rating,
      comment: this.comment,
      helpful: this.helpful,
      createdAt: this.createdAt,
    };
  }
}

module.exports = ChatFeedback;
