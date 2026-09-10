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

const getCodeText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getCodeText).join('');
  }
  if (React.isValidElement(node)) {
    return getCodeText(node.props.children as ReactNode);
  }
  return '';
};

const cleanHeadingText = (node: ReactNode): ReactNode => {
  if (typeof node === 'string') {
    return node.replace(/^\s*#{1,6}\s+/, '');
  }
  if (Array.isArray(node)) {
    return node.map(cleanHeadingText);
  }
  return node;
};

const normalizeMarkdownHeadings = (markdown: string) => {
  let insideCodeFence = false;

  return markdown.split('\n').map(line => {
    if (/^\s*```/.test(line)) {
      insideCodeFence = !insideCodeFence;
      return line;
    }
    if (insideCodeFence) return line;
    return line
      .replace(/^(\s{0,3})\\(#{1,6})(?=\s|\S)/, '$1$2 ')
      .replace(/^(\s{0,3})(#{1,6})(?=\S)/, '$1$2 ');
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
    h1({ children, ...props }) {
      return <h1 {...props}>{cleanHeadingText(children)}</h1>;
    },
    h2({ children, ...props }) {
      return <h2 {...props}>{cleanHeadingText(children)}</h2>;
    },
    h3({ children, ...props }) {
      return <h3 {...props}>{cleanHeadingText(children)}</h3>;
    },
    h4({ children, ...props }) {
      return <h4 {...props}>{cleanHeadingText(children)}</h4>;
    },
    h5({ children, ...props }) {
      return <h5 {...props}>{cleanHeadingText(children)}</h5>;
    },
    h6({ children, ...props }) {
      return <h6 {...props}>{cleanHeadingText(children)}</h6>;
    },
    pre({ children }) {
      const codeElement = React.Children.toArray(children)[0];
      const codeProps = React.isValidElement(codeElement)
        ? codeElement.props as CodeProps
        : {};
      const language = codeProps.className?.match(/language-(\S+)/)?.[1];
      const code = getCodeText(codeProps.children).replace(/\n$/, '');
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