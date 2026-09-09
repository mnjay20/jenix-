import React from 'react';
import type { Topic, NoteBlock } from '../../store/socketstore';
import { FileText, Code2, Table as TableIcon } from 'lucide-react';
import { GhostLoader } from './GhostLoader';
import { MermaidRenderer } from './MermaidRenderer';

interface NotesRendererProps {
    topics: Topic[];
    isGenerating?: boolean;
    generationStatus?: string;
}

export const NotesRenderer: React.FC<NotesRendererProps> = ({ 
    topics, 
    isGenerating = false,
    generationStatus 
}) => {
    if (!topics || topics.length === 0) {
        if (isGenerating) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] h-full text-center p-6 font-sans">
                    <GhostLoader 
                        label={generationStatus || "Generating Study Notes..."} 
                        sublabel="AI is extracting audio and structuring notes for your session"
                    />
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-zinc-500 font-sans">
                <FileText size={36} className="mb-2 text-zinc-600 opacity-60 animate-pulse" />
                <p className="text-sm font-semibold">No notes generated yet</p>
                <p className="text-xs text-zinc-600 max-w-xs mt-1">Start video generation or play the video to begin receiving AI study notes.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 custom-scrollbar select-text overflow-y-auto max-h-[85vh] pr-2">
            {topics.map((topic, tIdx) => {
                const textBlocks = (topic.blocks || []).filter(block => block && block.type !== 'image');
                if (textBlocks.length === 0 && !topic.title) return null;

                return (
                    <div key={tIdx} className="space-y-3 p-4 bg-[#13111C]/80 border border-purple-900/30 rounded-2xl shadow-xl backdrop-blur-md transition-all hover:border-purple-700/40">
                        {topic.title && (
                            <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-purple-900/30 pb-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50"></span>
                                <span>{topic.title}</span>
                            </h4>
                        )}
                        <div className="space-y-3 pt-1">
                            {textBlocks.map((block, bIdx) => (
                                <NoteBlockComponent key={bIdx} block={block} />
                            ))}
                        </div>
                    </div>
                );
            })}

            {isGenerating && (
                <div className="pt-4 border-t border-purple-900/30">
                    <div className="bg-[#13111C]/90 border border-purple-900/40 rounded-2xl p-4 flex flex-col items-center justify-center backdrop-blur-md">
                        <GhostLoader 
                            compact 
                            label="Processing Next Section..." 
                            sublabel="Transcribing and analyzing incoming audio"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const NoteBlockComponent: React.FC<{ block: NoteBlock }> = ({ block }) => {
    switch (block.type) {
        // 1. Heading Block
        case 'heading': {
            const text = block.content || block.title || '';
            return (
                <h3 className="pt-2 pb-1 text-sm font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                    <span>{text}</span>
                </h3>
            );
        }

        // 2. Paragraph Block
        case 'paragraph':
            return (
                <p className="text-xs leading-relaxed text-zinc-300 font-normal">
                    {formatTextWithBold(block.content || '')}
                </p>
            );

        // 3. List Block for bullet / numbered points
        case 'list': {
            const isNumbered = block.style === 'numbered';
            const Tag = isNumbered ? 'ol' : 'ul';
            const titleText = block.title || block.content;
            const items = (block.items || []).filter(item => item && item.trim() !== "");
            
            const hasHeader = !!(titleText && titleText.trim());
            const isSingleDuplicate = hasHeader && items.length === 1 && 
                items[0].trim().toLowerCase() === titleText.trim().toLowerCase();

            return (
                <div className="space-y-1.5 my-2">
                    {hasHeader && (
                        <h5 className="text-[11px] font-semibold text-zinc-200">
                            {titleText}
                        </h5>
                    )}
                    {(!isSingleDuplicate && items.length > 0) && (
                        <Tag className={`list-outside pl-4 space-y-1.5 text-xs text-zinc-300 ${isNumbered ? 'list-decimal' : 'list-disc'}`}>
                            {items.map((item, index) => (
                                <li key={index} className="leading-relaxed pl-1">
                                    {formatTextWithBold(item)}
                                </li>
                            ))}
                        </Tag>
                    )}
                </div>
            );
        }

        // 4. General Block (Renders Markdown Tables, Code Snippets, Mermaid Diagrams)
        case 'general': {
            const titleText = block.title;
            const rawContent = block.content || '';

            // Mermaid Diagram Check
            const isMermaid = rawContent.includes('```mermaid') || rawContent.trim().startsWith('graph ') || rawContent.trim().startsWith('sequenceDiagram') || rawContent.trim().startsWith('flowchart ');

            if (isMermaid) {
                const chartCode = rawContent.replace(/^```mermaid\s+/i, '').replace(/```$/, '').trim();
                return (
                    <div className="my-3 space-y-2">
                        {titleText && <h5 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">{titleText}</h5>}
                        <MermaidRenderer chart={chartCode} />
                    </div>
                );
            }

            // Fenced Code Block Check (handles code blocks anywhere in content)
            if (rawContent.includes('```')) {
                const parts: React.ReactNode[] = [];
                const codeRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
                let lastIndex = 0;
                let match: RegExpExecArray | null;

                while ((match = codeRegex.exec(rawContent)) !== null) {
                    const prefixText = rawContent.substring(lastIndex, match.index).trim();
                    if (prefixText) {
                        parts.push(
                            <div key={`text-${lastIndex}`} className="text-xs text-zinc-200 leading-relaxed font-sans my-1.5">
                                {formatTextWithBold(prefixText)}
                            </div>
                        );
                    }

                    const lang = match[1]?.trim() || 'code';
                    const codeText = match[2]?.trim() || '';

                    parts.push(
                        <div key={`code-${match.index}`} className="my-3 space-y-1 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-md">
                            <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                <span className="flex items-center gap-1 text-purple-400 font-bold uppercase">
                                    <Code2 size={12} />
                                    {lang}
                                </span>
                                {titleText && <span>{titleText}</span>}
                            </div>
                            <pre className="p-3 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre custom-scrollbar">
                                {codeText}
                            </pre>
                        </div>
                    );

                    lastIndex = codeRegex.lastIndex;
                }

                const suffixText = rawContent.substring(lastIndex).trim();
                if (suffixText) {
                    parts.push(
                        <div key={`text-${lastIndex}`} className="text-xs text-zinc-200 leading-relaxed font-sans my-1.5">
                            {formatTextWithBold(suffixText)}
                        </div>
                    );
                }

                if (parts.length > 0) {
                    return (
                        <div className="my-2 space-y-1">
                            {titleText && <h5 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">{titleText}</h5>}
                            {parts}
                        </div>
                    );
                }
            }

            // Markdown Table Check
            if (rawContent.includes('|') && rawContent.includes('---')) {
                return (
                    <div className="my-3 space-y-2">
                        {titleText && (
                            <h5 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TableIcon size={12} />
                                {titleText}
                            </h5>
                        )}
                        <MarkdownTableRenderer tableMarkdown={rawContent} />
                    </div>
                );
            }

            return (
                <div className="my-2 space-y-1.5 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/50">
                    {titleText && <h5 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">{titleText}</h5>}
                    <div className="text-xs text-zinc-200 leading-relaxed font-sans overflow-x-auto custom-scrollbar">
                        {formatTextWithBold(rawContent)}
                    </div>
                </div>
            );
        }

        case 'image':
            return null;

        default:
            return block.content ? <div className="text-xs text-zinc-300 leading-relaxed">{formatTextWithBold(block.content)}</div> : null;
    }
};

/**
 * Renders Markdown tables as styled HTML <table> elements
 */
const MarkdownTableRenderer: React.FC<{ tableMarkdown: string }> = ({ tableMarkdown }) => {
    try {
        const lines = tableMarkdown.trim().split('\n').filter(line => line.trim().startsWith('|'));
        if (lines.length < 2) return <div className="text-xs text-zinc-300 whitespace-pre-wrap">{tableMarkdown}</div>;

        const parseRow = (rowStr: string) => rowStr.split('|').slice(1, -1).map(cell => cell.trim());

        const headers = parseRow(lines[0] || '');
        const dataRows = lines.slice(2).map(parseRow);

        return (
            <div className="overflow-x-auto rounded-xl border border-purple-900/40 shadow-lg my-2 custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse bg-zinc-950/80">
                    <thead>
                        <tr className="bg-purple-950/40 border-b border-purple-900/40 text-purple-300 text-[11px] font-bold">
                            {headers.map((h, hIdx) => (
                                <th key={hIdx} className="px-3 py-2 font-bold uppercase tracking-wider">
                                    {formatTextWithBold(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                        {dataRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-purple-900/10 transition-colors">
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="px-3 py-2 text-zinc-200 text-xs">
                                        {formatTextWithBold(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    } catch {
        return <div className="text-xs text-zinc-300 whitespace-pre-wrap">{tableMarkdown}</div>;
    }
};

/**
 * Formats **bold** text strings cleanly into <strong> components
 */
function formatTextWithBold(text: string): React.ReactNode {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={idx} className="font-bold text-zinc-100 bg-purple-950/30 px-1 py-0.5 rounded border border-purple-800/30">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        return part;
    });
}
