// Live destination autocomplete over Open-Meteo geocoding (keyless). Debounces the query,
// shows up to 5 matches in a dropdown, and is keyboard-navigable (↑/↓/Enter/Esc). Picking a
// row hands back a Destination with real lat/lng/country; free typing clears any prior pick so
// the caller re-geocodes on save. Shared by the new-board setup and the trip editor.
import { useEffect, useRef, useState } from 'react';
import { geocodeSuggest, type GeoSuggestion } from '../services/geocode';
import type { TripMeta } from '../types';

type Destination = NonNullable<TripMeta['destination']>;

const DEBOUNCE_MS = 250;

export function DestinationSearch({
  value,
  onChange,
  onPick,
  placeholder = 'Search a place…',
  inputClassName,
  fieldClassName,
  autoFocus,
  onBlur,
}: {
  value: string;
  onChange: (name: string) => void;
  onPick: (dest: Destination) => void;
  placeholder?: string;
  inputClassName?: string;
  fieldClassName?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const [items, setItems] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced live search; a picked value (matches a suggestion name exactly) doesn't re-query.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      geocodeSuggest(q).then((next) => {
        if (!live) return;
        setItems(next);
        setActive(-1);
      });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value]);

  // Click outside closes the dropdown.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(s: GeoSuggestion) {
    onPick(s.destination);
    onChange(s.destination.name);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showMenu = open && items.length > 0;

  return (
    <div className={fieldClassName ? `dfield ${fieldClassName}` : 'dfield'} ref={boxRef}>
      <div className="dsearch">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          className={inputClassName}
          value={value}
          aria-label="Destination"
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls="geo-menu"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => onBlur?.()}
          onKeyDown={onKeyDown}
        />
      </div>
      {showMenu && (
        <ul className="geo-menu" id="geo-menu" role="listbox">
          {items.map((s, i) => (
            <li
              key={`${s.destination.name}-${s.destination.lat}-${s.destination.lng}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'geo-row on' : 'geo-row'}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="geo-name">{s.destination.name}</span>
              {s.detail && <span className="geo-detail">{s.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
