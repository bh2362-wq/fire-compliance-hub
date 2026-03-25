import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';

interface MFAVerifyProps {
  onComplete: () => void;
  onCancel: () => void;
}

export default function MFAVerify({ onComplete, onCancel }: MFAVerifyProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setIsVerifying(true);

    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const totpFactor = factorsData?.totp?.[0];

    if (!totpFactor) {
      toast({ variant: 'destructive', title: 'Error', description: 'No authenticator found.' });
      setIsVerifying(false);
      return;
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });

    if (challengeError) {
      toast({ variant: 'destructive', title: 'Error', description: challengeError.message });
      setIsVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code,
    });

    setIsVerifying(false);

    if (verifyError) {
      toast({ variant: 'destructive', title: 'Invalid code', description: 'Please check your authenticator app and try again.' });
      setCode('');
      return;
    }

    onComplete();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button
        onClick={handleVerify}
        className="w-full h-11 gradient-accent text-accent-foreground font-semibold"
        disabled={code.length !== 6 || isVerifying}
      >
        {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Verify
      </Button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
