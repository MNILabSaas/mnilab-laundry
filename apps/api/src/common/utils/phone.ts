export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.includes('+')) return null;
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  if (!/^\d{9,15}$/.test(digits)) return null;
  return digits;
}

export function normalizeCustomerPhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.includes('+')) return null;

  let localFormat = digits;
  if (digits.startsWith('62')) {
    localFormat = `0${digits.slice(2)}`;
  } else if (digits.startsWith('8')) {
    localFormat = `0${digits}`;
  }

  if (!/^08\d{9,11}$/.test(localFormat)) {
    return null;
  }

  return `62${localFormat.slice(1)}`;
}
