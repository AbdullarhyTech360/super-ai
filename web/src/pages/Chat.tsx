import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Send, Plus, Search, X, Paperclip, Mic, Pencil, Copy, Check, ListFilter, SquarePen, Square, FileText, ListChecks, Trash2, Smile, Pause, Play, MessageSquareDashed, MoreHorizontal, Sparkles, ChevronDown, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import EmojiPicker, { type EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  ACTIVE_CONVERSATION_CACHE_KEY,
  CHAT_CONVERSATIONS_CACHE_KEY,
  getPreference,
  savePreferences,
} from '@/lib/preferences';
import { API_BASE_URL } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import MarkdownMessage from '@/components/MarkdownMessage';
import AppLogo from '@/components/AppLogo';
import AiBanner from '@/components/AiBanner';
import SidebarShell from '@/components/SidebarShell';
import ThinkingPanel from '@/components/ThinkingPanel';
import ThinkingToggle from '@/components/ThinkingToggle';
import { CHAT_THEMES, getChatTheme, type ChatTheme } from '@/lib/chatThemes';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { isNotificationsEnabled, playNotificationSound, tryNotify } from '@/lib/notifications';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  attachments?: Attachment[];
  model?: string;
}

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  isTemporary?: boolean;
  /** False until the transcript has been fetched — the list arrives without it. */
  messagesLoaded: boolean;
  /** True when the transcript was cut off at the oldest end by paging. */
  messagesTruncated?: boolean;
}

interface MessageDto {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  created_at: string;
  attachments?: Attachment[];
}

interface ConversationDto {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationListDto {
  conversations?: ConversationDto[];
  has_more?: boolean;
}

interface MessagesDto {
  title?: string;
  messages?: MessageDto[];
  has_more_older?: boolean;
}

type ConversationSort = 'last-used' | 'name' | 'created';

/** First slice of the sidebar; more pages are fetched on request. */
const CONVERSATIONS_PAGE_SIZE = 50;
/** Most recent turns pulled when a conversation is opened. */
const TRANSCRIPT_PAGE_SIZE = 200;

/**
 * Headers of the most recent conversations, kept between visits so the sidebar
 * can paint instantly on the next open while the real list revalidates.
 * The key lives in useAuth so signing out always clears it.
 */
const CONVERSATIONS_CACHE_LIMIT = 200;

const toDate = (value: string | number | Date, fallback: Date): Date => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

type CachedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

const readConversationsCache = (): CachedConversation[] => {
  try {
    const raw = localStorage.getItem(CHAT_CONVERSATIONS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed as CachedConversation[] : [];
  } catch {
    return [];
  }
};

const writeConversationsCache = (conversations: Conversation[]) => {
  try {
    const rows = conversations
      .filter(conversation => !conversation.isTemporary)
      .slice(0, CONVERSATIONS_CACHE_LIMIT)
      .map(conversation => ({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      }));
    localStorage.setItem(CHAT_CONVERSATIONS_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Private browsing or quota: the cache is an optimisation, never required.
  }
};

const fromCache = (rows: CachedConversation[]): Conversation[] => {
  const now = new Date();
  return rows.map(row => {
    const updatedAt = toDate(row.updatedAt, now);
    return {
      id: row.id,
      title: row.title,
      messages: [],
      createdAt: toDate(row.createdAt, updatedAt),
      updatedAt,
      messagesLoaded: false,
    };
  });
};

const toConversation = (dto: ConversationDto): Conversation => {
  const updatedAt = new Date(dto.updated_at);
  return {
    id: dto.id,
    title: dto.title,
    messages: [],
    createdAt: new Date(dto.created_at ?? dto.updated_at),
    updatedAt,
    messagesLoaded: false,
  };
};

const toMessage = (dto: MessageDto): Message => ({
  id: dto.id,
  text: dto.text,
  sender: dto.sender,
  timestamp: new Date(dto.created_at),
  attachments: dto.attachments ?? [],
});

/**
 * Keeps a transcript that is already on screen. A row arriving from the server
 * carries no messages, so swapping it in would blank an open conversation and
 * immediately re-fetch it; anything at least as fresh as the server row wins.
 */
const mergeConversationPage = (incoming: Conversation[], existing: Conversation[]) => {
  if (!existing.length) return incoming;
  const local = new Map(existing.map(conversation => [conversation.id, conversation] as const));
  return incoming.map(next => {
    const previous = local.get(next.id);
    if (!previous || !previous.messagesLoaded) return next;
    return previous.updatedAt.getTime() >= next.updatedAt.getTime() ? previous : next;
  });
};

const formatDate = (date: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return 'Today';
  } else if (messageDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
};

const suggestionPrompts = [
  'Help me brainstorm creative ideas',
  'Explain complex topics simply',
  'Write and edit content professionally',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Mirrors CHAT_MAX_FILES on the API, which rejects the message outright past this.
const MAX_FILES_PER_MESSAGE = 8;

const ACCEPTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'text/x-typescript',
  'text/x-python',
];

const isAcceptedFile = (file: File) =>
  ACCEPTED_FILE_TYPES.includes(file.type) ||
  file.type.startsWith('text/') ||
  file.type === '';

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const formatVoiceTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  const win = window as SpeechRecognitionWindow;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
};

const MODEL_OPTIONS = [
  { id: 'auto', label: 'Super AI Auto', description: 'Fastest model that fits your question' },
  { id: 'lite', label: 'Super AI Lite', description: 'Fast and lightweight' },
  { id: 'balanced', label: 'Super AI Balanced', description: 'Accurate and well-reasoned' },
  { id: 'pro', label: 'Super AI Pro', description: 'Deepest reasoning' },
];

interface ModelSelectorProps {
  value: string;
  onValueChange: (id: string) => void;
  /**
   * "header" — compact pill for the mobile page header.
   * "composer" — full pill beside the send button (desktop).
   */
  variant?: 'header' | 'composer';
  /** Extra classes for the trigger, e.g. breakpoint visibility. */
  className?: string;
}

/**
 * Model picker. Rendered once in the page header on mobile (where the composer
 * is too cramped) and once beside the send button on desktop — the two
 * instances are toggled purely by breakpoint, so only one is ever visible.
 */
const ModelSelector = ({ value, onValueChange, variant = 'header', className }: ModelSelectorProps) => {
  const active = MODEL_OPTIONS.find(option => option.id === value) ?? MODEL_OPTIONS[0];
  const isHeader = variant === 'header';
  // Narrow header space on mobile — "Super AI Balanced" reads as "Balanced".
  const shortLabel = active.label.replace('Super AI ', '');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'group self-center rounded-full font-medium smooth-transition',
            // Header pill rides the mobile page header; the composer pill lives
            // in the composer footer row, so it matches the thinking pill.
            isHeader
              ? 'model-select-trigger h-9 gap-1.5 border-2 border-border-strong bg-card/60 px-2.5 text-muted-foreground hover:border-primary/40 hover:bg-hover-muted hover:text-foreground sm:gap-2 sm:px-3'
              : 'h-8 gap-1.5 border border-primary/20 bg-primary/5 px-3 text-[13px] text-primary/80 hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
            className
          )}
          aria-label={`Select AI model — current: ${active.label}`}
          title="Choose which Super AI model answers"
        >
          <Sparkles className={cn('shrink-0 text-primary', isHeader ? '!h-[1.15em] !w-[1.15em]' : 'h-3.5 w-3.5')} />
          <span className="whitespace-nowrap font-medium">{shortLabel}</span>
          <ChevronDown
            className={cn(
              'shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180',
              isHeader ? '!h-[1.15em] !w-[1.15em]' : 'h-3.5 w-3.5'
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side={isHeader ? 'bottom' : 'top'}
        sideOffset={8}
        className="w-[min(18rem,calc(100vw_-_2rem))] rounded-xl border-2 border-border-strong shadow-modern"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Super AI model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODEL_OPTIONS.map(option => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => onValueChange(option.id)}
            className="flex items-start justify-between gap-3 pr-2"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs leading-snug text-muted-foreground font-normal">
                {option.description}
              </span>
            </span>
            {option.id === value && (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Shimmer rows that stand in for the sidebar list until the first page lands. */
const ConversationListSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-2" role="status" aria-label="Loading conversations">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="rounded-lg p-3">
        <div className="space-y-2">
          <Skeleton className="h-3.5" style={{ width: `${56 + ((index * 17) % 34)}%` }} />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
    ))}
  </div>
);

/** Stands in for a transcript that is still in flight so the page never flashes empty. */
const ChatAreaSkeleton = () => (
  <div
    className="max-w-4xl mx-auto w-full pt-4 space-y-6"
    role="status"
    aria-label="Loading conversation"
  >
    {[
      // A short user prompt followed by a longer assistant answer, alternating
      // sides like the real transcript. Widths and line counts vary so the
      // placeholders read as ragged text, not identical cards.
      { side: 'user', width: '54%', lines: [78] },
      { side: 'ai', width: '92%', lines: [100, 97, 88, 70] },
      { side: 'user', width: '40%', lines: [62] },
      { side: 'ai', width: '86%', lines: [100, 93, 61] },
    ].map((bubble, index) => (
      <div
        key={index}
        className={cn('flex', bubble.side === 'user' ? 'justify-end' : 'justify-start')}
      >
        <div
          className={cn(
            'min-w-0 space-y-2 rounded-2xl border px-3.5 py-3 sm:px-4',
            bubble.side === 'user'
              ? 'rounded-br-md border-primary/20 bg-primary/10'
              : 'rounded-bl-md border-border/50 bg-card/60'
          )}
          style={{ width: bubble.width }}
        >
          {bubble.lines.map((lineWidth, line) => (
            <Skeleton key={line} className="h-3" style={{ width: `${lineWidth}%` }} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** Failure state with a retry, instead of the silent console.error the page used to log. */
const LoadFailed = ({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) => (
  <div
    className={cn(
      'rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground',
      className
    )}
  >
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{message}</span>
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRetry}
      className="mt-2.5 w-full justify-center gap-2 text-muted-foreground hover:text-foreground fast-transition"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      Try again
    </Button>
  </div>
);

interface ConversationRowProps {
  conversation: Conversation;
  isActive: boolean;
  isMultiSelect: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * One entry in the sidebar list. Memoised because answering a message updates
 * `conversations` roughly every 30ms while streaming, and the rows that are not
 * changing should not re-render 30 times a second with it.
 */
const ConversationRow = React.memo(({
  conversation,
  isActive,
  isMultiSelect,
  isSelected,
  onSelect,
  onToggleSelect,
  onRename,
  onDelete,
}: ConversationRowProps) => (
  <div
    onClick={() => (isMultiSelect ? onToggleSelect(conversation.id) : onSelect(conversation.id))}
    className={cn(
      "p-3 rounded-lg cursor-pointer transition-all duration-200 group hover:shadow-modern smooth-transition flex items-center gap-2",
      isMultiSelect
        ? isSelected
          ? "bg-accent text-accent-foreground shadow-modern border border-border/50"
          : "hover:bg-hover-muted text-foreground"
        : isActive
          ? "bg-accent text-accent-foreground shadow-modern border border-border/50"
          : "hover:bg-hover-muted text-foreground"
    )}
  >
    {isMultiSelect && (
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(conversation.id)}
        className="flex-shrink-0"
        aria-label={`Select ${conversation.title}`}
      />
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {conversation.isTemporary && (
            <MessageSquareDashed className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-label="Temporary chat" />
          )}
          <h3 className="font-medium text-sm truncate">{conversation.title}</h3>
        </div>
        {!isMultiSelect && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-hover-muted fast-transition"
                  aria-label={`Options for ${conversation.title}`}
                  title="Chat options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(conversation.id, conversation.title);
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conversation.id);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {formatDate(conversation.updatedAt)}
      </p>
    </div>
  </div>
));
ConversationRow.displayName = 'ConversationRow';

/**
 * Floor for how long the transcript skeleton stays up when opening a chat. A
 * warm transcript can arrive in well under 200ms, which flashes by so fast the
 * skeleton is never perceived and the messages just pop in. Holding it for a
 * beat reads as intentional. Only sub-floor loads are padded, so a genuinely
 * slow fetch is never made slower.
 */
const MIN_TRANSCRIPT_SKELETON_MS = 350;

const Chat = () => {
  // Seed from the cached headers so a repeat visit paints before the network does.
  const [conversations, setConversations] = useState<Conversation[]>(() => fromCache(readConversationsCache()));
  const [activeConversation, setActiveConversation] = useState<string | null>(() => {
    const saved = localStorage.getItem(ACTIVE_CONVERSATION_CACHE_KEY);
    return saved && readConversationsCache().some(row => row.id === saved) ? saved : null;
  });
  const [isLoadingConversations, setIsLoadingConversations] = useState(() => true);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  /** Id of the conversation whose transcript is in flight, or null. */
  const [messagesLoadingId, setMessagesLoadingId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [conversationSort, setConversationSort] = useState<ConversationSort>('last-used');
  const [newMessage, setNewMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceStatusRef = useRef<'idle' | 'recording' | 'paused'>('idle');
  const voiceTranscriptRef = useRef('');
  const voiceTimerRef = useRef<number | null>(null);
  const voiceLevelRef = useRef(0);
  const pauseRequestedRef = useRef(false);
  const cleaningUpVoiceRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceRafRef = useRef<number | null>(null);
  const { theme } = useTheme();
  const [isTyping, setIsTyping] = useState(false);
  /** True for the whole turn — waiting, streaming, and word reveal — so the
   *  send control can show a stop affordance until the answer is complete. */
  const [isStreaming, setIsStreaming] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingTemporary, setPendingTemporary] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(
    () => getChatTheme(localStorage.getItem('chatTheme'))
  );
  const [modelPreference, setModelPreference] = useState(() => {
    const saved = localStorage.getItem('superAiModelPreference');
    return saved && MODEL_OPTIONS.some(option => option.id === saved) ? saved : 'auto';
  });
  // Asking for reasoning summaries costs the model time, so they are opt-in.
  const [showThinking, setShowThinking] = useState(() => getPreference('showThinking'));
  /** What the in-flight turn is doing, straight from the server's stage events. */
  const [streamStageLabel, setStreamStageLabel] = useState<string | null>(null);
  const [streamThinking, setStreamThinking] = useState('');
  const [thinkingRequested, setThinkingRequested] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [thinkingTotal, setThinkingTotal] = useState(0);
  const [thinkingSettled, setThinkingSettled] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const isInitialActiveConversation = useRef(true);
  const conversationsRef = useRef<Conversation[]>(conversations);
  const streamQueueRef = useRef<string[]>([]);
  const streamDisplayTextRef = useRef('');
  const streamConversationIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const streamModelLabelRef = useRef<string>('');
  const streamDoneRef = useRef(false);
  const streamRevealTimerRef = useRef<number | null>(null);
  /** Cancels the in-flight /api/chat request when the user interrupts. */
  const abortRef = useRef<AbortController | null>(null);
  /** Marks a user-initiated stop so the aborted request isn't shown as an error. */
  const stoppedRef = useRef(false);
  /** Guards against starting a second turn while one is still running. */
  const generatingRef = useRef(false);
  /** When the current turn started: the live counter the stage line shows. */
  const turnStartRef = useRef<number | null>(null);
  /** First reasoning stage and first answer text, which bracket the thinking. */
  const thinkingStartRef = useRef<number | null>(null);
  const thinkingEndRef = useRef<number | null>(null);
  const streamThinkingRef = useRef('');
  const thinkingRenderRef = useRef('');
  const thinkingSecondsRef = useRef(0);
  const voiceActionsRef = useRef<{
    start: () => void;
    pause: () => void;
    resume: () => void;
  }>({ start: () => {}, pause: () => {}, resume: () => {} });
  /** Rows already asked the server for, so a fast double click is one request. */
  const pendingTranscriptsRef = useRef<Set<string>>(new Set());
  const conversationsFetchRef = useRef<Promise<void> | null>(null);
  /** How many server rows the sidebar holds, which is also the next page offset. */
  const serverRowCountRef = useRef(0);
  const { authenticatedFetch, user } = useAuth();
  const { toast } = useToast();

  const handleChatThemeChange = (id: string) => {
    const next = getChatTheme(id);
    setChatTheme(next);
    localStorage.setItem('chatTheme', next.id);
  };

  const handleModelChange = (id: string) => {
    setModelPreference(id);
    localStorage.setItem('superAiModelPreference', id);
  };

  const handleThinkingToggle = (checked: boolean) => {
    setShowThinking(checked);
    savePreferences({ showThinking: checked });
  };

  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
      toast({
        title: 'Message copied',
        description: 'The message is ready to paste.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Your browser did not allow clipboard access.',
      });
    }
  }, [toast]);

  const dropTemporaryConversations = useCallback((exceptId?: string) => {
    setConversations(prev => {
      for (const conv of prev) {
        if (conv.isTemporary && conv.id !== exceptId) {
          conv.messages.forEach(message => message.attachments?.forEach(attachment => URL.revokeObjectURL(attachment.url)));
        }
      }
      return prev.filter(conv => !(conv.isTemporary && conv.id !== exceptId));
    });
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    setNewMessage('');
    pendingAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
    setPendingAttachments([]);
    setPendingTemporary(false);
    dropTemporaryConversations();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [dropTemporaryConversations, pendingAttachments]);

  const handleTemporaryChat = useCallback(() => {
    handleNewChat();
    setPendingTemporary(true);
    toast({
      title: 'Temporary chat',
      description: "This conversation won't be saved and can't be retrieved after you close it.",
    });
  }, [handleNewChat, toast]);

  const handleSelectConversation = useCallback((id: string) => {
    setPendingTemporary(false);
    dropTemporaryConversations(id);
    setActiveConversation(id);
  }, [dropTemporaryConversations]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    const rejected = files.filter(file => !isAcceptedFile(file));
    const oversized = files.filter(file => isAcceptedFile(file) && file.size > MAX_FILE_SIZE);
    const accepted = files.filter(file => isAcceptedFile(file) && file.size <= MAX_FILE_SIZE);

    if (rejected.length) {
      toast({
        title: 'File type not supported',
        description: `${rejected.map(file => file.name).join(', ')}. Images, PDFs, docs, and text files are allowed.`,
      });
    }
    if (oversized.length) {
      toast({
        title: 'File too large',
        description: `${oversized.map(file => file.name).join(', ')} is larger than 25 MB.`,
      });
    }

    if (!accepted.length) return;

    const room = MAX_FILES_PER_MESSAGE - pendingAttachments.length;
    if (room <= 0) {
      toast({
        title: 'Too many files',
        description: `A message can carry at most ${MAX_FILES_PER_MESSAGE} files.`,
      });
      return;
    }

    const fitting = accepted.slice(0, room);
    if (fitting.length < accepted.length) {
      toast({
        title: 'Some files were not added',
        description: `A message can carry at most ${MAX_FILES_PER_MESSAGE} files, so ${accepted.length - fitting.length} were left out.`,
      });
    }

    setPendingAttachments(prev => [
      ...prev,
      ...fitting.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const target = prev.find(attachment => attachment.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(attachment => attachment.id !== id);
    });
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? newMessage.length;
    const end = textarea?.selectionEnd ?? newMessage.length;
    setNewMessage(prev => prev.slice(0, start) + emojiData.emoji + prev.slice(end));
    if (textarea) {
      const position = start + emojiData.emoji.length;
      textarea.setSelectionRange(position, position);
    }
  };

  const setVoiceState = (status: 'idle' | 'recording' | 'paused') => {
    voiceStatusRef.current = status;
    setVoiceStatus(status);
  };

  const computeVoiceLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const delta = (buffer[i] - 128) / 128;
      sum += delta * delta;
    }
    return Math.min(1, Math.sqrt(sum / buffer.length));
  };

  const stopVoiceMeter = () => {
    if (voiceRafRef.current !== null) {
      window.cancelAnimationFrame(voiceRafRef.current);
      voiceRafRef.current = null;
    }
  };

  const startVoiceMeter = () => {
    stopVoiceMeter();
    const tick = () => {
      if (voiceStatusRef.current === 'paused') return;
      let level = computeVoiceLevel();
      if (level === null) {
        level = 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(Date.now() / 180));
      }
      const smoothed = voiceLevelRef.current * 0.6 + level * 0.4;
      voiceLevelRef.current = smoothed;
      setVoiceLevel(smoothed);
      voiceRafRef.current = window.requestAnimationFrame(tick);
    };
    voiceRafRef.current = window.requestAnimationFrame(tick);
  };

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const startVoiceTimer = () => {
    stopVoiceTimer();
    setVoiceSeconds(0);
    voiceTimerRef.current = window.setInterval(() => {
      setVoiceSeconds(seconds => seconds + 1);
    }, 1000);
  };

  const cleanupVoiceSession = () => {
    if (cleaningUpVoiceRef.current) return;
    cleaningUpVoiceRef.current = true;
    setVoiceState('idle');
    setVoiceSeconds(0);
    setVoiceLevel(0);
    voiceLevelRef.current = 0;
    pauseRequestedRef.current = false;
    stopVoiceTimer();
    stopVoiceMeter();
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    recognitionRef.current = null;
    const stream = micStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    const context = audioCtxRef.current;
    if (context) {
      void context.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    cleaningUpVoiceRef.current = false;
  };

  const startVoiceRecording = async () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast({
        title: 'Voice input not supported',
        description: 'Your browser does not support speech recognition. Try Chrome or Microsoft Edge.',
      });
      return;
    }

    voiceTranscriptRef.current = '';
    setVoiceTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioContext;
      analyserRef.current = analyser;
    } catch {
      micStreamRef.current = null;
      analyserRef.current = null;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let segment = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          segment += event.results[i][0].transcript;
        }
      }
      const cleaned = segment.trim();
      if (cleaned) {
        voiceTranscriptRef.current = (voiceTranscriptRef.current + ' ' + cleaned).trim();
        setVoiceTranscript(voiceTranscriptRef.current);
      }
    };

    recognition.onend = () => {
      if (voiceStatusRef.current === 'paused') return;
      if (voiceStatusRef.current === 'recording' && !pauseRequestedRef.current) {
        cleanupVoiceSession();
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast({
          title: 'Microphone access denied',
          description: 'Allow microphone access in your browser to use voice input.',
        });
      }
      cleanupVoiceSession();
    };

    recognitionRef.current = recognition;
    setVoiceState('recording');
    startVoiceTimer();
    startVoiceMeter();

    try {
      recognition.start();
    } catch {
      toast({
        title: 'Voice input unavailable',
        description: 'Could not start the microphone, or you are already using it elsewhere.',
      });
      cleanupVoiceSession();
    }
  };

  const pauseVoiceRecording = () => {
    if (voiceStatusRef.current !== 'recording') return;
    pauseRequestedRef.current = true;
    setVoiceState('paused');
    stopVoiceTimer();
    stopVoiceMeter();
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  };

  const resumeVoiceRecording = () => {
    if (voiceStatusRef.current !== 'paused') return;
    pauseRequestedRef.current = false;
    setVoiceState('recording');
    startVoiceTimer();
    startVoiceMeter();
    window.setTimeout(() => {
      try {
        recognitionRef.current?.start();
      } catch {
        toast({
          title: 'Voice input unavailable',
          description: 'Could not resume recording. Please try again.',
        });
        cleanupVoiceSession();
      }
    }, 150);
  };

  const sendVoiceRecording = () => {
    const transcript = voiceTranscriptRef.current.trim();
    cleanupVoiceSession();
    if (!transcript) {
      toast({
        title: 'No speech detected',
        description: 'Nothing was captured. Try recording again.',
      });
      return;
    }
    handleSendMessage(transcript);
  };

  const discardVoiceRecording = () => {
    cleanupVoiceSession();
  };

  useEffect(() => {
    voiceActionsRef.current = {
      start: startVoiceRecording,
      pause: pauseVoiceRecording,
      resume: resumeVoiceRecording,
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const hasModalOpen =
        !!document.querySelector('[role="dialog"], [role="alertdialog"]');

      if (event.key === '/') {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && !isEditable && !hasModalOpen) {
          event.preventDefault();
          textareaRef.current?.focus();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        const status = voiceStatusRef.current;
        if (status === 'idle') {
          voiceActionsRef.current.start();
        } else if (status === 'recording') {
          voiceActionsRef.current.pause();
        } else {
          voiceActionsRef.current.resume();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        if (voiceStatusRef.current === 'idle') {
          setEmojiOpen(open => !open);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setEmojiOpen]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Track whether the user is still following the latest message, so streaming
  // updates never yank the view back down while they are reading earlier text.
  useEffect(() => {
    const viewport = messagesEndRef.current?.closest(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement | null;
    if (!viewport) return;
    const onScroll = () => {
      isNearBottomRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
    };
    onScroll();
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    // Tokens arrive roughly every 30ms while an answer streams, and a smooth
    // scroll animation restarted that often never settles, which made the page
    // feel slow. Jump instantly while streaming, animate only otherwise.
    const streaming = !streamDoneRef.current || streamQueueRef.current.length > 0;
    messagesEndRef.current?.scrollIntoView({
      behavior: streaming ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [conversations, isTyping]);

  useEffect(() => () => {
    if (streamRevealTimerRef.current) {
      window.clearInterval(streamRevealTimerRef.current);
    }
    if (voiceRafRef.current !== null) {
      window.cancelAnimationFrame(voiceRafRef.current);
    }
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
    }
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => { /* ignore */ });
    }
  }, []);

  /**
   * Loads one page of conversation headers.
   *
   * The endpoint used to return every message of every chat behind one query
   * per conversation, so the first paint slowed down with account age. Now the
   * sidebar needs titles and dates only, and the transcript is fetched for the
   * conversation the user actually opens.
   */
  const loadConversations = useCallback(async (mode: 'initial' | 'more') => {
    if (mode === 'initial' && conversationsFetchRef.current) {
      return conversationsFetchRef.current;
    }

    const request = (async () => {
      const offset = mode === 'initial' ? 0 : serverRowCountRef.current;
      // Read before the request: the persistence effect below owns the key from
      // that point on, so waiting could see an already-updated value.
      const savedActiveId = localStorage.getItem(ACTIVE_CONVERSATION_CACHE_KEY);
      if (mode === 'initial') setIsLoadingConversations(true);
      else setIsLoadingMore(true);

      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/api/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=${offset}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            },
          },
        );
        if (!response.ok) throw new Error('Failed to load your conversations');

        const data = (await response.json()) as ConversationListDto;
        const page = (data.conversations ?? []).map(toConversation);
        serverRowCountRef.current = offset + page.length;
        setHasMoreConversations(Boolean(data.has_more));
        setConversationsError(null);

        setConversations(prev => {
          if (mode === 'initial') {
            // Chats that only exist locally (just started, or temporary) are not
            // on the server page yet and must not disappear from the sidebar.
            const onServer = new Set(page.map(conversation => conversation.id));
            const localOnly = prev.filter(conversation =>
              !onServer.has(conversation.id) && (conversation.messagesLoaded || conversation.isTemporary)
            );
            return [...mergeConversationPage(page, prev), ...localOnly];
          }
          const known = new Set(prev.map(conversation => conversation.id));
          return [...prev, ...page.filter(conversation => !known.has(conversation.id))];
        });

        if (mode === 'initial' && savedActiveId) {
          // Reconcile the restored selection with what the server actually has:
          // a chat deleted in another tab must not stay on screen, and a chat
          // whose header was not cached yet gets opened once it arrives.
          const stillExists = page.some(conversation => conversation.id === savedActiveId);
          setActiveConversation(prev => {
            if (prev === savedActiveId && !stillExists) return null;
            if (!prev && stillExists) return savedActiveId;
            return prev;
          });
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
        setConversationsError(
          error instanceof Error ? error.message : 'Failed to load your conversations.'
        );
      } finally {
        setIsLoadingConversations(false);
        setIsLoadingMore(false);
        conversationsFetchRef.current = null;
      }
    })();

    if (mode === 'initial') conversationsFetchRef.current = request;
    return request;
  }, [authenticatedFetch]);

  /** Fetches the transcript for one conversation, once, and merges it in place. */
  const loadConversationMessages = useCallback(async (id: string) => {
    const existing = conversationsRef.current.find(conversation => conversation.id === id);
    if (!existing || existing.messagesLoaded || existing.isTemporary) return;
    if (pendingTranscriptsRef.current.has(id)) return;

    pendingTranscriptsRef.current.add(id);
    setMessagesLoadingId(id);
    setMessagesError(null);
    const startedAt = performance.now();

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/conversations/${id}/messages?limit=${TRANSCRIPT_PAGE_SIZE}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        },
      );
      if (!response.ok) throw new Error('Unable to open this conversation.');

      const data = (await response.json()) as MessagesDto;
      const fetched = (data.messages ?? []).map(toMessage);
      const truncated = Boolean(data.has_more_older);

      // Keep the skeleton up for the floor before committing, so a fast reply
      // still reads as a load instead of content snapping into place.
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_TRANSCRIPT_SKELETON_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_TRANSCRIPT_SKELETON_MS - elapsed));
      }

      const serverIds = new Set(fetched.map(message => message.id));
      setConversations(prev => prev.map(conv => {
        if (conv.id !== id) return conv;
        // Keep optimistic turns the server has not returned yet: the message
        // just sent and the answer still streaming in.
        const localTurns = conv.messages.filter(message => !serverIds.has(message.id));
        return {
          ...conv,
          messages: [...fetched, ...localTurns],
          messagesLoaded: true,
          messagesTruncated: truncated,
          ...(data.title ? { title: data.title } : {}),
        };
      }));
    } catch (error) {
      console.error('Error loading conversation:', error);
      setMessagesError(error instanceof Error ? error.message : 'Unable to open this conversation.');
    } finally {
      pendingTranscriptsRef.current.delete(id);
      setMessagesLoadingId(current => (current === id ? null : current));
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void loadConversations('initial');
  }, [loadConversations]);

  useEffect(() => {
    if (isInitialActiveConversation.current) {
      isInitialActiveConversation.current = false;
      return;
    }

    if (activeConversation) {
      localStorage.setItem(ACTIVE_CONVERSATION_CACHE_KEY, activeConversation);
    } else {
      localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_KEY);
    }
  }, [activeConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
    // Debounced: the list identity changes roughly every 30ms while an answer
    // streams, and serialising to localStorage that often is pure overhead.
    const timer = window.setTimeout(() => writeConversationsCache(conversations), 600);
    return () => window.clearTimeout(timer);
  }, [conversations]);

  // The transcript is loaded when a conversation is opened rather than carried
  // in the list, so this effect must sit after the ref sync above.
  useEffect(() => {
    setMessagesError(null);
    if (!activeConversation) return;
    // A conversation you just opened should land on its last message, wherever
    // you had scrolled in the previous one.
    isNearBottomRef.current = true;
    void loadConversationMessages(activeConversation);
  }, [activeConversation, loadConversationMessages]);

  /**
   * Undo an optimistic change by re-reading the server's view of the list. Used
   * when a delete or rename is rejected after the row already moved on screen.
   */
  const resyncConversations = useCallback(() => {
    serverRowCountRef.current = 0;
    void loadConversations('initial');
  }, [loadConversations]);

  const handleDeleteClick = useCallback((id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const toggleMultiSelect = (enabled: boolean) => {
    setIsMultiSelect(enabled);
    if (!enabled) {
      setSelectedConversationIds(new Set());
    }
  };

  const toggleConversationSelect = useCallback((id: string) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const confirmDelete = () => {
    if (isMultiSelect && selectedConversationIds.size > 0) {
      const ids = Array.from(selectedConversationIds);
      const count = ids.length;
      const rows = conversations;
      authenticatedFetch(`${API_BASE_URL}/api/conversations/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ conversation_ids: ids }),
      })
        .then(async (response) => {
          if (!response.ok) {
            let detail = 'Failed to delete the selected chats.';
            try {
              const error = await response.json();
              if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
            } catch { /* keep default message */ }
            throw new Error(detail);
          }
        })
        .catch(error => {
          console.error('Error deleting conversations:', error);
          // Restore the selection so the list matches the server again.
          setConversations(rows);
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to delete the selected chats.',
          });
        });
      setConversations(prev => prev.filter(conv => !selectedConversationIds.has(conv.id)));
      if (activeConversation && selectedConversationIds.has(activeConversation)) {
        setActiveConversation(null);
      }
      toast({
        title: `${count} chats deleted`,
        description: 'The selected chats and their uploaded media files have been permanently deleted.',
      });
    } else if (conversationToDelete) {
      const conversationTitle = conversations.find(conv => conv.id === conversationToDelete)?.title || 'Conversation';
      const removed = conversations.find(conv => conv.id === conversationToDelete);
      authenticatedFetch(`${API_BASE_URL}/api/conversations/${conversationToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      })
        .then(async (response) => {
          if (!response.ok) {
            let detail = 'Failed to delete the chat.';
            try {
              const error = await response.json();
              if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
            } catch { /* keep default message */ }
            throw new Error(detail);
          }
        })
        .catch(error => {
          console.error('Error deleting conversation:', error);
          // Put the row back so the sidebar reflects what the server still has.
          if (removed) {
            setConversations(prev => [removed, ...prev.filter(conv => conv.id !== removed.id)]);
          }
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to delete the chat.',
          });
        });
      setConversations(prev => prev.filter(conv => conv.id !== conversationToDelete));
      if (activeConversation === conversationToDelete) {
        setActiveConversation(null);
      }
      toast({
        title: "Chat deleted",
        description: `"${conversationTitle}" and its uploaded media files have been permanently deleted.`,
      });
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
    if (isMultiSelect) {
      setSelectedConversationIds(new Set());
      setIsMultiSelect(false);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleRenameClick = useCallback((id: string, title: string) => {
    setConversationToRename(id);
    setRenameTitle(title);
    setRenameDialogOpen(true);
  }, []);

  const renameConversation = (id: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    const previousTitle = conversations.find(conv => conv.id === id)?.title;
    authenticatedFetch(`${API_BASE_URL}/api/conversations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ title: trimmedTitle }),
    })
      .then(async (response) => {
        if (!response.ok) {
          let detail = 'Failed to rename the chat.';
          try {
            const error = await response.json();
            if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
          } catch { /* keep default message */ }
          throw new Error(detail);
        }
      })
      .catch(error => {
        console.error('Error renaming conversation:', error);
        // Roll the optimistic title back so the row matches the server again.
        if (previousTitle) {
          setConversations(prev => prev.map(conv =>
            conv.id === id ? { ...conv, title: previousTitle } : conv
          ));
        }
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to rename the chat.',
        });
      });
    setConversations(prev => prev.map(conv =>
      conv.id === id
        ? { ...conv, title: trimmedTitle, updatedAt: new Date() }
        : conv
    ));
    toast({
      title: "Chat renamed",
      description: `Conversation renamed to "${trimmedTitle}".`,
    });
  };

  const confirmRename = () => {
    if (conversationToRename) {
      renameConversation(conversationToRename, renameTitle);
    }
    setRenameDialogOpen(false);
    setConversationToRename(null);
  };

  const startEditingTitle = () => {
    if (!currentConversation) return;
    setEditingTitle(currentConversation.title);
    setIsEditingTitle(true);
  };

  const saveTitleEdit = () => {
    if (!currentConversation) return;
    const trimmedTitle = editingTitle.trim();
    setIsEditingTitle(false);
    if (trimmedTitle && trimmedTitle !== currentConversation.title) {
      renameConversation(currentConversation.id, trimmedTitle);
    }
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditingTitle('');
  };

  const cancelRename = () => {
    setRenameDialogOpen(false);
    setConversationToRename(null);
  };

  /** Turn the stage line into a settled "Thought for Ns" once the turn ends. */
  const finalizeStreamThinking = useCallback(() => {
    const startedAt = thinkingStartRef.current ?? turnStartRef.current;
    const endedAt = thinkingEndRef.current ?? Date.now();
    setThinkingTotal(startedAt === null ? 0 : Math.max(0, Math.round((endedAt - startedAt) / 1000)));
    setThinkingSettled(true);
    setThinkingExpanded(false);
  }, []);

  // One 30ms loop drives both the word reveal and the waiting counter, so the
  // gap before the first token is measured rather than silent.
  const pumpStream = useCallback(() => {
    if (turnStartRef.current !== null) {
      const elapsed = Math.floor((Date.now() - turnStartRef.current) / 1000);
      if (elapsed !== thinkingSecondsRef.current) {
        thinkingSecondsRef.current = elapsed;
        setThinkingSeconds(elapsed);
      }
    }

    // Summaries can arrive faster than words are revealed, so publishing them
    // once per tick keeps their render cost off the stream reader.
    if (streamThinkingRef.current !== thinkingRenderRef.current) {
      thinkingRenderRef.current = streamThinkingRef.current;
      setStreamThinking(thinkingRenderRef.current);
    }

    // Reveal adaptively: 1 word at a time when the stream trickles in,
    // but burst through any backlog so long answers don't lag behind.
    const backlog = streamQueueRef.current.length;
    if (!backlog) {
      if (streamDoneRef.current) {
        window.clearInterval(streamRevealTimerRef.current!);
        streamRevealTimerRef.current = null;
        // Freeze the counter where the turn ended rather than counting to now.
        turnStartRef.current = null;
        generatingRef.current = false;
        setIsTyping(false);
        setIsStreaming(false);
      }
      return;
    }

    const burst = Math.min(6, Math.max(1, Math.ceil(backlog / 30)));
    let taken = '';
    for (let i = 0; i < burst; i += 1) {
      const word = streamQueueRef.current.shift();
      if (!word) break;
      taken += word;
    }

    streamDisplayTextRef.current += taken;
    const conversationId = streamConversationIdRef.current;
    const messageId = streamMessageIdRef.current;
    if (!conversationId || !messageId) return;

    setIsTyping(false);
    setConversations(prev => prev.map(conv => {
      if (conv.id !== conversationId) return conv;

      const hasMessage = conv.messages.some(message => message.id === messageId);
      return {
        ...conv,
        messages: hasMessage
          ? conv.messages.map(message =>
              message.id === messageId
                ? { ...message, text: streamDisplayTextRef.current }
                : message
            )
          : [...conv.messages, {
              id: messageId,
              text: streamDisplayTextRef.current,
              sender: 'ai',
              timestamp: new Date(),
              model: streamModelLabelRef.current || undefined,
            }],
        updatedAt: new Date(),
      };
    }));
  }, []);

  const startStreamPump = useCallback(() => {
    if (streamRevealTimerRef.current !== null) return;
    streamRevealTimerRef.current = window.setInterval(pumpStream, 30);
  }, [pumpStream]);

  const enqueueStreamText = useCallback((text: string) => {
    streamQueueRef.current.push(...(text.match(/\s*\S+\s*/g) ?? [text]));
    startStreamPump();
  }, [startStreamPump]);

  const handleSendMessage = useCallback((overrideText?: string) => {
    const text = (overrideText ?? newMessage).trim();
    const sentAttachments = pendingAttachments;
    if (!text && sentAttachments.length === 0) return;
    // One turn at a time — ignore new sends until the current one settles.
    if (generatingRef.current) return;

    const localConversationId = activeConversation ?? Date.now().toString();

    const isTemporaryChat = activeConversation
      ? (conversationsRef.current.find(conv => conv.id === activeConversation)?.isTemporary ?? false)
      : pendingTemporary;

    const sendingHistory = conversationsRef.current
      .find(conv => conv.id === activeConversation)
      ?.messages.map(m => ({ sender: m.sender, text: m.text })) ?? [];

    const message: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
      attachments: sentAttachments.map(attachment => ({
        id: attachment.id,
        filename: attachment.name,
        mime_type: attachment.mimeType,
        size: attachment.size,
        url: attachment.url,
      })),
    };

    if (activeConversation) {
      setConversations(prev => prev.map(conv =>
        conv.id === activeConversation
          ? { ...conv, messages: [...conv.messages, message], updatedAt: new Date() }
          : conv
      ));
    } else {
      const newConv: Conversation = {
        id: localConversationId,
        title: 'Generating title...',
        messages: [message],
        createdAt: new Date(),
        updatedAt: new Date(),
        isTemporary: pendingTemporary,
        // The transcript is already on screen, so it must never be re-fetched.
        messagesLoaded: true,
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
      setPendingTemporary(false);
    }

    setNewMessage('');
    setPendingAttachments([]);
    setIsTyping(true);
    setIsStreaming(true);
    generatingRef.current = true;
    // Sending is proof the conversation works, so drop a stale load error.
    setMessagesError(null);

    // use an api call to get the AI response instead of a simulated response
    (async () => {
      let responseConversationId = activeConversation ?? localConversationId;
      streamQueueRef.current = [];
      streamDisplayTextRef.current = '';
      streamConversationIdRef.current = responseConversationId;
      streamMessageIdRef.current = `ai-${Date.now()}`;
      streamModelLabelRef.current = '';
      streamDoneRef.current = false;
      // Fresh controller per turn so a stop only cancels the current request.
      stoppedRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;
      // The stage line is rebuilt from scratch every turn; thinking text never
      // outlives the turn that produced it.
      turnStartRef.current = Date.now();
      thinkingStartRef.current = null;
      thinkingEndRef.current = null;
      thinkingSecondsRef.current = 0;
      streamThinkingRef.current = '';
      thinkingRenderRef.current = '';
      setStreamStageLabel(null);
      setStreamThinking('');
      setThinkingSeconds(0);
      setThinkingTotal(0);
      setThinkingSettled(false);
      setThinkingRequested(false);
      // Open while it reasons so the reader does not have to discover the panel.
      setThinkingExpanded(true);
      startStreamPump();
      let notificationTitle = conversationsRef.current.find(conv => conv.id === (activeConversation ?? localConversationId))?.title || 'Super AI';

      const onStreamDone = () => {
        if (isNotificationsEnabled() && document.visibilityState === 'hidden') {
          tryNotify(notificationTitle, streamDisplayTextRef.current.trim().slice(0, 140));
        }
        playNotificationSound();
      };

      try {
        const accessToken = localStorage.getItem('access_token');
        const formData = new FormData();
        formData.append('input', text);
        formData.append('is_new', String(!activeConversation));
        formData.append('persist', String(!isTemporaryChat));
        // Always send the visible transcript: an ongoing chat would otherwise
        // re-query it from the database, a full round-trip before the model is
        // even called. The server trims it to the same budget it would load.
        if (sendingHistory.length > 0) {
          formData.append('history', JSON.stringify(sendingHistory));
        }
        if (activeConversation) {
          formData.append('conversation_id', activeConversation);
        }
        formData.append('model', modelPreference);
        formData.append('show_thinking', String(showThinking));
        sentAttachments.forEach(attachment => formData.append('files', attachment.file));

        const response = await authenticatedFetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = 'Failed to get a response from the AI. Please check your connection or try again later.';
          try {
            const error = await response.json();
            if (error?.detail) {
              detail = typeof error.detail === 'string' ? error.detail : 'Failed to process the request.';
            }
          } catch { /* keep default message */ }
          throw new Error(detail);
        }
        if (!response.body) throw new Error('Failed to get a response');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bufferedText = '';
        let streamFinished = false;

        while (!streamFinished) {
          const { value, done } = await reader.read();
          bufferedText += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = bufferedText.split('\n');
          bufferedText = events.pop() ?? '';

          for (const eventText of events) {
            if (!eventText.trim()) continue;
            const event = JSON.parse(eventText);
            if (event.type === 'start') {
              responseConversationId = event.conversation_id;
              streamConversationIdRef.current = responseConversationId;
              streamModelLabelRef.current = event.model ?? '';
              setThinkingRequested(Boolean(event.show_thinking));
              setActiveConversation(responseConversationId);
              setConversations(prev => prev.map(conv =>
                conv.id === localConversationId
                  ? {
                      ...conv,
                      id: responseConversationId,
                      messages: event.attachments?.length
                        ? (() => {
                            const messages = [...conv.messages];
                            const lastIndex = messages.length - 1;
                            if (lastIndex >= 0 && messages[lastIndex].sender === 'user') {
                              messages[lastIndex] = { ...messages[lastIndex], attachments: event.attachments };
                            }
                            return messages;
                          })()
                        : conv.messages,
                      ...(event.title ? { title: event.title } : {}),
                    }
                  : conv
              ));
              sentAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
            } else if (event.type === 'title') {
              notificationTitle = event.title;
              setConversations(prev => prev.map(conv =>
                conv.id === responseConversationId || conv.id === localConversationId
                  ? { ...conv, title: event.title }
                  : conv
              ));
            } else if (event.type === 'stage') {
              setStreamStageLabel(event.label ?? event.stage);
              if (event.stage === 'thinking' && thinkingStartRef.current === null) {
                thinkingStartRef.current = Date.now();
              }
              if (event.stage === 'answering' && thinkingEndRef.current === null) {
                thinkingEndRef.current = Date.now();
              }
            } else if (event.type === 'thinking') {
              streamThinkingRef.current += event.text ?? '';
            } else if (event.type === 'chunk') {
              if (thinkingEndRef.current === null) thinkingEndRef.current = Date.now();
              enqueueStreamText(event.text);
            } else if (event.type === 'error') {
              const errorMsg = event.detail || 'The AI encountered an error. Please try again.';
              throw new Error(errorMsg);
            } else if (event.type === 'done') {
              streamFinished = true;
              streamDoneRef.current = true;
              finalizeStreamThinking();
              onStreamDone();
            }
          }

          if (done) streamFinished = true;
        }

        if (bufferedText.trim()) {
          const event = JSON.parse(bufferedText);
          if (event.type === 'chunk') {
            enqueueStreamText(event.text);
          } else if (event.type === 'done') {
            streamDoneRef.current = true;
            finalizeStreamThinking();
            onStreamDone();
          }
        }

        if (!streamQueueRef.current.length && !streamDisplayTextRef.current) {
          generatingRef.current = false;
          setIsTyping(false);
          setIsStreaming(false);
        }
      } catch (error) {
        streamQueueRef.current = [];
        streamDoneRef.current = true;
        generatingRef.current = false;
        setIsTyping(false);
        setIsStreaming(false);
        // A turn that died mid-thinking still has to stop spinning.
        finalizeStreamThinking();
        // A user-initiated stop is not an error — keep the partial answer quietly.
        const aborted = stoppedRef.current
          || (error instanceof DOMException && error.name === 'AbortError');
        if (aborted) {
          abortRef.current = null;
          return;
        }
        console.error('Error fetching AI response:', error);
        const description = error instanceof Error
          ? error.message
          : 'Failed to get a response from the AI. Please check your connection or try again later.';
        toast({ title: 'Error', description });
        return;
      }
    })();
  }, [newMessage, activeConversation, pendingAttachments, pendingTemporary, authenticatedFetch, toast, modelPreference, showThinking, startStreamPump, enqueueStreamText, finalizeStreamThinking]);

  /**
   * Interrupts the current turn: cancels the in-flight request and freezes the
   * answer where it is, keeping whatever has already been revealed on screen.
   */
  const handleStopGeneration = useCallback(() => {
    if (!generatingRef.current) return;
    stoppedRef.current = true;
    generatingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    // Drop anything still queued so the reveal halts on the spot.
    streamQueueRef.current = [];
    streamDoneRef.current = true;
    turnStartRef.current = null;
    if (streamRevealTimerRef.current !== null) {
      window.clearInterval(streamRevealTimerRef.current);
      streamRevealTimerRef.current = null;
    }
    finalizeStreamThinking();
    setIsTyping(false);
    setIsStreaming(false);
  }, [finalizeStreamThinking]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const currentConversation = conversations.find(conv => conv.id === activeConversation);
  const currentTitle = currentConversation?.title || 'Super AI';
  const firstName = (user?.full_name ?? '').split(' ')[0] || 'there';

  // A persisted chat now arrives from the list without its transcript, so the
  // first frame after opening one is a skeleton rather than an empty screen.
  const isTranscriptLoading = !!currentConversation
    && !currentConversation.isTemporary
    && !currentConversation.messages.length
    && (!currentConversation.messagesLoaded || messagesLoadingId === currentConversation.id);

  // On a cold load the conversation list itself may still be in flight, so the
  // open chat is not resolvable yet. When the user clearly had a chat selected,
  // hold the transcript skeleton instead of flashing the greeting first.
  const isRestoringLastChat = isLoadingConversations
    && !currentConversation
    && !!localStorage.getItem(ACTIVE_CONVERSATION_CACHE_KEY);

  // Recomputed only when the list, the query or the ordering changes. Sorting
  // in place on every render used to re-rank the sidebar up to thirty times a
  // second while an answer streamed in.
  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const matches = query
      ? conversations.filter(conv => conv.title.toLowerCase().includes(query))
      : conversations;
    return [...matches].sort((first, second) => {
      if (conversationSort === 'name') {
        return first.title.localeCompare(second.title);
      }

      const firstDate = conversationSort === 'created' ? first.createdAt : first.updatedAt;
      const secondDate = conversationSort === 'created' ? second.createdAt : second.updatedAt;
      return secondDate.getTime() - firstDate.getTime();
    });
  }, [conversations, searchTerm, conversationSort]);

  const visibleConversationIds = useMemo(
    () => filteredConversations.map(conv => conv.id),
    [filteredConversations]
  );
  const allVisibleConversationsSelected = visibleConversationIds.length > 0
    && visibleConversationIds.every(id => selectedConversationIds.has(id));
  const someVisibleConversationsSelected = visibleConversationIds.some(id => selectedConversationIds.has(id));

  const handleSelectAllToggle = (checked: boolean | 'indeterminate') => {
    const shouldSelectAll = checked === true || checked === 'indeterminate';
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (shouldSelectAll) {
        visibleConversationIds.forEach(id => next.add(id));
      } else {
        visibleConversationIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  /**
   * One panel, rendered while the answer is pending and again on the live
   * message once it starts arriving, so the wait never jumps between them.
   */
  const renderThinking = (streaming: boolean) => (
    <ThinkingPanel
      label={streamStageLabel ?? 'Thinking'}
      seconds={streaming ? thinkingSeconds : thinkingTotal}
      streaming={streaming}
      summary={streamThinking}
      summaryRequested={thinkingRequested}
      expanded={thinkingExpanded}
      onToggle={() => setThinkingExpanded(prev => !prev)}
    />
  );

  return (
    <SidebarShell
      scrollable={false}
      subtitle="Always here to help"
      hideProfileNav
      themeLabel={chatTheme.id === 'default' ? 'Default' : chatTheme.label}
      title={
        isEditingTitle && currentConversation ? (
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={saveTitleEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveTitleEdit();
              } else if (e.key === 'Escape') {
                cancelTitleEdit();
              }
            }}
            autoFocus
            onFocus={(e) => e.target.select()}
            aria-label="Edit conversation title"
            className="h-7 w-full max-w-xs px-2 py-0 text-lg font-semibold text-foreground bg-card border-border"
          />
        ) : (
          <button
            type="button"
            onClick={startEditingTitle}
            disabled={!currentConversation}
            className="flex items-center gap-1.5 group/title max-w-full"
            title={currentConversation ? 'Click to rename' : undefined}
            aria-label={currentConversation ? 'Rename conversation' : undefined}
          >
            <h1 className="text-lg font-semibold text-foreground truncate max-w-[50vw]">
              {currentTitle}
            </h1>
            {currentConversation && (
              <Pencil className="w-3.5 h-3.5 text-muted-foreground/0 group-hover/title:text-muted-foreground transition-colors flex-shrink-0" />
            )}
          </button>
        )
      }
      sidebarHeaderExtra={
        <>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleNewChat}
              className="flex-1 mb-1 smooth-transition hover:shadow-glow"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTemporaryChat}
                  className="h-9 w-9 p-0 mb-1 text-muted-foreground hover:text-foreground smooth-transition"
                  aria-label="Start a temporary chat"
                >
                  <MessageSquareDashed className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Start a temporary chat — it won't be saved and can't be retrieved after you close it.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/30 border-border fast-transition focus:shadow-glow"
            />
          </div>

          {isMultiSelect ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">
                  {selectedConversationIds.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMultiSelect(false)}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground fast-transition"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={allVisibleConversationsSelected
                      ? true
                      : someVisibleConversationsSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAllToggle}
                  />
                  Select all
                </label>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedConversationIds.size === 0}
                  onClick={() => setDeleteDialogOpen(true)}
                  className="flex-1 smooth-transition"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete ({selectedConversationIds.size})
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleMultiSelect(true)}
                className="flex-1 justify-center gap-2 text-muted-foreground hover:text-foreground fast-transition"
                title="Select multiple chats to delete at once"
              >
                <ListChecks className="w-4 h-4" />
                Select
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex-1 justify-center gap-2 text-muted-foreground hover:text-foreground fast-transition">
                    <ListFilter className="w-4 h-4" />
                    Sort: {conversationSort === 'last-used' ? 'Last used' : conversationSort === 'name' ? 'Name' : 'Created'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Arrange conversations</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={conversationSort}
                    onValueChange={(value) => setConversationSort(value as ConversationSort)}
                  >
                    <DropdownMenuRadioItem value="last-used">Last used</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">Time created</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </>
      }
      sidebarContent={
        <div className="space-y-2">
          {conversationsError && filteredConversations.length === 0 ? (
            <div className="animate-fade-in">
              <LoadFailed
                message={conversationsError}
                onRetry={resyncConversations}
              />
            </div>
          ) : isLoadingConversations && filteredConversations.length === 0 ? (
            <ConversationListSkeleton />
          ) : filteredConversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {searchTerm ? 'No conversations match that search.' : 'No conversations yet.'}
            </p>
          ) : (
            <>
              <div className="space-y-2 animate-fade-in">
                {filteredConversations.map(conversation => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    isActive={activeConversation === conversation.id}
                    isMultiSelect={isMultiSelect}
                    isSelected={selectedConversationIds.has(conversation.id)}
                    onSelect={handleSelectConversation}
                    onToggleSelect={toggleConversationSelect}
                    onRename={handleRenameClick}
                    onDelete={handleDeleteClick}
                  />
                ))}
              </div>

              {hasMoreConversations && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={() => void loadConversations('more')}
                  className="w-full justify-center gap-2 py-5 text-xs text-muted-foreground hover:text-foreground fast-transition"
                >
                  {isLoadingMore
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ChevronDown className="w-3.5 h-3.5" />}
                  {isLoadingMore ? 'Loading older chats...' : 'Load older chats'}
                </Button>
              )}

              {/* A failed refresh must not hide the list that is already on screen. */}
              {conversationsError && (
                <button
                  type="button"
                  onClick={() => void loadConversations('initial')}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground fast-transition hover:text-foreground"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-destructive" />
                  The list could not be refreshed — tap to retry.
                </button>
              )}
            </>
          )}
        </div>
      }
      sidebarRailContent={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:bg-hover-muted hover:text-foreground fast-transition mt-1"
              aria-label="New chat"
            >
              <SquarePen className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New chat</TooltipContent>
        </Tooltip>
      }
      themeExtras={
        <>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Chat theme
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={chatTheme.id}
            onValueChange={handleChatThemeChange}
          >
            {CHAT_THEMES.map((sel) => (
              <DropdownMenuRadioItem key={sel.id} value={sel.id}>
                <span className="flex -space-x-1 mr-2">
                  <span
                    className="w-4 h-4 rounded-full border border-border/40"
                    style={{ background: sel.swatchUser }}
                  />
                  <span
                    className="w-4 h-4 rounded-full border border-border/40"
                    style={{ background: sel.swatchAi }}
                  />
                </span>
                {sel.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </>
      }
    >
      {/* Messages Area */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: chatTheme.areaBg }}
      >
        <ScrollArea className="h-full p-3 sm:p-4 bg-transparent overflow-x-hidden">
        {currentConversation?.isTemporary && (
          <div className="max-w-4xl mx-auto w-full mb-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-sm text-foreground">
              <MessageSquareDashed className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Temporary chat — this conversation won't be saved and can't be retrieved after you close it.</span>
            </div>
          </div>
        )}
        {(messagesError && currentConversation && !currentConversation.messages.length) ? (
          <div className="max-w-4xl mx-auto w-full animate-fade-in">
            <LoadFailed
              message={messagesError}
              onRetry={() => void loadConversationMessages(currentConversation.id)}
            />
          </div>
        ) : isTranscriptLoading || isRestoringLastChat ? (
          <ChatAreaSkeleton />
        ) : currentConversation?.messages.length ? (
          <div className="max-w-4xl mx-auto w-full">
            {currentConversation.messagesTruncated && (
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Showing the most recent messages — older ones stay on the server.
              </p>
            )}
            {currentConversation.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "message-enter w-full group",
                    index === 0 ? "mt-0" : "mt-6"
                  )}
                >
                  <div className={cn(
                    "max-w-[88%] sm:max-w-[80%] md:max-w-[70%] w-fit min-w-0 relative",
                    message.sender === 'user' ? "ml-auto" : "mr-auto"
                  )}>
                    {message.sender === 'user' ? (
                      <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-left shadow-glow min-w-0 sm:px-4 sm:py-3">
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map(attachment => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 px-2.5 py-1.5 text-xs transition-colors max-w-[240px]"
                                title={attachment.filename}
                              >
                                {attachment.mime_type.startsWith('image/') ? (
                                  <img
                                    src={attachment.url}
                                    alt={attachment.filename}
                                    className="w-9 h-9 rounded object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <FileText className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="truncate">{attachment.filename}</span>
                                <span className="text-primary-foreground/70 flex-shrink-0">
                                  {formatFileSize(attachment.size)}
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {message.text}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyMessage(message.id, message.text)}
                          className="absolute -bottom-2.5 right-1 h-7 w-7 p-0 rounded-full bg-background border border-border/70 text-muted-foreground shadow-sm opacity-100 transition-opacity fast-transition hover:bg-background hover:text-foreground sm:-bottom-3 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          aria-label="Copy message"
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-card-foreground text-left shadow-md min-w-0 sm:px-4 sm:py-3">
                        <AiBanner />
                        {thinkingRequested && message.id === streamMessageIdRef.current && renderThinking(!thinkingSettled)}
                        <MarkdownMessage content={message.text} />
                        {message.model && (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                            <Sparkles className="w-3 h-3" />
                            {message.model}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyMessage(message.id, message.text)}
                          className="absolute -bottom-2.5 right-1 h-7 w-7 p-0 rounded-full bg-background border border-border/70 text-muted-foreground shadow-sm opacity-100 transition-opacity fast-transition hover:bg-background hover:text-foreground sm:-bottom-3 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          aria-label="Copy message"
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="max-w-[88%] sm:max-w-[80%] md:max-w-[70%] w-fit min-w-0 mr-auto animate-slide-in mt-6">
                <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-md sm:px-4 sm:py-3">
                  <AiBanner />
                  {streamStageLabel ? renderThinking(true) : (
                    <div className="flex items-center gap-1.5 px-1 pt-1">
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" />
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-full">
            <div className="text-center max-w-md mx-auto px-2 py-6 sm:p-8">
              <div className="mx-auto mb-4 h-16 w-16 sm:mb-6 sm:h-24 sm:w-24">
                <AppLogo size={96} className="h-full w-full animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold gradient-text mb-3 sm:text-4xl sm:mb-4">
                {getGreeting()}, {firstName}!
              </h2>
              <p className="text-muted-foreground mb-6 text-base sm:mb-8 sm:text-lg">
                What's on your mind today?
              </p>
              <div className="grid grid-cols-1 gap-2.5 text-sm sm:gap-4">
                {suggestionPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    disabled={isTyping}
                    className="p-3.5 rounded-xl bg-card/50 backdrop-blur-sm hover:bg-card/80 cursor-pointer smooth-transition hover:shadow-modern border border-border/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-left sm:p-4"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-4 border-t border-border bg-background/95 backdrop-blur-md shadow-elegant">
        <div className="max-w-4xl mx-auto w-full">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="p-2 bg-card/50 backdrop-blur-sm rounded-2xl border-2 border-border-strong shadow-modern hover:shadow-elegant smooth-transition w-full">
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2">
                {pendingAttachments.map(attachment => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2 py-1.5 text-xs max-w-[260px]"
                  >
                    {attachment.mimeType.startsWith('image/') ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate">{attachment.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {formatFileSize(attachment.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="h-5 w-5 p-0 ml-0.5 text-muted-foreground hover:text-destructive hover:bg-transparent"
                      aria-label={`Remove ${attachment.name}`}
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {voiceStatus !== 'idle' ? (
            <div className="flex items-center gap-2 rounded-xl border-2 border-border-strong bg-muted/30 px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardVoiceRecording}
                className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive fast-transition sm:h-8 sm:w-8"
                aria-label="Delete recording"
                title="Delete recording"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <div className="flex items-end gap-[2px] h-7 sm:gap-[3px]" aria-hidden="true">
                  {Array.from({ length: 22 }).map((_, index) => {
                    const wave = 0.25 + 0.75 * Math.abs(Math.sin(voiceLevel * Math.PI * 2 + index * 0.45));
                    const height = Math.max(0.08, voiceLevel * wave);
                    return (
                      <span
                        key={index}
                        className={cn(
                          "w-[3px] rounded-full transition-all duration-75",
                          index >= 12 && "hidden sm:block"
                        )}
                        style={{
                          height: `${height * 100}%`,
                          background: voiceStatus === 'paused' ? 'var(--muted-foreground)' : 'var(--destructive)',
                          opacity: voiceStatus === 'paused' ? 0.4 : 0.9,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                  {formatVoiceTime(voiceSeconds)}
                </span>
                <span className="text-xs truncate text-muted-foreground min-w-0">
                  {voiceStatus === 'paused'
                    ? 'Paused'
                    : voiceTranscript
                      ? voiceTranscript
                      : 'Listening...'}
                </span>
              </div>
              {voiceStatus === 'recording' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={pauseVoiceRecording}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground fast-transition sm:h-8 sm:w-8"
                  aria-label="Pause recording"
                  title="Pause recording"
                >
                  <Pause className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resumeVoiceRecording}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground fast-transition sm:h-8 sm:w-8"
                  aria-label="Resume recording"
                  title="Resume recording"
                >
                  <Play className="w-4 h-4" />
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={!voiceTranscript.trim()}
                onClick={sendVoiceRecording}
                className="h-9 w-9 p-0 smooth-transition hover:shadow-glow disabled:opacity-50 sm:h-8 sm:w-8"
                style={{ background: 'var(--gradient-primary)' }}
                aria-label="Send recording"
                title="Send recording"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* DeepSeek-style composer: the text area spans the full card, and
                  the controls live on their own row beneath it rather than
                  competing with the input in a single cramped line. */}
              <Textarea
                ref={textareaRef}
                placeholder="Message Super AI"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                aria-label="Message Super AI"
                className="w-full min-h-14 max-h-60 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-2 pt-3 pb-1 text-base sm:text-sm text-foreground placeholder:text-muted-foreground leading-relaxed shadow-none outline-none caret-primary focus:outline-none focus-visible:outline-none focus:border-0 focus-visible:border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                rows={1}
              />

              <div className="flex items-center justify-between gap-2 px-0.5 pb-0.5">
                {/* Left: reasoning + model pills, inside the composer on every
                    screen size. */}
                <div className="flex min-w-0 items-center gap-2">
                  <ThinkingToggle
                    variant="composer"
                    checked={showThinking}
                    onCheckedChange={handleThinkingToggle}
                  />
                  <ModelSelector
                    variant="composer"
                    value={modelPreference}
                    onValueChange={handleModelChange}
                  />
                </div>

                {/* Right: attach / emoji / voice + send. */}
                <div className="flex flex-shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                    aria-label="Attach a file"
                    title="Attach a file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                        aria-label="Insert emoji"
                        title="Insert emoji (Ctrl+Shift+E)"
                      >
                        <Smile className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      side="top"
                      sideOffset={8}
                      onFocusOutside={(event) => event.preventDefault()}
                      className="w-auto border-border/60 p-0 shadow-modern overflow-hidden"
                    >
                      <EmojiPicker
                        height={380}
                        width={Math.min(320, window.innerWidth - 24)}
                        lazyLoadEmojis
                        theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                        onEmojiClick={handleEmojiClick}
                      />
                    </PopoverContent>
                  </Popover>

                  {!newMessage.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={startVoiceRecording}
                      className="h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                      aria-label="Start voice recording"
                      title="Start voice recording (Ctrl+M)"
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                  )}

                  {isStreaming ? (
                    <Button
                      type="button"
                      onClick={handleStopGeneration}
                      size="sm"
                      className="ml-1 h-9 w-9 flex-shrink-0 rounded-full p-0 smooth-transition hover:shadow-glow hover:scale-105"
                      style={{ background: 'var(--gradient-primary)' }}
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={!newMessage.trim() && pendingAttachments.length === 0}
                      size="sm"
                      className="ml-1 h-9 w-9 flex-shrink-0 rounded-full p-0 smooth-transition hover:shadow-glow hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                      style={{ background: 'var(--gradient-primary)' }}
                      aria-label="Send message"
                      title="Send message"
                    >
                      <Send className="w-[18px] h-[18px]" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <div className="mt-2 hidden px-1 text-center text-xs text-muted-foreground sm:block">
            Enter to send · Shift+Enter for a new line · / focuses input · Ctrl+M voice · Ctrl+Shift+E emoji
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Delete ${selectedConversationIds.size} Chats?`
                : 'Delete Chat?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Are you sure you want to delete ${selectedConversationIds.size} conversations? All messages and any uploaded media files in them will be permanently deleted and cannot be recovered.`
                : 'Are you sure you want to delete this conversation? All messages and any uploaded media files will be permanently deleted and cannot be recovered.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Delete ${selectedConversationIds.size} Chats`
                : 'Delete Chat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Give this conversation a new name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Conversation title"
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmRename();
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRename}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRename}>Rename</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarShell>
  );
};

export default Chat;