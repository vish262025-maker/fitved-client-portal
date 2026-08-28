import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/client";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { normalizePhone } from "@/lib/phoneAuth";
import type { AdminPermissions, AdminPermissionKey } from "@/lib/permissions";
import { toast } from "sonner";

type AppRole = "client" | "trainer" | "admin" | "super_admin";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, phone?: string) => Promise<{ error: string | null }>;
  signInWithPhone: (phone: string, dob: Date) => Promise<{ error: string | null }>;
  signUpWithPhone: (name: string, phone: string, dob: Date, email: string) => Promise<{ error: string | null }>;
  signInAdmin: (phone: string, passwordText: string) => Promise<{ error: string | null }>;
  // Super Admin is a separate account (super_admins table) with its own login.
  signInSuperAdmin: (phone: string, passwordText: string) => Promise<{ error: string | null }>;
  // Whether the current session is the Super Admin.
  isSuperAdmin: boolean;
  // Super Admin "view as admin": open a specific admin's dashboard by switching
  // into their session, remembering the SA session so it can be restored.
  viewAsAdmin: (admin: { id: string; name: string | null; permissions: AdminPermissions | null }) => void;
  exitImpersonation: () => void;
  // True while the Super Admin is viewing an admin's dashboard.
  impersonating: boolean;
  // Per-admin permission map. `null` means "unknown / legacy" (migration not run)
  // and is treated as full access by `can()` so existing behavior is preserved.
  permissions: AdminPermissions | null;
  // Gate a destructive admin action. Super Admin → always allowed; legacy admin
  // (no permissions loaded) → allowed; otherwise the explicit grant is checked.
  can: (key: AdminPermissionKey) => boolean;
  // Customer email verification (Firebase email link — clicking it returns
  // to continueUrl in the app; it does NOT log into the app by itself).
  // Used by the signup wizard (/signup) and the add-email card (/dashboard).
  sendVerificationEmail: (email: string, continueUrl?: string, pending?: { name: string; phone: string; dob: string }) => Promise<{ error: string | null }>;
  completeEmailVerification: (email: string, link: string) => Promise<{ error: string | null }>;
  // Trainer auth via Firebase. Google resolves three ways: existing trainer →
  // logged in; pending trainer → notice; unknown email → access request is
  // created automatically and a notice returned.
  signInTrainerGoogle: () => Promise<{ error: string | null; notice?: string }>;
  sendTrainerPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Kept for interface compatibility — the app no longer adopts Supabase
  // Auth sessions, so this is always null.
  const [session] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    // The ONLY app session is the custom localStorage one, written by the
    // sign-in helpers below. Supabase Auth sessions are never adopted (that
    // path once let a magic-link click log people in with no phone/DOB, and
    // no profile — showing their email username in the top bar). Firebase is
    // the credential layer only; its own session never logs into the app.
    const customUserId = localStorage.getItem("fitved_custom_user");
    const customRole = localStorage.getItem("fitved_custom_role");
    const permsRaw = localStorage.getItem("fitved_admin_permissions");
    if (customUserId) {
      setUser({ id: customUserId } as User);
      setRole((customRole as AppRole) || "client");
      if (permsRaw) {
        try { setPermissions(JSON.parse(permsRaw)); } catch { setPermissions(null); }
      }
    }
    setImpersonating(!!localStorage.getItem("fitved_sa_backup"));
    setRoleLoading(false);
    setLoading(false);
  }, []);

  // Keep a real admin's permissions in sync with the DB. The login snapshot in
  // localStorage can go stale when the Super Admin toggles a permission after
  // the admin has already signed in — refetch on load so `can()` reflects the
  // current grant. Skipped while impersonating (the SA carries their own map).
  useEffect(() => {
    if (impersonating) return;
    if (role !== "admin" || !user?.id) return;
    let cancelled = false;
    (async () => {
      const res = await (supabase as any)
        .from("admins")
        .select("permissions")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || res.error || !res.data) return;
      const perms =
        res.data.permissions && typeof res.data.permissions === "object"
          ? (res.data.permissions as AdminPermissions)
          : null;
      setPermissions(perms);
      if (perms) localStorage.setItem("fitved_admin_permissions", JSON.stringify(perms));
      else localStorage.removeItem("fitved_admin_permissions");
    })();
    return () => { cancelled = true; };
  }, [role, user?.id, impersonating]);

  // A client session must point at a real profile. If it doesn't — a signup
  // that half-completed, or a customer deleted by an admin — the app used to
  // render a logged-in dashboard with no name, no plan and no society, which
  // looks exactly like a broken signup. Close the session instead of showing
  // a shell. Trainers/admins/super-admins live in other tables, so they are
  // deliberately not checked here.
  useEffect(() => {
    if (loading || roleLoading) return;
    const id = user?.id;
    if (!id) return;
    if (role && role !== "client") return;
    if (localStorage.getItem("fitved_sa_backup")) return; // impersonating

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles").select("id").eq("id", id).maybeSingle();
      if (cancelled || error) return;           // network hiccup: leave as-is
      if (data) return;                          // profile exists, all good
      localStorage.removeItem("fitved_custom_user");
      localStorage.removeItem("fitved_custom_role");
      setUser(null);
      setRole(null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, role, loading, roleLoading]);

  // Open the app session for a resolved user id + role.
  const openSession = useCallback((userId: string, appRole: AppRole) => {
    localStorage.setItem("fitved_custom_user", userId);
    localStorage.setItem("fitved_custom_role", appRole);
    setUser({ id: userId } as User);
    setRole(appRole);
  }, []);

  // Create a brand-new trainer record (active=false → pending verification) and
  // open their session. Admin approval later flips active=true. Returns the
  // session-key user_id used by TrainerDashboard.
  const provisionPendingTrainer = useCallback(async (email: string, name: string, contact: string | null) => {
    const newUserId = crypto.randomUUID();
    const { error } = await supabase.from("trainers").insert({
      user_id: newUserId,
      name: name || email.split("@")[0],
      email,
      contact,
      active: false, // pending admin verification
      password: "", // credential lives in Firebase / Google
    } as never);
    if (error) return { error: error.message, userId: null as string | null };
    // Keep the role map consistent with admin-created trainers (best-effort).
    await supabase.from("user_roles").insert({ user_id: newUserId, role: "trainer" } as never);
    return { error: null as string | null, userId: newUserId };
  }, []);

  // Once Firebase has authenticated a trainer's identity, authorize them
  // against the trainers table and open the session. Unverified trainers
  // (active=false) are allowed in — the dashboard shows a pending banner.
  const authorizeTrainerByEmail = useCallback(async (email: string) => {
    const { data } = await supabase
      .from("trainers")
      .select("id, user_id, active")
      .ilike("email", email)
      .maybeSingle();

    if (!data) {
      await firebaseSignOut(firebaseAuth);
      return { error: "No trainer account found for this email. Ask your admin to add you, or use “Request trainer access”." };
    }

    openSession(data.user_id, "trainer");
    return { error: null };
  }, [openSession]);

  // Trainer email/password sign-in — Firebase owns the credential now.
  // Smooth first-login: if the trainer exists in our DB but has no Firebase
  // credential yet (admin-created, or migrated), the password they type on
  // their first sign-in BECOMES their password — no separate setup screen.
  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        const { data: trainerRow } = await supabase
          .from("trainers")
          .select("id")
          .ilike("email", cleanEmail)
          .maybeSingle();
        if (trainerRow) {
          try {
            await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
            return authorizeTrainerByEmail(cleanEmail);
          } catch (e2) {
            const code2 = (e2 as { code?: string })?.code;
            if (code2 === "auth/email-already-in-use") {
              // A credential exists — so the typed password was simply wrong.
              return { error: "Incorrect password. Use “Forgot password?” to reset it, or continue with Google." };
            }
            if (code2 === "auth/weak-password") {
              return { error: "Password must be at least 6 characters." };
            }
            if (code2 === "auth/operation-not-allowed") {
              return { error: "Email/password sign-in is disabled in Firebase. Enable it: Firebase console → Authentication → Sign-in method → Email/Password." };
            }
            return { error: (e2 as { message?: string })?.message ?? "Sign-in failed." };
          }
        }
        return { error: "Invalid email or password. New trainer? Use “Create an account” below." };
      }
      if (code === "auth/too-many-requests") {
        return { error: "Too many attempts. Try again in a few minutes or reset your password." };
      }
      if (code === "auth/operation-not-allowed") {
        return { error: "Email/password sign-in is disabled in Firebase. Enable it: Firebase console → Authentication → Sign-in method → Email/Password." };
      }
      return { error: (e as { message?: string })?.message ?? "Sign-in failed." };
    }
    return authorizeTrainerByEmail(cleanEmail);
  }, [authorizeTrainerByEmail]);

  // Resolve a Google-authenticated user against the trainers table:
  // existing trainer → log in; unknown → create a pending trainer record and
  // log them straight in (dashboard shows the pending-verification banner).
  const resolveGoogleTrainer = useCallback(async (fbUser: FirebaseUser): Promise<{ error: string | null; notice?: string }> => {
    const email = fbUser.email?.toLowerCase() ?? null;
    if (!email) {
      await firebaseSignOut(firebaseAuth);
      return { error: "That Google account has no email address." };
    }

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, user_id, active")
      .ilike("email", email)
      .maybeSingle();
    if (trainer) {
      openSession(trainer.user_id, "trainer");
      return { error: null };
    }

    // New trainer via Google → create pending record + log in immediately.
    const { error, userId } = await provisionPendingTrainer(email, fbUser.displayName ?? "", null);
    if (error || !userId) {
      await firebaseSignOut(firebaseAuth);
      return { error: error ?? "Could not create your trainer account." };
    }
    openSession(userId, "trainer");
    return { error: null, notice: "Welcome! Your account is pending admin verification." };
  }, [openSession, provisionPendingTrainer]);

  // Trainer Google sign-in. Popup where possible; falls back to a full-page
  // redirect when the browser blocks popups (common on mobile).
  const signInTrainerGoogle = useCallback(async (): Promise<{ error: string | null; notice?: string }> => {
    try {
      const cred = await signInWithPopup(firebaseAuth, googleProvider);
      return await resolveGoogleTrainer(cred.user);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return { error: "Sign-in cancelled." };
      }
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        // Redirect flow: the page navigates to Google and back; the
        // getRedirectResult effect below finishes the job on return.
        await signInWithRedirect(firebaseAuth, googleProvider);
        return { error: null, notice: "Redirecting to Google…" };
      }
      if (code === "auth/operation-not-allowed") {
        return { error: "Google sign-in is disabled in Firebase. Enable the Google provider: Firebase console → Authentication → Sign-in method." };
      }
      if (code === "auth/unauthorized-domain") {
        return { error: `This domain (${window.location.hostname}) isn't authorized in Firebase. Add it under Authentication → Settings → Authorized domains.` };
      }
      return { error: (e as { message?: string })?.message ?? "Google sign-in failed." };
    }
  }, [resolveGoogleTrainer]);

  // Completes the Google redirect flow after the round-trip.
  useEffect(() => {
    if (localStorage.getItem("fitved_custom_user")) return; // already signed in
    getRedirectResult(firebaseAuth)
      .then(async (cred) => {
        if (!cred?.user) return;
        const { error, notice } = await resolveGoogleTrainer(cred.user);
        if (error) toast.error(error);
        else if (notice) toast.info(notice);
        else toast.success("Welcome back!");
      })
      .catch(() => { /* no pending redirect — normal page load */ });
  }, [resolveGoogleTrainer]);

  // Password reset for a trainer who already has a Firebase login.
  const sendTrainerPasswordReset = useCallback(async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data } = await supabase
      .from("trainers")
      .select("id")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (!data) {
      return { error: "No trainer account found for this email." };
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, cleanEmail);
      return { error: null };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/user-not-found") {
        return { error: "No password login exists yet — just sign in with your email and the password you want to use, and it becomes your password. Or continue with Google." };
      }
      if (code === "auth/operation-not-allowed") {
        return { error: "Email/password sign-in is disabled in Firebase. Enable it: Firebase console → Authentication → Sign-in method → Email/Password." };
      }
      return { error: (e as { message?: string })?.message ?? "Could not send reset email." };
    }
  }, []);

  // Trainer self-registration → immediate access. Creates the Firebase
  // credential AND a pending trainer record (active=false), then logs them
  // straight in. The dashboard shows a "pending verification" banner and
  // collects their phone; an admin flips active=true to unlock everything.
  const signUp = useCallback(async (email: string, password: string, name: string, phone?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const contact = phone && normalizePhone(phone).length === 10 ? normalizePhone(phone) : null;
    const { data: existingTrainer } = await supabase
      .from("trainers")
      .select("id")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (existingTrainer) {
      return { error: "This email is already registered — please sign in instead." };
    }

    // Create the Firebase credential first (owns the password).
    try {
      await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        return { error: "You already have a login. Please sign in, or use “Forgot password”." };
      }
      if (code === "auth/weak-password") {
        return { error: "Password must be at least 6 characters." };
      }
      if (code === "auth/operation-not-allowed") {
        return { error: "Email/password sign-in is disabled in Firebase. Enable it: Firebase console → Authentication → Sign-in method → Email/Password." };
      }
      return { error: (e as { message?: string })?.message ?? "Could not create login." };
    }

    const { error, userId } = await provisionPendingTrainer(cleanEmail, name, contact);
    if (error || !userId) {
      return { error: error ?? "Could not create your trainer account." };
    }
    openSession(userId, "trainer");
    return { error: null };
  }, [openSession, provisionPendingTrainer]);

  const signInWithPhone = useCallback(async (phone: string, dob: Date) => {
    const normalized = normalizePhone(phone);
    const dobString = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`;
    
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", normalized)
      .eq("dob", dobString)
      .maybeSingle();

    if (error || !data) {
      return { error: "Account not found or incorrect birthday. Please create an account." };
    }

    localStorage.setItem("fitved_custom_user", data.id);
    setUser({ id: data.id } as User);
    setRole("client");
    
    // Hard reload to flush React Query cache and sync state if needed
    // or just rely on state
    return { error: null };
  }, []);

  const signUpWithPhone = useCallback(async (name: string, phone: string, dob: Date, email: string) => {
    const normalized = normalizePhone(phone);
    const cleanEmail = email.trim().toLowerCase();
    const dobString = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`;

    // Check if phone already registered
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (existing) {
      return { error: "You already have an account! Please sign in." };
    }

    const newId = crypto.randomUUID();

    // 1. Insert into profiles (email is already verified via OTP at this point)
    const { data, error } = await supabase.from("profiles").insert({
      id: newId,
      name: name,
      phone: normalized,
      dob: dobString,
      email: cleanEmail,
    }).select("id").single();

    if (error || !data) {
      return { error: error?.message || "Failed to create account" };
    }

    // 2. CRITICAL: Insert into user_roles so admin dashboard can find them
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: data.id,
      role: "client",
    });
    if (roleError) {
      console.warn("user_roles insert failed:", roleError.message);
      // Don't block login — role can be re-linked later
    }

    localStorage.setItem("fitved_custom_user", data.id);
    localStorage.removeItem("fitved_custom_role"); // client is default
    setUser({ id: data.id } as User);
    setRole("client");
    
    return { error: null };
  }, []);

  // Regular admin sign-in against the `admins` table. Always a normal admin —
  // the Super Admin is a SEPARATE account (see signInSuperAdmin). We also load
  // the admin's permission map to gate destructive actions; if the permissions
  // column doesn't exist yet (migration not run), fall back to a legacy select
  // so login keeps working and the admin retains full access.
  const signInAdmin = useCallback(async (phone: string, passwordText: string) => {
    const normalized = normalizePhone(phone);

    let adminId: string | null = null;
    let adminName: string | null = null;
    let perms: AdminPermissions | null = null;

    const rich = await (supabase as any)
      .from("admins")
      .select("id, name, permissions, active")
      .eq("phone", normalized)
      .eq("password", passwordText)
      .maybeSingle();

    if (rich.error) {
      const { data, error } = await supabase
        .from("admins")
        .select("id, name")
        .eq("phone", normalized)
        .eq("password", passwordText)
        .maybeSingle();
      if (error || !data) return { error: "Invalid admin credentials." };
      adminId = data.id;
      adminName = (data as { name?: string }).name ?? null;
    } else {
      if (!rich.data) return { error: "Invalid admin credentials." };
      // Suspended admins can't sign in (the `active` column may be absent on
      // older DBs — treat missing as active so legacy logins keep working).
      if (rich.data.active === false) {
        return { error: "Your admin access has been suspended. Contact the Super Admin." };
      }
      adminId = rich.data.id;
      adminName = rich.data.name ?? null;
      perms = rich.data.permissions && typeof rich.data.permissions === "object"
        ? (rich.data.permissions as AdminPermissions)
        : null;
    }

    localStorage.setItem("fitved_custom_user", adminId!);
    localStorage.setItem("fitved_custom_role", "admin");
    localStorage.setItem("fitved_actor_name", adminName || "Admin");
    if (perms) localStorage.setItem("fitved_admin_permissions", JSON.stringify(perms));
    else localStorage.removeItem("fitved_admin_permissions");

    // Record the sign-in (best-effort; never blocks login).
    void (async () => {
      try {
        await (supabase as any).from("admin_logins").insert({ admin_id: adminId, actor_role: "admin" });
        await (supabase as any).from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", adminId);
      } catch { /* columns/tables may not exist yet — ignore */ }
    })();

    setUser({ id: adminId! } as User);
    setRole("admin");
    setPermissions(perms);
    return { error: null };
  }, []);

  // Super Admin sign-in against the SEPARATE `super_admins` table. This is the
  // only path that opens a super_admin session; the regular admin login never
  // grants it. The Super Admin implicitly has every permission (see `can`).
  const signInSuperAdmin = useCallback(async (phone: string, passwordText: string) => {
    const normalized = normalizePhone(phone);

    const { data, error } = await (supabase as any)
      .from("super_admins")
      .select("id")
      .eq("phone", normalized)
      .eq("password", passwordText)
      .maybeSingle();

    if (error) {
      // Table not created yet (migration not run) or lookup failed.
      return { error: "Super Admin sign-in isn't available yet. Run the super_admin migration." };
    }
    if (!data) return { error: "Invalid Super Admin credentials." };

    localStorage.setItem("fitved_custom_user", data.id);
    localStorage.setItem("fitved_custom_role", "super_admin");
    localStorage.setItem("fitved_actor_name", "Super Admin");
    localStorage.removeItem("fitved_admin_permissions");

    setUser({ id: data.id } as User);
    setRole("super_admin");
    setPermissions(null);
    return { error: null };
  }, []);

  // ── Customer signup email verification (Firebase email link) ──────────────
  // Firebase emails a verification LINK (it has no native numeric email OTP).
  // The link's continue-URL points back at /signup, so clicking it returns
  // the customer to the wizard to finish phone + DOB — it never logs them in.
  const sendVerificationEmail = useCallback(async (
    email: string,
    continueUrl = "/signup",
    pending?: { name: string; phone: string; dob: string },
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    // Block emails already tied to an account
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (existing) {
      return { error: "This email already has an account. Please sign in with your mobile and birthday." };
    }
    // Stash the details server-side and put only the token in the link. The
    // details must NOT ride in the URL — date of birth is the app's password.
    let url = `${window.location.origin}${continueUrl}`;
    if (pending) {
      const { data: token, error: stashErr } = await (supabase as any).rpc("create_pending_signup", {
        _email: cleanEmail, _name: pending.name, _phone: pending.phone, _dob: pending.dob,
      });
      if (stashErr) {
        // Migration not run yet — fall back to the old localStorage flow so
        // signup keeps working, just only in this browser.
        console.warn("create_pending_signup failed:", stashErr.message);
      } else if (token) {
        url += `${continueUrl.includes("?") ? "&" : "?"}t=${token}`;
      }
    }

    try {
      await sendSignInLinkToEmail(firebaseAuth, cleanEmail, {
        url,
        handleCodeInApp: true,
      });
      return { error: null };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/operation-not-allowed") {
        return { error: "Email-link sign-in is disabled in Firebase. In the Firebase console → Authentication → Sign-in method → Email/Password, also enable “Email link (passwordless sign-in)”." };
      }
      if (code === "auth/unauthorized-continue-uri") {
        return { error: "This domain isn't authorized in Firebase. Add it under Authentication → Settings → Authorized domains." };
      }
      if (code === "auth/invalid-email") {
        return { error: "That email address doesn't look valid." };
      }
      if (code === "auth/quota-exceeded" || code === "auth/too-many-requests") {
        return { error: "We couldn't send the verification email right now (email limit reached). Please try again in a little while, or contact support." };
      }
      return { error: (e as { message?: string })?.message ?? "Could not send the verification email." };
    }
  }, []);

  // Called when the customer lands back on /signup from the emailed link.
  // Completing the link sign-in proves mailbox ownership; the Firebase
  // session it creates is discarded immediately.
  const completeEmailVerification = useCallback(async (email: string, link: string) => {
    try {
      await signInWithEmailLink(firebaseAuth, email.trim().toLowerCase(), link);
      await firebaseSignOut(firebaseAuth);
      return { error: null };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
        return { error: "That verification link is invalid or has expired — send a new one." };
      }
      return { error: (e as { message?: string })?.message ?? "Email verification failed." };
    }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem("fitved_custom_user");
    localStorage.removeItem("fitved_custom_role");
    localStorage.removeItem("fitved_admin_permissions");
    localStorage.removeItem("fitved_actor_name");
    localStorage.removeItem("fitved_sa_backup");
    await supabase.auth.signOut();
    await firebaseSignOut(firebaseAuth).catch(() => {});
    setUser(null);
    setRole(null);
    setPermissions(null);
    setImpersonating(false);
    window.location.href = "/";
  }, []);

  // Super Admin opens a specific admin's dashboard by switching into that
  // admin's session. The SA session is stashed so exitImpersonation() restores it.
  const viewAsAdmin = useCallback((admin: { id: string; name: string | null; permissions: AdminPermissions | null }) => {
    // If already impersonating (switching from one admin to another), keep the
    // ORIGINAL Super Admin session as the backup — never overwrite it with the
    // outgoing admin's session, or exitImpersonation would restore the wrong user.
    if (!localStorage.getItem("fitved_sa_backup")) {
      const backup = {
        user: localStorage.getItem("fitved_custom_user"),
        role: localStorage.getItem("fitved_custom_role"),
        name: localStorage.getItem("fitved_actor_name"),
      };
      localStorage.setItem("fitved_sa_backup", JSON.stringify(backup));
    }
    localStorage.setItem("fitved_custom_user", admin.id);
    localStorage.setItem("fitved_custom_role", "admin");
    localStorage.setItem("fitved_actor_name", admin.name || "Admin");
    if (admin.permissions) localStorage.setItem("fitved_admin_permissions", JSON.stringify(admin.permissions));
    else localStorage.removeItem("fitved_admin_permissions");
    setUser({ id: admin.id } as User);
    setRole("admin");
    setPermissions(admin.permissions ?? null);
    setImpersonating(true);
  }, []);

  const exitImpersonation = useCallback(() => {
    const raw = localStorage.getItem("fitved_sa_backup");
    localStorage.removeItem("fitved_sa_backup");
    localStorage.removeItem("fitved_admin_permissions");
    let b: { user?: string | null; role?: string | null; name?: string | null } | null = null;
    try { b = raw ? JSON.parse(raw) : null; } catch { b = null; }
    if (b?.user) localStorage.setItem("fitved_custom_user", b.user); else localStorage.removeItem("fitved_custom_user");
    if (b?.role) localStorage.setItem("fitved_custom_role", b.role); else localStorage.removeItem("fitved_custom_role");
    if (b?.name) localStorage.setItem("fitved_actor_name", b.name); else localStorage.removeItem("fitved_actor_name");
    setUser(b?.user ? ({ id: b.user } as User) : null);
    setRole((b?.role as AppRole) || null);
    setPermissions(null);
    setImpersonating(false);
  }, []);

  const isSuperAdmin = role === "super_admin";

  // Gate a destructive admin action. Super Admin → always allowed. A legacy
  // admin whose permissions haven't loaded (migration not run) → allowed, so
  // nothing that works today is taken away. Otherwise the explicit grant wins.
  const can = useCallback(
    (key: AdminPermissionKey) => {
      if (role === "super_admin") return true;
      if (impersonating) return true;
      if (role !== "admin") return false;
      if (!permissions) return true;
      return permissions[key] === true;
    },
    [role, permissions, impersonating],
  );

  const value = useMemo(
    () => ({
      user, session, role, loading, roleLoading,
      signIn, signUp, signInWithPhone, signUpWithPhone, signInAdmin, signInSuperAdmin,
      sendVerificationEmail, completeEmailVerification,
      signInTrainerGoogle, sendTrainerPasswordReset,
      signOut,
      isSuperAdmin, permissions, can,
      viewAsAdmin, exitImpersonation, impersonating,
    }),
    [
      user, session, role, loading, roleLoading,
      signIn, signUp, signInWithPhone, signUpWithPhone, signInAdmin, signInSuperAdmin,
      sendVerificationEmail, completeEmailVerification,
      signInTrainerGoogle, sendTrainerPasswordReset,
      signOut,
      isSuperAdmin, permissions, can,
      viewAsAdmin, exitImpersonation, impersonating,
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
