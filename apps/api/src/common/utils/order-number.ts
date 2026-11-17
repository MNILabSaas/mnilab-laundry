import { randomBytes } from 'node:crypto';

export function generateOrderNumber(branchCode = 'LDR'): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const cleanCode = branchCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'LDR';
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `${cleanCode}-${yy}${mm}${dd}-${rand}`;
}
