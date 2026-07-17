// Account profile as React state, mirrored to localStorage on every update. Loaded fresh on mount,
// so navigating back from the profile page picks up saved edits.
import { useCallback, useState } from 'react';
import type { Profile } from '../types';
import { loadProfile, saveProfile } from '../lib/profile';

export function useProfile(): [Profile, (next: Profile) => void] {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const update = useCallback((next: Profile) => {
    setProfile(next);
    saveProfile(next);
  }, []);
  return [profile, update];
}
