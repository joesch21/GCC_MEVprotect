import React, { useEffect, useState } from "react";
import { getLogs, clearLogs } from "../lib/logger.js";

export default function LogTail(){
  const [lines, setLines] = useState(getLogs());
  const [show, setShow] = useState(false);
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 480);
  useEffect(() => {
    const id = setInterval(() => setLines(getLogs()), 800);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 480);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <>
      {mobile && <button className="debug-toggle" onClick={()=>setShow(s=>!s)}>Logs</button>}
      <div className="debug-log toasts" style={{right:12, bottom:12, maxWidth:520, display: mobile && !show ? 'none' : undefined}}>
        <div className="toast">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8}}>
            <strong>Debug Log</strong>
            <div>
            <button onClick={()=>{
              const text = lines.map(l=>new Date(l.ts).toISOString()+" "+l.text).join("\n");
              navigator.clipboard?.writeText(text);
            }}>Copy</button>
            <button onClick={()=>{ clearLogs(); setLines([]); }}>Clear</button>
          </div>
        </div>
        <div style={{maxHeight:180, overflow:"auto", fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize:12, marginTop:8}}>
          {lines.length === 0 ? <div style={{opacity:.7}}>No logs yet</div> :
            lines.slice(-40).map((l,i)=> <div key={i}><span style={{opacity:.6}}>{new Date(l.ts).toLocaleTimeString()} </span>{l.text}</div>)
          }
        </div>
      </div>
    </>
  );
}

