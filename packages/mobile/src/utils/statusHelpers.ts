import type { StatusDTO } from '@avail/shared';

// ─── Format status for display in feed ───────────────────────────────────────
export const formatStatus = (status: StatusDTO | null): string => {
  if (!status) return '—';
  switch (status.availability) {
    case 'free':  return 'Free';
    case 'maybe': return 'Maybe';
    case 'busy':  return 'Busy';
    default:      return '—';
  }
};

// ─── Format location for display ─────────────────────────────────────────────
export const formatLocation = (location: string, note?: string | null): string => {
  if (location === 'other') return note || 'Other';
  const map: Record<string, string> = {
    my_place:       'My place',
    pub:            'The pub',
    out:            'Out and about',
    someones_place: "Someone's place",
  };
  return map[location] ?? location;
};

// ─── Format vibe for display ──────────────────────────────────────────────────
export const formatVibe = (vibe: string, note?: string | null): string => {
  if (vibe === 'other') return note || 'Other';
  const map: Record<string, string> = {
    im_paying:  "I'm paying",
    buying_own: 'Buying my own',
    suggest:    'Suggest something',
    free_cheap: 'Going free/cheap',
  };
  return map[vibe] ?? vibe;
};

// ─── Format full status detail line (used under member name) ─────────────────
export const formatStatusDetail = (status: StatusDTO | null): string => {
  if (!status || status.availability === 'busy') return '';

  const parts: string[] = [];
  if (status.location) parts.push(formatLocation(status.location, status.locationNote));
  if (status.vibe)     parts.push(formatVibe(status.vibe, status.vibeNote));
  return parts.join(' · ');
};

// ─── Status expiry helpers ────────────────────────────────────────────────────
export const isStatusExpired = (status: StatusDTO | null): boolean => {
  if (!status) return true;
  return new Date(status.expiresAt) < new Date();
};

export const statusExpiresIn = (status: StatusDTO): string => {
  const diff = new Date(status.expiresAt).getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};
