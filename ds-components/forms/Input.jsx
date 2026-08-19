import React from 'react';
export function Input({label, placeholder, value, onChange, error, helper, disabled=false, type='text'}) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{display:'flex', flexDirection:'column', gap:6, fontFamily:'var(--font-sans)', width:'100%'}}>
      {label && <span style={{fontSize:14, fontWeight:600, color:'var(--text-primary)'}}>{label}</span>}
      <input type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={onChange} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          fontFamily:'var(--font-sans)', fontSize:16, padding:'10px 14px', borderRadius:'var(--radius-md)',
          border: `1.5px solid ${error ? 'var(--border-danger)' : focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
          background: disabled ? 'var(--surface-disabled)' : 'var(--surface-primary)', color:'var(--text-primary)',
          outline:'none', transition:'border-color 0.15s ease'
        }} />
      {(error || helper) && <span style={{fontSize:12, color: error ? 'var(--text-danger)' : 'var(--text-tertiary)'}}>{error || helper}</span>}
    </label>
  );
}
