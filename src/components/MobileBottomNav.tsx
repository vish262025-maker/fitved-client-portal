import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CreditCard,
  FileHeart,
  CalendarOff,
  UserCircle2,
  Gauge,
  Users,
  Dumbbell,
  Package,
  Megaphone,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlansTabVisible } from "@/hooks/usePlansTabVisible";

const CLIENT_TABS = [
  { path: "/dashboard", Icon: LayoutDashboard, label: "Home" },
  { path: "/plan",      Icon: CreditCard,       label: "Plan" },
  { path: "/health",    Icon: FileHeart,         label: "Health" },
  { path: "/pause",     Icon: CalendarOff,       label: "Pause" },
  { path: "/profile",   Icon: UserCircle2,       label: "Profile" },
];

const TRAINER_TABS = [
  { path: "/trainer",  Icon: LayoutDashboard, label: "Home" },
  { path: "/profile",  Icon: UserCircle2,     label: "Profile" },
];

const ADMIN_TABS = [
  { path: "/admin",           Icon: Gauge,       label: "Overview" },
  { path: "/admin/customers", Icon: Users,       label: "Clients" },
  { path: "/admin/trainers",  Icon: Dumbbell,    label: "Trainers" },
  { path: "/admin/marketing", Icon: Megaphone,   label: "Marketing" },
  { path: "/profile",         Icon: UserCircle2, label: "Profile" },
];

const SUPER_ADMIN_TABS = [
  { path: "/super-admin",          Icon: ShieldCheck,  label: "Admins" },
  { path: "/super-admin/requests", Icon: Inbox,        label: "Requests" },
  { path: "/profile",              Icon: UserCircle2,  label: "Profile" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { visible: plansTabVisible } = usePlansTabVisible();

  let NAV_TABS = role === "trainer" ? TRAINER_TABS
    : role === "admin" ? ADMIN_TABS
    : role === "super_admin" ? SUPER_ADMIN_TABS
    : CLIENT_TABS;
  if (role === "client" && !plansTabVisible) {
    NAV_TABS = NAV_TABS.filter((t) => t.path !== "/plan");
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-center bg-white px-2"
      style={{
        height: "calc(64px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
        borderTop: "1px solid rgba(30,58,95,0.08)",
        boxShadow: "0 -4px 20px rgba(30,58,95,0.06)",
      }}
    >
      {NAV_TABS.map(({ path, Icon, label }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl border-none cursor-pointer transition-colors"
            style={{
              height: 48,
              background: active ? "rgba(30,58,95,0.06)" : "transparent",
            }}
          >
            <Icon
              size={20}
              color={active ? "#1E3A5F" : "#8a8f9e"}
              strokeWidth={active ? 2.2 : 1.75}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                color: active ? "#1E3A5F" : "#8a8f9e",
                fontFamily: "Outfit, sans-serif",
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
