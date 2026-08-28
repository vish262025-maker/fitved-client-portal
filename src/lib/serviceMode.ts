/**
 * The four service tracks a trainer works in.
 *
 * A first-class value stored on plans and sessions (`service_mode`), never
 * inferred from society, batch name or trainer. Filtering happens in the query
 * layer on that column — hiding rows in the UI would still leave counts wrong.
 */
export const SERVICE_MODES = [
  "offline_group",
  "offline_personal",
  "online_group",
  "online_personal",
] as const;

export type ServiceMode = typeof SERVICE_MODES[number];

export const SERVICE_MODE_LABEL: Record<ServiceMode, string> = {
  offline_group: "Offline Group",
  offline_personal: "Offline Personal",
  online_group: "Online Group",
  online_personal: "Online Personal",
};

export const isOnlineMode = (m: ServiceMode) => m.startsWith("online");
/** Society only ever applies to offline tracks. */
export const usesSociety = (m: ServiceMode) => m.startsWith("offline");
/** Batches back group training in both modes; personal has no batch. */
export const usesBatch = (m: ServiceMode) => m.endsWith("_group");

export function serviceModeOf(row: {
  service_mode?: string | null;
  training_mode?: string | null;
  training_type?: string | null;
} | null | undefined): ServiceMode {
  if (!row) return "offline_group";
  if (row.service_mode && (SERVICE_MODES as readonly string[]).includes(row.service_mode)) {
    return row.service_mode as ServiceMode;
  }
  // Fallback for a database that hasn't run 20260825170000 yet.
  const mode = row.training_mode === "online" ? "online" : "offline";
  const type = row.training_type === "personal" ? "personal" : "group";
  return `${mode}_${type}` as ServiceMode;
}

export const splitMode = (m: ServiceMode) => {
  const [mode, type] = m.split("_");
  return { training_mode: mode as "offline" | "online", training_type: type as "group" | "personal" };
};


/**
 * The one rule deciding which catalogue plans a customer may see.
 *
 * A plan belongs to exactly one (mode × type) bucket. Rows created before the
 * category columns existed are treated as offline group, which is what they
 * were. Kept here rather than inline in the component so it can be tested —
 * a plan from another bucket must never reach the grid.
 */
export function visiblePlanOptions<
  T extends { class_mode?: string | null; training_type?: string | null },
>(all: T[], mode: "offline" | "online", type: "group" | "personal"): T[] {
  return all.filter(
    (o) =>
      (o.class_mode === "online" ? "online" : "offline") === mode &&
      (o.training_type === "personal" ? "personal" : "group") === type,
  );
}
