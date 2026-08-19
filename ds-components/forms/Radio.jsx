import React from 'react';
export function Radio({label, checked=false, onChange, disabled=false, name}) {
  return (
    <label style={{display:'inline-flex', alignItems:'center', gap:10, fontFamily:'var(--font-sans)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1}}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} style={{display:'none'}} />
      <span style={{
        width:20, height:20, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
        border: `1.5px solid ${checked ? 'var(--brand-700)' : 'var(--border-default)'}`, background:'var(--surface-primary)'
      }}>{checked && <span style={{width:10, height:10, borderRadius:'50%', background:'var(--brand-700)'}} />}</span>
      {label && <span style={{fontSize:15, color:'var(--text-primary)'}}>{label}</span>}
    </label>
  );
}
