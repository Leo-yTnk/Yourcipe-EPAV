import React from 'react';
export function Tabs({tabs=[], active, onChange}) {
  return (
    <div style={{display:'flex', gap:24, borderBottom:'1px solid var(--border-subtle)', fontFamily:'var(--font-sans)'}}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          background:'none', border:'none', cursor:'pointer', padding:'10px 2px', fontSize:15,
          fontWeight: t === active ? 600 : 500, color: t === active ? 'var(--text-primary)' : 'var(--text-secondary)',
          borderBottom: t === active ? '2px solid var(--brand-700)' : '2px solid transparent', marginBottom:-1
        }}>{t}</button>
      ))}
    </div>
  );
}
