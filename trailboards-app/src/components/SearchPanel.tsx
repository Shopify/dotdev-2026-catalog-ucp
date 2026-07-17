// Free-text catalog search — bypasses resolveIntent/the agent entirely; the shopper finds their own
// products by typing a query, same PDP/add-to-cart flow as Recommendations from there.
import { useState } from 'react';
import type { Product } from '../types';
import { useBoard } from '../store/BoardProvider';
import { useProfile } from '../store/useProfile';
import { deriveProfileFilters } from '../lib/profile';
import { searchProducts } from '../api/commerce';
import { SearchResultCard } from './SearchResultCard';

export function SearchPanel({ onChoose }: { onChoose: (product: Product) => void }) {
  const { state: board } = useBoard();
  const [profile] = useProfile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus('loading');
    try {
      const filters = deriveProfileFilters(profile.defaults);
      const { products } = await searchProducts(q, filters, board.id);
      setResults(products);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      <form className="search-bar" onSubmit={runSearch}>
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search the catalog…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={!query.trim() || status === 'loading'}>
          Search
        </button>
      </form>

      {results === null ? (
        <div className="empty">
          <p>{status === 'loading' ? 'Searching…' : 'Search the live catalog and add anything you like.'}</p>
        </div>
      ) : status === 'error' ? (
        <div className="empty">
          <p>Couldn’t reach the catalog — try again.</p>
        </div>
      ) : status === 'loading' ? (
        <div className="empty">
          <p>Searching…</p>
        </div>
      ) : results.length > 0 ? (
        <div className="items">
          {results.map((product) => (
            <SearchResultCard key={product.id} product={product} onChoose={onChoose} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>No results for “{query}”.</p>
        </div>
      )}
    </>
  );
}
