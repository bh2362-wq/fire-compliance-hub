import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[90vh] gradient-hero overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* Accent glow */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />

      <div className="relative container mx-auto px-4 pt-32 pb-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent mb-8 animate-fade-in">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">UK Fire Safety Compliance Made Simple</span>
          </div>

          {/* Main heading */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6 animate-slide-up">
            Digital Fire Alarm{" "}
            <span className="text-gradient">Logbook</span>{" "}
            for Modern Engineers
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-primary-foreground/70 max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Streamline your fire alarm servicing with automated device reconciliation, 
            compliance tracking, and professional visit pack generation.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Button 
              variant="hero" 
              size="xl"
              onClick={() => navigate('/dashboard')}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button 
              variant="hero-outline" 
              size="xl"
              onClick={() => navigate('/dashboard')}
            >
              View Demo
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-6 text-primary-foreground/60 text-sm animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {[
              "Multi-manufacturer support",
              "BS 5839 compliant",
              "Instant PDF exports",
              "GDPR ready"
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="mt-20 max-w-5xl mx-auto animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="relative rounded-xl overflow-hidden shadow-2xl border border-primary-foreground/10">
            <div className="bg-card p-1">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted rounded-t-lg">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-background rounded text-xs text-muted-foreground">
                    app.firelogbook.co.uk/dashboard
                  </div>
                </div>
              </div>
              {/* Dashboard preview content */}
              <div className="bg-background p-6 min-h-[300px]">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Sites Active", value: "24", color: "text-foreground" },
                    { label: "Compliance Rate", value: "98.2%", color: "text-success" },
                    { label: "Pending Visits", value: "7", color: "text-warning" },
                  ].map((stat, i) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <div className="flex-1 h-3 bg-muted rounded" />
                      <div className="w-20 h-3 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
