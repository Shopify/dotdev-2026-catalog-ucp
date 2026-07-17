// Minimal JSON syntax highlighter for the trace drawer's <pre> panels. Pretty-prints a value then
// wraps keys / strings / numbers / literals in the .k/.s/.n/.c spans board.css already styles.
// Not a parser — a tokenizing pass over the stringified output, which is enough for display.
import type { ReactNode } from 'react';

const TOKEN =
  /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)/g;

export function highlightJson(value: unknown): ReactNode {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }

  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<span key={key++} className="k">{m[1]}</span>);
    else if (m[2]) parts.push(<span key={key++} className="s">{m[2]}</span>);
    else if (m[3]) parts.push(<span key={key++} className="n">{m[3]}</span>);
    else parts.push(<span key={key++} className="c">{m[4]}</span>);
    last = TOKEN.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
