export function toDateTime(secs: number): Date {
  return new Date(secs * 1000);
}
