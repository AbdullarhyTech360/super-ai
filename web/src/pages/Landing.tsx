import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  MessageCircle,
  MessageCircleQuestion,
  Mic,
  Palette,
  Shield,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/Navbar';
import AppLogo from '@/components/AppLogo';
import AiBanner from '@/components/AiBanner';
import MarkdownMessage from '@/components/MarkdownMessage';
import Seo from '@/components/Seo';
import { softwareJsonLd, websiteJsonLd } from '@/seo/routes';
import { useAuth } from '@/hooks/useAuth';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleStartChatting = () => {
    if (isAuthenticated) {
      navigate('/chat');
    } else {
      navigate('/signup');
    }
  };

  const features = [
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "AI-Powered Conversations",
      description: "Intelligent chat that understands context and gives meaningful, human-quality answers."
    },
    {
      icon: <Mic className="w-6 h-6" />,
      title: "Voice Input",
      description: "Type it or say it — speak a message and let the AI respond in real time."
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Files & Markdown",
      description: "Attach docs and images, and get beautifully formatted code, math, and tables back."
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Secure & Private",
      description: "Your conversations stay protected with secure authentication and careful data handling."
    },
    {
      icon: <Palette className="w-6 h-6" />,
      title: "8 Chat Themes",
      description: "Aurora, Ocean, Midnight and more — style your chat to match your mood."
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Streamed responses appear word-by-word, with multi-device sync built in."
    }
  ];

  const steps = [
    {
      icon: <MessageCircleQuestion className="w-6 h-6" />,
      title: "Ask anything",
      description: "Type a question, paste a prompt, or use voice input to kick off a conversation."
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Get instant answers",
      description: "Watch responses stream in with clean markdown, code blocks, and math."
    },
    {
      icon: <WandSparkles className="w-6 h-6" />,
      title: "Do more, faster",
      description: "Attach files, switch themes, and keep every chat organized in one place."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo jsonLd={[softwareJsonLd, websiteJsonLd]} />
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 px-4 bg-gradient-to-b from-background via-muted/20 to-background">
        <div
          aria-hidden
          className="hero-orb w-[42rem] h-[42rem] -top-40 -left-40 opacity-40 animate-float"
          style={{ background: 'radial-gradient(circle at center, hsl(220 91% 58% / 0.45), transparent 60%)' }}
        />
        <div
          aria-hidden
          className="hero-orb w-[36rem] h-[36rem] top-0 right-[-10rem] opacity-30 animate-float"
          style={{ background: 'radial-gradient(circle at center, hsl(260 85% 65% / 0.4), transparent 60%)', animationDuration: '14s' }}
        />
        <div
          aria-hidden
          className="hero-orb w-[30rem] h-[30rem] -bottom-24 left-1/3 opacity-25 animate-float"
          style={{ background: 'radial-gradient(circle at center, hsl(220 91% 58% / 0.35), transparent 60%)', animationDelay: '2s', animationDuration: '18s' }}
        />

        <div className="relative max-w-6xl mx-auto text-center">
          <div className="animate-fade-in">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 rounded-full blur-2xl"
                  style={{ background: 'radial-gradient(circle at center, hsl(220 91% 58% / 0.4), transparent 70%)' }}
                />
                <AppLogo size={96} className="relative animate-float" />
              </div>
            </div>
            <Badge variant="secondary" className="mb-6 gap-2 px-4 py-1.5 text-sm bg-card/70 backdrop-blur-sm hover:bg-card/70">
              <Sparkles className="w-4 h-4 text-primary" />
              Powered by Gemini · Voice input · 8 chat themes
            </Badge>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6">
              Welcome to{' '}
              <span className="gradient-text">
                Super AI
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              The next generation of intelligent conversation. Ask, create, and explore — with AI that answers instantly.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleStartChatting}
                size="lg"
                className="px-8 py-3 text-lg font-semibold shadow-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Start Chatting
                <ArrowRight className="w-4 h-4 ml-2 text-primary-foreground/70" />
              </Button>
              <Link to="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="px-8 py-3 text-lg border-2 border-border hover:bg-accent hover:text-accent-foreground font-semibold hover:-translate-y-0.5 transition-all duration-300"
                >
                  Sign In
                </Button>
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-primary" />
                Streamed answers
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary" />
                Secure by default
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-primary" />
                Themeable chat
              </span>
            </div>
          </div>

          {/* Chat Mockup */}
          <div className="mt-16 max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '200ms' }}>
            <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm shadow-modern-lg p-3">
              <div className="flex items-center justify-between px-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-400/80" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <span className="w-3 h-3 rounded-full bg-green-400/80" />
                </div>
                <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  superai.chat
                </div>
              </div>
              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-secondary/60 to-background p-6 space-y-4">
                <div className="max-w-[70%] ml-auto bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-left shadow-glow">
                  Help me plan my week as a full-stack developer 🚀
                </div>

                <div className="max-w-[80%] bg-card border border-border/60 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-card-foreground text-left shadow-md">
                  <AiBanner />
                  <MarkdownMessage content="Here's a focused weekly plan: block **deep work** for mornings, reserve one day for **code reviews**, and batch meetings on Friday. Want a day-by-day breakdown?" />
                </div>

                <div className="flex items-center gap-1.5 px-1 pt-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="secondary" className="mb-4 px-4 py-1">Why Super AI?</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything you need to{' '}
              <span className="gradient-text">chat smarter</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover the features that make Super AI more than just a chatbot.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="group modern-card hover:-translate-y-1 hover:border-primary/30"
              >
                <CardContent className="p-6">
                  <div
                    className="mb-5 w-12 h-12 rounded-xl flex items-center justify-center text-primary-foreground shadow-glow transition-transform duration-300 group-hover:scale-110"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-card-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="secondary" className="mb-4 px-4 py-1">How it works</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              From question to answer in{' '}
              <span className="gradient-text">three steps</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              No setup, no learning curve — just start a conversation.
            </p>
          </div>

          <div className="relative grid md:grid-cols-3 gap-10">
            <div
              aria-hidden
              className="hidden md:block absolute top-8 left-[16.66%] right-[16.66%] border-t-2 border-dashed border-primary/30"
            />
            {steps.map((step, index) => (
              <div key={index} className="relative text-center">
                <div
                  className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center text-primary-foreground relative shadow-glow"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {step.icon}
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-card border border-border text-xs font-bold text-primary flex items-center justify-center shadow-modern">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div
          className="max-w-5xl mx-auto relative overflow-hidden rounded-3xl px-6 py-16 text-center shadow-modern-lg"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <div
            aria-hidden
            className="hero-orb w-80 h-80 -top-24 -right-24 opacity-30 animate-float"
            style={{ background: 'radial-gradient(circle at center, hsl(0 0% 100% / 0.5), transparent 60%)' }}
          />
          <div
            aria-hidden
            className="hero-orb w-72 h-72 -bottom-28 -left-20 opacity-25 animate-float"
            style={{ background: 'radial-gradient(circle at center, hsl(260 85% 65% / 0.6), transparent 60%)', animationDelay: '3s', animationDuration: '16s' }}
          />

          <Sparkles className="relative z-10 w-10 h-10 mx-auto mb-6 text-white/90" />
          <h2 className="relative z-10 text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to experience the future of chat?
          </h2>
          <p className="relative z-10 text-xl text-white/85 mb-8">
            Join users already enjoying Super AI conversations.
          </p>
          <div className="relative z-10">
            <Button
              onClick={handleStartChatting}
              size="lg"
              variant="secondary"
              className="px-8 py-3 text-lg bg-white text-primary hover:bg-white/90 font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;