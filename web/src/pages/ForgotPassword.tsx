import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, MailCheck, Shield } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import TitleUnderline from '@/components/TitleUnderline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

const ForgotPassword = () => {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: 'Request Failed',
          description: errorData.detail || 'Unable to send the reset link. Please try again later.',
        });
        return;
      }

      setEmailSent(true);
    } catch (error) {
      console.error('Error requesting password reset:', error);
      toast({
        title: 'Request Failed',
        description: 'An error occurred while requesting a reset. Please try again.',
      });
    }
  };

  return (
    <AuthShell
      headline="Reset your password"
      subheadline="We'll send you a secure link to set a new password."
    >
      <div className="text-center mb-8">
        <div className="w-fit mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Forgot Password</h1>
          <TitleUnderline />
        </div>
        <p className="text-muted-foreground text-sm">
          Enter your account email to receive a reset link
        </p>
      </div>

      {emailSent ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{form.getValues('email')}</span>, a reset link has been sent. The link expires in 30 minutes.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-block w-full h-12 leading-[3rem] text-primary-foreground font-semibold rounded-xl shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: 'var(--gradient-primary)' }}
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="forgot-email">Email Address</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="Enter your email"
                        autoComplete="email"
                        className="pl-11 h-12 rounded-xl bg-muted/40 border-border/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-12 text-primary-foreground font-semibold shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              style={{ background: 'var(--gradient-primary)' }}
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending link...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>
        </Form>
      )}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />
        Your data is encrypted and secure
      </p>

      <div className="mt-6 text-center">
        <p className="text-muted-foreground">
          Remembered your password?{' '}
          <Link to="/login" className="text-primary hover:text-primary/80 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};

export default ForgotPassword;