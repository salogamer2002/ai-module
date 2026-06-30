/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Main entry point for the backend server (was server.js → renamed to index.js).
 *         Mounts the Ai-Chatbot module routes and external auth middleware.
 *         Production-ready with helmet, CORS, compression, rate limiting,
 *         request ID tracing, and graceful shutdown.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

// ─── External Auth (outside Ai-Chatbot module) ─────────────────
const { authenticateUser } = require("./auth");

// ─── Ai-Chatbot Module Routes ──────────────────────────────────
const chatbotRoutes = require("./src/Ai-Chatbot/routes/chatbotRoutes");

// ─── Ai-Chatbot Service (for initialization) ───────────────────
const { initializeKnowledgeBase, getProviderStatus, getDatabaseSize } = require("./src/Ai-Chatbot/services/chatbotService");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ═══════════════════════════════════════════════════════════════
//  MIDDLEWARE STACK (Production-Grade)
// ═══════════════════════════════════════════════════════════════

// Security headers
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS — restricted to configured origins
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  exposedHeaders: ["X-TTS-Gender", "X-TTS-Provider"],
}));

// Gzip compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
  skip: (req) => req.path === "/api/v1/chatbot/health" || req.path === "/api/health",
});
app.use(limiter);

// Unique request ID tracing
app.use((req, _res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// Production request logging (concise, structured)
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
    };
    if (process.env.NODE_ENV === 'production') {
      console[logLevel](JSON.stringify(logEntry));
    } else {
      const icon = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '✅';
      console[logLevel](`${icon} ${req.method} ${req.originalUrl || req.url} → ${res.statusCode} (${duration}ms)`);
    }
    originalEnd.apply(res, args);
  };
  next();
});

// ═══════════════════════════════════════════════════════════════
//  MOUNT ROUTES
// ═══════════════════════════════════════════════════════════════

// Mount Ai-Chatbot module at /api/v1/chatbot
// authenticateUser is the external auth — currently passthrough
app.use("/api/v1/chatbot", authenticateUser, chatbotRoutes);

// ─── Legacy Compatibility Routes ────────────────────────────────
// These map old /api/* paths to the new /api/v1/chatbot/* paths
// so the existing frontend continues to work without changes.
const legacyController = require("./src/Ai-Chatbot/controllers/chatbotController");

app.get("/api/health", legacyController.handleHealth);
app.post("/api/query", express.json(), legacyController.handleQuery);
app.post("/api/chat/stream", express.json(), legacyController.handleStreamChat);
app.post("/api/chat", express.json(), legacyController.handleChat);
app.post("/api/tts", express.json(), legacyController.handleTTS);
app.post("/api/tts/cartesia", express.json(), legacyController.handleTTSCartesia);

// ═══════════════════════════════════════════════════════════════
//  ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

// 404 handler — must come BEFORE the error handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler (4 params — Express identifies this as error middleware)
app.use((err, req, res, _next) => {
  // Log full error internally
  console.error(`[${req.id}] Unhandled error:`, err.stack || err);

  // CORS errors get a specific message
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: "CORS policy violation" });
  }

  // Never leak internal details to the client in production
  const statusCode = err.status || err.statusCode || 500;
  const clientMessage =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({ error: clientMessage });
});

// ═══════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════
async function startServer() {
  // Initialize knowledge base (RAG vector index)
  await initializeKnowledgeBase();

  const server = app.listen(PORT, () => {
    const providers = getProviderStatus();
    const dbSize = getDatabaseSize();

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              ARIA Voice Agent — Backend v2.0                ║
║         iHealth & Wellness Foundation AI Chatbot            ║
╠══════════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}                         ║
║  Module:     /api/v1/chatbot/*                              ║
║  Legacy:     /api/* (backwards compatible)                  ║
║  Health:     http://localhost:${PORT}/api/v1/chatbot/health    ║
╠══════════════════════════════════════════════════════════════╣
║  Providers:                                                 ║
║    Groq:       ${providers.groq ? "✅ Connected" : "❌ Missing API Key"}                             ║
║    Fireworks:  ${providers.fireworks ? "✅ Connected" : "❌ Missing API Key"}                             ║
║    ElevenLabs: ${providers.elevenlabs ? "✅ Connected" : "❌ Missing API Key"}                             ║
║    Cartesia:   ${providers.cartesia ? "✅ Connected" : "❌ Missing API Key"}                             ║
║  Database:   ${dbSize} doctor records loaded                   ║
║  Auth:       Placeholder (ready for iHealth repo)           ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });

  // ─── Graceful Shutdown ─────────────────────────────────────
  const shutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Graceful shutdown...`);
    server.close(() => {
      console.log("✅ Server closed cleanly.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("⚠️ Forcing shutdown after timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Process-level crash handlers (production safety net) ──
  process.on("unhandledRejection", (reason, promise) => {
    console.error("⚠️ Unhandled Promise Rejection:", reason);
    // In production, log but don't crash — let the process manager restart if needed
    if (process.env.NODE_ENV !== "production") {
      console.error("Promise:", promise);
    }
  });

  process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err.stack || err);
    // Give the server 3s to finish in-flight requests, then exit
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 3000);
  });
}

startServer().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
