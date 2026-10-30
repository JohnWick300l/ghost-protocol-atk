import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAudio } from '../context/AudioContext';

interface BackButtonProps {
  onBack?: () => void;
  label?: string;
  className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  label = 'BACK',
  className = ''
}) => {
  const { playTacticalClick } = useAudio();

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    playTacticalClick();
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined') {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        const url = new URL(window.location.href);
        url.searchParams.delete('route');
        window.location.href = url.toString();
      }
    }
  };

  return (
    <button
      type="button"
      data-testid="page-back-button"
      onClick={handleBackClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1624] hover:bg-[#182438] border border-[#38BDF8]/40 hover:border-[#38BDF8] text-[#38BDF8] font-mono text-xs font-bold tracking-wider transition-all cursor-pointer shadow-md group shrink-0 ${className}`}
      title="Navigate to previous page"
      aria-label={label}
    >
      <ArrowLeft className="w-4 h-4 text-[#38BDF8] group-hover:-translate-x-0.5 transition-transform shrink-0" />
      <span>{label}</span>
    </button>
  );
};
