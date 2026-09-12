import { Github, Mail, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AboutDeveloperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AboutDeveloper = ({ open, onOpenChange }: AboutDeveloperProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About the Developer</DialogTitle>
          <DialogDescription>
            Super AI is built and maintained by a developer passionate about making
            artificial intelligence accessible to everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-elegant"
                 style={{ background: 'var(--gradient-primary)' }}>
              A
            </div>
            <div>
              <p className="font-semibold text-foreground">Abdullahi</p>
              <p className="text-sm text-muted-foreground">Full-Stack Developer</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              I designed and developed Super AI from the ground up — from the AI
              backend to the user interface. I focused on creating a fast, clean,
              and intuitive chat experience.
            </p>
            <p>
              If you have feedback, feature requests, or just want to say hello,
              I'd love to hear from you!
            </p>
          </div>
        </div>
        <DialogFooter>
          <div className="flex flex-col w-full gap-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.open('https://github.com', '_blank')}
            >
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.open('mailto:hello@superai.dev', '_blank')}
            >
              <Mail className="w-4 h-4 mr-2" />
              Email the Developer
            </Button>
            <Button
              className="w-full justify-center text-primary-foreground hover:opacity-90"
              style={{ background: 'var(--gradient-primary)' }}
              onClick={() => onOpenChange(false)}
            >
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AboutDeveloper;