import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Shield } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import PasswordInput from '@/components/PasswordInput';
import TitleUnderline from '@/components/TitleUnderline';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import Seo from '@/components/Seo';

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

const ResetPassword = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: data.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: 'Reset Failed',
          description: errorData.detail || 'Unable to reset your password. Please try again.',
        });
        return;
      }

      toast({
        title: 'Password Reset',
        description: 'Your password has been reset successfully. Please sign in.',
      });
      navigate('/login');
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Reset Failed',
        description: 'An error occurred while resetting your password. Please try again.',
      });
    }
  };

  return (
    <>
      <Seo />
      <AuthShell
        headline="Create a new password"
        subheadline="Choose a strong password you haven't used before."
      >
      <div className="text-center mb-8">
        <div className="w-fit mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
          <TitleUnderline />
        </div>
        <p className="text-muted-foreground text-sm">
          Set a new password for your account
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <PasswordInput
                field={field}
                id="reset-password"
                label="New Password"
                placeholder="Enter a new password"
                autoComplete="new-password"
              />
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <PasswordInput
                field={field}
                id="reset-confirm-password"
                label="Confirm Password"
                placeholder="Confirm your new password"
                autoComplete="new-password"
              />
            )}
          />

          <Button
            type="submit"
            className="w-full h-12 text-primary-foreground font-semibold shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: 'var(--gradient-primary)' }}
            disabled={form.formState.isSubmitting || !token}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resetting password...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </form>
      </Form>

      {!token && (
        <p className="mt-4 text-center text-sm text-destructive">
          Missing or invalid reset link. Please request a new one.
        </p>
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
    </>
  );
};

export default ResetPassword;