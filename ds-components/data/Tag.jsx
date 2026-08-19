import React from 'react';
export function Tag({children, onRemove, selected=false, onClick}) {
  return (
    <span onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:'var(--radius-full)',
      fontFamily:'var(--font-sans)', fontSize:14, fontWeight:500, cursor: onClick ? 'pointer' : 'default',
      background: selected ? 'var(--brand-700)' : 'var(--surface-tertiary)', color: selected ? 'var(--neutral-0)' : 'var(--text-primary)',
      border: selected ? '1px solid var(--brand-700)' : '1px solid var(--border-subtle)'
    }}>
      {children}
      {onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{opacity:0.7}}>✕</span>}
    </span>
  );
}
