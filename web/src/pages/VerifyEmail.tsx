import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, MailCheck, MailX, RefreshCw, Shield } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import TitleUnderline from '@/components/TitleUnderline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';

type VerifyStatus = 'verifying' | 'success' | 'error';

const VerifyEmail = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState('Invalid or expired verification link.');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    let active = true;

    const verify = async () => {
      if (!token) {
        setErrorMessage('Missing verification token. Please use the link from your email.');
        setStatus('error');
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        if (!active) return;

        if (!response.ok) {
          const errorData = await response.json();
          setErrorMessage(errorData.detail || 'Unable to verify your email. The link may have expired.');
          setStatus('error');
          return;
        }

        setStatus('success');
      } catch (error) {
        console.error('Error verifying email:', error);
        if (!active) return;
        setErrorMessage('An error occurred while verifying your email. Please try again.');
        setStatus('error');
      }
    };

    verify();

    return () => {
      active = false;
    };
  }, [token]);

  const handleResend = async (event: FormEvent) => {
    event.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resendEmail }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: 'Resend Failed',
          description: errorData.detail || 'Unable to resend the confirmation link. Please try again.',
        });
        return;
      }

      setResendSent(true);
      toast({
        title: 'Confirmation Sent',
        description: `A new confirmation link has been sent to ${resendEmail}.`,
      });
    } catch (error) {
      console.error('Error resending verification:', error);
      toast({
        title: 'Resend Failed',
        description: 'An error occurred while resending the link. Please try again.',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      headline="Confirm your email"
      subheadline="Activate your account to start using Super AI."
    >
      <div className="text-center mb-8">
        <div className="w-fit mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Email Verification</h1>
          <TitleUnderline />
        </div>
      </div>

      {status === 'verifying' && (
        <div className="space-y-5 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Verifying your email address...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-5 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Email confirmed</h2>
            <p className="text-sm text-muted-foreground">
              Your email address has been verified. You can now sign in and start chatting.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-block w-full h-12 leading-[3rem] text-primary-foreground font-semibold rounded-xl shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: 'var(--gradient-primary)' }}
          >
            Sign In
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-5 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <MailX className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Verification failed</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>

          {resendSent ? (
            <p className="text-sm text-muted-foreground">
              A new confirmation link has been sent. Check your inbox before trying to sign in.
            </p>
          ) : (
            <form onSubmit={handleResend} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="pl-11 h-12 rounded-xl bg-muted/40 border-border/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-primary-foreground font-semibold shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                style={{ background: 'var(--gradient-primary)' }}
                disabled={resending}
              >
                {resending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Resending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resend confirmation link
                  </>
                )}
              </Button>
            </form>
          )}

          <Link
            to="/login"
            className="inline-block text-sm text-primary hover:text-primary/80 font-medium"
          >
            Back to Sign In
          </Link>
        </div>
      )}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5" />
        Your data is encrypted and secure
      </p>
    </AuthShell>
  );
};

export default VerifyEmail;