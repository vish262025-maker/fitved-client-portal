import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Standalone, unlinked Super Admin login. It is intentionally NOT surfaced on
// the main /login page — reach it only by its direct URL (/super-admin/login).
// A regular admin who logs in here is rejected and signed out; only Super Admin
// accounts are allowed through to the /super-admin dashboard.
export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { signInSuperAdmin } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password) {
      toast.error("Enter your phone and password");
      return;
    }
    setBusy(true);
    try {
      const { error } = await signInSuperAdmin(phone.trim(), password);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Welcome back, Super Admin!");
      navigate("/super-admin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-fv-neutral flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-3xl shadow-card p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-fv-orange">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Restricted</span>
          </div>
          <h1 className="font-display text-3xl text-foreground">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Sign in with your phone and password.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Phone number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11 bg-fv-navy hover:bg-fv-navy/90 text-white font-bold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
