import { ReactNode, useState } from "react";
import { 
  Flame, 
  LayoutDashboard, 
  Building2, 
  ClipboardList, 
  Upload, 
  BarChart3, 
  Users, 
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Bell,
  GitCompare,
  Receipt,
  CalendarDays,
  Shield,
  FileCheck,
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  GraduationCap,
  Search,
  MessageSquare,
  TrendingUp,
  HardHat,
   Mail,
   Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
 import VisitFormDialog from "@/components/visits/VisitFormDialog";

interface DashboardLayoutProps {
  children: ReactNode;
}

const mainNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Schedule", href: "/dashboard/schedule", icon: CalendarDays },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Sites", href: "/sites", icon: Building2 },
  { name: "Visits", href: "/dashboard/visits", icon: ClipboardList },
  { name: "Invoices", href: "/dashboard/invoices", icon: Receipt },
  { name: "Uploads", href: "/dashboard/upload", icon: Upload },
  { name: "Reconciliation", href: "/dashboard/reconciliation", icon: GitCompare },
  { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Email Logs", href: "/dashboard/email-logs", icon: Mail },
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
];

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [qmsOpen, setQmsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  // Auto-expand QMS section if on a QMS route
  const isQmsRoute = location.pathname.startsWith('/qms');
  
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40 overflow-y-auto",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border sticky top-0 bg-sidebar z-10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center flex-shrink-0">
              <Flame className="w-5 h-5 text-accent-foreground" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-sidebar-foreground">
                FireLogbook
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <ChevronLeft className={cn(
              "w-4 h-4 transition-transform",
              collapsed && "rotate-180"
            )} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {/* Main Navigation */}
          {mainNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === "/dashboard"}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          ))}

          {/* QMS Section */}
          {!collapsed ? (
            <Collapsible open={qmsOpen || isQmsRoute} onOpenChange={setQmsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 flex-shrink-0" />
                  <span>QMS</span>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 transition-transform",
                  (qmsOpen || isQmsRoute) && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 space-y-1 mt-1">
                {qmsNavigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    end={item.href === "/qms"}
                    className={({ isActive }) => cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                      isActive 
                        ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <NavLink
              to="/qms"
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive || isQmsRoute
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Shield className="w-5 h-5 flex-shrink-0" />
            </NavLink>
          )}

          {/* Settings */}
          <NavLink
            to="/dashboard/settings"
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isActive 
                ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border">
          <div className={cn(
            "flex items-center gap-3 p-2 rounded-lg",
            collapsed ? "justify-center" : ""
          )}>
            <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-sidebar-foreground">{userInitials}</span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">Engineer</p>
              </div>
            )}
            {!collapsed && (
              <button 
                onClick={handleSignOut}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={cn(
        "flex-1 transition-all duration-300",
        collapsed ? "ml-16" : "ml-64"
      )}>
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Welcome back, {userName.split(' ')[0]}</h1>
            <p className="text-sm text-muted-foreground">Acme Fire Services Ltd</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            </button>
             <VisitFormDialog
               trigger={
                 <Button variant="hero" size="sm">
                   <Plus className="w-4 h-4 mr-2" />
                   New Visit
                 </Button>
               }
             />
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
