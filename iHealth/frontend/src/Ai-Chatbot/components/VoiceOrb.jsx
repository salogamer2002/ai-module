/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-22
 * @reason Realistic AI Human Avatar with SVG lip overlay for speaking animation.
 *         Light pink lips with skin-toned blending. Only visible when speaking.
 */
import React from "react";

function VoiceOrb({ orbState, statusText, statusSub, orbIcon, onToggle }) {
  const isSpeaking = orbState === "speaking";
  const isListening = orbState === "listening";
  const isReady = orbState === "ready";
  const isIdle = orbState === "idle";

  return (
    <section className="voice-panel">
      <div className={`avatar-card ${orbState}`}>
        {/* The realistic avatar frame */}
        <div
          className="avatar-frame"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          aria-label="Toggle voice session"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggle();
          }}
        >
          <div className="avatar-visual-wrapper">
            {/* Base image (mouth closed) — stays perfectly still */}
            <img
              src="/ai_interviewer_avatar.png"
              alt="ARIA AI Interviewer"
              className="avatar-image base"
            />

            {/* SVG mouth overlay — light pink lips with skin-toned gradient.
                Only visible when speaking. Positioned exactly on the avatar's
                lips using coordinates measured from the actual image. */}
            <svg
              className={`mouth-svg-overlay ${isSpeaking ? "speaking" : ""}`}
              viewBox="0 0 100 60"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="ariaSkinBlend" cx="50%" cy="50%" r="50%">
                  <stop offset="30%" stopColor="#dbb0a2" stopOpacity="1" />
                  <stop offset="65%" stopColor="#dbb0a2" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#dbb0a2" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Skin patch — covers photo's mouth, soft feathered edges blend */}
              <ellipse cx="50" cy="30" rx="46" ry="26" fill="url(#ariaSkinBlend)" />
              {/* Mouth interior — warm dark cavity (NOT black) */}
              <g className="svg-mouth-interior" style={{ transformOrigin: '50px 30px' }}>
                <ellipse cx="50" cy="31" rx="16" ry="5" fill="#3a1510" />
              </g>
              {/* Upper lip — light pink, cupid's bow shape */}
              <g className="svg-upper-lip" style={{ transformOrigin: '50px 28px' }}>
                <path
                  d="M 18,31 Q 34,24 50,26 Q 66,24 82,31 Q 66,34 50,32 Q 34,34 18,31 Z"
                  fill="#d4918a"
                />
              </g>
              {/* Lower lip — light pink, fuller shape */}
              <g className="svg-lower-lip" style={{ transformOrigin: '50px 31px' }}>
                <path
                  d="M 18,31 Q 34,34 50,32 Q 66,34 82,31 Q 74,41 50,43 Q 26,41 18,31 Z"
                  fill="#d4918a"
                />
              </g>
            </svg>
          </div>

          {/* Glowing pulse rings when active (speaking/listening) */}
          {(isSpeaking || isListening) && (
            <div className="avatar-pulse-rings">
              <div className="avatar-ring" />
              <div className="avatar-ring" />
            </div>
          )}

          {/* Live Audio Visualizer Wave Overlay at the bottom */}
          {isSpeaking && (
            <div className="audio-visualizer-wave">
              <span className="wave-bar" />
              <span className="wave-bar" />
              <span className="wave-bar" />
              <span className="wave-bar" />
              <span className="wave-bar" />
            </div>
          )}
        </div>

        {/* Info & Status */}
        <div className="avatar-info">
          <h3>ARIA</h3>
          <span className={`badge-status ${orbState}`}>{statusText}</span>
          <p className="avatar-sub">{statusSub}</p>
        </div>

        {/* Start/Stop Button */}
        <button
          className={`voice-toggle-btn ${orbState}`}
          onClick={onToggle}
        >
          {isIdle ? (
            <>
              <span className="btn-icon">🎙️</span> Start Conversation
            </>
          ) : (
            <>
              <span className="btn-icon">⏹️</span> Stop Conversation
            </>
          )}
        </button>
      </div>
    </section>
  );
}

export default VoiceOrb;
