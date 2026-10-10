export function parseAgeConfirmedDisplay(value: string): { ok: true; value: string | null } | { ok: false } {
  const input = value.trim();
  if (!input) return { ok: true, value: null };
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (!match) return { ok: false };
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { ok: false };
  return { ok: true, value: `${yearText}-${monthText}-${dayText}` };
}

export function formatAgeConfirmedDisplay(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}
