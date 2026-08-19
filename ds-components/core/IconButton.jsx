import React from 'react';
const sizes = {sm:32, md:40, lg:48};
export function IconButton({icon='✓', variant='primary', size='md', disabled=false, onClick, 'aria-label':ariaLabel}) {
  const [hover, setHover] = React.useState(false);
  const dim = sizes[size];
  const bg = variant === 'primary'
    ? (disabled ? 'var(--surface-disabled)' : hover ? 'var(--button-bg-hover)' : 'var(--button-bg-default)')
    : (hover && !disabled ? 'var(--surface-secondary)' : 'transparent');
  const color = variant === 'primary'
    ? (disabled ? 'var(--text-disabled)' : 'var(--neutral-0)')
    : (disabled ? 'var(--text-disabled)' : 'var(--text-primary)');
  return (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{width:dim, height:dim, borderRadius:'var(--radius-full)', border: variant==='secondary' ? '1px solid var(--border-default)' : '1px solid var(--brand-700)',
        background:bg, color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:dim*0.45,
        cursor: disabled ? 'not-allowed':'pointer', transition:'background 0.15s ease'}}>
      {icon}
    </button>
  );
}
