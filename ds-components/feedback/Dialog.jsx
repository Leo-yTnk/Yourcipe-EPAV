import React from 'react';
export function Dialog({open, title, children, onClose, actions}) {
  if (!open) return null;
  return (
    <div style={{position:'absolute', inset:0, background:'rgba(28,24,23,0.45)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-sans)'}} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background:'var(--surface-primary)', borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-lg)', border:'1px solid var(--border-subtle)',
        width:360, padding:24, display:'flex', flexDirection:'column', gap:12
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0, fontSize:20, fontWeight:700, color:'var(--text-primary)'}}>{title}</h3>
          <span onClick={onClose} style={{cursor:'pointer', color:'var(--text-tertiary)', fontSize:16}}>✕</span>
        </div>
        <div style={{fontSize:15, color:'var(--text-secondary)'}}>{children}</div>
        {actions && <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>{actions}</div>}
      </div>
    </div>
  );
}
