import React from 'react';
const tones = {
  neutral:{bg:'var(--surface-tertiary)', color:'var(--text-secondary)'},
  brand:{bg:'var(--surface-selected)', color:'var(--text-brand)'},
  success:{bg:'#E6F5E7', color:'var(--text-success)'},
  danger:{bg:'#FBE8E4', color:'var(--text-danger)'},
  info:{bg:'#E6EBFA', color:'var(--text-info)'}
};
export function Badge({children, tone='neutral'}) {
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:'var(--radius-full)',
      fontFamily:'var(--font-sans)', fontSize:12, fontWeight:600, background:t.bg, color:t.color
    }}>{children}</span>
  );
}
