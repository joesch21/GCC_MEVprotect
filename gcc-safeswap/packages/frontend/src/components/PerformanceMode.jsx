import React from "react";

export default function PerformanceMode({ perfMode, toggle }) {
  return (
    <button className="btn" onClick={toggle} aria-pressed={perfMode}>
      {perfMode ? "Performance Mode: ON" : "Performance Mode: OFF"}
    </button>
  );
}
