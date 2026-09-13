export function normalizeUnitStatus(status?: string | null): string {
  return (status ?? '').toString().trim().toUpperCase() || 'VACANT';
}

export function isVacantUnitStatus(status?: string | null): boolean {
  const normalized = normalizeUnitStatus(status);
  return normalized === 'VACANT';
}
