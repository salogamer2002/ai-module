/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Chat message bubble component with doctor cards support.
 */
import React from "react";
import AIAvatar from "./AIAvatar";
import HumanAvatar from "./HumanAvatar";
import DoctorCard from "./DoctorCard";

function ChatMessage({ msg, index }) {
  return (
    <div key={index} className={`message ${msg.role}`}>
      <div className="message-row">
        {msg.role === "user" && <HumanAvatar />}
        {msg.role === "assistant" && <AIAvatar />}
        <div className="message-content">
          <span className="message-label">
            {msg.role === "user" ? (msg.speaker || "You") : "ARIA"}
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
  );
}

export default ChatMessage;
