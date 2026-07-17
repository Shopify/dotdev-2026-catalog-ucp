// A single canvas card. The primary value is edited inline; every keystroke dispatches
// updateElement, which the reducer folds into board state and the scheduler turns into a
// (debounced for notes, immediate otherwise) resolve — the whole trigger loop in one card.
import { useBoard } from '../store/BoardProvider';
import { DestinationSearch } from './DestinationSearch';
import { TravelerSelect } from './TravelerSelect';
import { ImageElement } from './ImageElement';
import { ELEMENT_META, type CardType } from './elementMeta';
import type { BoardElement } from '../types';

export function ElementCard({ element }: { element: BoardElement }) {
  const { dispatch } = useBoard();
  const meta = ELEMENT_META[element.type as CardType];
  if (!meta) return null;

  const raw = element.payload[meta.primaryKey];
  const value = typeof raw === 'string' ? raw : '';

  const patch = (payload: Record<string, unknown>) =>
    dispatch({ type: 'updateElement', id: element.id, patch: { payload } });
  const set = (v: string) => patch({ [meta.primaryKey]: v });
  const remove = () => dispatch({ type: 'removeElement', id: element.id });

  return (
    <div className="el">
      <div className="el-head">
        <svg viewBox="0 0 24 24">{meta.icon}</svg>
        <span className="type-label">{meta.label}</span>
        <button className="el-x" type="button" aria-label={`Remove ${meta.label}`} onClick={remove}>
          ×
        </button>
      </div>

      {element.type === 'image' ? (
        <ImageElement payload={element.payload} description={value} placeholder={meta.placeholder} onPatch={patch} />
      ) : meta.multiline ? (
        <textarea
          className="note-text el-input"
          rows={2}
          value={value}
          placeholder={meta.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      ) : element.type === 'traveler' ? (
        <TravelerSelect
          personId={typeof element.payload.personId === 'string' ? element.payload.personId : undefined}
          name={value}
          onPick={patch}
        />
      ) : element.type === 'pin' ? (
        <DestinationSearch
          value={value}
          inputClassName="el-title el-input"
          fieldClassName="df-flat"
          placeholder={meta.placeholder}
          autoFocus={!value}
          onChange={(name) => patch({ name, lat: undefined, lng: undefined })}
          onPick={(dest) => patch({ name: dest.name, lat: dest.lat, lng: dest.lng, country: dest.country })}
        />
      ) : (
        <input
          className="el-title el-input"
          value={value}
          placeholder={meta.placeholder}
          onChange={(e) => set(e.target.value)}
          autoFocus={!value}
        />
      )}
    </div>
  );
}
