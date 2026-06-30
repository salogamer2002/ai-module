# AI-Chatbot API Reference

> **@author** Muhammad Salman - AI Engineer
> **@date** 2026-06-21
> **Base URL:** `/api/v1/chatbot`

---

## Core AI Endpoints

### POST `/message`
Non-streaming query — routes through supervisor → agent pipeline.

**Request Body:**
```json
{ "message": "Find a cardiologist for chest pain" }
```

**Response:**
```json
{
  "intent": "doctor_search",
  "response": "Based on your symptoms, you may need a Cardiology specialist.",
  "results": [
    {
      "Name": "Dr. Smith",
      "Specialty": "Cardiology",
      "Degree": "MD",
      "Experience (Years)": 15,
      "Hospital": "City Hospital",
      "Phone": "555-0100",
      "Reasoning": "Specialist in cardiac care with 15 years experience."
    }
  ]
}
```

### POST `/stream`
SSE streaming with full agent pipeline (greeting/doctor_search/rag).

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "hello" },
    { "role": "assistant", "content": "Hi there!" },
    { "role": "user", "content": "I have chest pain" }
  ]
}
```

**SSE Events:**
```
data: {"type":"intent","content":"doctor_search"}
data: {"type":"results","content":[...]}
data: {"type":"token","content":"Based "}
data: {"type":"token","content":"on "}
data: {"type":"done"}
```

### POST `/chat`
Non-streaming chat fallback (direct LLM, no agent pipeline).

**Request Body:**
```json
{ "messages": [{ "role": "user", "content": "hello" }] }
```

**Response:**
```json
{ "reply": "Hello! How can I help?", "provider": "groq" }
```

---

## TTS Endpoints

### POST `/tts`
3-tier auto-fallback: ElevenLabs → Cartesia → 501 (client uses Web Speech API).

**Request Body:**
```json
{ "text": "Hello, how can I help you today?" }
```

**Response:** `audio/mpeg` stream with `X-TTS-Provider` header.

### POST `/tts/cartesia`
Direct Cartesia TTS endpoint.

---

## Session Management

### POST `/session`
Create a new chat session.

**Request Body:**
```json
{ "userId": "user123", "title": "Health Query" }
```

### GET `/sessions?userId=user123`
Get all sessions for a user.

### GET `/messages/:sessionId`
Get all messages in a session.

### DELETE `/session/:id`
Delete (soft) a session.

### POST `/feedback`
Submit feedback on a response.

**Request Body:**
```json
{ "messageId": "msg-uuid", "rating": 5, "comment": "Very helpful!" }
```

---

## Health Check

### GET `/health`
Returns server health, uptime, memory, provider status, and database size.
