import { supabase } from "@/integrations/supabase/client";

// Lightweight audit trail for admin actions. Every meaningful admin/super-admin
// mutation calls logAdminActivity(...) so the Super Admin can see, per admin,
// "what he's doing" on their profile page.
//
// The acting identity is read from the same localStorage session the app uses
// (written by signInAdmin / signInSuperAdmin), so this helper is decoupled from
// React and can be called from any mutation. Logging is best-effort and never
// throws — a failed insert (e.g. migration not run yet) must not break the
// action the user actually performed.

export interface AdminActivityInput {
  action: string;                 // e.g. "trainer.delete", "society.create"
  entityType?: string;            // "trainer" | "society" | "customer" | "plan" | "admin"
  entityId?: string | null;
  entityLabel?: string | null;    // human label (name) for display
  details?: Record<string, unknown> | null;
}

function currentActor() {
  try {
    return {
      admin_id: localStorage.getItem("fitved_custom_user"),
      actor_role: localStorage.getItem("fitved_custom_role"),
      actor_name: localStorage.getItem("fitved_actor_name"),
    };
  } catch {
    return { admin_id: null, actor_role: null, actor_name: null };
  }
}

export async function logAdminActivity(input: AdminActivityInput): Promise<void> {
  const actor = currentActor();
  // Only staff sessions are auditable.
  if (actor.actor_role !== "admin" && actor.actor_role !== "super_admin") return;

  try {
    await (supabase as any).from("admin_activity").insert({
      admin_id: actor.admin_id,
      actor_role: actor.actor_role,
      actor_name: actor.actor_name,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      details: input.details ?? null,
    });
  } catch {
    // Swallow — auditing must never block the real mutation.
  }
}

// Fire-and-forget variant for call sites that don't want to await.
export function trackAdminActivity(input: AdminActivityInput): void {
  void logAdminActivity(input);
}
