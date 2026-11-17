export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => {
      const visible = word.length <= 2 ? 1 : 2;
      return word.slice(0, visible) + '*'.repeat(word.length - visible);
    })
    .join(' ');
}

export function maskOrderNumber(orderNumber: string): string {
  const visibleTail = 2;
  const lastDash = orderNumber.lastIndexOf('-');
  const head = orderNumber.slice(0, lastDash + 1);
  const tail = orderNumber.slice(lastDash + 1);
  if (tail.length <= visibleTail) return orderNumber;
  return head + '*'.repeat(tail.length - visibleTail) + tail.slice(-visibleTail);
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
