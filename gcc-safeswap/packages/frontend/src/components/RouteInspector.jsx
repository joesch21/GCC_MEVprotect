import React from "react";
export default function RouteInspector({ text, lpLabel }) {
  if (!text) return null;
  return <div className="stat">Route: {text}{lpLabel ? ` • ${lpLabel}` : ""}</div>;
}
