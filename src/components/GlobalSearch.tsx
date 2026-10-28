import React, { useState, useEffect } from 'react';
import { Search, X, Radio, Activity, Wrench, Zap, MessageSquare, ChevronRight } from 'lucide-react';
import { useAudio } from '../context/AudioContext';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tabId: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, onNavigate }) => {
  const { playTacticalClick } = useAudio();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'ride':
        return <Radio className="w-4 h-4 text-[#42B883]" />;
      case 'problem':
        return <Activity className="w-4 h-4 text-[#E8AA45]" />;
      case 'modification':
        return <Wrench className="w-4 h-4 text-[#729BCB]" />;
      case 'charger':
        return <Zap className="w-4 h-4 text-[#42B883]" />;
      case 'discussion':
      default:
        return <MessageSquare className="w-4 h-4 text-[#AEB5BE]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-start justify-center pt-20 p-4 font-mono">
      <div className="bg-[#13161A] border border-[#414851] rounded-lg max-w-xl w-full shadow-2xl overflow-hidden">
        {/* Search Input Bar */}
        <div className="p-3 bg-[#0D0F12] border-b border-[#282D34] flex items-center space-x-2">
          <Search className="w-4 h-4 text-[#707883]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sorties, error codes, modifications, chargers, discussions..."
            className="flex-1 bg-transparent border-none text-[#F1F3F5] text-xs focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-[#707883] hover:text-[#F1F3F5]"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-[#282D34]/50 text-xs">
          {searching && (
            <div className="text-center py-6 text-[#707883]">
              QUERYING SQUADRON KNOWLEDGE BASE...
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <div className="text-center py-8 text-[#707883]">
              NO MATCHES FOUND FOR "{query}"
            </div>
          )}

          {!searching &&
            results.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  playTacticalClick();
                  onNavigate(item.link);
                  onClose();
                }}
                className="p-3 hover:bg-[#191D22] rounded cursor-pointer flex items-center justify-between transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded bg-[#08090B] border border-[#282D34] group-hover:border-[#414851]">
                    {getIcon(item.type)}
                  </div>
                  <div>
                    <div className="text-[#F1F3F5] font-semibold">{item.title}</div>
                    <div className="text-[11px] text-[#A0A7B0] line-clamp-1">{item.snippet}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-[#707883]">
                  <span className="uppercase">{item.type}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}

          {!query.trim() && (
            <div className="p-4 text-center text-[#707883] text-[11px]">
              Type keywords to search across sorties, discussions, technical codes, and charging points.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
