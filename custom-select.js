// Reusable pill-style dropdown used throughout the admin forms and profile setup.
// Ported 1:1 from the design's CustomSelect.dc.html component.
import { Component, html } from './vendor/htm-preact-standalone.js?v=20260817-5';

let selectId = 0;

export class CustomSelect extends Component {
  state = { open: false };

  constructor(props) {
    super(props);
    this.menuId = `yc-select-${++selectId}`;
    this.root = null;
  }

  toggle = () => this.setState((s) => ({ open: !s.open }));

  closeOnBlur = (event) => {
    if (this.root && !this.root.contains(event.relatedTarget)) this.setState({ open: false });
  };

  onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.setState({ open: true }, () => {
        const options = this.root && this.root.querySelectorAll('[role="option"]');
        if (options && options.length) options[event.key === 'ArrowUp' ? options.length - 1 : 0].focus();
      });
    }
    if (event.key === 'Escape' && this.state.open) {
      event.preventDefault();
      this.setState({ open: false });
    }
  };

  onOptionKeyDown = (event, value) => {
    const options = Array.from(this.root.querySelectorAll('[role="option"]'));
    const index = options.indexOf(event.currentTarget);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.setState({ open: false }, () => this.root.querySelector('button').focus());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(value);
    }
  };

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
      <div ref=${(el) => { this.root = el; }} onFocusOut=${this.closeOnBlur} style="position:relative;font-family:var(--font-sans,inherit);width:100%">
        <button type="button" aria-label=${this.props.ariaLabel || displayLabel} aria-haspopup="listbox" aria-expanded=${open} aria-controls=${this.menuId} onClick=${this.toggle} onKeyDown=${this.onTriggerKeyDown} style=${`${triggerStyle};width:100%;color:inherit;font:inherit;text-align:left`}>
          <span style=${labelStyle}>${displayLabel}</span>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-600)" stroke-width="2.2" style=${chevronStyle}><path d="M6 9l6 6 6-6"></path></svg>
        </button>
        ${open && html`
          <div id=${this.menuId} role="listbox" aria-label=${this.props.ariaLabel || displayLabel} style=${menuStyle}>
            ${norm.map((o) => html`
              <button
                key=${String(o.value)}
                type="button"
                role="option"
                aria-selected=${o.value === this.props.value}
                onClick=${() => this.select(o.value)}
                onKeyDown=${(event) => this.onOptionKeyDown(event, o.value)}
                style=${`display:block;width:100%;min-height:44px;border:0;text-align:left;padding:12px 14px;font-size:14px;font-weight:600;cursor:pointer;color:${o.value === this.props.value ? 'var(--brand-700)' : 'var(--neutral-900)'};background:${o.value === this.props.value ? 'var(--neutral-50)' : 'transparent'}`}
              >${o.label}</button>
            `)}
          </div>
        `}
      </div>
    `;
  }
}
