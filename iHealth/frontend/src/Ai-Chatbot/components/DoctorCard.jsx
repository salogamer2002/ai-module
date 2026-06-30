/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Doctor result card component for the Ai-Chatbot module.
 */
import React from "react";

function DoctorCard({ doctor }) {
  // Defensive: guard against missing/null doctor data from backend
  if (!doctor) return null;

  const name = doctor.Name || "Unknown Doctor";
  const specialty = doctor.Specialty || "General";
  const degree = doctor.Degree || "N/A";
  const experience = doctor["Experience (Years)"] ?? "N/A";
  const hospital = doctor.Hospital || "Not specified";

  return (
    <div className="doctor-card">
      <div className="doctor-card-header">
        <div className="doctor-name-specialty">
          <h3 className="doctor-name">
            {name.startsWith("Dr.") ? name : `Dr. ${name}`}
          </h3>
          <span className="doctor-specialty-badge">
            {specialty.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="doctor-details-grid">
        <div className="doctor-detail-item">
          <span className="detail-label">Degree:</span>
          <span className="detail-value">{degree}</span>
        </div>
        <div className="doctor-detail-item">
          <span className="detail-label">Experience:</span>
          <span className="detail-value">{experience} Years</span>
        </div>
        <div className="doctor-detail-item">
          <span className="detail-label">Hospital:</span>
          <span className="detail-value">{hospital}</span>
        </div>
        {doctor.Phone && (
          <div className="doctor-detail-item">
            <span className="detail-label">Contact:</span>
            <span className="detail-value">{doctor.Phone}</span>
          </div>
        )}
      </div>
      {doctor.Reasoning && (
        <div className="doctor-reasoning">
          <div className="reasoning-title">AI MATCH REASONING</div>
          <p className="reasoning-text">{doctor.Reasoning}</p>
        </div>
      )}
    </div>
  );
}

export default DoctorCard;
