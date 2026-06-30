/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason AI Avatar SVG component for the Ai-Chatbot module.
 */
import React from "react";

function AIAvatar({ isActive = false }) {
  return (
    <div className={`avatar avatar-lg avatar-ai ${isActive ? "avatar-speaking" : ""}`}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="aiBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="100%" stopColor="#162544" />
          </linearGradient>
          <linearGradient id="aiAccent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#00a3cc" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#aiBg)" stroke="#00d4ff" strokeWidth="2" opacity="0.9" />
        <line x1="50" y1="8" x2="50" y2="18" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <circle className="antenna-dot" cx="50" cy="7" r="3" fill="#00d4ff" />
        <rect x="30" y="28" rx="12" ry="12" width="40" height="30" fill="#1a2a4a" stroke="#00d4ff" strokeWidth="1.5" />
        <circle cx="40" cy="40" r="4" fill="#00d4ff"><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" /></circle>
        <circle cx="60" cy="40" r="4" fill="#00d4ff"><animate attributeName="opacity" values="1;0.3;1" dur="2s" begin="0.3s" repeatCount="indefinite" /></circle>
        <line className="ai-mouth-closed" x1="42" y1="50" x2="58" y2="50" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <ellipse className="ai-mouth-open" cx="50" cy="50" rx="7" ry="4" fill="#00d4ff" opacity="0" />
        <rect x="34" y="62" rx="6" ry="6" width="32" height="20" fill="#1a2a4a" stroke="#00d4ff" strokeWidth="1" />
        <circle className="ai-chest-core" cx="50" cy="72" r="3" fill="#00d4ff" opacity="0.5" />
        <rect x="24" y="65" rx="3" ry="3" width="8" height="14" fill="#1a2a4a" stroke="#00d4ff" strokeWidth="1" />
        <rect x="68" y="65" rx="3" ry="3" width="8" height="14" fill="#1a2a4a" stroke="#00d4ff" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default AIAvatar;
