# 🧠 iHealth Wellness Chatbot (MVP)

A lightweight multi-agent healthcare chatbot that provides:
- Basic conversational responses
- Symptom-based doctor recommendations
- Document-based Q&A using RAG

This project is an MVP focused on validating core ideas using LLMs and simple data pipelines.

---

## 🚀 Features

- 🔀 LLM-based intent routing (Supervisor Agent)
- 💬 Greeting & organization-aware responses
- 🩺 Doctor recommendation system using:
  - Keyword mapping (config.json)
  - Structured filtering (Excel dataset)
  - LLM-based ranking & reasoning
- 📄 RAG pipeline for document-based queries

---

## 🏗️ Architecture (MVP)


User Input
→ Supervisor Agent (LLM Classification)

→ One of:

  • Greeting Agent

  • Doctor Search Pipeline

  • RAG Agent

→ Response


### Key Design Choices
- No over-engineering (simple function-based flow)
- No vector DB for doctor data (uses structured filtering)
- LLM used only for:
  - Intent classification
  - Response generation
  - Doctor ranking

---

## 📁 Project Structure

```
.
├── agents/
│ ├── supervisor_agent.py # Intent routing
│ ├── greetings.py # Greeting + foundation info
│ ├── tools_agent.py # Doctor search interface
│ ├── rag_agent.py # RAG logic
│
├── rag/
│ ├── chunking.py
│ ├── embedding_model.py
│ ├── retriever.py
│ ├── generator.py
│
├── utils.py # Doctor search pipeline
├── app.py # Main CLI entry point
├── config.json # Specialty keyword mapping
├── sample_data.xlsx # Doctor dataset
├── requirements.txt
└── .env # API keys

```
---

## ⚙️ How It Works

### 1. Intent Classification
User input is classified into:
- `greeting`
- `doctor_search`
- `rag`

---

### 2. Doctor Search Pipeline


User Query
→ Extract Keywords
→ Map to Specialty (config.json)
→ Filter Doctors (Excel)
→ LLM Ranking + Reasoning


⚠️ Note:
- No embeddings or vector search used here
- Fully structured + rule-based filtering

---

### 3. RAG Pipeline


Query
→ Document Chunking
→ Embeddings
→ Retrieval
→ LLM Response


---

## 📊 Data Sources

| Source | Usage |
|--------|------|
| `sample_data.xlsx` | Doctor dataset |
| `config.json` | Symptom → specialty mapping |
| Documents | RAG knowledge base |

---

## 🤖 LLM

- Model: `llama-3.3-70b-versatile` (via Groq)
- Used for:
  - Intent classification
  - Response generation
  - Doctor ranking

---

## ▶️ Running the Project

▶️ How to Run
1. Clone the Repository
```
git clone repolink
cd public_health_chatbot
```

2. Create a Groq API Key

    - Go to: https://console.groq.com/keys
    - Sign up / log in
    - Generate a free API key
    - Create a .env file in the root directory and add:
    - GROQ_API_KEY=your_api_key_here


3. Create a Virtual Environment
```
python -m venv searchenv
```
4. Activate the Environment

Windows:
```
searchenv\Scripts\activate
```
Mac/Linux:
```
source searchenv/bin/activate
```
5. Install Dependencies
```
pip install -r requirements.txt
```
6. Run the Chatbot
```
python app.py
```

💬 Example Queries

- "Hi, what do you do?"
- "I have chest pain and dizziness"
- "Tell me about diabetes care"
- "Find a doctor for knee pain"


⚠️ Limitations (MVP Scope)

- No conversation memory
- No real-time doctor availability
- No medical validation (not a replacement for doctors)
- CLI-based (no UI/API yet)
- LLM-based routing may introduce latency


🛣️ Future Improvements
- Add FastAPI backend / UI
- Replace keyword matching with embeddings
- Add conversation memory
- Integrate vector database
- Improve medical safety & validation

📌 Disclaimer

This chatbot provides general guidance only and does not replace professional medical advice.