// A confident recommendation (.ci--rec). Lightened per the mockup: price + "Choose options" opens the
// PDP overlay where a variant is picked before Add — the card never pins a variant or shows a qty.
// The magenta needs-input variant is agent-driven and lands in P7. Dismiss = "won't suggest again".
import type { Recommendation, Product } from '../types';
import { priceLabel } from '../lib/price';
import { Provenance } from './Provenance';

export function RecommendationCard({
  rec,
  onChoose,
  onDismiss,
}: {
  rec: Recommendation;
  onChoose: (product: Product) => void;
  onDismiss: (productId: string) => void;
}) {
  const { product, reasons } = rec;
  return (
    <div className="ci ci--rec">
      <div className="thumb">
        {product.image ? (
          <img src={product.image} alt="" loading="lazy" />
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M9 2h6v3l1 2v13H8V7l1-2z" />
            <path d="M8 11h8" />
          </svg>
        )}
      </div>
      <div className="ci-main">
        <div className="ci-top">
          <div>
            <div className="ci-name">{product.title}</div>
            {product.seller && (
              <div className="ci-seller">{product.seller.name}</div>
            )}
          </div>
          <button
            type="button"
            className="rm"
            title="dismiss — won't suggest again"
            aria-label={`Dismiss ${product.title}`}
            onClick={() => onDismiss(product.id)}
          >
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="ci-price">{priceLabel(product)}</div>
        <button type="button" className="ci-choose" onClick={() => onChoose(product)}>
          Choose options
          <svg className="chev" viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <Provenance reasons={reasons} />
      </div>
    </div>
  );
}
