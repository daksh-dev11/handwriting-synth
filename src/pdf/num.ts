export function fmt(value: number, precision: number): string {
  if (!Number.isFinite(value)) throw new RangeError('NON_FINITE');
  const rounded = Object.is(value, -0) ? 0 : value;
  const fixed = rounded.toFixed(precision);
  const formatted = fixed.replace(/\.?0+$/, '');
  return formatted === '' || formatted === '-0' ? '0' : formatted;
}
