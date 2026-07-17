// A manually-searched product (.ci--rec, shared with recommendations). No dismiss button and no
// Provenance — "won't suggest again" and board-factor reasons don't apply to something the shopper
// searched for themselves.
import type { Product } from '../types';
import { priceLabel } from '../lib/price';

export function SearchResultCard({
  product,
  onChoose,
}: {
  product: Product;
  onChoose: (product: Product) => void;
}) {
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
            {product.seller && <div className="ci-seller">{product.seller.name}</div>}
          </div>
        </div>
        <div className="ci-price">{priceLabel(product)}</div>
        <button type="button" className="ci-choose" onClick={() => onChoose(product)}>
          Choose options
          <svg className="chev" viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
