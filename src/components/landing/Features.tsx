import { 
  Upload, 
  FileSearch, 
  BarChart3, 
  Users, 
  FileText, 
  Shield,
  Building2,
  AlertTriangle,
  CheckCircle
} from "lucide-react";

const features = [
  {
    icon: Building2,
    title: "Site & Device Inventory",
    description: "Manage multiple sites with complete device inventories. Track loops, addresses, zones, and device locations across all manufacturers."
  },
  {
    icon: Upload,
    title: "Smart File Parsing",
    description: "Upload CSV, PDF, or TXT files from any fire panel. Our parser automatically extracts and structures device test data."
  },
  {
    icon: FileSearch,
    title: "Device Reconciliation",
    description: "Automatically match tested devices against master inventory. Identify coverage gaps and exceptions instantly."
  },
  {
    icon: BarChart3,
    title: "Compliance Dashboards",
    description: "Real-time visibility into compliance status across all sites. Track visit schedules and coverage percentages."
  },
  {
    icon: AlertTriangle,
    title: "Exception Tracking",
    description: "Flag and monitor issues, faults, and untested devices. Create action items and track resolution progress."
  },
  {
    icon: FileText,
    title: "Visit Pack Generation",
    description: "Generate professional PDF visit packs with all evidence, test results, and compliance summaries ready for clients."
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Secure multi-tenant access for Engineers, Admins, Clients, and Auditors. Each role sees exactly what they need."
  },
  {
    icon: Shield,
    title: "Audit Ready",
    description: "Complete audit trail of all actions. Clients and auditors get read-only portal access to verify compliance."
  },
];

const Features = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="text-accent font-semibold text-sm uppercase tracking-wider mb-4 block">
            Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything You Need for Fire Alarm Compliance
          </h2>
          <p className="text-lg text-muted-foreground">
            From device uploads to client portals, our platform handles the entire 
            fire alarm servicing workflow.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="group p-6 bg-card rounded-xl border border-border hover:border-accent/30 hover:shadow-lg transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-muted border border-border">
            <CheckCircle className="w-5 h-5 text-success" />
            <span className="text-foreground font-medium">
              Supports all major UK fire panel manufacturers
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
