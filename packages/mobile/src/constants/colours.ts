export const colours = {
  // Primary brand colours
  orange:    '#FF6B35',  // Avail Orange — Free status, primary CTA
  coral:     '#FF9A6C',  // Soft Coral — secondary
  yellow:    '#FFD166',  // Sun Yellow — Maybe status, CTA confirm button

  // Backgrounds
  plum:      '#1C1A2E',  // Deep Plum — dark bg, status picker bg
  warmWhite: '#F9F7F4',  // Warm White — app background
  stone:     '#C4C1BE',  // Warm Stone — ghost/muted, Busy status

  // Text
  darkText:  '#1C1A2E',
  maybeText: '#8B6200',  // Darkened yellow for readable text on white

  // Utility
  white:     '#FFFFFF',
  divider:   'rgba(0,0,0,0.08)',
  cardBg:    '#FFFFFF',
} as const;

export type ColourKey = keyof typeof colours;

// Status-specific colour helpers
export const statusColour = (availability: string | null): string => {
  switch (availability) {
    case 'free':  return colours.orange;
    case 'maybe': return colours.maybeText;
    case 'busy':  return colours.stone;
    default:      return colours.stone;
  }
};

export const dotColour = (availability: string | null): string => {
  switch (availability) {
    case 'free':  return colours.orange;
    case 'maybe': return colours.yellow;
    case 'busy':  return colours.stone;
    default:      return 'rgba(196,193,190,0.4)';
  }
};
