import React from "react";
export default function ImpactWarning({ show, note }) {
  if (!show) return null;
  return <div className="error">High price impact — {note || "thin liquidity detected"}</div>;
}
