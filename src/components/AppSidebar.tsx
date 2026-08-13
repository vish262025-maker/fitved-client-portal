import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarOff, CreditCard, FileHeart, UserCircle2, Users, Dumbbell, Building2, Gauge, Package, Megaphone, Gift, ShieldCheck, Inbox } from "lucide-react";
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
import { usePlansTabVisible } from "@/hooks/usePlansTabVisible";

const clientItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pause Classes", url: "/pause", icon: CalendarOff },
  { title: "Plan", url: "/plan", icon: CreditCard },
  { title: "Health Report", url: "/health", icon: FileHeart },
  { title: "Profile", url: "/profile", icon: UserCircle2 },
];

const trainerItems = [
  { title: "Dashboard", url: "/trainer", icon: LayoutDashboard },
  { title: "Refer & Earn", url: "/trainer/referrals", icon: Gift },
  { title: "Profile", url: "/profile", icon: UserCircle2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const { visible: plansTabVisible } = usePlansTabVisible();

  let items = role === "trainer" ? [...trainerItems] : [...clientItems];
  if (role === "admin") {
    items = [
      { title: "Overview", url: "/admin", icon: Gauge },
      { title: "Customers", url: "/admin/customers", icon: Users },
      { title: "Plans", url: "/admin/plans", icon: Package },
      { title: "Trainers", url: "/admin/trainers", icon: Dumbbell },
      { title: "Societies", url: "/admin/societies", icon: Building2 },
      { title: "Marketing", url: "/admin/marketing", icon: Megaphone },
      { title: "Referrals", url: "/admin/referrals", icon: Gift },
      { title: "Profile", url: "/profile", icon: UserCircle2 },
    ];
  } else if (role === "super_admin") {
    items = [
      { title: "Admins", url: "/super-admin", icon: ShieldCheck },
      { title: "Requests", url: "/super-admin/requests", icon: Inbox },
      { title: "Profile", url: "/profile", icon: UserCircle2 },
    ];
  } else if (role === "client" && !plansTabVisible) {
    // Admin can hide the Plan tab per customer (default hidden for new users).
    items = items.filter((i) => i.url !== "/plan");
  }

  const isActive = (path: string) =>
    (path === "/dashboard" || path === "/trainer" || path === "/admin" || path === "/super-admin")
      ? pathname === path
      : pathname.startsWith(path);

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
