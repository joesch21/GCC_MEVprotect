import React from "react";
export default function RouteInspector({ text, lpLabel }) {
  if (!text) return null;
  return <div className="route-chip">Route: {text}{lpLabel ? ` • ${lpLabel}` : ""}</div>;
}
