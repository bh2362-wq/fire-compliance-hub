import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Zap,
  CalendarPlus,
  FileText,
  Receipt,
  Users,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const quickActions = [
  { label: "New Visit", icon: CalendarPlus, path: "/dashboard/visits", color: "text-primary" },
  { label: "New Report", icon: FileText, path: "/dashboard/reports", color: "text-accent" },
  { label: "New Invoice", icon: Receipt, path: "/dashboard/invoices", color: "text-success" },
  { label: "New Site", icon: Building2, path: "/dashboard/sites", color: "text-warning" },
  { label: "New Customer", icon: Users, path: "/dashboard/customers", color: "text-purple-500" },
];

const FloatingActionButton = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Only show on dashboard routes
  if (!location.pathname.startsWith("/dashboard")) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 lg:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="lg"
            className={cn(
              "w-14 h-14 rounded-full shadow-lg transition-all duration-200",
              "bg-accent hover:bg-accent/90 text-accent-foreground",
              open && "rotate-45"
            )}
          >
            {open ? <X className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-48 p-2"
          sideOffset={8}
        >
          <div className="space-y-1">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  navigate(action.path);
                }}
              >
                <action.icon className={cn("w-4 h-4 mr-2", action.color)} />
                {action.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default FloatingActionButton;
