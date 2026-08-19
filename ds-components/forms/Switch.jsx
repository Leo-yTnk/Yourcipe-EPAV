import React from 'react';
export function Switch({checked=false, onChange, disabled=false, label}) {
  return (
    <label style={{display:'inline-flex', alignItems:'center', gap:10, fontFamily:'var(--font-sans)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1}}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{display:'none'}} />
      <span style={{
        width:40, height:24, borderRadius:'var(--radius-full)', padding:2, display:'flex', alignItems:'center',
        background: checked ? 'var(--brand-700)' : 'var(--neutral-200)', transition:'background 0.15s ease'
      }}>
        <span style={{width:20, height:20, borderRadius:'50%', background:'var(--neutral-0)', transform: checked ? 'translateX(16px)' : 'translateX(0)', transition:'transform 0.15s ease', boxShadow:'var(--shadow-sm)'}} />
      </span>
      {label && <span style={{fontSize:15, color:'var(--text-primary)'}}>{label}</span>}
    </label>
  );
}
