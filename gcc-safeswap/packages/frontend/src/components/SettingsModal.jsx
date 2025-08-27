import React from "react";
export default function SettingsModal({ open, onClose, settings, setSettings }) {
  if (!open) return null;
  const s = settings || {};
  return (
    <div className="modal">
      <div className="card">
        <h3>Settings</h3>
        <label>Slippage (bps)
          <input type="number" min="0" max="1000"
            value={s.slippageBps} onChange={e=>setSettings({...s, slippageBps:Number(e.target.value)})}/>
        </label>
        <label>Deadline (minutes)
          <input type="number" min="1" max="60"
            value={s.deadlineMins} onChange={e=>setSettings({...s, deadlineMins:Number(e.target.value)})}/>
        </label>
        <label>
          <input type="checkbox" checked={!!s.approveMax}
            onChange={e=>setSettings({...s, approveMax:e.target.checked})}/>
          Approve Max (Permit-style)
        </label>
        <div className="row" style={{gap:8,marginTop:12}}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
