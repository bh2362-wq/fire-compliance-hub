import { ReactNode, useState, useEffect } from "react";
import { 
  Flame, LayoutDashboard, Building2, ClipboardList, Upload, BarChart3, Users, Settings,
  LogOut, ChevronLeft, ChevronDown, Bell, GitCompare, Receipt, CalendarDays, Shield,
  FileCheck, AlertTriangle, ClipboardCheck, ShieldAlert, GraduationCap, Search,
  MessageSquare, TrendingUp, HardHat, Mail, Plus, CreditCard, FileSpreadsheet,
  ShoppingCart, ScanSearch, Package, Menu, X, FileSignature, Route
} from "lucide-react";
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

const coreNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Schedule", href: "/dashboard/schedule", icon: CalendarDays },
  { name: "Visits", href: "/dashboard/visits", icon: ClipboardList },
  { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Uploads", href: "/dashboard/upload", icon: Upload },
];

const customersNavigation = [
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Sites", href: "/sites", icon: Building2 },
  { name: "Email Logs", href: "/dashboard/email-logs", icon: Mail },
];

const financeNavigation = [
  { name: "Invoices", href: "/dashboard/invoices", icon: Receipt },
  { name: "Quotations", href: "/dashboard/quotations", icon: FileSpreadsheet },
  { name: "Credit Control", href: "/dashboard/credit-control", icon: CreditCard },
  { name: "Purchase Orders", href: "/dashboard/purchase-orders", icon: ShoppingCart },
  { name: "Reconciliation", href: "/dashboard/reconciliation", icon: GitCompare },
];

const toolsNavigation = [
  { name: "Route Planner", href: "/dashboard/route-planner", icon: Route },
  { name: "Email Scanner", href: "/dashboard/email-scanner", icon: ScanSearch },
  { name: "Device Pricing", href: "/dashboard/device-pricing", icon: Package },
  { name: "Product Lookup", href: "/dashboard/product-lookup", icon: Search },
  { name: "Customer Forms", href: "/dashboard/customer-forms", icon: FileSignature },
];

const qmsNavigation = [
  { name: "QMS Dashboard", href: "/qms", icon: TrendingUp },
  { name: "Documents", href: "/qms/documents", icon: FileCheck },
  { name: "NCRs", href: "/qms/ncrs", icon: AlertTriangle },
  { name: "CAPAs", href: "/qms/capas", icon: ClipboardCheck },
  { name: "Risks", href: "/qms/risks", icon: ShieldAlert },
  { name: "RAMS", href: "/qms/rams", icon: HardHat },
  { name: "Training", href: "/qms/training", icon: GraduationCap },
  { name: "Audits", href: "/qms/audits", icon: Search },
  { name: "Feedback", href: "/qms/feedback", icon: MessageSquare },
  { name: "Mgmt Review", href: "/qms/management-review", icon: BarChart3 },
  { name: "Suppliers", href: "/qms/supplier-evaluations", icon: Package },
];

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [qmsOpen, setQmsOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isQmsRoute = location.pathname.startsWith('/qms');
  const isCustomersRoute = ['/customers', '/sites', '/dashboard/email-logs'].some(p => location.pathname.startsWith(p));
  const isFinanceRoute = ['/dashboard/invoices', '/dashboard/quotations', '/dashboard/credit-control', '/dashboard/purchase-orders', '/dashboard/reconciliation'].some(p => location.pathname.startsWith(p));
  const isToolsRoute = ['/dashboard/email-scanner', '/dashboard/device-pricing', '/dashboard/product-lookup'].some(p => location.pathname.startsWith(p));
  
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const sidebarVisible = isMobile ? mobileOpen : true;
  const sidebarWidth = isMobile ? "w-72" : (collapsed ? "w-16" : "w-64");

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border sticky top-0 bg-sidebar z-10">
        <div className="flex items-center gap-2">
          <img src="/bho-fire-logo.png" alt="BHO Fire Logo" className="h-9 w-auto object-contain flex-shrink-0" />
          {(!collapsed || isMobile) && (
            <span className="text-lg font-bold text-sidebar-foreground">FireLogbook</span>
          )}
        </div>
        {isMobile ? (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Navigation - categorized */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Core */}
        {coreNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === "/dashboard"}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isMobile) && <span>{item.name}</span>}
          </NavLink>
        ))}

        {/* Customers & Sites */}
        {(!collapsed || isMobile) ? (
          <Collapsible open={customersOpen || isCustomersRoute} onOpenChange={setCustomersOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 flex-shrink-0" />
                <span>Customers</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", (customersOpen || isCustomersRoute) && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 space-y-1 mt-1">
              {customersNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <NavLink to="/customers" className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive || isCustomersRoute ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}>
            <Users className="w-5 h-5 flex-shrink-0" />
          </NavLink>
        )}

        {/* Finance */}
        {(!collapsed || isMobile) ? (
          <Collapsible open={financeOpen || isFinanceRoute} onOpenChange={setFinanceOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
              <div className="flex items-center gap-3">
                <Receipt className="w-5 h-5 flex-shrink-0" />
                <span>Finance</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", (financeOpen || isFinanceRoute) && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 space-y-1 mt-1">
              {financeNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <NavLink to="/dashboard/invoices" className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive || isFinanceRoute ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}>
            <Receipt className="w-5 h-5 flex-shrink-0" />
          </NavLink>
        )}

        {/* Tools */}
        {(!collapsed || isMobile) ? (
          <Collapsible open={toolsOpen || isToolsRoute} onOpenChange={setToolsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
              <div className="flex items-center gap-3">
                <Search className="w-5 h-5 flex-shrink-0" />
                <span>Tools</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", (toolsOpen || isToolsRoute) && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 space-y-1 mt-1">
              {toolsNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <NavLink to="/dashboard/email-scanner" className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive || isToolsRoute ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}>
            <Search className="w-5 h-5 flex-shrink-0" />
          </NavLink>
        )}

        {/* QMS Section */}
        {(!collapsed || isMobile) ? (
          <Collapsible open={qmsOpen || isQmsRoute} onOpenChange={setQmsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 flex-shrink-0" />
                <span>QMS</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", (qmsOpen || isQmsRoute) && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 space-y-1 mt-1">
              {qmsNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === "/qms"}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <NavLink to="/qms" className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive || isQmsRoute ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}>
            <Shield className="w-5 h-5 flex-shrink-0" />
          </NavLink>
        )}

        {/* Settings */}
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || isMobile) && <span>Settings</span>}
        </NavLink>
      </nav>

      {/* User section */}
      <div className="shrink-0 p-3 border-t border-sidebar-border bg-sidebar">
        <div className={cn("flex items-center gap-3 p-2 rounded-lg", (collapsed && !isMobile) ? "justify-center" : "")}>
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-sidebar-foreground">{userInitials}</span>
          </div>
          {(!collapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">Engineer</p>
            </div>
          )}
          {(!collapsed || isMobile) && (
            <button onClick={handleSignOut} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 overflow-y-auto transition-transform duration-300",
        sidebarWidth,
        isMobile && !mobileOpen && "-translate-x-full",
        isMobile && mobileOpen && "translate-x-0"
      )}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className={cn(
        "flex-1 flex flex-col transition-all duration-300 h-screen overflow-hidden",
        isMobile ? "ml-0" : (collapsed ? "ml-16" : "ml-64")
      )}>
        {/* Top bar */}
        <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 shrink-0 z-30">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
              {isMobile ? "FireLogbook" : `Welcome back, ${userName.split(' ')[0]}`}
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <GlobalSearch />
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            </button>
            <VisitFormDialog
              trigger={
                <Button variant="hero" size="sm" className="hidden sm:flex">
                  <Plus className="w-4 h-4 mr-2" />
                  New Visit
                </Button>
              }
            />
            {isMobile && (
              <VisitFormDialog
                trigger={
                  <Button variant="hero" size="icon" className="h-9 w-9 sm:hidden">
                    <Plus className="w-4 h-4" />
                  </Button>
                }
              />
            )}
          </div>
        </header>

        {/* Page content - scrollable */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6">
          {children}
        </div>

        {/* Mobile floating action button */}
        <FloatingActionButton />
      </main>
    </div>
  );
};

export default DashboardLayout;
