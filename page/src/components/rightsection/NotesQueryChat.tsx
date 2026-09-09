import React, { useState, useRef, useEffect } from 'react';
import { useSocketStore } from '../../store/socketstore';
import { userStore } from '../../store/userStore';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Avatar } from '../ui/avatar';
import { 
    Send, Sparkles, Bot, User, Trash2, Copy, Check, AlertCircle, 
    BookOpen, ChevronDown, ChevronUp, Clock
} from 'lucide-react';

export interface CitationItem {
    sessionId: string;
    videoTitle: string;
    videoUrl?: string;
    chunkId?: number;
    timestamp?: number;
    timestampFormatted?: string;
    textSnippet: string;
    score?: number;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: CitationItem[];
    timestamp: Date;
    isError?: boolean;
}

const BACKEND_URL = "http://localhost:3000";

export const NotesQueryChat: React.FC = () => {
    const activeSessionId = useSocketStore(state => state.sessionId);
    const activeVideoTitle = useSocketStore(state => state.videoTitle);
    const topics = useSocketStore(state => state.topics);
    const user = userStore(state => state.user);

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const key = `jenix_chat_${activeSessionId || 'default'}`;
        const legacyKey = `notemind_chat_${activeSessionId || 'default'}`;
        const saved = sessionStorage.getItem(key) || sessionStorage.getItem(legacyKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            } catch (e) {
                return [];
            }
        }
        return [];
    });

    const [inputQuery, setInputQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Save chat messages per session
    useEffect(() => {
        if (messages.length > 0) {
            sessionStorage.setItem(`jenix_chat_${activeSessionId || 'default'}`, JSON.stringify(messages));
        }
    }, [messages, activeSessionId]);

    // Scroll to bottom on new message or loading state change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = async (queryText?: string) => {
        const textToSend = (queryText || inputQuery).trim();
        if (!textToSend || isLoading) return;

        const userMsg: ChatMessage = {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: textToSend,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInputQuery('');
        setIsLoading(true);

        try {
            const response = await fetch(`${BACKEND_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: activeSessionId || undefined,
                    userId: user?.userId || undefined,
                    query: textToSend,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || `Server returned error ${response.status}`);
            }

            const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: data.answer || "I processed your query, but no response was generated.",
                citations: data.citations || [],
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            console.error("Notes Q&A Error:", err);
            const errorMsg: ChatMessage = {
                id: `msg_${Date.now()}_error`,
                role: 'assistant',
                content: `Unable to query notes: ${err.message || "Please ensure the backend is running and try again."}`,
                timestamp: new Date(),
                isError: true,
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleCopyMessage = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleClearChat = () => {
        setMessages([]);
        sessionStorage.removeItem(`jenix_chat_${activeSessionId || 'default'}`);
        sessionStorage.removeItem(`notemind_chat_${activeSessionId || 'default'}`);
    };

    const toggleCitations = (msgId: string) => {
        setExpandedCitations(prev => ({
            ...prev,
            [msgId]: !prev[msgId]
        }));
    };

    const starterQuestions = [
        "In which session or lecture did I learn this and what is the meaning of this?",
        "What are the core concepts and definitions discussed in this session?",
        "Summarize the key formulas, algorithms, or code examples.",
        "What are the main exam takeaways from these notes?"
    ];

    return (
        <div className="flex flex-col h-full w-full bg-theme-charcoal select-text font-sans">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 bg-theme-plum/10 shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-theme-accent animate-pulse" />
                    <span className="text-xs font-bold text-zinc-200">Notes Q&A Assistant</span>
                    {activeVideoTitle && (
                        <Badge variant="plum" className="text-[10px] max-w-[200px] truncate">
                            {activeVideoTitle}
                        </Badge>
                    )}
                </div>

                {messages.length > 0 && (
                    <Button
                        onClick={handleClearChat}
                        variant="ghost"
                        size="xs"
                        className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 text-[10px] h-6 px-2 flex items-center gap-1 cursor-pointer"
                    >
                        <Trash2 size={11} />
                        <span>Clear</span>
                    </Button>
                )}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 text-zinc-400">
                        <div className="size-12 rounded-2xl bg-theme-plum/30 border border-theme-accent/30 flex items-center justify-center text-theme-accent mb-3 shadow-lg shadow-theme-accent/5">
                            <Bot size={24} />
                        </div>
                        <h4 className="text-sm font-semibold text-zinc-200">Ask Jenix AI</h4>
                        <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-5">
                            Ask questions strictly grounded in your lecture notes and audio transcripts. The AI will cite exact lectures, timestamps, and explanations.
                        </p>

                        {/* Starter Prompt Chips */}
                        <div className="w-full max-w-md space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                                Suggested Questions
                            </span>
                            <div className="grid grid-cols-1 gap-2">
                                {starterQuestions.map((q, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSendMessage(q)}
                                        className="text-left text-xs bg-zinc-900/80 hover:bg-theme-plum/20 border border-zinc-800/80 hover:border-theme-accent/40 rounded-xl p-2.5 text-zinc-300 hover:text-white transition-all flex items-start gap-2 group cursor-pointer shadow-sm"
                                    >
                                        <BookOpen size={13} className="text-theme-accent shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                        <span className="leading-snug">{q}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.role === 'assistant' && (
                                <Avatar className="size-7 bg-theme-plum/40 border-theme-accent/40 text-theme-accent shrink-0 mt-0.5">
                                    <Bot size={14} />
                                </Avatar>
                            )}

                            <div className={`flex flex-col max-w-[85%] space-y-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed transition-all shadow-sm ${
                                        msg.role === 'user'
                                            ? 'bg-theme-accent/20 border border-theme-accent/35 text-zinc-100 rounded-tr-xs'
                                            : msg.isError
                                            ? 'bg-rose-950/30 border border-rose-800/50 text-rose-300 rounded-tl-xs'
                                            : 'bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 rounded-tl-xs'
                                    }`}
                                >
                                    {msg.isError && (
                                        <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1 text-[11px]">
                                            <AlertCircle size={12} />
                                            <span>Query Error</span>
                                        </div>
                                    )}

                                    {/* Render curated message body with rich academic Markdown formatting */}
                                    <CuratedAnswerRenderer content={msg.content} />
                                </div>

                                {/* Citations Section (Assistant Only) */}
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="w-full bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-2 space-y-2 mt-1">
                                        <button
                                            onClick={() => toggleCitations(msg.id)}
                                            className="w-full flex items-center justify-between text-[10px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <BookOpen size={11} className="text-theme-accent" />
                                                <span>{msg.citations.length} {msg.citations.length === 1 ? 'Source Citation' : 'Source Citations'}</span>
                                            </div>
                                            {expandedCitations[msg.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>

                                        {expandedCitations[msg.id] && (
                                            <div className="space-y-2 pt-1 border-t border-zinc-800/40">
                                                {msg.citations.map((c, cIdx) => (
                                                    <div key={cIdx} className="bg-zinc-900/60 border border-zinc-800/40 rounded-lg p-2 text-[10px] space-y-1">
                                                        <div className="flex items-center justify-between font-mono">
                                                            <span className="font-semibold text-theme-accent truncate max-w-[180px]">
                                                                {c.videoTitle}
                                                            </span>
                                                            {c.timestampFormatted && (
                                                                <span className="bg-theme-plum/30 text-zinc-300 px-1.5 py-0.2 rounded text-[9px] flex items-center gap-1">
                                                                    <Clock size={9} />
                                                                    <span>{c.timestampFormatted}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-zinc-400 leading-snug line-clamp-3 font-sans italic">
                                                            "{c.textSnippet}"
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Bottom Metadata & Actions */}
                                <div className="flex items-center gap-2 text-[9px] text-zinc-500 px-1">
                                    <span>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {msg.role === 'assistant' && !msg.isError && (
                                        <button
                                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                                            className="hover:text-zinc-300 transition-colors flex items-center gap-0.5 cursor-pointer"
                                            title="Copy response"
                                        >
                                            {copiedId === msg.id ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {msg.role === 'user' && (
                                <Avatar className="size-7 bg-zinc-800 border-zinc-700 text-zinc-300 shrink-0 mt-0.5">
                                    <User size={14} />
                                </Avatar>
                            )}
                        </div>
                    ))
                )}

                {/* Loading / Thinking Indicator */}
                {isLoading && (
                    <div className="flex gap-3 justify-start items-center">
                        <Avatar className="size-7 bg-theme-plum/40 border-theme-accent/40 text-theme-accent shrink-0">
                            <Bot size={14} />
                        </Avatar>
                        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl rounded-tl-xs px-3.5 py-2.5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-theme-accent animate-ping"></span>
                            <span className="text-xs text-zinc-400">Searching notes and generating answer...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/80 shrink-0">
                <div className="relative flex items-center bg-zinc-900/90 border border-zinc-800/80 rounded-2xl focus-within:border-theme-accent/50 focus-within:ring-1 focus-within:ring-theme-accent/30 transition-all p-1.5">
                    <Textarea
                        ref={textareaRef}
                        value={inputQuery}
                        onChange={(e) => setInputQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={topics.length > 0 ? "Ask anything about your lecture notes (e.g., In which session did I learn X?)..." : "Start lecture playback or ask questions about existing sessions..."}
                        className="w-full bg-transparent border-0 text-xs min-h-[44px] max-h-32 px-2.5 py-1.5 focus-visible:ring-0 shadow-none text-zinc-100 placeholder:text-zinc-500"
                        rows={1}
                        disabled={isLoading}
                    />

                    <Button
                        onClick={() => handleSendMessage()}
                        isDisabled={!inputQuery.trim() || isLoading}
                        size="icon-sm"
                        variant="default"
                        className={`size-8 rounded-xl shrink-0 transition-all ${
                            inputQuery.trim() && !isLoading
                                ? "bg-theme-accent text-white hover:bg-theme-accent/90 cursor-pointer shadow-md shadow-theme-accent/20"
                                : "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50"
                        }`}
                    >
                        <Send size={13} />
                    </Button>
                </div>
                <div className="flex items-center justify-between px-1.5 pt-1.5 text-[9px] text-zinc-500 font-mono">
                    <span>Press <kbd className="bg-zinc-800 px-1 py-0.2 rounded text-zinc-400">Enter</kbd> to send, <kbd className="bg-zinc-800 px-1 py-0.2 rounded text-zinc-400">Shift+Enter</kbd> for new line</span>
                    <span>Guarded RAG Study Engine</span>
                </div>
            </div>
        </div>
    );
};

const CuratedAnswerRenderer: React.FC<{ content: string }> = ({ content }) => {
    if (!content) return null;

    if (content.includes('```')) {
        const parts: React.ReactNode[] = [];
        const codeRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = codeRegex.exec(content)) !== null) {
            const prefixText = content.substring(lastIndex, match.index);
            if (prefixText) {
                parts.push(<FormattedTextBlock key={`text-${lastIndex}`} text={prefixText} />);
            }

            const lang = match[1]?.trim() || 'code';
            const codeText = match[2]?.trim() || '';

            parts.push(
                <div key={`code-${match.index}`} className="my-2 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-md">
                    <div className="px-3 py-1 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                        <span className="text-theme-accent font-bold uppercase">{lang}</span>
                    </div>
                    <pre className="p-2.5 text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre custom-scrollbar">
                        {codeText}
                    </pre>
                </div>
            );

            lastIndex = codeRegex.lastIndex;
        }

        const suffixText = content.substring(lastIndex);
        if (suffixText) {
            parts.push(<FormattedTextBlock key={`text-${lastIndex}`} text={suffixText} />);
        }

        return <div className="space-y-2 font-sans">{parts}</div>;
    }

    return <div className="font-sans"><FormattedTextBlock text={content} /></div>;
};

const FormattedTextBlock: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');

    return (
        <div className="space-y-1.5 leading-relaxed text-xs">
            {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={idx} className="h-1" />;

                if (line.startsWith('### ')) {
                    return (
                        <h4 key={idx} className="text-xs font-bold text-theme-accent pt-1 pb-0.5 border-b border-zinc-800/60 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-theme-accent"></span>
                            <span>{line.slice(4)}</span>
                        </h4>
                    );
                }
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    return (
                        <h3 key={idx} className="text-xs font-bold text-zinc-100 pt-1.5 pb-0.5 uppercase tracking-wider flex items-center gap-1.5">
                            <span>{line.replace(/^#+\s*/, '')}</span>
                        </h3>
                    );
                }

                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    return (
                        <div key={idx} className="flex items-start gap-2 pl-2 text-zinc-200">
                            <span className="text-theme-accent font-bold text-[10px] mt-0.5">•</span>
                            <span>{renderInlineFormatting(trimmed.slice(2))}</span>
                        </div>
                    );
                }

                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    return (
                        <div key={idx} className="flex items-start gap-2 pl-2 text-zinc-200">
                            <span className="text-theme-accent font-mono text-[10px] mt-0.5 font-bold">{numMatch[1]}.</span>
                            <span>{renderInlineFormatting(numMatch[2])}</span>
                        </div>
                    );
                }

                return (
                    <p key={idx} className="text-zinc-200">
                        {renderInlineFormatting(line)}
                    </p>
                );
            })}
        </div>
    );
};

function renderInlineFormatting(str: string): React.ReactNode {
    if (!str) return str;

    const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={idx} className="font-semibold text-zinc-100 bg-theme-plum/30 px-1 py-0.2 rounded border border-theme-accent/20">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={idx} className="font-mono text-[11px] text-emerald-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return part;
    });
}
