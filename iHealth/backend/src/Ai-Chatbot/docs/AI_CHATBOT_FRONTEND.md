# AI-Chatbot Frontend Integration Guide

> **@author** Muhammad Salman - AI Engineer
> **@date** 2026-06-21

## Quick Start

The frontend React module connects to the backend via `/api/v1/chatbot/*` endpoints.

### SSE Streaming (Primary)
```javascript
const response = await fetch("/api/v1/chatbot/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      if (data.type === "token") appendToUI(data.content);
      if (data.type === "results") showDoctorCards(data.content);
      if (data.type === "done") finalizeMessage();
    }
  }
}
```

### TTS Audio Playback
```javascript
const ttsRes = await fetch("/api/v1/chatbot/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Hello" }),
});

if (ttsRes.ok) {
  const blob = await ttsRes.blob();
  const audio = new Audio(URL.createObjectURL(blob));
  audio.play();
} else if (ttsRes.status === 501) {
  // Fallback to Web Speech API
  const utterance = new SpeechSynthesisUtterance("Hello");
  speechSynthesis.speak(utterance);
}
```

## Module Structure
```
frontend/src/Ai-Chatbot/
├── Assets/           — Static assets
├── components/       — Reusable UI components
├── Context/          — React Context providers
├── pages/            — Page-level components
├── utils/            — API helpers, constants, speech utilities
└── routes.jsx        — Module route definitions
```
