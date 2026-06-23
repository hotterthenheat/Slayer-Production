import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, createTextWatermark, ColorType } from 'lightweight-charts';
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
  onPlaceAuditTrade,
  triggerInvalidation
}: InteractiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const fvgSeriesRefs = useRef<any[]>([]);
  const tapeSeriesRefs = useRef<any[]>([]);

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
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
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
    }
  }, [chartData]);

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

  return (
    <div className="w-full h-full relative bg-[var(--surface)] flex flex-col border border-[var(--border)] rounded-sm">
      {/* Chart canvas DOM */}
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-[140px]"
        style={{ minHeight: '140px' }}
      />

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
