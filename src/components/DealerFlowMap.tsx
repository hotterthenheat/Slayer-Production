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
      .attr('stroke', '#3f3f46')
      .attr('stroke-width', 2);

    // X axis
    const defaultTicks = x.domain().filter((_, i) => i % 2 === 0);
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues(defaultTicks))
      .attr('class', 'text-zinc-500 font-mono text-[9px]')
      .call(g => g.select('.domain').attr('stroke', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke', 'none'))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em");

    // Y axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => {
        const val = +d;
        if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
        if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
        if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
        return val.toString();
      }))
      .attr('class', 'text-zinc-500 font-mono text-[9px]')
      .call(g => g.select('.domain').attr('stroke', 'none'))
      .call(g => g.selectAll('.tick line')
        .attr('stroke', '#27272a')
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
    posGradient.append('stop').attr('offset', '0%').attr('stop-color', '#4ade80').attr('stop-opacity', 0.9);
    posGradient.append('stop').attr('offset', '100%').attr('stop-color', '#22c55e').attr('stop-opacity', 0.4);

    // Negative Gradient
    const negGradient = defs.append('linearGradient')
      .attr('id', 'neg-gex-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    negGradient.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444').attr('stop-opacity', 0.4);
    negGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f87171').attr('stop-opacity', 0.9);

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

    // Call Wall line
    if (callWall && visibleStrikes.some(s => s.strike === callWall)) {
      const cwX = x(callWall.toString())! + x.bandwidth() / 2;
      svg.append('line')
        .attr('x1', cwX).attr('x2', cwX)
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', '#4ade80')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 4')
        .attr('opacity', 0.8);

      svg.append('text')
        .attr('x', cwX)
        .attr('y', -10)
        .attr('fill', '#4ade80')
        .attr('text-anchor', 'middle')
        .attr('class', 'font-mono text-[9px] font-black uppercase tracking-widest')
        .text('CALL WALL');
    }

    // Put Wall line
    if (putWall && visibleStrikes.some(s => s.strike === putWall)) {
      const pwX = x(putWall.toString())! + x.bandwidth() / 2;
      svg.append('line')
        .attr('x1', pwX).attr('x2', pwX)
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', '#f87171')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 4')
        .attr('opacity', 0.8);

      svg.append('text')
        .attr('x', pwX)
        .attr('y', -10)
        .attr('fill', '#f87171')
        .attr('text-anchor', 'middle')
        .attr('class', 'font-mono text-[9px] font-black uppercase tracking-widest')
        .text('PUT WALL');
    }

    // Pinning / Magnet line
    if (magnet && visibleStrikes.some(s => s.strike === magnet)) {
        const magX = x(magnet.toString())! + x.bandwidth() / 2;
        svg.append('line')
          .attr('x1', magX).attr('x2', magX)
          .attr('y1', 0).attr('y2', height)
          .attr('stroke', '#38bdf8')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2 2');
  
        svg.append('text')
          .attr('x', magX)
          .attr('y', height + 25)
          .attr('fill', '#38bdf8')
          .attr('text-anchor', 'middle')
          .attr('class', 'font-mono text-[9px] font-black uppercase tracking-widest')
          .text('PIN MAGNET');
    }

    // Adding Spotlight
    const closestStrikeObj = visibleStrikes[closestIdx - startIdx];
    if (closestStrikeObj) {
      const spotX = x(closestStrikeObj.strike.toString())! + x.bandwidth() / 2;
      svg.append('line')
        .attr('x1', spotX).attr('x2', spotX)
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', '#e5e5e5')
        .attr('stroke-width', 1)
        .attr('opacity', 0.4);

      svg.append('rect')
         .attr('x', spotX - 22)
         .attr('y', y(0) - 9)
         .attr('width', 44)
         .attr('height', 18)
         .attr('fill', 'black')
         .attr('stroke', '#e5e5e5')
         .attr('stroke-width', 1)
         .attr('rx', 3);

      svg.append('text')
        .attr('x', spotX)
        .attr('y', y(0) + 3)
        .attr('fill', '#e5e5e5')
        .attr('text-anchor', 'middle')
        .attr('class', 'font-mono text-[8px] font-black uppercase tracking-widest')
        .text('SPOT');
    }

    // Interaction Overlay
    const hoverLine = svg.append('line')
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#e5e5e5')
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
          .attr('stroke', d.netGex > 0 ? '#4ade80' : '#f87171')
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
    if (Math.abs(val) > 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) > 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (Math.abs(val) > 1e3) return `${(val / 1e3).toFixed(1)}K`;
    return val.toFixed(1);
  };

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <div ref={containerRef} className="w-full h-full" />
      {tooltip && (
        <div 
          className="absolute pointer-events-none bg-black/95 border border-zinc-800 rounded-md p-3 shadow-2xl backdrop-blur-md z-50 transition-opacity duration-75"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
            transform: `translate(${tooltip.x > (containerRef.current?.clientWidth || 0) / 2 ? '-110%' : '0'}, 0)`
          }}
        >
          <div className="flex items-center gap-2 mb-2 border-b border-zinc-800 pb-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="font-mono text-zinc-100 font-bold text-[11px] tracking-widest uppercase">Strike ${tooltip.data.strike}</span>
          </div>
          <div className="space-y-1 text-left font-mono">
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-zinc-500">Net GEX</span>
               <span className={`font-bold ${tooltip.data.netGex > 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                 {tooltip.data.netGex > 0 ? '+' : ''}{formatNumber(tooltip.data.netGex)}
               </span>
             </div>
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-zinc-500">Call GEX</span>
               <span className="text-[#4ade80] font-bold">+{formatNumber(tooltip.data.callGex || 0)}</span>
             </div>
             <div className="flex justify-between items-center gap-4 text-[10px]">
               <span className="text-zinc-500">Put GEX</span>
               <span className="text-[#f87171] font-bold">{formatNumber(tooltip.data.putGex || 0)}</span>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
