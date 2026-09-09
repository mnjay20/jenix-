import React from 'react';
import './GhostLoader.css';

interface GhostLoaderProps {
  label?: string;
  sublabel?: string;
  compact?: boolean;
}

export const GhostLoader: React.FC<GhostLoaderProps> = ({
  label = "Generating Notes...",
  sublabel = "AI is transcribing and structuring lecture notes in real-time",
  compact = false,
}) => {
  return (
    <div className={`ghost-container ${compact ? 'py-4' : 'py-10'}`}>
      <div id="ghost" style={{ transform: compact ? 'scale(0.55)' : 'scale(0.8)' }}>
        <div id="red">
          <div id="top0"></div>
          <div id="top1"></div>
          <div id="top2"></div>
          <div id="top3"></div>
          <div id="top4"></div>
          <div id="st0"></div>
          <div id="st1"></div>
          <div id="st2"></div>
          <div id="st3"></div>
          <div id="st4"></div>
          <div id="st5"></div>
          <div id="an1"></div>
          <div id="an2"></div>
          <div id="an3"></div>
          <div id="an4"></div>
          <div id="an5"></div>
          <div id="an6"></div>
          <div id="an7"></div>
          <div id="an8"></div>
          <div id="an9"></div>
          <div id="an10"></div>
          <div id="an11"></div>
          <div id="an12"></div>
          <div id="an13"></div>
          <div id="an14"></div>
          <div id="an15"></div>
          <div id="an16"></div>
          <div id="an17"></div>
          <div id="an18"></div>
          <div id="eye"></div>
          <div id="eye1"></div>
          <div id="pupil"></div>
          <div id="pupil1"></div>
        </div>
        <div id="shadow"></div>
      </div>

      <div className={`text-center ${compact ? 'mt-3' : 'mt-8'} space-y-1`}>
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold tracking-wide text-zinc-100 uppercase animate-pulse font-heading`}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
};
