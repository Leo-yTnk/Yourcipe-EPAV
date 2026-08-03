// Reusable pill-style dropdown used throughout the admin forms and profile setup.
// Ported 1:1 from the design's CustomSelect.dc.html component.
import { Component, html } from './vendor/htm-preact-standalone.js?v=20260803-1';

export class CustomSelect extends Component {
  state = { open: false };

  toggle = () => this.setState((s) => ({ open: !s.open }));

  select = (value) => {
    this.setState({ open: false });
    if (this.props.onChange) this.props.onChange(value);
  };

  render() {
    const options = this.props.options || [];
    const norm = options.map((o) => (typeof o === 'object' && o !== null) ? o : { value: o, label: String(o) });
    const current = norm.find((o) => o.value === this.props.value);
    const open = this.state.open;
    const displayLabel = current ? current.label : (this.props.placeholder || 'Selecione');
    const triggerStyle = `display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-radius:var(--radius-md);border:1.5px solid ${open ? 'var(--brand-500)' : 'var(--neutral-200)'};background:var(--neutral-0);cursor:pointer;transition:border-color 0.15s ease`;
    const labelStyle = 'font-size:14px;font-weight:600;color:var(--neutral-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const chevronStyle = `flex-shrink:0;transition:transform 0.15s ease;transform:rotate(${open ? '180deg' : '0deg'})`;
    const menuStyle = 'position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--neutral-0);border:1px solid var(--neutral-100);border-radius:var(--radius-md);box-shadow:var(--shadow-md);z-index:30;max-height:240px;overflow-y:auto;animation:ycSelectIn 0.14s cubic-bezier(0.22,0.8,0.24,1)';

    return html`
      <div style="position:relative;font-family:var(--font-sans,inherit);width:100%">
        <div onClick=${this.toggle} style=${triggerStyle}>
          <span style=${labelStyle}>${displayLabel}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-600)" stroke-width="2.2" style=${chevronStyle}><path d="M6 9l6 6 6-6"></path></svg>
        </div>
        ${open && html`
          <div style=${menuStyle}>
            ${norm.map((o) => html`
              <div
                key=${String(o.value)}
                onClick=${() => this.select(o.value)}
                style=${`padding:12px 14px;font-size:14px;font-weight:600;cursor:pointer;color:${o.value === this.props.value ? 'var(--brand-700)' : 'var(--neutral-900)'};background:${o.value === this.props.value ? 'var(--neutral-50)' : 'transparent'}`}
              >${o.label}</div>
            `)}
          </div>
        `}
      </div>
    `;
  }
}
