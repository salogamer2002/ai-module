/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Controller handlers for all AI-Chatbot API endpoints.
 *         Extracted from server.js — same original functionality preserved.
 */

const fetch = require("node-fetch");
const {
  sseWrite,
  formatConversationHistory,
  buildMessages,
  sleep,
  tryElevenLabsTTS,
  tryCartesiaTTS,
  retrieveContext,
} = require("../helpers/chatbotHelpers");

const {
  groq,
  fireworks,
  getLLMClients,
  getProviderStatus,
  df,
  SPECIALTY_KEYWORDS,
  getDatabaseSize,
  classifyIntentInstantly,
  routeQueryWithHistory,
  streamGreetingAgent,
  toolsAgentWithHistory,
  streamGenerateAnswer,
  invokeGraph,
} = require("../services/chatbotService");

const repository = require("../repository/chatbotRepository");

// ── Production: Startup timestamp ────────────────────────────────────
const STARTUP_TIME = Date.now();
const STREAM_TIMEOUT_MS = 60000; // 60-second max stream duration

// ── TTS: Skip ElevenLabs after quota exhaustion ──────────────
let elevenLabsExhausted = false;
// ── TTS: Serialize Cartesia requests to avoid 429 ────────────
let cartesiaInFlight = 0;
const CARTESIA_MAX_CONCURRENT = 1; // Stay under the 2-limit safely

// ─────────────────────────────────────────────────────────────
//  POST /message — Non-streaming query
// ─────────────────────────────────────────────────────────────
async function handleQuery(req, res) {
  try {
    const userInput = req.body.message;
    const { activeClient, backupClient } = getLLMClients();

    if (!activeClient) {
      return res.status(503).json({ error: "No LLM providers configured" });
    }

    const initialState = {
      input: userInput,
      intent: null,
      response: null,
      df: df,
      keywords: SPECIALTY_KEYWORDS,
      client: activeClient,
      backup_client: backupClient,
      results: null,
    };

    const finalState = await invokeGraph(initialState);

    const intent = finalState.intent;
    const responseMsg = finalState.response;
    const results = finalState.results;

    const resultsList = results && results.length > 0
      ? results.map((r) => {
          const clean = { ...r };
          Object.keys(clean).forEach((key) => {
            if (clean[key] === undefined || clean[key] === null) {
              clean[key] = "";
            }
          });
          return clean;
        })
      : [];

    return res.json({
      intent,
      response: responseMsg,
      results: resultsList,
    });
  } catch (e) {
    console.error("❌ Error in /message:", e);
    // Never leak internal error details in production
    const clientMsg = process.env.NODE_ENV === 'production'
      ? 'An error occurred processing your request. Please try again.'
      : (e.message || 'Internal server error');
    return res.status(500).json({ error: clientMsg });
  }
}

// ─────────────────────────────────────────────────────────────
//  POST /stream — SSE Streaming LLM
// ─────────────────────────────────────────────────────────────
async function handleStreamChat(req, res) {
  const { messages } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "none");
  res.flushHeaders();

  res.write(": connected\n\n");

  let aborted = false;
  res.on("close", () => {
    aborted = true;
    console.log("[stream] Client disconnected");
  });

  // Production safety: kill stream after timeout to prevent zombie connections
  const streamTimeout = setTimeout(() => {
    if (!aborted && !res.writableEnded) {
      console.warn(`[stream] Stream timeout after ${STREAM_TIMEOUT_MS / 1000}s — forcing close`);
      sseWrite(res, { type: "error", content: "Response timed out. Please try again." });
      aborted = true;
      clearInterval(heartbeat);
      res.end();
    }
  }, STREAM_TIMEOUT_MS);

  const heartbeat = setInterval(() => {
    if (!aborted && !res.writableEnded) {
      res.write(": ping\n\n");
    } else {
      clearInterval(heartbeat);
    }
  }, 5000);

  // ── Direct Stream from Groq ──
  async function streamFromGroq() {
    if (!groq) return false;
    try {
      console.log("[stream] Attempting Groq (llama-3.3-70b-versatile)…");
      const fullMessages = buildMessages(messages);
      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      });

      let gotTokens = false;
      for await (const chunk of stream) {
        if (aborted) break;
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          gotTokens = true;
          sseWrite(res, { type: "token", content: token });
        }
      }
      if (!aborted && gotTokens) {
        sseWrite(res, { type: "done" });
        console.log("[stream] Groq stream complete ✓");
      }
      return gotTokens;
    } catch (err) {
      console.error("[stream] Groq failed:", err.message);
      return false;
    }
  }

  // ── Direct Stream from Fireworks ──
  async function streamFromFireworks() {
    if (!process.env.FIREWORKS_API_KEY) return false;
    try {
      console.log("[stream] Attempting Fireworks (kimi-k2p6) via direct fetch…");
      const fullMessages = buildMessages(messages);
      const fwRes = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "accounts/fireworks/models/kimi-k2p6",
          messages: fullMessages,
          stream: true,
          max_tokens: 32768,
          top_p: 1,
          top_k: 40,
          presence_penalty: 0,
          frequency_penalty: 0,
          temperature: 0.6,
        }),
      });

      if (!fwRes.ok) {
        const errText = await fwRes.text();
        console.error(`[stream] Fireworks HTTP ${fwRes.status}:`, errText);
        return false;
      }

      const reader = fwRes.body;
      let buffer = "";
      let gotTokens = false;

      await new Promise((resolve, reject) => {
        reader.on("data", (chunk) => {
          if (aborted) { reader.destroy(); resolve(); return; }
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (trimmed === "data: [DONE]") continue;
            if (trimmed.startsWith("data: ")) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const token = data.choices?.[0]?.delta?.content;
                if (token) { gotTokens = true; sseWrite(res, { type: "token", content: token }); }
              } catch (e) { /* skip unparseable */ }
            }
          }
        });
        reader.on("end", resolve);
        reader.on("error", (err) => { console.error("[stream] Fireworks stream error:", err.message); reject(err); });
      });

      if (!aborted && gotTokens) {
        sseWrite(res, { type: "done" });
        console.log("[stream] Fireworks stream complete ✓");
      }
      return gotTokens;
    } catch (err) {
      console.error("[stream] Fireworks failed:", err.message);
      return false;
    }
  }

  // ── Core Query Execution Pipeline ──
  let pipelineOk = false;
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === "user") {
    try {
      const queryText = lastUserMessage.content;
      const conversationHistory = formatConversationHistory(messages);
      console.log(`[stream] Processing query (Full pipeline)...`);

      const { activeClient, backupClient } = getLLMClients();

      let intent = classifyIntentInstantly(queryText);
      if (intent) {
        console.log(`[stream] Routing: ${intent} (instant match)`);
      } else {
        intent = await routeQueryWithHistory(queryText, conversationHistory, activeClient, backupClient);
        console.log(`[stream] Routing: ${intent} (LLM fallback)`);
      }

      sseWrite(res, { type: "intent", content: intent });
      pipelineOk = true;

      if (intent === "greeting") {
        await streamGreetingAgent(queryText, conversationHistory, activeClient, backupClient, (token) => {
          if (aborted) return false;
          sseWrite(res, { type: "token", content: token });
          return true;
        });
        if (!aborted) sseWrite(res, { type: "done" });
      } else if (intent === "doctor_search") {
        const { message: doctorMsg, results: doctors } = await toolsAgentWithHistory(
          queryText, conversationHistory, df, SPECIALTY_KEYWORDS, activeClient, backupClient
        );

        let responseText = doctorMsg;
        if (doctors && doctors.length > 0) {
          sseWrite(res, { type: "results", content: doctors });
        }

        const words = responseText.split(/(\s+)/);
        for (const word of words) {
          if (aborted) break;
          sseWrite(res, { type: "token", content: word });
          await sleep(5);
        }
        if (!aborted) sseWrite(res, { type: "done" });
      } else {
        const context = retrieveContext(queryText, 2);
        await streamGenerateAnswer(queryText, context, conversationHistory, activeClient, backupClient, (token) => {
          if (aborted) return false;
          sseWrite(res, { type: "token", content: token });
          return true;
        });
        if (!aborted) sseWrite(res, { type: "done" });
      }
      console.log(`[stream] Query complete (Intent: ${intent}) ✓`);
    } catch (err) {
      console.error("[stream] Pipeline error:", err.message);
    }
  }

  if (!pipelineOk && !aborted) {
    console.log("[stream] Falling back to direct Groq/Fireworks streaming...");
    const groqOk = await streamFromGroq();
    if (!groqOk && !aborted) {
      const fireworksOk = await streamFromFireworks();
      if (!fireworksOk && !aborted) {
        sseWrite(res, { type: "error", content: "All LLM providers are unavailable. Please try again later." });
      }
    }
  }

  clearInterval(heartbeat);
  clearTimeout(streamTimeout);
  if (!aborted && !res.writableEnded) {
    res.end();
  }
}

// ─────────────────────────────────────────────────────────────
//  POST /tts — Smart Auto-Fallback TTS (3-Tier)
// ─────────────────────────────────────────────────────────────
async function handleTTS(req, res) {
  const { text } = req.body;

  // Tier 1: ElevenLabs — skip instantly if already known to be exhausted
  if (!elevenLabsExhausted) {
    try {
      const elevenResult = await tryElevenLabsTTS(text);
      if (elevenResult) {
        console.log(`[tts] ✓ ElevenLabs serving ${text.length} chars`);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Provider", "elevenlabs");
        res.setHeader("X-TTS-Gender", process.env.TTS_GENDER || "female");
        res.setHeader("Transfer-Encoding", "chunked");
        elevenResult.body.pipe(res);
        elevenResult.body.on("error", (err) => {
          console.error("[tts] ElevenLabs pipe error:", err.message);
        });
        return;
      } else {
        // tryElevenLabsTTS returns null on 401/quota errors — mark as exhausted
        elevenLabsExhausted = true;
        console.log("[tts] ElevenLabs marked as exhausted — skipping for future requests");
      }
    } catch (err) {
      console.warn(`[tts] ElevenLabs failed: ${err.message}`);
      elevenLabsExhausted = true;
    }
  }

  // Tier 2: Cartesia — serialize requests to avoid 429 concurrency errors
  // Wait if too many requests are in-flight
  const maxWaitMs = 8000;
  const waitStart = Date.now();
  while (cartesiaInFlight >= CARTESIA_MAX_CONCURRENT) {
    if (Date.now() - waitStart > maxWaitMs) {
      console.warn("[tts] Cartesia wait timeout — falling back to browser TTS");
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (cartesiaInFlight < CARTESIA_MAX_CONCURRENT) {
    cartesiaInFlight++;
    try {
      const cartesiaResult = await tryCartesiaTTS(text);
      cartesiaInFlight--;
      if (cartesiaResult) {
        console.log(`[tts] ✓ Cartesia serving ${text.length} chars`);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Provider", "cartesia");
        res.setHeader("X-TTS-Gender", process.env.TTS_GENDER || "female");
        res.setHeader("Transfer-Encoding", "chunked");
        cartesiaResult.body.pipe(res);
        cartesiaResult.body.on("error", (err) => {
          console.error("[tts] Cartesia pipe error:", err.message);
        });
        return;
      }
    } catch (err) {
      cartesiaInFlight--;
      console.warn(`[tts] Cartesia failed: ${err.message}`);
    }
  }

  // Tier 3: Return 501 — client uses Web Speech API
  console.warn("[tts] All cloud TTS providers exhausted → client will use Web Speech API");
  return res.status(501).json({
    error: "All cloud TTS providers unavailable",
    fallback: "web_speech_api",
    gender: process.env.TTS_GENDER || "female",
    message: "Client should use browser-native Web Speech API (SpeechSynthesis)",
  });
}

// ─────────────────────────────────────────────────────────────
//  POST /tts/cartesia — Direct Cartesia endpoint
// ─────────────────────────────────────────────────────────────
async function handleTTSCartesia(req, res) {
  const { text } = req.body;
  try {
    const result = await tryCartesiaTTS(text);
    if (result) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Provider", "cartesia");
      res.setHeader("X-TTS-Gender", process.env.TTS_GENDER || "female");
      res.setHeader("Transfer-Encoding", "chunked");
      result.body.pipe(res);
      return;
    }
    return res.status(500).json({ error: "Cartesia TTS failed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
//  POST /chat — Non-streaming chat fallback
// ─────────────────────────────────────────────────────────────
async function handleChat(req, res) {
  const { messages } = req.body;
  const fullMessages = buildMessages(messages);

  if (groq) {
    try {
      console.log("[chat] Trying Groq…");
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2048,
      });
      const reply = completion.choices?.[0]?.message?.content || "";
      console.log("[chat] Groq replied ✓");
      return res.json({ reply, provider: "groq" });
    } catch (err) {
      console.error("[chat] Groq failed:", err.message);
    }
  }

  if (fireworks) {
    try {
      console.log("[chat] Falling back to Fireworks…");
      const completion = await fireworks.chat.completions.create({
        model: "accounts/fireworks/models/kimi-k2p6",
        messages: fullMessages,
        temperature: 0.6,
        max_tokens: 32768,
      });
      const reply = completion.choices?.[0]?.message?.content || "";
      console.log("[chat] Fireworks replied ✓");
      return res.json({ reply, provider: "fireworks" });
    } catch (err) {
      console.error("[chat] Fireworks failed:", err.message);
    }
  }

  res.status(503).json({ error: "All LLM providers are unavailable" });
}

// ─────────────────────────────────────────────────────────────
//  GET /health — Production Health Check
// ─────────────────────────────────────────────────────────────
function handleHealth(_req, res) {
  const mem = process.memoryUsage();
  res.json({
    status: "healthy",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - STARTUP_TIME) / 1000),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    providers: getProviderStatus(),
    database_size: getDatabaseSize(),
    node_env: process.env.NODE_ENV || "development",
  });
}

// ─────────────────────────────────────────────────────────────
//  SESSION MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────────────────────
function createSession(req, res) {
  const { userId, title } = req.body;
  const session = repository.createSession(userId, title);
  return res.status(201).json(session);
}

function getUserSessions(req, res) {
  const userId = req.query.userId || req.headers["x-user-id"];
  if (!userId) {
    return res.status(400).json({ error: "userId query parameter or x-user-id header required" });
  }
  const sessions = repository.findUserSessions(userId);
  return res.json({ sessions });
}

function getSessionMessages(req, res) {
  const { sessionId } = req.params;
  const session = repository.findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const messages = repository.findMessagesBySession(sessionId);
  return res.json({ session, messages });
}

function deleteSession(req, res) {
  const { id } = req.params;
  const deleted = repository.deleteSession(id);
  if (!deleted) {
    return res.status(404).json({ error: "Session not found" });
  }
  return res.json({ message: "Session deleted successfully" });
}

function handleFeedback(req, res) {
  const { messageId, sessionId, rating, comment } = req.body;
  const feedback = repository.saveFeedback(messageId, sessionId || "", rating, comment);
  return res.status(201).json(feedback);
}

module.exports = {
  handleQuery,
  handleStreamChat,
  handleTTS,
  handleTTSCartesia,
  handleChat,
  handleHealth,
  createSession,
  getUserSessions,
  getSessionMessages,
  deleteSession,
  handleFeedback,
};
