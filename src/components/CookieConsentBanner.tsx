import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({ essential: true, analytics: true, timestamp: new Date().toISOString() }));
    setVisible(false);
  };

  const essentialOnly = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({ essential: true, analytics: false, timestamp: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm p-4 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-1 sm:mt-0" />
        <p className="text-sm text-muted-foreground flex-1">
          We use essential cookies to keep you logged in and secure your session. Optional analytics cookies help us improve the platform.
          See our <a href="/privacy-policy" className="underline text-primary hover:text-primary/80">Privacy Policy</a>.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={essentialOnly}>Essential Only</Button>
          <Button size="sm" onClick={accept}>Accept All</Button>
        </div>
      </div>
    </div>
  );
}
