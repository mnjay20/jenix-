import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with custom theme options
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'Inter, Outfit, sans-serif',
    themeVariables: {
        background: '#0C0A12',
        primaryColor: '#8b5cf6', // purple-500/accent
        primaryTextColor: '#f4f4f5', // zinc-100
        lineColor: '#3f3f46', // zinc-700
        secondaryColor: '#3b82f6', // blue-500
        tertiaryColor: '#10b981', // emerald-500
    }
});

interface MermaidRendererProps {
    chart: string;
}

const cleanMermaidChart = (rawChart: string): string => {
    let clean = rawChart.trim();
    
    // Remove markdown code blocks if the LLM outputted them
    if (clean.startsWith('```')) {
        const lines = clean.split('\n');
        if (lines[0].startsWith('```')) {
            lines.shift();
        }
        if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) {
            lines.pop();
        }
        clean = lines.join('\n').trim();
    }
    
    // Clean inline code ticks
    clean = clean.replace(/^```mermaid\s+/i, '').replace(/```$/, '').trim();
    return clean;
};

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

        const renderChart = async () => {
            try {
                const cleanedChart = cleanMermaidChart(chart);
                if (!cleanedChart) {
                    if (isMounted) setSvg('');
                    return;
                }

                // render method returns an object with svg content
                const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanedChart);
                if (isMounted) {
                    setSvg(renderedSvg);
                    setError(null);
                }
            } catch (err: any) {
                console.error("[MermaidRenderer] Render failed:", err);
                if (isMounted) {
                    setError(err?.message || "Failed to render Mermaid diagram. Please verify the diagram syntax.");
                }
            }
        };

        renderChart();

        return () => {
            isMounted = false;
        };
    }, [chart]);

    if (error) {
        return (
            <div className="border border-rose-950/40 bg-rose-950/10 text-rose-400 p-3 rounded-xl font-mono text-[10px] space-y-2 select-text">
                <div className="font-bold uppercase tracking-wider text-rose-500">Mermaid Render Error</div>
                <div className="text-[11px] leading-relaxed whitespace-pre-wrap">{error}</div>
                <div className="pt-2 border-t border-rose-900/20">
                    <div className="text-[8px] uppercase tracking-wider text-zinc-500 mb-1">Source Code:</div>
                    <pre className="p-2 bg-zinc-950/80 rounded border border-zinc-900 overflow-x-auto leading-tight text-zinc-300">
                        {chart}
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef} 
            className="flex justify-center items-center w-full bg-zinc-950/60 p-4 border border-zinc-800/60 rounded-xl overflow-x-auto custom-scrollbar transition-all duration-300"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};
