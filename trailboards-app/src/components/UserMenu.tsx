import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeName } from '../types';

// Swatch previews show each theme's own palette (paper · structure · agent) as literal
// hex, so they read correctly no matter which theme is active.
const SWATCHES: Record<ThemeName, { label: string; colors: [string, string, string] }> = {
  field: { label: 'Field', colors: ['#EFEDE4', '#3E5C3A', '#B5327A'] },
  night: { label: 'Night', colors: ['#12181C', '#7FA06B', '#E85A9B'] },
  blueprint: { label: 'Blueprint', colors: ['#EAF0F5', '#2E6F8E', '#C43A86'] },
};

// Avatar → theme picker. Native <details> gives keyboard + click-away for free; the
// shared chrome CSS targets details.usermenu[open] .umenu.
export function UserMenu() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <details className="usermenu">
      <summary title="Preferences" aria-label="Preferences">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      </summary>
      <div className="umenu">
        <Link className="umenu-link" to="/profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          Profile &amp; companions
        </Link>
        <div className="cap">Theme</div>
        <div className="themes">
          {themes.map((t) => (
            <button
              key={t}
              type="button"
              data-set-theme={t}
              aria-pressed={t === theme}
              onClick={() => setTheme(t)}
            >
              <span className="sw">
                {SWATCHES[t].colors.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              {SWATCHES[t].label}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
