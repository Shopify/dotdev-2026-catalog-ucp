import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { UserMenu } from '../components/UserMenu';
import { ContourBackground } from '../components/ContourBackground';
import { BoardPreview } from '../components/BoardPreview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { listBoards, putBoard, removeBoard } from '../api/boards';
import type { BoardMeta } from '../types';
import { dayCount, formatDateRange, relativeTime } from '../lib/format';
import { buildDemoSeedBoard, buildRandomDemoBoard } from '../lib/demoBoard';
import { useTheme } from '../theme/ThemeProvider';
import '../styles/chrome.css';
import '../styles/landing.css';
import '../styles/confirm.css';

export function BoardsLanding() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(() => {
    listBoards()
      .then(setBoards)
      .catch(() => setBoards([]));
  }, []);
  useEffect(load, [load]);

  // Mint a demo board and open it. On an empty boards list the click always yields the stable
  // Vancouver Island demo board; once any board exists, each click is a random itinerary.
  const createDemo = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    const board = (boards?.length ?? 0) === 0 ? buildDemoSeedBoard(theme) : buildRandomDemoBoard(theme);
    try {
      await putBoard(board);
      nav(`/b/${board.id}`);
    } catch {
      setCreating(false);
    }
  }, [creating, theme, nav, boards]);

  const askDelete = useCallback((id: string) => {
    setMenuFor(null);
    setPendingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    await removeBoard(id).catch(() => {});
    setBoards((prev) => prev?.filter((b) => b.id !== id) ?? null);
  }, [pendingDeleteId]);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((cur) => !cur);
    setSelectedIds(new Set());
    setMenuFor(null);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    setPendingBulkDelete(false);
    setBulkDeleting(true);
    const ids = [...selectedIds];
    await Promise.allSettled(ids.map((id) => removeBoard(id)));
    setBoards((prev) => prev?.filter((b) => !selectedIds.has(b.id)) ?? null);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkDeleting(false);
  }, [selectedIds]);

  return (
    <div className="landing wrap">
      <ContourBackground className="bg-contours" />
      <header className="top">
        <Brand />
        <div className="top-actions">
          <button className="btn" type="button" onClick={() => nav('/new')}>
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Trailboard
          </button>
          <UserMenu />
        </div>
      </header>

      <main>
        <div className="section-head">
          <div className="titles">
            <h2>Your boards</h2>
            <span className="count">
              {selectMode
                ? `${selectedIds.size} selected`
                : boards === null
                  ? ''
                  : `${boards.length} saved`}
            </span>
          </div>
          {boards !== null && boards.length > 0 && (
            <div className="select-actions">
              {selectMode ? (
                <>
                  <button className="btn ghost" type="button" onClick={toggleSelectMode}>
                    Cancel
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    disabled={selectedIds.size === 0 || bulkDeleting}
                    onClick={() => setPendingBulkDelete(true)}
                  >
                    {bulkDeleting ? 'Deleting…' : `Delete selected (${selectedIds.size})`}
                  </button>
                </>
              ) : (
                <button className="btn ghost" type="button" onClick={toggleSelectMode}>
                  Select
                </button>
              )}
            </div>
          )}
        </div>

        {boards === null ? (
          <p className="loading">Loading boards…</p>
        ) : (
          <div className="grid">
            <button className="newtile" type="button" onClick={() => nav('/new')}>
              <span className="plus">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="lbl">New Trailboard</span>
              <span className="sub">blank canvas · pick a place</span>
            </button>

            <button className="newtile demo" type="button" onClick={createDemo} disabled={creating}>
              <span className="plus">
                <svg viewBox="0 0 24 24">
                  <path d="M3 18l6-12 5 8 3-5 4 9z" />
                </svg>
              </span>
              <span className="lbl">{creating ? 'Building…' : "I'm Feeling Lucky"}</span>
              <span className="sub">random itinerary · trek, holiday or safari</span>
            </button>

            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                menuOpen={menuFor === b.id}
                selectMode={selectMode}
                selected={selectedIds.has(b.id)}
                onOpen={() => nav(`/b/${b.id}`)}
                onToggleMenu={() => setMenuFor((cur) => (cur === b.id ? null : b.id))}
                onDelete={() => askDelete(b.id)}
                onToggleSelect={() => toggleSelected(b.id)}
              />
            ))}
          </div>
        )}
      </main>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this board?"
          message="This removes its elements, recommendations and cart."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {pendingBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} board${selectedIds.size === 1 ? '' : 's'}?`}
          message="This removes their elements, recommendations and carts."
          confirmLabel="Delete"
          danger
          onConfirm={confirmBulkDelete}
          onCancel={() => setPendingBulkDelete(false)}
        />
      )}
    </div>
  );
}

function BoardCard({
  board,
  menuOpen,
  selectMode,
  selected,
  onOpen,
  onToggleMenu,
  onDelete,
  onToggleSelect,
}: {
  board: BoardMeta;
  menuOpen: boolean;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}) {
  const dates = formatDateRange(board.trip.dateRange);
  const days = dayCount(board.trip.dateRange);
  const place = board.trip.destination?.country ?? board.trip.destination?.name;
  const meta = [dates, days ? `${days} DAYS` : null, place].filter(Boolean) as string[];

  return (
    <article
      className={selected ? 'board selected' : 'board'}
      onClick={selectMode ? onToggleSelect : onOpen}
    >
      <div className="preview">
        {selectMode ? (
          <span className="select-check" aria-hidden="true">
            {selected && (
              <svg viewBox="0 0 24 24">
                <path d="M5 12l5 5 9-11" />
              </svg>
            )}
          </span>
        ) : (
          <>
            <button
              className="kebab"
              type="button"
              aria-label="Board actions"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.4" />
                <circle cx="12" cy="12" r="1.4" />
                <circle cx="12" cy="19" r="1.4" />
              </svg>
            </button>
            {menuOpen && (
              <div className="kebab-menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={onOpen}>
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                  Open
                </button>
                <button type="button" className="danger" onClick={onDelete}>
                  <svg viewBox="0 0 24 24">
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </>
        )}
        <BoardPreview seed={board.id} />
      </div>
      <div className="body">
        <h3>{board.title || 'Untitled trip'}</h3>
        <div className="meta">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden="true">· </span>}
              {m}
            </span>
          ))}
        </div>
        <div className="foot">
          <span className="edited">{relativeTime(board.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}
