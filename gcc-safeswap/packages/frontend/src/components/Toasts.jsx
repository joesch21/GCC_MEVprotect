import React from "react";
export default function Toasts({ items }) {
  return (
    <div className="toasts">
      {items.map((t,i)=>(<div key={i} className={`toast ${t.type||""}`}>{t.msg}</div>))}
    </div>
  );
}
