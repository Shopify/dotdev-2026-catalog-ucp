// PDP quick-view overlay (get_product). Opens from a recommendation's "Choose options": the buyer picks
// a variant here before Add. Option chips carry the catalog's own available/exists flags — a combination
// that exists but is out of stock greys out and can't be chosen (systems own truth, not the agent). Add
// stays disabled until every option is chosen. Re-fetches get_product as the selection narrows so the
// availability of the *other* options reflects what's actually buyable together.
import { useEffect, useRef, useState } from 'react';
import type { Factor, Product, ProductOption, Variant } from '../types';
import { getProductById } from '../api/commerce';
import { defaultSelection, findVariant, isAddable, isComplete, selectionPriceLabel, type Selection } from '../lib/price';
import { useBoard } from '../store/BoardProvider';
import { Provenance } from './Provenance';

function toPairs(sel: Selection): { name: string; label: string }[] {
  return Object.entries(sel).map(([name, label]) => ({ name, label }));
}

// Fold a fresh get_product into what we already show. A selection re-fetch updates each value's
// available/exists flags but must never drop option chips we already know about (that was the
// "options flash then vanish" bug); an empty options list from the fetch is ignored entirely.
function mergeOptions(prev: ProductOption[], next: ProductOption[]): ProductOption[] {
  if (!next.length) return prev;
  if (!prev.length) return next;
  const nextByName = new Map(next.map((o) => [o.name, o]));
  const merged = prev.map((p) => {
    const n = nextByName.get(p.name);
    if (!n) return p;
    const nVals = new Map(n.values.map((v) => [v.label, v]));
    return { name: p.name, values: p.values.map((v) => nVals.get(v.label) ?? v) };
  });
  for (const n of next) if (!prev.some((p) => p.name === n.name)) merged.push(n);
  return merged;
}

export function PdpOverlay({
  product,
  reasons = [],
  owned,
  onClose,
  onAdd,
  onOwn,
}: {
  product: Product;
  reasons?: Factor[];
  owned: boolean;
  onClose: () => void;
  onAdd: (product: Product, variant: Variant) => void;
  onOwn: (variantId: string) => void;
}) {
  const { state: board } = useBoard();
  const boardId = board.id;
  const [full, setFull] = useState<Product>(product);
  const [sel, setSel] = useState<Selection>(() => defaultSelection(product));
  const [note, setNote] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const didInit = useRef(false);

  // First load: pull the complete product (options + per-variant flags) and seed the selection.
  useEffect(() => {
    let live = true;
    getProductById(product.id, undefined, boardId).then((p) => {
      if (!live || !p) return;
      setFull((prev) => ({ ...p, options: mergeOptions(prev.options, p.options) }));
      if (!didInit.current) {
        setSel(defaultSelection(p.options.length ? p : product));
        didInit.current = true;
      }
    });
    return () => {
      live = false;
    };
  }, [product.id, boardId]);

  // Re-evaluate availability of the remaining options each time the selection changes.
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  useEffect(() => {
    if (!didInit.current) return;
    let live = true;
    setCheckingAvailability(true);
    getProductById(product.id, toPairs(sel), boardId).then((p) => {
      if (!live) return;
      if (p) setFull((prev) => ({ ...p, options: mergeOptions(prev.options, p.options) }));
      setCheckingAvailability(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sel)]);

  // Escape closes; focus the dialog on open.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function choose(optName: string, label: string) {
    setNote('');
    setSel((s) => ({ ...s, [optName]: label }));
  }

  const complete = isAddable(full, sel);
  const selComplete = isComplete(full, sel);
  const checking = checkingAvailability && selComplete && !complete;
  const outOfStock = selComplete && !complete && !checking;
  const priceStr = selectionPriceLabel(full, sel);
  const variant = findVariant(full, sel);

  // Carousel over every product frame plus any variant-specific image (toProduct dedupes them
  // into `images`). Selecting a variant that has its own frame jumps the gallery to it.
  const gallery = full.images.length ? full.images : full.image ? [full.image] : [];
  const active = Math.min(imgIdx, Math.max(gallery.length - 1, 0));
  useEffect(() => {
    if (!variant?.image) return;
    const i = gallery.indexOf(variant.image);
    if (i >= 0) setImgIdx(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.image]);
  const stepImg = (d: number) => setImgIdx((i) => (gallery.length ? (i + d + gallery.length) % gallery.length : 0));

  function add() {
    if (!complete || !variant) return;
    onAdd(full, variant);
    setNote('Added to cart');
  }

  function own() {
    onOwn(variant?.id ?? full.variants[0]?.id ?? full.id);
  }

  return (
    <div className="pdp-scrim" onClick={onClose}>
      <div
        className="pdp"
        role="dialog"
        aria-modal="true"
        aria-label={`${full.title} — quick view`}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdp-media">
          {gallery.length ? (
            <img src={gallery[active]} alt="" />
          ) : (
            <svg className="pm-glyph" viewBox="0 0 24 24">
              <path d="M9 2h6v3l1 2v13H8V7l1-2z" />
              <path d="M8 11h8" />
            </svg>
          )}
          {gallery.length > 1 && (
            <>
              <button type="button" className="pm-nav prev" aria-label="Previous image" onClick={() => stepImg(-1)}>
                <svg viewBox="0 0 24 24">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" className="pm-nav next" aria-label="Next image" onClick={() => stepImg(1)}>
                <svg viewBox="0 0 24 24">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <div className="pm-thumbs">
                {gallery.map((src, i) => (
                  <button
                    type="button"
                    key={src}
                    className={i === active ? 'pm-thumb on' : 'pm-thumb'}
                    aria-label={`View image ${i + 1}`}
                    aria-current={i === active}
                    onClick={() => setImgIdx(i)}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            </>
          )}
          <button type="button" className="pdp-close" title="close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="pdp-body">
          {full.seller && <span className="pdp-seller">{full.seller.name}</span>}
          <h2 className="pdp-title">{full.title}</h2>
          {full.rating != null && full.rating.count > 0 && (
            <div className="pdp-rate">
              <span className="stars">★★★★★</span> {full.rating.value.toFixed(1)} ({full.rating.count})
            </div>
          )}
          <div className="pdp-price">{priceStr}</div>

          {full.options.map((opt) => (
            <div className="opt" key={opt.name}>
              <div className="opt-lab">
                {opt.name} <span className="opt-val">{sel[opt.name] ?? '—'}</span>
              </div>
              <div className="chips">
                {opt.values.map((v) => {
                  const oos = v.exists && !v.available;
                  const disabled = oos || !v.exists;
                  const cls = `chip${sel[opt.name] === v.label ? ' on' : ''}${oos ? ' oos' : ''}`;
                  return (
                    <button
                      type="button"
                      key={v.label}
                      className={cls}
                      disabled={disabled}
                      title={oos ? 'out of stock in this combination' : undefined}
                      onClick={() => !disabled && choose(opt.name, v.label)}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {full.highlights.length > 0 && (
            <ul className="pdp-hi">
              {full.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}

          <div className="pdp-actions">
            <button
              type="button"
              className="pdp-add"
              aria-disabled={!complete}
              disabled={!complete}
              onClick={add}
            >
              <svg viewBox="0 0 24 24">
                <path d="M6 6h15l-1.5 9h-12z" />
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M6 6L5 3H2" />
              </svg>
              {complete
                ? `Add to cart · ${priceStr}`
                : checking
                  ? 'Checking availability…'
                  : outOfStock
                    ? 'Out of stock in this combination'
                    : 'Choose every option'}
            </button>
            <div className="pdp-note">{note}</div>
            <button type="button" className="pdp-own" onClick={own} disabled={owned}>
              {owned ? 'Marked as owned' : 'I already own this'}
            </button>
          </div>

          <Provenance reasons={reasons} className="pdp-why" />
        </div>
      </div>
    </div>
  );
}
