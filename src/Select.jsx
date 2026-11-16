import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function Select({ id, value, options, onChange, label, disabled = false, required = false, className = '' }) {
  const generated = useId(), triggerId = id || generated, listId = `${generated}-options`;
  const root = useRef(null), trigger = useRef(null), optionRefs = useRef([]), search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const selected = options.find(o => String(o.value) === String(value));
  const enabled = options.map((o, i) => !o.disabled ? i : -1).filter(i => i >= 0);
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function choose(index) { if (options[index] && !options[index].disabled) { onChange(String(options[index].value)); close(); } }
  function show() { setActive(Math.max(0, options.findIndex(o => String(o.value) === String(value)))); setOpen(true); }
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (open) optionRefs.current[active]?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  function keydown(e) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (!open) { show(); return; }
      const current = enabled.indexOf(active);
      setActive(e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled.at(-1) : enabled[(current + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length] ?? 0);
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? choose(active) : show(); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      search.current = { text: (Date.now() - search.current.at < 700 ? search.current.text : '') + e.key.toLowerCase(), at: Date.now() };
      const index = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(search.current.text));
      if (index >= 0) { setActive(index); setOpen(true); }
    }
  }
  return <div className={`custom-select ${className}`} ref={root} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} id={triggerId} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" aria-required={required || undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined} disabled={disabled} className="select-trigger" onClick={() => open ? setOpen(false) : show()} onKeyDown={keydown}><span>{selected?.label || 'Choose an option'}</span><ChevronDown size={17} className={open ? 'turned' : ''}/></button>
    {open && <ul id={listId} role="listbox" aria-label={label} className="select-options">{options.map((o, i) => <li key={o.value} ref={el => optionRefs.current[i] = el} id={`${listId}-${i}`} role="option" aria-selected={String(o.value) === String(value)} aria-disabled={o.disabled || undefined} data-value={o.value} className={active === i ? 'active-option' : ''} onPointerMove={() => !o.disabled && setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(i)}><span>{o.label}{o.description && <small>{o.description}</small>}</span>{String(o.value) === String(value) && <Check size={17}/>}</li>)}</ul>}
  </div>;
}
