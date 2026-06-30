/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Utility functions for the AI-Chatbot module — Doctor search pipeline,
 *         TTS helpers, SSE streaming, RAG (chunking, embedding, retrieval),
 *         conversation formatting, and data loading.
 *         Consolidates utils.js + rag/ modules into a single helpers file.
 */

const crypto = require("crypto");
const xlsx = require("xlsx");
const mammoth = require("mammoth");
const fetch = require("node-fetch");

// ─────────────────────────────────────────────────────────────
//  Structured Logger (JSON in production, pretty in dev)
// ─────────────────────────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const logger = {
  _format(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    if (IS_PRODUCTION) {
      return JSON.stringify(entry);
    }
    const prefix = { info: "ℹ️", warn: "⚠️", error: "❌", debug: "🔍" }[level] || "";
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${prefix} [${level.toUpperCase()}] ${message}${metaStr}`;
  },
  info(msg, meta) { console.log(this._format("info", msg, meta)); },
  warn(msg, meta) { console.warn(this._format("warn", msg, meta)); },
  error(msg, meta) { console.error(this._format("error", msg, meta)); },
  debug(msg, meta) { if (!IS_PRODUCTION) console.log(this._format("debug", msg, meta)); },
};

// ─────────────────────────────────────────────────────────────
//  LLM Model Constants
// ─────────────────────────────────────────────────────────────
const PRIMARY_MODEL = "accounts/fireworks/models/kimi-k2p6";
const BACKUP_MODEL = "llama-3.3-70b-versatile";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const FIREWORKS_MODEL = "accounts/fireworks/models/kimi-k2p6";

// ─────────────────────────────────────────────────────────────
//  LRU Cache (bounded, with TTL eviction)
// ─────────────────────────────────────────────────────────────
const LRU_MAX_SIZE = 500;
const LRU_TTL_MS = 30 * 60 * 1000; // 30 minutes

class LRUCache {
  constructor(maxSize = LRU_MAX_SIZE, ttlMs = LRU_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first) entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, createdAt: Date.now() });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  get size() {
    return this.cache.size;
  }
}

const AI_CACHE = new LRUCache();

// ─────────────────────────────────────────────────────────────
//  Local Vector Database (RAG) + TF-IDF Vocabulary
// ─────────────────────────────────────────────────────────────
let VECTOR_DB = [];
let IDF_VOCAB = {};       // word → IDF score
let VOCAB_WORDS = [];     // ordered vocabulary list
const VOCAB_SIZE = 2048;  // embedding dimension

// ─────────────────────────────────────────────────────────────
//  ARIA System Prompt
// ─────────────────────────────────────────────────────────────
const ARIA_SYSTEM_PROMPT = `You are ARIA (Advanced Reasoning Intelligence Agent), an elite AI voice assistant for the iHealth and Wellness Foundation. You are warm, sharp, witty, emotionally intelligent, and deeply professional — like talking to a brilliant friend who happens to know everything about health.

You speak like a real human — not a robot. Use contractions, natural filler transitions ("Sure thing", "Great question", "Absolutely"), and casual acknowledgments. Be concise — lead with the answer, expand only if needed. Every response should be under 3 sentences unless complexity demands more.

You help users with:
- Understanding which medical specialists they may need based on symptoms
- General health guidance and wellness information
- Information about the iHealth and Wellness Foundation programs
- Navigating health resources and doctor recommendations

Never say "As an AI" or use bullet points in speech. Always end with a soft hook to keep conversation going. Be warm, not clinical.`;

// ─────────────────────────────────────────────────────────────
//  iHealthwellness Context (for greeting agent)
// ─────────────────────────────────────────────────────────────
const IHEALTHWELLNESS_CONTEXT = `
The iHealth and Wellness Foundation is a 501(c)(3) nonprofit dedicated to supporting patients with complex conditions like Neurofibromatosis, Alzheimer's, diabetes, and cancer. 
It aims to improve patient care through digital health navigation, community building, and advocacy, offering resources to empower patients and their caregivers. 
Key Aspects of the iHealth and Wellness Foundation
Mission: To create a future where people with complex conditions feel seen, supported, and empowered.
Support & Services: Developing digital health navigation platforms to connect patients with care, reducing the burden of managing complex diseases.
Focus Areas: Improving care for Neurofibromatosis (NF), Alzheimer's, Diabetes, and Cancer.
Engagement: The foundation actively seeks donations and volunteers to support patient advocacy and enhance healthcare access.
`;

const AGENT_CONTEXT = `
I am the iHealthwellness Virtual Assistant. My role is to help users:
- Understand which specialists they may need based on their symptoms.
- Provide general guidance on health queries.
- Offer information about the iHealth and Wellness Foundation, its programs, and services.
- Help navigate resources such as doctor listings, educational material, and RAG-based document answers.

I do not replace medical advice from a qualified physician. My goal is to provide guidance, support, and information in a friendly and empathetic manner.
`;

// ═══════════════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Loads doctor records from the Excel file with 0-indexed IDs.
 * @param {string} filePath - Path to the .xlsx file
 * @returns {object[]} Array of doctor record objects
 */
function loadExcelData(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const records = xlsx.utils.sheet_to_json(worksheet);
    return records.map((record, index) => ({
      id: index,
      ...record,
    }));
  } catch (error) {
    console.error(`⚠️ Error loading Excel file at ${filePath}:`, error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  RAG — DOCUMENT CHUNKING
// ═══════════════════════════════════════════════════════════════

/**
 * Reads a local DOCX file and extracts text content.
 * @param {string} filePath - Path to the .docx file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromDocx(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error(`⚠️ Error reading DOCX file at ${filePath}:`, error.message);
    return "";
  }
}

/**
 * Splits text into chunks optimized for vector search/RAG embeddings.
 * @param {string} text - Full text to chunk
 * @param {number} chunkSize - Number of words per chunk
 * @param {number} overlap - Number of overlapping words between chunks
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, chunkSize = 300, overlap = 30) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks = [];

  if (words.length === 0) return chunks;

  const step = chunkSize - overlap;
  const increment = step > 0 ? step : chunkSize;

  for (let i = 0; i < words.length; i += increment) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push(chunkWords.join(" "));
    if (i + chunkSize >= words.length) {
      break;
    }
  }
  return chunks;
}

// ═══════════════════════════════════════════════════════════════
//  RAG — TF-IDF EMBEDDING MODEL (Production-grade local embeddings)
// ═══════════════════════════════════════════════════════════════

/**
 * Tokenizes text into normalized words for TF-IDF.
 * @param {string} text - Input text
 * @returns {string[]} Array of normalized tokens
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Builds the IDF vocabulary from a corpus of text chunks.
 * Must be called before getEmbedding().
 * @param {string[]} chunks - All document chunks
 */
function buildVocabulary(chunks) {
  const docFreq = {};   // word → number of docs containing it
  const totalDocs = chunks.length;

  for (const chunk of chunks) {
    const uniqueWords = new Set(tokenize(chunk));
    for (const word of uniqueWords) {
      docFreq[word] = (docFreq[word] || 0) + 1;
    }
  }

  // Sort by document frequency (most discriminative first) and take top VOCAB_SIZE
  const entries = Object.entries(docFreq)
    .filter(([, freq]) => freq > 0 && freq < totalDocs) // exclude words in all or no docs
    .sort((a, b) => {
      // Prefer mid-frequency terms (best discriminators)
      const idfA = Math.log(totalDocs / a[1]);
      const idfB = Math.log(totalDocs / b[1]);
      return idfB - idfA;
    })
    .slice(0, VOCAB_SIZE);

  IDF_VOCAB = {};
  VOCAB_WORDS = [];
  for (const [word, freq] of entries) {
    IDF_VOCAB[word] = Math.log(totalDocs / freq);
    VOCAB_WORDS.push(word);
  }

  logger.info(`TF-IDF vocabulary built`, { vocabSize: VOCAB_WORDS.length, totalDocs });
}

/**
 * Generates a TF-IDF vector embedding for a given piece of text.
 * Uses the pre-built vocabulary from buildVocabulary().
 * @param {string} text - Text to generate embedding for
 * @returns {number[]} TF-IDF weighted vector
 */
function getEmbedding(text) {
  const tokens = tokenize(text);
  const totalTokens = tokens.length || 1;

  // Count term frequencies
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }

  // Build TF-IDF vector aligned to VOCAB_WORDS
  const vec = new Array(VOCAB_WORDS.length).fill(0);
  for (let i = 0; i < VOCAB_WORDS.length; i++) {
    const word = VOCAB_WORDS[i];
    if (tf[word]) {
      vec[i] = (tf[word] / totalTokens) * (IDF_VOCAB[word] || 0);
    }
  }

  return vec;
}

// ═══════════════════════════════════════════════════════════════
//  RAG — VECTOR RETRIEVER
// ═══════════════════════════════════════════════════════════════

/**
 * Stores text chunks alongside their TF-IDF vector embeddings.
 * Builds the vocabulary first, then computes embeddings.
 * @param {string[]} chunks - Array of text chunks to index
 */
function indexDocuments(chunks) {
  // Step 1: Build TF-IDF vocabulary from the corpus
  buildVocabulary(chunks);

  // Step 2: Compute embeddings for each chunk
  VECTOR_DB = [];
  for (const chunk of chunks) {
    const embedding = getEmbedding(chunk);
    VECTOR_DB.push({
      text: chunk,
      vector: embedding,
    });
  }
  logger.info(`Indexed document chunks into vector space`, { chunks: VECTOR_DB.length, dimensions: VOCAB_WORDS.length });
}

/**
 * Calculates cosine similarity between two vectors.
 * @param {number[]} v1 - First vector
 * @param {number[]} v2 - Second vector
 * @returns {number} Cosine similarity score
 */
function cosineSimilarity(v1, v2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  const len = Math.min(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Finds the most relevant document chunks for a query using TF-IDF similarity.
 * @param {string} userQuery - User's search query
 * @param {number} topK - Number of top results to return
 * @returns {string} Concatenated top matching text chunks
 */
function retrieveContext(userQuery, topK = 2) {
  if (VECTOR_DB.length === 0) {
    return "No document context available.";
  }

  const queryVector = getEmbedding(userQuery);
  const scores = [];

  for (const item of VECTOR_DB) {
    const sim = cosineSimilarity(queryVector, item.vector);
    scores.push({ sim, text: item.text });
  }

  scores.sort((a, b) => b.sim - a.sim);
  const topMatches = scores.slice(0, topK).map((item) => item.text);
  logger.debug(`RAG retrieval`, { query: userQuery.slice(0, 50), topScore: scores[0]?.sim?.toFixed(4) });
  return topMatches.join("\n\n");
}

// ═══════════════════════════════════════════════════════════════
//  LLM CALL HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Helper to call primary/backup LLMs with OpenAI-compatible interfaces.
 * @param {string} prompt - Prompt to send
 * @param {object} client - Primary client
 * @param {object|null} backupClient - Backup client
 * @param {number} temperature - LLM temperature
 * @returns {Promise<string>} Raw response text
 */
async function callLLM(prompt, client, backupClient, temperature = 0.7) {
  const runCall = async (activeClient) => {
    const isGroq = activeClient.baseURL.includes("groq");
    const model = isGroq ? BACKUP_MODEL : PRIMARY_MODEL;
    const completion = await activeClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
    });
    return completion.choices[0].message.content.trim();
  };

  if (client) {
    try {
      return await runCall(client);
    } catch (err) {
      console.warn(`⚠️ Primary LLM failed: ${err.message}`);
    }
  }

  if (backupClient) {
    try {
      console.log("🔄 Trying backup LLM...");
      return await runCall(backupClient);
    } catch (err) {
      console.error(`❌ Backup LLM also failed: ${err.message}`);
    }
  }

  throw new Error("No LLM clients succeeded");
}

/**
 * Cleans markdown code blocks from LLM output.
 * @param {string} rawText - Raw LLM output
 * @returns {string} Cleaned text
 */
function cleanCodeBlocks(rawText) {
  if (rawText.startsWith("```")) {
    const lines = rawText.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines[lines.length - 1].startsWith("```")) lines.pop();
    return lines.join("\n").trim();
  }
  return rawText;
}

/**
 * Returns the appropriate model name for a given client.
 * @param {object} client - OpenAI-compatible client
 * @returns {string} Model name
 */
function getModelForClient(client) {
  return client.baseURL.includes("groq") ? GROQ_MODEL : FIREWORKS_MODEL;
}

// ═══════════════════════════════════════════════════════════════
//  DOCTOR SEARCH PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a unique MD5 hash for a query and the current dataset state.
 * @param {string} query - User's query
 * @param {number} recordsLength - Number of records in the dataset
 * @returns {string} MD5 hash string
 */
function getCacheKey(query, recordsLength) {
  const hash = crypto.createHash("md5");
  hash.update(`${query}_${recordsLength}`);
  return hash.digest("hex");
}

/**
 * Extracts symptom keywords and matched specialties from user query.
 * @param {string} userQuery - User's query
 * @param {object} keywordMap - Map of specialty → keyword arrays
 * @returns {{foundKeywords: string[], specialties: string[]}}
 */
function extractKeywords(userQuery, keywordMap) {
  const query = userQuery.toLowerCase();
  const foundKeywords = [];
  const matchedSpecialties = new Set();

  for (const [specialty, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (query.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        matchedSpecialties.add(specialty);
      }
    }
  }

  return {
    foundKeywords,
    specialties: Array.from(matchedSpecialties),
  };
}

/**
 * Filters doctor records by matched specialties.
 * @param {object[]} records - All doctor records
 * @param {string[]} specialties - Matched specialties to filter by
 * @returns {object[]} Filtered doctor records
 */
function filterDoctorsBySpecialty(records, specialties) {
  if (!specialties || specialties.length === 0) {
    return [];
  }
  return records.filter((record) => specialties.includes(record.Specialty));
}

/**
 * Fallback LLM-based specialty classification when keyword mapping finds no matches.
 * @param {string} userQuery - User's query
 * @param {string[]} availableSpecialties - List of valid specialties
 * @param {object} client - Primary LLM client
 * @param {object|null} backupClient - Backup LLM client
 * @returns {Promise<string[]>} Matched specialties
 */
async function classifySpecialtiesWithLLM(userQuery, availableSpecialties, client, backupClient = null) {
  const prompt = `
Analyze the user's health concern or symptom: "${userQuery}"

Determine which of the following medical specialties is the most appropriate match (you can choose more than one if applicable):
${JSON.stringify(availableSpecialties)}

STRICT OUTPUT RULES:
Return a valid JSON list of strings ONLY, e.g.:
["Cardiology"] or ["Orthopedics", "Internal Medicine"]
If none of the specialties are relevant to the user's query, return [].
Do NOT include any extra text, code blocks, or markdown formatting outside the JSON array.
`;

  try {
    let rawText = await callLLM(prompt, client, backupClient, 0.0);
    rawText = cleanCodeBlocks(rawText);
    const specialties = JSON.parse(rawText);
    if (Array.isArray(specialties)) {
      return specialties.filter((s) => availableSpecialties.includes(s));
    }
  } catch (error) {
    console.error(`⚠️ Failed LLM specialty classification fallback: ${error.message}`);
  }
  return [];
}

/**
 * LLM specialty classification with conversation history context.
 * @param {string} userQuery
 * @param {string} conversationHistory
 * @param {string[]} availableSpecialties
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<string[]>}
 */
async function classifySpecialtiesWithLLMAndHistory(userQuery, conversationHistory, availableSpecialties, client, backupClient = null) {
  const prompt = `
Analyze the user's health concern or symptom in the context of the conversation history.

Conversation History:
${conversationHistory}

Current User Query: "${userQuery}"

Determine which of the following medical specialties is the most appropriate match (you can choose more than one if applicable):
${JSON.stringify(availableSpecialties)}

STRICT OUTPUT RULES:
Return a valid JSON list of strings ONLY, e.g.:
["Cardiology"] or ["Orthopedics", "Internal Medicine"]
If none of the specialties are relevant to the user's query, return [].
Do NOT include any extra text, code blocks, or markdown formatting outside the JSON array.
`;

  try {
    let rawText = await callLLM(prompt, client, backupClient, 0.0);
    rawText = cleanCodeBlocks(rawText);
    const specialties = JSON.parse(rawText);
    if (Array.isArray(specialties)) {
      return specialties.filter((s) => availableSpecialties.includes(s));
    }
  } catch (error) {
    console.error("⚠️ Failed LLM specialty classification fallback:", error.message);
  }
  return [];
}

/**
 * Query the LLM to rank/reason for filtered doctors.
 * @param {string} userQuery
 * @param {object[]} filteredRecords
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<object[]>}
 */
async function searchDoctors(userQuery, filteredRecords, client, backupClient = null) {
  if (!filteredRecords || filteredRecords.length === 0) {
    return [];
  }

  const cacheKey = getCacheKey(userQuery, filteredRecords.length);
  const cachedResult = AI_CACHE.get(cacheKey);
  if (cachedResult) {
    logger.info("Cache hit for doctor rankings", { cacheKey: cacheKey.slice(0, 8) });
    return cachedResult;
  }

  let llamaSummary = "";
  for (const record of filteredRecords) {
    llamaSummary += `ID ${record.id}: ${record.Specialty} (${record["Experience (Years)"]} yrs)\n`;
  }

  const prompt = `
A patient reports: "${userQuery}"

Available doctors:
${llamaSummary}

STRICT OUTPUT RULES:
Return a valid JSON ONLY with format:
{
  "results": [
    {"id": "ID_NUMBER", "reasoning": "..." }
  ]
}
Each reasoning should be 1-2 concise sentences explaining why this doctor is a match.
Do NOT include any extra text outside JSON.
`;

  let topPicks = [];
  try {
    let rawText = await callLLM(prompt, client, backupClient, 0.7);
    rawText = cleanCodeBlocks(rawText);
    const aiResponse = JSON.parse(rawText);
    topPicks = aiResponse.results || [];
  } catch (error) {
    console.error("⚠️ Failed to rank doctors via LLM:", error.message);
    topPicks = filteredRecords.map((record) => ({
      id: record.id,
      reasoning: "Recommended based on specialty.",
    }));
  }

  const finalOutput = [];
  for (const pick of topPicks) {
    try {
      const rawId = String(pick.id).toUpperCase().replace("ID", "").trim();
      const docId = parseInt(rawId, 10);
      const record = filteredRecords.find((r) => r.id === docId);
      if (record) {
        finalOutput.push({
          ...record,
          Reasoning: pick.reasoning || "Recommended based on specialty.",
        });
      }
    } catch (e) {
      // skip individual formatting/parsing errors
    }
  }

  AI_CACHE.set(cacheKey, finalOutput);
  return finalOutput;
}

/**
 * Doctor search with conversation history context.
 * @param {string} userQuery
 * @param {string} conversationHistory
 * @param {object[]} filteredRecords
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<object[]>}
 */
async function searchDoctorsWithHistory(userQuery, conversationHistory, filteredRecords, client, backupClient = null) {
  if (!filteredRecords || filteredRecords.length === 0) {
    return [];
  }

  const cacheKey = getCacheKey(`${userQuery}_${conversationHistory || ""}`, filteredRecords.length);
  const cachedResult = AI_CACHE.get(cacheKey);
  if (cachedResult) {
    logger.info("Cache hit for doctor rankings (with history)", { cacheKey: cacheKey.slice(0, 8) });
    return cachedResult;
  }

  let llamaSummary = "";
  for (const record of filteredRecords) {
    llamaSummary += `ID ${record.id}: ${record.Specialty} (${record["Experience (Years)"]} yrs)\n`;
  }

  const prompt = `
Conversation History:
${conversationHistory}

A patient reports/asks: "${userQuery}"

Available doctors:
${llamaSummary}

STRICT OUTPUT RULES:
Return a valid JSON ONLY with format:
{
  "results": [
    {"id": "ID_NUMBER", "reasoning": "..." }
  ]
}
Each reasoning should be 1-2 concise sentences explaining why this doctor is a match.
Do NOT include any extra text outside JSON.
`;

  let topPicks = [];
  try {
    let rawText = await callLLM(prompt, client, backupClient, 0.7);
    rawText = cleanCodeBlocks(rawText);
    const aiResponse = JSON.parse(rawText);
    topPicks = aiResponse.results || [];
  } catch (error) {
    console.error("⚠️ Failed to rank doctors via LLM:", error.message);
    topPicks = filteredRecords.map((record) => ({
      id: record.id,
      reasoning: "Recommended based on specialty.",
    }));
  }

  const finalOutput = [];
  for (const pick of topPicks) {
    try {
      const rawId = String(pick.id).toUpperCase().replace("ID", "").trim();
      const docId = parseInt(rawId, 10);
      const record = filteredRecords.find((r) => r.id === docId);
      if (record) {
        finalOutput.push({
          ...record,
          Reasoning: pick.reasoning || "Recommended based on specialty.",
        });
      }
    } catch (e) {
      // skip
    }
  }

  AI_CACHE.set(cacheKey, finalOutput);
  return finalOutput;
}

/**
 * Full doctor search pipeline.
 * @param {string} userQuery
 * @param {object[]} records
 * @param {object} keywordMap
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<object[]>}
 */
async function doctorSearchPipeline(userQuery, records, keywordMap, client, backupClient = null) {
  let { specialties } = extractKeywords(userQuery, keywordMap);

  if (specialties.length === 0) {
    console.log("🔍 [No keyword matches] Running LLM-based specialty classification fallback...");
    specialties = await classifySpecialtiesWithLLM(userQuery, Object.keys(keywordMap), client, backupClient);
    console.log(`🎯 [LLM Classified Specialties]:`, specialties);
  }

  const filteredRecords = filterDoctorsBySpecialty(records, specialties);
  const results = await searchDoctors(userQuery, filteredRecords, client, backupClient);
  return results;
}

/**
 * Doctor search pipeline with conversation history.
 * @param {string} userQuery
 * @param {string} conversationHistory
 * @param {object[]} records
 * @param {object} keywordMap
 * @param {object} client
 * @param {object|null} backupClient
 * @returns {Promise<object[]>}
 */
async function doctorSearchPipelineWithHistory(userQuery, conversationHistory, records, keywordMap, client, backupClient = null) {
  let { specialties } = extractKeywords(userQuery, keywordMap);

  if (specialties.length === 0) {
    console.log("🔍 [No keyword matches] Running LLM-based specialty classification fallback with history...");
    specialties = await classifySpecialtiesWithLLMAndHistory(userQuery, conversationHistory, Object.keys(keywordMap), client, backupClient);
    console.log(`🎯 [LLM Classified Specialties]:`, specialties);
  }

  const filteredRecords = filterDoctorsBySpecialty(records, specialties);
  const results = await searchDoctorsWithHistory(userQuery, conversationHistory, filteredRecords, client, backupClient);
  return results;
}

// ═══════════════════════════════════════════════════════════════
//  TTS HELPERS
// ═══════════════════════════════════════════════════════════════

// Helper to resolve voice IDs based on TTS_GENDER, ensuring consistency when switching genders.
function getVoiceIds() {
  const gender = (process.env.TTS_GENDER || "female").toLowerCase();
  
  let elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
  let cartesiaVoiceId = process.env.CARTESIA_VOICE_ID;

  // ElevenLabs voice defaults
  const defaultElevenLabsFemale = "EXAVITQu4vr4xnSDxMaL"; // Sarah/Bella
  const defaultElevenLabsMale = "pNInz6obpgDQGcFmaJgB"; // Adam

  // Cartesia voice defaults
  const defaultCartesiaFemale = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"; // Skylar
  const defaultCartesiaMale = "a0e99841-438c-4a64-b679-ae501e7d6091"; // Barbershop Man

  if (gender === "male") {
    if (!elevenLabsVoiceId || elevenLabsVoiceId === defaultElevenLabsFemale) {
      elevenLabsVoiceId = defaultElevenLabsMale;
    }
    if (!cartesiaVoiceId || cartesiaVoiceId === defaultCartesiaFemale) {
      cartesiaVoiceId = defaultCartesiaMale;
    }
  } else {
    if (!elevenLabsVoiceId || elevenLabsVoiceId === defaultElevenLabsMale) {
      elevenLabsVoiceId = defaultElevenLabsFemale;
    }
    if (!cartesiaVoiceId || cartesiaVoiceId === defaultCartesiaMale) {
      cartesiaVoiceId = defaultCartesiaFemale;
    }
  }

  return { elevenLabsVoiceId, cartesiaVoiceId };
}

/**
 * Attempt TTS via ElevenLabs (Tier 1).
 * @param {string} text - Text to speak
 * @returns {Promise<object|null>} Response object or null
 */
async function tryElevenLabsTTS(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const { elevenLabsVoiceId: voiceId } = getVoiceIds();

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
      }),
    }
  );

  if (!ttsRes.ok) {
    const errorBody = await ttsRes.text();
    console.warn(`[tts] ElevenLabs error ${ttsRes.status}: ${errorBody.slice(0, 200)}`);
    return null;
  }
  return ttsRes;
}

/**
 * Attempt TTS via Cartesia (Tier 2).
 * @param {string} text - Text to speak
 * @returns {Promise<object|null>} Response object or null
 */
async function tryCartesiaTTS(text) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return null;

  const { cartesiaVoiceId: voiceId } = getVoiceIds();

  const ttsRes = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-2",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
    }),
  });

  if (!ttsRes.ok) {
    const errorBody = await ttsRes.text();
    console.warn(`[tts] Cartesia error ${ttsRes.status}: ${errorBody.slice(0, 200)}`);
    return null;
  }
  return ttsRes;
}

// ═══════════════════════════════════════════════════════════════
//  SSE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Write an SSE data event to the response.
 * @param {object} res - Express response object
 * @param {object} data - Data to serialize and send
 */
function sseWrite(res, data) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

/**
 * Format conversation history for context.
 * @param {object[]} messages - Messages array
 * @returns {string} Formatted history string
 */
function formatConversationHistory(messages) {
  const recent = messages.slice(0, messages.length - 1);
  if (recent.length === 0) {
    return "No previous conversation history.";
  }
  const limitedRecent = recent.slice(-10);
  return limitedRecent
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "ARIA"}: ${m.content}`)
    .join("\n");
}

/**
 * Helper to build messages array with ARIA system prompt.
 * @param {object[]} userMessages - User's message history
 * @returns {object[]} Messages with system prompt prepended
 */
function buildMessages(userMessages) {
  return [{ role: "system", content: ARIA_SYSTEM_PROMPT }, ...userMessages];
}

/**
 * Sleep utility.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // Logging
  logger,

  // Constants
  ARIA_SYSTEM_PROMPT,
  IHEALTHWELLNESS_CONTEXT,
  AGENT_CONTEXT,
  PRIMARY_MODEL,
  BACKUP_MODEL,
  GROQ_MODEL,
  FIREWORKS_MODEL,

  // Data loading
  loadExcelData,

  // RAG pipeline
  extractTextFromDocx,
  chunkText,
  buildVocabulary,
  getEmbedding,
  indexDocuments,
  cosineSimilarity,
  retrieveContext,

  // LLM helpers
  callLLM,
  cleanCodeBlocks,
  getModelForClient,
  buildMessages,

  // Doctor search pipeline
  getCacheKey,
  extractKeywords,
  filterDoctorsBySpecialty,
  classifySpecialtiesWithLLM,
  classifySpecialtiesWithLLMAndHistory,
  searchDoctors,
  searchDoctorsWithHistory,
  doctorSearchPipeline,
  doctorSearchPipelineWithHistory,

  // TTS helpers
  tryElevenLabsTTS,
  tryCartesiaTTS,

  // SSE helpers
  sseWrite,
  formatConversationHistory,
  sleep,
};

