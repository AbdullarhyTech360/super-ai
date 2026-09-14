import { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface PasswordInputProps {
  field: {
    name: string;
    value: string;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onBlur: React.FocusEventHandler<HTMLInputElement>;
    ref: React.Ref<HTMLInputElement>;
  };
  label: string;
  placeholder?: string;
  id?: string;
  autoComplete?: string;
}

const PasswordInput = ({ field, label, placeholder, id, autoComplete }: PasswordInputProps) => {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [showPassword, setShowPassword] = useState(false);

  return (
    <FormItem>
      <FormLabel htmlFor={inputId}>{label}</FormLabel>
      <FormControl>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            id={inputId}
            type={showPassword ? 'text' : 'password'}
            placeholder={placeholder}
            autoComplete={autoComplete}
            className="pl-11 pr-11 h-12 rounded-xl bg-muted/40 border-border/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
            {...field}
          />
          <button
            type="button"
            onClick={() => setShowPassword(show => !show)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
};

export default PasswordInput;