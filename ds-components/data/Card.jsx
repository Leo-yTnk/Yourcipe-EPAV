import React from 'react';
export function Card({imageSrc, imageAlt='', title, subtitle, meta, children, onClick, style}) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background:'var(--surface-primary)', borderRadius:'var(--radius-lg)', border: hover ? '1px solid var(--border-default)' : '1px solid var(--border-subtle)',
        overflow:'hidden', boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)', transition:'box-shadow 0.15s ease, transform 0.15s ease',
        transform: hover && onClick ? 'translateY(-2px)' : 'none', cursor: onClick ? 'pointer' : 'default', fontFamily:'var(--font-sans)', ...style
      }}>
      {imageSrc && <img src={imageSrc} alt={imageAlt} style={{width:'100%', height:160, objectFit:'cover', display:'block'}} />}
      <div style={{padding:16, display:'flex', flexDirection:'column', gap:4}}>
        {title && <div style={{fontSize:18, fontWeight:700, color:'var(--text-primary)'}}>{title}</div>}
        {subtitle && <div style={{fontSize:14, color:'var(--text-secondary)'}}>{subtitle}</div>}
        {meta && <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:4}}>{meta}</div>}
        {children}
      </div>
    </div>
  );
}
