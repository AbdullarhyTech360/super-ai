import { useState, type ReactNode } from 'react';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  content: string;
}

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

const programmingLanguages = new Set([
  'bash', 'c', 'cpp', 'css', 'go', 'html', 'java', 'javascript', 'js',
  'json', 'kotlin', 'php', 'python', 'py', 'ruby', 'rust', 'shell', 'sh',
  'sql', 'swift', 'typescript', 'ts', 'tsx', 'jsx', 'xml', 'yaml', 'yml',
]);

const normalizeMarkdownHeadings = (markdown: string) => {
  let insideCodeFence = false;

  return markdown.split('\n').map(line => {
    if (/^\s*```/.test(line)) {
      insideCodeFence = !insideCodeFence;
      return line;
    }
    if (insideCodeFence) return line;
    return line.replace(/^(\s{0,3})(#{1,6})(?=\S)/, '$1$2 ');
  }).join('\n');
};

const MarkdownMessage = ({ content }: MarkdownMessageProps) => {
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 1500);
      toast({ title: 'Code copied', description: 'The code is ready to paste.' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Your browser did not allow clipboard access.',
      });
    }
  };

  const components: Components = {
    code({ className, children, ...props }: CodeProps) {
      return (
        <code className={cn(className, 'rounded bg-muted px-1.5 py-0.5 text-[0.9em]')} {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      const codeElement = React.Children.toArray(children)[0];
      const codeProps = React.isValidElement(codeElement)
        ? codeElement.props as CodeProps
        : {};
      const language = codeProps.className?.match(/language-(\S+)/)?.[1];
      const code = String(codeProps.children ?? '').replace(/\n$/, '');
      const canCopy = language ? programmingLanguages.has(language.toLowerCase()) : false;

      return (
        <div className="markdown-code-block">
          <div className="markdown-code-header">
            <span className="text-xs text-muted-foreground">{language || 'code'}</span>
            {canCopy && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => copyCode(code)}
                aria-label="Copy code"
                title="Copy code"
              >
                {copiedCode === code ? <Check /> : <Copy />}
                <span className="sr-only">Copy code</span>
              </Button>
            )}
          </div>
          <pre className="markdown-code-content">{children}</pre>
        </div>
      );
    },
  };

  return (
    <div className="markdown-message text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {normalizeMarkdownHeadings(content)}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownMessage;