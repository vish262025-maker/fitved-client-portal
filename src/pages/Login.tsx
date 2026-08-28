import { useEffect, useState } from "react";
import { useNavigate, Navigate, Link, useLocation } from "react-router-dom";
import { isSignInWithEmailLink } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import razorpayRizeLogo from "@/assets/razorpay-rize.svg";
import { homeForRole } from "@/lib/routes";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { FitvedLogo } from "@/components/FitvedLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isValidPhone, isValidDob, normalizePhone, isValidEmail } from "@/lib/phoneAuth";

// Wizard state survives the round-trip through the emailed verification link
const PENDING_SIGNUP_KEY = "fitved_pending_signup";

// Google's brand "G" — lucide has no brand logos, so inline it.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user, role, loading, roleLoading,
    signIn, signUp, signInWithPhone, signUpWithPhone, signInAdmin,
    sendVerificationEmail, completeEmailVerification,
    signInTrainerGoogle, sendTrainerPasswordReset,
  } = useAuth();

  // Open in create-account mode when arriving via /signup (or ?signup / ?mode=signup),
  // so a shared link lands customers straight on the create form.
  const params = new URLSearchParams(location.search);
  const wantSignup =
    location.pathname === "/signup" || params.has("signup") || params.get("mode") === "signup";
  // Dedicated trainer URLs — /trainer/signin, /trainer/login, /trainer/signup —
  // open the Trainers tab directly so the links are shareable.
  const isTrainerRoute = location.pathname.startsWith("/trainer/");
  const wantTrainerSignup = location.pathname === "/trainer/signup";

  // Which tab is open, driven by the URL.
  const [tab, setTab] = useState<"customer" | "staff">(isTrainerRoute ? "staff" : "customer");

  // Customer state
  const [custMode, setCustMode] = useState<"signin" | "signup">(wantSignup ? "signup" : "signin");
  // Signup is 2 steps: all details (incl. birthday) → click the emailed
  // verification link, which creates the account and logs them straight in.
  const [custStep, setCustStep] = useState<"details" | "verify">("details");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custDob, setCustDob] = useState<Date | undefined>(undefined);
  const [dobOpen, setDobOpen] = useState(false);

  // Staff state — first-time email sign-in auto-creates the password, and
  // Google users set one from inside the dashboard, so no "setup" mode here.
  const [mode, setMode] = useState<"signin" | "signup">(wantTrainerSignup ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [trainerPhone, setTrainerPhone] = useState("");

  // Admin state
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [staffPhone, setStaffPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [busy, setBusy] = useState(false);

  // Keep the address bar in sync with the current tab + mode, so trainers see
  // (and can copy) the dedicated /trainer/signin · /trainer/signup URLs — and
  // customers see /login · /signup — without a full navigation/reload.
  useEffect(() => {
    const target =
      tab === "staff"
        ? mode === "signup"
          ? "/trainer/signup"
          : "/trainer/signin"
        : custMode === "signup"
        ? "/signup"
        : "/login";
    if (location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [tab, mode, custMode, location.pathname, navigate]);

  // Customer sign-in: phone + birthday (unchanged).
  const handleCustomerSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(custPhone)) { toast.error("Please enter a valid 10-digit phone number"); return; }
    if (!isValidDob(custDob)) { toast.error("Please pick a valid date of birth"); return; }
    setBusy(true);
    try {
      const { error } = await signInWithPhone(custPhone, custDob!);
      if (error) {
        toast.error("Account not found or incorrect birthday. Please create an account.");
        setCustMode("signup"); setCustStep("details");
        return;
      }
      toast.success("Welcome back!");
      navigate("/dashboard");
    } finally { setBusy(false); }
  };

  // Signup step 1: ALL details (name, email, mobile, birthday) → Firebase
  // emails a verification link. Everything is stashed in localStorage because
  // clicking the link reloads the page; the moment they click it, the account
  // is created and they're logged in — no extra steps after the email.
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) { toast.error("Please enter your name"); return; }
    if (!isValidEmail(custEmail)) { toast.error("Please enter a valid email address"); return; }
    if (!isValidPhone(custPhone)) { toast.error("Please enter a valid 10-digit phone number"); return; }
    if (!isValidDob(custDob)) { toast.error("Please pick your date of birth"); return; }
    setBusy(true);
    try {
      // Fail fast if the mobile number already has an account — better now
      // than after they've verified their email.
      const { data: phoneTaken } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", normalizePhone(custPhone))
        .maybeSingle();
      if (phoneTaken) {
        toast.error("This mobile number already has an account — please sign in.");
        setCustMode("signin");
        return;
      }
      const dobISO = `${custDob!.getFullYear()}-${String(custDob!.getMonth() + 1).padStart(2, "0")}-${String(custDob!.getDate()).padStart(2, "0")}`;
      const { error } = await sendVerificationEmail(custEmail, "/signup", {
        name: custName.trim(), phone: normalizePhone(custPhone), dob: dobISO,
      });
      if (error) { toast.error(error); return; }
      // Still stored so a refresh mid-flow doesn't lose the form, but the code
      // is typed into THIS tab so nothing depends on which browser opens the
      // email any more.
      localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
        name: custName.trim(),
        phone: normalizePhone(custPhone),
        email: custEmail.trim().toLowerCase(),
        dob: custDob!.toISOString(),
      }));
      toast.success(`Verification link sent to ${custEmail.trim()}`);
      setCustStep("verify");
    } finally { setBusy(false); }
  };

  const handleResendLink = async () => {
    setBusy(true);
    try {
      const dobISO = custDob
        ? `${custDob.getFullYear()}-${String(custDob.getMonth() + 1).padStart(2, "0")}-${String(custDob.getDate()).padStart(2, "0")}`
        : undefined;
      const { error } = await sendVerificationEmail(
        custEmail, "/signup",
        dobISO ? { name: custName.trim(), phone: normalizePhone(custPhone), dob: dobISO } : undefined,
      );
      if (error) toast.error(error);
      else toast.success("New link sent — check your inbox");
    } finally { setBusy(false); }
  };

  // Step 2 completes itself: the emailed link lands back on /signup, this
  // effect proves the mailbox, creates the account, and signs them straight in.
  useEffect(() => {
    const href = window.location.href;
    const pending = (() => {
      try { return JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) ?? "null"); }
      catch { return null; }
    })() as { name: string; phone: string; email: string; dob?: string } | null;

    if (!isSignInWithEmailLink(firebaseAuth, href)) {
      // Plain visit — if a signup is mid-flight (link sent, not clicked yet),
      // put the wizard back on the waiting screen instead of a blank form.
      if (pending?.email && wantSignup) {
        setCustName(pending.name); setCustPhone(pending.phone); setCustEmail(pending.email);
        if (pending.dob) setCustDob(new Date(pending.dob));
        setCustMode("signup"); setCustStep("verify");
      }
      return;
    }
    (async () => {
      setBusy(true);

      // The link carries a one-time token; the details live server-side, so
      // this works in whatever browser the mail app decided to open. Falls
      // back to this browser's localStorage for links sent before that.
      let details = pending;
      const token = new URLSearchParams(window.location.search).get("t")
        ?? (() => {
          // Firebase nests our continue URL inside `continueUrl`.
          const c = new URLSearchParams(window.location.search).get("continueUrl");
          try { return c ? new URL(c).searchParams.get("t") : null; } catch { return null; }
        })();

      if (token) {
        const { data, error: tokErr } = await (supabase as any)
          .rpc("consume_pending_signup", { _token: token });
        const row = Array.isArray(data) ? data[0] : data;
        if (!tokErr && row?.email) {
          details = { name: row.name, phone: row.phone, email: row.email, dob: row.dob };
        }
      }

      if (!details?.email) {
        toast.error(
          "That link has already been used, or it expired. Please sign up again and we'll send a new one.",
          { duration: 9000 },
        );
        window.history.replaceState({}, "", "/signup");
        setCustMode("signup"); setCustStep("details");
        setBusy(false);
        return;
      }
      const pendingResolved = details;
      const restore = () => {
        setCustName(pendingResolved.name); setCustPhone(pendingResolved.phone); setCustEmail(pendingResolved.email);
        if (pendingResolved.dob) setCustDob(new Date(pendingResolved.dob));
        setCustMode("signup"); setCustStep("details");
      };
      const { error } = await completeEmailVerification(pendingResolved.email, href);
      // Strip the one-time code from the URL either way so refreshes are clean
      window.history.replaceState({}, "", "/signup");
      if (error) {
        toast.error(error);
        restore();
        setBusy(false);
        return;
      }
      const dob = pendingResolved.dob ? new Date(pendingResolved.dob) : null;
      if (!dob || !isValidDob(dob)) {
        // Pending data from the old flow (no DOB) — just have them redo the form
        toast.success("Email verified — please complete your details.");
        restore();
        setBusy(false);
        return;
      }
      // signUpWithPhone creates the profile + role AND opens the session
      const { error: signupErr } = await signUpWithPhone(pendingResolved.name, pendingResolved.phone, dob, pendingResolved.email);
      if (signupErr) {
        if (signupErr.toLowerCase().includes("already")) {
          toast.error("You already have an account! Please sign in.");
          localStorage.removeItem(PENDING_SIGNUP_KEY);
          setCustMode("signin"); setCustStep("details");
        } else {
          toast.error(signupErr);
          restore();
        }
        setBusy(false);
        return;
      }
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      toast.success("Email verified — welcome to Fitved! 🎉");
      setBusy(false);
      navigate("/dashboard");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdminMode) {
      if (!isValidPhone(staffPhone)) {
        toast.error("Please enter a valid 10-digit phone number");
        return;
      }
      if (!adminPassword) {
        toast.error("Please enter password");
        return;
      }
      setBusy(true);
      try {
        const { error } = await signInAdmin(staffPhone, adminPassword);
        if (error) {
          toast.error(error);
          return;
        }
        toast.success("Welcome back, Admin!");
        navigate("/admin");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!isValidEmail(email)) { toast.error("Please enter a valid email"); return; }
    setBusy(true);
    try {
      if (mode === "signin") {
        if (!password) { toast.error("Please enter a password"); return; }
        const { error } = await signIn(email, password);
        if (error) { toast.error(error); return; }
        toast.success("Welcome back!");
        // The guard at the top of this page redirects to homeForRole(role)
        // once the role loads (admin → /admin, trainer → /trainer).
      } else {
        // Immediate trainer sign-up: creates the account (pending verification)
        // and logs straight into the dashboard.
        if (!name.trim()) { toast.error("Please enter your name"); return; }
        if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
        const { error } = await signUp(email, password, name.trim(), trainerPhone);
        if (error) { toast.error(error); return; }
        toast.success("Account created — welcome to Fitved!");
        navigate("/trainer");
      }
    } finally {
      setBusy(false);
    }
  };

  // One button, two outcomes (handled in AuthContext): existing trainer →
  // logged in; new email → pending trainer created + logged in. Either way
  // they land on the dashboard (with a verification banner if unverified).
  const handleGoogle = async () => {
    setBusy(true);
    try {
      const { error, notice } = await signInTrainerGoogle();
      if (error) { toast.error(error); return; }
      toast.success(notice ?? "Welcome back!");
      navigate("/trainer");
    } finally { setBusy(false); }
  };

  const handleForgot = async () => {
    if (!isValidEmail(email)) { toast.error("Enter your email first"); return; }
    const { error } = await sendTrainerPasswordReset(email);
    if (error) toast.error(error);
    else toast.success("Password reset email sent — check your inbox.");
  };

  // Birthday picker — reused for customer sign-in and signup (always required).
  const dobField = (
    <div className="space-y-2">
      <Label>Date of birth <span className="text-destructive">*</span></Label>
      <Popover open={dobOpen} onOpenChange={setDobOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !custDob && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {custDob ? format(custDob, "PPP") : <span>Pick your birthday</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={custDob}
            onSelect={(d) => { setCustDob(d); setDobOpen(false); }}
            captionLayout="dropdown"
            fromYear={1925}
            toYear={new Date().getFullYear()}
            defaultMonth={custDob ?? new Date(1990, 0, 1)}
            disabled={(d) => d > new Date() || d < new Date("1925-01-01")}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">Your birthday is your password — keep it private.</p>
    </div>
  );

  const custPhoneField = (
    <div className="space-y-2">
      <Label htmlFor="cphone">Phone number <span className="text-destructive">*</span></Label>
      <Input
        id="cphone"
        type="tel"
        inputMode="numeric"
        required
        value={custPhone}
        onChange={(e) => setCustPhone(normalizePhone(e.target.value).slice(0, 10))}
        placeholder="10-digit mobile number"
        autoComplete="tel"
      />
    </div>
  );

  // Already signed in? Send them to their home instead of showing a dead-end
  // login form. Placed AFTER all hooks so the hook order stays stable across
  // renders (returning early before the useState calls crashes React).
  if (!loading && !roleLoading && user) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-soft overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
        <div className="relative">
          <Link to="/" aria-label="Go to homepage" className="inline-block">
            <FitvedLogo />
          </Link>
          <p className="mt-2 pl-1 text-xs uppercase tracking-[0.28em] text-primary/80">Fitness for grownups</p>
        </div>
        <div className="relative space-y-6">
          <h1 className="font-display text-5xl leading-tight text-foreground">
            Strong at every age.<br />
            <span className="text-primary">Calm in every move.</span>
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            A simpler way to manage your fitness program. Pause classes, track your plan,
            and stay close to your trainer — all in one calm place.
          </p>
        </div>
        <p className="relative text-xs text-muted-foreground">© {new Date().getFullYear()} Fitved Wellness</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-5 p-6 sm:p-10">
        <Card className="w-full max-w-md p-8 shadow-elevated rounded-2xl border-border/60">
          <div className="lg:hidden mb-6 flex flex-col items-center gap-1">
            <Link to="/" aria-label="Go to homepage">
              <FitvedLogo />
            </Link>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Fitness for grownups</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "customer" | "staff")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer">Customer</TabsTrigger>
              <TabsTrigger value="staff">Trainers</TabsTrigger>
            </TabsList>

            <TabsContent value="customer" className="mt-5">
              {custMode === "signin" ? (
                <>
                  <h2 className="font-display text-2xl text-foreground">Welcome back</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Sign in with your phone and birthday.</p>
                  <form onSubmit={handleCustomerSignin} className="mt-5 space-y-4">
                    {custPhoneField}
                    {dobField}
                    <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
                      {busy ? "Please wait…" : "Sign in"}
                    </Button>
                  </form>
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    New here?{" "}
                    <button onClick={() => { setCustMode("signup"); setCustStep("details"); }} className="text-primary font-medium hover:underline">
                      Create an account
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl text-foreground">Create your account</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {custStep === "details" && "All fields are required — verify your email and you're in."}
                    {custStep === "verify" && "One click left — open the link we emailed you."}
                  </p>

                  {/* Step indicator */}
                  <div className="mt-3 flex items-center gap-1.5">
                    {(["details", "verify"] as const).map((s, i) => (
                      <div key={s} className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        (["details", "verify"] as const).indexOf(custStep) >= i ? "bg-primary" : "bg-muted"
                      )} />
                    ))}
                  </div>

                  {custStep === "details" && (
                    <form onSubmit={handleSendLink} className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cname">Full name <span className="text-destructive">*</span></Label>
                        <Input id="cname" required value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Your name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cemail">Email <span className="text-destructive">*</span></Label>
                        <Input id="cemail" type="email" required value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                        <p className="text-xs text-muted-foreground">We'll email you a verification link — clicking it logs you in.</p>
                      </div>
                      {custPhoneField}
                      {dobField}
                      <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
                        {busy ? "Sending…" : "Send verification link"}
                      </Button>
                    </form>
                  )}

                  {custStep === "verify" && (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
                        <p className="font-medium text-foreground">Check your inbox 📬</p>
                        <p className="mt-1 text-muted-foreground">
                          We sent a verification link to <span className="font-medium text-foreground">{custEmail.trim()}</span>.
                          Open it on any device — your details are saved, and your account is
                          created the moment you click it.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Nothing arriving? Check spam, or resend below.
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <button type="button" onClick={() => setCustStep("details")} className="text-muted-foreground hover:underline">
                          ← Edit details
                        </button>
                        <button type="button" onClick={handleResendLink} disabled={busy} className="text-primary font-medium hover:underline disabled:opacity-50">
                          {busy ? "Sending…" : "Resend link"}
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button onClick={() => { setCustMode("signin"); setCustStep("details"); }} className="text-primary font-medium hover:underline">
                      Sign in
                    </button>
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="staff" className="mt-5">
              <h2 className="font-display text-2xl text-foreground">
                {isAdminMode
                  ? "Admin sign in"
                  : mode === "signin"
                  ? "Trainer sign in"
                  : "Create trainer account"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAdminMode
                  ? "Sign in with your phone and password."
                  : mode === "signup"
                  ? "Sign up and start right away — an admin verifies your account shortly after."
                  : "For trainers. Continue with Google or use your email."}
              </p>

              {!isAdminMode && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogle}
                    disabled={busy}
                    className="mt-5 w-full h-11 gap-2 text-base"
                  >
                    <GoogleIcon className="h-5 w-5" />
                    Continue with Google
                  </Button>
                  <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    or with email
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={handleStaff} className={cn("space-y-4", isAdminMode && "mt-5")}>
                {isAdminMode ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="sphone">Phone number</Label>
                      <Input
                        id="sphone"
                        type="tel"
                        inputMode="numeric"
                        value={staffPhone}
                        onChange={(e) => setStaffPhone(normalizePhone(e.target.value).slice(0, 10))}
                        placeholder="10-digit mobile number"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apassword">Password</Label>
                      <Input
                        id="apassword"
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {mode === "signup" && (
                      <div className="space-y-2">
                        <Label htmlFor="trainer-fullname">Full name</Label>
                        <Input id="trainer-fullname" name="trainer-fullname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="one-time-code" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor={mode === "signin" ? "email" : "trainer-email-req"}>Email</Label>
                      <Input id={mode === "signin" ? "email" : "trainer-email-req"} name={mode === "signin" ? "email" : "trainer-email-req"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete={mode === "signin" ? "email" : "one-time-code"} />
                    </div>
                    {mode === "signup" && (
                      <div className="space-y-2">
                        <Label htmlFor="tphone">Phone number</Label>
                        <Input
                          id="tphone"
                          type="tel"
                          inputMode="numeric"
                          value={trainerPhone}
                          onChange={(e) => setTrainerPhone(normalizePhone(e.target.value).slice(0, 10))}
                          placeholder="10-digit mobile number"
                          autoComplete="off"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={mode === "signin" ? "password" : "trainer-pass-new"}>Password</Label>
                        {mode === "signin" && (
                          <button type="button" className="text-xs text-primary hover:underline" onClick={handleForgot}>
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input
                        id={mode === "signin" ? "password" : "trainer-pass-new"}
                        name={mode === "signin" ? "password" : "trainer-pass-new"}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === "signin" ? "••••••••" : "At least 6 characters"}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : isAdminMode || mode === "signin"
                    ? "Sign in"
                    : "Create account"}
                </Button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                {!isAdminMode && mode === "signin" && (
                  <p>
                    New trainer?{" "}
                    <button onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">
                      Create an account
                    </button>
                  </p>
                )}
                {!isAdminMode && mode !== "signin" && (
                  <button onClick={() => setMode("signin")} className="text-primary font-medium hover:underline">
                    ← Back to sign in
                  </button>
                )}
                <button onClick={() => setIsAdminMode(!isAdminMode)} className="text-primary font-medium hover:underline">
                  {isAdminMode ? "Sign in as Trainer" : "Sign in as Admin"}
                </button>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Logo is white-on-transparent, so it sits in a navy chip */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/70">Backed by</p>
          <div className="rounded-xl px-4 py-2" style={{ background: "#1E3A5F" }}>
            <img src={razorpayRizeLogo} alt="Razorpay Rize" className="h-5 w-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
