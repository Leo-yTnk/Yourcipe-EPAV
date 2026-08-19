import React from 'react';
const sizes = {sm:{padding:'8px 14px',fontSize:14},md:{padding:'12px 20px',fontSize:16},lg:{padding:'16px 28px',fontSize:18}};
const variants = {
  primary:{background:'var(--button-bg-default)',color:'var(--button-content-default)',border:'1px solid var(--brand-700)'},
  secondary:{background:'var(--surface-primary)',color:'var(--text-primary)',border:'1px solid var(--border-default)'},
  ghost:{background:'transparent',color:'var(--text-brand)',border:'1px solid transparent'},
  danger:{background:'var(--red-600)',color:'var(--neutral-0)',border:'1px solid var(--red-600)'}
};
export function Button({variant='primary', size='md', disabled=false, children, onClick, style}) {
  const [hover, setHover] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const v = {...variants[variant]};
  if (variant === 'primary') {
    if (disabled) { v.background = 'var(--button-bg-disabled)'; v.color = 'var(--button-content-disabled)'; }
    else if (pressed || hover) v.background = 'var(--button-bg-hover)';
  }
  if (variant === 'secondary' && hover && !disabled) v.background = 'var(--surface-secondary)';
  if (variant === 'ghost' && hover && !disabled) { v.background = 'var(--surface-selected)'; v.border = '1px solid var(--border-subtle)'; }
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        fontFamily:'var(--font-sans)', fontWeight:600, borderRadius:'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer', transition:'background 0.15s ease, transform 0.1s ease',
        transform: pressed && !disabled ? 'scale(0.98)' : 'none',
        display:'inline-flex', alignItems:'center', gap:8, ...sizes[size], ...v, ...style
      }}
    >{children}</button>
  );
}
