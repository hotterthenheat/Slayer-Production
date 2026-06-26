import React, { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, createTextWatermark, ColorType, LineStyle } from 'lightweight-charts';
import { Candle, TargetLevel } from '../types';
import { useContractStore } from '../lib/store';

interface InteractiveChartProps {
  candles: Candle[];
  fvgs?: any[];
  liquidityEvents?: any[];
  displacementZones?: any[];
  tape?: any[];
  targets?: TargetLevel[];
  priceDecimals?: number;
  timeframe: string;
  selectedTicker: string;
  showFVGs?: boolean;
  showLiquiditySweeps?: boolean;
  showDisplacementEvents?: boolean;
  watermarkText?: string;
  gexLevels?: { callWall?: number; putWall?: number; gammaFlip?: number; magnet?: number };
  gexProfile?: { strikes?: { strike: number; netGex: number }[]; expectedMovePct?: number; netGex?: number; dealerBias?: string; aboveFlip?: boolean; spot?: number };
  onPlaceAuditTrade?: (direction: 'BULLISH' | 'BEARISH', entry: number, target: number, stop: number) => void;
  triggerInvalidation?: boolean;
}

export const InteractiveChart = React.memo(function InteractiveChart({
  candles,
  fvgs = [],
  liquidityEvents = [],
  displacementZones = [],
  tape = [],
  targets = [],
  priceDecimals = 2,
  timeframe,
  selectedTicker,
  showFVGs = true,
  showLiquiditySweeps = true,
  showDisplacementEvents = true,
  watermarkText,
  gexLevels,
  gexProfile,
  onPlaceAuditTrade,
  triggerInvalidation
}: InteractiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const fvgSeriesRefs = useRef<any[]>([]);
  const tapeSeriesRefs = useRef<any[]>([]);
  const vwapRef = useRef<any>(null);
  const bbUpperRef = useRef<any>(null);
  const bbMidRef = useRef<any>(null);
  const bbLowerRef = useRef<any>(null);
  const volumeRef = useRef<any>(null);
  const gexLinesRef = useRef<any[]>([]);
  const gexSvgRef = useRef<SVGSVGElement>(null);
  const drawGexProfileRef = useRef<() => void>(() => {});

  // Indicator visibility toggles (VWAP, Bollinger Bands(20), Volume, GEX strike levels, γ-profile).
  const [showVwap, setShowVwap] = useState(true);
  const [showBb, setShowBb] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showGex, setShowGex] = useState(true);
  const [showGexProfile, setShowGexProfile] = useState(true);

  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  // Format candles for lightweight-charts: must contain time (seconds), open, high, low, close
  const chartData = useMemo(() => {
    return candles.map((c) => {
      // Use standard c.timestamp as defined in types.ts (milliseconds)
      const timeSecs = Math.floor(c.timestamp / 1000);
      return {
        time: timeSecs,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      };
    }).sort((a, b) => (a.time as number) - (b.time as number));
  }, [candles]);

  // Indicator series derived from the same candles the price plot uses:
  //  • VWAP — session-cumulative (resets each calendar day)
  //  • Bollinger Bands(20, 2σ) over close
  //  • Volume — tinted by candle direction
  const { vwapData, bbUpper, bbMid, bbLower, volumeData } = useMemo(() => {
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const vwap: { time: number; value: number }[] = [];
    const up: { time: number; value: number }[] = [];
    const mid: { time: number; value: number }[] = [];
    const low: { time: number; value: number }[] = [];
    const vol: { time: number; value: number; color: string }[] = [];
    let cumPV = 0, cumV = 0, dayKey = '';
    const closes: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      const t = Math.floor(c.timestamp / 1000);
      // VWAP resets when the calendar day rolls over (standard session VWAP behaviour).
      const dk = new Date(c.timestamp).toISOString().slice(0, 10);
      if (dk !== dayKey) { cumPV = 0; cumV = 0; dayKey = dk; }
      const typical = (c.high + c.low + c.close) / 3;
      const v = c.volume || 0;
      cumPV += typical * v; cumV += v;
      vwap.push({ time: t, value: cumV > 0 ? cumPV / cumV : c.close });
      // Bollinger Bands over a trailing 20-close window.
      closes.push(c.close);
      if (closes.length >= 20) {
        const win = closes.slice(-20);
        const m = win.reduce((a, b) => a + b, 0) / 20;
        const variance = win.reduce((a, b) => a + (b - m) * (b - m), 0) / 20;
        const sd = Math.sqrt(variance);
        up.push({ time: t, value: m + 2 * sd });
        mid.push({ time: t, value: m });
        low.push({ time: t, value: m - 2 * sd });
      }
      vol.push({ time: t, value: v, color: c.close >= c.open ? 'rgba(74, 222, 128, 0.35)' : 'rgba(255, 69, 69, 0.35)' });
    }
    return { vwapData: vwap, bbUpper: up, bbMid: mid, bbLower: low, volumeData: vol };
  }, [candles]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Resolve the semantic theme tokens once so the candle branding matches the
    // token-driven UI instead of a hardcoded hex (the down/neon palette below is
    // intentional chart-specific brand art and is left as-is).
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string, f: string) => { const v = css.getPropertyValue(n).trim(); return v || f; };
    const successTok = tok('--success', '#4ADE80');

    // 1. Create Chart once, using deep configuration
    const chart: any = createChart(containerRef.current, {
      autoSize: true, // Auto-size to container
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#0d0d0d' },
        textColor: isLight ? '#1f2937' : '#d1d4dc',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: isLight ? '#f3f4f6' : '#09090b' },
        horzLines: { color: isLight ? '#f3f4f6' : '#09090b' },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: {
          color: isLight ? '#000000' : '#ffffff',
          width: 1, // LineWidth must be integer e.g., 1
          style: 1 // Dashed line style
        },
        horzLine: {
          color: isLight ? '#000000' : '#ffffff',
          width: 1,
          style: 1
        }
      },
      timeScale: {
        rightOffset: 10,
        barSpacing: 6,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
        borderColor: isLight ? '#e5e7eb' : '#18181b',
        timeVisible: true,
        secondsVisible: false,
      },
    } as any);

    // Watermark: lightweight-charts v5 removed the top-level `watermark` chart
    // option (it was silently ignored here), so render it via the v5 text-watermark
    // plugin on the first pane instead.
    if (watermarkText) {
      const panes = chart.panes();
      if (panes && panes.length > 0) {
        createTextWatermark(panes[0], {
          horzAlign: 'center',
          vertAlign: 'center',
          lines: [{ text: watermarkText, color: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)', fontSize: 24 }],
        });
      }
    }

    // 2. Add Candlestick Series once with high contrast neon branding
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: successTok,
      downColor: '#ff4545',
      borderUpColor: successTok,
      borderDownColor: '#ff4545',
      wickUpColor: successTok,
      wickDownColor: '#ff4545',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Volume histogram on its own overlay scale, pinned to the bottom ~18% of the pane.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeRef.current = volumeSeries;

    // Leave headroom on the price scale so candles don't overlap the volume bars.
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });

    // VWAP (gold) + Bollinger Bands(20) (subtle blue band) overlays on the price scale.
    const vwapSeries = chart.addSeries(LineSeries, { color: '#f5b300', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    vwapRef.current = vwapSeries;
    const bbUpperSeries = chart.addSeries(LineSeries, { color: 'rgba(99, 160, 255, 0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const bbMidSeries = chart.addSeries(LineSeries, { color: 'rgba(99, 160, 255, 0.35)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const bbLowerSeries = chart.addSeries(LineSeries, { color: 'rgba(99, 160, 255, 0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbUpperRef.current = bbUpperSeries;
    bbMidRef.current = bbMidSeries;
    bbLowerRef.current = bbLowerSeries;

    // Initialize series markers plugin once
    const seriesMarkers = createSeriesMarkers(candlestickSeries, []);
    markersRef.current = seriesMarkers;

    // 3. Setup fluid Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!entries || entries.length === 0) return;
        if (!containerRef.current) return;
        if (chartRef.current) {
          const { width, height } = entries[0].contentRect;
          chartRef.current.resize(width, height || 200);
          drawGexProfileRef.current();
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    // Keep the GEX profile overlay synced to the price axis (which autoscales as candles
    // stream) with a light redraw tick.
    const gexProfileTimer = setInterval(() => drawGexProfileRef.current(), 250);

    return () => {
      clearInterval(gexProfileTimer);
      resizeObserver.disconnect();
      try {
        if (markersRef.current) {
          try {
            markersRef.current.detach();
          } catch (e) {}
        }
        if (chartRef.current) {
          chartRef.current.remove();
        }
      } catch (e) {
        console.error('Clearing chart error', e);
      }
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      vwapRef.current = null;
      bbUpperRef.current = null;
      bbMidRef.current = null;
      bbLowerRef.current = null;
      volumeRef.current = null;
      gexLinesRef.current = [];
      if (gexSvgRef.current) gexSvgRef.current.innerHTML = '';
    };
  }, []);

  // Update options dynamically when theme changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#0d0d0d' },
          textColor: isLight ? '#1f2937' : '#d1d4dc',
        },
        grid: {
          vertLines: { color: isLight ? '#f3f4f6' : '#09090b' },
          horzLines: { color: isLight ? '#f3f4f6' : '#09090b' },
        },
        crosshair: {
          vertLine: {
            color: isLight ? '#000000' : '#ffffff',
          },
          horzLine: {
            color: isLight ? '#000000' : '#ffffff',
          }
        },
        timeScale: {
          borderColor: isLight ? '#e5e7eb' : '#18181b',
        }
      });
    }
  }, [isLight]);

  // Update Candlestick Series data smoothly instead of deleting
  useEffect(() => {
    if (seriesRef.current && chartData.length > 0) {
      seriesRef.current.setData(chartData);
      drawGexProfileRef.current();
    }
  }, [chartData]);

  // Push indicator data whenever the candle-derived series change.
  useEffect(() => { if (vwapRef.current) vwapRef.current.setData(vwapData); }, [vwapData]);
  useEffect(() => {
    if (bbUpperRef.current) bbUpperRef.current.setData(bbUpper);
    if (bbMidRef.current) bbMidRef.current.setData(bbMid);
    if (bbLowerRef.current) bbLowerRef.current.setData(bbLower);
  }, [bbUpper, bbMid, bbLower]);
  useEffect(() => { if (volumeRef.current) volumeRef.current.setData(volumeData); }, [volumeData]);

  // Toggle indicator visibility from the legend chips.
  useEffect(() => { if (vwapRef.current) vwapRef.current.applyOptions({ visible: showVwap }); }, [showVwap]);
  useEffect(() => {
    [bbUpperRef, bbMidRef, bbLowerRef].forEach(r => r.current && r.current.applyOptions({ visible: showBb }));
  }, [showBb]);
  useEffect(() => { if (volumeRef.current) volumeRef.current.applyOptions({ visible: showVolume }); }, [showVolume]);

  // GEX strike-level overlays + expected-move envelope: price lines for the key gamma strikes
  // (call/put wall, γ-flip, magnet) plus the dealer-implied expected move, on the price axis.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    gexLinesRef.current.forEach(l => { try { series.removePriceLine(l); } catch (e) {} });
    gexLinesRef.current = [];
    if (!showGex) return;
    const defs: { price: any; color: string; title: string }[] = [];
    if (gexLevels) {
      defs.push(
        { price: gexLevels.callWall, color: '#22c55e', title: 'Call Wall' },
        { price: gexLevels.putWall, color: '#ef4444', title: 'Put Wall' },
        { price: gexLevels.gammaFlip, color: '#eab308', title: 'γ Flip' },
        { price: gexLevels.magnet, color: '#a855f7', title: 'Magnet' },
      );
    }
    // Expected-move envelope from the dealer model (unique: the move dealers are positioned
    // for, not just a raw IV band).
    if (gexProfile?.spot && gexProfile.expectedMovePct) {
      const em = gexProfile.expectedMovePct;
      defs.push(
        { price: gexProfile.spot * (1 + em), color: 'rgba(96,165,250,0.85)', title: 'EM +' },
        { price: gexProfile.spot * (1 - em), color: 'rgba(96,165,250,0.85)', title: 'EM −' },
      );
    }
    defs.forEach(d => {
      if (typeof d.price === 'number' && isFinite(d.price) && d.price > 0) {
        const line = series.createPriceLine({
          price: d.price,
          color: d.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: d.title,
        });
        gexLinesRef.current.push(line);
      }
    });
  }, [gexLevels, gexProfile, showGex]);

  // Redraw the GEX-by-strike profile overlay when its data or visibility changes.
  useEffect(() => { drawGexProfileRef.current(); }, [gexProfile, showGexProfile]);

  // Handle markers and overlay updates smoothly
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    // Resolve the danger token once for the token-driven displacement marker.
    const css = getComputedStyle(document.documentElement);
    const dangerTok = (css.getPropertyValue('--danger').trim() || '#F87171');

    const markers: any[] = [];

    // 1. Draw Liquidity Sweeps / Dealer Events
    if (showLiquiditySweeps && liquidityEvents.length > 0) {
      liquidityEvents.forEach((evt) => {
        let timeSecs = evt.timestamp ? Math.floor(evt.timestamp / 1000) : 0;
        if (!timeSecs && evt.candleIdx !== undefined && chartData[evt.candleIdx]) {
           timeSecs = chartData[evt.candleIdx].time;
        }
        
        if (timeSecs) {
          const isBullish = evt.type === 'bullish';
          markers.push({
            time: timeSecs,
            position: isBullish ? 'belowBar' : 'aboveBar',
            color: isBullish ? '#d4d4d8' : '#ff4545',
            shape: 'circle',
            size: 2
          });
        }
      });
    }

    // 2. Draw Displacement Zones
    if (showDisplacementEvents && displacementZones && displacementZones.length > 0) {
      displacementZones.forEach((z) => {
        let timeSecs = 0;
        if (z.endIndex !== undefined && chartData[z.endIndex]) {
           timeSecs = chartData[z.endIndex].time;
        }
        
        if (timeSecs) {
          const isBullish = z.direction === 'BULLISH';
          markers.push({
            time: timeSecs,
            position: isBullish ? 'belowBar' : 'aboveBar',
            color: isBullish ? '#d4d4d8' : dangerTok, // distinct from sweeps
            shape: isBullish ? 'arrowUp' : 'arrowDown',
            text: `DISP ${z.score}`,
            size: 2
          });
        }
      });
    }

    // 3. Draw Targets (T1/T2 as markers at the last known candle)
    if (targets && targets.length > 0 && chartData.length > 0) {
      const lastCandle = chartData[chartData.length - 1];
      targets.forEach((tgt) => {
        markers.push({
          time: lastCandle.time,
          position: 'aboveBar',
          color: '#4f8cff',
          shape: 'pin',
          text: `${tgt.label}: ${(tgt.price ?? 0).toFixed(1)}`
        });
      });
    }

    // Set interactive markers on the series — lightweight-charts requires them
    // sorted ascending by time, else setMarkers throws "data must be asc ordered by time".
    if (markersRef.current) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      markersRef.current.setMarkers(markers);
    }

    // Clean up old tape overlays
    tapeSeriesRefs.current.forEach(s => {
      try {
        if (chartRef.current) chartRef.current.removeSeries(s);
      } catch (e) {}
    });
    tapeSeriesRefs.current = [];

    // Draw tape events directly at requested prices
    if (tape && tape.length > 0 && chartRef.current) {
      // Group tape events by direction
      const buys = tape.filter(t => t.direction === 'buy');
      const sells = tape.filter(t => t.direction === 'sell');

      if (buys.length > 0) {
        const buySeries = chartRef.current.addSeries(LineSeries, {
          color: 'rgba(48, 209, 88, 0.8)',
          lineWidth: 0,
          pointMarkersVisible: true,
          pointMarkersRadius: 3,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
        buySeries.setData(
          buys.map(b => ({
            time: Math.floor(b.timestamp / 1000),
            value: b.price
          })).sort((a,b) => a.time - b.time)
        );
        tapeSeriesRefs.current.push(buySeries);
      }

      if (sells.length > 0) {
        const sellSeries = chartRef.current.addSeries(LineSeries, {
          color: 'rgba(255, 69, 58, 0.8)',
          lineWidth: 0,
          pointMarkersVisible: true,
          pointMarkersRadius: 3,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
        sellSeries.setData(
          sells.map(s => ({
            time: Math.floor(s.timestamp / 1000),
            value: s.price
          })).sort((a,b) => a.time - b.time)
        );
        tapeSeriesRefs.current.push(sellSeries);
      }
    }

    // Clean up old FVG overlays
    fvgSeriesRefs.current.forEach(s => {
      try {
        if (chartRef.current) chartRef.current.removeSeries(s);
      } catch (e) {}
    });
    fvgSeriesRefs.current = [];

    // 3. Draw FVG Zones as solid lines in the margin area
    if (showFVGs && fvgs.length > 0) {
      fvgs.slice(0, 3).forEach((fvg) => {
        if (!chartRef.current) return;
        const fvgLine = chartRef.current.addSeries(LineSeries, {
          color: fvg.type === 'bullish' ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 69, 69, 0.4)',
          lineWidth: 1,
          lineStyle: 1, // Dotted style
          title: 'FVG'
        });

        // Set line points from start to now
        const points = chartData
          .filter(d => d.time >= Math.floor(fvg.startTime / 1000))
          .map(d => ({
            time: d.time,
            value: fvg.midPrice
          }));

        if (points.length > 0) {
          fvgLine.setData(points);
          fvgSeriesRefs.current.push(fvgLine);
        }
      });
    }

  }, [chartData, showLiquiditySweeps, liquidityEvents, targets, showFVGs, fvgs, showDisplacementEvents, displacementZones, tape]);

  // True while the contract has no candles yet (e.g. right after a new SkyVision
  // selection resets chartData to []). The charting effect already no-ops on an
  // empty series, so we simply overlay a non-blocking skeleton until data arrives.
  const isLoadingCandles = candles.length === 0;

  // Draw the GEX-by-strike profile overlay (the signature dealer-gamma landscape): a
  // horizontal histogram of net gamma at each strike, pinned to the price axis so it tracks
  // the candles as they autoscale. Green = positive (long) gamma, red = negative (short).
  drawGexProfileRef.current = () => {
    const svg = gexSvgRef.current, series = seriesRef.current, container = containerRef.current;
    if (!svg || !series || !container) return;
    if (!showGexProfile || !gexProfile?.strikes?.length) { svg.innerHTML = ''; return; }
    const w = container.clientWidth, h = container.clientHeight;
    const axisPad = 56, maxW = Math.min(110, w * 0.26);
    const maxAbs = Math.max(...gexProfile.strikes.map(s => Math.abs(s.netGex || 0)), 1e-9);
    let pos = '', neg = '';
    for (const s of gexProfile.strikes) {
      const y = series.priceToCoordinate(s.strike);
      if (y == null || y < 2 || y > h - 2) continue;
      const len = Math.max(1.5, (Math.abs(s.netGex || 0) / maxAbs) * maxW);
      const x = w - axisPad - len;
      const seg = `M${x.toFixed(1)} ${(y - 1).toFixed(1)}h${len.toFixed(1)}v2.4h-${len.toFixed(1)}Z`;
      if ((s.netGex || 0) >= 0) pos += seg; else neg += seg;
    }
    svg.innerHTML = `<path d="${pos}" fill="rgba(34,197,94,0.5)"/><path d="${neg}" fill="rgba(239,68,68,0.5)"/>`;
  };

  return (
    <div className="w-full h-full relative bg-[var(--surface)] flex flex-col border border-[var(--border)] rounded-sm">
      {/* Chart canvas DOM */}
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-[140px]"
        style={{ minHeight: '140px' }}
      />

      {/* Signature GEX-by-strike profile overlay (dealer gamma landscape). */}
      <svg ref={gexSvgRef} className="absolute inset-0 w-full h-full pointer-events-none z-[4]" aria-hidden="true" />

      {/* Dealer-regime badge — positive (long) vs negative (short) gamma. */}
      {gexProfile?.dealerBias && (
        <div className={`absolute top-1.5 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold uppercase tracking-wide border ${gexProfile.dealerBias === 'LONG GAMMA' ? 'bg-[var(--success)]/10 border-[var(--success)]/40 text-[var(--success)]' : 'bg-[var(--danger)]/10 border-[var(--danger)]/40 text-[var(--danger)]'}`} title="Net dealer gamma regime">
          {gexProfile.dealerBias === 'LONG GAMMA' ? 'LONG γ' : 'SHORT γ'}
        </div>
      )}

      {/* Indicator legend / toggles — click a chip to show/hide that overlay. */}
      {candles.length > 0 && (
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-wrap items-center gap-1 select-none">
          {[
            { on: showVwap, set: setShowVwap, label: 'VWAP', dot: '#f5b300' },
            { on: showBb, set: setShowBb, label: 'BB 20', dot: '#63a0ff' },
            { on: showVolume, set: setShowVolume, label: 'VOL', dot: '#9ca3af' },
            ...(gexLevels ? [{ on: showGex, set: setShowGex, label: 'GEX', dot: '#a855f7' }] : []),
            ...(gexProfile?.strikes?.length ? [{ on: showGexProfile, set: setShowGexProfile, label: 'γ-MAP', dot: '#22c55e' }] : []),
          ].map((it, i) => (
            <button
              key={i}
              onClick={() => it.set(v => !v)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold uppercase tracking-wide border transition-colors cursor-pointer ${it.on ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)]' : 'bg-transparent border-transparent text-[var(--text-tertiary)] opacity-50'}`}
              title={`Toggle ${it.label}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: it.dot, opacity: it.on ? 1 : 0.4 }} />
              {it.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton — shown only while no candles have arrived, then removed.
          Absolutely positioned over the canvas so the chart logic is untouched. */}
      {isLoadingCandles && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--surface)]/80 backdrop-blur-[1px] pointer-events-none"
          role="status"
          aria-live="polite"
          aria-label="Loading candles"
        >
          {/* Shimmer bars evoking a candlestick series while data streams in */}
          <div className="flex items-end gap-1.5 h-12 opacity-60" aria-hidden="true">
            {[40, 70, 55, 85, 60, 95, 50].map((h, i) => (
              <div
                key={i}
                className="w-1.5 rounded-sm bg-[var(--surface-3)] animate-pulse"
                style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] font-mono animate-pulse">
            Loading candles…
          </span>
        </div>
      )}
    </div>
  );
});
