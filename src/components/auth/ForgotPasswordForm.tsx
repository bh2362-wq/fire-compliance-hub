import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function ForgotPasswordForm({ onSubmit, onBack, isSubmitting }: ForgotPasswordFormProps) {
  const [sent, setSent] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const handleSubmit = async (values: FormValues) => {
    await onSubmit(values.email);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
          <Mail className="w-6 h-6 text-success" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
          <p className="text-sm text-muted-foreground mt-1">
            We've sent a password reset link to your email address.
          </p>
        </div>
        <Button onClick={onBack} variant="outline" className="w-full h-11">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Reset password</h2>
        <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@company.com" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full h-11 gradient-accent text-accent-foreground font-semibold" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Send reset link
          </Button>
        </form>
      </Form>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </button>
    </div>
  );
}
