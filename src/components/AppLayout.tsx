import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, X } from "lucide-react";

function ImpersonationBanner() {
  const { impersonating, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  if (!impersonating) return null;
  const actorName = (() => { try { return localStorage.getItem("fitved_actor_name") || "this admin"; } catch { return "this admin"; } })();
  return (
    <div className="flex items-center justify-between gap-3 bg-fv-navy px-4 py-2 text-white text-sm">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        Viewing <strong>{actorName}</strong>'s dashboard as Super Admin
      </span>
      <button
        onClick={() => { exitImpersonation(); navigate("/super-admin"); }}
        className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25 transition-colors"
      >
        <X className="h-3.5 w-3.5" /> Exit to Super Admin
      </button>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-h-0">
          <ImpersonationBanner />
          <TopBar />
          {/* pb-24 gives clearance for the fixed bottom nav on mobile */}
          <main className="flex-1 overflow-auto pb-24 md:pb-0 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-6xl animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <MobileBottomNav />
    </SidebarProvider>
  );
}
