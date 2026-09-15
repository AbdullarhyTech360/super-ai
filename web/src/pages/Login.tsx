import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Mail, Shield } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import PasswordInput from '@/components/PasswordInput';
import TitleUnderline from '@/components/TitleUnderline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const Login = () => {
  const { toast } = useToast();
  const { login } = useAuth();
  const navigate = useNavigate();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleComingSoon = (provider: string) => {
    toast({
      title: `${provider} sign in is coming soon`,
      description: `Use your email and password to sign in for now.`,
    });
  };

  const onSubmit = async (data: LoginFormData) => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: 'Login Failed',
          description: errorData.detail || 'Unable to login. Please try again later.',
        });
        return;
      }

      const result = await response.json();
      localStorage.setItem('access_token', result.access_token);
      toast({ title: 'Login Successful', description: 'Welcome back to Super AI!' });
      login();
      navigate('/chat');
    } catch (error) {
      console.error('Error during login:', error);
      toast({
        title: 'Login Failed',
        description: 'An error occurred while logging in. Please try again.',
      });
    }
  };

  return (
    <AuthShell
      headline="Welcome back"
      subheadline="Sign in to continue your conversations."
    >
      <div className="text-center mb-8">
        <div className="w-fit mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Sign In</h1>
          <TitleUnderline />
        </div>
        <p className="text-muted-foreground text-sm">
          Access your chats, themes, and saved conversations
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => handleComingSoon('Google')}
            className="w-full h-12 font-medium rounded-xl hover:border-[#4285f4] transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => handleComingSoon('Microsoft')}
            className="w-full h-12 font-medium rounded-xl hover:border-[#00A4EF] transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
              <path fill="#00A4EF" d="M12.5 1H23v10.5H12.5z" />
              <path fill="#7FBA00" d="M1 12.5h10.5V23H1z" />
              <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
            </svg>
            Microsoft
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="login-email">Email Address</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      id="login-email"
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <PasswordInput
                field={field}
                id="login-password"
                label="Password"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            )}
          />

          <div className="flex items-center justify-between text-sm">
            <Link
              to="/forgot-password"
              className="text-primary hover:text-primary/80 font-medium"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-primary-foreground font-semibold shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: 'var(--gradient-primary)' }}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />
        Your data is encrypted and secure
      </p>

      <div className="mt-6 text-center">
        <p className="text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary hover:text-primary/80 font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};

export default Login;