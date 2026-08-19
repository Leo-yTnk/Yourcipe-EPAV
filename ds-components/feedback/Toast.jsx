import React from 'react';
const tones = { success:{bg:'var(--green-600)', border:'var(--green-600)'}, danger:{bg:'var(--red-600)', border:'var(--red-600)'}, info:{bg:'var(--blue-600)', border:'var(--blue-600)'}, neutral:{bg:'var(--neutral-900)', border:'var(--neutral-900)'} };
export function Toast({message, tone='neutral', onClose}) {
  const t = tones[tone] || tones.neutral;
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:'var(--radius-md)',
      background: t.bg, color:'var(--neutral-0)', fontFamily:'var(--font-sans)', fontSize:14,
      boxShadow:'var(--shadow-lg)', border:`1px solid ${t.border}`
    }}>
      <span>{message}</span>
      {onClose && <span onClick={onClose} style={{cursor:'pointer', opacity:0.8}}>✕</span>}
    </div>
  );
}
