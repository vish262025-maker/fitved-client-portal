import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarOff, CreditCard, FileHeart, UserCircle2, Users, Dumbbell, Building2, Gauge, Package, Megaphone, Gift, ShieldCheck, Inbox, ArrowLeftRight, ClipboardList, Video } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { FitvedLogo } from "./FitvedLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useCanPauseClasses } from "@/hooks/useCanPauseClasses";

const clientItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pause Classes", url: "/pause", icon: CalendarOff },
  { title: "Plan", url: "/plan", icon: CreditCard },
  { title: "Health Report", url: "/health", icon: FileHeart },
  { title: "Profile", url: "/profile", icon: UserCircle2 },
];

const trainerItems = [
  { title: "Dashboard", url: "/trainer", icon: LayoutDashboard },
  { title: "Availability", url: "/trainer?tab=availability", icon: CalendarOff },
  { title: "Refer & Earn", url: "/trainer/referrals", icon: Gift },
  { title: "Profile", url: "/profile", icon: UserCircle2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname, search } = useLocation();
  const { role } = useAuth();
  const { canPause } = useCanPauseClasses();

  let items = role === "trainer" ? [...trainerItems] : [...clientItems];
  if (role === "admin") {
    items = [
      { title: "Overview", url: "/admin", icon: Gauge },
      { title: "Customers", url: "/admin/customers", icon: Users },
      { title: "Trainers", url: "/admin/trainers", icon: Dumbbell },
      { title: "Societies", url: "/admin/societies", icon: Building2 },
      { title: "Marketing", url: "/admin/marketing", icon: Megaphone },
      { title: "Referrals", url: "/admin/referrals", icon: Gift },
      { title: "Personal Bookings", url: "/admin/booking-requests", icon: ClipboardList },
      { title: "Online Customers", url: "/admin/online-customers", icon: Video },
      { title: "Mode Requests", url: "/admin/mode-requests", icon: ArrowLeftRight },
      { title: "Profile", url: "/profile", icon: UserCircle2 },
    ];
  } else if (role === "super_admin") {
    items = [
      { title: "Admins", url: "/super-admin", icon: ShieldCheck },
      { title: "Requests", url: "/super-admin/requests", icon: Inbox },
      { title: "Plans", url: "/super-admin/plans", icon: Package },
      { title: "Profile", url: "/profile", icon: UserCircle2 },
    ];
  } else if (role === "client") {
    // Pause is a group-training benefit — not offered online, and not to
    // one-to-one clients, whose reserved slot cannot simply be paused.
    if (!canPause) items = items.filter((i) => i.url !== "/pause");
  }

  // Some items differ only by query string (trainer Dashboard vs Availability),
  // so the search has to be part of the comparison or both would light up.
  const isActive = (path: string) => {
    const [p, q = ""] = path.split("?");
    if (q) return pathname === p && search.replace(/^\?/, "") === q;
    if (p === "/dashboard" || p === "/trainer" || p === "/admin" || p === "/super-admin") {
      return pathname === p && !search;
    }
    return pathname.startsWith(p);
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="px-3 py-4">
        <FitvedLogo showWord={!collapsed} />
        {!collapsed && (
          <p className="mt-1 pl-1 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/70">
            Fitness for grownups
          </p>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Your space</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard" || item.url === "/admin" || item.url === "/super-admin"}
                        className="flex items-center gap-3 rounded-lg transition-colors"
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="text-[15px]">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
