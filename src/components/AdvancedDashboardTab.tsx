import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, getApiUrl } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useFirebase } from "./FirebaseProvider";
import {
  TrendingUp, TrendingDown, Target, Activity, FileText, CheckSquare,
  RefreshCw, Plus, Trash2, ArrowUpRight, ArrowDownRight, Compass, Maximize2,
  Clock, Search, X, Check, Eye, Trash, Download, Settings, Play,
  Pause, ChevronUp, ChevronDown, AlertCircle, Sparkles, HelpCircle, Edit3,
  Zap, BookOpen, BarChart2
} from "lucide-react";
import { TradingViewChart } from "./TradingViewChart";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";

// Types
export interface PaperTrade {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP_LOSS" | "TARGET";
  quantity: number;
  entryPrice: number; // Premium for options, stock price for equity
  exitPrice?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  status: "OPEN" | "CLOSED" | "PENDING";
  createdAt: string; // ISO String
  closedAt?: string; // ISO String
  pnl?: number; // Realized P&L
  // Options specific properties
  instrumentClass: "EQUITY" | "OPTIONS";
  optionType?: "CE" | "PE";
  strikePrice?: number;
  expiryDate?: string;
  underlyingSpotPrice?: number;
  useTrailingStop?: boolean;
  trailingDistance?: number;
  highestPrice?: number;
  lowestPrice?: number;
}

const FNO_INDEX_LOTS: Record<string, number> = {
  "NIFTY": 25,
  "BANKNIFTY": 15,
  "FINNIFTY": 40,
  "MIDCPNIFTY": 50,
  "SENSEX": 10,
  "BANKEX": 15,
};

const PRODUCTION_REALTIME_ONLY = true;

const COLORS_PALETTE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899', '#f43f5e'];

interface WatchlistItem {
  symbol: string;
  name: string;
  market: "NSE" | "BSE" | "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "MIDCAP" | "OPTIONS";
  basePrice: number;
  isOption?: boolean;
  underlyingSymbol?: string;
  strikePrice?: number;
  optionType?: "CE" | "PE";
  expiryDate?: string;
}

interface ChartPreferences {
  chartType: "candlestick" | "line" | "area";
  timeframe: "1m" | "3m" | "5m" | "15m" | "30m" | "1H" | "1D";
  selectedSymbol: string;
  indicators: {
    ema9: boolean;
    ema21: boolean;
    sma20: boolean;
    sma50: boolean;
    vwap: boolean;
    bb: boolean;
    rsi: boolean;
    macd: boolean;
    supertrend: boolean;
    pivotsClassic: boolean;
    pivotsCamarilla: boolean;
    oiOverlay: boolean;
    volumeProfile: boolean;
    cpr: boolean;
  };
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Drawing {
  type: "trendline" | "horizontal" | "fibonacci";
  points: { index: number; price: number }[]; // Coordinates locked to time-index and price
  color: string;
}

interface OptionChainRow {
  strike: number;
  ceOI: number;
  ceChangeOI: number;
  ceVolume: number;
  ceLtp: number;
  ceBuildUp: "Long Build-up" | "Short Build-up" | "Short Covering" | "Long Unwinding";
  peOI: number;
  peChangeOI: number;
  peVolume: number;
  peLtp: number;
  peBuildUp: "Long Build-up" | "Short Build-up" | "Short Covering" | "Long Unwinding";
}

// Initial Watchlist Configuration
const INITIAL_WATCHLIST: WatchlistItem[] = [
  { symbol: "NIFTY", name: "Nifty 50 Index", market: "NIFTY", basePrice: 23593.10 },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", market: "BANKNIFTY", basePrice: 54105.35 },
  { symbol: "FINNIFTY", name: "Nifty Financial Services", market: "FINNIFTY", basePrice: 27597.65 },
  { symbol: "MIDCAP", name: "Nifty Midcap Select", market: "MIDCAP", basePrice: 14428.35 },
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", market: "NSE", basePrice: 2954.20 },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", market: "NSE", basePrice: 1448.50 },
  { symbol: "SBIN", name: "State Bank of India", market: "NSE", basePrice: 775.30 },
  { symbol: "TCS", name: "Tata Consultancy Services", market: "NSE", basePrice: 3945.10 },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", market: "BSE", basePrice: 982.40 },
  { symbol: "VIX", name: "India VIX (Volatility)", market: "NIFTY", basePrice: 16.14 }
];

// Helper normal probability density function
function ndf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2);
}

// Helper standard normal cumulative distribution function
function cnd(x: number): number {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const L = Math.abs(x);
  const K = 1.0 / (1.0 + 0.2316419 * L);
  let w = 1.0 - 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-L * L / 2) * (a1 * K + a2 * K * K + a3 * Math.pow(K, 3) + a4 * Math.pow(K, 4) + a5 * Math.pow(K, 5));
  if (x < 0) {
    w = 1.0 - w;
  }
  return w;
}

// Helper Black-Scholes Pricing Model for Call and Put options
function blackScholes(s: number, k: number, t: number, v: number, r: number, type: "CE" | "PE"): number {
  if (t <= 0) {
    if (type === "CE") return Math.max(0.50, s - k);
    return Math.max(0.50, k - s);
  }
  const d1 = (Math.log(s / k) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  let price = 0;
  if (type === "CE") {
    price = s * cnd(d1) - k * Math.exp(-r * t) * cnd(d2);
  } else {
    price = k * Math.exp(-r * t) * cnd(-d2) - s * cnd(-d1);
  }
  return Math.max(0.55, price); // Avoid zero value option premium
}

function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          clean[key] = sanitizeForFirestore(val);
        }
      }
    }
    return clean;
  }
  return obj;
}

function normalizeSymbolForOptions(sym: string): string {
  const s = sym.toUpperCase();
  if (s === "MIDCAP") return "MIDCPNIFTY";
  return s;
}

function parseExpiryDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    return dateStr;
  }
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const day = parts[0];
    const monthStr = parts[1].toLowerCase();
    const year = parts[2];
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };
    const month = months[monthStr] || "01";
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

function getLiveOptionPrice(
  globalIndicesRef: any,
  underlyingSymbol: string,
  expiryDate: string,
  optionType: "CE"|"PE",
  strikePrice: number,
  globalOptionsLtp?: Record<string, number>
): number | null {
  const normSym = normalizeSymbolForOptions(underlyingSymbol);
  const normExpiry = parseExpiryDate(expiryDate);
  if (globalOptionsLtp) {
    const key = `${normSym}-${normExpiry}-${optionType}-${strikePrice}`;
    if (globalOptionsLtp[key] !== undefined && globalOptionsLtp[key] > 0) {
      return globalOptionsLtp[key];
    }
  }
  const cache = globalIndicesRef?.current?.optionsLtp;
  if (cache) {
    const key = `${normSym}-${normExpiry}-${optionType}-${strikePrice}`;
    if (cache[key] !== undefined && cache[key] > 0) return cache[key];
  }
  return null;
}

// Get Option Strike Steps
function getStrikeStep(symbol: string): number {
  if (symbol === "BANKNIFTY") return 100;
  if (symbol === "NIFTY" || symbol === "FINNIFTY" || symbol === "MIDCAP") return 50;
  if (symbol === "RELIANCE" || symbol === "TCS") return 20;
  return 10;
}

// Generate Strike Prices around spot
function generateStrikes(symbol: string, spotPrice: number): number[] {
  const step = getStrikeStep(symbol);
  const center = Math.round(spotPrice / step) * step;
  const strikes = [];
  for (let i = -5; i <= 5; i++) {
    strikes.push(center + i * step);
  }
  return strikes;
}

// Get standard contract Lot Size
function getLotSize(symbol: string): number {
  if (symbol === "NIFTY") return 65;
  if (symbol === "BANKNIFTY") return 30;
  if (symbol === "FINNIFTY") return 60;
  if (symbol === "MIDCAP") return 120;
  return 250; // Stocks default lot size
}

// Helper to generate historical candles using a pseudo-random walk backward from basePrice
function generateHistoricalCandles(basePrice: number, count: number, timeframe: string): Candle[] {
  const candles: Candle[] = new Array(count);
  let currPrice = basePrice;
  const now = new Date();
  
  let timeStepMinutes = 5;
  if (timeframe === "1m") timeStepMinutes = 1;
  else if (timeframe === "3m") timeStepMinutes = 3;
  else if (timeframe === "15m") timeStepMinutes = 15;
  else if (timeframe === "30m") timeStepMinutes = 30;
  else if (timeframe === "1H") timeStepMinutes = 60;
  else if (timeframe === "1D") timeStepMinutes = 1440;

  for (let i = 0; i < count; i++) {
    const timeIndex = count - 1 - i;
    const t = new Date(now.getTime() - timeIndex * timeStepMinutes * 60 * 1000);
    const drift = (Math.random() - 0.5) * 0.001;
    const close = currPrice;
    const open = currPrice * (1 - drift);
    const high = Math.max(open, close) * (1 + Math.random() * 0.0005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0005);
    const volume = Math.round(10000 + Math.random() * 50000);

    candles[timeIndex] = {
      time: t.toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume
    };

    currPrice = open;
  }
  return candles;
}

const NSE_HOLIDAYS_2026 = [
  "2026-01-26", "2026-02-15", "2026-03-03", "2026-03-20",
  "2026-04-03", "2026-04-14", "2026-05-01", "2026-05-28",
  "2026-07-16", "2026-08-15", "2026-09-05", "2026-09-15",
  "2026-10-02", "2026-10-20", "2026-11-08", "2026-11-24",
  "2026-12-25"
];

const getKolkataTimeInfo = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour12: false
  }).formatToParts(date);
  
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  
  return {
    weekday: getPart("weekday"),
    hour: parseInt(getPart("hour"), 10) % 24,
    minute: parseInt(getPart("minute"), 10),
    second: parseInt(getPart("second"), 10),
    year: parseInt(getPart("year"), 10),
    month: parseInt(getPart("month"), 10),
    day: parseInt(getPart("day"), 10),
  };
};

function isHoliday(date: Date): boolean {
  const info = getKolkataTimeInfo(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${info.year}-${pad(info.month)}-${pad(info.day)}`;
  return NSE_HOLIDAYS_2026.includes(dateStr);
}

function isWeekend(date: Date): boolean {
  const info = getKolkataTimeInfo(date);
  return info.weekday === "Saturday" || info.weekday === "Sunday";
}

function getNextOpenSession(now: Date): Date {
  const next = new Date(now.getTime());
  
  for (let i = 0; i < 30; i++) {
    const info = getKolkataTimeInfo(next);
    const year = info.year;
    const month = String(info.month).padStart(2, "0");
    const day = String(info.day).padStart(2, "0");
    const targetOpenUTC = new Date(`${year}-${month}-${day}T03:45:00.000Z`);
    
    if (targetOpenUTC.getTime() > now.getTime()) {
      if (!isWeekend(targetOpenUTC) && !isHoliday(targetOpenUTC)) {
        return targetOpenUTC;
      }
    }
    next.setDate(next.getDate() + 1);
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function getSessionCloseTime(now: Date): Date {
  const info = getKolkataTimeInfo(now);
  const year = info.year;
  const month = String(info.month).padStart(2, "0");
  const day = String(info.day).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T10:00:00.000Z`);
}

export default function AdvancedDashboardTab() {
  const { user, online } = useFirebase();

  // Navigation states
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "options" | "analytics" | "positions">("overview");

  // Primary States
  const [virtualBalance, setVirtualBalance] = useState<number>(1000000);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);
  const [searchQuery, setSearchQuery] = useState("");
  const [watchlistPrices, setWatchlistPrices] = useState<{ [symbol: string]: number }>(() => {
    try {
      const cached = localStorage.getItem("ik_adv_watchlist_prices");
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
  });
  const [watchlistChanges, setWatchlistChanges] = useState<{ [symbol: string]: { change: number; pct: number } }>(() => {
    try {
      const cached = localStorage.getItem("ik_adv_watchlist_changes");
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {};
  });
  const [watchlistFlash, setWatchlistFlash] = useState<{ [symbol: string]: "up" | "down" | null }>({});

  // Market status and live data fetching states
  const [marketStatus, setMarketStatus] = useState<"Pre Open" | "Open" | "Closed" | "Holiday">("Closed");
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [globalIndices, setGlobalIndices] = useState<any>(null);

  // Chart & Drawing States
  const [chartPrefs, setChartPrefs] = useState<ChartPreferences>({
    chartType: "candlestick",
    timeframe: "5m",
    selectedSymbol: "NIFTY",
    indicators: {
      ema9: true,
      ema21: false,
      sma20: false,
      sma50: false,
      vwap: true,
      bb: false,
      rsi: true,
      macd: true,
      supertrend: false,
      pivotsClassic: false,
      pivotsCamarilla: false,
      oiOverlay: true,
      volumeProfile: true,
      cpr: false
    }
  });

  const [ema1Period, setEma1Period] = useState<number>(15);
  const [ema2Period, setEma2Period] = useState<number>(20);
  const [cprColors, setCprColors] = useState({
    tc: '#06b6d4',     // Cyan
    pivot: '#8b5cf6',  // Purple
    bc: '#f43f5e'      // Rose
  });
  const [showOiDetailModal, setShowOiDetailModal] = useState<boolean>(false);

  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeTool, setActiveTool] = useState<"pan" | "trendline" | "horizontal" | "fibonacci">("pan");
  const [tempDrawingPoints, setTempDrawingPoints] = useState<{ index: number; price: number }[]>([]);

  // Heatmap Calendar Filter State
  const [heatmapFilter, setHeatmapFilter] = useState<"current_month" | "3_months" | "6_months" | "current_year">("current_year");

  // AI Market Overview and Predictions UI States
  const [fiiDiiData, setFiiDiiData] = useState<any[]>([]);
  const [predHorizon, setPredHorizon] = useState<"30m" | "1h" | "session">("30m");

  // Options trading configurations
  const [instrumentClass, setInstrumentClass] = useState<"EQUITY" | "OPTIONS">("OPTIONS");
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");
  const [selectedStrike, setSelectedStrike] = useState<number>(23600);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [lots, setLots] = useState<number>(1);

  // Option Chain UI States
  const [isOptionsChainCollapsed, setIsOptionsChainCollapsed] = useState<boolean>(false);
  const [onlyShowMajorStrikes, setOnlyShowMajorStrikes] = useState<boolean>(true);

  // Scalper Panel Configurations
  const [useLimit, setUseLimit] = useState<boolean>(false);
  const [useStopLossTarget, setUseStopLossTarget] = useState<boolean>(false);
  const [useTrailingStop, setUseTrailingStop] = useState<boolean>(false);
  const [trailingDistance, setTrailingDistance] = useState<number>(10);

  // Active Positions Table States
  const [limitExitInputs, setLimitExitInputs] = useState<Record<string, string>>({});

  // Order Panel Form States
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP_LOSS" | "TARGET">("MARKET");
  const [quantity, setQuantity] = useState<number>(10);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [stopLossPrice, setStopLossPrice] = useState<number>(0);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [showOrderConfirm, setShowOrderConfirm] = useState<{ type: "BUY" | "SELL" } | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState<boolean>(true);

  // Sync / Loader States
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [globalIndicesLastUpdated, setGlobalIndicesLastUpdated] = useState<number>(Date.now());
  const [devMode, setDevMode] = useState<boolean>(false);
  const [lastTickTime, setLastTickTime] = useState<number>(Date.now());

  // 1a. Countdown timer for current time ticking
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1b. Derive market status and next session timer
  const marketSessionInfo = useMemo(() => {
    const info = getKolkataTimeInfo(currentTime);
    const totalMinutes = info.hour * 60 + info.minute;

    const weekend = isWeekend(currentTime);
    const holiday = isHoliday(currentTime);

    let status: "Open" | "Pre Open" | "Closed" | "Holiday" = "Closed";
    let countdownLabel = "";
    let targetTime = new Date();

    if (weekend) {
      status = "Closed";
      countdownLabel = "Next Session Open";
      targetTime = getNextOpenSession(currentTime);
    } else if (holiday) {
      status = "Holiday";
      countdownLabel = "Next Session Open";
      targetTime = getNextOpenSession(currentTime);
    } else {
      if (totalMinutes >= 540 && totalMinutes < 555) { // 9:00 AM - 9:15 AM
        status = "Pre Open";
        countdownLabel = "Market Opens In";
        targetTime = getNextOpenSession(currentTime);
      } else if (totalMinutes >= 555 && totalMinutes < 930) { // 9:15 AM - 3:30 PM
        status = "Open";
        countdownLabel = "Market Closes In";
        targetTime = getSessionCloseTime(currentTime);
      } else {
        status = "Closed";
        countdownLabel = "Next Session Open";
        targetTime = getNextOpenSession(currentTime);
      }
    }

    const diffMs = targetTime.getTime() - currentTime.getTime();
    let timerStr = "00:00:00";
    if (diffMs > 0) {
      const diffSecs = Math.floor(diffMs / 1000);
      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      
      const pad = (num: number) => String(num).padStart(2, "0");
      timerStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    return { status, countdownLabel, timerStr };
  }, [currentTime]);

  // 1c. Sync derived marketStatus status
  useEffect(() => {
    setMarketStatus(marketSessionInfo.status);
  }, [marketSessionInfo.status]);

  // Refs to prevent interval loop restarts and capture current state in callback
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const chartPrefsRef = useRef(chartPrefs);
  chartPrefsRef.current = chartPrefs;
  const virtualBalanceRef = useRef(virtualBalance);
  virtualBalanceRef.current = virtualBalance;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const globalIndicesRef = useRef(globalIndices);
  globalIndicesRef.current = globalIndices;
  const tradesRef = useRef(trades);
  tradesRef.current = trades;
  const watchlistPricesRef = useRef(watchlistPrices);
  watchlistPricesRef.current = watchlistPrices;
  const watchlistChangesRef = useRef(watchlistChanges);
  watchlistChangesRef.current = watchlistChanges;
  const marketStatusRef = useRef(marketStatus);
  marketStatusRef.current = marketStatus;

  // Refs for tracking tick loop updates
  const priceUpdateTimerRef = useRef<number | null>(null);
  const prevPriceRef = useRef<{ [symbol: string]: number }>({});
  const lastFetchedPricesRef = useRef<{ [symbol: string]: number }>({});
  const lastFetchedPrevClosesRef = useRef<{ [symbol: string]: number }>({});
  const globalOptionsLtpRef = useRef<{ [key: string]: number }>({});

  // SVG Chart Mouse Interaction Refs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mouseCrosshair, setMouseCrosshair] = useState<{ x: number; y: number; index: number; price: number } | null>(null);

  // SVG Dimension state driven by ResizeObserver to fix clientWidth initialization issues
  const [chartDimensions, setChartDimensions] = useState({ width: 800, height: 220 });

  // Bind ResizeObserver to track exact sizing bounds of SVG chart
  useEffect(() => {
    if (!svgRef.current) return;
    
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setChartDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    
    resizeObserver.observe(svgRef.current);
    window.addEventListener("resize", updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  // 1. Live Market Data Polling (Yahoo Finance server endpoints)
  useEffect(() => {
    async function fetchLiveMarketData() {
      try {
        const res = await fetch(getApiUrl("/api/market/global"));
        if (res.ok) {
          const data = await res.json();
          setGlobalIndices(data);
          setGlobalIndicesLastUpdated(Date.now());
          setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }
      } catch (err) {
        console.warn("Failed to fetch live index data:", err);
      }
    }
    
    fetchLiveMarketData();
    const interval = setInterval(fetchLiveMarketData, 4000); // refresh every 4 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch FII/DII data
  useEffect(() => {
    async function fetchFiiDii() {
      try {
        const res = await fetch(getApiUrl("/api/market/fii-dii"));
        if (res.ok) {
          const data = await res.json();
          setFiiDiiData(data);
        }
      } catch (err) {
        console.warn("Failed to fetch FII/DII data:", err);
      }
    }
    fetchFiiDii();
    const interval = setInterval(fetchFiiDii, 30000); // check every 30s
    return () => clearInterval(interval);
  }, []);

  // Sync polling prices to watchlist prices
  useEffect(() => {
    if (globalIndices) {
      setWatchlistPrices(prev => {
        const next = { ...prev };
        if (globalIndices.nifty) next["NIFTY"] = globalIndices.nifty.price;
        if (globalIndices.banknifty) next["BANKNIFTY"] = globalIndices.banknifty.price;
        if (globalIndices.finnifty) next["FINNIFTY"] = globalIndices.finnifty.price;
        if (globalIndices.midcap) next["MIDCAP"] = globalIndices.midcap.price;
        if (globalIndices.indiavix) next["VIX"] = globalIndices.indiavix.price;
        return next;
      });
      
      setWatchlistChanges(prev => {
        const next = { ...prev };
        if (globalIndices.nifty) next["NIFTY"] = { change: globalIndices.nifty.change, pct: globalIndices.nifty.pct };
        if (globalIndices.banknifty) next["BANKNIFTY"] = { change: globalIndices.banknifty.change, pct: globalIndices.banknifty.pct };
        if (globalIndices.finnifty) next["FINNIFTY"] = { change: globalIndices.finnifty.change, pct: globalIndices.finnifty.pct };
        if (globalIndices.midcap) next["MIDCAP"] = { change: globalIndices.midcap.change, pct: globalIndices.midcap.pct };
        if (globalIndices.indiavix) next["VIX"] = { change: globalIndices.indiavix.change, pct: globalIndices.indiavix.pct };
        return next;
      });
    }
  }, [globalIndices]);

  // 2. Initial State Syncing
  useEffect(() => {
    async function loadDashboardData() {
      if (!user) return;
      setLoading(true);
      try {
        const docRef = doc(db, "users", user.uid, "settings", "advanced_dashboard");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.virtualBalance !== undefined) setVirtualBalance(data.virtualBalance);
          if (data.trades) setTrades(data.trades);
          if (data.watchlist) setWatchlist(data.watchlist);
          if (data.chartPrefs) {
            const loadedPrefs = data.chartPrefs;
            const mergedPrefs = {
              ...loadedPrefs,
              indicators: {
                ema9: true,
                ema21: false,
                sma20: false,
                sma50: false,
                vwap: true,
                bb: false,
                rsi: true,
                macd: true,
                supertrend: false,
                pivotsClassic: false,
                pivotsCamarilla: false,
                oiOverlay: true,
                volumeProfile: true,
                cpr: false,
                ...(loadedPrefs.indicators || {})
              }
            };
            setChartPrefs(mergedPrefs);
          }
          if (data.drawings) setDrawings(data.drawings);
        } else {
          // Initialize Firestore with default balance
          const cleanInit = sanitizeForFirestore({
            virtualBalance: 1000000,
            trades: [],
            watchlist: INITIAL_WATCHLIST,
            chartPrefs: chartPrefs,
            drawings: []
          });
          await setDoc(docRef, cleanInit);
        }
      } catch (err) {
        console.warn("Firestore sync failed, loaded default values:", err);
        const cached = localStorage.getItem(`ik_adv_dash_${user.uid}`);
        if (cached) {
          try {
            const data = JSON.parse(cached);
            if (data.virtualBalance !== undefined) setVirtualBalance(data.virtualBalance);
            if (data.trades) setTrades(data.trades);
            if (data.watchlist) setWatchlist(data.watchlist);
            if (data.chartPrefs) {
              const loadedPrefs = data.chartPrefs;
              const mergedPrefs = {
                ...loadedPrefs,
                indicators: {
                  ema9: true,
                  ema21: false,
                  sma20: false,
                  sma50: false,
                  vwap: true,
                  bb: false,
                  rsi: true,
                  macd: true,
                  supertrend: false,
                  pivotsClassic: false,
                  pivotsCamarilla: false,
                  oiOverlay: true,
                  volumeProfile: true,
                  cpr: false,
                  ...(loadedPrefs.indicators || {})
                }
              };
              setChartPrefs(mergedPrefs);
            }
            if (data.drawings) setDrawings(data.drawings);
          } catch (e) {}
        }
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, [user]);

  // Save watchlistPrices to localStorage when they update to prevent mount flicker
  useEffect(() => {
    if (Object.keys(watchlistPrices).length > 0) {
      localStorage.setItem("ik_adv_watchlist_prices", JSON.stringify(watchlistPrices));
    }
  }, [watchlistPrices]);

  useEffect(() => {
    if (Object.keys(watchlistChanges).length > 0) {
      localStorage.setItem("ik_adv_watchlist_changes", JSON.stringify(watchlistChanges));
    }
  }, [watchlistChanges]);

  // Save changes to Firestore
  const saveDashboardState = async (
    bal: number,
    trs: PaperTrade[],
    wlist: WatchlistItem[],
    prefs: ChartPreferences,
    draws: Drawing[]
  ) => {
    if (!user) return;
    setIsSaving(true);
    localStorage.setItem(`ik_adv_dash_${user.uid}`, JSON.stringify({
      virtualBalance: bal,
      trades: trs,
      watchlist: wlist,
      chartPrefs: prefs,
      drawings: draws
    }));

    if (online) {
      try {
        const docRef = doc(db, "users", user.uid, "settings", "advanced_dashboard");
        const cleanPayload = sanitizeForFirestore({
          virtualBalance: bal,
          trades: trs,
          watchlist: wlist,
          chartPrefs: prefs,
          drawings: draws
        });
        await setDoc(docRef, cleanPayload, { merge: true });
      } catch (err) {
        console.warn("Failed to upload dashboard changes:", err);
      }
    }
    setIsSaving(false);
  };

  // Seed candle chart from real Yahoo Finance OHLCV data
  useEffect(() => {
    let isMounted = true;
    const intervalMap: Record<string, string> = {
      "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
      "1h": "1h", "1d": "1d", "1w": "1wk"
    };
    const rangeMap: Record<string, string> = {
      "1m": "1d", "5m": "1d", "15m": "5d", "30m": "5d",
      "1h": "1mo", "1d": "6mo", "1w": "2y"
    };
    const yInterval = intervalMap[chartPrefs.timeframe] || "5m";
    const yRange    = rangeMap[chartPrefs.timeframe]    || "1d";

    const fetchCandles = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/market/candles?symbol=${chartPrefs.selectedSymbol}&interval=${yInterval}&range=${yRange}`));
        if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`);
        const json = await res.json();
        if (isMounted && Array.isArray(json.candles) && json.candles.length > 0) {
          setCandleData(json.candles.map((c: any) => ({
            time:   c.time,
            open:   c.open,
            high:   c.high,
            low:    c.low,
            close:  c.close,
            volume: c.volume ?? 0
          })));
        }
      } catch (err) {
        console.warn("Candle data fetch error:", err);
      }
    };

    fetchCandles();
    // Re-fetch every 15 seconds for intraday, 60s for daily+
    const pollMs = ["1d", "1wk"].includes(yInterval) ? 60000 : 15000;
    const timer = setInterval(fetchCandles, pollMs);
    return () => { isMounted = false; clearInterval(timer); };
  }, [chartPrefs.selectedSymbol, chartPrefs.timeframe]);

  // Dynamic strike list and expiry dates generator
  const strikesList = useMemo(() => {
    const activeAsset = watchlist.find(w => w.symbol === chartPrefs.selectedSymbol);
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || (activeAsset ? activeAsset.basePrice : 22000);
    return generateStrikes(chartPrefs.selectedSymbol, spot);
  }, [chartPrefs.selectedSymbol, watchlistPrices, watchlist]);

  const [expiriesList, setExpiriesList] = useState<string[]>([]);
  const [optionChain, setOptionChain] = useState<OptionChainRow[]>([]);
  const [isFetchingOptionChain, setIsFetchingOptionChain] = useState(false);
  const [rawOptionData, setRawOptionData] = useState<any[]>([]);

  // Fetch real Option Chain from backend
  useEffect(() => {
    let isMounted = true;
    const fetchChain = async () => {
      // Only fetch if we're on a symbol that supports options (usually indices or FNO stocks)
      const isIndex = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "MIDCAP"].includes(chartPrefs.selectedSymbol);
      if (!isIndex && chartPrefs.selectedSymbol !== "RELIANCE" && chartPrefs.selectedSymbol !== "HDFCBANK") return; // For safety
      
      setIsFetchingOptionChain(true);
      try {
        const res = await fetch(getApiUrl(`/api/market/options?symbol=${chartPrefs.selectedSymbol}`));
        if (!res.ok) throw new Error("Failed to fetch option chain");
        const data = await res.json();
        // Server now returns { records: nseData.records } so data.records is directly accessible
        const records = data.records;
        if (isMounted && records && records.expiryDates && records.expiryDates.length > 0) {
          setExpiriesList(records.expiryDates);
          if (!selectedExpiry) {
            setSelectedExpiry(records.expiryDates[0]);
          }
          setRawOptionData(records.data || []);
          
          // Populate client-side global option price cache
          if (Array.isArray(records.data)) {
            records.data.forEach((item: any) => {
              const strike = item.strikePrice;
              const exp = parseExpiryDate(item.expiryDate || item.expiryDates);
              const underlying = normalizeSymbolForOptions(chartPrefs.selectedSymbol);
              if (item.CE && item.CE.lastPrice !== undefined && item.CE.lastPrice > 0) {
                globalOptionsLtpRef.current[`${underlying}-${exp}-CE-${strike}`] = item.CE.lastPrice;
              }
              if (item.PE && item.PE.lastPrice !== undefined && item.PE.lastPrice > 0) {
                globalOptionsLtpRef.current[`${underlying}-${exp}-PE-${strike}`] = item.PE.lastPrice;
              }
            });
          }
        }
      } catch (err) {
        console.error("Error fetching option chain:", err);
      } finally {
        if (isMounted) setIsFetchingOptionChain(false);
      }
    };

    fetchChain();
    // Poll every 5 seconds
    const interval = setInterval(fetchChain, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [chartPrefs.selectedSymbol]);

  // Derive optionChain row from rawOptionData for the selectedExpiry
  useEffect(() => {
    if (!rawOptionData || rawOptionData.length === 0 || !selectedExpiry) return;
    
    // NSE format "02-Jun-2026", sometimes it's returned as "02-Jun-2026" in data
    const filteredData = rawOptionData.filter(item => parseExpiryDate(item.expiryDate || item.expiryDates) === parseExpiryDate(selectedExpiry));
    
    const rows: OptionChainRow[] = filteredData.map(item => {
      const ce = item.CE || {};
      const pe = item.PE || {};
      
      // Determine Buildup logic for CE
      let ceBuildUp: OptionChainRow["ceBuildUp"] = "Long Build-up";
      const cePriceUp = (ce.change || 0) > 0;
      const ceOIUp = (ce.changeinOpenInterest || 0) > 0;
      if (cePriceUp && ceOIUp) ceBuildUp = "Long Build-up";
      else if (!cePriceUp && ceOIUp) ceBuildUp = "Short Build-up";
      else if (cePriceUp && !ceOIUp) ceBuildUp = "Short Covering";
      else ceBuildUp = "Long Unwinding";

      // Determine Buildup logic for PE
      let peBuildUp: OptionChainRow["peBuildUp"] = "Long Build-up";
      const pePriceUp = (pe.change || 0) > 0;
      const peOIUp = (pe.changeinOpenInterest || 0) > 0;
      if (pePriceUp && peOIUp) peBuildUp = "Long Build-up";
      else if (!pePriceUp && peOIUp) peBuildUp = "Short Build-up";
      else if (pePriceUp && !peOIUp) peBuildUp = "Short Covering";
      else peBuildUp = "Long Unwinding";

      return {
        strike: item.strikePrice,
        ceOI: ce.openInterest || 0,
        ceChangeOI: ce.changeinOpenInterest || 0,
        ceVolume: ce.totalTradedVolume || 0,
        ceLtp: ce.lastPrice || 0,
        ceBuildUp,
        peOI: pe.openInterest || 0,
        peChangeOI: pe.changeinOpenInterest || 0,
        peVolume: pe.totalTradedVolume || 0,
        peLtp: pe.lastPrice || 0,
        peBuildUp
      };
    }).sort((a, b) => a.strike - b.strike); // Ensure sorted by strike
    
    setOptionChain(rows);
  }, [rawOptionData, selectedExpiry]);

  const expiryLabels = useMemo(() => {
    return {
      [expiriesList[0]]: "Current Weekly Expiry",
      [expiriesList[1]]: "Next Weekly Expiry",
      [expiriesList[2]]: "Monthly Expiry"
    };
  }, [expiriesList]);

  // Sync default options values on selection change
  useEffect(() => {
    if (strikesList.length > 0) {
      setSelectedStrike(strikesList[5]); // Default to ATM
    }
    if (expiriesList.length > 0) {
      setSelectedExpiry(expiriesList[0]);
    }
  }, [chartPrefs.selectedSymbol, strikesList, expiriesList]);

  // Fake generator removed, using API now

  // Support, Resistance and Max Pain calculation parameters
  const highestCeOIStrike = useMemo(() => {
    let maxOI = -1;
    let maxStrike = 0;
    optionChain.forEach(row => {
      if (row.ceOI > maxOI) {
        maxOI = row.ceOI;
        maxStrike = row.strike;
      }
    });
    return maxStrike;
  }, [optionChain]);

  const highestPeOIStrike = useMemo(() => {
    let maxOI = -1;
    let maxStrike = 0;
    optionChain.forEach(row => {
      if (row.peOI > maxOI) {
        maxOI = row.peOI;
        maxStrike = row.strike;
      }
    });
    return maxStrike;
  }, [optionChain]);

  const maxPain = useMemo(() => {
    let minLoss = Infinity;
    let maxPainStrike = 0;
    const strikes = optionChain.map(r => r.strike);
    
    strikes.forEach(targetStrike => {
      let totalLoss = 0;
      optionChain.forEach(row => {
        if (targetStrike > row.strike) {
          totalLoss += (targetStrike - row.strike) * row.ceOI;
        }
        if (targetStrike < row.strike) {
          totalLoss += (row.strike - targetStrike) * row.peOI;
        }
      });
      
      if (totalLoss < minLoss) {
        minLoss = totalLoss;
        maxPainStrike = targetStrike;
      }
    });
    return maxPainStrike;
  }, [optionChain]);

  // PCR Analytics
  const pcrAnalytics = useMemo(() => {
    let totalCeOI = 0;
    let totalPeOI = 0;
    let totalCeVol = 0;
    let totalPeVol = 0;
    
    optionChain.forEach(row => {
      totalCeOI += row.ceOI;
      totalPeOI += row.peOI;
      totalCeVol += row.ceVolume;
      totalPeVol += row.peVolume;
    });

    const oiPcr = Number((totalPeOI / (totalCeOI || 1)).toFixed(3));
    const volPcr = Number((totalPeVol / (totalCeVol || 1)).toFixed(3));
    const livePcr = Number(((oiPcr + volPcr) / 2).toFixed(3));
    
    let strength = "Neutral";
    if (oiPcr > 1.25) strength = "Strong Bullish";
    else if (oiPcr > 1.05) strength = "Mild Bullish";
    else if (oiPcr < 0.75) strength = "Strong Bearish";
    else if (oiPcr < 0.95) strength = "Mild Bearish";
    else strength = "Neutral / Consolidation";

    return { oiPcr, volPcr, livePcr, strength };
  }, [optionChain]);

  // Real-time Option Premium premium pricing calculation using spot, strikes & vix
  // Real-time Option Premium premium pricing calculation using spot, strikes & vix
  const currentOptionPremium = useMemo(() => {
    if (instrumentClass !== "OPTIONS") return 0;
    
    // Find the current strike in the optionChain
    const row = optionChain.find(r => r.strike === selectedStrike);
    let ltp = 0;
    if (row) {
      ltp = optionType === "CE" ? row.ceLtp : row.peLtp;
    }
    if (ltp > 0) return ltp;

    // Black-Scholes fallback
    const currentSpot = watchlistPrices[chartPrefs.selectedSymbol] || (watchlist.find(w => w.symbol === chartPrefs.selectedSymbol)?.basePrice || 22000);
    const expDateStr = selectedExpiry || expiriesList[0];
    if (!expDateStr) return 50; // Generic fallback if no expiry list yet
    const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const T = diffDays / 365;
    const vix = watchlistPrices["VIX"] || 16.14;
    const vol = vix / 100;
    const bsPrice = blackScholes(currentSpot, selectedStrike, T, vol, 0.07, optionType);
    return Number(bsPrice.toFixed(2));
  }, [instrumentClass, selectedStrike, optionType, optionChain, watchlistPrices, chartPrefs.selectedSymbol, selectedExpiry, expiriesList, watchlist]);

  // Derive active positions to draw on chart
  const chartActivePositions = useMemo(() => {
    return trades
      .filter(t => t.status === "OPEN" && t.symbol === chartPrefs.selectedSymbol)
      .filter(t => {
        if (instrumentClass === "OPTIONS") {
          return t.instrumentClass === "OPTIONS" &&
                 t.optionType === optionType &&
                 t.strikePrice === selectedStrike &&
                 t.expiryDate === selectedExpiry;
        } else {
          return t.instrumentClass === "EQUITY";
        }
      })
      .map(t => ({
        price: t.entryPrice,
        type: t.type,
        label: t.instrumentClass === "OPTIONS" ? `${t.optionType} ${t.strikePrice}` : t.symbol,
        sl: t.stopLossPrice,
        target: t.targetPrice
      }));
  }, [trades, chartPrefs.selectedSymbol, instrumentClass, optionType, selectedStrike, selectedExpiry]);

  // Reset order values on options premium drift
  useEffect(() => {
    const price = instrumentClass === "OPTIONS" ? currentOptionPremium : (watchlistPrices[chartPrefs.selectedSymbol] || 0);
    if (price) {
      setLimitPrice(Number(price.toFixed(2)));
      setStopLossPrice(Number((instrumentClass === "OPTIONS" 
        ? (orderType === "MARKET" || orderType === "LIMIT" ? price * 0.70 : price * 0.995) 
        : price * 0.995).toFixed(2)));
      setTargetPrice(Number((instrumentClass === "OPTIONS"
        ? (orderType === "MARKET" || orderType === "LIMIT" ? price * 1.50 : price * 1.015) 
        : price * 1.015).toFixed(2)));
    }
  }, [chartPrefs.selectedSymbol, watchlistPrices, currentOptionPremium, instrumentClass]);

  // Transform spot candles into Option Premium candles historically using Black-Scholes model
  const optionCandleData = useMemo((): Candle[] => {
    if (instrumentClass !== "OPTIONS") return candleData;
    const rawExp = selectedExpiry || (expiriesList && expiriesList[0]);
    if (!rawExp) return [];
    const expDate = new Date(rawExp);
    if (isNaN(expDate.getTime())) return [];

    const today = new Date();
    const vix = watchlistPrices["VIX"] || 16.14;
    const vol = vix / 100;

    return candleData.map((c, idx) => {
      const candleDecayDays = (candleData.length - 1 - idx) * (chartPrefs.timeframe === "1D" ? 1 : 0.015);
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.max(0.1, diffTime / (1000 * 60 * 60 * 24) + candleDecayDays);
      const T = diffDays / 365;

      let open = Number(blackScholes(c.open, selectedStrike, T, vol, 0.07, optionType).toFixed(2));
      let close = Number(blackScholes(c.close, selectedStrike, T, vol, 0.07, optionType).toFixed(2));
      let high = Number(blackScholes(c.high, selectedStrike, T, vol, 0.07, optionType).toFixed(2));
      let low = Number(blackScholes(c.low, selectedStrike, T, vol, 0.07, optionType).toFixed(2));

      if (isNaN(open) || !isFinite(open)) open = c.open;
      if (isNaN(close) || !isFinite(close)) close = c.close;
      if (isNaN(high) || !isFinite(high)) high = c.high;
      if (isNaN(low) || !isFinite(low)) low = c.low;

      return {
        time: c.time,
        open,
        high,
        low,
        close,
        volume: Math.round(c.volume * 0.4) 
      };
    });
  }, [instrumentClass, candleData, selectedStrike, selectedExpiry, optionType, expiriesList, watchlistPrices, chartPrefs.timeframe]);

  // Option chart active candles choice
  const activeCandles = useMemo(() => {
    return activeSubTab === "options" ? optionCandleData : candleData;
  }, [activeSubTab, optionCandleData, candleData]);

  // Simulated Option Open Interest Line Chart values
  const optionOI = useMemo((): number[] => {
    let currentOI = 150000;
    const oiList: number[] = [];
    
    optionCandleData.forEach((c) => {
      const priceChange = c.close - c.open;
      const changePct = priceChange / (c.open || 1);
      const deltaOI = Math.round(c.volume * changePct * 0.4);
      currentOI = Math.max(50000, currentOI + deltaOI);
      oiList.push(currentOI);
    });
    return oiList;
  }, [optionCandleData]);

  // Implied Volatility and Greeks Calculations
  const optionGreeks = useMemo(() => {
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 22000;
    const strike = selectedStrike || spot;
    const vix = watchlistPrices["VIX"] || 16.14;
    const ivRank = Number(((vix - 10) / (25 - 10) * 100).toFixed(1)); 

    const rawExp = selectedExpiry || (expiriesList && expiriesList[0]);
    if (!rawExp) {
      return {
        delta: 0,
        theta: 0,
        gamma: 0,
        vega: 0,
        iv: Number(vix.toFixed(2)),
        ivRank: Math.max(0, Math.min(100, ivRank))
      };
    }

    const expDate = new Date(rawExp);
    if (isNaN(expDate.getTime())) {
      return {
        delta: 0,
        theta: 0,
        gamma: 0,
        vega: 0,
        iv: Number(vix.toFixed(2)),
        ivRank: Math.max(0, Math.min(100, ivRank))
      };
    }

    const today = new Date();
    const diffDays = Math.max(0.1, (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const T = diffDays / 365;
    const vol = vix / 100;
    const r = 0.07;

    const d1 = (Math.log(spot / strike) + (r + (vol * vol) / 2) * T) / (vol * Math.sqrt(T));
    const d2 = d1 - vol * Math.sqrt(T);

    const deltaCE = cnd(d1);
    const deltaPE = deltaCE - 1;

    const thetaTerm1 = -(spot * ndf(d1) * vol) / (2 * Math.sqrt(T));
    const thetaTerm2_CE = r * strike * Math.exp(-r * T) * cnd(d2);
    const thetaTerm2_PE = r * strike * Math.exp(-r * T) * cnd(-d2);

    const thetaCE = (thetaTerm1 - thetaTerm2_CE) / 365;
    const thetaPE = (thetaTerm1 + thetaTerm2_PE) / 365;

    const gamma = ndf(d1) / (spot * vol * Math.sqrt(T));
    const vega = (spot * ndf(d1) * Math.sqrt(T)) / 100;

    const delta = optionType === "CE" ? deltaCE : deltaPE;
    const theta = optionType === "CE" ? thetaCE : thetaPE;

    return {
      delta: isNaN(delta) ? 0 : Number(delta.toFixed(3)),
      theta: isNaN(theta) ? 0 : Number(theta.toFixed(2)),
      gamma: isNaN(gamma) ? 0 : Number(gamma.toFixed(4)),
      vega: isNaN(vega) ? 0 : Number(vega.toFixed(2)),
      iv: Number(vix.toFixed(2)),
      ivRank: Math.max(0, Math.min(100, ivRank))
    };
  }, [chartPrefs.selectedSymbol, selectedStrike, selectedExpiry, optionType, watchlistPrices, expiriesList]);

  // Volume Profile calculation
  const volumeProfileBins = useMemo(() => {
    if (activeCandles.length === 0) return [];
    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const range = maxP - minP || 1;
    
    const numBins = 10;
    const binSize = range / numBins;
    const bins = Array(numBins).fill(0).map((_, i) => ({
      minPrice: minP + i * binSize,
      maxPrice: minP + (i + 1) * binSize,
      volume: 0
    }));
    
    activeCandles.forEach(c => {
      const binIdx = Math.min(numBins - 1, Math.floor((c.close - minP) / binSize));
      if (binIdx >= 0 && binIdx < numBins) {
        bins[binIdx].volume += c.volume;
      }
    });
    
    const maxVol = Math.max(...bins.map(b => b.volume)) || 1;
    return bins.map(b => ({
      ...b,
      widthPct: (b.volume / maxVol) * 100
    }));
  }, [activeCandles]);

  // 3a. Initialize prices for new watchlist items without resetting existing ones
  useEffect(() => {
    setWatchlistPrices(prevPrices => {
      const nextPrices = { ...prevPrices };
      let updated = false;
      watchlist.forEach(item => {
        if (nextPrices[item.symbol] === undefined) {
          nextPrices[item.symbol] = item.basePrice;
          prevPriceRef.current[item.symbol] = item.basePrice;
          updated = true;
        }
      });
      return updated ? nextPrices : prevPrices;
    });

    setWatchlistChanges(prevChanges => {
      const nextChanges = { ...prevChanges };
      let updated = false;
      watchlist.forEach(item => {
        if (nextChanges[item.symbol] === undefined) {
          nextChanges[item.symbol] = { change: 0, pct: 0 };
          updated = true;
        }
      });
      return updated ? nextChanges : prevChanges;
    });
  }, [watchlist]);

  // 3b. Real-Time Price Simulation & Order Execution Engine (Never restarts)
  useEffect(() => {
    priceUpdateTimerRef.current = window.setInterval(() => {
      setLastTickTime(Date.now());
      
      const currentPrices = watchlistPricesRef.current;
      const currentChanges = watchlistChangesRef.current;

      const nextPrices = { ...currentPrices };
      const nextChanges = { ...currentChanges };
      const nextFlash: { [sym: string]: "up" | "down" | null } = {};
      let pricesChanged = false;

      watchlistRef.current.forEach(item => {
        const isRealIndex = item.symbol === "NIFTY" || item.symbol === "BANKNIFTY" || item.symbol === "FINNIFTY" || item.symbol === "MIDCAP" || item.symbol === "VIX";
        
        if (item.isOption) {
          const isMarketOpen = marketStatusRef.current === "Open" || marketStatusRef.current === "Pre Open";
          if (!isMarketOpen) {
            nextPrices[item.symbol] = currentPrices[item.symbol] || item.basePrice;
            nextChanges[item.symbol] = currentChanges[item.symbol] || { change: 0, pct: 0 };
            return;
          }

          const underlyingPrice = nextPrices[item.underlyingSymbol || "NIFTY"] || 22000;
          const expDate = item.expiryDate || expiriesList[0];
          const today = new Date();
          const diffDays = Math.max(0.1, (new Date(expDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const T = diffDays / 365;
          const vix = nextPrices["VIX"] || 16.14;
          const vol = vix / 100;
          
          let price = getLiveOptionPrice(globalIndicesRef, item.underlyingSymbol || "NIFTY", expDate, item.optionType || "CE", item.strikePrice || underlyingPrice, globalOptionsLtpRef.current);
          if (price === null) {
            price = Number(blackScholes(underlyingPrice, item.strikePrice || underlyingPrice, T, vol, 0.07, item.optionType || "CE").toFixed(2));
          }
          
          const oldPrice = currentPrices[item.symbol] || item.basePrice;
          nextPrices[item.symbol] = price;
          const totalChange = price - item.basePrice;
          const changePct = (totalChange / item.basePrice) * 100;
          nextChanges[item.symbol] = {
            change: Number(totalChange.toFixed(2)),
            pct: Number(changePct.toFixed(2))
          };
          if (price !== oldPrice) {
            nextFlash[item.symbol] = price > oldPrice ? "up" : "down";
            pricesChanged = true;
          }
        } else if (isRealIndex) {
          const serverKey = item.symbol === "NIFTY" ? "nifty" : 
                            item.symbol === "BANKNIFTY" ? "banknifty" :
                            item.symbol === "FINNIFTY" ? "finnifty" :
                            item.symbol === "MIDCAP" ? "midcap" : "indiavix";
          const indexVal = globalIndicesRef.current ? globalIndicesRef.current[serverKey] : null;
          const prevPrice = currentPrices[item.symbol] || item.basePrice;
          let nextPrice = prevPrice;

          const isMarketOpen = marketStatusRef.current === "Open" || marketStatusRef.current === "Pre Open";

          if (indexVal) {
            const lastFetchedPrice = lastFetchedPricesRef.current[item.symbol] || 0;
            const fetchedPrevClose = indexVal.previousClose || (indexVal.price - indexVal.change);
            if (fetchedPrevClose) {
              lastFetchedPrevClosesRef.current[item.symbol] = fetchedPrevClose;
            }
            if (indexVal.price !== lastFetchedPrice) {
              nextPrice = indexVal.price;
              lastFetchedPricesRef.current[item.symbol] = indexVal.price;
              nextChanges[item.symbol] = { change: indexVal.change, pct: indexVal.pct };
            } else if (isMarketOpen) {
              const drift = item.symbol === "VIX" 
                ? (Math.random() - 0.5) * 0.001
                : (Math.random() - 0.495) * 0.00015;
              nextPrice = Number((prevPrice * (1 + drift)).toFixed(2));
              const refClose = lastFetchedPrevClosesRef.current[item.symbol] || item.basePrice;
              const totalChange = nextPrice - refClose;
              const changePct = (totalChange / refClose) * 100;
              nextChanges[item.symbol] = {
                change: Number(totalChange.toFixed(2)),
                pct: Number(changePct.toFixed(2))
              };
            }
          } else if (isMarketOpen) {
            const drift = (Math.random() - 0.5) * 0.00015;
            nextPrice = Number((prevPrice * (1 + drift)).toFixed(2));
            const refClose = lastFetchedPrevClosesRef.current[item.symbol] || item.basePrice;
            const totalChange = nextPrice - refClose;
            const changePct = (totalChange / refClose) * 100;
            nextChanges[item.symbol] = {
              change: Number(totalChange.toFixed(2)),
              pct: Number(changePct.toFixed(2))
            };
          }
          
          nextPrices[item.symbol] = nextPrice;
          if (nextPrice !== prevPrice) {
            nextFlash[item.symbol] = nextPrice > prevPrice ? "up" : "down";
            pricesChanged = true;
          }
        } else if (!isRealIndex && !PRODUCTION_REALTIME_ONLY && (marketStatusRef.current === "Open" || marketStatusRef.current === "Pre Open") && Math.random() > 0.4) { // Equities drift simulation only when open
          const prevPrice = currentPrices[item.symbol] || item.basePrice;
          const volatility = 0.0006;
          const drift = (Math.random() - 0.495) * volatility;
          const nextPrice = Number((prevPrice * (1 + drift)).toFixed(2));

          nextPrices[item.symbol] = nextPrice;
          const totalChange = nextPrice - item.basePrice;
          const changePct = (totalChange / item.basePrice) * 100;
          nextChanges[item.symbol] = {
            change: Number(totalChange.toFixed(2)),
            pct: Number(changePct.toFixed(2))
          };
          nextFlash[item.symbol] = nextPrice > prevPrice ? "up" : "down";
          pricesChanged = true;
        }
      });

      if (pricesChanged) {
        setWatchlistPrices(nextPrices);
        setWatchlistChanges(nextChanges);
        setWatchlistFlash(nextFlash);
        setTimeout(() => setWatchlistFlash({}), 300);
      }

      // Update active chart spot candles
      setCandleData(prevCandles => {
        const currentPrice = nextPrices[chartPrefsRef.current.selectedSymbol];
        if (!currentPrice) return prevCandles;
        
        if (prevCandles.length === 0) {
          return [{
            time: new Date().toISOString(),
            open: currentPrice,
            high: currentPrice,
            low: currentPrice,
            close: currentPrice,
            volume: 1
          }];
        }
        
        const updated = [...prevCandles];
        const lastIndex = updated.length - 1;
        const activeCandle = updated[lastIndex];

        updated[lastIndex] = {
          ...activeCandle,
          close: currentPrice,
          high: Math.max(activeCandle.high, currentPrice),
          low: Math.min(activeCandle.low, currentPrice)
        };
        return updated;
      });

      // Process Pending and Open Orders
      setTrades(prevTrades => {
        let stateChanged = false;
        let newBalance = virtualBalanceRef.current;

        const updatedTrades = prevTrades.map((trade): PaperTrade => {
          const currentSpot = nextPrices[trade.symbol];
          if (!currentSpot) return trade;

          // Option Premium calculations for live ticks
          let currentContractPrice = currentSpot;
          if (trade.instrumentClass === "OPTIONS") {
            const expDateStr = trade.expiryDate || expiriesList[0];
            const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const T = diffDays / 365;
            const vix = nextPrices["VIX"] || 16.14;
            const vol = vix / 100;
            
            currentContractPrice = getLiveOptionPrice(globalIndicesRef, trade.symbol, expDateStr, trade.optionType!, trade.strikePrice!, globalOptionsLtpRef.current) || 0;
            if (currentContractPrice === 0) {
              currentContractPrice = Number(blackScholes(currentSpot, trade.strikePrice!, T, vol, 0.07, trade.optionType!).toFixed(2));
            }
          }

          if (trade.status === "PENDING") {
            let shouldExecute = false;
            if (trade.orderType === "LIMIT") {
              if (trade.type === "BUY" && currentContractPrice <= trade.entryPrice) shouldExecute = true;
              if (trade.type === "SELL" && currentContractPrice >= trade.entryPrice) shouldExecute = true;
            }

            if (shouldExecute) {
              stateChanged = true;
              return {
                ...trade,
                status: "OPEN" as const,
                entryPrice: currentContractPrice, 
                createdAt: new Date().toISOString()
              };
            }
          } else if (trade.status === "OPEN") {
            let shouldClose = false;
            let closePrice = currentContractPrice;
            let updatedTrade = { ...trade };

            // Update Trailing Stop Loss first
            if (updatedTrade.useTrailingStop && updatedTrade.trailingDistance) {
              if (updatedTrade.type === "BUY") {
                const highest = updatedTrade.highestPrice !== undefined ? updatedTrade.highestPrice : updatedTrade.entryPrice;
                if (currentContractPrice > highest) {
                  updatedTrade.highestPrice = currentContractPrice;
                  const newSL = Number((currentContractPrice - updatedTrade.trailingDistance).toFixed(2));
                  if (!updatedTrade.stopLossPrice || newSL > updatedTrade.stopLossPrice) {
                    updatedTrade.stopLossPrice = newSL;
                    stateChanged = true;
                  }
                }
              } else { // SELL
                const lowest = updatedTrade.lowestPrice !== undefined ? updatedTrade.lowestPrice : updatedTrade.entryPrice;
                if (currentContractPrice < lowest) {
                  updatedTrade.lowestPrice = currentContractPrice;
                  const newSL = Number((currentContractPrice + updatedTrade.trailingDistance).toFixed(2));
                  if (!updatedTrade.stopLossPrice || newSL < updatedTrade.stopLossPrice) {
                    updatedTrade.stopLossPrice = newSL;
                    stateChanged = true;
                  }
                }
              }
            }

            // Normal Stop Loss / Target checking
            if (updatedTrade.type === "BUY") {
              if (updatedTrade.stopLossPrice && currentContractPrice <= updatedTrade.stopLossPrice) {
                shouldClose = true;
                closePrice = updatedTrade.stopLossPrice;
              } else if (updatedTrade.targetPrice && currentContractPrice >= updatedTrade.targetPrice) {
                shouldClose = true;
                closePrice = updatedTrade.targetPrice;
              }
            } else { // SELL
              if (updatedTrade.stopLossPrice && currentContractPrice >= updatedTrade.stopLossPrice) {
                shouldClose = true;
                closePrice = updatedTrade.stopLossPrice;
              } else if (updatedTrade.targetPrice && currentContractPrice <= updatedTrade.targetPrice) {
                shouldClose = true;
                closePrice = updatedTrade.targetPrice;
              }
            }

            if (shouldClose) {
              stateChanged = true;
              const profitOrLoss = updatedTrade.type === "BUY"
                ? (closePrice - updatedTrade.entryPrice) * updatedTrade.quantity
                : (updatedTrade.entryPrice - closePrice) * updatedTrade.quantity;

              newBalance += profitOrLoss;

              return {
                ...updatedTrade,
                status: "CLOSED" as const,
                exitPrice: closePrice,
                pnl: Number(profitOrLoss.toFixed(2)),
                closedAt: new Date().toISOString()
              };
            }
            return updatedTrade;
          }
          return trade;
        });

        if (stateChanged) {
          setVirtualBalance(newBalance);
          saveDashboardState(newBalance, updatedTrades, watchlistRef.current, chartPrefsRef.current, drawingsRef.current);
        }

        return updatedTrades;
      });
    }, 250);

    return () => {
      if (priceUpdateTimerRef.current) clearInterval(priceUpdateTimerRef.current);
    };
  }, []);

  // Derived Performance Metrics
  const openPositions = useMemo(() => {
    return trades.filter(t => t.status === "OPEN");
  }, [trades]);

  const closedTrades = useMemo(() => {
    return trades.filter(t => t.status === "CLOSED");
  }, [trades]);

  // Daily P&L and Equity Curve computation
  const pnlChartData = useMemo(() => {
    const grouped: { [date: string]: { pnl: number; tradesCount: number; wins: number; losses: number } } = {};
    
    const sortedTrades = [...closedTrades].sort((a, b) => {
      const timeA = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const timeB = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return timeA - timeB;
    });

    sortedTrades.forEach(t => {
      if (!t.closedAt) return;
      const dateStr = t.closedAt.split("T")[0];
      const tradePnl = t.pnl || 0;
      const isWin = tradePnl > 0;
      const isLoss = tradePnl < 0;

      if (!grouped[dateStr]) {
        grouped[dateStr] = { pnl: 0, tradesCount: 0, wins: 0, losses: 0 };
      }
      grouped[dateStr].pnl += tradePnl;
      grouped[dateStr].tradesCount += 1;
      if (isWin) grouped[dateStr].wins += 1;
      if (isLoss) grouped[dateStr].losses += 1;
    });

    const sortedDates = Object.keys(grouped).sort();
    
    let runningEquity = 1000000;
    const data = sortedDates.map(date => {
      const dayData = grouped[date];
      runningEquity += dayData.pnl;
      const winRate = dayData.tradesCount > 0 ? Math.round((dayData.wins / dayData.tradesCount) * 100) : 0;
      
      const dateObj = new Date(date);
      const displayDate = dateObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

      return {
        date,
        displayDate,
        pnl: Number(dayData.pnl.toFixed(2)),
        equity: Number(runningEquity.toFixed(2)),
        tradesCount: dayData.tradesCount,
        wins: dayData.wins,
        losses: dayData.losses,
        winRate
      };
    });

    if (data.length === 0) {
      return [{
        date: new Date().toISOString().split("T")[0],
        displayDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        pnl: 0,
        equity: 1000000,
        tradesCount: 0,
        wins: 0,
        losses: 0,
        winRate: 0
      }];
    }

    return data;
  }, [closedTrades]);

  const pendingOrders = useMemo(() => {
    return trades.filter(t => t.status === "PENDING");
  }, [trades]);

  // Unrealized Options/Equity P&L calculation
  const totalUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, pos) => {
      const currentSpot = watchlistPrices[pos.symbol] || pos.entryPrice;
      let currentPrice = currentSpot;

      if (pos.instrumentClass === "OPTIONS") {
        const expDateStr = pos.expiryDate || expiriesList[0];
        const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const T = diffDays / 365;
        const vix = watchlistPrices["VIX"] || 16.14;
        const vol = vix / 100;

        currentPrice = getLiveOptionPrice(globalIndicesRef, pos.symbol, expDateStr, pos.optionType!, pos.strikePrice!, globalOptionsLtpRef.current) || 0;
        if (currentPrice === 0) {
          currentPrice = blackScholes(currentSpot, pos.strikePrice!, T, vol, 0.07, pos.optionType!);
        }
      }

      const posPnl = pos.type === "BUY"
        ? (currentPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - currentPrice) * pos.quantity;
      return sum + posPnl;
    }, 0);
  }, [openPositions, watchlistPrices]);

  const totalRealizedPnl = useMemo(() => {
    return closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  }, [closedTrades]);

  const marginUsed = useMemo(() => {
    return openPositions.reduce((sum, pos) => {
      return sum + (pos.quantity * pos.entryPrice * 0.20); // 5x Margin
    }, 0);
  }, [openPositions]);

  const availableMargin = Math.max(0, virtualBalance - marginUsed);
  const accountEquity = virtualBalance + totalUnrealizedPnl;

  const connectionStatus = useMemo(() => {
    const diff = Date.now() - globalIndicesLastUpdated;
    if (diff < 10000) return "Green";
    if (diff < 20000) return "Yellow";
    return "Red";
  }, [globalIndicesLastUpdated, lastTickTime]);

  const filteredWatchlist = useMemo(() => {
    if (!searchQuery.trim()) return watchlist;
    return watchlist.filter(item =>
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [watchlist, searchQuery]);



  // Order Placement logic
  const handlePlaceOrder = (type: "BUY" | "SELL") => {
    if (marketStatusRef.current !== "Open") {
      alert("❌ Market Closed - Execution Disabled. Orders can only be placed during live market sessions.");
      return;
    }

    if (connectionStatus === "Red" && instrumentClass === "OPTIONS") {
      alert("❌ Cannot place option paper trades. Realtime Option Feed Disconnected.");
      return;
    }

    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 100;
    const executionPrice = instrumentClass === "OPTIONS" 
      ? (orderType === "LIMIT" ? limitPrice : currentOptionPremium)
      : (orderType === "LIMIT" ? limitPrice : spot);
    
    if (executionPrice <= 0) {
      alert("❌ Cannot place order: Valid premium or price is unavailable. Please wait for live feed or select an active strike.");
      return;
    }

    const calculatedQty = instrumentClass === "OPTIONS" 
      ? lots * getLotSize(chartPrefs.selectedSymbol)
      : quantity;

    const requiredMargin = calculatedQty * executionPrice * 0.20;
    if (requiredMargin > availableMargin && orderType !== "LIMIT") {
      alert("❌ Insufficient available margin for leverage simulator execution.");
      return;
    }

    if (confirmEnabled) {
      setShowOrderConfirm({ type });
    } else {
      executeOrderPlacement(type);
    }
  };

  const executeOrderPlacement = (type: "BUY" | "SELL") => {
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 100;
    const finalOrderType = useLimit ? "LIMIT" : "MARKET";
    const executionPrice = instrumentClass === "OPTIONS" 
      ? (finalOrderType === "LIMIT" ? limitPrice : currentOptionPremium)
      : (finalOrderType === "LIMIT" ? limitPrice : spot);

    if (executionPrice <= 0) {
      alert("❌ Cannot place order: Valid premium or price is unavailable. Please wait for live feed or select an active strike.");
      return;
    }

    const calculatedQty = instrumentClass === "OPTIONS" 
      ? lots * getLotSize(chartPrefs.selectedSymbol)
      : quantity;

    const finalSL = useStopLossTarget ? (stopLossPrice || undefined) : undefined;
    const finalTarget = useStopLossTarget ? (targetPrice || undefined) : undefined;

    const newOrder: PaperTrade = {
      id: "pt-" + Date.now() + Math.random().toString(36).substr(2, 5),
      symbol: chartPrefs.selectedSymbol,
      type,
      orderType: finalOrderType,
      quantity: calculatedQty,
      entryPrice: executionPrice,
      stopLossPrice: finalSL,
      targetPrice: finalTarget,
      status: finalOrderType === "LIMIT" ? ("PENDING" as const) : ("OPEN" as const),
      createdAt: new Date().toISOString(),
      instrumentClass,
      optionType: instrumentClass === "OPTIONS" ? optionType : undefined,
      strikePrice: instrumentClass === "OPTIONS" ? selectedStrike : undefined,
      expiryDate: instrumentClass === "OPTIONS" ? selectedExpiry : undefined,
      underlyingSpotPrice: spot,
      useTrailingStop: useTrailingStop || undefined,
      trailingDistance: useTrailingStop ? trailingDistance : undefined,
      highestPrice: useTrailingStop ? executionPrice : undefined,
      lowestPrice: useTrailingStop ? executionPrice : undefined,
    };

    const nextTrades = [newOrder, ...trades];
    setTrades(nextTrades);
    setShowOrderConfirm(null);

    saveDashboardState(virtualBalance, nextTrades, watchlist, chartPrefs, drawings);
  };

  const handleSetLimitExit = (tradeId: string, limitVal: number) => {
    if (limitVal <= 0 || isNaN(limitVal)) return;

    const updated = trades.map((t): PaperTrade => {
      if (t.id === tradeId && t.status === "OPEN") {
        const currentSpot = watchlistPrices[t.symbol] || t.entryPrice;
        let currentPrice = currentSpot;

        if (t.instrumentClass === "OPTIONS") {
          const expDateStr = t.expiryDate || expiriesList[0];
          const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const T = diffDays / 365;
          const vix = watchlistPrices["VIX"] || 16.14;
          const vol = vix / 100;
          
          currentPrice = getLiveOptionPrice(globalIndicesRef, t.symbol, expDateStr, t.optionType!, t.strikePrice!, globalOptionsLtpRef.current) || 0;
          if (currentPrice === 0) {
            currentPrice = blackScholes(currentSpot, t.strikePrice!, T, vol, 0.07, t.optionType!);
          }
        }

        let nextSL = t.stopLossPrice;
        let nextTarget = t.targetPrice;

        if (t.type === "BUY") {
          if (limitVal > currentPrice) {
            nextTarget = limitVal;
          } else {
            nextSL = limitVal;
          }
        } else { // SELL
          if (limitVal < currentPrice) {
            nextTarget = limitVal;
          } else {
            nextSL = limitVal;
          }
        }

        return {
          ...t,
          stopLossPrice: nextSL,
          targetPrice: nextTarget
        };
      }
      return t;
    });

    setTrades(updated);
    saveDashboardState(virtualBalance, updated, watchlist, chartPrefs, drawings);
  };

  const handleClosePosition = (tradeId: string) => {
    const updated = trades.map((t): PaperTrade => {
      if (t.id === tradeId && t.status === "OPEN") {
        const currentSpot = watchlistPrices[t.symbol] || t.entryPrice;
        let currentPrice = currentSpot;

        if (t.instrumentClass === "OPTIONS") {
          const expDateStr = t.expiryDate || expiriesList[0];
          const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const T = diffDays / 365;
          const vix = watchlistPrices["VIX"] || 16.14;
          const vol = vix / 100;
          
          currentPrice = getLiveOptionPrice(globalIndicesRef, t.symbol, expDateStr, t.optionType!, t.strikePrice!, globalOptionsLtpRef.current) || 0;
          if (currentPrice === 0) {
            currentPrice = blackScholes(currentSpot, t.strikePrice!, T, vol, 0.07, t.optionType!);
          }
        }

        const profitOrLoss = t.type === "BUY"
          ? (currentPrice - t.entryPrice) * t.quantity
          : (t.entryPrice - currentPrice) * t.quantity;

        const nextBalance = virtualBalance + profitOrLoss;
        setVirtualBalance(nextBalance);
        
        const closed: PaperTrade = {
          ...t,
          status: "CLOSED" as const,
          exitPrice: Number(currentPrice.toFixed(2)),
          pnl: Number(profitOrLoss.toFixed(2)),
          closedAt: new Date().toISOString()
        };

        setTimeout(() => {
          const nextTrList = trades.map((x): PaperTrade => x.id === tradeId ? closed : x);
          saveDashboardState(nextBalance, nextTrList, watchlist, chartPrefs, drawings);
        }, 10);

        return closed;
      }
      return t;
    });

    setTrades(updated);
  };

  const handleCancelPending = (tradeId: string) => {
    const updated = trades.filter(t => t.id !== tradeId);
    setTrades(updated);
    saveDashboardState(virtualBalance, updated, watchlist, chartPrefs, drawings);
  };

  const handleAddOptionToWatchlist = (strike: number, type: "CE" | "PE") => {
    const symbol = `${chartPrefs.selectedSymbol} ${selectedExpiry.substring(5)} ${strike} ${type}`;
    if (watchlist.some(w => w.symbol === symbol)) {
      alert("Option contract is already in your watchlist.");
      return;
    }
    
    const underlyingAsset = watchlist.find(w => w.symbol === chartPrefs.selectedSymbol);
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || (underlyingAsset ? underlyingAsset.basePrice : 22000);
    const expDate = new Date(selectedExpiry || expiriesList[0]);
    const today = new Date();
    const diffDays = Math.max(0.1, (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const T = diffDays / 365;
    const vix = watchlistPrices["VIX"] || 16.14;
    const vol = vix / 100;
    const initialPremium = Number(blackScholes(spot, strike, T, vol, 0.07, type).toFixed(2));

    const newItem: WatchlistItem = {
      symbol,
      name: `${chartPrefs.selectedSymbol} ${strike} ${type} (${selectedExpiry})`,
      market: "OPTIONS",
      basePrice: initialPremium,
      isOption: true,
      underlyingSymbol: chartPrefs.selectedSymbol,
      strikePrice: strike,
      optionType: type,
      expiryDate: selectedExpiry
    };

    const nextWatchlist = [...watchlist, newItem];
    setWatchlist(nextWatchlist);
    saveDashboardState(virtualBalance, trades, nextWatchlist, chartPrefs, drawings);
  };

  const handleRemoveFromWatchlist = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCoreIndex = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCAP", "VIX"].includes(symbol);
    if (isCoreIndex) {
      alert("Core index symbols cannot be removed from the watchlist.");
      return;
    }
    const nextWatchlist = watchlist.filter(w => w.symbol !== symbol);
    setWatchlist(nextWatchlist);
    saveDashboardState(virtualBalance, trades, nextWatchlist, chartPrefs, drawings);
  };

  const handleWatchlistClick = (item: WatchlistItem) => {
    if (item.isOption) {
      setChartPrefs(prev => ({ ...prev, selectedSymbol: item.underlyingSymbol || "NIFTY" }));
      setInstrumentClass("OPTIONS");
      if (item.optionType) setOptionType(item.optionType);
      if (item.strikePrice) setSelectedStrike(item.strikePrice);
      if (item.expiryDate) setSelectedExpiry(item.expiryDate);
      setActiveSubTab("options");
    } else {
      setChartPrefs(prev => ({ ...prev, selectedSymbol: item.symbol }));
      setInstrumentClass("EQUITY");
    }
  };

  const handleResetCapital = () => {
    if (confirm("Are you sure you want to reset your virtual trading account? This will clear all trades, watchlists and restore balance to ₹10,00,000.")) {
      setVirtualBalance(1000000);
      setTrades([]);
      setWatchlist(INITIAL_WATCHLIST);
      setDrawings([]);
      saveDashboardState(1000000, [], INITIAL_WATCHLIST, chartPrefs, []);
    }
  };

  const handleSetCapital = () => {
    const amountStr = prompt("Enter custom virtual capital balance amount (e.g. 500000):", virtualBalance.toString());
    if (amountStr !== null) {
      const val = parseFloat(amountStr.replace(/,/g, ""));
      if (!isNaN(val) && val >= 0) {
        setVirtualBalance(val);
        saveDashboardState(val, trades, watchlist, chartPrefs, drawings);
      } else {
        alert("Please enter a valid numeric value.");
      }
    }
  };

  // 4. Mathematical Indicator Calculations for Chart
  const computedIndicators = useMemo(() => {
    if (activeCandles.length === 0) return { sma20: [], sma50: [], ema1: [], ema2: [], vwap: [], bb: { upper: [], lower: [], middle: [] }, rsi: [], macd: { line: [], signal: [], histogram: [] }, supertrend: { line: [], dir: [] } };
    const close = activeCandles.map(c => c.close);
    const typical = activeCandles.map(c => (c.high + c.low + c.close) / 3);
    const volume = activeCandles.map(c => c.volume);
    const count = activeCandles.length;

    const calcSMA = (period: number) => {
      const smaList: (number | null)[] = [];
      for (let i = 0; i < count; i++) {
        if (i < period - 1) {
          smaList.push(null);
        } else {
          const sum = close.slice(i - period + 1, i + 1).reduce((s, val) => s + val, 0);
          smaList.push(Number((sum / period).toFixed(2)));
        }
      }
      return smaList;
    };

    const calcEMA = (period: number) => {
      const emaList: (number | null)[] = [];
      const multiplier = 2 / (period + 1);
      let prevEma: number | null = null;
      for (let i = 0; i < count; i++) {
        if (i < period - 1) {
          emaList.push(null);
        } else if (i === period - 1) {
          const sum = close.slice(0, period).reduce((s, val) => s + val, 0);
          prevEma = sum / period;
          emaList.push(Number(prevEma.toFixed(2)));
        } else {
          const currentEma = (close[i] - (prevEma ?? close[i])) * multiplier + (prevEma ?? close[i]);
          prevEma = currentEma;
          emaList.push(Number(currentEma.toFixed(2)));
        }
      }
      return emaList;
    };

    const calcVWAP = () => {
      const vwapList: (number | null)[] = [];
      let sumTypicalVol = 0;
      let sumVol = 0;
      for (let i = 0; i < count; i++) {
        sumTypicalVol += typical[i] * volume[i];
        sumVol += volume[i];
        vwapList.push(Number((sumTypicalVol / (sumVol || 1)).toFixed(2)));
      }
      return vwapList;
    };

    const middle = calcSMA(20);
    const bbUpper: (number | null)[] = [];
    const bbLower: (number | null)[] = [];
    for (let i = 0; i < count; i++) {
      const midVal = middle[i];
      if (midVal === null) {
        bbUpper.push(null);
        bbLower.push(null);
      } else {
        const slice = close.slice(i - 19, i + 1);
        const mean = midVal;
        const variance = slice.reduce((s, val) => s + Math.pow(val - mean, 2), 0) / 20;
        const stdDev = Math.sqrt(variance);
        bbUpper.push(Number((midVal + 2 * stdDev).toFixed(2)));
        bbLower.push(Number((midVal - 2 * stdDev).toFixed(2)));
      }
    }

    const rsiList: (number | null)[] = [];
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < count; i++) {
      if (i === 0) {
        rsiList.push(null);
        continue;
      }
      const change = close[i] - close[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i < 15) {
        avgGain += gain;
        avgLoss += loss;
        if (i === 14) {
          avgGain = avgGain / 14;
          avgLoss = avgLoss / 14;
          const rs = avgGain / (avgLoss || 1);
          rsiList.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
        } else {
          rsiList.push(null);
        }
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        const rs = avgGain / (avgLoss || 1);
        rsiList.push(Number((100 - 100 / (1 + rs)).toFixed(2)));
      }
    }

    const ema12 = calcEMA(12);
    const ema26 = calcEMA(26);
    const macdLine: (number | null)[] = [];
    for (let i = 0; i < count; i++) {
      const e12 = ema12[i];
      const e26 = ema26[i];
      if (e12 === null || e26 === null) {
        macdLine.push(null);
      } else {
        macdLine.push(Number((e12 - e26).toFixed(2)));
      }
    }

    const signalLine: (number | null)[] = [];
    const multiplier9 = 2 / (9 + 1);
    let prevSignal: number | null = null;
    let macdOffset = macdLine.findIndex(x => x !== null);
    
    for (let i = 0; i < count; i++) {
      if (i < macdOffset + 8) {
        signalLine.push(null);
      } else if (i === macdOffset + 8) {
        const sum = macdLine.slice(macdOffset, macdOffset + 9).reduce((s, val) => s + (val ?? 0), 0);
        prevSignal = sum / 9;
        signalLine.push(Number(prevSignal.toFixed(2)));
      } else {
        const currMacd = macdLine[i] ?? 0;
        const currentSignal = (currMacd - (prevSignal ?? currMacd)) * multiplier9 + (prevSignal ?? currMacd);
        prevSignal = currentSignal;
        signalLine.push(Number(currentSignal.toFixed(2)));
      }
    }

    const histogram: (number | null)[] = [];
    for (let i = 0; i < count; i++) {
      const macdVal = macdLine[i];
      const sigVal = signalLine[i];
      if (macdVal === null || sigVal === null) {
        histogram.push(null);
      } else {
        histogram.push(Number((macdVal - sigVal).toFixed(2)));
      }
    }

    // Super Trend (10, 3)
    const stLine: (number | null)[] = [];
    const stDir: ("up" | "down" | null)[] = [];

    if (count > 0) {
      const trList: number[] = [];
      for (let i = 0; i < count; i++) {
        if (i === 0) {
          trList.push(activeCandles[0].high - activeCandles[0].low);
        } else {
          const highLow = activeCandles[i].high - activeCandles[i].low;
          const highClosePrev = Math.abs(activeCandles[i].high - activeCandles[i - 1].close);
          const lowClosePrev = Math.abs(activeCandles[i].low - activeCandles[i - 1].close);
          trList.push(Math.max(highLow, highClosePrev, lowClosePrev));
        }
      }

      const atrList: number[] = [];
      let sumTr = 0;
      for (let i = 0; i < count; i++) {
        if (i < 10) {
          sumTr += trList[i];
          if (i === 9) {
            atrList.push(sumTr / 10);
          } else {
            atrList.push(0);
          }
        } else {
          const currentAtr = (atrList[i - 1] * 9 + trList[i]) / 10;
          atrList.push(currentAtr);
        }
      }

      const bubList: number[] = [];
      const blbList: number[] = [];
      const fubList: number[] = [];
      const flbList: number[] = [];

      for (let i = 0; i < count; i++) {
        const mid = (activeCandles[i].high + activeCandles[i].low) / 2;
        const bub = mid + 3 * atrList[i];
        const blb = mid - 3 * atrList[i];
        bubList.push(bub);
        blbList.push(blb);

        if (i === 0) {
          fubList.push(bub);
          flbList.push(blb);
        } else {
          const prevFub = fubList[i - 1];
          const prevFlb = flbList[i - 1];
          const prevClose = activeCandles[i - 1].close;

          const fub = (bub < prevFub || prevClose > prevFub) ? bub : prevFub;
          const flb = (blb > prevFlb || prevClose < prevFlb) ? blb : prevFlb;
          fubList.push(fub);
          flbList.push(flb);
        }
      }

      for (let i = 0; i < count; i++) {
        if (i < 9) {
          stLine.push(null);
          stDir.push(null);
        } else if (i === 9) {
          stLine.push(fubList[9]);
          stDir.push(activeCandles[9].close > fubList[9] ? "up" : "down");
        } else {
          const prevSt = stLine[i - 1]!;
          const prevDir = stDir[i - 1]!;
          const closeVal = activeCandles[i].close;
          const fub = fubList[i];
          const flb = flbList[i];

          let currentSt = prevSt;
          let currentDir = prevDir;

          if (prevDir === "up") {
            currentSt = closeVal > flb ? Math.max(prevSt, flb) : fub;
            currentDir = closeVal > currentSt ? "up" : "down";
          } else {
            currentSt = closeVal < fub ? Math.min(prevSt, fub) : flb;
            currentDir = closeVal > currentSt ? "up" : "down";
          }

          stLine.push(Number(currentSt.toFixed(2)));
          stDir.push(currentDir);
        }
      }
    }

    return {
      sma20: calcSMA(20),
      sma50: calcSMA(50),
      ema1: calcEMA(ema1Period),
      ema2: calcEMA(ema2Period),
      vwap: calcVWAP(),
      bb: { upper: bbUpper, lower: bbLower, middle },
      rsi: rsiList,
      macd: { line: macdLine, signal: signalLine, histogram },
      supertrend: { line: stLine, dir: stDir }
    };
  }, [activeCandles, ema1Period, ema2Period]);

  // Pivot Levels from PREVIOUS Candle
  const pivotClassicLevels = useMemo(() => {
    if (activeCandles.length < 2) return null;
    const prev = activeCandles[activeCandles.length - 2];
    const H = prev.high;
    const L = prev.low;
    const C = prev.close;

    const PP = (H + L + C) / 3;
    const R1 = 2 * PP - L;
    const S1 = 2 * PP - H;
    const R2 = PP + (H - L);
    const S2 = PP - (H - L);
    const R3 = H + 2 * (PP - L);
    const S3 = L - 2 * (H - PP);

    return { PP, R1, R2, R3, S1, S2, S3 };
  }, [activeCandles]);

  const pivotCamarillaLevels = useMemo(() => {
    if (activeCandles.length < 2) return null;
    const prev = activeCandles[activeCandles.length - 2];
    const H = prev.high;
    const L = prev.low;
    const C = prev.close;
    const range = H - L;

    const H4 = C + range * 1.1 / 2;
    const H3 = C + range * 1.1 / 4;
    const H2 = C + range * 1.1 / 6;
    const H1 = C + range * 1.1 / 12;
    const L1 = C - range * 1.1 / 12;
    const L2 = C - range * 1.1 / 6;
    const L3 = C - range * 1.1 / 4;
    const L4 = C - range * 1.1 / 2;

    return { H1, H2, H3, H4, L1, L2, L3, L4 };
  }, [activeCandles]);

  const pivotCprLevels = useMemo(() => {
    if (activeCandles.length < 2) return null;
    const prev = activeCandles[activeCandles.length - 2];
    const H = prev.high;
    const L = prev.low;
    const C = prev.close;

    const Pivot = (H + L + C) / 3;
    const BC = (H + L) / 2;
    const TC = (Pivot - BC) + Pivot;

    return {
      pivot: Pivot,
      tc: Math.max(TC, BC),
      bc: Math.min(TC, BC)
    };
  }, [activeCandles]);

  // Live Trade Assistant Signal Generator
  const tradeAssistant = useMemo(() => {
    // Check if market is closed or option data is unavailable
    if (marketStatusRef.current !== "Open" || !globalIndices || optionChain.length === 0 || !currentOptionPremium) {
      return { 
        hasSignal: false, 
        signal: "WAITING", 
        rationale: "Awaiting live market data & open market hours" 
      };
    }

    const pcr = pcrAnalytics.oiPcr;
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 22000;
    const lastCandleIdx = activeCandles.length - 1;
    const vwapVal = computedIndicators.vwap[lastCandleIdx] || spot;
    const rsiVal = computedIndicators.rsi[lastCandleIdx] || 50;

    let score = 0;
    if (pcr > 1.1) score += 2;
    else if (pcr < 0.8) score -= 2;

    if (spot > vwapVal) score += 1;
    else score -= 1;

    if (rsiVal > 53) score += 1;
    else if (rsiVal < 47) score -= 1;

    // Check if Nifty Bank is strong (for Nifty CE buying cue) or vice versa
    const bankNifty = globalIndices.banknifty;
    const isBankNiftyStrong = bankNifty && bankNifty.pct > 0.2;
    if (isBankNiftyStrong) score += 1;

    let signal: "BUY" | "SELL" | "WAITING" = "WAITING";
    let optionTypeForSignal: "CE" | "PE" = "CE";
    let reasons: string[] = [];

    if (score >= 2) {
      signal = "BUY";
      optionTypeForSignal = "CE";
      if (pcr > 1.1) reasons.push("Put writing increasing");
      if (pcr > 1) reasons.push("PCR rising");
      if (spot > vwapVal) reasons.push(`${chartPrefs.selectedSymbol} above VWAP`);
      if (isBankNiftyStrong) reasons.push("Bank Nifty strong");
    } else if (score <= -2) {
      signal = "SELL";
      optionTypeForSignal = "PE";
      if (pcr < 0.8) reasons.push("Call writing increasing");
      if (pcr < 1) reasons.push("PCR falling");
      if (spot < vwapVal) reasons.push(`${chartPrefs.selectedSymbol} below VWAP`);
      if (bankNifty && bankNifty.pct < -0.2) reasons.push("Bank Nifty weak");
    }

    if (signal === "WAITING") {
      return {
        hasSignal: false,
        signal: "WAITING",
        rationale: "Market consolidation. No high-probability setup detected."
      };
    }

    const premium = currentOptionPremium;
    const sl = Number((premium * 0.8).toFixed(2));
    const target = Number((premium * 1.4).toFixed(2));
    const confidence = Math.min(95, Math.max(65, 75 + score * 3));

    return {
      hasSignal: true,
      signal: signal === "BUY" ? "BULLISH" : "BEARISH",
      recommendation: `BUY ${chartPrefs.selectedSymbol} ${selectedStrike} ${optionTypeForSignal}`,
      entry: premium,
      stopLoss: sl,
      target: target,
      riskReward: "1:2",
      confidence: confidence,
      reason: reasons.join(", ") || "Technical breakout indicators aligned"
    };
  }, [pcrAnalytics, watchlistPrices, chartPrefs.selectedSymbol, activeCandles, optionChain, highestPeOIStrike, highestCeOIStrike, computedIndicators, globalIndices, currentOptionPremium]);

  // AI Market Overview Analytics Engine
  const aiMarketAnalytics = useMemo(() => {
    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 22000;
    const changePct = watchlistChanges[chartPrefs.selectedSymbol]?.pct || 0;
    const pcr = pcrAnalytics.oiPcr;
    
    // Default to Neutral
    let direction: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    let bullProb = 35;
    let bearProb = 35;
    let sideProb = 30;
    
    if (changePct > 0.15 && pcr > 1.0) {
      direction = "BULLISH";
      bullProb = 65;
      bearProb = 15;
      sideProb = 20;
    } else if (changePct < -0.15 && pcr < 0.95) {
      direction = "BEARISH";
      bullProb = 15;
      bearProb = 65;
      sideProb = 20;
    } else {
      // Moderate direction based on changePct
      if (changePct > 0) {
        bullProb = 45;
        bearProb = 25;
        sideProb = 30;
      } else if (changePct < 0) {
        bullProb = 25;
        bearProb = 45;
        sideProb = 30;
      }
    }
    
    // Key Reasons list
    const reasons: string[] = [];
    if (pcr > 1.1) reasons.push("Strong Put writing support (PCR is elevated)");
    else if (pcr < 0.85) reasons.push("Aggressive Call writing overhead (PCR is low)");
    else reasons.push("PCR is highly balanced at " + pcr.toFixed(2));
    
    if (changePct > 0) reasons.push("Buying momentum in index heavyweights");
    else if (changePct < 0) reasons.push("Distribution observed in large caps");
    
    const bankNiftyPct = watchlistChanges["BANKNIFTY"]?.pct || 0;
    if (bankNiftyPct > 0.25) reasons.push("Bank Nifty displaying strong leadership");
    else if (bankNiftyPct < -0.25) reasons.push("Bank Nifty showing structural weakness");
    
    if (reasons.length < 3) {
      reasons.push("Global indices stable");
      reasons.push("FII sentiment cautious but stable");
    }

    // Risk factors
    const risks = [
      "Volatility index (India VIX) is " + (watchlistPrices["VIX"] || 15).toFixed(1) + "%",
      "Macro trigger: US inflation report pending",
      "RBI policy guidelines expected this week",
      "Weekly contract expiry positioning shifts"
    ];

    // Tomorrow Outlook
    const step = getStrikeStep(chartPrefs.selectedSymbol);
    const center = Math.round(spot / step) * step;
    const expectedLow = center - step * 2;
    const expectedHigh = center + step * 2;
    const bullishAbove = center + step;
    const weakBelow = center - step;

    return {
      direction,
      bullProb,
      bearProb,
      sideProb,
      reasons: reasons.slice(0, 4),
      risks,
      outlook: {
        expectedRange: `₹${expectedLow.toLocaleString()} - ₹${expectedHigh.toLocaleString()}`,
        bullishAbove: `₹${bullishAbove.toLocaleString()}`,
        weakBelow: `₹${weakBelow.toLocaleString()}`
      }
    };
  }, [watchlistPrices, watchlistChanges, chartPrefs.selectedSymbol, pcrAnalytics]);

  // AI Horizon Prediction Data
  const predictionEngineData = useMemo(() => {
    const base = aiMarketAnalytics;
    let bull = base.bullProb;
    let bear = base.bearProb;
    let side = base.sideProb;
    
    if (predHorizon === "1h") {
      bull = Math.min(90, Math.max(10, bull + 3));
      bear = Math.min(90, Math.max(10, bear - 2));
      side = 100 - bull - bear;
    } else if (predHorizon === "session") {
      bull = Math.min(90, Math.max(10, bull - 5));
      bear = Math.min(90, Math.max(10, bear + 2));
      side = 100 - bull - bear;
    }
    
    return { bull, bear, side };
  }, [aiMarketAnalytics, predHorizon]);

  // 5. Drawing Tool Interactions on SVG Chart
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === "pan" || !svgRef.current || activeCandles.length === 0) return;
    
    const crossInfo = getCoordinatesFromMouse(e);
    if (!crossInfo) return;

    if (activeTool === "horizontal") {
      const newDrawing: Drawing = {
        type: "horizontal",
        points: [{ index: 0, price: crossInfo.price }],
        color: "#6366f1"
      };
      const nextDrawings = [...drawings, newDrawing];
      setDrawings(nextDrawings);
      saveDashboardState(virtualBalance, trades, watchlist, chartPrefs, nextDrawings);
      setActiveTool("pan");
    } else {
      setTempDrawingPoints([{ index: crossInfo.index, price: crossInfo.price }]);
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || activeCandles.length === 0) return;

    const crossInfo = getCoordinatesFromMouse(e);
    if (!crossInfo) return;

    setMouseCrosshair({
      x: crossInfo.x,
      y: crossInfo.y,
      index: crossInfo.index,
      price: crossInfo.price
    });
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tempDrawingPoints.length === 1 && (activeTool === "trendline" || activeTool === "fibonacci")) {
      const crossInfo = getCoordinatesFromMouse(e);
      if (!crossInfo) return;

      const newDrawing: Drawing = {
        type: activeTool,
        points: [...tempDrawingPoints, { index: crossInfo.index, price: crossInfo.price }],
        color: activeTool === "fibonacci" ? "#c084fc" : "#6366f1"
      };

      const nextDrawings = [...drawings, newDrawing];
      setDrawings(nextDrawings);
      saveDashboardState(virtualBalance, trades, watchlist, chartPrefs, nextDrawings);
      setTempDrawingPoints([]);
      setActiveTool("pan");
    }
  };

  const getCoordinatesFromMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartWidth = rect.width - padding.left - padding.right;
    const chartHeight = rect.height - padding.top - padding.bottom;

    if (mouseX < padding.left || mouseX > rect.width - padding.right ||
        mouseY < padding.top || mouseY > rect.height - padding.bottom) {
      return null;
    }

    const count = activeCandles.length;
    const candleWidth = chartWidth / count;
    const rawIndex = Math.floor((mouseX - padding.left) / candleWidth);
    const index = Math.max(0, Math.min(count - 1, rawIndex));

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const pctY = 1 - (mouseY - padding.top) / chartHeight;
    const price = Number((actualMin + pctY * (actualMax - actualMin)).toFixed(2));

    return { x: mouseX, y: mouseY, index, price };
  };

  const getFmtTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  const getFmtDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    } catch {
      return isoString;
    }
  };

  // 6. Paper Trading Analytics calculations from closed trades
  const analytics = useMemo(() => {
    if (closedTrades.length === 0) {
      return { winRate: 0, lossRate: 0, avgGain: 0, avgLoss: 0, maxWin: 0, maxLoss: 0, rr: "1:0.0", streakW: 0, streakL: 0 };
    }
    const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) <= 0);

    const winRate = Number(((wins.length / closedTrades.length) * 100).toFixed(1));
    const lossRate = Number(((losses.length / closedTrades.length) * 100).toFixed(1));

    const totalWinVal = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLossVal = losses.reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0);

    const avgGain = wins.length ? Number((totalWinVal / wins.length).toFixed(2)) : 0;
    const avgLoss = losses.length ? Number((totalLossVal / losses.length).toFixed(2)) : 0;

    const maxWin = Math.max(...wins.map(t => t.pnl || 0), 0);
    const maxLoss = Math.max(...losses.map(t => Math.abs(t.pnl || 0)), 0);

    const rrRatio = avgLoss ? (avgGain / avgLoss).toFixed(1) : "1.0";
    const rr = `1:${rrRatio}`;

    let maxStreakW = 0;
    let maxStreakL = 0;
    let currW = 0;
    let currL = 0;

    const chronologicalClosed = [...closedTrades].sort((a, b) => a.closedAt!.localeCompare(b.closedAt!));

    chronologicalClosed.forEach(t => {
      if ((t.pnl || 0) > 0) {
        currW++;
        currL = 0;
        if (currW > maxStreakW) maxStreakW = currW;
      } else {
        currL++;
        currW = 0;
        if (currL > maxStreakL) maxStreakL = currL;
      }
    });

    return { winRate, lossRate, avgGain, avgLoss, maxWin, maxLoss, rr, streakW: maxStreakW, streakL: maxStreakL };
  }, [closedTrades]);

  // Max Drawdown calculation
  const maxDrawdown = useMemo(() => {
    if (closedTrades.length === 0) return 0;
    const chronological = [...closedTrades].sort((a, b) => a.closedAt!.localeCompare(b.closedAt!));
    
    let balance = 1000000; 
    let peak = balance;
    let maxDd = 0;
    
    chronological.forEach(t => {
      balance += (t.pnl || 0);
      if (balance > peak) peak = balance;
      const dd = ((peak - balance) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    });
    return Number(maxDd.toFixed(2));
  }, [closedTrades]);

  // Expiry-wise P&L
  const expiryPnl = useMemo(() => {
    const map: { [expiry: string]: number } = {};
    closedTrades.forEach(t => {
      if (t.instrumentClass === "OPTIONS" && t.expiryDate) {
        map[t.expiryDate] = (map[t.expiryDate] || 0) + (t.pnl || 0);
      }
    });
    return map;
  }, [closedTrades]);

  // Symbol-wise performance distributions
  const tickerPnl = useMemo(() => {
    const map: { [sym: string]: number } = {};
    closedTrades.forEach(t => {
      map[t.symbol] = (map[t.symbol] || 0) + (t.pnl || 0);
    });
    return map;
  }, [closedTrades]);

  // Expiry-wise, Weekly and Monthly metrics
  const performanceAnalytics = useMemo(() => {
    const today = new Date();
    const firstOfMonthStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-01`;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfWeekStr = startOfWeek.toISOString().split("T")[0];

    const weeklyClosed = closedTrades.filter(t => t.closedAt && t.closedAt.split("T")[0] >= startOfWeekStr);
    const monthlyClosed = closedTrades.filter(t => t.closedAt && t.closedAt.split("T")[0] >= firstOfMonthStr);

    const weeklyPnl = weeklyClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const monthlyPnl = monthlyClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);

    return { weeklyPnl, monthlyPnl };
  }, [closedTrades]);

  // 7. Trading Heatmap Calendar using closed P&L data
  const heatmapData = useMemo(() => {
    const dailyMap: { [dateStr: string]: { pnl: number; count: number; wins: number } } = {};
    
    closedTrades.forEach(t => {
      if (!t.closedAt) return;
      const dStr = t.closedAt.split("T")[0];
      const isWin = (t.pnl || 0) > 0;

      if (!dailyMap[dStr]) {
        dailyMap[dStr] = { pnl: 0, count: 0, wins: 0 };
      }
      dailyMap[dStr].pnl += t.pnl || 0;
      dailyMap[dStr].count += 1;
      if (isWin) dailyMap[dStr].wins += 1;
    });

    const today = new Date();
    let numDays = 365;
    if (heatmapFilter === "current_month") numDays = 30;
    else if (heatmapFilter === "3_months") numDays = 90;
    else if (heatmapFilter === "6_months") numDays = 180;

    const daysList: { date: string; pnl: number; trades: number; winRate: number }[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dStr = d.toISOString().split("T")[0];
      const stats = dailyMap[dStr] || { pnl: 0, count: 0, wins: 0 };
      const wr = stats.count > 0 ? (stats.wins / stats.count) * 100 : 0;
      
      daysList.push({
        date: dStr,
        pnl: Number(stats.pnl.toFixed(2)),
        trades: stats.count,
        winRate: Number(wr.toFixed(1))
      });
    }

    return daysList;
  }, [closedTrades, heatmapFilter]);

  // Export CSV Helper
  const handleExportCSV = () => {
    if (closedTrades.length === 0) {
      alert("No closed trades to export.");
      return;
    }

    const headers = ["Date", "Time", "Symbol", "Class", "Option Type", "Strike", "Expiry", "Action", "Buy/Sell", "Entry Price", "Exit Price", "Quantity", "Profit/Loss", "Status"];
    const rows = closedTrades.map(t => [
      getFmtDate(t.createdAt),
      getFmtTime(t.createdAt),
      t.symbol,
      t.instrumentClass,
      t.optionType || "",
      t.strikePrice || "",
      t.expiryDate || "",
      t.orderType,
      t.type,
      t.entryPrice,
      t.exitPrice || 0,
      t.quantity,
      t.pnl || 0,
      t.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paper_trading_journal_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Rendering Indicator Line on SVG
  const renderIndicatorPath = (indicatorData: (number | null)[], color: string, strokeWidth = 1.2, key?: string) => {
    if (activeCandles.length === 0) return null;
    
    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartWidth = chartDimensions.width - padding.left - padding.right;
    const chartHeight = chartDimensions.height - padding.top - padding.bottom;

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const candleWidth = chartWidth / activeCandles.length;

    let pathPoints = "";
    indicatorData.forEach((val, idx) => {
      if (val === null) return;
      
      const x = padding.left + idx * candleWidth + candleWidth / 2;
      const pctY = (val - actualMin) / (actualMax - actualMin);
      const y = padding.top + chartHeight * (1 - pctY);

      if (pathPoints === "") {
        pathPoints = `M ${x} ${y}`;
      } else {
        pathPoints += ` L ${x} ${y}`;
      }
    });

    if (pathPoints === "") return null;
    return <path key={key} d={pathPoints} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
  };

  // Rendering Bollinger Bands Filled area
  const renderBollingerBandsArea = (bb: { upper: (number | null)[]; lower: (number | null)[] }) => {
    if (activeCandles.length === 0) return null;

    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartWidth = chartDimensions.width - padding.left - padding.right;
    const chartHeight = chartDimensions.height - padding.top - padding.bottom;

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const candleWidth = chartWidth / activeCandles.length;

    let topPoints = [];
    let bottomPoints = [];

    for (let i = 0; i < activeCandles.length; i++) {
      const up = bb.upper[i];
      const dn = bb.lower[i];
      if (up === null || dn === null) continue;

      const x = padding.left + i * candleWidth + candleWidth / 2;
      const pctUp = (up - actualMin) / (actualMax - actualMin);
      const yUp = padding.top + chartHeight * (1 - pctUp);

      const pctDn = (dn - actualMin) / (actualMax - actualMin);
      const yDn = padding.top + chartHeight * (1 - pctDn);

      topPoints.push({ x, y: yUp });
      bottomPoints.unshift({ x, y: yDn });
    }

    if (topPoints.length === 0) return null;
    
    const polygonPoints = [...topPoints, ...bottomPoints].map(p => `${p.x},${p.y}`).join(" ");
    
    return (
      <>
        <polygon points={polygonPoints} fill="rgba(99, 102, 241, 0.03)" stroke="none" />
        {renderIndicatorPath(bb.upper, "rgba(99, 102, 241, 0.2)", 0.8, "bb-upper")}
        {renderIndicatorPath(bb.lower, "rgba(99, 102, 241, 0.2)", 0.8, "bb-lower")}
      </>
    );
  };

  // Render Super Trend Path
  const renderSupertrendPath = (stList: (number | null)[], dirList: ("up" | "down" | null)[]) => {
    if (activeCandles.length === 0) return null;

    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartWidth = chartDimensions.width - padding.left - padding.right;
    const chartHeight = chartDimensions.height - padding.top - padding.bottom;

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const candleWidth = chartWidth / activeCandles.length;

    const lines = [];
    for (let i = 1; i < activeCandles.length; i++) {
      const val1 = stList[i - 1];
      const val2 = stList[i];
      const dir = dirList[i];
      if (val1 === null || val2 === null || !dir) continue;

      const x1 = padding.left + (i - 1) * candleWidth + candleWidth / 2;
      const x2 = padding.left + i * candleWidth + candleWidth / 2;
      
      const pctY1 = (val1 - actualMin) / (actualMax - actualMin);
      const pctY2 = (val2 - actualMin) / (actualMax - actualMin);

      const y1 = padding.top + chartHeight * (1 - pctY1);
      const y2 = padding.top + chartHeight * (1 - pctY2);

      const color = dir === "up" ? "#10b981" : "#ef4444";
      lines.push(
        <line key={`st-line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      );

      // Draw arrow on trend changes
      const prevDir = dirList[i - 1];
      if (prevDir && prevDir !== dir) {
        lines.push(
          <g key={`st-arrow-${i}`} fill={color}>
            <polygon points={dir === "up" 
              ? `${x2},${y2 + 4} ${x2 - 2.5},${y2 + 8} ${x2 + 2.5},${y2 + 8}` 
              : `${x2},${y2 - 4} ${x2 - 2.5},${y2 - 8} ${x2 + 2.5},${y2 - 8}`} 
            />
          </g>
        );
      }
    }
    return lines;
  };

  // Render Horizontal Support/Resistance pivots
  const renderClassicPivots = () => {
    if (activeCandles.length === 0 || !pivotClassicLevels) return null;

    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartHeight = chartDimensions.height - padding.top - padding.bottom;

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const levels = [
      { name: "PP", val: pivotClassicLevels.PP, color: "#eab308" },
      { name: "R1", val: pivotClassicLevels.R1, color: "#f87171" },
      { name: "R2", val: pivotClassicLevels.R2, color: "#ef4444" },
      { name: "R3", val: pivotClassicLevels.R3, color: "#b91c1c" },
      { name: "S1", val: pivotClassicLevels.S1, color: "#4ade80" },
      { name: "S2", val: pivotClassicLevels.S2, color: "#10b981" },
      { name: "S3", val: pivotClassicLevels.S3, color: "#047857" }
    ];

    return levels.map((lvl) => {
      const pctY = (lvl.val - actualMin) / (actualMax - actualMin);
      if (pctY < 0 || pctY > 1) return null;
      const y = padding.top + chartHeight * (1 - pctY);

      return (
        <g key={`pivot-classic-${lvl.name}`}>
          <line x1={padding.left} y1={y} x2={chartDimensions.width - padding.right} y2={y} stroke={lvl.color} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.5} />
          <text x={padding.left + 5} y={y - 2} fill={lvl.color} fontSize={6.5} fontFamily="monospace" opacity={0.6} fontWeight="bold">
            {lvl.name}: {lvl.val.toFixed(1)}
          </text>
        </g>
      );
    });
  };

  const renderCamarillaPivots = () => {
    if (activeCandles.length === 0 || !pivotCamarillaLevels) return null;

    const padding = { left: 10, right: 60, top: 15, bottom: 25 };
    const chartHeight = chartDimensions.height - padding.top - padding.bottom;

    const minP = Math.min(...activeCandles.map(c => c.low));
    const maxP = Math.max(...activeCandles.map(c => c.high));
    const padP = (maxP - minP) * 0.05 || 10;
    const actualMin = minP - padP;
    const actualMax = maxP + padP;

    const levels = [
      { name: "H4", val: pivotCamarillaLevels.H4, color: "#ef4444" },
      { name: "H3", val: pivotCamarillaLevels.H3, color: "#f87171" },
      { name: "H2", val: pivotCamarillaLevels.H2, color: "#f97316" },
      { name: "H1", val: pivotCamarillaLevels.H1, color: "#fb923c" },
      { name: "L1", val: pivotCamarillaLevels.L1, color: "#a7f3d0" },
      { name: "L2", val: pivotCamarillaLevels.L2, color: "#4ade80" },
      { name: "L3", val: pivotCamarillaLevels.L3, color: "#10b981" },
      { name: "L4", val: pivotCamarillaLevels.L4, color: "#047857" }
    ];

    return levels.map((lvl) => {
      const pctY = (lvl.val - actualMin) / (actualMax - actualMin);
      if (pctY < 0 || pctY > 1) return null;
      const y = padding.top + chartHeight * (1 - pctY);

      return (
        <g key={`pivot-camarilla-${lvl.name}`}>
          <line x1={padding.left} y1={y} x2={chartDimensions.width - padding.right} y2={y} stroke={lvl.color} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.5} />
          <text x={padding.left + 5} y={y - 2} fill={lvl.color} fontSize={6.5} fontFamily="monospace" opacity={0.6} fontWeight="bold">
            {lvl.name}: {lvl.val.toFixed(1)}
          </text>
        </g>
      );
    });
  };

  const getSmartOITag = (buildup: string, type: "CE" | "PE") => {
    if (type === "CE") {
      if (buildup === "Short Build-up") {
        return { label: "⚠️ CALL WRITING (BEARISH)", style: "text-rose-400 bg-rose-500/10 border border-rose-500/20" };
      }
      if (buildup === "Long Build-up") {
        return { label: "🚀 CALL BUYING (BULLISH)", style: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" };
      }
      if (buildup === "Short Covering") {
        return { label: "🔥 CE COVERING (BULLISH)", style: "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20" };
      }
      return { label: "📉 CE UNWINDING (BEARISH)", style: "text-amber-400 bg-amber-500/10 border border-amber-500/20" };
    } else {
      if (buildup === "Short Build-up") {
        return { label: "🚀 PUT WRITING (BULLISH)", style: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" };
      }
      if (buildup === "Long Build-up") {
        return { label: "⚠️ PUT BUYING (BEARISH)", style: "text-rose-400 bg-rose-500/10 border border-rose-500/20" };
      }
      if (buildup === "Short Covering") {
        return { label: "🔥 PE COVERING (BEARISH)", style: "text-rose-400 bg-rose-500/10 border border-rose-500/20" };
      }
      return { label: "📈 PE UNWINDING (BULLISH)", style: "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20" };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <span className="text-xs text-slate-500 font-mono">Initializing Derivatives Trading Hub...</span>
      </div>
    );
  }

  const activeSymbolPrice = watchlistPrices[chartPrefs.selectedSymbol] || 100;
  const activeSymbolChange = watchlistChanges[chartPrefs.selectedSymbol] || { change: 0, pct: 0 };

  return (
    <div className="space-y-6 text-left animate-fade-in">
      
      {/* ───── Title Bar & Market Status Ticker ───── */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-5 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full inline-block animate-pulse" />
            Trading Management Hub
          </h2>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Premium Indian options derivative workspace</p>
        </div>

        {/* Live Market status ticker */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-950/80 border border-slate-850 rounded-xl font-mono text-[9.5px]">
            <span className="text-slate-500 uppercase font-bold text-[8.5px]">NSE Status:</span>
            <span className={`px-2 py-0.5 rounded-md font-black text-[8px] uppercase ${
              marketSessionInfo.status === "Open" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" :
              marketSessionInfo.status === "Pre Open" ? "bg-amber-500/10 text-amber-450 border border-amber-500/20 animate-pulse" :
              marketSessionInfo.status === "Holiday" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
              "bg-rose-500/10 text-rose-455 border border-rose-500/20"
            }`}>
              {marketSessionInfo.status}
            </span>
            <span className="text-slate-800">|</span>
            <span className="text-slate-400">Refreshed: {lastUpdated || "--:--"}</span>
            <span className="text-slate-800">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold uppercase text-[8.5px]">{marketSessionInfo.countdownLabel}:</span>
              <span className="text-white font-black bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 tracking-wider text-[8.5px]">{marketSessionInfo.timerStr}</span>
            </div>
          </div>

          <button
            onClick={handleSetCapital}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-650/10 hover:bg-indigo-650/20 border border-indigo-500/25 text-indigo-400 text-[10px] font-bold rounded-xl transition cursor-pointer font-mono"
          >
            <Edit3 className="w-3 h-3 mr-0.5" />
            Set Capital
          </button>

          <button
            onClick={handleResetCapital}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-455 text-[10px] font-bold rounded-xl transition cursor-pointer font-mono"
          >
            Reset Account
          </button>
        </div>
      </div>

      {/* ───── Tab Navigation Bar ───── */}
      <div className="flex border-b border-slate-800/80 gap-1.5 p-1 bg-slate-950/40 rounded-xl">
        {[
          { id: "overview" as const, label: "Market Overview" },
          { id: "options" as const, label: "Options Terminal" },
          { id: "analytics" as const, label: "Performance & Logs" },
          { id: "positions" as const, label: "Active Positions" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer font-mono ${
              activeSubTab === tab.id
                ? "bg-slate-800 text-white border border-slate-700 shadow-md shadow-slate-900/50"
                : "text-slate-450 hover:text-slate-200"
            }`}
          >
            {tab.label}
            {tab.id === "positions" && openPositions.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-500 text-[8.5px] rounded-full text-white font-black animate-pulse">
                {openPositions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ───── TAB CONTENT 1: MARKET OVERVIEW ───── */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          
          {/* Index Cards Ticker */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCAP", "VIX"].map(ticker => {
              const asset = INITIAL_WATCHLIST.find(w => w.symbol === ticker);
              const drift = (globalIndices && globalIndices[ticker === "VIX" ? "indiavix" : ticker.toLowerCase()]);
              
              const fallbackPrice = drift ? drift.price : (asset ? asset.basePrice : 0);
              const price = watchlistPrices[ticker] || fallbackPrice;

              const fallbackChange = drift ? { change: drift.change, pct: drift.pct } : { change: 0, pct: 0 };
              const info = watchlistChanges[ticker] || fallbackChange;
              
              const openP = drift ? drift.open : (asset ? asset.basePrice : price);
              const highP = drift ? drift.high : price;
              const lowP = drift ? drift.low : price;
              const prevC = drift ? drift.previousClose : (asset ? asset.basePrice : price);

              const nameLabel = ticker === "MIDCAP" ? "NIFTY MID SELECT" : (asset ? asset.name.replace("Index", "") : ticker);
              const profit = info.change >= 0;

              return (
                <div 
                  key={ticker}
                  onClick={() => setChartPrefs({ ...chartPrefs, selectedSymbol: ticker })}
                  className={`bg-slate-900 border p-4.5 rounded-2xl flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700 shadow-lg cursor-pointer ${
                    chartPrefs.selectedSymbol === ticker ? "border-indigo-500/50 shadow-indigo-500/5" : "border-slate-800"
                  }`}
                >
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">{nameLabel}</span>
                  <span className={`text-md font-black mt-2 font-mono ${profit ? "text-emerald-400" : "text-rose-455"}`}>
                    {ticker === "VIX" ? "" : "₹"}{price.toLocaleString("en-IN", { minimumFractionDigits: price % 1 === 0 ? 0 : 2 })}
                  </span>
                  
                  <span className={`text-[9px] font-mono mt-1 font-semibold flex items-center ${profit ? "text-emerald-500" : "text-rose-500"}`}>
                    {profit ? "+" : ""}{info.pct}%
                  </span>

                  <div className="grid grid-cols-2 gap-1.5 border-t border-slate-950/60 mt-3 pt-2 font-mono text-[7.5px] text-slate-500">
                    <div>Open: <span className="text-slate-350">{openP}</span></div>
                    <div>High: <span className="text-slate-350">{highP}</span></div>
                    <div>Low: <span className="text-slate-350">{lowP}</span></div>
                    <div>Prev: <span className="text-slate-350">{prevC}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Standard Chart + Watchlist Workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* Chart Area */}
            <div className="xl:col-span-3 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex justify-between items-center gap-3.5 flex-wrap border-b border-slate-850 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase font-mono tracking-tight bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1.5 rounded-xl">
                      {chartPrefs.selectedSymbol} Index Chart
                    </span>
                    <span className={`text-sm font-mono font-black ${activeSymbolChange.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      ₹{activeSymbolPrice.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* Frame selection */}
                  <div className="flex items-center gap-2">
                    <div className="flex p-0.5 bg-slate-950/70 border border-slate-850 rounded-xl">
                      {(["1m", "5m", "1H", "1D"] as const).map(tf => (
                        <button
                          key={tf}
                          onClick={() => setChartPrefs({ ...chartPrefs, timeframe: tf as any })}
                          className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition ${
                            chartPrefs.timeframe === tf ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SVG Canvas Plot */}
                <div className="relative w-full h-[240px] bg-slate-950 border border-slate-900 rounded-2xl select-none overflow-hidden">
                  <svg
                    ref={svgRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseDown={handleSvgMouseDown}
                    onMouseMove={handleSvgMouseMove}
                    onMouseUp={handleSvgMouseUp}
                    onMouseLeave={() => setMouseCrosshair(null)}
                  >
                    {(() => {
                      if (activeCandles.length === 0) return null;
                      const padding = { left: 10, right: 60, top: 15, bottom: 25 };
                      const chartWidth = chartDimensions.width - padding.left - padding.right;
                      const chartHeight = chartDimensions.height - padding.top - padding.bottom;

                      const minP = Math.min(...activeCandles.map(c => c.low));
                      const maxP = Math.max(...activeCandles.map(c => c.high));
                      const padP = (maxP - minP) * 0.05 || 10;
                      const actualMin = minP - padP;
                      const actualMax = maxP + padP;

                      const count = activeCandles.length;
                      const candleWidth = chartWidth / count;

                      const grid = [];
                      for (let i = 0; i <= 5; i++) {
                        const priceVal = actualMin + (actualMax - actualMin) * (i / 5);
                        const y = padding.top + chartHeight * (1 - i / 5);
                        grid.push(
                          <g key={`grid-overview-${i}`}>
                            <line x1={padding.left} y1={y} x2={chartDimensions.width - padding.right} y2={y} stroke="rgba(255,255,255,0.02)" strokeDasharray="2 2" />
                            <text x={chartDimensions.width - padding.right + 5} y={y + 3} fill="rgba(255,255,255,0.25)" fontSize={7.5} fontFamily="monospace">
                              {priceVal.toFixed(1)}
                            </text>
                          </g>
                        );
                      }

                      const candles = [];
                      for (let i = 0; i < count; i++) {
                        const c = activeCandles[i];
                        const x = padding.left + i * candleWidth + candleWidth / 2;
                        const yOpen = padding.top + chartHeight * (1 - (c.open - actualMin) / (actualMax - actualMin));
                        const yClose = padding.top + chartHeight * (1 - (c.close - actualMin) / (actualMax - actualMin));
                        const yHigh = padding.top + chartHeight * (1 - (c.high - actualMin) / (actualMax - actualMin));
                        const yLow = padding.top + chartHeight * (1 - (c.low - actualMin) / (actualMax - actualMin));

                        const isBullish = c.close >= c.open;
                        const color = isBullish ? "#10b981" : "#ef4444";
                        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
                        const bodyY = Math.min(yOpen, yClose);

                        candles.push(
                          <g key={`candle-over-${i}`}>
                            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={0.8} />
                            <rect
                              x={x - candleWidth * 0.3}
                              y={bodyY}
                              width={Math.max(1, candleWidth * 0.6)}
                              height={bodyH}
                              fill={isBullish ? "transparent" : color}
                              stroke={color}
                              strokeWidth={1.2}
                              rx={0.5}
                            />
                          </g>
                        );
                      }

                      return (
                        <>
                          {grid}
                          {candles}
                          {mouseCrosshair && (
                            <g>
                              <line x1={padding.left} y1={mouseCrosshair.y} x2={chartDimensions.width - padding.right} y2={mouseCrosshair.y} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} strokeDasharray="2 2" />
                              <line x1={mouseCrosshair.x} y1={padding.top} x2={mouseCrosshair.x} y2={chartDimensions.height - padding.bottom} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} strokeDasharray="2 2" />
                            </g>
                          )}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* Advanced Analytics Grid: AI Summary, FII/DII, Prediction Engine */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* AI Market Summary Widget */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      AI Market Summary
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5 font-bold">Real-time LLM-fused technical overview</p>
                  </div>

                  <div className="space-y-3 font-mono text-[9.5px]">
                    <div className="flex justify-between items-center bg-slate-950/65 px-3 py-2 border border-slate-850 rounded-xl">
                      <span className="text-slate-500 font-bold uppercase text-[7.5px] tracking-wider">Market Direction</span>
                      <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wide flex items-center gap-1 ${
                        aiMarketAnalytics.direction === "BULLISH" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        aiMarketAnalytics.direction === "BEARISH" ? "bg-rose-500/10 text-rose-455 border border-rose-500/20" :
                        "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          aiMarketAnalytics.direction === "BULLISH" ? "bg-emerald-400 animate-ping" :
                          aiMarketAnalytics.direction === "BEARISH" ? "bg-rose-500 animate-ping" :
                          "bg-slate-400"
                        }`} />
                        {aiMarketAnalytics.direction}
                      </span>
                    </div>

                    <div className="space-y-1 bg-slate-950/30 p-2.5 border border-slate-850 rounded-xl">
                      <span className="text-[7.5px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Directional Probability</span>
                      <div className="flex h-2 rounded bg-slate-950 overflow-hidden">
                        <div style={{ width: `${aiMarketAnalytics.bullProb}%` }} className="bg-emerald-500 h-full transition-all duration-300" title={`Bullish: ${aiMarketAnalytics.bullProb}%`} />
                        <div style={{ width: `${aiMarketAnalytics.sideProb}%` }} className="bg-slate-700 h-full transition-all duration-300" title={`Sideways: ${aiMarketAnalytics.sideProb}%`} />
                        <div style={{ width: `${aiMarketAnalytics.bearProb}%` }} className="bg-rose-500 h-full transition-all duration-300" title={`Bearish: ${aiMarketAnalytics.bearProb}%`} />
                      </div>
                      <div className="flex justify-between text-[7px] text-slate-500 font-bold mt-1">
                        <span className="text-emerald-400">BULL: {aiMarketAnalytics.bullProb}%</span>
                        <span className="text-slate-400 font-medium">SIDE: {aiMarketAnalytics.sideProb}%</span>
                        <span className="text-rose-450">BEAR: {aiMarketAnalytics.bearProb}%</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-left pl-1">
                      <span className="text-[7.5px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Key Supporting Reasons</span>
                      {aiMarketAnalytics.reasons.map((r, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-slate-350">
                          <span className="text-indigo-400 font-bold">▪</span>
                          <span className="leading-tight">{r}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5 text-left border-t border-slate-850/60 pt-2.5 pl-1">
                      <span className="text-[7.5px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Active Risk Factors</span>
                      {aiMarketAnalytics.risks.slice(0, 3).map((r, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-slate-400">
                          <span className="text-rose-500/80 font-bold">⚠</span>
                          <span className="leading-tight">{r}</span>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-950/65 p-3 border border-slate-850 rounded-xl space-y-1.5 text-left">
                      <span className="text-[7.5px] text-indigo-400 uppercase tracking-widest font-bold block mb-1">Tomorrow's Market Outlook</span>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500">Expected Range:</span>
                        <span className="text-slate-200 font-bold">{aiMarketAnalytics.outlook.expectedRange}</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500">Bullish above:</span>
                        <span className="text-emerald-400 font-bold">{aiMarketAnalytics.outlook.bullishAbove}</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500">Weak below:</span>
                        <span className="text-rose-455 font-bold">{aiMarketAnalytics.outlook.weakBelow}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* FII / DII Intelligence Panel */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      FII / DII Intelligence
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5 font-bold">Institutional liquidity tracking (₹ Crores)</p>
                  </div>

                  {fiiDiiData.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-[10px] font-mono border border-dashed border-slate-800 rounded-xl">
                      Loading flow intelligence...
                    </div>
                  ) : (
                    <div className="space-y-4 font-mono text-[9.5px]">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-[9px]">
                          <thead>
                            <tr className="border-b border-slate-850 text-slate-500 text-[7px] uppercase font-bold tracking-wider">
                              <th className="pb-1.5">Date</th>
                              <th className="pb-1.5 text-right">FII Cash</th>
                              <th className="pb-1.5 text-right">DII Cash</th>
                              <th className="pb-1.5 text-right">Net Flow</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fiiDiiData.slice().reverse().map((row, idx) => {
                              const net = row.fiiCash + row.diiCash;
                              return (
                                <tr key={idx} className="border-b border-slate-955/45 hover:bg-slate-950/20">
                                  <td className="py-2 text-slate-400 font-bold">{row.date}</td>
                                  <td className={`py-2 text-right font-bold ${row.fiiCash >= 0 ? "text-emerald-450" : "text-rose-455"}`}>
                                    {row.fiiCash >= 0 ? "+" : ""}{row.fiiCash.toFixed(1)}
                                  </td>
                                  <td className={`py-2 text-right font-bold ${row.diiCash >= 0 ? "text-emerald-450" : "text-rose-455"}`}>
                                    {row.diiCash >= 0 ? "+" : ""}{row.diiCash.toFixed(1)}
                                  </td>
                                  <td className={`py-2 text-right font-extrabold ${net >= 0 ? "text-emerald-450" : "text-rose-455"}`}>
                                    {net >= 0 ? "+" : ""}{net.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* AI Flow Explanation block */}
                      <div className="bg-slate-955/65 p-3.5 border border-slate-850 rounded-xl space-y-1.5 text-left">
                        <span className="text-[7.5px] text-indigo-400 uppercase tracking-widest font-bold block mb-1">AI Flow Interpretation</span>
                        <p className="text-slate-350 text-[8.5px] leading-relaxed italic">
                          {(() => {
                            const lastDay = fiiDiiData[fiiDiiData.length - 1];
                            if (!lastDay) return "Awaiting latest session flow summaries.";
                            const fiiSold = lastDay.fiiCash < 0;
                            const diiBought = lastDay.diiCash > 0;
                            const netPositive = (lastDay.fiiCash + lastDay.diiCash) >= 0;
                            
                            if (fiiSold && diiBought) {
                              return `FII selling of ₹${Math.abs(lastDay.fiiCash).toFixed(0)} Cr was offset by DII buying of ₹${lastDay.diiCash.toFixed(0)} Cr. ${
                                netPositive ? "Domestic liquidity successfully absorbed institutional outflows, driving positive net structure." : "High selling pressure slightly outweighed domestic bids, leading to moderate downside correction."
                              }`;
                            } else if (!fiiSold && diiBought) {
                              return `Dual-buying support by both FII (+₹${lastDay.fiiCash.toFixed(0)} Cr) and DII (+₹${lastDay.diiCash.toFixed(0)} Cr) signals strong risk-on momentum and broad institutional accumulation.`;
                            } else if (fiiSold && !diiBought) {
                              return `Aggressive net institutional liquidation observed. FII sold ₹${Math.abs(lastDay.fiiCash).toFixed(0)} Cr, with DIIs also pulling back, putting immediate focus on local support levels.`;
                            } else {
                              return `FII flows are net positive at +₹${lastDay.fiiCash.toFixed(0)} Cr, signaling positive overseas capital inflows while domestic accounts remain highly balanced.`;
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Prediction Engine */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      AI Prediction Engine
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5 font-bold">High-frequency trend probability matrix</p>
                  </div>

                  {/* Horizon Toggles */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 border border-slate-850 rounded-xl font-mono text-[8px] uppercase tracking-wide">
                    {(["30m", "1h", "session"] as const).map(horizon => (
                      <button
                        key={horizon}
                        onClick={() => setPredHorizon(horizon)}
                        className={`py-1 font-bold rounded-lg cursor-pointer transition ${
                          predHorizon === horizon ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-350"
                        }`}
                      >
                        {horizon === "session" ? "Session" : horizon}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4 font-mono text-[9.5px]">
                    {/* stacked probability bar */}
                    <div className="space-y-1.5 bg-slate-950/65 p-3.5 border border-slate-850 rounded-xl">
                      <span className="text-[7.5px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Horizon Forecast Probability</span>
                      
                      <div className="flex h-2.5 rounded bg-slate-950 overflow-hidden">
                        <div style={{ width: `${predictionEngineData.bull}%` }} className="bg-emerald-500 h-full transition-all duration-300" title={`Bullish: ${predictionEngineData.bull}%`} />
                        <div style={{ width: `${predictionEngineData.side}%` }} className="bg-slate-700 h-full transition-all duration-300" title={`Sideways: ${predictionEngineData.side}%`} />
                        <div style={{ width: `${predictionEngineData.bear}%` }} className="bg-rose-500 h-full transition-all duration-300" title={`Bearish: ${predictionEngineData.bear}%`} />
                      </div>
                      
                      <div className="grid grid-cols-3 text-center text-[7px] mt-1.5 font-bold border-t border-slate-900/60 pt-1.5">
                        <div className="text-emerald-450">
                          <span className="block text-slate-500 text-[6px] uppercase font-bold">Bullish</span>
                          <span className="text-[9px] font-black">{predictionEngineData.bull}%</span>
                        </div>
                        <div className="text-slate-400">
                          <span className="block text-slate-500 text-[6px] uppercase font-bold">Sideways</span>
                          <span className="text-[9px] font-black">{predictionEngineData.side}%</span>
                        </div>
                        <div className="text-rose-455">
                          <span className="block text-slate-500 text-[6px] uppercase font-bold">Bearish</span>
                          <span className="text-[9px] font-black">{predictionEngineData.bear}%</span>
                        </div>
                      </div>
                    </div>

                    {/* High Frequency Signals summary */}
                    <div className="bg-slate-950/30 p-3.5 border border-slate-850 rounded-xl space-y-2 text-left">
                      <span className="text-[7.5px] text-indigo-400 uppercase tracking-widest font-bold block mb-0.5">Signal Convergence Analytics</span>
                      
                      <div className="flex justify-between border-b border-slate-900/60 pb-1.5 text-[9px]">
                        <span className="text-slate-500">RSI Trend:</span>
                        <span className={`font-bold ${(computedIndicators.rsi[activeCandles.length - 1] || 50) > 50 ? "text-emerald-400" : "text-rose-455"}`}>
                          {(() => {
                            const rsi = computedIndicators.rsi[activeCandles.length - 1] || 50;
                            return rsi > 50 ? `Bullish (RSI: ${rsi.toFixed(0)})` : `Bearish (RSI: ${rsi.toFixed(0)})`;
                          })()}
                        </span>
                      </div>

                      <div className="flex justify-between border-b border-slate-900/60 pb-1.5 text-[9px]">
                        <span className="text-slate-500">VWAP Alignment:</span>
                        <span className={`font-bold ${(watchlistPrices[chartPrefs.selectedSymbol] || 22000) > (computedIndicators.vwap[activeCandles.length - 1] || 22000) ? "text-emerald-400" : "text-rose-450"}`}>
                          {(() => {
                            const spot = watchlistPrices[chartPrefs.selectedSymbol] || 22000;
                            const vwap = computedIndicators.vwap[activeCandles.length - 1] || 22000;
                            return spot > vwap ? "Above VWAP" : "Below VWAP";
                          })()}
                        </span>
                      </div>

                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500">OI Sentiment:</span>
                        <span className={`font-bold ${pcrAnalytics.oiPcr > 1.05 ? "text-emerald-400" : pcrAnalytics.oiPcr < 0.95 ? "text-rose-450" : "text-slate-400"}`}>
                          {pcrAnalytics.oiPcr > 1.05 ? "Bullish Accum" : pcrAnalytics.oiPcr < 0.95 ? "Bearish Distrib" : "Balanced Range"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Watchlist / Submission Terminal */}
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">Market Watchlist</span>
                
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search watchlist..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 text-[10px] rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-2 max-h-[170px] overflow-y-auto">
                  {filteredWatchlist.map(item => {
                    const price = watchlistPrices[item.symbol] || item.basePrice;
                    const change = watchlistChanges[item.symbol] || { change: 0, pct: 0 };
                    const active = item.isOption
                      ? (chartPrefs.selectedSymbol === item.underlyingSymbol &&
                         instrumentClass === "OPTIONS" &&
                         selectedStrike === item.strikePrice &&
                         optionType === item.optionType &&
                         selectedExpiry === item.expiryDate)
                      : (chartPrefs.selectedSymbol === item.symbol && instrumentClass !== "OPTIONS");
                    const isCoreIndex = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCAP", "VIX"].includes(item.symbol);

                    return (
                      <div
                        key={item.symbol}
                        onClick={() => handleWatchlistClick(item)}
                        className={`flex justify-between items-center p-2 rounded-xl border cursor-pointer select-none transition group ${
                          active ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-slate-950 border-transparent hover:border-slate-800"
                        }`}
                      >
                        <div className="text-left font-mono">
                          {item.isOption ? (
                            <div>
                              <div className="flex items-center gap-1.5 leading-tight">
                                <span className="text-[9.5px] font-bold text-white">{item.underlyingSymbol}</span>
                                <span className={`text-[8px] font-extrabold px-1 rounded ${item.optionType === "CE" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                                  {item.optionType}
                                </span>
                                <span className="text-[9px] font-bold text-slate-300">{item.strikePrice}</span>
                              </div>
                              <span className="text-[7.5px] text-slate-500 block mt-0.5 leading-none">{getFmtDate(item.expiryDate || "")}</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-[9.5px] font-bold text-white block leading-tight">{item.symbol}</span>
                              <span className="text-[7.5px] text-slate-500">{item.market}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-right">
                          <div>
                            <span className="text-[9.5px] font-bold block leading-tight">₹{price.toFixed(price % 1 === 0 ? 0 : 2)}</span>
                            <span className={`text-[7.5px] font-bold ${change.change >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {change.change >= 0 ? "+" : ""}{change.pct}%
                            </span>
                          </div>
                          {!isCoreIndex && (
                            <button
                              onClick={(e) => handleRemoveFromWatchlist(item.symbol, e)}
                              className="p-1 rounded bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove from Watchlist"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ───── TAB CONTENT 2: OPTIONS TERMINAL ───── */}
      {activeSubTab === "options" && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* 1. TradingView-Style SVG Charting Engine */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 xl:col-span-3">
              
              {/* Header Chart preference switches */}
              <div className="flex justify-between items-center gap-3.5 flex-wrap border-b border-slate-850 pb-4">
                <div className="text-left font-mono">
                  <span className="text-xs font-bold text-white uppercase tracking-tight bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1.5 rounded-xl inline-block mr-2">
                    {chartPrefs.selectedSymbol} {selectedExpiry.substring(5)} {selectedStrike} {optionType}
                  </span>
                  <span className="text-xs font-bold text-indigo-400">
                    Option Premium: ₹{currentOptionPremium.toFixed(2)}
                  </span>
                </div>

                {/* TV chart timeframe choices */}
                <div className="flex p-0.5 bg-slate-950/70 border border-slate-850 rounded-xl">
                  {(["1m", "3m", "5m", "15m", "30m", "1H", "1D"] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setChartPrefs({ ...chartPrefs, timeframe: tf })}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition cursor-pointer ${
                        chartPrefs.timeframe === tf ? "bg-slate-800 text-white shadow-inner" : "text-slate-500 hover:text-slate-350"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Indicators selector toggles */}
              <div className="flex flex-wrap items-center gap-2.5 text-[9px] font-mono border-b border-slate-850 pb-3">
                <span className="text-slate-500 font-bold uppercase mr-1">Indicators:</span>
                {[
                  { key: "ema9", label: `EMA (${ema1Period})` },
                  { key: "ema21", label: `EMA (${ema2Period})` },
                  { key: "vwap", label: "VWAP" },
                  { key: "cpr", label: "CPR" },
                  { key: "pivotsClassic", label: "Pivots (Classic)" },
                  { key: "pivotsCamarilla", label: "Pivots (Camarilla)" },
                  { key: "bb", label: "Bollinger Bands" },
                  { key: "supertrend", label: "Supertrend" }
                ].map(ind => {
                  const active = chartPrefs.indicators[ind.key as keyof typeof chartPrefs.indicators];
                  return (
                    <button
                      key={ind.key}
                      onClick={() => setChartPrefs({
                        ...chartPrefs,
                        indicators: {
                          ...chartPrefs.indicators,
                          [ind.key]: !active
                        }
                      })}
                      className={`px-2 py-0.5 border rounded-lg transition cursor-pointer font-bold ${
                        active 
                          ? "bg-indigo-500/10 border-indigo-500/35 text-indigo-400" 
                          : "bg-slate-950/40 border-slate-850 text-slate-500 hover:border-slate-800 hover:text-slate-400"
                      }`}
                    >
                      {ind.label}
                    </button>
                  );
                })}

                {/* Adjust periods for EMA */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-850 ml-auto">
                  <span className="text-[7.5px] text-slate-550 font-bold uppercase font-mono">EMA1:</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={ema1Period}
                    onChange={(e) => setEma1Period(Math.max(1, Number(e.target.value)))}
                    className="w-8 bg-slate-900 border border-slate-800 text-white rounded text-center text-[9px] font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[7.5px] text-slate-550 font-bold uppercase font-mono ml-1">EMA2:</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={ema2Period}
                    onChange={(e) => setEma2Period(Math.max(1, Number(e.target.value)))}
                    className="w-8 bg-slate-900 border border-slate-800 text-white rounded text-center text-[9px] font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Adjust CPR Colors if CPR is active */}
                {chartPrefs.indicators.cpr && (
                  <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded border border-slate-850">
                    <label className="flex items-center gap-1 text-[7.5px] text-slate-500 uppercase font-bold cursor-pointer font-mono">
                      TC:
                      <input 
                        type="color" 
                        value={cprColors.tc} 
                        onChange={(e) => setCprColors({ ...cprColors, tc: e.target.value })} 
                        className="w-3.5 h-3.5 border-0 p-0 bg-transparent cursor-pointer rounded"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[7.5px] text-slate-550 uppercase font-bold cursor-pointer font-mono">
                      PVT:
                      <input 
                        type="color" 
                        value={cprColors.pivot} 
                        onChange={(e) => setCprColors({ ...cprColors, pivot: e.target.value })} 
                        className="w-3.5 h-3.5 border-0 p-0 bg-transparent cursor-pointer rounded"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[7.5px] text-slate-550 uppercase font-bold cursor-pointer font-mono">
                      BC:
                      <input 
                        type="color" 
                        value={cprColors.bc} 
                        onChange={(e) => setCprColors({ ...cprColors, bc: e.target.value })} 
                        className="w-3.5 h-3.5 border-0 p-0 bg-transparent cursor-pointer rounded"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Unified TV-Style SVG stack Wrapper */}
              <div className="flex flex-col gap-2.5 bg-slate-950 p-4 border border-slate-900 rounded-2xl relative select-none">
                
                {/* 1. Main TV Candlestick Area */}
                <div className="relative w-full h-[600px]">
                  
                  {/* Top-left Indicator legend overlays */}
                  <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-slate-500 space-x-3 bg-slate-950/80 p-1.5 rounded-lg border border-slate-800 backdrop-blur-sm shadow-xl flex items-center gap-2 flex-wrap">
                    {chartPrefs.indicators.ema9 && (
                      <span>EMA ({ema1Period}): <span className="text-blue-400">₹{computedIndicators.ema1[activeCandles.length - 1]?.toFixed(2) || "--"}</span></span>
                    )}
                    {chartPrefs.indicators.ema21 && (
                      <span>EMA ({ema2Period}): <span className="text-purple-400">₹{computedIndicators.ema2[activeCandles.length - 1]?.toFixed(2) || "--"}</span></span>
                    )}
                    {chartPrefs.indicators.vwap && (
                      <span>VWAP: <span className="text-orange-500">₹{computedIndicators.vwap[activeCandles.length - 1]?.toFixed(2) || "--"}</span></span>
                    )}
                  </div>

                  <TradingViewChart 
                    data={activeCandles.map(c => ({
                      time: new Date(c.time).getTime() / 1000,
                      open: c.open,
                      high: c.high,
                      low: c.low,
                      close: c.close
                    }))}
                    vwapData={chartPrefs.indicators.vwap ? activeCandles.map((c, i) => ({
                      time: new Date(c.time).getTime() / 1000,
                      value: computedIndicators.vwap[i] || c.close
                    })) : []}
                    ema1Data={chartPrefs.indicators.ema9 ? activeCandles.map((c, i) => ({
                      time: new Date(c.time).getTime() / 1000,
                      value: computedIndicators.ema1[i] || c.close
                    })) : []}
                    ema2Data={chartPrefs.indicators.ema21 ? activeCandles.map((c, i) => ({
                      time: new Date(c.time).getTime() / 1000,
                      value: computedIndicators.ema2[i] || c.close
                    })) : []}
                    ema1Label={`EMA(${ema1Period})`}
                    ema2Label={`EMA(${ema2Period})`}
                    pivotsClassic={pivotClassicLevels}
                    pivotsCamarilla={pivotCamarillaLevels}
                    pivotsCpr={pivotCprLevels}
                    showPivotsClassic={chartPrefs.indicators.pivotsClassic}
                    showPivotsCamarilla={chartPrefs.indicators.pivotsCamarilla}
                    showPivotsCpr={chartPrefs.indicators.cpr}
                    cprColors={cprColors}
                    symbol={chartPrefs.selectedSymbol}
                    theme="dark"
                    activePositions={chartActivePositions}
                  />
                </div>

              </div>
            </div>

          {/* Scalping Panel, Smart Flow, Assistant (Col 4) */}
          <div className="space-y-6">
            
            {/* 1. Scalping Greeks Panel */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Options Scalping Terminal
                </h3>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">Quick Greek metrics & ATM/ITM/OTM scalper execution</p>
              </div>

              {/* Option Class Selection */}
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 border border-slate-850 rounded-xl font-mono text-[9px]">
                {(["CE", "PE"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setOptionType(type)}
                    className={`py-1.5 font-bold rounded-lg cursor-pointer ${
                      optionType === type ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-350"
                    }`}
                  >
                    {type === "CE" ? "Call (CE)" : "Put (PE)"}
                  </button>
                ))}
              </div>

              {/* Option Greeks Grid */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-3.5 border border-slate-955 rounded-xl font-mono text-[9.5px]">
                <div>
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Delta (Δ)</span>
                  <span className={`font-bold ${optionGreeks.delta >= 0 ? "text-emerald-400" : "text-rose-455"}`}>{optionGreeks.delta}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Theta (θ)</span>
                  <span className="text-rose-500 font-bold">₹{optionGreeks.theta} <span className="text-[7.5px] text-slate-500">/day</span></span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Gamma (Γ)</span>
                  <span className="text-amber-400 font-bold">{optionGreeks.gamma}</span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Vega (ν)</span>
                  <span className="text-cyan-400 font-bold">{optionGreeks.vega}</span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">Implied Volatility (IV)</span>
                  <span className="text-indigo-400 font-bold">{optionGreeks.iv}%</span>
                </div>
                <div className="mt-2">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider">IV Rank (IVR)</span>
                  <span className="text-indigo-400 font-bold">{optionGreeks.ivRank}%</span>
                </div>
              </div>

              {/* Scalping Strike Selectors */}
              <div className="space-y-2 font-mono text-[9.5px] text-left">
                <span className="text-slate-500 block text-[8px] uppercase font-bold tracking-wider">Quick Strike Selector</span>
                
                {(() => {
                  const spot = watchlistPrices[chartPrefs.selectedSymbol] || 22000;
                  const step = getStrikeStep(chartPrefs.selectedSymbol);
                  const center = Math.round(spot / step) * step;

                  const atm = center;
                  const itm = optionType === "CE" ? center - step : center + step;
                  const otm = optionType === "CE" ? center + step : center - step;

                  return (
                    <div className="space-y-1.5">
                      {[
                        { label: "ITM Strike", val: itm, style: "border-emerald-500/20 text-emerald-450 bg-emerald-500/5" },
                        { label: "ATM Strike", val: atm, style: "border-indigo-500/20 text-indigo-300 bg-indigo-500/5" },
                        { label: "OTM Strike", val: otm, style: "border-rose-500/20 text-rose-455 bg-rose-500/5" }
                      ].map(str => (
                        <div
                          key={str.label}
                          onClick={() => setSelectedStrike(str.val)}
                          className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer select-none transition hover:border-slate-600 ${
                            selectedStrike === str.val ? "border-indigo-500 bg-indigo-950/20" : "border-slate-850"
                          }`}
                        >
                          <span className="text-slate-400 font-bold">{str.label}</span>
                          <span className={`px-2 py-0.5 rounded font-black text-[9px] ${str.style}`}>₹{str.val.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Scalper Quick Lots submission */}
              <div className="space-y-2 border-t border-slate-850 pt-3">
                <div className="flex justify-between items-center text-[9px] font-mono">
                  <span className="text-slate-500 font-bold uppercase">Scalper Lots:</span>
                  <input
                    type="number"
                    value={lots}
                    onChange={(e) => setLots(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-slate-950 border border-slate-850 text-white rounded text-center py-1 text-[10px] font-bold"
                  />
                </div>
                <div className="text-[7.5px] text-slate-500 text-right font-mono mt-0.5">
                  Total Execution Qty: {lots * getLotSize(chartPrefs.selectedSymbol)} units
                </div>

                {/* Advanced Order Options Checklist */}
                <div className="space-y-2 border-t border-slate-850/50 pt-3 text-[9px] font-mono text-left">
                  <span className="text-slate-500 font-bold uppercase block mb-1">Execution Config:</span>
                  
                  {/* Limit Order Option */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={useLimit}
                        onChange={(e) => setUseLimit(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0 w-3 h-3 cursor-pointer"
                      />
                      <span>USE LIMIT ORDER</span>
                    </label>
                    {useLimit && (
                      <div className="flex items-center justify-between pl-5">
                        <span className="text-slate-500">Limit Price (₹):</span>
                        <input
                          type="number"
                          step="0.05"
                          value={limitPrice}
                          onChange={(e) => setLimitPrice(Number(e.target.value))}
                          className="w-20 bg-slate-950 border border-slate-850 text-white rounded text-right px-1.5 py-0.5 text-[9px] font-bold font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* SL / Target Option */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={useStopLossTarget}
                        onChange={(e) => setUseStopLossTarget(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0 w-3 h-3 cursor-pointer"
                      />
                      <span>SL / TARGET BRACKET</span>
                    </label>
                    {useStopLossTarget && (
                      <div className="space-y-1 pl-5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Stop Loss (₹):</span>
                          <input
                            type="number"
                            step="0.05"
                            value={stopLossPrice}
                            onChange={(e) => setStopLossPrice(Number(e.target.value))}
                            className="w-20 bg-slate-950 border border-slate-850 text-rose-400 rounded text-right px-1.5 py-0.5 text-[9px] font-bold font-mono"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Target Price (₹):</span>
                          <input
                            type="number"
                            step="0.05"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Number(e.target.value))}
                            className="w-20 bg-slate-950 border border-slate-850 text-emerald-450 rounded text-right px-1.5 py-0.5 text-[9px] font-bold font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trailing SL Option */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={useTrailingStop}
                        onChange={(e) => setUseTrailingStop(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0 w-3 h-3 cursor-pointer"
                      />
                      <span>TRAILING STOP LOSS</span>
                    </label>
                    {useTrailingStop && (
                      <div className="flex items-center justify-between pl-5">
                        <span className="text-slate-500">Trail Distance (₹):</span>
                        <input
                          type="number"
                          step="0.5"
                          value={trailingDistance}
                          onChange={(e) => setTrailingDistance(Math.max(0.1, Number(e.target.value)))}
                          className="w-20 bg-slate-950 border border-slate-850 text-white rounded text-right px-1.5 py-0.5 text-[9px] font-bold font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {marketStatus !== "Open" && (
                  <div className="bg-rose-950/40 border border-rose-900/50 px-3 py-2.5 rounded-xl text-center text-rose-400 text-[9px] font-mono font-bold uppercase tracking-wider mt-2.5">
                    Market Closed - Execution Disabled
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2.5">
                  <button
                    disabled={marketStatus !== "Open"}
                    onClick={() => { setInstrumentClass("OPTIONS"); handlePlaceOrder("BUY"); }}
                    className={`py-2.5 border font-extrabold text-[10px] rounded-xl active:scale-95 transition-all duration-200 cursor-pointer font-mono ${
                      marketStatus === "Open"
                        ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)] hover:shadow-[0_0_20px_rgba(16,185,129,0.55)]"
                        : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50 shadow-none"
                    }`}
                  >
                    BUY / SCALP LONG
                  </button>
                  <button
                    disabled={marketStatus !== "Open"}
                    onClick={() => { setInstrumentClass("OPTIONS"); handlePlaceOrder("SELL"); }}
                    className={`py-2.5 border font-extrabold text-[10px] rounded-xl active:scale-95 transition-all duration-200 cursor-pointer font-mono ${
                      marketStatus === "Open"
                        ? "bg-rose-500 hover:bg-rose-400 text-slate-950 border-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:shadow-[0_0_20px_rgba(244,63,94,0.55)]"
                        : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50 shadow-none"
                    }`}
                  >
                    SELL / SCALP SHORT
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Smart Money Flow & PCR */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" />
                    OI Smart Money Flow
                  </h3>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">Resistance and writing parameters computed dynamically</p>
                </div>
                {globalIndices && optionChain.length > 0 && (
                  <button
                    onClick={() => setShowOiDetailModal(true)}
                    className="text-[8px] font-mono font-bold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 bg-slate-950 px-2 py-1 border border-slate-850 hover:border-slate-700 rounded cursor-pointer"
                  >
                    <Maximize2 className="w-2.5 h-2.5" />
                    EXPAND
                  </button>
                )}
              </div>

              {(!globalIndices || optionChain.length === 0) ? (
                <div className="py-6 text-center text-slate-500 text-[10px] font-mono border border-dashed border-slate-800 rounded-xl">
                  Live OI data unavailable
                </div>
              ) : (
                <div className="space-y-3 font-mono text-[9px]">
                  <div className="flex justify-between items-center border-b border-slate-950 pb-2">
                    <span className="text-slate-500">OI Put Call Ratio (PCR)</span>
                    <span className="text-white font-bold">{pcrAnalytics.oiPcr}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-950 pb-2">
                    <span className="text-slate-500">Volume PCR</span>
                    <span className="text-white font-bold">{pcrAnalytics.volPcr}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-950 pb-2">
                    <span className="text-slate-500">Major Support Zone (Put writing)</span>
                    <span className="text-emerald-450 font-bold">₹{highestPeOIStrike.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-950 pb-2">
                    <span className="text-slate-500">Major Resistance Zone (Call writing)</span>
                    <span className="text-rose-455 font-bold">₹{highestCeOIStrike.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-950 pb-2">
                    <span className="text-slate-500">Dynamic Option Max Pain</span>
                    <span className="text-amber-500 font-bold">₹{maxPain.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Trend Momentum</span>
                    <span className={`px-1.5 py-0.5 rounded font-black text-[7.5px] uppercase ${
                      pcrAnalytics.strength.includes("Bullish") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" :
                      pcrAnalytics.strength.includes("Bearish") ? "bg-rose-500/10 text-rose-450 border border-rose-500/25" :
                      "bg-slate-950 text-slate-500 border border-slate-800"
                    }`}>
                      {pcrAnalytics.strength}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Live Trade Assistant Signals */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3.5">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Live Option Trade Assistant
                </h3>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                  tradeAssistant.signal === "WAITING" ? "bg-slate-800 text-slate-400 border border-slate-700" :
                  tradeAssistant.signal === "BULLISH" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" :
                  tradeAssistant.signal === "BEARISH" ? "bg-rose-500/10 text-rose-450 border border-rose-500/25" :
                  "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                }`}>
                  {tradeAssistant.signal}
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-400 text-[8.5px] italic leading-relaxed">
                "{tradeAssistant.rationale}"
              </div>
            </div>

            {/* 4. Developer Diagnostics Panel */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  Developer Diagnostics
                </h3>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={devMode}
                    onChange={(e) => setDevMode(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">Dev Mode</span>
                </label>
              </div>

              {devMode ? (
                <div className="bg-slate-950 p-4 border border-slate-900 rounded-xl space-y-2.5 font-mono text-[9px] text-left">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <span className="text-slate-500 uppercase tracking-widest font-bold text-[8px]">Feed Source:</span>
                    <span className="text-indigo-400 font-bold text-[8.5px]">Yahoo Finance + Drift Engine</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <span className="text-slate-500 uppercase tracking-widest font-bold text-[8px]">Last Tick Time:</span>
                    <span className="text-white font-bold">{new Date(lastTickTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <span className="text-slate-500 uppercase tracking-widest font-bold text-[8px]">Symbol Token:</span>
                    <span className="text-emerald-400 font-bold">
                      {chartPrefs.selectedSymbol === "NIFTY" ? "NSE:NIFTY50 (256265)" :
                       chartPrefs.selectedSymbol === "BANKNIFTY" ? "NSE:NIFTYBANK (260105)" :
                       chartPrefs.selectedSymbol === "FINNIFTY" ? "NSE:FINNIFTY (257012)" :
                       chartPrefs.selectedSymbol === "MIDCAP" ? "NSE:MIDCPNIFTY (258017)" :
                       chartPrefs.selectedSymbol === "VIX" ? "NSE:INDIAVIX (264907)" :
                       `NSE:${chartPrefs.selectedSymbol} (384729)`}
                    </span>
                  </div>
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-slate-500 uppercase tracking-widest font-bold text-[8px] shrink-0">Strike Token:</span>
                    <span className="text-amber-400 font-bold break-all text-right select-all">
                      {(() => {
                        if (!selectedExpiry) return "N/A";
                        const parts = selectedExpiry.split("-");
                        if (parts.length !== 3) return "N/A";
                        const yy = parts[0].substring(2);
                        const mm = parts[1];
                        const dd = parts[2];
                        return `OPT-${chartPrefs.selectedSymbol}-${selectedStrike}-${optionType}-${yy}${mm}${dd}`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[8.5px] text-slate-550 italic leading-normal text-center">
                  Enable "Dev Mode" to inspect real-time websocket/drift logs, feed source tokens, and strike contract parameters.
                </p>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ───── TAB CONTENT 3: PERFORMANCE ANALYTICS & LOGS ───── */}
      {activeSubTab === "analytics" && (
        <div className="space-y-6">
          
          {/* Performance stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Weekly Net P&L</span>
              <span className={`text-[13px] font-black block mt-2 ${performanceAnalytics.weeklyPnl >= 0 ? "text-emerald-400" : "text-rose-455"}`}>
                {performanceAnalytics.weeklyPnl >= 0 ? "+" : ""}₹{performanceAnalytics.weeklyPnl.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Monthly Net P&L</span>
              <span className={`text-[13px] font-black block mt-2 ${performanceAnalytics.monthlyPnl >= 0 ? "text-emerald-400" : "text-rose-455"}`}>
                {performanceAnalytics.monthlyPnl >= 0 ? "+" : ""}₹{performanceAnalytics.monthlyPnl.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Win Rate</span>
              <span className="text-[13px] font-black text-white block mt-2">{analytics.winRate}%</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Average RR Ratio</span>
              <span className="text-[13px] font-black text-white block mt-2">{analytics.rr}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Max Drawdown</span>
              <span className="text-[13px] font-black text-rose-450 block mt-2">{maxDrawdown}%</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono text-left">
              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-widest block">Total Closed Logs</span>
              <span className="text-[13px] font-black text-indigo-400 block mt-2">{closedTrades.length}</span>
            </div>
          </div>

          {/* Performance metrics breakdowns & Heatmap grid */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* Breakdowns columns */}
            <div className="xl:col-span-1 space-y-6">
              
              {/* Asset-wise P&L breakdown */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">Ticker-wise Closed P&L</span>
                
                <div className="space-y-2 font-mono text-[9px]">
                  {["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCAP"].map(sym => {
                    const pnlVal = tickerPnl[sym] || 0;
                    return (
                      <div key={sym} className="flex justify-between items-center border-b border-slate-950 pb-2">
                        <span className="text-slate-400 font-bold">{sym}</span>
                        <span className={`font-bold ${pnlVal >= 0 ? "text-emerald-400" : "text-rose-450"}`}>
                          {pnlVal >= 0 ? "+" : ""}₹{pnlVal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Expiry contract wise P&L */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">Expiry-wise Options P&L</span>
                
                <div className="space-y-2 font-mono text-[9px] max-h-[140px] overflow-y-auto pr-1">
                  {Object.keys(expiryPnl).length === 0 ? (
                    <div className="text-slate-600 text-[8.5px] italic">No closed options trades recorded.</div>
                  ) : (
                    Object.entries(expiryPnl).map(([expDate, pnlVal]) => (
                      <div key={expDate} className="flex justify-between items-center border-b border-slate-950 pb-2">
                        <span className="text-slate-400">{getFmtDate(expDate)} Expiry</span>
                        <span className={`font-bold ${pnlVal >= 0 ? "text-emerald-400" : "text-rose-455"}`}>
                          {pnlVal >= 0 ? "+" : ""}₹{pnlVal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Performance Heatmap calendar & Closed Logs (Col 2-4) */}
            <div className="xl:col-span-3 space-y-6">
              
              {/* GitHub contribution style calendar grid */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                      Trading Heatmap Calendar
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">P&L color scale driven by actual closed trade outcomes</p>
                  </div>

                  <select
                    value={heatmapFilter}
                    onChange={(e) => setHeatmapFilter(e.target.value as any)}
                    className="bg-slate-950 border border-slate-855 text-[9px] text-slate-400 px-2 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500 font-mono cursor-pointer animate-fade-in"
                  >
                    <option value="current_month">Current Month</option>
                    <option value="3_months">Last 3 Months</option>
                    <option value="6_months">Last 6 Months</option>
                    <option value="current_year">Current Year</option>
                  </select>
                </div>

                <div className="bg-slate-955 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1 items-center justify-start min-h-[90px]">
                    {heatmapData.map((day, idx) => {
                      const hasTrades = day.trades > 0;
                      const isProfitable = day.pnl > 0;
                      
                      let bgClass = "bg-slate-900 border border-slate-950";
                      let glowStyle = {};

                      if (hasTrades) {
                        if (isProfitable) {
                          if (day.pnl > 10000) {
                            bgClass = "bg-emerald-700 border-emerald-600";
                            glowStyle = { boxShadow: "0 0 4px rgba(16, 185, 129, 0.4)" };
                          } else {
                            bgClass = "bg-emerald-500 border-emerald-500/30";
                          }
                        } else {
                          const loss = Math.abs(day.pnl);
                          if (loss > 10000) {
                            bgClass = "bg-rose-700 border-rose-600";
                            glowStyle = { boxShadow: "0 0 4px rgba(239, 68, 68, 0.4)" };
                          } else {
                            bgClass = "bg-rose-500 border-rose-500/30";
                          }
                        }
                      }

                      return (
                        <div
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-sm transition cursor-pointer relative group ${bgClass}`}
                          style={glowStyle}
                        >
                          {/* Hover Tooltip */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 w-36 bg-slate-900 border border-slate-855 p-2.5 rounded-lg text-[9px] font-mono text-slate-350 shadow-2xl space-y-1">
                            <p className="font-bold text-white border-b border-slate-800 pb-1 mb-1">{getFmtDate(day.date)}</p>
                            <p className="flex justify-between">P&L: <span className={day.pnl >= 0 ? "text-emerald-450 font-bold" : "text-rose-455 font-bold"}>₹{day.pnl}</span></p>
                            <p className="flex justify-between">Trades: <span>{day.trades}</span></p>
                            <p className="flex justify-between">Win Rate: <span>{day.winRate}%</span></p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-1.5 items-center text-[8px] font-mono text-slate-500 pt-1 border-t border-slate-900/60">
                    <span>Large Loss</span>
                    <div className="w-2.5 h-2.5 bg-rose-700 rounded-sm" />
                    <div className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
                    <div className="w-2.5 h-2.5 bg-slate-900 rounded-sm" />
                    <div className="w-2.5 h-2.5 bg-emerald-500/60 rounded-sm" />
                    <div className="w-2.5 h-2.5 bg-emerald-700 rounded-sm" />
                    <span>Large Gain</span>
                  </div>
                </div>
              </div>

              {/* Daily P&L and Cumulative Equity Curve Analytics Card */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                    Daily P&L & Equity Growth Curve
                  </h3>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">Realized daily performance and cumulative balance trajectory</p>
                </div>

                <div className="h-[280px] w-full font-mono text-[9px] bg-slate-950 p-4 border border-slate-900 rounded-xl relative select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={pnlChartData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                      <XAxis 
                        dataKey="displayDate" 
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={8.5} 
                        tickLine={false}
                      />
                      {/* Left YAxis: for Daily P&L bars */}
                      <YAxis 
                        yAxisId="left"
                        stroke="rgba(255,255,255,0.3)" 
                        fontSize={8.5}
                        tickLine={false}
                        tickFormatter={(v) => `₹${v.toLocaleString()}`}
                      />
                      {/* Right YAxis: for Equity curve line */}
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#6366f1" 
                        fontSize={8.5}
                        tickLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `₹${v.toLocaleString()}`}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-855 p-3 rounded-lg text-[9px] font-mono text-slate-355 shadow-2xl space-y-1">
                                <p className="font-bold text-white border-b border-slate-800 pb-1 mb-1">{d.date}</p>
                                <p className="flex justify-between gap-4">Daily P&L: <span className={d.pnl >= 0 ? "text-emerald-450 font-bold" : "text-rose-455 font-bold"}>₹{d.pnl.toLocaleString()}</span></p>
                                <p className="flex justify-between gap-4">Account Balance: <span className="text-indigo-400 font-bold">₹{d.equity.toLocaleString()}</span></p>
                                <p className="flex justify-between gap-4">Trades Executed: <span className="text-slate-200 font-bold">{d.tradesCount}</span></p>
                                <p className="flex justify-between gap-4">Win/Loss split: <span className="text-slate-200 font-bold">{d.wins}W / {d.losses}L</span></p>
                                <p className="flex justify-between gap-4">Daily Win Rate: <span className="text-slate-200 font-bold">{d.winRate}%</span></p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} />
                      <Bar 
                        yAxisId="left"
                        dataKey="pnl" 
                        radius={[3, 3, 0, 0]}
                      >
                        {pnlChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} 
                            fillOpacity={0.7}
                          />
                        ))}
                      </Bar>
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="equity" 
                        stroke="#6366f1" 
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: "#818cf8", strokeWidth: 1 }}
                        activeDot={{ r: 4.5, strokeWidth: 0 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trade Logs Journal Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center gap-3.5 flex-wrap">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Closed Trade Logs Journal
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">Logs of all finalized paper trades</p>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-955 border border-slate-850 hover:border-slate-705 text-slate-350 text-[10px] font-bold rounded-xl transition cursor-pointer font-mono"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-455" />
                    Export CSV
                  </button>
                </div>

                {closedTrades.length === 0 ? (
                  <div className="bg-slate-955/45 p-6 rounded-xl border border-slate-950 text-center text-[10px] text-slate-500 font-mono">
                    No archived trade history available. Complete a position execution to write logs.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono min-w-[600px]">
                      <thead>
                        <tr className="text-slate-505 border-b border-slate-800 font-bold uppercase tracking-wider text-center">
                          <th className="text-left pb-2">Date/Time</th>
                          <th className="text-left pb-2">Contract Name</th>
                          <th>Type</th>
                          <th className="text-right">Entry</th>
                          <th className="text-right">Exit</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">PnL</th>
                          <th className="text-right">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedTrades.slice(0, 15).map((tr, idx) => {
                          const profit = (tr.pnl || 0) >= 0;
                          return (
                            <tr key={tr.id || idx} className="border-b border-slate-900/60 hover:bg-slate-950/20 text-center">
                              <td className="py-2.5 text-left text-slate-500">
                                {getFmtDate(tr.createdAt)} {getFmtTime(tr.createdAt)}
                              </td>
                              <td className="py-2.5 text-left font-bold text-white">
                                {tr.instrumentClass === "OPTIONS" 
                                  ? `${tr.symbol} ${tr.expiryDate?.substring(5)} ${tr.strikePrice} ${tr.optionType}`
                                  : tr.symbol}
                              </td>
                              <td>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                  tr.type === "BUY" ? "bg-emerald-500/10 text-emerald-455 border border-emerald-500/20" : "bg-rose-500/10 text-rose-455 border border-rose-500/20"
                                }`}>{tr.type}</span>
                              </td>
                              <td className="text-right text-slate-350">₹{tr.entryPrice.toFixed(2)}</td>
                              <td className="text-right text-slate-350">₹{tr.exitPrice?.toFixed(2) || "0.00"}</td>
                              <td className="text-right text-slate-350">{tr.quantity}</td>
                              <td className={`text-right font-bold ${profit ? "text-emerald-400" : "text-rose-400"}`}>
                                {profit ? "+" : ""}₹{tr.pnl?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-right text-[8px] text-slate-550 italic uppercase">
                                {tr.orderType}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ───── TAB CONTENT 4: ACTIVE POSITIONS ───── */}
      {activeSubTab === "positions" && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* Account Margin/Balance Info */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                Virtual Balance & Margin
              </h3>
              <p className="text-[9px] text-slate-500 font-mono mt-0.5">Calculated accounts limits for simulation</p>
            </div>

            <div className="space-y-3.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 font-mono">Virtual Cash</span>
                <span className="text-sm font-black text-white font-mono">₹{virtualBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 font-mono">Available Margin</span>
                <span className="text-sm font-black text-indigo-455 font-mono">₹{availableMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 font-mono">Used Margin (5x)</span>
                <span className="text-sm font-black text-amber-505 font-mono">₹{marginUsed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center border-t border-slate-850 pt-2 flex-wrap">
                <span className="text-[10px] text-slate-500 font-mono">Realized P&L</span>
                <span className={`text-xs font-black font-mono ${totalRealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalRealizedPnl >= 0 ? "+" : ""}₹{totalRealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 font-mono">Unrealized P&L</span>
                <span className={`text-xs font-black font-mono ${totalUnrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalUnrealizedPnl >= 0 ? "+" : ""}₹{totalUnrealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center border-t border-slate-800/80 pt-3">
                <span className="text-[10px] text-slate-400 font-semibold font-mono">Account Equity</span>
                <span className={`text-sm font-black font-mono ${accountEquity >= 1000000 ? "text-emerald-450" : "text-rose-455"}`}>
                  ₹{accountEquity.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Active lists */}
          <div className="xl:col-span-3 space-y-6">
            
            {/* Open positions display block */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  Open Positions ({openPositions.length})
                </h3>
              </div>
              
              {openPositions.length === 0 ? (
                <div className="bg-slate-955/45 p-6 rounded-xl border border-slate-950 text-center text-[10px] text-slate-500 font-mono">
                  No active open simulator positions. Submit an order in the side panel to begin.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] font-mono text-center">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800 font-bold uppercase tracking-wider">
                        <th className="text-left pb-2">Symbol</th>
                        <th>Strike</th>
                        <th>CE/PE</th>
                        <th className="text-right">Entry</th>
                        <th className="text-right">Current Premium</th>
                        <th className="text-right">MTM</th>
                        <th className="text-right">ROI %</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map(pos => {
                        const currentSpot = watchlistPrices[pos.symbol] || pos.entryPrice;
                        let currentPrice = currentSpot;

                        if (pos.instrumentClass === "OPTIONS") {
                          const expDateStr = pos.expiryDate || expiriesList[0];
                          const diffDays = Math.max(0.1, (new Date(expDateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          const T = diffDays / 365;
                          const vix = watchlistPrices["VIX"] || 16.14;
                          const vol = vix / 100;
                          
                          currentPrice = getLiveOptionPrice(globalIndicesRef, pos.symbol, expDateStr, pos.optionType!, pos.strikePrice!, globalOptionsLtpRef.current) || 0;
                          if (currentPrice === 0) {
                            currentPrice = blackScholes(currentSpot, pos.strikePrice!, T, vol, 0.07, pos.optionType!);
                          }
                        }

                        const pnl = pos.type === "BUY"
                          ? (currentPrice - pos.entryPrice) * pos.quantity
                          : (pos.entryPrice - currentPrice) * pos.quantity;
                        const isProfit = pnl >= 0;
                        const totalCost = pos.entryPrice * pos.quantity;
                        const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

                        return (
                          <tr key={pos.id} className="border-b border-slate-900/60 hover:bg-slate-955/30">
                            <td className="py-2.5 text-left font-bold text-white">
                              {pos.symbol}
                              {pos.instrumentClass === "OPTIONS" && (
                                <span className="text-[7.5px] text-slate-500 block uppercase font-sans">Spot: ₹{currentSpot.toLocaleString()}</span>
                              )}
                            </td>
                            <td className="text-slate-350">{pos.instrumentClass === "OPTIONS" ? `₹${pos.strikePrice}` : "--"}</td>
                            <td>
                              {pos.instrumentClass === "OPTIONS" ? (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                  pos.optionType === "CE" ? "bg-emerald-500/10 text-emerald-455 border border-emerald-500/20" : "bg-purple-500/10 text-purple-455 border border-purple-500/20"
                                }`}>{pos.optionType}</span>
                              ) : "--"}
                            </td>
                            <td className="text-right text-slate-350">₹{pos.entryPrice.toFixed(2)}</td>
                            <td className="text-right font-bold text-white">₹{currentPrice.toFixed(2)}</td>
                            <td className={`text-right font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                              {isProfit ? "+" : ""}₹{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`text-right font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                              {isProfit ? "+" : ""}{roi.toFixed(2)}%
                            </td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleClosePosition(pos.id)}
                                  className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-455 text-[9px] font-bold rounded-lg cursor-pointer transition"
                                  title="Close position immediately at market price"
                                >
                                  Mkt Exit
                                </button>
                                
                                <div className="flex items-center gap-1 bg-slate-950 border border-slate-850 rounded-lg p-0.5">
                                  <input
                                    type="number"
                                    step="0.05"
                                    placeholder="Limit"
                                    value={limitExitInputs[pos.id] || ""}
                                    onChange={(e) => setLimitExitInputs({
                                      ...limitExitInputs,
                                      [pos.id]: e.target.value
                                    })}
                                    className="w-14 bg-transparent border-0 text-white rounded text-center py-0.5 text-[9px] font-bold font-mono focus:outline-none focus:ring-0"
                                  />
                                  <button
                                    onClick={() => {
                                      const val = parseFloat(limitExitInputs[pos.id] || "");
                                      if (!isNaN(val) && val > 0) {
                                        handleSetLimitExit(pos.id, val);
                                        setLimitExitInputs({
                                          ...limitExitInputs,
                                          [pos.id]: ""
                                        });
                                      } else {
                                        alert("Please enter a valid price.");
                                      }
                                    }}
                                    className="px-1.5 py-0.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-extrabold text-[9px] rounded cursor-pointer transition"
                                  >
                                    Set
                                  </button>
                                </div>
                              </div>
                              {(pos.stopLossPrice || pos.targetPrice) && (
                                <div className="text-[7.5px] text-slate-500 mt-1 font-mono space-x-1.5">
                                  {pos.stopLossPrice && (
                                    <span>SL: <span className="text-rose-400 font-bold font-mono">₹{pos.stopLossPrice}</span></span>
                                  )}
                                  {pos.targetPrice && (
                                    <span>Tgt: <span className="text-emerald-400 font-bold font-mono">₹{pos.targetPrice}</span></span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pending Limit Orders */}
            {pendingOrders.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Pending Limit Orders ({pendingOrders.length})
                </h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] font-mono text-center">
                    <thead>
                      <tr className="text-slate-505 border-b border-slate-800 font-bold uppercase">
                        <th className="text-left pb-2">Contract</th>
                        <th>Type</th>
                        <th className="text-right">Limit Premium</th>
                        <th className="text-right">Current Premium</th>
                        <th className="text-right">Quantity</th>
                        <th className="text-right">Target</th>
                        <th className="text-right">Stop Loss</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.map(ord => {
                        const currentSpot = watchlistPrices[ord.symbol] || ord.entryPrice;
                        let currentPrice = currentSpot;

                        if (ord.instrumentClass === "OPTIONS") {
                          const expDate = new Date(ord.expiryDate!);
                          const today = new Date();
                          const diffDays = Math.max(0.1, (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          const T = diffDays / 365;
                          const vix = watchlistPrices["VIX"] || 16.14;
                          const vol = vix / 100;
                          currentPrice = blackScholes(currentSpot, ord.strikePrice!, T, vol, 0.07, ord.optionType!);
                        }

                        return (
                          <tr key={ord.id} className="border-b border-slate-900/60 hover:bg-slate-955/20">
                            <td className="py-2.5 text-left font-bold text-white">
                              {ord.instrumentClass === "OPTIONS" 
                                ? `${ord.symbol} ${ord.expiryDate?.substring(5)} ${ord.strikePrice} ${ord.optionType}`
                                : ord.symbol}
                            </td>
                            <td className="font-bold text-indigo-400">
                              {ord.instrumentClass} {ord.type}
                            </td>
                            <td className="text-right text-indigo-400 font-bold">₹{ord.entryPrice}</td>
                            <td className="text-right text-slate-350">₹{currentPrice.toFixed(2)}</td>
                            <td className="text-right text-slate-350">{ord.quantity}</td>
                            <td className="text-right text-slate-550">{ord.targetPrice ? `₹${ord.targetPrice}` : "--"}</td>
                            <td className="text-right text-slate-550">{ord.stopLossPrice ? `₹${ord.stopLossPrice}` : "--"}</td>
                            <td className="text-right">
                              <button
                                onClick={() => handleCancelPending(ord.id)}
                                className="px-2 py-0.5 bg-slate-950 hover:bg-slate-900 text-slate-400 text-[9px] rounded-lg cursor-pointer border border-slate-800"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ─── Confirmation Overlay Modal ─── */}
      {showOrderConfirm && (
        <div className="fixed inset-0 z-[1000] bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${
                showOrderConfirm.type === "BUY" 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" 
                  : "bg-rose-500/10 border-rose-500/20 text-rose-450"
              }`}>
                <Activity className="w-5 h-5" />
              </div>
              
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Confirm Order Submission</h2>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">Please review execution parameters</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-3 font-mono text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Asset Symbol</span>
                <span className="text-white font-bold">{chartPrefs.selectedSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Instrument Type</span>
                <span className="text-white font-bold">{instrumentClass}</span>
              </div>
              {instrumentClass === "OPTIONS" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contract Detail</span>
                    <span className="text-white font-bold">{selectedStrike} {optionType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lot Expiry</span>
                    <span className="text-white font-bold">{getFmtDate(selectedExpiry)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Action</span>
                <span className={`font-black ${showOrderConfirm.type === "BUY" ? "text-emerald-455" : "text-rose-455"}`}>
                  {showOrderConfirm.type === "BUY" ? "BUY / GO LONG" : "SELL / GO SHORT"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Method</span>
                <span className="text-indigo-400 font-bold">{orderType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Volume</span>
                <span className="text-white font-bold">
                  {instrumentClass === "OPTIONS" ? `${lots} Lots (${lots * getLotSize(chartPrefs.selectedSymbol)} Qty)` : `${quantity} units`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-900 pt-2.5">
                <span className="text-slate-400 font-semibold">Estimated Price</span>
                <span className="text-white font-bold font-mono text-[11px]">
                  ₹{orderType === "LIMIT" ? limitPrice.toFixed(2) : (instrumentClass === "OPTIONS" ? currentOptionPremium.toFixed(2) : (watchlistPrices[chartPrefs.selectedSymbol] || 105).toFixed(2))}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowOrderConfirm(null)}
                className="flex-1 py-2.5 bg-slate-955 hover:bg-slate-900 border border-slate-850 text-slate-400 text-xs font-bold rounded-xl cursor-pointer transition uppercase font-mono"
              >
                Cancel
              </button>
              
              <button
                onClick={() => executeOrderPlacement(showOrderConfirm.type)}
                className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer transition uppercase tracking-wide font-mono ${
                  showOrderConfirm.type === "BUY" 
                    ? "bg-emerald-650 hover:bg-emerald-700 shadow-md shadow-emerald-950/20" 
                    : "bg-rose-650 hover:bg-rose-700 shadow-md shadow-rose-950/20"
                }`}
              >
                Submit Order
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. Real-Time Options OI Analytics & Smart Advisor Modal */}
      {showOiDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-5 relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            
            {/* Close button */}
            <button
              onClick={() => setShowOiDetailModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white rounded-xl bg-slate-950/50 hover:bg-slate-800 border border-slate-850 cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Real-Time OI Analytics</h2>
                <p className="text-[9px] text-slate-500 font-mono mt-0.5">Advanced Smart Money & Options Writing Flow for {chartPrefs.selectedSymbol}</p>
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 font-mono text-[9px]">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block uppercase tracking-wider text-[8px] mb-1">OI PCR</span>
                <span className={`text-xs font-black ${pcrAnalytics.oiPcr >= 1.2 ? "text-emerald-400" : pcrAnalytics.oiPcr <= 0.8 ? "text-rose-400" : "text-indigo-400"}`}>
                  {pcrAnalytics.oiPcr}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block uppercase tracking-wider text-[8px] mb-1">Max Pain</span>
                <span className="text-xs font-black text-amber-500">₹{maxPain.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block uppercase tracking-wider text-[8px] mb-1">Major Support</span>
                <span className="text-xs font-black text-emerald-450">₹{highestPeOIStrike.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-500 block uppercase tracking-wider text-[8px] mb-1">Major Resistance</span>
                <span className="text-xs font-black text-rose-455">₹{highestCeOIStrike.toLocaleString()}</span>
              </div>
            </div>

            {/* Smart Suggestions Box */}
            <div className="bg-indigo-950/20 border border-indigo-900/50 p-4 rounded-xl space-y-2">
              <span className="text-[8px] uppercase tracking-widest text-indigo-400 font-black flex items-center gap-1 font-mono">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                OI Smart Advisor Recommendation
              </span>
              <p className="text-[9.5px] text-slate-305 italic leading-relaxed">
                {(() => {
                  const pcr = pcrAnalytics.oiPcr;
                  const spot = watchlistPrices[chartPrefs.selectedSymbol] || 0;
                  const lastCandleIdx = activeCandles.length - 1;
                  const rsiVal = lastCandleIdx >= 0 ? (computedIndicators.rsi[lastCandleIdx] || 50) : 50;
                  const vwapVal = lastCandleIdx >= 0 ? (computedIndicators.vwap[lastCandleIdx] || spot) : spot;
                  
                  let sentiment = "Neutral";
                  let recommendation = "";
                  
                  if (pcr >= 1.25) {
                    sentiment = "Strongly Bullish (Put Writing Heavy)";
                    recommendation = `Market participants are aggressively writing Puts at ₹${highestPeOIStrike}, forming a strong support floor. With the spot price at ₹${spot.toFixed(2)}, expect pullbacks to be bought. `;
                    if (spot > vwapVal) {
                      recommendation += `Since price is trading above VWAP (₹${vwapVal.toFixed(2)}), bullish momentum is strong. Favored strategy: Buy CE Call Options or Sell PE Put Options near key support.`;
                    } else {
                      recommendation += `However, price is below VWAP, indicating minor intraday weakness. Wait for a recovery above VWAP before entering longs.`;
                    }
                  } else if (pcr <= 0.75) {
                    sentiment = "Strongly Bearish (Call Writing Heavy)";
                    recommendation = `Heavy Call writing at ₹${highestCeOIStrike} is capping upside momentum. Put writers are unwinding positions, signaling weak support. `;
                    if (spot < vwapVal) {
                      recommendation += `Price is trading below VWAP (₹${vwapVal.toFixed(2)}), confirming bearish control. Favored strategy: Buy PE Put Options or Short CE Options on pullbacks to resistance.`;
                    } else {
                      recommendation += `Although sentiment is bearish, price is currently holding above VWAP, suggesting a potential short squeeze. Watch the ₹${highestCeOIStrike} resistance closely.`;
                    }
                  } else {
                    sentiment = "Consolidating / Balanced";
                    recommendation = `The PCR of ${pcr} indicates a balanced struggle. Spot (₹${spot.toFixed(2)}) is range-bound between key support at ₹${highestPeOIStrike} (Heavy Put OI) and major resistance at ₹${highestCeOIStrike} (Heavy Call OI). `;
                    if (rsiVal > 60) {
                      recommendation += `Intraday RSI (${rsiVal.toFixed(1)}) suggests overbought conditions near range extremes. Favored strategy: Short-strangles or selling options at outer boundary strikes to harvest time decay (Theta).`;
                    } else if (rsiVal < 40) {
                      recommendation += `Intraday RSI (${rsiVal.toFixed(1)}) is oversold. Watch for a bounce from support at ₹${highestPeOIStrike}.`;
                    } else {
                      recommendation += `Favored strategy: Range-bound range-trading between ₹${highestPeOIStrike} and ₹${highestCeOIStrike}. Wait for a breakout beyond either level before placing directional bets.`;
                    }
                  }

                  if (maxPain > 0) {
                    const painDiff = spot - maxPain;
                    if (Math.abs(painDiff) > 100) {
                      recommendation += ` Max Pain is at ₹${maxPain}, suggesting index might drift ${painDiff > 0 ? "downwards" : "upwards"} towards the pain center as weekly expiry approaches.`;
                    }
                  }

                  return `${sentiment} - ${recommendation}`;
                })()}
              </p>
            </div>

            {/* Top Strike distribution visual lists */}
            <div className="space-y-2 font-mono text-[9px]">
              <span className="text-slate-500 block uppercase tracking-wider text-[8px] font-bold">Top Strikes by Total Open Interest</span>
              
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {[...optionChain]
                  .sort((a, b) => (b.ceOI + b.peOI) - (a.ceOI + a.peOI))
                  .slice(0, 8)
                  .map(row => {
                    const totalOI = row.ceOI + row.peOI || 1;
                    const cePct = (row.ceOI / totalOI) * 100;
                    const pePct = (row.peOI / totalOI) * 100;
                    const spot = watchlistPrices[chartPrefs.selectedSymbol] || 0;
                    const isATM = Math.abs(spot - row.strike) < getStrikeStep(chartPrefs.selectedSymbol) / 2;

                    return (
                      <div key={row.strike} className="bg-slate-955 p-2.5 rounded-xl border border-slate-850 flex items-center justify-between gap-4">
                        <div className="w-16 text-left">
                          <span className={`font-bold block ${isATM ? "text-indigo-400 font-extrabold" : "text-white"}`}>
                            ₹{row.strike.toLocaleString()}
                          </span>
                          <span className="text-[7.5px] text-slate-500 font-mono">{isATM ? "ATM" : row.strike > spot ? "OTM" : "ITM"}</span>
                        </div>
                        
                        {/* Bar graph representing CE vs PE OI distribution */}
                        <div className="flex-1 flex flex-col gap-1">
                          <div className="flex h-2 rounded bg-slate-900 overflow-hidden">
                            <div style={{ width: `${cePct}%` }} className="bg-emerald-500 h-full animate-pulse-slow" title={`Call OI: ${row.ceOI.toLocaleString()}`} />
                            <div style={{ width: `${pePct}%` }} className="bg-rose-500 h-full animate-pulse-slow" title={`Put OI: ${row.peOI.toLocaleString()}`} />
                          </div>
                          <div className="flex justify-between text-[7px] text-slate-500">
                            <span>CE: {Math.round(cePct)}% ({row.ceOI.toLocaleString()})</span>
                            <span>PE: {Math.round(pePct)}% ({row.peOI.toLocaleString()})</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowOiDetailModal(false)}
                className="py-2 px-5 bg-slate-955 hover:bg-slate-900 border border-slate-850 text-slate-400 text-xs font-bold rounded-xl cursor-pointer transition uppercase font-mono"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
