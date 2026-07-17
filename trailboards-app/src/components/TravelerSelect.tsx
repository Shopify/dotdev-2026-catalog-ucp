// Traveler card control. A traveler must be a real person from the account profile — never free
// text — so the person's saved sizes/fit flow into the recommendation context (buildContext reads
// payload.sizes). Picking a person copies their name + sizes into the element; companions are added
// on the Profile page. A legacy/demo element that carries a name but no matching person shows that
// name as a prompt to re-pick, and its seeded sizes keep working until it is re-selected.
import { useProfile } from '../store/useProfile';
import { Select } from './Select';

export function TravelerSelect({
  personId,
  name,
  onPick,
}: {
  personId?: string;
  name?: string;
  onPick: (patch: Record<string, unknown>) => void;
}) {
  const [profile] = useProfile();
  const people = profile.people;
  const selectedId = personId && people.some((p) => p.id === personId) ? personId : '';
  const options = people.map((p) => ({
    value: p.id,
    label: `${p.name}${p.you ? ' · you' : p.role && p.role !== 'owner' ? ` · ${p.role}` : ''}`,
  }));

  return (
    <div className="tagrow">
      <Select
        value={selectedId}
        options={options}
        ariaLabel="Traveler"
        placeholder={name && !selectedId ? `${name} — pick a traveler` : "Who's coming?"}
        triggerClassName="ptag el-input"
        onChange={(id) => {
          const person = people.find((p) => p.id === id);
          if (!person) return;
          onPick({ personId: person.id, name: person.name, role: person.role, sizes: person.sizes });
        }}
      />
    </div>
  );
}
