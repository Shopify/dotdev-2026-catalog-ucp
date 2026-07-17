// Themed replacement for native <select> — a closed-list button+listbox modeled on
// DestinationSearch's combobox (role/aria wiring, active-index keyboard nav, click-outside-close)
// but simplified: no text input, no async search. Options carry both a value and a label since
// some callers (traveler picker) need a label that differs from the underlying value.
import { useEffect, useId, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  triggerClassName,
  disabled,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = `${useId()}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Click outside closes the menu (same idiom as DestinationSearch's geo-menu).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function openMenu() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function pick(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Closes on Tab-away even though focus never left via a mousedown — DestinationSearch doesn't
  // handle this case, so it's added here rather than reproduced.
  function onBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0) pick(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key.length === 1) {
      const letter = e.key.toLowerCase();
      const from = options.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(letter));
      const idx = from >= 0 ? from : options.findIndex((o) => o.label.toLowerCase().startsWith(letter));
      if (idx >= 0) setActive(idx);
    }
  }

  const triggerClass = ['tbselect-trigger', triggerClassName, !selected ? 'is-placeholder' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="tbselect" ref={boxRef} onBlur={onBlur}>
      <button
        type="button"
        ref={triggerRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        className={triggerClass}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="tbselect-label">{selected ? selected.label : placeholder ?? ''}</span>
        <svg className="tbselect-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="tbselect-menu" id={menuId} role="listbox">
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              className={i === active ? 'tbselect-option on' : 'tbselect-option'}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
