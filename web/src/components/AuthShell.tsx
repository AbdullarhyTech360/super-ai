import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Mic, Palette, Sparkles } from 'lucide-react';
import AppLogo from './AppLogo';
import ThemeToggle from './ThemeToggle';

interface AuthShellProps {
  headline: string;
  subheadline: string;
  children: ReactNode;
}

const AuthShell = ({ headline, subheadline, children }: AuthShellProps) => {
  const bullets = [
    { icon: <Sparkles className="w-4 h-4" />, text: 'Chat smarter with AI that understands you' },
    { icon: <Mic className="w-4 h-4" />, text: 'Talk instead of type with voice input' },
    { icon: <Palette className="w-4 h-4" />, text: 'Style your chat with 8 unique themes' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Branding panel */}
      <aside className="hidden lg:flex relative w-1/2 overflow-hidden flex-col justify-between p-12"
             style={{ background: 'var(--gradient-primary)' }}>
        <div aria-hidden className="absolute inset-0 bg-black/25 pointer-events-none" />
        <div
          aria-hidden
          className="hero-orb w-[28rem] h-[28rem] -top-32 -right-32 opacity-40 animate-float"
          style={{ background: 'radial-gradient(circle at center, hsl(0 0% 100% / 0.45), transparent 60%)' }}
        />
        <div
          aria-hidden
          className="hero-orb w-80 h-80 -bottom-24 -left-20 opacity-30 animate-float"
          style={{ background: 'radial-gradient(circle at center, hsl(260 85% 65% / 0.6), transparent 60%)', animationDelay: '3s', animationDuration: '16s' }}
        />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2.5 text-2xl font-bold text-white">
            <AppLogo size={40} />
            Super AI
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold text-white mb-4">{headline}</h1>
          <p className="text-lg text-white/80 mb-8">{subheadline}</p>
          <ul className="space-y-4">
            {bullets.map((bullet, index) => (
              <li key={index} className="flex items-center gap-3 text-white/90">
                <span className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  {bullet.icon}
                </span>
                {bullet.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-sm text-white/70">
          <Check className="w-4 h-4" />
          Trusted by developers & creators
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Mobile brand header */}
        <div className="lg:hidden text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
            <AppLogo size={40} />
            Super AI
          </Link>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
};

export default AuthShell;