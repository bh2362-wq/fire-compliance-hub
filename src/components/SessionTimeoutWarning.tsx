import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield } from 'lucide-react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

export function SessionTimeoutWarning() {
  const { showWarning, remainingSeconds, extendSession } = useSessionTimeout();

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            Session Expiring
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire in <strong>{remainingSeconds}</strong> seconds due to inactivity.
            Click below to continue working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={extendSession}>
            Continue Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
