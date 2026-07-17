// Account profile — travelers (people + their sizes) and account-wide shopping defaults. Edit
// happens in place: Edit swaps a card's values for controls, Save commits to localStorage and, for
// the defaults, re-derives the profileFilters every catalog search folds in. No drawer, no route.
import { useState } from 'react';
import { Brand } from '../components/Brand';
import { UserMenu } from '../components/UserMenu';
import { ContourBackground } from '../components/ContourBackground';
import { Select } from '../components/Select';
import { useProfile } from '../store/useProfile';
import { OPTS, initials } from '../lib/profile';
import { newId } from '../lib/id';
import type { PersonSizes, Profile, ProfilePerson, ShoppingDefaults } from '../types';
import '../styles/chrome.css';
import '../styles/profile.css';
import '../styles/select.css';

const SIZE_ROWS: { key: keyof PersonSizes; label: string; opts: readonly string[] }[] = [
  { key: 'apparel', label: 'apparel', opts: OPTS.apparel },
  { key: 'shoe', label: 'shoe', opts: OPTS.shoe },
  { key: 'jacket', label: 'jacket', opts: OPTS.jacket },
  { key: 'fit', label: 'fit', opts: OPTS.fit },
];

function EdSelect({ value, opts, onChange }: { value: string; opts: readonly string[]; onChange: (v: string) => void }) {
  return (
    <Select
      value={value}
      options={opts.map((o) => ({ value: o, label: o }))}
      onChange={onChange}
      triggerClassName="ed-input"
    />
  );
}

// One traveler. Owner shows email + a locked 'owner' role; companions show a note + editable role.
function PersonCard({
  person,
  onSave,
  onRemove,
}: {
  person: ProfilePerson;
  onSave: (next: ProfilePerson) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfilePerson>(person);

  const start = () => {
    setDraft(person);
    setEditing(true);
  };
  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  const setSize = (k: keyof PersonSizes, v: string) => setDraft((d) => ({ ...d, sizes: { ...d.sizes, [k]: v } }));

  const shown = editing ? draft : person;
  return (
    <div className={`person${person.you ? ' you' : ''}${editing ? ' editing' : ''}`}>
      <div className={`pfp${person.you ? '' : ' alt'}`}>{initials(shown.name)}</div>
      <div className="pinfo">
        <div className="prow">
          {editing ? (
            <input
              className="ed-input"
              aria-label="Name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          ) : (
            <span className="pname">{person.name || 'Unnamed'}</span>
          )}
          {editing && !person.you ? (
            <input
              className="ed-input role"
              aria-label="Role"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            />
          ) : (
            <span className="prole">{person.role}</span>
          )}
        </div>
        <div className="pmeta">
          {editing ? (
            <input
              className="ed-input"
              aria-label={person.you ? 'Email' : 'Note'}
              placeholder={person.you ? 'email' : 'e.g. travels on most trips'}
              value={(person.you ? draft.email : draft.note) ?? ''}
              onChange={(e) =>
                setDraft((d) => (person.you ? { ...d, email: e.target.value } : { ...d, note: e.target.value }))
              }
            />
          ) : (
            (person.you ? person.email : person.note) || (person.you ? 'add your email' : 'add a note')
          )}
        </div>
        <div className="sizes">
          {SIZE_ROWS.map((row) => (
            <span className="size" key={row.key}>
              <b>{row.label}</b>{' '}
              {editing ? (
                <EdSelect value={draft.sizes[row.key]} opts={row.opts} onChange={(v) => setSize(row.key, v)} />
              ) : (
                <span>{person.sizes[row.key]}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      {editing ? (
        <span className="editbar">
          {onRemove && (
            <button type="button" className="pedit ghost danger" onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="pedit ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="button" className="pedit save" onClick={save}>
            Save
          </button>
        </span>
      ) : (
        <button type="button" className="pedit" onClick={start}>
          Edit
        </button>
      )}
    </div>
  );
}

// Account-wide shopping defaults → the profileFilters banner explains where each one lands.
function DefaultsCard({ defaults, onSave }: { defaults: ShoppingDefaults; onSave: (next: ShoppingDefaults) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShoppingDefaults>(defaults);
  const start = () => {
    setDraft(defaults);
    setEditing(true);
  };
  const save = () => {
    onSave(draft);
    setEditing(false);
  };

  const d = editing ? draft : defaults;
  return (
    <>
      <div className="sec-head">
        <div className="sec-label">
          Shopping defaults<span className="scope-tag">account-wide</span>
        </div>
        {editing ? (
          <span className="editbar">
            <button type="button" className="pedit ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="pedit save" onClick={save}>
              Save
            </button>
          </span>
        ) : (
          <button type="button" className="pedit" onClick={start}>
            Edit
          </button>
        )}
      </div>
      <div className="prefs">
        <div className="pref">
          <span className="pref-k">Currency</span>
          <span className="pref-v">
            {editing ? (
              <EdSelect value={draft.currency} opts={OPTS.currency} onChange={(v) => setDraft((s) => ({ ...s, currency: v }))} />
            ) : (
              d.currency
            )}
          </span>
          <span className="pref-map">→ price display</span>
        </div>
        <div className="pref">
          <span className="pref-k">Ships to</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="Ships to"
                placeholder="e.g. Canada"
                value={draft.shipsTo}
                onChange={(e) => setDraft((s) => ({ ...s, shipsTo: e.target.value }))}
              />
            ) : (
              d.shipsTo || 'anywhere'
            )}
          </span>
          <span className="pref-map">→ filters.ships_to</span>
        </div>
        <div className="pref">
          <span className="pref-k">Address</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="Street address"
                placeholder="e.g. 620 King Street West"
                value={draft.address1}
                onChange={(e) => setDraft((s) => ({ ...s, address1: e.target.value }))}
              />
            ) : (
              d.address1 || 'add a street address'
            )}
          </span>
          <span className="pref-map">→ checkout prefill</span>
        </div>
        <div className="pref">
          <span className="pref-k">City</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="City"
                placeholder="e.g. Toronto"
                value={draft.city}
                onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
              />
            ) : (
              d.city || 'add a city'
            )}
          </span>
          <span className="pref-map">→ checkout prefill</span>
        </div>
        <div className="pref">
          <span className="pref-k">Province / state</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="Province or state"
                placeholder="e.g. ON"
                value={draft.province}
                onChange={(e) => setDraft((s) => ({ ...s, province: e.target.value }))}
              />
            ) : (
              d.province || 'add a province'
            )}
          </span>
          <span className="pref-map">→ checkout prefill + address_region</span>
        </div>
        <div className="pref">
          <span className="pref-k">Postal code</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="Postal code"
                placeholder="e.g. M5V 3M6"
                value={draft.postalCode}
                onChange={(e) => setDraft((s) => ({ ...s, postalCode: e.target.value }))}
              />
            ) : (
              d.postalCode || 'add a postal code'
            )}
          </span>
          <span className="pref-map">→ checkout prefill + postal_code</span>
        </div>
        <div className="pref">
          <span className="pref-k">Phone</span>
          <span className="pref-v">
            {editing ? (
              <input
                className="ed-input"
                aria-label="Phone"
                placeholder="e.g. 437-734-1234"
                value={draft.phone}
                onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
              />
            ) : (
              d.phone || 'add a phone number'
            )}
          </span>
          <span className="pref-map">→ cart buyer</span>
        </div>
        <div className="pref">
          <span className="pref-k">Budget / item</span>
          <span className="pref-v">
            up to $
            {editing ? (
              <input
                className="ed-input num"
                type="number"
                min={0}
                aria-label="Budget per item"
                value={draft.budgetMax}
                onChange={(e) => setDraft((s) => ({ ...s, budgetMax: Number(e.target.value) || 0 }))}
              />
            ) : (
              d.budgetMax
            )}
          </span>
          <span className="pref-map">→ filters.price.max</span>
        </div>
        <div className="pref">
          <span className="pref-k">Units</span>
          <span className="pref-v">
            {editing ? (
              <EdSelect value={draft.units} opts={OPTS.units} onChange={(v) => setDraft((s) => ({ ...s, units: v }))} />
            ) : (
              d.units
            )}
          </span>
          <span className="pref-map">→ app + weather</span>
        </div>
        <div className="pref">
          <span className="pref-k">Condition</span>
          <span className="pref-v">
            {editing ? (
              <EdSelect value={draft.condition} opts={OPTS.condition} onChange={(v) => setDraft((s) => ({ ...s, condition: v }))} />
            ) : (
              d.condition
            )}
          </span>
          <span className="pref-map">→ filters.condition</span>
        </div>
        <div className="pref">
          <span className="pref-k">Min rating</span>
          <span className="pref-v">
            {editing ? (
              <EdSelect value={draft.rating} opts={OPTS.rating} onChange={(v) => setDraft((s) => ({ ...s, rating: v }))} />
            ) : (
              d.rating
            )}
          </span>
          <span className="pref-map">→ filters.rating</span>
        </div>
      </div>
      <div className="applies">
        These are <b>account-wide</b> — applied to every catalog search as <b>profileFilters</b>, before a board even
        exists. Each traveler's <b>sizes &amp; fit</b> add <b>filters.attributes</b> once the agent knows who an item is
        for.
      </div>
    </>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useProfile();
  const [tab, setTab] = useState<'travelers' | 'defaults'>('travelers');

  const you = profile.people.find((p) => p.you);
  const companions = profile.people.filter((p) => !p.you);

  const savePerson = (next: ProfilePerson) =>
    setProfile({ ...profile, people: profile.people.map((p) => (p.id === next.id ? next : p)) });
  const removePerson = (id: string) => setProfile({ ...profile, people: profile.people.filter((p) => p.id !== id) });
  const addCompanion = () => {
    const person: ProfilePerson = {
      id: newId(),
      name: '',
      role: 'companion',
      note: '',
      sizes: { apparel: 'M', shoe: 'EU 42', jacket: 'M', fit: 'regular' },
    };
    setProfile({ ...profile, people: [...profile.people, person] });
  };
  const saveDefaults = (defaults: ShoppingDefaults) => setProfile({ ...profile, defaults } as Profile);

  return (
    <div className="profile-page">
      <ContourBackground className="bg-contours" />
      <header className="top">
        <div className="top-left">
          <Brand />
          <span className="head-div" />
          <h1>Your profile</h1>
        </div>
        <UserMenu />
      </header>

      <main className="profile-main">
        <div className="why">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
          </svg>
          <p>
            Sizes here are how the agent resolves variants without guessing. It's why the cart can ask{' '}
            <b>“who's this for?”</b> and pick the right size the moment you answer — the numbers live in your profile,
            not in the model's head.
          </p>
        </div>

        <nav className="tabs" role="tablist">
          <button
            type="button"
            className={`tab${tab === 'travelers' ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab === 'travelers'}
            onClick={() => setTab('travelers')}
          >
            Travelers
          </button>
          <button
            type="button"
            className={`tab${tab === 'defaults' ? ' is-active' : ''}`}
            role="tab"
            aria-selected={tab === 'defaults'}
            onClick={() => setTab('defaults')}
          >
            Shopping defaults
          </button>
        </nav>

        {tab === 'travelers' ? (
          <section className="tabpane is-active">
            <div className="subhead">You</div>
            {you && <PersonCard person={you} onSave={savePerson} />}

            <div className="subhead">Travel companions</div>
            <div className="members">
              {companions.map((c) => (
                <PersonCard key={c.id} person={c} onSave={savePerson} onRemove={() => removePerson(c.id)} />
              ))}
              <button type="button" className="addmember" onClick={addCompanion}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add companion
              </button>
            </div>
          </section>
        ) : (
          <section className="tabpane is-active">
            <DefaultsCard defaults={profile.defaults} onSave={saveDefaults} />
          </section>
        )}
      </main>
    </div>
  );
}
