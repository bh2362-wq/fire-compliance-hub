import { Flame } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary py-12 border-t border-primary-foreground/10">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
                <Flame className="w-5 h-5 text-accent-foreground" />
              </div>
              <span className="text-lg font-bold text-primary-foreground">
                FireLogbook
              </span>
            </div>
            <p className="text-sm text-primary-foreground/60">
              Digital fire alarm compliance for UK service engineers.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-primary-foreground mb-4">Product</h4>
            <ul className="space-y-2">
              {["Features", "Pricing", "Integrations", "API"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-primary-foreground mb-4">Company</h4>
            <ul className="space-y-2">
              {["About", "Blog", "Careers", "Contact"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-primary-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              {["Privacy Policy", "Terms of Service", "GDPR", "Cookie Policy"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/50">
            © {new Date().getFullYear()} FireLogbook Ltd. All rights reserved.
          </p>
          <p className="text-sm text-primary-foreground/50">
            Made in the UK 🇬🇧
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
