import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';

interface MFAEnrollProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function MFAEnroll({ onComplete, onSkip }: MFAEnrollProps) {
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    enrollFactor();
  }, []);

  const enrollFactor = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Fire Log Book Authenticator',
    });

    if (error) {
      toast({ variant: 'destructive', title: 'MFA Setup Failed', description: error.message });
      setIsLoading(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setIsLoading(false);
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) return;
    setIsVerifying(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast({ variant: 'destructive', title: 'Challenge failed', description: challengeError.message });
      setIsVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    setIsVerifying(false);
    if (verifyError) {
      toast({ variant: 'destructive', title: 'Verification failed', description: 'Invalid code. Please try again.' });
      setVerifyCode('');
      return;
    }

    toast({ title: 'Two-factor authentication enabled!', description: 'Your account is now more secure.' });
    onComplete();
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-muted-foreground">Setting up two-factor authentication...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Set up two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="p-4 bg-white rounded-xl">
          <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
        </div>
      </div>

      {/* Manual entry */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-center">Or enter this code manually:</p>
        <div className="flex items-center gap-2 justify-center">
          <code className="px-3 py-2 bg-muted rounded-lg text-sm font-mono tracking-wider select-all">
            {secret}
          </code>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copySecret}>
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Verification */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-center text-foreground">Enter the 6-digit code from your app</p>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
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
          disabled={verifyCode.length !== 6 || isVerifying}
        >
          {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Verify & Enable 2FA
        </Button>
      </div>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
