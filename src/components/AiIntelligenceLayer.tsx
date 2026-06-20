import React, { useState } from 'react';
import { useContractStore } from '../lib/store';
import { Brain, Sparkles, Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AiIntelligenceLayer() {
  const [query, setQuery] = useState('');
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const serverState = useContractStore(s => s.serverState);
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const themeMode = useContractStore(s => s.themeMode);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setInsight('');
    
    try {
      // Guard every field: when serverState/gex_profile is absent, naive
      // interpolation would put "$NaN" / "$undefined" into the model prompt.
      const gex = serverState?.gex_profile;
      const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
      const usd = (v: any): string => { const n = num(v); return n !== null ? `$${n}` : 'N/A'; };
      const netGex = num(gex?.netGex);
      const prompt = `You are a quantitative institutional trading AI analyzing the dealer flow for ${selectedAsset.ticker}.

Current Dealer Context for ${selectedAsset.ticker}:
- Net GEX: ${netGex !== null ? `$${(netGex / 1e9).toFixed(2)}B` : 'N/A'}
- Spot Price: ${usd(gex?.spot)}
- Gamma Flip: ${usd(gex?.gammaFlip)}
- Call Wall: ${usd(gex?.callWall)}
- Put Wall: ${usd(gex?.putWall)}

User Query: ${query}

Provide a comprehensive analysis based on this data.`;

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setInsight(data.result);
    } catch (err: any) {
      setInsight('AI Analysis failed. Please confirm your API key is configured properly.');
    } finally {
      setLoading(false);
    }
  };

  const isLight = themeMode === 'light';

  return (
    <div className={`rounded-lg p-5 flex flex-col gap-4 border ${isLight ? 'bg-white border-black shadow-sm' : 'bg-black/40 border-black/60 shadow-inner'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#4ADE80]/10 border border-[#4ADE80] flex items-center justify-center">
            <Brain className="w-4 h-4 text-[#4ADE80]" />
          </div>
          <div>
            <h2 className={`text-sm font-black tracking-widest uppercase ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>Deep Thinking AI</h2>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">Powered by institutional-grade reasoning models</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAsk} className="flex gap-3 mt-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Ask the thinking AI about ${selectedAsset.ticker} market structure...`}
          className={`flex-1 px-4 py-2 text-sm font-mono border rounded outline-none transition-colors ${
            isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-500' : 'bg-black/60 border-zinc-800 text-zinc-100 focus:border-zinc-500'
          }`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 px-5 py-2 font-black tracking-widest text-[#E5E5E5] text-[10px] uppercase bg-indigo-600 rounded cursor-pointer hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Analyze
        </button>
      </form>

      {loading && (
        <div className="p-4 flex gap-3 text-zinc-400 font-mono text-sm items-center border border-zinc-800 rounded mt-2 animate-pulse">
          <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          The AI is thinking deeply... this may take up to a minute for complex structural reasoning.
        </div>
      )}

      {!loading && insight && (
        <div className={`p-4 mt-2 border rounded font-sans leading-relaxed ${
          isLight ? 'bg-zinc-50/50 border-zinc-200 text-zinc-800' : 'bg-black/50 border-zinc-800 text-zinc-300'
        }`}>
          <div className="prose prose-sm max-w-none dark:prose-invert prose-emerald leading-normal font-sans">
            <Markdown remarkPlugins={[remarkGfm]}>{insight}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
