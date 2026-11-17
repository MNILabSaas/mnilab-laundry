export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function multiplyMoney(quantity: number, unitPrice: number): number {
  const product = BigInt(toCents(quantity)) * BigInt(toCents(unitPrice));
  return fromCents(Number((product + 50n) / 100n));
}

export function sumMoney(values: Array<number | string>): number {
  return fromCents(values.reduce<number>((acc, v) => acc + toCents(v), 0));
}

export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function compareMoney(a: number, b: number): number {
  return toCents(a) - toCents(b);
}
