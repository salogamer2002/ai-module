/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Business logic layer for the AI-Chatbot module — Agent pipeline
 *         (Supervisor, Greeting, Tools, RAG), LLM client management,
 *         knowledge base initialization, streaming response generation.
 *         Consolidates all 4 agent files + RAG generator into one service.
 */

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const {
  IHEALTHWELLNESS_CONTEXT,
  AGENT_CONTEXT,
  PRIMARY_MODEL,
  BACKUP_MODEL,
  GROQ_MODEL,
  FIREWORKS_MODEL,
  extractTextFromDocx,
  chunkText,
  indexDocuments,
  retrieveContext,
  callLLM,
  getModelForClient,
  doctorSearchPipeline,
  doctorSearchPipelineWithHistory,
  sseWrite,
  formatConversationHistory,
  buildMessages,
  sleep,
  loadExcelData,
} = require("../helpers/chatbotHelpers");

// ─────────────────────────────────────────────────────────────
//  LLM Provider Clients (initialized on service load)
// ─────────────────────────────────────────────────────────────
const LLM_TIMEOUT_MS = 30000; // 30 second timeout for LLM calls

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    timeout: LLM_TIMEOUT_MS,
  })
  : null;

const fireworks = process.env.FIREWORKS_API_KEY
  ? new OpenAI({
    apiKey: process.env.FIREWORKS_API_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1",
    timeout: LLM_TIMEOUT_MS,
  })
  : null;

/**
 * Returns the active and backup LLM clients.
 * @returns {{activeClient: object|null, backupClient: object|null}}
 */
function getLLMClients() {
  const activeClient = groq || fireworks;
  const backupClient = groq && fireworks ? fireworks : null;
  return { activeClient, backupClient };
}

/**
 * Returns provider status for health checks.
 * @returns {object}
 */
function getProviderStatus() {
  return {
    groq: !!groq,
    fireworks: !!fireworks,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    cartesia: !!process.env.CARTESIA_API_KEY,
  };
}

// ─────────────────────────────────────────────────────────────
//  Load datasets and configuration (defensive — never crash on bad data)
// ─────────────────────────────────────────────────────────────
let config = { SPECIALTY_KEYWORDS: {} };
try {
  const configPath = path.join(__dirname, "../../../config.json");
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.error("⚠️ Failed to load config.json, using empty defaults:", err.message);
}
const SPECIALTY_KEYWORDS = config.SPECIALTY_KEYWORDS || {};

let df = [];
try {
  const dataPath = path.join(__dirname, "../../../sample_data.xlsx");
  df = loadExcelData(dataPath);
} catch (err) {
  console.error("⚠️ Failed to load sample_data.xlsx:", err.message);
}

/**
 * Returns the loaded doctor records count.
 * @returns {number}
 */
function getDatabaseSize() {
  return df.length;
}

// ─────────────────────────────────────────────────────────────
//  Knowledge Base Initialization
// ─────────────────────────────────────────────────────────────
async function initializeKnowledgeBase() {
  try {
    console.log("📚 Building knowledge base vector embeddings...");
    const docs = ["chotbot_documentation.docx", "doctor_recommendation_logic.docx"];
    const allChunks = [];

    for (const docName of docs) {
      const docPath = path.join(__dirname, "../../../", docName);
      if (fs.existsSync(docPath)) {
        try {
          const text = await extractTextFromDocx(docPath);
          const chunks = chunkText(text, 300, 30);
          allChunks.push(...chunks);
        } catch (docErr) {
          console.error(`⚠️ Error processing '${docName}':`, docErr.message);
        }
      } else {
        console.warn(`⚠️ Warning: Source document '${docName}' was not found. Skipping.`);
      }
    }

    if (allChunks.length > 0) {
      indexDocuments(allChunks);
      console.log(`✅ Vector database built successfully (${allChunks.length} chunks).`);
    } else {
      console.warn("⚠️ Knowledge base initialized empty. Verify local text assets.");
    }
  } catch (error) {
    // CRITICAL: Never let knowledge base failure crash the server
    console.error("❌ Knowledge base initialization failed (server will continue):", error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SUPERVISOR AGENT — Intent Router
// ═══════════════════════════════════════════════════════════════

const ROUTING_PROMPT_TEMPLATE = `
You are a routing agent.

Classify the user query into ONE of these:
1. greeting → simple conversation (hi, hello, thanks, general chitchat) OR general health queries, treatment advice, and minor symptom discussions (e.g., "I have a cough", "treatment for flu", "what to do for diarrhea") OR questions about the iHealth and Wellness Foundation. Use this category to have a friendly conversation and provide safe care advice without showing specific doctor cards.
2. doctor_search → user explicitly asks to recommend, find, list, or consult a doctor/specialist (e.g., "Find a doctor for knee pain", "recommend a cardiologist", "give me a list of doctors for chest pain", "I need to see a specialist for my symptom"). Only use this category when the user is asking to look up or recommend a specific doctor.
3. rag → user asks questions about internal foundation documents, PDFs, or the knowledge base.

Return ONLY one word: greeting / doctor_search / rag

User query: {input}
`;

/**
 * Instant keyword-based intent classification (no LLM call needed).
 * @param {string} queryText - User's query text
 * @returns {string|null} Intent string or null if no instant match
 */
function classifyIntentInstantly(queryText) {
  const query = queryText.toLowerCase().trim();

  const greetingKeywords = [
    "hi", "hello", "hey", "howdy", "good morning", "good afternoon", "good evening",
    "how are you", "how's it going", "how are you doing",
    "thank you", "thanks", "appreciate", "bye", "goodbye", "help", "who are you",
  ];
  if (greetingKeywords.some((kw) => query === kw || query.startsWith(kw + " ") || query.endsWith(" " + kw))) {
    return "greeting";
  }

  const minorSymptomKeywords = [
    "cough", "flu", "diarrhea", "cold", "headache", "fever", "sore throat", "runny nose",
    "stomach ache", "general body ache", "minor pain",
  ];
  if (minorSymptomKeywords.some((kw) => query.includes(kw))) {
    const askDoctorKeywords = ["doctor", "specialist", "recommend", "find", "list", "consult", "see a"];
    if (!askDoctorKeywords.some((dkw) => query.includes(dkw))) {
      return "greeting";
    }
  }

  const ragKeywords = [
    "documentation", "system logic", "how does the chatbot work", "docx", "chunking",
    "retriever", "vector database", "architecture", "design doc", "documentation logic",
  ];
  if (ragKeywords.some((kw) => query.includes(kw))) {
    return "rag";
  }

  const doctorKeywords = [
    "doctor", "specialist", "recommend", "find", "list", "consult", "see a",
    "cardiologist", "orthopedics", "neurologist", "pediatrician", "dermatologist",
    "oncologist", "physician", "clinic", "hospital", "appointment",
  ];
  if (doctorKeywords.some((kw) => query.includes(kw))) {
    return "doctor_search";
  }

  return null;
}

/**
 * Routes the user input via LLM (fallback when instant match fails).
 * @param {string} userInput
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<string>}
 */
async function routeQuery(userInput, client, backupClient = null) {
  const prompt = ROUTING_PROMPT_TEMPLATE.replace("{input}", userInput);

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const responseText = completion.choices[0].message.content.trim().toLowerCase();
    if (["greeting", "doctor_search", "rag"].includes(responseText)) {
      return responseText;
    }
  } catch (e) {
    console.warn(`⚠️ Primary LLM unavailable, switching to backup: ${e.message}`);
    if (backupClient) {
      try {
        const completion = await backupClient.chat.completions.create({
          model: FIREWORKS_MODEL,
          messages: [{ role: "user", content: prompt }],
        });
        const responseText = completion.choices[0].message.content.trim().toLowerCase();
        if (["greeting", "doctor_search", "rag"].includes(responseText)) {
          return responseText;
        }
      } catch (backupError) {
        console.error(`❌ Backup LLM also failed: ${backupError.message}`);
      }
    }
  }
  return "rag";
}

/**
 * Routes query with conversation history context.
 * @param {string} userInput
 * @param {string} conversationHistory
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<string>}
 */
async function routeQueryWithHistory(userInput, conversationHistory, client, backupClient = null) {
  const prompt = `
You are a routing agent.

Conversation History:
${conversationHistory}

Classify the user query into ONE of these:
1. greeting → simple conversation (hi, hello, thanks, general chitchat) OR general health queries, treatment advice, and minor symptom discussions (e.g., "I have a cough", "treatment for flu", "what to do for diarrhea") OR questions about the iHealth and Wellness Foundation. Use this category to have a friendly conversation and provide safe care advice without showing specific doctor cards.
2. doctor_search → user explicitly asks to recommend, find, list, or consult a doctor/specialist (e.g., "Find a doctor for knee pain", "recommend a cardiologist", "give me a list of doctors for chest pain", "I need to see a specialist for my symptom", or "find one" in context of previous messages). Only use this category when the user is asking to look up or recommend a specific doctor.
3. rag → user asks questions about internal foundation documents, PDFs, or the knowledge base.

Return ONLY one word: greeting / doctor_search / rag

User query: ${userInput}
`;

  const runCall = async (activeClient) => {
    const isGroq = activeClient.baseURL.includes("groq");
    const model = isGroq ? GROQ_MODEL : FIREWORKS_MODEL;
    const completion = await activeClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0].message.content.trim().toLowerCase();
  };

  try {
    let result = "rag";
    if (client) {
      try {
        result = await runCall(client);
      } catch (err) {
        console.warn("⚠️ Primary LLM failed for routing:", err.message);
        if (backupClient) {
          console.log("🔄 Trying backup LLM for routing...");
          result = await runCall(backupClient);
        }
      }
    } else if (backupClient) {
      result = await runCall(backupClient);
    }

    if (["greeting", "doctor_search", "rag"].includes(result)) {
      return result;
    }
  } catch (err) {
    console.error("❌ Routing failed:", err.message);
  }
  return "rag";
}

// ═══════════════════════════════════════════════════════════════
//  GREETING AGENT
// ═══════════════════════════════════════════════════════════════

/**
 * Handles greeting/self-care conversations (non-streaming).
 * @param {string} userInput
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<string>}
 */
async function greetingAgent(userInput, client, backupClient = null) {
  const prompt = `
    Context: ${IHEALTHWELLNESS_CONTEXT}
    Agent role: ${AGENT_CONTEXT}
    User said: "${userInput}"

    STRICT RESPONDING RULES:
    - If the user greets you or asks how you are, respond warmly and ask how you can help.
    - If the user describes minor health symptoms or concerns (like cough, cold, flu, diarrhea, headache, general body aches), have an empathetic conversation, offer safe, scientifically-backed self-care tips (e.g., rest, hydration, standard symptom management), and remind them politely to consult a professional if symptoms persist or worsen.
    - Do NOT recommend specific doctors or display any doctor list in this category unless explicitly asked.
    - Keep your response warm, conversational, and under 4 sentences.
    `;

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0].message.content.trim();
  } catch (e) {
    console.warn(`⚠️ Primary LLM unavailable for greeting, switching to backup: ${e.message}`);
    if (backupClient) {
      try {
        const completion = await backupClient.chat.completions.create({
          model: FIREWORKS_MODEL,
          messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content.trim();
      } catch (backupError) {
        console.error(`❌ Backup LLM also failed: ${backupError.message}`);
        return "Hello! Welcome to iHealthwellness. How can I assist you today?";
      }
    }
    return "Hello! Welcome to iHealthwellness. How can I assist you today?";
  }
}

/**
 * Streaming version of greeting agent for SSE endpoints.
 * @param {string} userInput
 * @param {string} conversationHistory
 * @param {object} client
 * @param {object|null} backupClient
 * @param {function} onToken
 */
async function streamGreetingAgent(userInput, conversationHistory, client, backupClient = null, onToken) {
  const prompt = `
Context: ${IHEALTHWELLNESS_CONTEXT}
Agent role: ${AGENT_CONTEXT}

Conversation History:
${conversationHistory}

User said: "${userInput}"

STRICT RESPONDING RULES:
- If the user greets you or asks how you are, respond warmly and ask how you can help.
- If the user describes minor health symptoms or concerns (like cough, cold, flu, diarrhea, headache, general body aches), have an empathetic conversation, offer safe, scientifically-backed self-care tips (e.g., rest, hydration, standard symptom management), and remind them politely to consult a professional if symptoms persist or worsen.
- Use the conversation history to understand context, reference pronouns, and answer follow-ups correctly.
- Do NOT recommend specific doctors or display any doctor list in this category unless explicitly asked.
- Keep your response warm, conversational, and under 4 sentences. Make sure you answer the user's current query directly while respecting the history.
`;

  const runCall = async (activeClient) => {
    const isGroq = activeClient.baseURL.includes("groq");
    const model = isGroq ? GROQ_MODEL : FIREWORKS_MODEL;
    const stream = await activeClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        const keepGoing = onToken(token);
        if (keepGoing === false) break;
      }
    }
  };

  if (client) {
    try {
      await runCall(client);
      return;
    } catch (err) {
      console.warn(`⚠️ Primary LLM failed for streaming greeting: ${err.message}`);
      if (backupClient) {
        await runCall(backupClient);
        return;
      }
    }
  } else if (backupClient) {
    await runCall(backupClient);
  }
}

// ═══════════════════════════════════════════════════════════════
//  TOOLS AGENT — Doctor Search
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry for the doctor search tool.
 * @param {string} userInput
 * @param {object[]} records
 * @param {object} keywordMap
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<{message: string, results: object[]|null}>}
 */
async function toolsAgent(userInput, records, keywordMap, client, backupClient = null) {
  const results = await doctorSearchPipeline(userInput, records, keywordMap, client, backupClient);

  if (!results || results.length === 0) {
    return { message: "I couldn't find matching doctors.", results: null };
  }

  const specialties = [...new Set(results.map((d) => d.Specialty))];
  const message = `🤖 Based on your symptoms, you may need a ${specialties.join(", ")} specialist.\nHere are the best matches I found:`;
  return { message, results };
}

/**
 * Tools agent with conversation history support.
 * @param {string} userInput
 * @param {string} conversationHistory
 * @param {object[]} records
 * @param {object} keywordMap
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<{message: string, results: object[]|null}>}
 */
async function toolsAgentWithHistory(userInput, conversationHistory, records, keywordMap, client, backupClient = null) {
  const results = await doctorSearchPipelineWithHistory(userInput, conversationHistory, records, keywordMap, client, backupClient);

  if (!results || results.length === 0) {
    return {
      message: "Sorry, I couldn't find suitable specialists for your symptoms. Could you describe them in more detail?",
      results: null,
    };
  }

  const specialties = [...new Set(results.map((d) => d.Specialty))];
  const message = `🤖 Based on your symptoms, you may need a ${specialties.join(", ")} specialist.\nHere are the best matches I found:`;
  return { message, results };
}

// ═══════════════════════════════════════════════════════════════
//  RAG AGENT — Answer Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a final response grounded in retrieved context (non-streaming).
 * @param {string} userQuery
 * @param {string} context
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<string>}
 */
async function generateAnswer(userQuery, context, client, backupClient = null) {
  const prompt = `
You are an advanced medical systems assistant for the iHealth and Wellness Foundation.
Answer the user's query using ONLY the provided context gathered from our internal documentation.
If the answer cannot be derived from the context, politely state that you do not have that information.

Retrieved Context:
${context}

User Query: ${userQuery}

STRICT OUTPUT RULES:
- Be professional, concise, and compact.
- Limit your answer to 2-3 clear sentences.
- Do not make up any facts outside the provided context.
`;

  try {
    const completion = await client.chat.completions.create({
      model: getModelForClient(client),
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0].message.content.trim();
  } catch (e) {
    console.warn(`⚠️ Primary LLM unavailable for RAG, switching to backup: ${e.message}`);
    if (backupClient) {
      try {
        const completion = await backupClient.chat.completions.create({
          model: getModelForClient(backupClient),
          messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content.trim();
      } catch (backupError) {
        console.error(`❌ Backup LLM also failed: ${backupError.message}`);
        return "I'm currently experiencing technical difficulties. Please try again shortly.";
      }
    }
    return "I'm currently experiencing technical difficulties. Please try again shortly.";
  }
}

/**
 * Streaming version of generateAnswer for SSE endpoints.
 * @param {string} userQuery
 * @param {string} context
 * @param {string} conversationHistory
 * @param {object} client
 * @param {object|null} backupClient
 * @param {function} onToken
 */
async function streamGenerateAnswer(userQuery, context, conversationHistory, client, backupClient = null, onToken) {
  const prompt = `
You are an advanced medical systems assistant for the iHealth and Wellness Foundation.
Answer the user's query using ONLY the provided context gathered from our internal documentation.
If the answer cannot be derived from the context, politely state that you do not have that information.

Conversation History:
${conversationHistory}

Retrieved Context:
${context}

User Query: ${userQuery}

STRICT OUTPUT RULES:
- Be professional, concise, and compact.
- Limit your answer to 2-3 clear sentences.
- Do not make up any facts outside the provided context.
- Use the conversation history to resolve pronouns and context for the user's query.
`;

  const runCall = async (activeClient) => {
    const model = getModelForClient(activeClient);
    const stream = await activeClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        const keepGoing = onToken(token);
        if (keepGoing === false) break;
      }
    }
  };

  if (client) {
    try {
      await runCall(client);
      return;
    } catch (err) {
      console.warn(`⚠️ Primary LLM failed for streaming RAG: ${err.message}`);
      if (backupClient) {
        await runCall(backupClient);
        return;
      }
    }
  } else if (backupClient) {
    await runCall(backupClient);
  }
}

// ═══════════════════════════════════════════════════════════════
//  GRAPH INVOKER — Full Agent Pipeline (replaces LangGraph)
// ═══════════════════════════════════════════════════════════════

/**
 * Runs the full agent pipeline (non-streaming).
 * Routes user input through supervisor → greeting/tool/rag nodes.
 * @param {object} initialState
 * @returns {Promise<object>} Final state with intent, response, results
 */
async function invokeGraph(initialState) {
  const state = { ...initialState };

  const intent = await routeQuery(state.input, state.client, state.backup_client);
  state.intent = intent;

  if (intent === "greeting") {
    const response = await greetingAgent(state.input, state.client, state.backup_client);
    state.response = response;
    state.results = null;
  } else if (intent === "doctor_search") {
    const { message, results } = await toolsAgent(
      state.input, state.df, state.keywords, state.client, state.backup_client
    );
    state.response = message;
    state.results = results;
  } else {
    const context = retrieveContext(state.input, 2);
    const response = await generateAnswer(state.input, context, state.client, state.backup_client);
    state.response = response;
    state.results = null;
  }

  return state;
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // LLM Clients
  groq,
  fireworks,
  getLLMClients,
  getProviderStatus,

  // Data
  df,
  SPECIALTY_KEYWORDS,
  getDatabaseSize,

  // Initialization
  initializeKnowledgeBase,

  // Supervisor Agent
  classifyIntentInstantly,
  routeQuery,
  routeQueryWithHistory,

  // Greeting Agent
  greetingAgent,
  streamGreetingAgent,

  // Tools Agent (Doctor Search)
  toolsAgent,
  toolsAgentWithHistory,

  // RAG Agent
  generateAnswer,
  streamGenerateAnswer,
  invokeGraph,
};
