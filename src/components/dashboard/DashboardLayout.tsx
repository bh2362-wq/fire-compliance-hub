import { ReactNode, useState, useEffect } from "react";
import {
  Flame, LayoutDashboard, Building2, ClipboardList, Upload, BarChart3,
  Users, Settings, LogOut, ChevronLeft, ChevronDown, Bell, GitCompare,
  Receipt, CalendarDays, Shield, FileCheck, AlertTriangle, ClipboardCheck,
  ShieldAlert, GraduationCap, Search, MessageSquare, TrendingUp, HardHat,
  Mail, Plus, CreditCard, FileSpreadsheet, ShoppingCart, ScanSearch,
  Package, Menu, X, FileSignature, Route, Award, ExternalLink, Zap, Sparkles, BookOpen, Wrench, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

async function clearAppCacheAndReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    try { sessionStorage.clear(); } catch {}
    toast.success("Cache cleared — reloading…");
  } catch (e) {
    console.warn("Cache clear failed", e);
  } finally {
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("_r", Date.now().toString());
      window.location.replace(url.toString());
    }, 250);
  }
}
import { Button } from "@/components/ui/button";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import VisitFormDialog from "@/components/visits/VisitFormDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import FloatingActionButton from "@/components/dashboard/FloatingActionButton";

interface DashboardLayoutProps {
  children: ReactNode;
}

/* ── Navigation definitions ─────────────────────────────────────────── */
const coreNav = [
  { name: "Dashboard",  href: "/dashboard",           icon: LayoutDashboard, end: true },
  { name: "Visits",     href: "/dashboard/visits",    icon: ClipboardList },
  { name: "Asset Maintenance", href: "/dashboard/asset-maintenance", icon: Wrench },
  { name: "Reports",    href: "/dashboard/reports",   icon: BarChart3 },
  { name: "Defects",    href: "/dashboard/defects",   icon: ShieldAlert },
];

const clientsNav = [
  { name: "Customers",  href: "/customers",              icon: Users },
  { name: "Sites",      href: "/sites",                  icon: Building2 },
  { name: "Email Logs", href: "/dashboard/email-logs",   icon: Mail },
];

// Certificates section — top-level items, not buried in Tools
const certsNav = [
  { name: "Smart Forms",  href: "/dashboard/smart-forms",   icon: Sparkles },
  { name: "Cert Tracker", href: "/dashboard/cert-tracker",  icon: Award },
  { name: "References",   href: "/dashboard/reference",     icon: BookOpen },
];

const financeNav = [
  { name: "Invoices",        href: "/dashboard/invoices",        icon: Receipt },
  { name: "Quotations",      href: "/dashboard/quotations",      icon: FileSpreadsheet },
  { name: "Credit Control",  href: "/dashboard/credit-control",  icon: CreditCard },
  { name: "Purchase Orders", href: "/dashboard/purchase-orders", icon: ShoppingCart },
  { name: "Reconciliation",  href: "/dashboard/reconciliation",  icon: GitCompare },
];

const toolsNav = [
  { name: "Route Planner",   href: "/dashboard/route-planner",   icon: Route },
  { name: "Email Scanner",   href: "/dashboard/email-scanner",    icon: ScanSearch },
  { name: "Device Pricing",  href: "/dashboard/device-pricing",   icon: Package },
  { name: "Product Lookup",  href: "/dashboard/product-lookup",   icon: Search },
  { name: "Customer Forms",  href: "/dashboard/customer-forms",   icon: FileSignature },
  { name: "AI Assistant",    href: "/dashboard/ai-assistant",     icon: Sparkles },
];

const qmsNav = [
  { name: "QMS Dashboard",   href: "/qms",                         icon: TrendingUp, end: true },
  { name: "Documents",       href: "/qms/documents",               icon: FileCheck },
  { name: "NCRs",            href: "/qms/ncrs",                    icon: AlertTriangle },
  { name: "CAPAs",           href: "/qms/capas",                   icon: ClipboardCheck },
  { name: "Risks",           href: "/qms/risks",                   icon: ShieldAlert },
  { name: "RAMS",            href: "/qms/rams",                    icon: HardHat },
  { name: "Training",        href: "/qms/training",                icon: GraduationCap },
  { name: "Audits",          href: "/qms/audits",                  icon: Search },
  { name: "Feedback",        href: "/qms/feedback",                icon: MessageSquare },
  { name: "Mgmt Review",     href: "/qms/management-review",       icon: BarChart3 },
  { name: "Suppliers",       href: "/qms/supplier-evaluations",    icon: Package },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */
const NavItem = ({
  item,
  collapsed,
  isMobile,
  sub = false,
}: {
  item: typeof coreNav[0];
  collapsed: boolean;
  isMobile: boolean;
  sub?: boolean;
}) => (
  <NavLink
    to={item.href}
    end={(item as any).end}
    className={({ isActive }) =>
      cn(
        "relative flex items-center gap-3 rounded-md text-sm font-medium transition-all duration-150 group",
        sub ? "px-3 py-1.5" : "px-3 py-2",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/55 hover:text-sidebar-foreground/90 hover:bg-sidebar-accent/60"
      )
    }
  >
    {({ isActive }) => (
      <>
        {isActive && !sub && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />
        )}
        <item.icon
          className={cn("flex-shrink-0", sub ? "w-4 h-4" : "w-[17px] h-[17px]")}
        />
        {(!collapsed || isMobile) && <span>{item.name}</span>}
      </>
    )}
  </NavLink>
);

const SectionLabel = ({
  label,
  collapsed,
  isMobile,
}: {
  label: string;
  collapsed: boolean;
  isMobile: boolean;
}) =>
  !collapsed || isMobile ? (
    <p className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/30 select-none">{label}</p>
  ) : (
    <div className="my-3 mx-3 border-t border-sidebar-border/50" />
  );

const CollapsibleNav = ({
  label,
  icon: Icon,
  items,
  isActive,
  collapsed,
  isMobile,
}: {
  label: string;
  icon: React.ElementType;
  items: typeof coreNav;
  isActive: boolean;
  collapsed: boolean;
  isMobile: boolean;
}) => {
  const [open, setOpen] = useState(isActive);

  if (collapsed && !isMobile) {
    return (
      <NavLink
        to={items[0].href}
        className={cn(
          "flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <Icon className="w-[18px] h-[18px]" />
      </NavLink>
    );
  }

  return (
    <Collapsible open={open || isActive} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
        <div className="flex items-center gap-3">
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{label}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-200",
            (open || isActive) && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-3 pt-0.5 space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.name} item={item} collapsed={false} isMobile={isMobile} sub />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

/* ── Main Layout ─────────────────────────────────────────────────────── */
const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isClientsRoute = ["/customers", "/sites", "/dashboard/email-logs"].some((p) =>
    location.pathname.startsWith(p)
  );
  const isFinanceRoute = [
    "/dashboard/invoices", "/dashboard/quotations", "/dashboard/credit-control",
    "/dashboard/purchase-orders", "/dashboard/reconciliation",
  ].some((p) => location.pathname.startsWith(p));
  const isToolsRoute = [
    "/dashboard/email-scanner", "/dashboard/device-pricing",
    "/dashboard/product-lookup", "/dashboard/customer-forms", "/dashboard/route-planner",
    "/dashboard/smart-forms", "/dashboard/ai-assistant", "/dashboard/reference",
  ].some((p) => location.pathname.startsWith(p));
  const isQmsRoute = location.pathname.startsWith("/qms");
  const isCertRoute = ["/dashboard/cert-tracker", "/dashboard/smart-forms", "/dashboard/reference"].some((p) =>
    location.pathname.startsWith(p)
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const sidebarWidth = isMobile ? "w-72" : collapsed ? "w-16" : "w-64";

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* ── Logo ── */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border sticky top-0 bg-[hsl(var(--sidebar-background))] z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-glow">
            <Flame className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          {(!collapsed || isMobile) && (
            <div>
              <span className="text-[15px] font-bold text-sidebar-foreground leading-none">
                FireLogbook
              </span>
              <p className="text-[10px] text-sidebar-foreground/30 leading-none mt-0.5">
                BHO Fire Ltd
              </p>
            </div>
          )}
        </div>
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
          >
            <ChevronLeft
              className={cn("w-4 h-4 transition-transform duration-200", collapsed && "rotate-180")}
            />
          </button>
        )}
      </div>

      {/* ── Search hint ── */}
      {(!collapsed || isMobile) && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/60 border border-sidebar-border/60 text-sidebar-foreground/30 text-xs cursor-pointer hover:bg-sidebar-accent transition-colors">
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Search... ⌘K</span>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
        {/* Operations */}
        <SectionLabel label="Operations" collapsed={collapsed} isMobile={isMobile} />
        {coreNav.map((item) => (
          <NavItem key={item.name} item={item} collapsed={collapsed} isMobile={isMobile} />
        ))}

        {/* Clients */}
        <SectionLabel label="Clients" collapsed={collapsed} isMobile={isMobile} />
        <CollapsibleNav
          label="Clients & Sites"
          icon={Users}
          items={clientsNav}
          isActive={isClientsRoute}
          collapsed={collapsed}
          isMobile={isMobile}
        />

        {/* Certificates */}
        <SectionLabel label="Certificates" collapsed={collapsed} isMobile={isMobile} />
        {certsNav.map((item) => (
          <NavItem key={item.name} item={item} collapsed={collapsed} isMobile={isMobile} />
        ))}

        {/* Finance & QMS */}
        <SectionLabel label="Finance & QMS" collapsed={collapsed} isMobile={isMobile} />
        <CollapsibleNav
          label="Finance"
          icon={Receipt}
          items={financeNav}
          isActive={isFinanceRoute}
          collapsed={collapsed}
          isMobile={isMobile}
        />
        <CollapsibleNav
          label="QMS & RAMS"
          icon={Shield}
          items={qmsNav}
          isActive={isQmsRoute}
          collapsed={collapsed}
          isMobile={isMobile}
        />
        <CollapsibleNav
          label="Tools"
          icon={Zap}
          items={toolsNav}
          isActive={isToolsRoute}
          collapsed={collapsed}
          isMobile={isMobile}
        />

        {/* Settings */}
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            )
          }
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0" />
          {(!collapsed || isMobile) && <span>Settings</span>}
        </NavLink>
      </nav>

      {/* ── User ── */}
      <div className="shrink-0 p-3 border-t border-sidebar-border">
        <div
          className={cn(
            "flex items-center gap-3 p-2 rounded-lg",
            collapsed && !isMobile ? "justify-center" : ""
          )}
        >
          <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">{userInitials}</span>
          </div>
          {(!collapsed || isMobile) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">{userName}</p>
                <p className="text-[10px] text-sidebar-foreground/40 truncate">Director · DV Cleared</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen border-r border-sidebar-border z-50 overflow-y-auto transition-all duration-300",
          "bg-[hsl(var(--sidebar-background))]",
          sidebarWidth,
          isMobile && !mobileOpen && "-translate-x-full",
          isMobile && mobileOpen && "translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 h-screen overflow-hidden",
          isMobile ? "ml-0" : collapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* Top bar */}
        <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 shrink-0 z-30">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <span className="text-base md:text-[15px] font-semibold text-foreground truncate">
              {isMobile ? "FireLogbook" : `Welcome back, ${userName.split(" ")[0]}`}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <GlobalSearch />

            <button
              onClick={clearAppCacheAndReload}
              title="Refresh app (clear cache)"
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            {/* Notification bell */}
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>

            {/* New Visit button */}
            <VisitFormDialog
              trigger={
                <Button
                  className="hidden sm:flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md text-sm font-semibold h-9 px-4"
                >
                  <Plus className="w-4 h-4" />
                  New Visit
                </Button>
              }
            />
            {isMobile && (
              <VisitFormDialog
                trigger={
                  <Button
                    size="icon"
                    className="h-9 w-9 sm:hidden bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                }
              />
            )}
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          {children}
        </div>

        <FloatingActionButton />
      </main>
    </div>
  );
};

export default DashboardLayout;
