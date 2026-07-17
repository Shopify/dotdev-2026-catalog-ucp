import { Link } from 'react-router-dom';

// Shared app logo — identical mark + wordmark on every screen, links home to all boards.
// Mountain-peak path from the mockups: M3 18l6-12 5 8 3-5 4 9z
export function Brand() {
  return (
    <Link className="brand" to="/">
      <svg viewBox="0 0 25 22" aria-hidden="true">
        <path d="M3 18l6-12 5 8 3-5 4 9z" />
      </svg>
      <b>Trailboards</b>
    </Link>
  );
}
