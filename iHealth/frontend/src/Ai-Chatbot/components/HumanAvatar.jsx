/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Human Avatar SVG component for the Ai-Chatbot module.
 */
import React from "react";

function HumanAvatar({ isActive = false }) {
  return (
    <div className={`avatar avatar-lg avatar-human ${isActive ? "avatar-speaking" : ""}`}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="humanBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a3e" />
            <stop offset="100%" stopColor="#2d2b55" />
          </linearGradient>
          <linearGradient id="skinTone" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f0c8a0" />
            <stop offset="100%" stopColor="#e0a878" />
          </linearGradient>
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3a2a1a" />
            <stop offset="100%" stopColor="#2a1a0a" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#humanBg)" stroke="#667eea" strokeWidth="2" opacity="0.9" />
        <circle cx="50" cy="42" r="18" fill="url(#skinTone)" />
        <ellipse cx="50" cy="28" rx="19" ry="12" fill="url(#hairGrad)" />
        <path d="M 31 35 Q 31 25, 40 22" stroke="url(#hairGrad)" fill="url(#hairGrad)" strokeWidth="2" />
        <path d="M 69 35 Q 69 25, 60 22" stroke="url(#hairGrad)" fill="url(#hairGrad)" strokeWidth="2" />
        <circle cx="43" cy="40" r="2.5" fill="#2a1a0a" />
        <circle cx="57" cy="40" r="2.5" fill="#2a1a0a" />
        <circle cx="44" cy="39.5" r="0.8" fill="#ffffff" opacity="0.8" />
        <circle cx="58" cy="39.5" r="0.8" fill="#ffffff" opacity="0.8" />
        <path d="M 40 36 Q 43 34, 46 36" stroke="#2a1a0a" strokeWidth="1" fill="none" />
        <path d="M 54 36 Q 57 34, 60 36" stroke="#2a1a0a" strokeWidth="1" fill="none" />
        <ellipse cx="50" cy="44" rx="2" ry="1.5" fill="#d4956a" opacity="0.6" />
        <line className="mouth-closed" x1="45" y1="49" x2="55" y2="49" stroke="#c47a5a" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse className="mouth-open" cx="50" cy="49" rx="5" ry="3" fill="#c47a5a" opacity="0" />
        <ellipse cx="50" cy="72" rx="20" ry="16" fill="#667eea" />
        <line x1="50" y1="60" x2="50" y2="66" stroke="url(#skinTone)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="50" cy="68" r="2" fill="#ffffff" opacity="0.3" />
      </svg>
    </div>
  );
}

export default HumanAvatar;
