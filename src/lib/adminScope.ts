// Per-admin data ownership. Each admin's dashboard shows only the records
// assigned to them (customers, trainers, societies, marketing). The Super
// Admin, while impersonating, uses the viewed admin's id — so they see exactly
// that admin's book. A brand-new admin owns nothing until records are assigned.
//
// Graceful degradation: if the `assigned_admin_id` column hasn't been added to
// a table yet (migration not run), none of the fetched rows will carry the
// property, so we skip filtering and fall back to the legacy global view rather
// than showing an empty page.
export function scopeByAdmin<T extends { assigned_admin_id?: string | null }>(
  rows: T[],
  adminId: string | null,
): T[] {
  if (!adminId) return rows;
  const columnPresent = rows.some((r) => r.assigned_admin_id !== undefined);
  if (!columnPresent) return rows;
  return rows.filter((r) => r.assigned_admin_id === adminId);
}
