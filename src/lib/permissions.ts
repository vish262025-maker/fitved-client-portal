// Central catalog of the granular permissions a Super Admin can grant or revoke
// per admin. These gate destructive/sensitive actions in the existing admin UI.
//
// Storage: a `permissions` jsonb column on the `admins` row, e.g.
//   { "delete_customer": true, "delete_trainer": false, "delete_society": true }
//
// Backward compatibility: an admin whose permissions are unknown (the migration
// hasn't been run yet, i.e. `permissions === null` in the app) is treated as
// having FULL access — see `can()` in AuthContext — so nothing that works today
// breaks before the migration is applied.

export type AdminPermissionKey =
  | "delete_customer"
  | "delete_trainer"
  | "delete_society";

export interface AdminPermissionMeta {
  key: AdminPermissionKey;
  label: string;
  description: string;
}

export const ADMIN_PERMISSIONS: AdminPermissionMeta[] = [
  {
    key: "delete_customer",
    label: "Delete Customer",
    description: "Remove customer accounts and their associated data.",
  },
  {
    key: "delete_trainer",
    label: "Delete Trainer",
    description: "Delete trainers and reject pending trainer access requests.",
  },
  {
    key: "delete_society",
    label: "Delete Society",
    description: "Remove societies from the directory.",
  },
];

export const ALL_PERMISSION_KEYS: AdminPermissionKey[] = ADMIN_PERMISSIONS.map((p) => p.key);

// A partial map — a missing key is treated as `false` once permissions are known.
export type AdminPermissions = Partial<Record<AdminPermissionKey, boolean>>;

/** Every permission granted — used to backfill/seed a fully-capable admin. */
export function fullPermissions(): AdminPermissions {
  return ALL_PERMISSION_KEYS.reduce<AdminPermissions>((acc, k) => {
    acc[k] = true;
    return acc;
  }, {});
}

/** Every permission denied — the starting point for a locked-down admin. */
export function emptyPermissions(): AdminPermissions {
  return ALL_PERMISSION_KEYS.reduce<AdminPermissions>((acc, k) => {
    acc[k] = false;
    return acc;
  }, {});
}
