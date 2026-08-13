export type AppRole = "client" | "trainer" | "admin" | "super_admin";

/** The single source of truth for where each role lands after login. */
export function homeForRole(role: AppRole | null): string {
  switch (role) {
    case "trainer":
      return "/trainer";
    case "admin":
      return "/admin";
    case "super_admin":
      return "/super-admin";
    default:
      return "/dashboard";
  }
}
