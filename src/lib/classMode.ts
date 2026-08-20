export type ClassMode = "online" | "offline";

export const MODE_LABEL: Record<ClassMode, string> = {
  online: "Online",
  offline: "Offline",
};

export const otherMode = (m: ClassMode): ClassMode => (m === "online" ? "offline" : "online");

// Fallback admin contact shown to customers when their assigned admin has no
// phone on file (matches the site-wide support number).
export const SUPPORT_PHONE = "+91 9606047293";
