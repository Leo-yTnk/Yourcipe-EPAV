import React from 'react';
export function Select({label, options=[], value, onChange, disabled=false}) {
  return (
    <label style={{display:'flex', flexDirection:'column', gap:6, fontFamily:'var(--font-sans)', width:'100%'}}>
      {label && <span style={{fontSize:14, fontWeight:600, color:'var(--text-primary)'}}>{label}</span>}
      <div style={{position:'relative'}}>
        <select value={value} onChange={onChange} disabled={disabled}
          style={{
            width:'100%', appearance:'none', fontFamily:'var(--font-sans)', fontSize:16, padding:'10px 36px 10px 14px',
            borderRadius:'var(--radius-md)', border:'1.5px solid var(--border-default)',
            background: disabled ? 'var(--surface-disabled)' : 'var(--surface-primary)', color:'var(--text-primary)', outline:'none'
          }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--text-tertiary)'}}>⌄</span>
      </div>
    </label>
  );
}
