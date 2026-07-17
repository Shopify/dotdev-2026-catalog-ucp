// The agent's two guidance surfaces (LLD §11), both advisory only — the agent never blocks the board
// or asserts price/stock/URL (that's scrubbed server-side). NudgeBanner is a soft, dismissible
// suggestion; NeedsInputCard is a real sizing/styling decision surfaced as the magenta needs-input
// card, answered by editing the board (its canonical input). Both sit atop the Recommendations pane.

export function NudgeBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="nudge">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      </svg>
      <span className="nudge-text">{text}</span>
      <button type="button" className="nudge-x" aria-label="Dismiss suggestion" onClick={onDismiss}>
        <svg viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function NeedsInputCard({ question }: { question: string }) {
  return (
    <div className="ci ci--needs">
      <div className="thumb">
        <svg viewBox="0 0 24 24">
          <path d="M4 16h9l5 3h3v-3l-4-2-2-6H8z" />
          <path d="M4 16v3h6" />
        </svg>
      </div>
      <div className="ci-main">
        <div className="ci-top">
          <div>
            <div className="ci-name">Before I size this</div>
          </div>
          <span className="needtag">needs input</span>
        </div>
        <div className="clarify">
          <div className="q">{question}</div>
          <div className="needhint">Add it on your board and I’ll refine the match.</div>
        </div>
      </div>
    </div>
  );
}
