import * as Localization from 'expo-localization';

const DIAL_CODES: Record<string, string> = {
  GB: '+44', IE: '+353', US: '+1',  CA: '+1',  AU: '+61',
  NZ: '+64', ZA: '+27', IN: '+91', SG: '+65', HK: '+852',
  FR: '+33', DE: '+49', ES: '+34', IT: '+39', NL: '+31',
  BE: '+32', SE: '+46', NO: '+47', DK: '+45', FI: '+358',
  PT: '+351', CH: '+41', AT: '+43', PL: '+48', CZ: '+420',
  JP: '+81', KR: '+82', CN: '+86', BR: '+55', MX: '+52',
  AE: '+971', SA: '+966', NG: '+234', KE: '+254', GH: '+233',
};

export function getDeviceDialCode(): string {
  const region = Localization.getLocales()[0]?.regionCode ?? '';
  return DIAL_CODES[region] ?? '+1';
}

export function normalizePhone(input: string, dialCode: string): string {
  const trimmed = input.trim();

  // User typed their own country code — clean formatting and return as-is
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/[^\d+]/g, '');
  }

  // Strip everything except digits, then strip leading zero
  const digits = trimmed.replace(/\D/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;

  return `${dialCode}${local}`;
}
