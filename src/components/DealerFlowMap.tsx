import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface DealerFlowMapProps {
  profile: any;
  decimals: number;
}

export function DealerFlowMap({ profile, decimals }: DealerFlowMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !profile || !profile.strikes || profile.strikes.length === 0) return;

    // Resolve the active theme tokens once so the D3 chart matches the rest of
    // the token-driven UI (light/dark/custom themes) instead of hardcoded hexes.
    const css = getComputedStyle(document.documentElement);
    const tok = (name: string, fallback: string) => {
      const v = css.getPropertyValue(name).trim();
      return v || fallback;
    };
    const theme = {
      success: tok('--success', '#4ADE80'),
      danger: tok('--danger', '#F87171'),
      warning: tok('--warning', '#FBBF24'),
      info: tok('--info', '#60A5FA'),
      surface: tok('--surface', '#141414'),
      border: tok('--border-strong', 'rgba(255,255,255,0.18)'),
      grid: tok('--border', 'rgba(255,255,255,0.10)'),
      textPrimary: tok('--text-primary', '#E5E5E5'),
      textTertiary: tok('--text-tertiary', '#A3A3A3'),
    };

    const strikes = profile.strikes;
    const spot = profile.spot;
    const callWall = profile.callWall;
    const putWall = profile.putWall;
    const magnet = profile.magnet;

    // Clear previous
    d3.select(containerRef.current).selectAll('*').remove();

    const margin = { top: 30, right: 30, bottom: 40, left: 70 };
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Only take strikes around the spot
    const sortedStrikes = [...strikes].sort((a, b) => a.strike - b.strike);
    let closestIdx = sortedStrikes.findIndex(s => s.strike >= spot);
    if (closestIdx === -1) closestIdx = sortedStrikes.length - 1; // spot above all strikes → clamp to highest (else SPOT marker vanishes)
    const startIdx = Math.max(0, closestIdx - 20);
    const visibleStrikes = sortedStrikes.slice(startIdx, startIdx + 40);

    const x = d3.scaleBand()
      .domain(visibleStrikes.map(d => d.strike.toString()))
      .range([0, width])
      .padding(0.2);

    const netGexExtent = d3.extent(visibleStrikes, d => d.netGex) as [number, number];
    const maxAbsGex = Math.max(Math.abs(netGexExtent[0] || 0), Math.abs(netGexExtent[1] || 0));

    const y = d3.scaleLinear()
      .domain([-maxAbsGex * 1.1, maxAbsGex * 1.1])
      .range([height, 0]);

    // Zero line background
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y(0))
      .attr('y2', y(0))
      .attr('stroke', theme.border)
      .attr('stroke-width', 2);

    // X axis
    const defaultTicks = x.domain().filter((_, i) => i % 2 === 0);
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues(defaultTicks).tickFormat(d => parseFloat(d).toLocaleString()))
      .attr('class', 'font-mono text-[9px]')
      .attr('fill', theme.textTertiary)
      .call(g => g.select('.domain').attr('stroke', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke', 'none'))
      .call(g => g.selectAll('text').attr('fill', theme.textTertiary))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em");

    // Y axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => {
        const val = +d;
        if (Math.abs(val) >= 1e9) return `${(val / 1e9).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
        if (Math.abs(val) >= 1e6) return `${(val / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
        if (Math.abs(val) >= 1e3) return `${(val / 1e3).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
        return val.toLocaleString();
      }))
      .attr('class', 'font-mono text-[9px]')
      .call(g => g.selectAll('text').attr('fill', theme.textTertiary))
      .call(g => g.select('.domain').attr('stroke', 'none'))
      .call(g => g.selectAll('.tick line')
        .attr('stroke', theme.grid)
        .attr('stroke-dasharray', '2 2')
        .attr('x2', width)
      );

    // Highlight rects on hover
    const interactionGroup = svg.append('g').attr('class', 'interaction-layer');

    // Create Bars with Gradients
    const defs = svg.append('defs');

    // Positive Gradient
    const posGradient = defs.append('linearGradient')
      .attr('id', 'pos-gex-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    posGradient.append('stop').attr('offset', '0%').attr('stop-color', theme.success).attr('stop-opacity', 0.95);
    posGradient.append('stop').attr('offset', '100%').attr('stop-color', theme.success).attr('stop-opacity', 0.45);

    // Negative Gradient
    const negGradient = defs.append('linearGradient')
      .attr('id', 'neg-gex-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    negGradient.append('stop').attr('offset', '0%').attr('stop-color', theme.danger).attr('stop-opacity', 0.45);
    negGradient.append('stop').attr('offset', '100%').attr('stop-color', theme.danger).attr('stop-opacity', 0.95);

    const bars = svg.selectAll('.bar')
      .data(visibleStrikes)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.strike.toString())!)
      .attr('width', x.bandwidth())
      .attr('y', d => d.netGex > 0 ? y(d.netGex) : y(0))
      .attr('height', d => Math.abs(y(d.netGex) - y(0)))
      .attr('fill', d => d.netGex > 0 ? 'url(#pos-gex-grad)' : 'url(#neg-gex-grad)')
      .attr('rx', 2);

    // Initialize group map for all active markers to perform collision-free stacking
    interface MarkerDef {
      type: string;
      label: string;
      color: string;
      border: string;
      lineColor: string;
      lineStyle: 'solid' | 'dashed' | 'dotted';
    }
    const strikeMarkers = new Map<number, MarkerDef[]>();
    const addMarker = (strike: number, def: MarkerDef) => {
      const parsedStrike = typeof strike === 'string' ? parseFloat(strike) : strike;
      if (!visibleStrikes.some(s => Math.abs(s.strike - parsedStrike) < 0.1)) return;
      const key = visibleStrikes.find(s => Math.abs(s.strike - parsedStrike) < 0.1)!.strike;
      const list = strikeMarkers.get(key) || [];
      list.push(def);
      strikeMarkers.set(key, list);
    };

    if (callWall) {
      addMarker(callWall, { type: 'callWall', label: 'CALL WALL', color: theme.success, border: theme.success, lineColor: theme.success, lineStyle: 'dashed' });
    }
    if (putWall) {
      addMarker(putWall, { type: 'putWall', label: 'PUT WALL', color: theme.danger, border: theme.danger, lineColor: theme.danger, lineStyle: 'dashed' });
    }
    if (magnet) {
      addMarker(magnet, { type: 'magnet', label: 'PIN MAGNET', color: theme.info, border: theme.info, lineColor: theme.info, lineStyle: 'dotted' });
    }

    const closestStrikeObj = visibleStrikes[closestIdx - startIdx];
    if (closestStrikeObj) {
      addMarker(closestStrikeObj.strike, { type: 'spot', label: 'SPOT', color: theme.textPrimary, border: theme.textPrimary, lineColor: theme.textTertiary, lineStyle: 'solid' });
    }

    // Sort marked strikes to stagger starting position when closest neighbors conflict
    const markedStrikes = Array.from(strikeMarkers.keys()).sort((a, b) => a - b);
    const startYOffsetMap = new Map<number, number>();
    let prevX = -999;
    let currentYBase = 15;

    markedStrikes.forEach(strike => {
      const xPos = x(strike.toString())! + x.bandwidth() / 2;
      if (xPos - prevX < 85) {
        currentYBase = (currentYBase === 15) ? 65 : 15;
      } else {
        currentYBase = 15;
      }
      startYOffsetMap.set(strike, currentYBase);
      prevX = xPos;
    });

    // Render unified lines and stacked capsule badges
    markedStrikes.forEach(strike => {
      const list = strikeMarkers.get(strike)!;
      const xPos = x(strike.toString())! + x.bandwidth() / 2;

      const primaryMarker = list.find(m => m.type === 'spot') ||
                            list.find(m => m.type === 'callWall') ||
                            list.find(m => m.type === 'putWall') ||
                            list[0];

      // Vertical line
      svg.append('line')
        .attr('x1', xPos).attr('x2', xPos)
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', primaryMarker.lineColor)
        .attr('stroke-width', primaryMarker.type === 'spot' ? 1.5 : 1)
        .attr('stroke-dasharray', primaryMarker.lineStyle === 'dashed' ? '4 4' : primaryMarker.lineStyle === 'dotted' ? '2 2' : 'none')
        .attr('opacity', primaryMarker.type === 'spot' ? 0.6 : 0.85);

      // capsule badges
      const startY = startYOffsetMap.get(strike) || 15;
      list.forEach((marker, index) => {
        const badgeY = startY + index * 18;
        const textWidth = Math.max(58, marker.label.length * 6.4 + 14);

        // capsule
        svg.append('rect')
          .attr('x', xPos - textWidth / 2)
          .attr('y', badgeY - 8)
          .attr('width', textWidth)
          .attr('height', 14)
          .attr('rx', 4)
          .attr('fill', theme.surface)
          .attr('stroke', marker.border)
          .attr('stroke-width', 1)
          .attr('opacity', 0.95);

        // text
        svg.append('text')
          .attr('x', xPos)
          .attr('y', badgeY + 1)
          .attr('fill', marker.color)
          .attr('text-anchor', 'middle')
          .attr('class', 'font-mono text-[9px] font-black uppercase tracking-widest')
          .text(marker.label);
      });
    });

    // Interaction Overlay
    const hoverLine = svg.append('line')
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', theme.textPrimary)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 2')
      .style('opacity', 0)
      .attr('pointer-events', 'none');

    interactionGroup.selectAll('.interactive-bar')
      .data(visibleStrikes)
      .join('rect')
      .attr('class', 'interactive-bar')
      .attr('x', d => x(d.strike.toString())!)
      .attr('width', x.bandwidth())
      .attr('y', 0)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter', function(event, d) {
        const _this = d3.select(this);
        const bw = x.bandwidth();
        const cx = x(d.strike.toString())! + bw / 2;

        hoverLine
          .attr('x1', cx).attr('x2', cx)
          .style('opacity', 0.6);

        bars.filter(b => b.strike === d.strike)
          .attr('opacity', 1)
          .attr('stroke', d.netGex > 0 ? theme.success : theme.danger)
          .attr('stroke-width', 1.5);
      })
      .on('mousemove', function(event, d) {
        const [mx, my] = d3.pointer(event, containerRef.current);
        setTooltip({
          x: mx,
          y: my,
          data: d
        });
      })
      .on('mouseleave', function(event, d) {
        hoverLine.style('opacity', 0);
        bars.filter(b => b.strike === d.strike)
          .attr('opacity', 0.8)
          .attr('stroke', 'none');
        setTooltip(null);
      });

  }, [profile, decimals]);

  const formatNumber = (val: number) => {
    if (Math.abs(val) > 1e9) return `${(val / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
    if (Math.abs(val) > 1e6) return `${(val / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
    if (Math.abs(val) > 1e3) return `${(val / 1e3).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <div ref={containerRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-[var(--surface)] border border-[var(--border-strong)] rounded-md p-3 shadow-2xl backdrop-blur-md z-50 transition-opacity duration-75"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
            transform: `translate(${tooltip.x > (containerRef.current?.clientWidth || 0) / 2 ? '-110%' : '0'}, 0)`
          }}
        >
          <div className="flex items-center gap-2 mb-2 border-b border-[var(--border)] pb-1">
            <span className="w-2 h-2 rounded-full bg-[var(--info)]" />
            <span className="font-mono text-[var(--text-primary)] font-bold text-[11px] tracking-widest uppercase tabular-nums">Strike ${tooltip.data.strike.toLocaleString()}</span>
          </div>
          <div className="space-y-1 text-left font-mono tabular-nums">
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-[var(--text-tertiary)]">Net GEX</span>
               <span className={`font-bold ${tooltip.data.netGex > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                 {tooltip.data.netGex > 0 ? '+' : ''}{formatNumber(tooltip.data.netGex)}
               </span>
             </div>
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-[var(--text-tertiary)]">Call GEX</span>
               <span className="text-[var(--success)] font-bold">+{formatNumber(tooltip.data.callGex || 0)}</span>
             </div>
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-[var(--text-tertiary)]">Put GEX</span>
               <span className="text-[var(--danger)] font-bold">{formatNumber(tooltip.data.putGex || 0)}</span>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
