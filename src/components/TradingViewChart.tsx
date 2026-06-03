import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

export interface ChartDataPoint {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradingViewChartProps {
  data: ChartDataPoint[];
  symbol?: string;
  theme?: 'dark' | 'light';
  vwapData?: { time: string | number; value: number }[];
  ema1Data?: { time: string | number; value: number }[];
  ema2Data?: { time: string | number; value: number }[];
  ema1Label?: string;
  ema2Label?: string;
  pivotsClassic?: { PP: number; R1: number; R2: number; R3: number; S1: number; S2: number; S3: number } | null;
  pivotsCamarilla?: { H1: number; H2: number; H3: number; H4: number; L1: number; L2: number; L3: number; L4: number } | null;
  pivotsCpr?: { tc: number; pivot: number; bc: number } | null;
  showPivotsClassic?: boolean;
  showPivotsCamarilla?: boolean;
  showPivotsCpr?: boolean;
  cprColors?: { tc: string; pivot: string; bc: string };
  activePositions?: { price: number; type: 'BUY' | 'SELL'; label: string; sl?: number; target?: number }[];
}

/** Clean and sort an array of line series points, removing any NaN/Infinity values and deduplicating timestamps */
function cleanLineData(raw: { time: string | number; value: number }[]) {
  if (!raw || raw.length === 0) return [];
  
  const mapped = raw.map(d => {
    let tNum: number;
    if (typeof d.time === 'string') {
      tNum = Math.floor(new Date(d.time).getTime() / 1000);
    } else {
      const val = Number(d.time);
      // Convert milliseconds to seconds if value looks like ms
      tNum = val > 100000000000 ? Math.floor(val / 1000) : Math.floor(val);
    }
    return { ...d, time: tNum };
  });

  mapped.sort((a, b) => (a.time as number) - (b.time as number));

  const uniqueMap = new Map<number, { time: number; value: number }>();
  for (const item of mapped) {
    if (
      typeof item.time === 'number' && !isNaN(item.time) &&
      typeof item.value === 'number' && !isNaN(item.value) && isFinite(item.value)
    ) {
      uniqueMap.set(item.time, item);
    }
  }

  return Array.from(uniqueMap.values());
}

/** Clean and sort candlestick data, removing any NaN/Infinity OHLC values and deduplicating timestamps */
function cleanCandleData(raw: ChartDataPoint[]) {
  if (!raw || raw.length === 0) return [];

  const mapped = raw.map(d => {
    let tNum: number;
    if (typeof d.time === 'string') {
      tNum = Math.floor(new Date(d.time).getTime() / 1000);
    } else {
      const val = Number(d.time);
      // Convert milliseconds to seconds if value looks like ms
      tNum = val > 100000000000 ? Math.floor(val / 1000) : Math.floor(val);
    }
    return { ...d, time: tNum };
  });

  mapped.sort((a, b) => (a.time as number) - (b.time as number));

  const uniqueMap = new Map<number, ChartDataPoint>();
  for (const item of mapped) {
    if (
      typeof item.time === 'number' && !isNaN(item.time) &&
      typeof item.open  === 'number' && !isNaN(item.open)  && isFinite(item.open) &&
      typeof item.high  === 'number' && !isNaN(item.high)  && isFinite(item.high) &&
      typeof item.low   === 'number' && !isNaN(item.low)   && isFinite(item.low) &&
      typeof item.close === 'number' && !isNaN(item.close) && isFinite(item.close)
    ) {
      uniqueMap.set(item.time, item);
    }
  }

  return Array.from(uniqueMap.values());
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  data,
  symbol = 'NIFTY',
  theme = 'dark',
  vwapData = [],
  ema1Data = [],
  ema2Data = [],
  ema1Label = 'EMA 15',
  ema2Label = 'EMA 20',
  pivotsClassic = null,
  pivotsCamarilla = null,
  pivotsCpr = null,
  showPivotsClassic = false,
  showPivotsCamarilla = false,
  showPivotsCpr = false,
  cprColors = { tc: '#06b6d4', pivot: '#8b5cf6', bc: '#f43f5e' },
  activePositions = [],
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef           = useRef<any>(null);
  const candlestickRef     = useRef<any>(null);
  const vwapRef            = useRef<any>(null);
  const ema1Ref            = useRef<any>(null);
  const ema2Ref            = useRef<any>(null);
  const priceLinesRef      = useRef<any[]>([]);
  const positionLinesRef   = useRef<any[]>([]);
  const initedRef          = useRef(false);

  // ----- Initialise chart once the container has real pixel dimensions -----
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    let observer: ResizeObserver | null = null;

    const init = (w: number, h: number) => {
      if (initedRef.current || w <= 0 || h <= 0) return;
      initedRef.current = true;

      const chart = createChart(el, {
        width: w,
        height: h,
        layout: {
          textColor: theme === 'dark' ? '#d1d5db' : '#374151',
          background: { type: ColorType.Solid, color: 'transparent' },
        },
        grid: {
          vertLines: { color: theme === 'dark' ? 'rgba(45,55,72,0.4)' : '#e5e7eb' },
          horzLines: { color: theme === 'dark' ? 'rgba(45,55,72,0.4)' : '#e5e7eb' },
        },
        rightPriceScale: {
          borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
        },
        timeScale: {
          borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: theme === 'dark' ? '#9ca3af' : '#6b7280',
            width: 1 as any,
            style: 1 as any,
            labelBackgroundColor: '#4f46e5',
          },
          horzLine: {
            color: theme === 'dark' ? '#9ca3af' : '#6b7280',
            width: 1 as any,
            style: 1 as any,
            labelBackgroundColor: '#4f46e5',
          },
        },
      });
      chartRef.current = chart;

      candlestickRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      vwapRef.current = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: 1,
        title: 'VWAP',
      });

      ema1Ref.current = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        title: ema1Label,
      });

      ema2Ref.current = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
        title: ema2Label,
      });
    };

    // Use ResizeObserver so we react to the first real layout paint
    observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (!initedRef.current) {
          init(Math.floor(width), Math.floor(height));
        } else if (chartRef.current) {
          // Keep chart responsive after initial creation
          chartRef.current.applyOptions({ width: Math.floor(width) });
        }
      }
    });
    observer.observe(el);

    // Fallback: try immediately with clientWidth/clientHeight
    init(el.clientWidth, el.clientHeight);

    return () => {
      observer?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      initedRef.current    = false;
      candlestickRef.current = null;
      vwapRef.current        = null;
      ema1Ref.current        = null;
      ema2Ref.current        = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ----- Update candlestick data -----
  useEffect(() => {
    if (!candlestickRef.current) return;
    const clean = cleanCandleData(data);
    candlestickRef.current.setData(clean);
  }, [data]);

  // ----- Update VWAP line -----
  useEffect(() => {
    if (!vwapRef.current) return;
    vwapRef.current.setData(vwapData.length > 0 ? cleanLineData(vwapData) : []);
  }, [vwapData]);

  // ----- Update EMA 1 line -----
  useEffect(() => {
    if (!ema1Ref.current) return;
    ema1Ref.current.setData(ema1Data.length > 0 ? cleanLineData(ema1Data) : []);
    ema1Ref.current.applyOptions({ title: ema1Label });
  }, [ema1Data, ema1Label]);

  // ----- Update EMA 2 line -----
  useEffect(() => {
    if (!ema2Ref.current) return;
    ema2Ref.current.setData(ema2Data.length > 0 ? cleanLineData(ema2Data) : []);
    ema2Ref.current.applyOptions({ title: ema2Label });
  }, [ema2Data, ema2Label]);

  // ----- Draw Pivot & CPR Horizontal Lines -----
  useEffect(() => {
    if (!candlestickRef.current) return;

    // Remove all previous price lines
    priceLinesRef.current.forEach(line => {
      candlestickRef.current.removePriceLine(line);
    });
    priceLinesRef.current = [];

    // Draw Classic Pivots
    if (showPivotsClassic && pivotsClassic) {
      const { PP, R1, R2, R3, S1, S2, S3 } = pivotsClassic;
      const levels = [
        { name: 'PP', val: PP, color: '#a78bfa' }, // Violet
        { name: 'R1', val: R1, color: '#f87171' }, // Red
        { name: 'R2', val: R2, color: '#ef4444' },
        { name: 'R3', val: R3, color: '#b91c1c' },
        { name: 'S1', val: S1, color: '#34d399' }, // Green
        { name: 'S2', val: S2, color: '#10b981' },
        { name: 'S3', val: S3, color: '#047857' },
      ];
      levels.forEach(lvl => {
        if (lvl.val && !isNaN(lvl.val)) {
          const pl = candlestickRef.current.createPriceLine({
            price: lvl.val,
            color: lvl.color,
            lineWidth: 1,
            lineStyle: 2, // Dotted
            axisLabelVisible: true,
            title: lvl.name,
          });
          priceLinesRef.current.push(pl);
        }
      });
    }

    // Draw Camarilla Pivots
    if (showPivotsCamarilla && pivotsCamarilla) {
      const { H1, H2, H3, H4, L1, L2, L3, L4 } = pivotsCamarilla;
      const levels = [
        { name: 'H4', val: H4, color: '#ef4444' }, // Red
        { name: 'H3', val: H3, color: '#f87171' },
        { name: 'H2', val: H2, color: '#f97316' }, // Orange
        { name: 'H1', val: H1, color: '#fb923c' },
        { name: 'L1', val: L1, color: '#a7f3d0' }, // Light green
        { name: 'L2', val: L2, color: '#4ade80' },
        { name: 'L3', val: L3, color: '#10b981' },
        { name: 'L4', val: L4, color: '#047857' },
      ];
      levels.forEach(lvl => {
        if (lvl.val && !isNaN(lvl.val)) {
          const pl = candlestickRef.current.createPriceLine({
            price: lvl.val,
            color: lvl.color,
            lineWidth: 1,
            lineStyle: 2, // Dotted
            axisLabelVisible: true,
            title: lvl.name,
          });
          priceLinesRef.current.push(pl);
        }
      });
    }

    // Draw CPR
    if (showPivotsCpr && pivotsCpr) {
      const { tc, pivot, bc } = pivotsCpr;
      const levels = [
        { name: 'TC', val: tc, color: cprColors?.tc || '#06b6d4' }, // default Cyan
        { name: 'Pivot (PVT)', val: pivot, color: cprColors?.pivot || '#8b5cf6' }, // default Purple
        { name: 'BC', val: bc, color: cprColors?.bc || '#f43f5e' }, // default Rose
      ];
      levels.forEach(lvl => {
        if (lvl.val && !isNaN(lvl.val)) {
          const pl = candlestickRef.current.createPriceLine({
            price: lvl.val,
            color: lvl.color,
            lineWidth: 1.5,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: lvl.name,
          });
          priceLinesRef.current.push(pl);
        }
      });
    }
  }, [pivotsClassic, pivotsCamarilla, pivotsCpr, showPivotsClassic, showPivotsCamarilla, showPivotsCpr, cprColors, theme]);

  // ----- Draw Active Positions (Entry, SL, Target) -----
  useEffect(() => {
    if (!candlestickRef.current) return;

    // Remove all previous position lines
    positionLinesRef.current.forEach(line => {
      candlestickRef.current.removePriceLine(line);
    });
    positionLinesRef.current = [];

    if (!activePositions || activePositions.length === 0) return;

    activePositions.forEach(pos => {
      // 1. Entry Line
      if (pos.price && !isNaN(pos.price)) {
        const entryColor = pos.type === 'BUY' ? '#10b981' : '#ef4444'; // Green for Buy, Red for Sell
        const entryLine = candlestickRef.current.createPriceLine({
          price: pos.price,
          color: entryColor,
          lineWidth: 2,
          lineStyle: 1, // Dashed
          axisLabelVisible: true,
          title: `${pos.label} (Entry)`,
        });
        positionLinesRef.current.push(entryLine);
      }

      // 2. Stop Loss Line
      if (pos.sl && !isNaN(pos.sl)) {
        const slLine = candlestickRef.current.createPriceLine({
          price: pos.sl,
          color: '#ef4444', // Red
          lineWidth: 1.5,
          lineStyle: 2, // Dotted
          axisLabelVisible: true,
          title: `${pos.label} (SL)`,
        });
        positionLinesRef.current.push(slLine);
      }

      // 3. Target Line
      if (pos.target && !isNaN(pos.target)) {
        const targetLine = candlestickRef.current.createPriceLine({
          price: pos.target,
          color: '#10b981', // Green
          lineWidth: 1.5,
          lineStyle: 2, // Dotted
          axisLabelVisible: true,
          title: `${pos.label} (Target)`,
        });
        positionLinesRef.current.push(targetLine);
      }
    });
  }, [activePositions, theme]);

  return (
    <div className="w-full h-full relative" ref={chartContainerRef}>
      {data.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-slate-400 font-mono text-xs">Awaiting live market data...</span>
          </div>
        </div>
      )}
    </div>
  );
};
