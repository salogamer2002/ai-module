/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @modified 2026-06-22
 * @reason Main chat page for the Ai-Chatbot module.
 *         REWRITTEN v2: Fixed message duplication, audio overlap, removed
 *         "ARIA thinking" blink, one consistent female voice per session,
 *         immediate interrupt, clean conversation flow.
 *         Uses state (not refs) for all displayed text to ensure re-renders.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import AIAvatar from "../components/AIAvatar";
import HumanAvatar from "../components/HumanAvatar";
import DoctorCard from "../components/DoctorCard";
import VoiceOrb from "../components/VoiceOrb";
import ChatInput from "../components/ChatInput";
import { expandContractions, stripAIEchoPrefix, getWordOverlapRatio } from "../utils/speechHelpers";
import { getApiHeaders } from "../utils/constants";

// ─── Constants ──────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function ChatPage() {
  // ═══════════════════════════════════════════════════════════
  //  STATE — All visible text is driven by React state (not refs)
  // ═══════════════════════════════════════════════════════════
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState("voice");
  const [voiceActive, setVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState(null);
  // Voice mode: accumulated text from completed audio chunks
  const [spokenSoFar, setSpokenSoFar] = useState("");
  // Voice mode: word-by-word revealed text for the current audio chunk
  const [revealedChunk, setRevealedChunk] = useState("");

  // ═══════════════════════════════════════════════════════════
  //  REFS — Internal state that doesn't need re-render
  // ═══════════════════════════════════════════════════════════
  const messagesRef = useRef([]);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const voiceActiveRef = useRef(false);
  const abortControllerRef = useRef(null);
  const audioQueueRef = useRef([]);
  const currentAudioRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const voiceInputLockRef = useRef(false);
  const lastAITextRef = useRef("");
  const lastSentUserTextRef = useRef("");
  const wordRevealIntervalRef = useRef(null);
  // Track which result index we've already processed in recognition
  const recognitionResultStartRef = useRef(0);

  // ── Turn tracking: prevents duplicate messages ──
  const turnIdRef = useRef(0);
  const activeTurnIdRef = useRef(0);
  const activeTurnTextRef = useRef("");
  const activeTurnResultsRef = useRef(null);

  // ── Track actually spoken text for interrupt saves ──
  const spokenSoFarRef = useRef("");
  const revealedChunkRef = useRef("");

  // ── Session TTS voice consistency ──
  const sessionTTSProviderRef = useRef(null);

  // ═══════════════════════════════════════════════════════════
  //  EFFECTS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep spoken text refs in sync with state
  useEffect(() => { spokenSoFarRef.current = spokenSoFar; }, [spokenSoFar]);
  useEffect(() => { revealedChunkRef.current = revealedChunk; }, [revealedChunk]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, interimText, revealedChunk, spokenSoFar]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Warm up browser SpeechSynthesis voices on mount
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const h = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", h);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", h);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  INTERRUPT — Stops everything IMMEDIATELY
  //  SAVES partial AI text to transcript so it doesn't vanish
  // ═══════════════════════════════════════════════════════════
  const interruptAll = useCallback(() => {
    // 1. SAVE only the ACTUALLY SPOKEN text (not full LLM stream)
    //    spokenSoFarRef = completed chunks, revealedChunkRef = current partial chunk
    const spoken = spokenSoFarRef.current?.trim() || "";
    const revealing = revealedChunkRef.current?.trim() || "";
    const partialText = (spoken + (revealing ? " " + revealing : "")).trim();

    if (partialText && activeTurnIdRef.current > 0) {
      const assistantMsg = {
        role: "assistant",
        content: partialText,
        results: activeTurnResultsRef.current,
      };
      const updated = [...messagesRef.current, assistantMsg];
      setMessages(updated);
      messagesRef.current = updated;
      lastAITextRef.current = partialText;
    }

    // 2. Invalidate turn — all guarded callbacks will bail immediately
    activeTurnIdRef.current = -1;
    activeTurnTextRef.current = "";
    activeTurnResultsRef.current = null;

    // 3. Abort in-flight fetch (stream + TTS)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 4. Stop current audio — null out event handlers to prevent ghost onended
    if (currentAudioRef.current) {
      const audio = currentAudioRef.current;
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      try { audio.pause(); audio.src = ""; } catch (e) { }
      currentAudioRef.current = null;
    }

    // 5. Clear audio queue completely
    audioQueueRef.current = [];

    // 6. Stop browser speech synthesis
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current = null;
    }

    // 7. Clear word reveal timer
    if (wordRevealIntervalRef.current) {
      clearInterval(wordRevealIntervalRef.current);
      wordRevealIntervalRef.current = null;
    }

    // 8. Reset all UI state
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setIsProcessing(false);
    isProcessingRef.current = false;
    setStreamingText("");
    setSpokenSoFar("");
    setRevealedChunk("");
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  BROWSER TTS FALLBACK — Consistent female voice
  // ═══════════════════════════════════════════════════════════
  const speakWithBrowserTTS = useCallback((text, onEnd, onError) => {
    if (!window.speechSynthesis || !text) {
      if (onError) onError();
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    currentUtteranceRef.current = utterance;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => {
      const n = v.name.toLowerCase();
      return n.includes("samantha") || n.includes("karen") || n.includes("moira") ||
        n.includes("tessa") || n.includes("veena") || n.includes("hazel") ||
        n.includes("susan") || n.includes("zira") ||
        n.includes("google us english") || n.includes("english (united states)");
    });
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onend = () => { currentUtteranceRef.current = null; if (onEnd) onEnd(); };
    utterance.onerror = () => { currentUtteranceRef.current = null; if (onError) onError(); };

    window.speechSynthesis.speak(utterance);
    if (!sessionTTSProviderRef.current) sessionTTSProviderRef.current = "browser";
    return true;
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  PLAY AUDIO QUEUE — Sequential, no overlap, turn-ID guarded
  // ═══════════════════════════════════════════════════════════
  const playNextInQueue = useCallback((turnId) => {
    // Clear any existing word reveal timer
    if (wordRevealIntervalRef.current) {
      clearInterval(wordRevealIntervalRef.current);
      wordRevealIntervalRef.current = null;
    }

    // If turn was interrupted, bail
    if (turnId !== activeTurnIdRef.current) return;

    // Queue empty → turn complete, finalize message ONCE
    if (audioQueueRef.current.length === 0) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;

      // Add the FULL AI message to transcript — single path, no duplication
      if (turnId === activeTurnIdRef.current && activeTurnTextRef.current.trim()) {
        const assistantMsg = {
          role: "assistant",
          content: activeTurnTextRef.current.trim(),
          results: activeTurnResultsRef.current,
        };
        const updated = [...messagesRef.current, assistantMsg];
        setMessages(updated);
        messagesRef.current = updated;
        lastAITextRef.current = activeTurnTextRef.current.trim();
      }

      // Clear turn state
      activeTurnTextRef.current = "";
      activeTurnResultsRef.current = null;
      activeTurnIdRef.current = -1;
      setStreamingText("");
      setSpokenSoFar("");
      setRevealedChunk("");
      return;
    }

    // Dequeue next item
    const item = audioQueueRef.current.shift();
    const { text } = item;

    // Reset chunk text
    setRevealedChunk("");

    // Word-by-word reveal synced to audio duration
    const startWordReveal = (durationSec) => {
      if (!text) return;
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;

      const totalMs = durationSec ? durationSec * 1000 : words.length * 300;
      const intervalMs = Math.max(60, Math.min(totalMs / words.length, 350));

      let wordIdx = 0;
      setRevealedChunk(words[0]);
      wordIdx = 1;

      wordRevealIntervalRef.current = setInterval(() => {
        if (turnId !== activeTurnIdRef.current) {
          clearInterval(wordRevealIntervalRef.current);
          wordRevealIntervalRef.current = null;
          return;
        }
        if (wordIdx < words.length) {
          setRevealedChunk(words.slice(0, wordIdx + 1).join(" "));
          wordIdx++;
        } else {
          clearInterval(wordRevealIntervalRef.current);
          wordRevealIntervalRef.current = null;
          // Chunk fully revealed → move to accumulated spoken text
          setSpokenSoFar(prev => (prev ? prev + " " : "") + text);
          setRevealedChunk("");
        }
      }, intervalMs);
    };

    const onChunkDone = () => {
      // GUARD: if turn was interrupted, bail — do NOT play next audio
      if (turnId !== activeTurnIdRef.current) return;

      // Ensure chunk text is in accumulated display
      setSpokenSoFar(prev => {
        if (text && !prev.includes(text)) {
          return (prev ? prev + " " : "") + text;
        }
        return prev;
      });
      if (wordRevealIntervalRef.current) {
        clearInterval(wordRevealIntervalRef.current);
        wordRevealIntervalRef.current = null;
      }
      setRevealedChunk("");
      playNextInQueue(turnId);
    };

    if (item.type === "speechSynthesis") {
      startWordReveal(null);
      const started = speakWithBrowserTTS(text, onChunkDone, onChunkDone);
      if (!started) onChunkDone();
    } else {
      // Cloud audio blob
      const url = URL.createObjectURL(item.blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };

      audio.onloadedmetadata = () => {
        if (turnId !== activeTurnIdRef.current) { cleanup(); return; }
        startWordReveal(audio.duration);
      };

      audio.onended = () => { cleanup(); onChunkDone(); };

      audio.onerror = () => {
        cleanup();
        // Skip this chunk — don't fall back to browser TTS (keeps same voice)
        onChunkDone();
      };

      audio.play().then(() => {
        if (turnId !== activeTurnIdRef.current) { cleanup(); audio.pause(); return; }
        if (!wordRevealIntervalRef.current && text) startWordReveal(null);
      }).catch(() => {
        cleanup();
        // Skip — keep consistent voice, don't switch to browser TTS
        onChunkDone();
      });
    }
  }, [speakWithBrowserTTS]);

  // ═══════════════════════════════════════════════════════════
  //  STREAM AI RESPONSE — Core Pipeline (serialized TTS)
  // ═══════════════════════════════════════════════════════════
  const streamAIResponse = useCallback(async (chatMessages, withTTS = false) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Create unique turn ID
    const thisTurnId = ++turnIdRef.current;
    activeTurnIdRef.current = thisTurnId;
    activeTurnTextRef.current = "";
    activeTurnResultsRef.current = null;

    setIsProcessing(true);
    isProcessingRef.current = true;
    setStreamingText("");
    setSpokenSoFar("");
    setRevealedChunk("");

    let fullText = "";
    let sentenceBuffer = "";
    let ttsStarted = false;

    // ── Serialized TTS queue ──────────────────────────
    // Sentences are queued and processed one at a time to avoid 429 errors
    const ttsQueue = [];
    let ttsProcessing = false;
    let streamDone = false;

    const processTTSQueue = async () => {
      if (ttsProcessing) return; // Only one processor at a time
      ttsProcessing = true;

      while (ttsQueue.length > 0) {
        if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) {
          ttsProcessing = false;
          return;
        }

        const textChunk = ttsQueue.shift();

        try {
          const ttsRes = await fetch("/api/tts", {
            method: "POST",
            headers: { ...getApiHeaders() },
            body: JSON.stringify({ text: textChunk }),
            signal: controller.signal,
          });

          if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) {
            ttsProcessing = false;
            return;
          }

          if (ttsRes.ok) {
            const blob = await ttsRes.blob();
            if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) {
              ttsProcessing = false;
              return;
            }

            const provider = ttsRes.headers.get("X-TTS-Provider") || "cartesia";
            if (!sessionTTSProviderRef.current) sessionTTSProviderRef.current = provider;

            audioQueueRef.current.push({ type: "audio", blob, text: textChunk });

            if (!ttsStarted) {
              ttsStarted = true;
              setIsSpeaking(true);
              isSpeakingRef.current = true;
              setIsProcessing(false);
              isProcessingRef.current = false;
              playNextInQueue(thisTurnId);
            }
          } else if (ttsRes.status === 501) {
            // Cloud TTS exhausted → browser fallback for this chunk
            if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) {
              ttsProcessing = false;
              return;
            }
            audioQueueRef.current.push({ type: "speechSynthesis", text: textChunk });
            if (!ttsStarted) {
              ttsStarted = true;
              setIsSpeaking(true);
              isSpeakingRef.current = true;
              setIsProcessing(false);
              isProcessingRef.current = false;
              playNextInQueue(thisTurnId);
            }
          }
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("[TTS] Error:", err.message);
            // Fallback to browser TTS on network error
            audioQueueRef.current.push({ type: "speechSynthesis", text: textChunk });
            if (!ttsStarted) {
              ttsStarted = true;
              setIsSpeaking(true);
              isSpeakingRef.current = true;
              setIsProcessing(false);
              isProcessingRef.current = false;
              playNextInQueue(thisTurnId);
            }
          }
        }
      }

      ttsProcessing = false;
    };

    const queueSentenceForTTS = (textChunk) => {
      if (!textChunk.trim() || !withTTS) return;
      ttsQueue.push(textChunk.trim());
      processTTSQueue(); // Start processing if not already running
    };

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { ...getApiHeaders() },
        body: JSON.stringify({ messages: chatMessages }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Stream failed: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === "results") {
              activeTurnResultsRef.current = data.content;
            } else if (data.type === "token") {
              fullText += data.content;
              activeTurnTextRef.current = fullText;
              if (!withTTS) setStreamingText(fullText);

              sentenceBuffer += data.content;
              if (/[.!?]\s|[.!?]$/.test(sentenceBuffer) && sentenceBuffer.trim().length > 20) {
                const toFlush = sentenceBuffer.trim();
                sentenceBuffer = "";
                queueSentenceForTTS(toFlush);
              }
            } else if (data.type === "done") {
              if (sentenceBuffer.trim()) {
                queueSentenceForTTS(sentenceBuffer.trim());
                sentenceBuffer = "";
              }
            } else if (data.type === "error") {
              setError(data.content || "Stream error");
            }
          } catch (e) { /* skip */ }
        }
      }

      if (sentenceBuffer.trim()) queueSentenceForTTS(sentenceBuffer.trim());
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[Stream] Error:", err);
        setError("Connection error. Please try again.");
      }
    }

    // Stream done — wait for TTS queue to finish processing
    // The serialized TTS processor may still be working through sentences
    if (withTTS && ttsQueue.length > 0) {
      // Wait for the TTS queue to drain
      const maxWait = 30000;
      const start = Date.now();
      while ((ttsQueue.length > 0 || ttsProcessing) && Date.now() - start < maxWait) {
        if (controller.signal.aborted || thisTurnId !== activeTurnIdRef.current) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Finalize
    if (thisTurnId !== activeTurnIdRef.current) return;

    if (fullText.trim()) {
      activeTurnTextRef.current = fullText.trim();

      if (!withTTS) {
        // Text mode: add message immediately
        setStreamingText("");
        setIsProcessing(false);
        isProcessingRef.current = false;
        const msg = { role: "assistant", content: fullText.trim(), results: activeTurnResultsRef.current };
        const updated = [...messagesRef.current, msg];
        setMessages(updated);
        messagesRef.current = updated;
        lastAITextRef.current = fullText.trim();
        activeTurnIdRef.current = -1;
        activeTurnTextRef.current = "";
        activeTurnResultsRef.current = null;
      } else if (!ttsStarted) {
        // Voice mode but TTS never started (all providers failed) — show text at least
        setIsProcessing(false);
        isProcessingRef.current = false;
        const msg = { role: "assistant", content: fullText.trim(), results: activeTurnResultsRef.current };
        const updated = [...messagesRef.current, msg];
        setMessages(updated);
        messagesRef.current = updated;
        lastAITextRef.current = fullText.trim();
        activeTurnIdRef.current = -1;
        activeTurnTextRef.current = "";
        activeTurnResultsRef.current = null;
      }
      // else: Voice mode with TTS playing — playNextInQueue will finalize when queue empties
    } else {
      setStreamingText("");
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }, [playNextInQueue]);

  // ═══════════════════════════════════════════════════════════
  //  VOICE INPUT HANDLER — Processes finalized speech
  // ═══════════════════════════════════════════════════════════
  const handleVoiceInput = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 2) return;

    // Echo/hallucination filter — ignore mic picking up AI's own speech
    if (isSpeakingRef.current || isProcessingRef.current) {
      const cleanLower = trimmed.toLowerCase().replace(/[^a-z\s]/g, "").trim();
      const echoPatterns = [
        "sorry", "so sorry", "i am sorry", "im sorry", "i am so sorry",
        "oh sorry", "please", "sorry sorry", "thank you", "thanks",
      ];
      if (echoPatterns.includes(cleanLower)) return;
    }

    // Strict duplicate check — reject if >70% word overlap with last sent text
    if (lastSentUserTextRef.current) {
      const ratio = getWordOverlapRatio(trimmed, lastSentUserTextRef.current);
      if (ratio > 0.7) return;
    }

    // Debounce lock — 800ms to prevent double-firing
    if (voiceInputLockRef.current) return;
    voiceInputLockRef.current = true;
    setTimeout(() => { voiceInputLockRef.current = false; }, 800);

    // Interrupt AI if currently active — this SAVES partial AI text
    if (isProcessingRef.current || isSpeakingRef.current) {
      interruptAll();
    }

    lastSentUserTextRef.current = trimmed;

    // Add user message (use messagesRef which now includes the saved partial AI text)
    const userMsg = { role: "user", content: trimmed };
    const updated = [...messagesRef.current, userMsg];
    setMessages(updated);
    messagesRef.current = updated;

    // Start AI response
    streamAIResponse(updated, true);
  }, [interruptAll, streamAIResponse]);

  // ═══════════════════════════════════════════════════════════
  //  VOICE SESSION START / STOP
  // ═══════════════════════════════════════════════════════════
  const startVoiceSession = useCallback(() => {
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    // Track where to start reading results from (avoids re-processing old results)
    recognitionResultStartRef.current = 0;

    recognition.onresult = (event) => {
      if (!voiceActiveRef.current) return;

      // Only process NEW results (from recognitionResultStartRef onward)
      let finalT = "";
      let interimT = "";

      for (let i = recognitionResultStartRef.current; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalT += transcript;
          // Move the start pointer past finalized results
          recognitionResultStartRef.current = i + 1;
        } else {
          interimT += transcript;
        }
      }

      const rawSpeechText = (finalT + interimT).trim();
      if (!rawSpeechText) return;

      // Echo detection — strip text matching last AI response
      const currentSpeechText = stripAIEchoPrefix(rawSpeechText, lastAITextRef.current);
      if (!currentSpeechText) return;

      // If AI is speaking and user says something short matching AI text, ignore (echo)
      if (isSpeakingRef.current) {
        const cleanUser = expandContractions(currentSpeechText).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const cleanAi = expandContractions(lastAITextRef.current).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        if (cleanUser && cleanAi.includes(cleanUser) && cleanUser.split(/\s+/).length < 5) {
          return;
        }
      }

      // If AI is active and user has meaningful input → interrupt
      if (isSpeakingRef.current || isProcessingRef.current) {
        const words = currentSpeechText.toLowerCase().split(/\s+/).filter(Boolean);
        const isCommand = words.length === 1 && ["stop", "wait", "no", "aria"].includes(words[0]);
        if (words.length >= 2 || currentSpeechText.length >= 8 || isCommand) {
          interruptAll();
        } else {
          return;
        }
      }

      // Debounce — wait for 1s silence before sending
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      setInterimText(currentSpeechText);
      setIsListening(true);

      const textToSend = currentSpeechText;
      silenceTimeoutRef.current = setTimeout(() => {
        // Abort recognition to get a clean restart
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (e) { }
        }
        setInterimText("");
        setIsListening(false);
        if (textToSend) handleVoiceInput(textToSend);
      }, 1000);
    };

    recognition.onstart = () => {
      console.log("[STT] Recognition started");
      recognitionResultStartRef.current = 0;
    };

    recognition.onend = () => {
      if (voiceActiveRef.current) {
        // Reset result tracking for the new recognition session
        recognitionResultStartRef.current = 0;
        try {
          setTimeout(() => {
            if (voiceActiveRef.current && recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (e) { }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow mic in browser settings.");
        setVoiceActive(false);
        voiceActiveRef.current = false;
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        if (voiceActiveRef.current) {
          recognitionResultStartRef.current = 0;
          try {
            setTimeout(() => {
              if (voiceActiveRef.current && recognitionRef.current) {
                recognitionRef.current.start();
              }
            }, 300);
          } catch (e) { }
        }
      }
    };

    recognitionRef.current = recognition;
    setVoiceActive(true);
    voiceActiveRef.current = true;

    try {
      recognition.start();
    } catch (e) {
      setError("Could not start speech recognition.");
      setVoiceActive(false);
      voiceActiveRef.current = false;
      return;
    }

    // Unlock audio autoplay
    try {
      const silence = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA");
      silence.play().then(() => console.log("[Audio] Autoplay unlocked"));
    } catch (e) { }
  }, [handleVoiceInput, interruptAll]);

  const stopVoiceSession = useCallback(() => {
    voiceActiveRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) { }
      recognitionRef.current = null;
    }

    // Clear pending silence timeout — prevents stale input from firing after restart
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Kill everything
    interruptAll();

    voiceInputLockRef.current = false;
    // Reset duplicate detection so user can repeat queries after restart
    lastSentUserTextRef.current = "";
    setVoiceActive(false);
    setIsListening(false);
    setInterimText("");
  }, [interruptAll]);

  // ═══════════════════════════════════════════════════════════
  //  TEXT SUBMIT
  // ═══════════════════════════════════════════════════════════
  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isProcessingRef.current) return;

    setInputValue("");
    const userMsg = { role: "user", content: text };
    const updated = [...messagesRef.current, userMsg];
    setMessages(updated);
    messagesRef.current = updated;
    streamAIResponse(updated, false);
  }, [inputValue, streamAIResponse]);

  // ═══════════════════════════════════════════════════════════
  //  CLEAR
  // ═══════════════════════════════════════════════════════════
  const clearMessages = useCallback(() => {
    interruptAll();
    setMessages([]);
    messagesRef.current = [];
    setStreamingText("");
    setInterimText("");
    setSpokenSoFar("");
    setRevealedChunk("");
    voiceInputLockRef.current = false;
    lastSentUserTextRef.current = "";
    lastAITextRef.current = "";
    sessionTTSProviderRef.current = null;
  }, [interruptAll]);

  // ═══════════════════════════════════════════════════════════
  //  DERIVED UI STATE
  // ═══════════════════════════════════════════════════════════
  // Build live AI text from state variables (not refs) — triggers re-renders
  const voiceStreamingText = (spokenSoFar + (revealedChunk ? " " + revealedChunk : "")).trim();

  const orbState = voiceActive
    ? isSpeaking ? "speaking" : isListening ? "listening" : "ready"
    : "idle";

  const statusText = {
    idle: "Click to start talking",
    ready: "Listening…",
    listening: "Hearing you…",
    speaking: "ARIA is speaking…",
  }[orbState];

  const statusSub = {
    idle: "Voice powered by ElevenLabs + Fireworks AI",
    ready: "Speak naturally — ARIA is ready",
    listening: "Processing your speech in real-time",
    speaking: "Interrupt by speaking anytime",
  }[orbState];

  const orbIcon = {
    idle: "✦",
    ready: "🎙️",
    listening: "🎙️",
    speaking: "🔊",
  }[orbState];

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">A</div>
          <div className="header-text">
            <h1>ARIA</h1>
            <p>iHealth &amp; Wellness Foundation</p>
          </div>
        </div>
        <div className="header-controls">
          <div className="mode-toggle">
            <button className={mode === "voice" ? "active" : ""} onClick={() => setMode("voice")}>
              🎙️ Voice
            </button>
            <button
              className={mode === "text" ? "active" : ""}
              onClick={() => { setMode("text"); if (voiceActive) stopVoiceSession(); }}
            >
              💬 Text
            </button>
          </div>
          <div className="header-status">
            <span className={`status-dot ${voiceActive ? "connected" : "disconnected"}`} />
            {voiceActive ? "Voice Active" : "Voice Off"}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="main-content">
        {mode === "voice" && (
          <VoiceOrb
            orbState={orbState}
            statusText={statusText}
            statusSub={statusSub}
            orbIcon={orbIcon}
            onToggle={voiceActive ? stopVoiceSession : startVoiceSession}
          />
        )}

        <section className={`chat-panel ${mode === "text" ? "full-width" : ""}`}>
          <div className="chat-header">
            <h2>{mode === "voice" ? "🎙️ Live Transcript" : "💬 Text Chat"}</h2>
            <button className="clear-btn" onClick={clearMessages}>🗑️ Clear</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && !streamingText && !interimText && !isProcessing && !isSpeaking && !voiceStreamingText ? (
              <div className="chat-empty">
                <span className="chat-empty-icon">{mode === "voice" ? "🎙️" : "💬"}</span>
                <p>
                  {mode === "voice"
                    ? "Click the orb above to start a voice conversation with ARIA."
                    : "Type a message below to start chatting with ARIA."}
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`message ${msg.role}`}>
                    <div className="message-row">
                      {msg.role === "user" && <HumanAvatar />}
                      {msg.role === "assistant" && <AIAvatar />}
                      <div className="message-content">
                        <span className="message-label">
                          {msg.role === "user" ? "YOU" : "ARIA"}
                        </span>
                        <div className="message-bubble">
                          {msg.content}
                          {msg.results && msg.results.length > 0 && (
                            <div className="doctor-results-container">
                              {msg.results.map((doc, dIdx) => (
                                <DoctorCard key={dIdx} doctor={doc} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* AI streaming response */}
                {(mode === "text" ? streamingText : voiceStreamingText) ? (
                  <div className="message assistant streaming">
                    <div className="message-row">
                      <AIAvatar isActive={isSpeaking || (mode === "text" && isProcessing)} />
                      <div className="message-content">
                        <span className="message-label">ARIA</span>
                        <div className="message-bubble">
                          {mode === "text" ? (
                            <>
                              {streamingText}
                              <span className="streaming-cursor">▊</span>
                            </>
                          ) : (
                            <>
                              {voiceStreamingText}
                              {isSpeaking && <span className="streaming-cursor">▊</span>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* User interim speech */}
                {interimText && (
                  <div className="message user interim">
                    <div className="message-row">
                      <HumanAvatar isActive={isListening} />
                      <div className="message-content">
                        <span className="message-label">You (speaking…)</span>
                        <div className="message-bubble">{interimText}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {mode === "text" && (
            <ChatInput
              inputValue={inputValue}
              setInputValue={setInputValue}
              isProcessing={isProcessing}
              onSubmit={handleTextSubmit}
            />
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by Fireworks AI • ElevenLabs • iHealth Foundation</p>
      </footer>

      {/* Error Toast */}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}

export default ChatPage;
