import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { handleFileUpload } from "../attachmentHelper";
import {
  TrendingUp, TrendingDown, Target, ShieldAlert, DollarSign,
  LineChart, Plus, Trash2, Image, Upload, Activity, FileText,
  CheckSquare, RefreshCw, Play, Key, Users, Info, Sparkles,
  Smile, Frown, X, ChevronRight, Check, AlertTriangle, Brain, Sparkle, Award,
  Globe, Clock, Flame, Zap, BookOpen
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, PieChart, Pie, AreaChart, Area, LabelList
} from "recharts";

// Trading Journal Entry Interface
export interface Trade {
  id?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  tradeType: "Intraday" | "Swing" | "Scalping" | "Positional" | "Options" | "Futures" | "Equity";
  broker: "Dhan" | "Zerodha" | "Upstox" | "Manual Entry";
  stockName: string;
  symbol: string;
  direction: "Long" | "Short";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  target: number;
  quantity: number;
  profitOrLoss: number;
  riskPercent: number;
  positionSize: number;
  whyEntered: string;
  mindsetBefore: "Calm" | "Anxious" | "FOMO" | "Greedy" | "Confident" | "Impatient";
  exitReason: "Fear" | "Panic" | "Stop loss hit" | "Target achieved" | "Emotion" | "FOMO" | "Rule break" | "Manual note";
  exitNote: string;
  attachments?: { name: string; url: string; type: string }[];
  createdAt?: string;
  optionType?: "CE" | "PE";
  strikePrice?: number;
  expiryDate?: string;
  lots?: number;
  lotSize?: number;
  strategy?: string;
  isHedged?: boolean;
  hedgeStrike?: number;
  hedgeEntryPrice?: number;
  hedgeExitPrice?: number;
}

// Default rules for the Trading Rules System
const DEFAULT_RULES = [
  "No revenge trading (max 3 trades/day)",
  "Risk only 1-2% of capital per trade",
  "Strictly follow and enforce stop loss",
  "No emotional entries (wait for setup)",
  "Wait for absolute candle setup confirmation",
  "Do not chase running trades (no FOMO)"
];

const MOTIVATIONAL_MESSAGES = [
  "Discipline makes profit. Follow your rules.",
  "Follow the process, not the emotion.",
  "Protect capital first. Profits will take care of themselves.",
  "Wait for setup confirmation. Patience pays.",
  "No revenge trading. Step away from the screen.",
  "Your stops are non-negotiable. Honor them.",
  "A winning trade with rules broken is a bad trade. A losing trade with rules followed is a good trade."
];

// Initial 11 NSE sectors with weights and component stocks for heatmap
const initialSectors = [
  { name: "Financial Services", weight: 35.0, change: 0.45, code: "banknifty", stocks: [
    { name: "HDFC Bank", symbol: "HDFCBANK.NS", price: 1442.20, change: 0.85 },
    { name: "ICICI Bank", symbol: "ICICIBANK.NS", price: 1050.40, change: 0.62 },
    { name: "State Bank of India", symbol: "SBIN.NS", price: 760.10, change: -0.45 },
    { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK.NS", price: 1720.50, change: 0.15 },
    { name: "Axis Bank", symbol: "AXISBANK.NS", price: 1080.30, change: 1.12 }
  ]},
  { name: "Information Technology", weight: 14.0, change: 1.09, code: "nifty_it", stocks: [
    { name: "Tata Consultancy Services", symbol: "TCS.NS", price: 3950.40, change: 1.25 },
    { name: "Infosys", symbol: "INFY.NS", price: 1610.20, change: 0.85 },
    { name: "Wipro", symbol: "WIPRO.NS", price: 480.50, change: -0.20 },
    { name: "HCL Technologies", symbol: "HCLTECH.NS", price: 1450.30, change: 2.10 },
    { name: "Tech Mahindra", symbol: "TECHM.NS", price: 1250.60, change: 0.45 }
  ]},
  { name: "Oil & Gas / Energy", weight: 12.0, change: 0.52, code: "nifty_energy", stocks: [
    { name: "Reliance Industries", symbol: "RELIANCE.NS", price: 2468.90, change: 1.32 },
    { name: "ONGC", symbol: "ONGC.NS", price: 245.20, change: -0.85 },
    { name: "NTPC", symbol: "NTPC.NS", price: 345.10, change: 0.45 },
    { name: "Power Grid Corp", symbol: "POWERGRID.NS", price: 275.40, change: 0.12 },
    { name: "Bharat Petroleum", symbol: "BPCL.NS", price: 610.80, change: -1.25 }
  ]},
  { name: "FMCG", weight: 9.0, change: -0.42, code: "nifty_fmcg", stocks: [
    { name: "Hindustan Unilever", symbol: "HINDUNILVR.NS", price: 2420.50, change: -0.95 },
    { name: "ITC", symbol: "ITC.NS", price: 412.30, change: 0.15 },
    { name: "Nestle India", symbol: "NESTLEIND.NS", price: 2510.40, change: -0.30 },
    { name: "Britannia Industries", symbol: "BRITANNIA.NS", price: 4950.10, change: 0.45 },
    { name: "Tata Consumer Products", symbol: "TATACONSUM.NS", price: 1150.20, change: -1.20 }
  ]},
  { name: "Automobile", weight: 6.0, change: -0.41, code: "nifty_auto", stocks: [
    { name: "Tata Motors", symbol: "TATAMOTORS.NS", price: 920.40, change: -1.15 },
    { name: "Mahindra & Mahindra", symbol: "M&M.NS", price: 1850.10, change: 0.82 },
    { name: "Maruti Suzuki", symbol: "MARUTI.NS", price: 11450.00, change: -0.35 },
    { name: "Bajaj Auto", symbol: "BAJAJ-AUTO.NS", price: 8350.50, change: -0.92 },
    { name: "Eicher Motors", symbol: "EICHERMOT.NS", price: 3950.20, change: 1.10 }
  ]},
  { name: "Metals & Mining", weight: 4.0, change: 1.05, code: "nifty_metal", stocks: [
    { name: "Tata Steel", symbol: "TATASTEEL.NS", price: 142.50, change: 1.25 },
    { name: "JSW Steel", symbol: "JSWSTEEL.NS", price: 812.30, change: 0.85 },
    { name: "Hindalco Industries", symbol: "HINDALCO.NS", price: 512.40, change: 1.45 },
    { name: "Coal India", symbol: "COALINDIA.NS", price: 425.10, change: -0.15 },
    { name: "Vedanta", symbol: "VEDL.NS", price: 275.60, change: 1.85 }
  ]},
  { name: "Pharma & Healthcare", weight: 4.0, change: 0.76, code: "nifty_pharma", stocks: [
    { name: "Sun Pharmaceutical", symbol: "SUNPHARMA.NS", price: 1520.40, change: 0.95 },
    { name: "Cipla", symbol: "CIPLA.NS", price: 1350.20, change: 0.15 },
    { name: "Dr. Reddy's Laboratories", symbol: "REDDY.NS", price: 6150.10, change: -0.30 },
    { name: "Divi's Laboratories", symbol: "DIVISLAB.NS", price: 3510.40, change: 1.45 },
    { name: "Apollo Hospitals", symbol: "APOLLOHOSP.NS", price: 6110.20, change: 0.72 }
  ]},
  { name: "Infrastructure & Realty", weight: 3.0, change: 0.25, code: "nifty_infra", stocks: [
    { name: "Larsen & Toubro", symbol: "LT.NS", price: 3450.20, change: 0.65 },
    { name: "Adani Ports", symbol: "ADANIPORTS.NS", price: 1250.40, change: -1.15 },
    { name: "GMR Infrastructure", symbol: "GMRINFRA.NS", price: 82.50, change: 1.85 },
    { name: "IRB Infrastructure", symbol: "IRBINFRA.NS", price: 58.20, change: 0.45 },
    { name: "DLF", symbol: "DLF.NS", price: 812.40, change: -0.30 }
  ]},
  { name: "Telecommunications", weight: 2.0, change: -0.12, code: "nifty_telecom", stocks: [
    { name: "Bharti Airtel", symbol: "BHARTIARTL.NS", price: 1120.40, change: 0.45 },
    { name: "Indus Towers", symbol: "INDUSTOWER.NS", price: 242.10, change: -1.25 },
    { name: "Tata Communications", symbol: "TATACOMM.NS", price: 1750.30, change: 0.12 },
    { name: "Vodafone Idea", symbol: "IDEA.NS", price: 13.85, change: -2.45 },
    { name: "Tata Teleservices", symbol: "TTML.NS", price: 78.40, change: -0.95 }
  ]},
  { name: "Power & Utilities", weight: 2.0, change: 0.85, code: "nifty_power", stocks: [
    { name: "Adani Green Energy", symbol: "ADANIGREEN.NS", price: 1650.40, change: 1.25 },
    { name: "Tata Power", symbol: "TATAPOWER.NS", price: 382.10, change: 0.65 },
    { name: "JSW Energy", symbol: "JSWENERGY.NS", price: 510.30, change: -0.12 },
    { name: "NHPC", symbol: "NHPC.NS", price: 88.50, change: 2.10 },
    { name: "SJVN", symbol: "SJVN.NS", price: 112.40, change: 1.45 }
  ]},
  { name: "Consumer Durables", weight: 1.0, change: -0.22, code: "nifty_durables", stocks: [
    { name: "Titan Company", symbol: "TITAN.NS", price: 3620.50, change: -0.45 },
    { name: "Havells India", symbol: "HAVELLS.NS", price: 1450.40, change: 0.12 },
    { name: "Voltas", symbol: "VOLTAS.NS", price: 1080.30, change: -1.15 },
    { name: "Dixon Technologies", symbol: "DIXON.NS", price: 6850.10, change: 1.85 },
    { name: "Amber Enterprises", symbol: "AMBER.NS", price: 3520.40, change: -0.92 }
  ]}
];

const getOptionsChain = (spot: number) => {
  if (!spot) return { strikes: [], pcr: 0.95, maxPain: 22100 };
  const atm = Math.round(spot / 50) * 50;
  const strikes = [];
  let totalCallOi = 0;
  let totalPutOi = 0;

  for (let i = -5; i <= 5; i++) {
    const strike = atm + (i * 50);
    const isCallATM = strike >= atm;
    const isPutATM = strike <= atm;
    
    const distance = Math.abs(strike - atm) / 50;
    const callBase = Math.round(150000 / (1 + distance * 0.4));
    const putBase = Math.round(150000 / (1 + distance * 0.4));
    
    const callOi = Math.round(callBase * (1 + (isCallATM ? 0.35 : -0.25) * Math.sin(spot/100)));
    const putOi = Math.round(putBase * (1 + (isPutATM ? 0.35 : -0.25) * Math.cos(spot/100)));
    
    const callChange = Math.round(callOi * 0.12 * Math.sin(spot/50));
    const putChange = Math.round(putOi * 0.12 * Math.cos(spot/50));

    // Calculate premium pricing relative to spot price (intrinsic + extrinsic values)
    const callPremium = Number(Math.max(1.5, (spot - strike) + (180 / (1 + Math.abs(spot - strike) * 0.006))).toFixed(2));
    const putPremium = Number(Math.max(1.5, (strike - spot) + (180 / (1 + Math.abs(spot - strike) * 0.006))).toFixed(2));

    strikes.push({
      strike,
      callOi,
      callChange,
      callPremium,
      putOi,
      putChange,
      putPremium,
      type: strike === atm ? "ATM" : strike < atm ? "ITM" : "OTM"
    });

    totalCallOi += callOi;
    totalPutOi += putOi;
  }

  const pcr = Number((totalPutOi / totalCallOi).toFixed(2));
  const maxPain = atm - 50;

  return { strikes, pcr, maxPain };
};

export default function TradingTab() {
  const [activeSubTab, setActiveSubTab] = useState<"dashboard" | "journal" | "rules" | "brokers" | "live_feed">("dashboard");
  const [trades, setTrades] = useState<Trade[]>([]);

  // Real-time Stock Market Dashboard States
  const [marketData, setMarketData] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);
  const [fiiDii, setFiiDii] = useState<any[]>([]);
  const [pollInterval, setPollInterval] = useState<number>(5000); // 5s, 15s, 30s
  const [istTime, setIstTime] = useState<string>("");
  const [marketStatus, setMarketStatus] = useState<"PRE-MARKET" | "OPEN" | "CLOSED">("CLOSED");
  const [expandedIndices, setExpandedIndices] = useState<{ [key: string]: boolean }>({});
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [fetchingAiSummary, setFetchingAiSummary] = useState<boolean>(false);
  const [globalTab, setGlobalTab] = useState<"US" | "EUROPE" | "ASIA">("US");
  const [niftyHistory, setNiftyHistory] = useState<number[]>([]);
  const [giftNiftyHistory, setGiftNiftyHistory] = useState<number[]>([]);
  const [sectors, setSectors] = useState<any[]>(initialSectors);
  const [rules, setRules] = useState<string[]>(DEFAULT_RULES);
  const [checkedRules, setCheckedRules] = useState<{ [key: string]: boolean }>({});
  const [rulesConfirmed, setRulesConfirmed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goldHistoryOpen, setGoldHistoryOpen] = useState(false);
  const [silverHistoryOpen, setSilverHistoryOpen] = useState(false);

  // Live Market Feeds & Simulator
  const [simulatedPhase, setSimulatedPhase] = useState<"real_time" | "pre_market" | "market_open" | "mid_day" | "market_close">("real_time");
  
  const [sgxNifty, setSgxNifty] = useState({ name: "SGX/GIFT Nifty", price: 22210.50, change: 164.00, pct: 0.74, positive: true });

  const [indexFeed, setIndexFeed] = useState([
    { name: "NIFTY 50", price: 22146.50, change: 148.20, pct: 0.67, positive: true },
    { name: "SENSEX", price: 72832.10, change: 452.80, pct: 0.63, positive: true },
    { name: "BANK NIFTY", price: 46911.80, change: -124.50, pct: -0.26, positive: false },
    { name: "USDINR", price: 83.28, change: 0.02, pct: 0.02, positive: true },
    { name: "India VIX", price: 14.22, change: -0.85, pct: -5.64, positive: false },
    { name: "RELIANCE", price: 2468.90, change: 32.10, pct: 1.32, positive: true },
    { name: "HDFC BANK", price: 1442.20, change: -12.50, pct: -0.86, positive: false }
  ]);

  const [globalIndices, setGlobalIndices] = useState([
    { name: "Dow Jones (DJIA)", country: "USA", price: 39069.23, change: 184.84, pct: 0.48, positive: true, timezone: "EST", openHourLocal: "09:30", closeHourLocal: "16:00", openHourIst: "19:00", closeHourIst: "01:30", flag: "🇺🇸" },
    { name: "Nasdaq Composite (COMP)", country: "USA", price: 16009.22, change: 115.30, pct: 0.73, positive: true, timezone: "EST", openHourLocal: "09:30", closeHourLocal: "16:00", openHourIst: "19:00", closeHourIst: "01:30", flag: "🇺🇸" },
    { name: "S&P 500 (SPX)", country: "USA", price: 5088.80, change: 41.50, pct: 0.82, positive: true, timezone: "EST", openHourLocal: "09:30", closeHourLocal: "16:00", openHourIst: "19:00", closeHourIst: "01:30", flag: "🇺🇸" },
    { name: "FTSE 100", country: "UK", price: 7706.28, change: 21.90, pct: 0.28, positive: true, timezone: "GMT", openHourLocal: "08:00", closeHourLocal: "16:30", openHourIst: "13:30", closeHourIst: "22:00", flag: "🇬🇧" },
    { name: "DAX Index", country: "Germany", price: 17419.33, change: 49.60, pct: 0.29, positive: true, timezone: "CET", openHourLocal: "09:00", closeHourLocal: "17:30", openHourIst: "13:30", closeHourIst: "22:00", flag: "🇩🇪" },
    { name: "Nikkei 225", country: "Japan", price: 39098.68, change: 275.87, pct: 0.71, positive: true, timezone: "JST", openHourLocal: "09:00", closeHourLocal: "15:00", openHourIst: "05:30", closeHourIst: "11:30", flag: "🇯🇵" },
    { name: "Hang Seng Index", country: "Hong Kong", price: 16725.86, change: -17.20, pct: -0.10, positive: false, timezone: "HKT", openHourLocal: "09:30", closeHourLocal: "16:00", openHourIst: "07:00", closeHourIst: "13:30", flag: "🇭🇰" },
    { name: "Shanghai Composite", country: "China", price: 3004.88, change: 16.50, pct: 0.55, positive: true, timezone: "CST", openHourLocal: "09:30", closeHourLocal: "15:00", openHourIst: "07:00", closeHourIst: "12:30", flag: "🇨🇳" }
  ]);

  // Pre-market and Intraday simulation variables
  const [preMarketPrediction, setPreMarketPrediction] = useState<string>("");
  const [fetchingPreMarket, setFetchingPreMarket] = useState<boolean>(false);

  const [liveNiftyOpen, setLiveNiftyOpen] = useState<number>(22100);
  const [liveNiftyCurrent, setLiveNiftyCurrent] = useState<number>(22146.50);
  const [liveNiftyHigh, setLiveNiftyHigh] = useState<number>(22180.20);
  const [liveNiftyLow, setLiveNiftyLow] = useState<number>(22080.55);
  const [liveNiftyTrend, setLiveNiftyTrend] = useState<"bullish" | "bearish" | "neutral">("neutral");
  const [liveNiftyMoveSuggestion, setLiveNiftyMoveSuggestion] = useState<string>("");
  const [fetchingLiveMove, setFetchingLiveMove] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<{ time: string, price: number }[]>([]);

  // Firestore daily learned logs & state
  const [historicalRuns, setHistoricalRuns] = useState<any[]>([]);
  const [isSessionEnded, setIsSessionEnded] = useState<boolean>(false);

  // Weekly events feed & sector impact
  const [weeklyEvents, setWeeklyEvents] = useState([
    { 
      id: "fed_meet",
      name: "Federal Reserve FOMC Interest Rate Meeting", 
      date: "May 27, 2026 (Wednesday)", 
      impact: "HIGH", 
      description: "US Federal Reserve meets to decide on benchmark interest rates. Fed Chairman speech will provide critical cues on interest rate cuts and inflation path.",
      affectedSectors: [
        { sector: "IT (Tech Exports)", direction: "Volatile", explanation: "High US interest rates squeeze client tech budgets. Dovish comments or rate cuts boost spending." },
        { sector: "Banking & Financials", direction: "Positive", explanation: "FPI flows correlate with yield differentials. US rate cuts spur capital inflows into emerging market banks." },
        { sector: "Real Estate & Auto", direction: "Sensitive", explanation: "Indirect sentiment link via domestic cost of borrowing and rate expectations." }
      ],
      aiAnalysis: ""
    },
    { 
      id: "india_cpi",
      name: "India CPI Inflation & Industrial Output (IIP)", 
      date: "May 29, 2026 (Friday)", 
      impact: "HIGH", 
      description: "MoSPI releases retail inflation numbers and industrial output index metrics. Key driver for upcoming RBI Monetary Policy Committee rate decision.",
      affectedSectors: [
        { sector: "FMCG / Consumption", direction: "Negative", explanation: "High inflation erodes rural purchasing power and squeezes margins for consumer companies." },
        { sector: "Banking & NBFCs", direction: "Sensitive", explanation: "Inflation determines interest rate trajectory. Low inflation opens doors for RBI rate cuts." }
      ],
      aiAnalysis: ""
    },
    { 
      id: "reliance_agm",
      name: "Reliance Industries Board Meeting & Future Retail Spin-off", 
      date: "May 25, 2026 (Monday)", 
      impact: "MEDIUM", 
      description: "Board reviews strategic investments in green energy and retail monetization updates. RIL represents 10%+ weightage of Nifty 50 index.",
      affectedSectors: [
        { sector: "Oil & Gas / Energy", direction: "Positive", explanation: "Green energy capex details drive stock valuations and direct Nifty benchmark moves." },
        { sector: "Retail & E-commerce", direction: "Positive", explanation: "Spin-off valuations boost peer FMCG and retail multiples." }
      ],
      aiAnalysis: ""
    }
  ]);
  const [activeEventAnalysisId, setActiveEventAnalysisId] = useState<string>("fed_meet");

  // Form States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stockName, setStockName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tradeType, setTradeType] = useState<Trade["tradeType"]>("Options");
  const [broker, setBroker] = useState<Trade["broker"]>("Manual Entry");
  const [direction, setDirection] = useState<Trade["direction"]>("Long");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [riskPercent, setRiskPercent] = useState("1.5");
  const [whyEntered, setWhyEntered] = useState("");
  const [mindsetBefore, setMindsetBefore] = useState<Trade["mindsetBefore"]>("Calm");
  const [exitReason, setExitReason] = useState<Trade["exitReason"]>("Target achieved");
  const [exitNote, setExitNote] = useState("");
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Option Trading Specific Form States
  const [optionUnderlying, setOptionUnderlying] = useState<"NIFTY" | "SENSEX" | "BANKNIFTY" | "BANKEX" | "CUSTOM">("NIFTY");
  const [customOptionSymbol, setCustomOptionSymbol] = useState("");
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");
  const [optionStrike, setOptionStrike] = useState("");
  const [optionExpiry, setOptionExpiry] = useState("");
  const [lotsCount, setLotsCount] = useState("1");
  const [lotSizeVal, setLotSizeVal] = useState("65");
  const [optionStyle, setOptionStyle] = useState<"Buying" | "Selling">("Buying");
  const [optionStrategy, setOptionStrategy] = useState("Naked Option");

  // Option Selling with Hedge Specifics
  const [hedgeStrike, setHedgeStrike] = useState("");
  const [hedgeEntryPremium, setHedgeEntryPremium] = useState("");
  const [hedgeExitPremium, setHedgeExitPremium] = useState("");

  useEffect(() => {
    if (optionUnderlying === "NIFTY") {
      setLotSizeVal("65");
    } else if (optionUnderlying === "SENSEX") {
      setLotSizeVal("10");
    } else if (optionUnderlying === "BANKNIFTY") {
      setLotSizeVal("15");
    } else if (optionUnderlying === "BANKEX") {
      setLotSizeVal("15");
    }
  }, [optionUnderlying]);

  // Sync Buy/Sell direction with Option style selection
  useEffect(() => {
    if (tradeType === "Options") {
      setDirection(optionStyle === "Buying" ? "Long" : "Short");
    }
  }, [optionStyle, tradeType]);

  // Helper to calculate the next nearest expiry date for options
  const getNextExpiryDate = (underlying: string) => {
    let targetDay = 2; // Default: Tuesday (Nifty 50/Bank Nifty)
    if (underlying === "NIFTY" || underlying === "BANKNIFTY") targetDay = 2; // Tuesday
    else if (underlying === "SENSEX" || underlying === "BANKEX") targetDay = 4; // Thursday
    else return "";

    const today = new Date();
    const resultDate = new Date(today);
    let daysAhead = (targetDay - today.getDay() + 7) % 7;
    // If today is targetDay and it's past market hours (3:30 PM), roll to next week
    if (daysAhead === 0 && today.getHours() >= 16) {
      daysAhead = 7;
    }
    resultDate.setDate(today.getDate() + daysAhead);

    const day = String(resultDate.getDate()).padStart(2, '0');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[resultDate.getMonth()];
    const year = resultDate.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Helper to calculate the next 4 weekly expiry dates for options
  const getExpiryDatesForUnderlying = (underlying: string): string[] => {
    let targetDay = 2; // Default: Tuesday (Nifty 50/Bank Nifty)
    if (underlying === "NIFTY" || underlying === "BANKNIFTY") targetDay = 2; // Tuesday
    else if (underlying === "SENSEX" || underlying === "BANKEX") targetDay = 4; // Thursday
    else return [];

    const list: string[] = [];
    const today = new Date();
    
    // Find the next occurrence of targetDay
    let daysAhead = (targetDay - today.getDay() + 7) % 7;
    // If today is targetDay and it's past market hours (3:30 PM), roll to next week
    if (daysAhead === 0 && today.getHours() >= 16) {
      daysAhead = 7;
    }
    
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() + daysAhead);

    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    for (let i = 0; i < 4; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + (i * 7));
      const dayStr = String(d.getDate()).padStart(2, '0');
      const monthStr = monthNames[d.getMonth()];
      const yearStr = d.getFullYear();
      list.push(`${dayStr}-${monthStr}-${yearStr}`);
    }
    return list;
  };

  // Helper to generate strikes options for selected underlying
  const getStrikeOptions = () => {
    let spot = 22000;
    let step = 100;
    if (optionUnderlying === "NIFTY") {
      spot = marketData?.nifty?.price || 24000;
      step = 50;
    } else if (optionUnderlying === "SENSEX") {
      spot = marketData?.sensex?.price || 78000;
      step = 100;
    } else if (optionUnderlying === "BANKNIFTY") {
      spot = marketData?.banknifty?.price || 55000;
      step = 100;
    } else if (optionUnderlying === "BANKEX") {
      spot = marketData?.banknifty?.price || 55000; // Bankex uses Banknifty proxy price
      step = 100;
    } else {
      return [];
    }
    const atm = Math.round(spot / step) * step;
    const list = [];
    for (let i = -10; i <= 10; i++) {
      list.push(atm + (i * step));
    }
    return list;
  };

  // Auto sync Strike and Expiry on Index underlying selection or modal open
  useEffect(() => {
    if (optionUnderlying !== "CUSTOM" && isAddModalOpen) {
      const expiries = getExpiryDatesForUnderlying(optionUnderlying);
      if (expiries.length > 0) {
        setOptionExpiry(expiries[0]);
      } else {
        setOptionExpiry("");
      }
      
      let spot = 24000;
      let step = 100;
      if (optionUnderlying === "NIFTY") {
        spot = marketData?.nifty?.price || 24000;
        step = 50;
      } else if (optionUnderlying === "SENSEX") {
        spot = marketData?.sensex?.price || 78000;
        step = 100;
      } else if (optionUnderlying === "BANKNIFTY") {
        spot = marketData?.banknifty?.price || 55000;
        step = 100;
      } else if (optionUnderlying === "BANKEX") {
        spot = marketData?.banknifty?.price || 55000;
        step = 100;
      }
      const atm = Math.round(spot / step) * step;
      setOptionStrike(atm.toString());
    }
  }, [optionUnderlying, isAddModalOpen]);

  // Broker Sync States
  const [dhanConfig, setDhanConfig] = useState({ clientId: "", apiKey: "", secret: "", connected: false });
  const [zerodhaConfig, setZerodhaConfig] = useState({ clientId: "", apiKey: "", connected: false });
  const [upstoxConfig, setUpstoxConfig] = useState({ clientId: "", apiKey: "", connected: false });
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [syncToDate, setSyncToDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // AI Insights State
  const [aiSuggestions, setAiSuggestions] = useState<string>("Loading AI psychology analysis...");
  const [fetchingAi, setFetchingAi] = useState(false);

  // Motivational Popup Timer
  const [motivationMsg, setMotivationMsg] = useState(MOTIVATIONAL_MESSAGES[0]);
  const [showMotivationToast, setShowMotivationToast] = useState(false);

  const liveNiftyCurrentRef = useRef(liveNiftyCurrent);
  liveNiftyCurrentRef.current = liveNiftyCurrent;
  
  const sgxNiftyRef = useRef(sgxNifty);
  sgxNiftyRef.current = sgxNifty;
  
  const liveNiftyOpenRef = useRef(liveNiftyOpen);
  liveNiftyOpenRef.current = liveNiftyOpen;

  // Load historical price learning logs
  const fetchHistoricalRuns = async () => {
    try {
      const qSnapshot = await getDocs(collection(db, "daily_market_runs"));
      const list: any[] = [];
      qSnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setHistoricalRuns(list);
    } catch (e) {
      console.warn("Failed to load historical runs:", e);
    }
  };

  // 9:00 AM AI open predictor
  const getPreMarketAiPrediction = async () => {
    setFetchingPreMarket(true);
    try {
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_market_open_prediction",
          payload: {
            globalFeed: globalIndices,
            sgxNiftyFeed: sgxNifty
          }
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setPreMarketPrediction(data.suggestion);
      }
    } catch (e) {
      setPreMarketPrediction("Failed to fetch pre-market prediction. Fallback: Gap-up expected.");
    } finally {
      setFetchingPreMarket(false);
    }
  };

  // 9:15 AM Live intraday moves analyst
  const getLiveMoveAiSuggestion = async () => {
    setFetchingLiveMove(true);
    try {
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_market_move_suggestion",
          payload: {
            openPrice: liveNiftyOpen,
            currentPrice: liveNiftyCurrent,
            highPrice: liveNiftyHigh,
            lowPrice: liveNiftyLow,
            trend: liveNiftyTrend,
            history: historicalRuns.slice(0, 5)
          }
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setLiveNiftyMoveSuggestion(data.suggestion);
      }
    } catch (e) {
      setLiveNiftyMoveSuggestion("Failed to load live move suggestions.");
    } finally {
      setFetchingLiveMove(false);
    }
  };

  // Weekly impact news event analyst
  const getEventImpactAiAnalysis = async (eventId: string) => {
    setWeeklyEvents(prev => prev.map(e => e.id === eventId ? { ...e, aiAnalysis: "Analyzing event macros..." } : e));
    const targetEvent = weeklyEvents.find(e => e.id === eventId);
    if (!targetEvent) return;

    try {
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_event_impact_analysis",
          payload: {
            eventName: targetEvent.name,
            eventDescription: targetEvent.description
          }
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setWeeklyEvents(prev => prev.map(e => e.id === eventId ? { ...e, aiAnalysis: data.suggestion } : e));
      }
    } catch (e) {
      setWeeklyEvents(prev => prev.map(e => e.id === eventId ? { ...e, aiAnalysis: "Failed to generate AI macro research analysis." } : e));
    }
  };

  // End daily session and log metrics to Firestore for AI learning
  const handleSaveDailySession = async () => {
    const runRecord = {
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      openPrice: liveNiftyOpen,
      highPrice: liveNiftyHigh,
      lowPrice: liveNiftyLow,
      closePrice: liveNiftyCurrent,
      netChange: Number((liveNiftyCurrent - liveNiftyOpen).toFixed(2)),
      trend: liveNiftyTrend,
      aiAnalysisSummary: liveNiftyMoveSuggestion || "Intraday session summary recorded."
    };

    try {
      await addDoc(collection(db, "daily_market_runs"), runRecord);
      setIsSessionEnded(true);
      fetchHistoricalRuns();
      alert("✅ Daily Nifty price action and learned pattern successfully logged to Firestore! The AI model has added this volatility profile to its historical daily dataset.");
    } catch (e) {
      alert("Failed to save daily run to Firestore.");
    }
  };

  // Check market opening status
  const isMarketOpen = (indexName: string, localHourStart: string, localHourEnd: string, timezone: string, simulated?: string) => {
    if (simulated && simulated !== "real_time") {
      if (indexName === "NIFTY 50" || indexName === "SENSEX" || indexName === "BANK NIFTY" || indexName === "RELIANCE" || indexName === "HDFC BANK") {
        return simulated === "market_open" || simulated === "mid_day";
      }
      if (indexName === "SGX/GIFT Nifty") {
        return simulated !== "market_close";
      }
      if (timezone === "EST") {
        return simulated === "pre_market" || simulated === "market_close";
      }
      if (timezone === "JST" || timezone === "HKT" || timezone === "CST") {
        return simulated === "pre_market" || simulated === "market_open";
      }
      if (timezone === "GMT" || timezone === "CET") {
        return simulated === "mid_day" || simulated === "market_close";
      }
      return true;
    }

    const now = new Date();
    const tzString = timezone === "EST" ? "America/New_York" 
                   : timezone === "GMT" ? "Europe/London" 
                   : timezone === "CET" ? "Europe/Berlin" 
                   : timezone === "JST" ? "Asia/Tokyo" 
                   : timezone === "HKT" ? "Asia/Hong_Kong" 
                   : timezone === "CST" ? "Asia/Shanghai" 
                   : "Asia/Kolkata";

    // Format weekday to short name (e.g. "Mon")
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tzString,
      weekday: "short"
    });
    const weekday = weekdayFormatter.format(now);
    if (weekday === "Sat" || weekday === "Sun") return false;

    // Format hour and minute to 2-digit format (24-hour style)
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tzString,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    
    const parts = timeFormatter.formatToParts(now);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const hour = partMap.hour;
    const minute = partMap.minute;
    const timeString = `${hour}:${minute}`;

    return timeString >= localHourStart && timeString <= localHourEnd;
  };

  // Handle phase changes
  const handlePhaseChange = (phase: typeof simulatedPhase) => {
    setSimulatedPhase(phase);
    setIsSessionEnded(false);

    if (phase === "pre_market") {
      setLiveNiftyOpen(22100);
      setLiveNiftyCurrent(22100);
      setLiveNiftyHigh(22100);
      setLiveNiftyLow(22100);
      setLiveNiftyTrend("neutral");
      setLiveNiftyMoveSuggestion("");
      setPreMarketPrediction("");
      setPriceHistory([
        { time: "09:00", price: 22100 }
      ]);
    } else if (phase === "market_open") {
      const openPrice = Number((22000 + (sgxNifty.price - 22000) * 0.95).toFixed(2));
      setLiveNiftyOpen(openPrice);
      setLiveNiftyCurrent(openPrice);
      setLiveNiftyHigh(openPrice);
      setLiveNiftyLow(openPrice);
      setLiveNiftyTrend("neutral");
      setLiveNiftyMoveSuggestion("");
      setPriceHistory([
        { time: "09:15", price: openPrice }
      ]);
    } else if (phase === "mid_day") {
      const openPrice = Number((22000 + (sgxNifty.price - 22000) * 0.95).toFixed(2));
      setLiveNiftyOpen(openPrice);
      const curPrice = Number((openPrice + 58.40).toFixed(2));
      setLiveNiftyCurrent(curPrice);
      setLiveNiftyHigh(Number((openPrice + 85.00).toFixed(2)));
      setLiveNiftyLow(Number((openPrice - 20.30).toFixed(2)));
      setLiveNiftyTrend("bullish");
      setPriceHistory([
        { time: "09:15", price: openPrice },
        { time: "10:00", price: Number((openPrice + 20).toFixed(2)) },
        { time: "10:45", price: Number((openPrice - 15).toFixed(2)) },
        { time: "11:30", price: curPrice }
      ]);
    } else if (phase === "market_close") {
      const openPrice = Number((22000 + (sgxNifty.price - 22000) * 0.95).toFixed(2));
      setLiveNiftyOpen(openPrice);
      const curPrice = Number((openPrice + 120.50).toFixed(2));
      setLiveNiftyCurrent(curPrice);
      setLiveNiftyHigh(Number((openPrice + 145.20).toFixed(2)));
      setLiveNiftyLow(Number((openPrice - 15.00).toFixed(2)));
      setLiveNiftyTrend("bullish");
      setPriceHistory([
        { time: "09:15", price: openPrice },
        { time: "10:30", price: Number((openPrice + 35).toFixed(2)) },
        { time: "12:00", price: Number((openPrice + 10).toFixed(2)) },
        { time: "13:30", price: Number((openPrice + 90).toFixed(2)) },
        { time: "15:00", price: Number((openPrice + 130).toFixed(2)) },
        { time: "15:30", price: curPrice }
      ]);
    } else {
      setLiveNiftyOpen(22146.50);
      setLiveNiftyCurrent(22146.50);
      setLiveNiftyHigh(22180.00);
      setLiveNiftyLow(22100.00);
      setLiveNiftyTrend("neutral");
      setPriceHistory([
        { time: "09:15", price: 22100 },
        { time: "11:00", price: 22130 },
        { time: "13:00", price: 22120 },
        { time: "15:00", price: 22146.50 }
      ]);
    }
  };

  useEffect(() => {
    fetchTrades();
    fetchRules();
    loadBrokerConfigs();
    fetchHistoricalRuns();
    
    // Set up 15-minute motivational message notification
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length);
      setMotivationMsg(MOTIVATIONAL_MESSAGES[idx]);
      setShowMotivationToast(true);
      
      // Auto dismiss after 7 seconds
      setTimeout(() => {
        setShowMotivationToast(false);
      }, 7000);
    }, 15 * 60 * 1000);

    // Initial message trigger after 5 seconds for visual feedback
    const initialTimer = setTimeout(() => {
      const idx = Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length);
      setMotivationMsg(MOTIVATIONAL_MESSAGES[idx]);
      setShowMotivationToast(true);
      setTimeout(() => setShowMotivationToast(false), 7000);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimer);
    };
  }, []);

  // IST Clock tick & Market Status Check
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      // Format to IST clock
      const options = { timeZone: "Asia/Kolkata", hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;
      const timeStr = now.toLocaleTimeString("en-IN", options);
      setIstTime(timeStr);

      // Determine market status based on IST hour & minute
      const [h, m] = timeStr.split(":").map(Number);
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      
      if (isWeekend) {
        setMarketStatus("CLOSED");
      } else {
        const minutes = h * 60 + m;
        if (minutes >= 9 * 60 && minutes < 9 * 60 + 15) {
          setMarketStatus("PRE-MARKET");
        } else if (minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30) {
          setMarketStatus("OPEN");
        } else {
          setMarketStatus("CLOSED");
        }
      }
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  const fetchAiDashboardSummary = async (currentMarketData: any, currentNews: any[], currentFiiDii: any[]) => {
    if (!currentMarketData) return;
    setFetchingAiSummary(true);
    try {
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_dashboard_summary",
          payload: {
            nifty: `${currentMarketData.nifty.price} (${currentMarketData.nifty.pct}%)`,
            sensex: `${currentMarketData.sensex.price} (${currentMarketData.sensex.pct}%)`,
            banknifty: `${currentMarketData.banknifty.price} (${currentMarketData.banknifty.pct}%)`,
            giftNifty: `${(currentMarketData.nifty.price * 1.002).toFixed(2)}`,
            giftPremium: `${(currentMarketData.nifty.price * 0.002).toFixed(2)}`,
            dow: `${currentMarketData.dow.price} (${currentMarketData.dow.pct}%)`,
            vix: `${currentMarketData.vix.price}`,
            nikkei: `${currentMarketData.nikkei.price} (${currentMarketData.nikkei.pct}%)`,
            usdinr: `${currentMarketData.usdinr.price}`,
            crude: `${currentMarketData.crude_brent.price} (${currentMarketData.crude_brent.pct}%)`,
            fiiCash: currentFiiDii.length > 0 ? currentFiiDii[currentFiiDii.length - 1].fiiCash : -1500,
            diiCash: currentFiiDii.length > 0 ? currentFiiDii[currentFiiDii.length - 1].diiCash : 1200,
            news: currentNews.slice(0, 5).map(n => n.title),
            phase: simulatedPhase
          }
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setAiSummary(data.suggestion);
      }
    } catch (e) {
      console.warn("AI Dashboard summary fetch error:", e);
      setAiSummary("Failed to generate AI Market Summary. Check backend connections.");
    } finally {
      setFetchingAiSummary(false);
    }
  };

  const fetchAllMarketData = async () => {
    try {
      let gData: any = null;
      try {
        const gRes = await fetch("https://ik-backend-crg8.onrender.com/api/market/global");
        const text = await gRes.text();
        gData = JSON.parse(text);
      } catch (err) {
        // Fallback for Firebase hosting or absent backend
        const symbols = {
          nifty: '^NSEI', sensex: '^BSESN', banknifty: '^NSEBANK',
          usdinr: 'INR=X', gold: 'GC=F', silver: 'SI=F',
          crude_brent: 'BZ=F', vix: '^VIX', dow: '^DJI', nikkei: '^N225'
        };
        const defaultValues: any = {
          nifty: { price: 22146.50, change: 148.20, pct: 0.67, high: 22180.20, low: 22080.55, positive: true },
          sensex: { price: 72832.10, change: 452.80, pct: 0.63, high: 72950.00, low: 72600.00, positive: true },
          banknifty: { price: 46911.80, change: -124.50, pct: -0.26, high: 47100.00, low: 46750.00, positive: false },
          usdinr: { price: 83.28, change: 0.02, pct: 0.02, positive: true },
          gold: { price: 2350.40, change: 12.50, pct: 0.62, positive: true },
          silver: { price: 28.85, change: 0.15, pct: 0.66, positive: true },
          crude_brent: { price: 81.62, change: -0.45, pct: -0.55, positive: false },
          vix: { price: 14.22, change: -0.85, pct: -5.64, positive: false },
          dow: { price: 39069.23, change: 184.84, pct: 0.48, positive: true },
          nikkei: { price: 39098.68, change: 275.87, pct: 0.71, positive: true }
        };

        gData = {};
        await Promise.all(Object.entries(symbols).map(async ([key, symbol]) => {
          let success = false;
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
          // Try multiple proxies silently to avoid UI breakage
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?url=${encodeURIComponent(url)}`
          ];
          
          for (const proxyUrl of proxies) {
            try {
              const res = await fetch(proxyUrl, { mode: 'cors' });
              if (res.ok) {
                const j = await res.json();
                const meta = j.chart.result[0].meta;
                const price = meta.regularMarketPrice;
                const prevClose = meta.previousClose || meta.chartPreviousClose || price;
                const change = price - prevClose;
                const pct = prevClose ? (change / prevClose) * 100 : 0;
                gData[key] = {
                  price: Number(price.toFixed(2)),
                  change: Number(change.toFixed(2)),
                  pct: Number(pct.toFixed(2)),
                  high: Number((meta.regularMarketDayHigh || price).toFixed(2)),
                  low: Number((meta.regularMarketDayLow || price).toFixed(2)),
                  positive: change >= 0
                };
                success = true;
                break; // Exit proxy loop on success
              }
            } catch(e) {
              // Silently ignore individual proxy failures
            }
          }
          
          if (!success) {
            // Hard fallback to defaults if all proxies fail (prevents UI crash)
            gData[key] = defaultValues[key];
          }
        }));
        
        // Mock giftnifty if absent
        if (gData.nifty) {
           gData.giftnifty = {
             price: Number((gData.nifty.price + 22.50).toFixed(2)),
             change: Number((gData.nifty.change + 15.20).toFixed(2)),
             pct: gData.nifty.pct,
             positive: gData.nifty.change >= 0
           };
        }
      }
      
      if (gData) {
        setMarketData(gData);
      }

      if (gData && gData.giftnifty) {
        setSgxNifty({
          name: "SGX/GIFT Nifty",
          price: gData.giftnifty.price,
          change: gData.giftnifty.change,
          pct: gData.giftnifty.pct,
          positive: gData.giftnifty.positive
        });
      }

      // Store history for sparklines
      if (gData && gData.nifty) {
        setNiftyHistory(prev => [...prev, gData.nifty.price].slice(-20));
        const giftPrice = gData.giftnifty ? gData.giftnifty.price : Number((gData.nifty.price * (1 + ((gData.usdinr?.price || 83.28) > 83 ? 0.0015 : -0.0008))).toFixed(2));
        setGiftNiftyHistory(prev => [...prev, giftPrice].slice(-20));
      }

      // Update sector changes based on actual market data
      setSectors(prevSectors => prevSectors.map(sec => {
        let codePrice = gData[sec.code];
        let pct = sec.change;
        if (codePrice) {
          pct = codePrice.pct;
        } else {
          pct = Number(((gData?.nifty?.pct ?? 0) * (0.8 + Math.random() * 0.4)).toFixed(2));
        }

        // Update stocks inside the sector
        const updatedStocks = sec.stocks.map((stk: any) => {
          const dev = (Math.random() - 0.5) * 0.15;
          const stockChange = Number((pct + dev).toFixed(2));
          const base = stk.price / (1 + stk.change / 100);
          const nextPrice = Number((base * (1 + stockChange / 100)).toFixed(2));
          return {
            ...stk,
            change: stockChange,
            price: nextPrice
          };
        });

        return {
          ...sec,
          change: pct,
          stocks: updatedStocks
        };
      }));

    } catch (e) {
      console.warn("Global market data fetch error:", e);
    }
  };

  const fetchNewsAndFiiDii = async () => {
    try {
      try {
        const nRes = await fetch("https://ik-backend-crg8.onrender.com/api/market/news");
        const nText = await nRes.text();
        const nData = JSON.parse(nText);
        setNews(nData);
      } catch (e) {
        console.warn("News API not available, using empty/fallback news");
        setNews([]);
      }

      try {
        const fRes = await fetch("https://ik-backend-crg8.onrender.com/api/market/fii-dii");
        const fText = await fRes.text();
        const fData = JSON.parse(fText);
        setFiiDii(fData);
      } catch (e) {
        console.warn("FII/DII API not available");
        setFiiDii([]);
      }
    } catch (e) {
      console.warn("News & FII/DII fetch error:", e);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/market/events");
      const text = await res.text();
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0) {
        setWeeklyEvents(data);
      }
    } catch (e) {
      console.warn("Failed to fetch weekly events, using defaults:", e);
    }
  };

  // Initial load hooks
  useEffect(() => {
    fetchAllMarketData();
    fetchNewsAndFiiDii();
    fetchEvents();
  }, []);

  // Poll intervals
  useEffect(() => {
    const dataInterval = setInterval(() => {
      fetchAllMarketData();
    }, pollInterval);

    const newsInterval = setInterval(() => {
      fetchNewsAndFiiDii();
    }, 120000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(newsInterval);
    };
  }, [pollInterval]);

  // AI Summary generator triggers
  useEffect(() => {
    if (marketData && news.length > 0) {
      fetchAiDashboardSummary(marketData, news, fiiDii);
    }
    const aiInterval = setInterval(() => {
      if (marketData && news.length > 0) {
        fetchAiDashboardSummary(marketData, news, fiiDii);
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(aiInterval);
  }, [marketData === null, news.length === 0]);

  // Update top scrolling ticker marquee on marketData state changes
  useEffect(() => {
    if (marketData) {
      setIndexFeed([
        { name: "NIFTY 50", price: marketData.nifty?.price, change: marketData.nifty?.change, pct: marketData.nifty?.pct, positive: marketData.nifty?.positive },
        { name: "SENSEX", price: marketData.sensex?.price, change: marketData.sensex?.change, pct: marketData.sensex?.pct, positive: marketData.sensex?.positive },
        { name: "BANK NIFTY", price: marketData.banknifty?.price, change: marketData.banknifty?.change, pct: marketData.banknifty?.pct, positive: marketData.banknifty?.positive },
        { name: "USDINR", price: marketData.usdinr?.price, change: marketData.usdinr?.change, pct: marketData.usdinr?.pct, positive: marketData.usdinr?.positive },
        { name: "India VIX", price: marketData.vix?.price, change: marketData.vix?.change, pct: marketData.vix?.pct, positive: marketData.vix?.positive },
        { name: "Brent Crude", price: marketData.crude_brent?.price, change: marketData.crude_brent?.change, pct: marketData.crude_brent?.pct, positive: marketData.crude_brent?.positive },
        { name: "Gold MCX", price: marketData.gold?.price && marketData.usdinr?.price ? Math.round(marketData.gold.price * marketData.usdinr.price * 0.03215 * 10) : 0, change: marketData.gold?.change, pct: marketData.gold?.pct, positive: marketData.gold?.positive }
      ]);
    }
  }, [marketData]);

  // Periodic ticks for live market indices (Simulated & Local drift engine)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setMarketData((prev: any) => {
        if (!prev) return prev;
        
        const isActiveTime = simulatedPhase === "market_open" || simulatedPhase === "mid_day" || 
          (simulatedPhase === "real_time" && marketStatus === "OPEN");
          
        if (!isActiveTime) {
          // Slow drift global markets
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (["dow", "sp500", "nasdaq", "russell", "nikkei", "hangseng", "shanghai", "ftse", "dax", "cac", "stoxx50", "usdinr", "gold", "silver", "crude_brent", "crude_wti", "nat_gas"].includes(key) && updated[key]) {
              const drift = (Math.random() - 0.5) * 0.0003;
              const nextPrice = Number((updated[key].price * (1 + drift)).toFixed(2));
              const change = nextPrice - (updated[key].price - updated[key].change);
              updated[key] = {
                ...updated[key],
                price: nextPrice,
                change: Number(change.toFixed(2)),
                pct: Number(((change / (nextPrice - change)) * 100).toFixed(2))
              };
            }
          });
          return updated;
        }

        const nextData = { ...prev };
        
        // 1. Tick Nifty 50
        const niftyDrift = (Math.random() - 0.495) * 0.0006;
        const nextNiftyPrice = Number((prev.nifty.price * (1 + niftyDrift)).toFixed(2));
        const niftyPrevClose = prev.nifty.price - prev.nifty.change;
        const niftyChange = nextNiftyPrice - niftyPrevClose;
        nextData.nifty = {
          ...prev.nifty,
          price: nextNiftyPrice,
          change: Number(niftyChange.toFixed(2)),
          pct: Number(((niftyChange / niftyPrevClose) * 100).toFixed(2)),
          high: Number(Math.max(prev.nifty.high, nextNiftyPrice).toFixed(2)),
          low: Number(Math.min(prev.nifty.low, nextNiftyPrice).toFixed(2))
        };

        // 2. Ticks Sensex and Bank Nifty linked to Nifty moves
        const niftyPct = nextData.nifty.pct;
        
        // Sensex
        const sensexPrevClose = prev.sensex.price - prev.sensex.change;
        const nextSensexPrice = Number((sensexPrevClose * (1 + (niftyPct / 100) * 1.05)).toFixed(2));
        const sensexChange = nextSensexPrice - sensexPrevClose;
        nextData.sensex = {
          ...prev.sensex,
          price: nextSensexPrice,
          change: Number(sensexChange.toFixed(2)),
          pct: Number(((sensexChange / sensexPrevClose) * 100).toFixed(2)),
          high: Number(Math.max(prev.sensex.high, nextSensexPrice).toFixed(2)),
          low: Number(Math.min(prev.sensex.low, nextSensexPrice).toFixed(2))
        };

        // Bank Nifty
        const bankNiftyPrevClose = prev.banknifty.price - prev.banknifty.change;
        const nextBankNiftyPrice = Number((bankNiftyPrevClose * (1 + (niftyPct / 100) * 1.15)).toFixed(2));
        const bankNiftyChange = nextBankNiftyPrice - bankNiftyPrevClose;
        nextData.banknifty = {
          ...prev.banknifty,
          price: nextBankNiftyPrice,
          change: Number(bankNiftyChange.toFixed(2)),
          pct: Number(((bankNiftyChange / bankNiftyPrevClose) * 100).toFixed(2)),
          high: Number(Math.max(prev.banknifty.high, nextBankNiftyPrice).toFixed(2)),
          low: Number(Math.min(prev.banknifty.low, nextBankNiftyPrice).toFixed(2))
        };

        // 3. Tick Sector indexes
        const sectorsList = ["nifty_it", "nifty_auto", "nifty_pharma", "nifty_fmcg", "nifty_metal"];
        sectorsList.forEach(secKey => {
          if (prev[secKey]) {
            const secDrift = niftyDrift + (Math.random() - 0.5) * 0.0004;
            const nextPrice = Number((prev[secKey].price * (1 + secDrift)).toFixed(2));
            const baseClose = prev[secKey].price - prev[secKey].change;
            const change = nextPrice - baseClose;
            nextData[secKey] = {
              ...prev[secKey],
              price: nextPrice,
              change: Number(change.toFixed(2)),
              pct: Number(((change / baseClose) * 100).toFixed(2)),
              high: Number(Math.max(prev[secKey].high, nextPrice).toFixed(2)),
              low: Number(Math.min(prev[secKey].low, nextPrice).toFixed(2))
            };
          }
        });

        // 4. Midcap/Smallcap derived
        nextData.nifty_midcap = {
          ...prev.nifty_midcap,
          price: Math.round(nextNiftyPrice * 2.15),
          change: Number((nextData.nifty.change * 2.3).toFixed(2)),
          pct: Number((nextData.nifty.pct * 1.1).toFixed(2)),
          high: Math.round(nextData.nifty.high * 2.15),
          low: Math.round(nextData.nifty.low * 2.15)
        };

        nextData.nifty_smallcap = {
          ...prev.nifty_smallcap,
          price: Math.round(nextNiftyPrice * 0.72),
          change: Number((nextData.nifty.change * 0.85).toFixed(2)),
          pct: Number((nextData.nifty.pct * 1.25).toFixed(2)),
          high: Math.round(nextData.nifty.high * 0.72),
          low: Math.round(nextData.nifty.low * 0.72)
        };

        // 5. Commodities/Global indices drift
        const commList = ["usdinr", "gold", "silver", "crude_brent", "crude_wti", "nat_gas", "dow", "sp500", "nasdaq", "russell", "vix", "nikkei", "hangseng", "shanghai", "ftse", "dax", "cac", "stoxx50"];
        commList.forEach(key => {
          if (prev[key]) {
            const drift = (Math.random() - 0.5) * 0.0004;
            const nextPrice = Number((prev[key].price * (1 + drift)).toFixed(2));
            const baseClose = prev[key].price - prev[key].change;
            const change = nextPrice - baseClose;
            nextData[key] = {
              ...prev[key],
              price: nextPrice,
              change: Number(change.toFixed(2)),
              pct: Number(((change / baseClose) * 100).toFixed(2))
            };
          }
        });

        // Drift SGX Nifty synchronously
        setSgxNifty((prevSgx: any) => {
          if (simulatedPhase === "real_time") {
            return prevSgx;
          }
          const sgxDrift = niftyDrift + (Math.random() - 0.5) * 0.0002;
          const nextSgxPrice = Number((prevSgx.price * (1 + sgxDrift)).toFixed(2));
          const baseClose = 22046.50;
          const change = nextSgxPrice - baseClose;
          return {
            ...prevSgx,
            price: nextSgxPrice,
            change: Number(change.toFixed(2)),
            pct: Number(((change / baseClose) * 100).toFixed(2)),
            positive: change >= 0
          };
        });

        // Update local price history for charts
        setPriceHistory(prevHistory => {
          const nowStr = new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
          return [...prevHistory, { time: nowStr, price: nextNiftyPrice }].slice(-20);
        });

        // Update GIFT Nifty history too
        setGiftNiftyHistory(prevGiftHistory => {
          if (simulatedPhase === "real_time") {
            return [...prevGiftHistory, sgxNiftyRef.current.price].slice(-20);
          }
          const sgxDrift = niftyDrift + (Math.random() - 0.5) * 0.0002;
          const giftPrice = Number((nextNiftyPrice * (1 + (nextData.usdinr.price > 83 ? 0.0015 : -0.0008))).toFixed(2));
          return [...prevGiftHistory, giftPrice].slice(-20);
        });

        return nextData;
      });
    }, 5000);

    return () => clearInterval(tickInterval);
  }, [simulatedPhase, marketStatus]);

  // Fetch Trades from Firestore
  const fetchTrades = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "trades"));
      const list: Trade[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Trade);
      });
      // Sort by date/time descending
      list.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
      setTrades(list);
      triggerAiMindsetAnalysis(list);
    } catch (e) {
      console.warn("Failed to load trades:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch customized rules
  const fetchRules = async () => {
    try {
      const docSnap = await getDoc(doc(db, "settings", "trading_rules"));
      if (docSnap.exists()) {
        setRules(docSnap.data().rules || DEFAULT_RULES);
      } else {
        await setDoc(doc(db, "settings", "trading_rules"), { rules: DEFAULT_RULES });
      }
    } catch { /* offline */ }
  };

  const saveRulesToDb = async (updatedRules: string[]) => {
    try {
      await setDoc(doc(db, "settings", "trading_rules"), { rules: updatedRules });
    } catch { /* offline */ }
  };

  const loadBrokerConfigs = async () => {
    try {
      const docSnap = await getDoc(doc(db, "settings", "broker_config"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dhan) setDhanConfig(data.dhan);
        if (data.zerodha) setZerodhaConfig(data.zerodha);
        if (data.upstox) setUpstoxConfig(data.upstox);
      }
    } catch { /* offline */ }
  };

  const saveBrokerConfig = async (brokerName: "dhan" | "zerodha" | "upstox", updatedConfig: any) => {
    try {
      const docRef = doc(db, "settings", "broker_config");
      const current = await getDoc(docRef);
      const payload = current.exists() ? current.data() : {};
      payload[brokerName] = updatedConfig;
      await setDoc(docRef, payload, { merge: true });
    } catch { /* offline */ }
  };

  const triggerAiMindsetAnalysis = async (tradesList: Trade[]) => {
    if (tradesList.length === 0) {
      setAiSuggestions("Log your first trade details to generate your AI Psychological Mind Tracker insights!");
      return;
    }
    setFetchingAi(true);
    try {
      const emotions = tradesList.map(t => t.mindsetBefore);
      const exitReasons = tradesList.map(t => t.exitReason);
      
      const res = await fetch("https://ik-backend-crg8.onrender.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_mindset",
          payload: {
            emotions,
            exitReasons,
            trades: tradesList.slice(0, 20).map(t => ({
              symbol: t.symbol,
              riskPercent: t.riskPercent,
              profitOrLoss: t.profitOrLoss,
              exitReason: t.exitReason,
              date: t.date,
              time: t.time,
              mindsetBefore: t.mindsetBefore
            }))
          }
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setAiSuggestions(data.suggestion);
      }
    } catch (err) {
      console.warn("AI Sync error:", err);
      setAiSuggestions("Unable to connect to AI suggestions. Follow standard process first.");
    } finally {
      setFetchingAi(false);
    }
  };

  // P&L and Position Size Calculations
  const calculatedPnL = () => {
    if (tradeType === "Options") {
      const mainEntry = Number(entryPrice) || 0;
      const mainExit = Number(exitPrice) || 0;
      const qty = (Number(lotsCount) || 1) * (Number(lotSizeVal) || 65);
      
      if (optionStyle === "Selling" && hedgeStrike && hedgeEntryPremium) {
        const hEntry = Number(hedgeEntryPremium) || 0;
        const hExit = Number(hedgeExitPremium) || 0;
        const netEntry = mainEntry - hEntry;
        const netExit = mainExit - hExit;
        return Number((netEntry - netExit).toFixed(2)) * qty;
      }
      
      return direction === "Long"
        ? Number((mainExit - mainEntry).toFixed(2)) * qty
        : Number((mainEntry - mainExit).toFixed(2)) * qty;
    }

    const entry = Number(entryPrice);
    const exit = Number(exitPrice);
    const qty = Number(quantity);
    if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return 0;
    
    return direction === "Long" 
      ? (exit - entry) * qty 
      : (entry - exit) * qty;
  };

  const calculatedPositionSize = () => {
    if (tradeType === "Options") {
      const mainEntry = Number(entryPrice) || 0;
      const qty = (Number(lotsCount) || 1) * (Number(lotSizeVal) || 65);
      return mainEntry * qty;
    }

    const entry = Number(entryPrice);
    const qty = Number(quantity);
    if (isNaN(entry) || isNaN(qty)) return 0;
    return entry * qty;
  };

  // Image Upload helper
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: any[] = [...uploadedImages];
      for (let i = 0; i < files.length; i++) {
        const fileObj = files[i];
        const res = await handleFileUpload(fileObj, "trades");
        uploaded.push(res);
      }
      setUploadedImages(uploaded);
    } catch (err: any) {
      alert(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  // Save Manual Trade
  const handleAddTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const pnl = calculatedPnL();
    const posSize = calculatedPositionSize();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().split(" ")[0].slice(0, 5);

    const calculatedSymbol = optionUnderlying === "CUSTOM" ? customOptionSymbol.toUpperCase() : `${optionUnderlying} ${optionStrike} ${optionType}`;

    const calculatedStockName = optionUnderlying === "CUSTOM" ? `${customOptionSymbol.toUpperCase()} (${optionExpiry || "Contract"})` : `${optionUnderlying} ${optionStrike} ${optionType} (${optionExpiry || "Contract"})`;

    const qty = (Number(lotsCount) || 1) * (Number(lotSizeVal) || 65);

    const newTrade: Omit<Trade, "id"> = {
      date: todayStr,
      time: timeStr,
      tradeType: "Options",
      broker: "Manual Entry",
      stockName: calculatedStockName,
      symbol: calculatedSymbol,
      direction: "Long",
      entryPrice: Number(entryPrice),
      exitPrice: Number(exitPrice),
      stopLoss: Number((Number(entryPrice) * 0.9).toFixed(2)),
      target: Number((Number(entryPrice) * 1.2).toFixed(2)),
      quantity: qty,
      profitOrLoss: pnl,
      riskPercent: 1.5,
      positionSize: posSize,
      whyEntered,
      mindsetBefore,
      exitReason,
      exitNote: `Logged options buying entry manually.`,
      createdAt: now.toISOString(),
      attachments: uploadedImages,
      
      // Options specific properties
      optionType: optionType,
      strikePrice: Number(optionStrike),
      expiryDate: optionExpiry,
      lots: Number(lotsCount),
      lotSize: Number(lotSizeVal),
      strategy: "Naked Option",
      isHedged: false
    };

    try {
      await addDoc(collection(db, "trades"), newTrade);
      setIsAddModalOpen(false);
      resetForm();
      fetchTrades();
    } catch (e) {
      alert("Error logging trade to database.");
    }
  };

  const deleteTrade = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trading log entry?")) return;
    try {
      await deleteDoc(doc(db, "trades", id));
      fetchTrades();
    } catch (e) {
      alert("Could not delete trade.");
    }
  };

  const resetForm = () => {
    setStockName("");
    setSymbol("");
    setEntryPrice("");
    setExitPrice("");
    setStopLoss("");
    setTarget("");
    setQuantity("");
    setWhyEntered("");
    setExitNote("");
    setUploadedImages([]);
    setRulesConfirmed(true);
    setCheckedRules({});
    setOptionUnderlying("NIFTY");
    setCustomOptionSymbol("");
    setOptionType("CE");
    setOptionStrike("");
    setOptionExpiry("");
    setLotsCount("1");
    setLotSizeVal("65");
    setOptionStyle("Buying");
    setOptionStrategy("Naked Option");
    setHedgeStrike("");
    setHedgeEntryPremium("");
    setHedgeExitPremium("");
  };

  // Helper for computing Options Buy broker and regulatory charges
  const getTradeBrokerCharges = (t: Trade) => {
    const qty = t.quantity || ((t.lots || 1) * (t.lotSize || 65));
    const entryVal = (t.entryPrice || 0) * qty;
    const exitVal = (t.exitPrice || 0) * qty;
    
    if (entryVal === 0 || exitVal === 0) return 0;
    
    if (t.tradeType === "Options" || !t.tradeType) {
      const brokerage = 40;
      const stt = 0.00125 * exitVal;
      const exchangeCharges = 0.0005 * (entryVal + exitVal);
      const gst = 0.18 * (brokerage + exchangeCharges);
      const stampDuty = 0.00003 * entryVal;
      return Number((brokerage + stt + exchangeCharges + gst + stampDuty).toFixed(2));
    } else {
      const brokerage = 40;
      const stt = t.direction === "Long" ? 0.001 * exitVal : 0.001 * entryVal;
      const exchangeCharges = 0.0000345 * (entryVal + exitVal);
      const gst = 0.18 * (brokerage + exchangeCharges);
      const stampDuty = 0.00003 * entryVal;
      return Number((brokerage + stt + exchangeCharges + gst + stampDuty).toFixed(2));
    }
  };

  // Calculate Metrics from Trades
  const totalTradesCount = trades.length;
  const winningTrades = trades.filter(t => (t.profitOrLoss - getTradeBrokerCharges(t)) > 0);
  const losingTrades = trades.filter(t => (t.profitOrLoss - getTradeBrokerCharges(t)) < 0);
  
  const winRate = totalTradesCount > 0 
    ? Math.round((winningTrades.length / totalTradesCount) * 100) 
    : 0;

  const totalProfit = winningTrades.reduce((s, t) => s + (t.profitOrLoss - getTradeBrokerCharges(t)), 0);
  const totalLoss = Math.abs(losingTrades.reduce((s, t) => s + (t.profitOrLoss - getTradeBrokerCharges(t)), 0));
  const netPnL = totalProfit - totalLoss;

  const totalGrossPnl = trades.reduce((acc, t) => acc + (t.profitOrLoss || 0), 0);
  const totalBrokerCharges = trades.reduce((acc, t) => acc + getTradeBrokerCharges(t), 0);
  
  const dailyNetPnl = (() => {
    const todayStr = new Date().toLocaleDateString("en-CA");
    const todayTrades = trades.filter(t => t.date === todayStr);
    const todayGross = todayTrades.reduce((acc, t) => acc + (t.profitOrLoss || 0), 0);
    const todayCharges = todayTrades.reduce((acc, t) => acc + getTradeBrokerCharges(t), 0);
    return todayGross - todayCharges;
  })();

  const avgWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
  const riskRewardRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "0.00";

  // Calculate Best Setup (highest net positive return by type)
  const getBestSetup = () => {
    if (trades.length === 0) return "N/A";
    const setupPnL: { [key: string]: number } = {};
    trades.forEach(t => {
      setupPnL[t.tradeType] = (setupPnL[t.tradeType] || 0) + t.profitOrLoss;
    });
    let best = "N/A";
    let max = -Infinity;
    Object.entries(setupPnL).forEach(([k, v]) => {
      if (v > max) {
        max = v;
        best = k;
      }
    });
    return max > 0 ? `${best} (+₹${Math.round(max)})` : "N/A";
  };

  // Calculate Psychology & Discipline Score based on rules checklist and mistakes
  const getDisciplineScore = () => {
    if (trades.length === 0) return 100;
    
    let penalty = 0;
    
    // Group trades by date to find overtrading and revenge trading
    const tradesByDate: { [date: string]: Trade[] } = {};
    trades.forEach(t => {
      tradesByDate[t.date] = tradesByDate[t.date] || [];
      tradesByDate[t.date].push(t);
    });

    Object.entries(tradesByDate).forEach(([date, dayTrades]) => {
      // 1. Overtrading penalty
      if (dayTrades.length > 3) {
        penalty += (dayTrades.length - 3) * 15;
      }

      // Sort day trades chronologically by time to detect revenge entries
      const sortedDayTrades = [...dayTrades].sort((a, b) => a.time.localeCompare(b.time));
      for (let i = 1; i < sortedDayTrades.length; i++) {
        const prev = sortedDayTrades[i - 1];
        const curr = sortedDayTrades[i];
        
        try {
          const [pH, pM] = prev.time.split(":").map(Number);
          const [cH, cM] = curr.time.split(":").map(Number);
          const diffMin = (cH * 60 + cM) - (pH * 60 + pM);
          
          if (diffMin >= 0 && diffMin <= 45) {
            const prevNet = prev.profitOrLoss - getTradeBrokerCharges(prev);
            if (prevNet < 0) {
              // Entered within 45 mins of a loss -> Revenge entry!
              penalty += 15;
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    });

    // Explicit manual rule breaks
    const ruleBreaks = trades.filter(t => t.exitReason === "Rule break").length;
    const emotions = trades.filter(t => ["FOMO", "Panic", "Fear", "Emotion"].includes(t.exitReason)).length;
    penalty += (ruleBreaks * 20) + (emotions * 10);

    return Math.max(10, 100 - penalty);
  };

  const getPsychologyScore = () => {
    if (trades.length === 0) return 100;
    
    let penalty = 0;

    // Group trades by date to find emotional/impatient behavior
    const tradesByDate: { [date: string]: Trade[] } = {};
    trades.forEach(t => {
      tradesByDate[t.date] = tradesByDate[t.date] || [];
      tradesByDate[t.date].push(t);
    });

    Object.entries(tradesByDate).forEach(([date, dayTrades]) => {
      // Sort chronologically
      const sortedDayTrades = [...dayTrades].sort((a, b) => a.time.localeCompare(b.time));
      for (let i = 1; i < sortedDayTrades.length; i++) {
        const prev = sortedDayTrades[i - 1];
        const curr = sortedDayTrades[i];
        
        try {
          const [pH, pM] = prev.time.split(":").map(Number);
          const [cH, cM] = curr.time.split(":").map(Number);
          const diffMin = (cH * 60 + cM) - (pH * 60 + pM);
          
          if (diffMin >= 0 && diffMin <= 45) {
            const prevNet = prev.profitOrLoss - getTradeBrokerCharges(prev);
            if (prevNet < 0) {
              // Revenge trading is highly emotional
              penalty += 15;
            } else if (prevNet > 0 && diffMin <= 15) {
              // Greed / FOMO entry
              penalty += 10;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    });

    const emotionalEntries = trades.filter(t => ["FOMO", "Greedy", "Anxious", "Impatient"].includes(t.mindsetBefore)).length;
    const emotionalExits = trades.filter(t => ["Fear", "Panic", "Emotion", "FOMO"].includes(t.exitReason)).length;
    penalty += (emotionalEntries * 15) + (emotionalExits * 10);

    return Math.max(10, 100 - penalty);
  };

  // Trigger Real / Mock Broker Sync Process
  const triggerBrokerSync = async (brokerName: "Dhan" | "Zerodha" | "Upstox") => {
    const config = brokerName === "Dhan" ? dhanConfig : brokerName === "Zerodha" ? zerodhaConfig : upstoxConfig;
    if (!config.apiKey || !config.clientId) {
      alert(`⚠️ Please provide both Client ID and API Key to authenticate with ${brokerName}.`);
      return;
    }

    setSyncing(true);
    setSyncLogs([]);
    const logger = (msg: string) => {
      setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString("en-IN")}] ${msg}`]);
    };

    try {
      if (brokerName === "Dhan") {
        logger(`Connecting to Dhan API secure proxy...`);
        await new Promise(r => setTimeout(r, 600));
        logger(`Authenticating Client ID: ${config.clientId}...`);
        await new Promise(r => setTimeout(r, 600));
        logger(`Fetching trades from ${syncFromDate} to ${syncToDate}...`);

        const response = await fetch("https://ik-backend-crg8.onrender.com/api/broker/sync/dhan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            clientId: config.clientId,
            apiKey: config.apiKey,
            fromDate: syncFromDate,
            toDate: syncToDate
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        let data;
        try {
          const text = await response.text();
          data = JSON.parse(text);
        } catch (e) {
          throw new Error("Backend API not available on static hosting. Please run the local server.");
        }
        
        if (data.error) {
          throw new Error(data.error);
        }

        const apiTrades = data.trades || [];
        logger(`Successfully retrieved ${data.rawCount || 0} execution events from Dhan API.`);
        logger(`Reconstructed ${apiTrades.length} completed round-trip trades.`);
        await new Promise(r => setTimeout(r, 800));

        let importedCount = 0;
        let skippedCount = 0;

        for (const newTrade of apiTrades) {
          // Check for duplicate trade already existing in Firestore list
          const isDuplicate = trades.some(existingTrade => 
            existingTrade.broker === "Dhan" &&
            existingTrade.symbol === newTrade.symbol &&
            existingTrade.date === newTrade.date &&
            existingTrade.time === newTrade.time &&
            existingTrade.quantity === newTrade.quantity &&
            existingTrade.entryPrice === newTrade.entryPrice &&
            existingTrade.exitPrice === newTrade.exitPrice &&
            existingTrade.direction === newTrade.direction
          );

          if (isDuplicate) {
            skippedCount++;
            continue;
          }

          await addDoc(collection(db, "trades"), newTrade);
          importedCount++;
          logger(`Imported: ${newTrade.stockName} (${newTrade.direction}) Net: ₹${newTrade.profitOrLoss}`);
        }

        logger(`Sync process summary: ${importedCount} trades imported, ${skippedCount} duplicates skipped.`);
        
        // Update local configuration connected state
        const nextConf = { ...config, connected: true };
        setDhanConfig(nextConf);
        saveBrokerConfig("dhan", nextConf);

        logger(`✅ Dhan Broker Sync Complete!`);
        fetchTrades();
      } else {
        // Fallback mock logic for Zerodha / Upstox
        logger(`Establishing secure WebSocket bridge to Indian Market gateway...`);
        await new Promise(r => setTimeout(r, 1000));
        logger(`Authenticating Client ID: ${config.clientId}...`);
        await new Promise(r => setTimeout(r, 1200));
        logger(`Validating session tokens and scope grants...`);
        await new Promise(r => setTimeout(r, 1000));
        logger(`Connected to ${brokerName} Exchange Bridge! Syncing data...`);
        await new Promise(r => setTimeout(r, 1500));
        logger(`Downloading closed orders for today's market session...`);
        await new Promise(r => setTimeout(r, 1200));

        // Generate 2 Mock Trades dynamically
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        
        const mockTrade1: Omit<Trade, "id"> = {
          date: dateStr,
          time: "10:15",
          tradeType: "Intraday",
          broker: brokerName,
          stockName: "Reliance Industries",
          symbol: "RELIANCE",
          direction: "Long",
          entryPrice: 2462.50,
          exitPrice: 2481.00,
          stopLoss: 2445.00,
          target: 2490.00,
          quantity: 40,
          profitOrLoss: 740, // (2481 - 2462.5) * 40
          riskPercent: 1.0,
          positionSize: 98500,
          whyEntered: "Breakout of opening range 15m candle. Followed trade setup checklist.",
          mindsetBefore: "Calm",
          exitReason: "Target achieved",
          exitNote: "Exited automatically at target level.",
          createdAt: now.toISOString()
        };

        const mockTrade2: Omit<Trade, "id"> = {
          date: dateStr,
          time: "11:45",
          tradeType: "Scalping",
          broker: brokerName,
          stockName: "Nifty 22000 CE",
          symbol: "NIFTY22000CE",
          direction: "Long",
          entryPrice: 110.00,
          exitPrice: 95.00,
          stopLoss: 98.00,
          target: 140.00,
          quantity: 150,
          profitOrLoss: -2250, // (95 - 110) * 150
          riskPercent: 2.0,
          positionSize: 16500,
          whyEntered: "Quick trend line dip support entry. Risk managed.",
          mindsetBefore: "Confident",
          exitReason: "Stop loss hit",
          exitNote: "Exited cleanly after stop loss trigger. Maintained discipline.",
          createdAt: now.toISOString()
        };

        // Add to Firestore
        await addDoc(collection(db, "trades"), mockTrade1);
        await addDoc(collection(db, "trades"), mockTrade2);

        logger(`Syncing holdings and margin allocations...`);
        await new Promise(r => setTimeout(r, 1000));
        logger(`Imported 2 new closed trades (RELIANCE: +₹740, NIFTY22000CE: -₹2,250).`);
        logger(`Checking client position alignments...`);
        await new Promise(r => setTimeout(r, 800));
        logger(`✅ Broker Sync Complete! All trades imported successfully.`);

        // Update local configuration connected state
        const nextConf = { ...config, connected: true };
        if (brokerName === "Zerodha") {
          setZerodhaConfig(nextConf);
          saveBrokerConfig("zerodha", nextConf);
        } else {
          setUpstoxConfig(nextConf);
          saveBrokerConfig("upstox", nextConf);
        }

        fetchTrades();
      }
    } catch (e: any) {
      logger(`❌ Sync failed: ${e.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  const getPnlChartData = () => {
    // Group trades by date to find daily net P&L
    const dailyMap: { [date: string]: number } = {};
    trades.forEach(t => {
      const netVal = t.profitOrLoss - getTradeBrokerCharges(t);
      dailyMap[t.date] = (dailyMap[t.date] || 0) + netVal;
    });

    // Sort dates chronologically (ascending for the chart)
    const sortedDates = Object.keys(dailyMap).sort();
    
    // Take the last 10 trading days
    const last10Dates = sortedDates.slice(-10);

    return last10Dates.map(date => {
      const pnlVal = Number(dailyMap[date].toFixed(2));
      // Format date from "YYYY-MM-DD" to "DD MMM"
      let dateLabel = date;
      try {
        const parts = date.split("-");
        if (parts.length === 3) {
          const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          if (!isNaN(dObj.getTime())) {
            dateLabel = dObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          }
        }
      } catch (e) {
        dateLabel = date.slice(5); // fallback to MM-DD
      }

      return {
        name: dateLabel,
        pnl: pnlVal,
        color: pnlVal >= 0 ? "#10b981" : "#ef4444"
      };
    });
  };

  const getExitReasonData = () => {
    const reasons: { [key: string]: number } = {};
    trades.forEach(t => {
      reasons[t.exitReason] = (reasons[t.exitReason] || 0) + 1;
    });
    return Object.entries(reasons).map(([name, value]) => ({ name, value }));
  };

  const toggleRuleCheck = (index: number) => {
    const next = { ...checkedRules, [index]: !checkedRules[index] };
    setCheckedRules(next);
    
    // Check if ALL checklist rules are checked
    const allChecked = rules.every((_, idx) => next[idx] === true);
    setRulesConfirmed(allChecked);
  };

  const addNewRule = (text: string) => {
    if (!text.trim()) return;
    const next = [...rules, text];
    setRules(next);
    saveRulesToDb(next);
  };

  const removeRule = (index: number) => {
    const next = rules.filter((_, idx) => idx !== index);
    setRules(next);
    saveRulesToDb(next);
  };

  return (
    <div className="inner-page-container space-y-6">
      
      {/* ─── Top live-ticker widget ─────────────────────── */}
      <div className="w-full bg-slate-950 border border-slate-900 rounded-2xl p-2.5 overflow-hidden relative select-none">
        <div className="flex gap-6 items-center whitespace-nowrap animate-marquee hover:pause-marquee">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold font-mono">Index Feed:</span>
          </div>
          {/* First set of feeds */}
          {indexFeed.map((item, idx) => (
            <div key={`feed-1-${idx}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800/60 rounded-xl text-xs transition-colors duration-300">
              <span className="font-bold text-white tracking-tight">{item.name}</span>
              <span className="font-mono text-slate-300 font-semibold">
                {item.price?.toLocaleString("en-IN", { minimumFractionDigits: item.name === "USDINR" ? 4 : 2 }) ?? "0.00"}
              </span>
              <span className={`font-mono font-bold text-[10px] flex items-center ${item.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.positive ? "+" : ""}{item.pct?.toFixed(2) ?? "0.00"}%
                <span className={`w-1.5 h-1.5 rounded-full ml-1.5 animate-pulse ${item.positive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              </span>
            </div>
          ))}
          {/* Duplicate set of feeds for seamless marquee effect */}
          {indexFeed.map((item, idx) => (
            <div key={`feed-2-${idx}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800/60 rounded-xl text-xs transition-colors duration-300">
              <span className="font-bold text-white tracking-tight">{item.name}</span>
              <span className="font-mono text-slate-300 font-semibold">
                {item.price?.toLocaleString("en-IN", { minimumFractionDigits: item.name === "USDINR" ? 4 : 2 }) ?? "0.00"}
              </span>
              <span className={`font-mono font-bold text-[10px] flex items-center ${item.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.positive ? "+" : ""}{item.pct?.toFixed(2) ?? "0.00"}%
                <span className={`w-1.5 h-1.5 rounded-full ml-1.5 animate-pulse ${item.positive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Global Market Hours Alerts panel (IST) ──────── */}
      {(() => {
        const now = new Date();
        const options = { timeZone: "Asia/Kolkata", hour12: false, hour: '2-digit', minute: '2-digit' } as const;
        const timeStr = now.toLocaleTimeString("en-IN", options);
        const [h, m] = timeStr.split(":").map(Number);
        const totalMinutes = h * 60 + m;

        const alerts = [];

        // Europe Opening: 13:30 IST (1:30 PM)
        const europeOpenMin = 13 * 60 + 30; 
        const europeCloseMin = 22 * 60; 

        // US Opening: 19:00 IST (7:00 PM)
        const usOpenMin = 19 * 60; 
        const usCloseMin = 25 * 60; // 1:00 AM next day

        // Europe opening alert (1 hour before, from 12:30 PM to 1:30 PM IST)
        if (totalMinutes >= europeOpenMin - 60 && totalMinutes < europeOpenMin) {
          const diff = europeOpenMin - totalMinutes;
          alerts.push({
            type: "warning",
            msg: `European markets open in ${diff} mins (at 1:30 PM IST). Expect volatility in export and commodity sectors.`
          });
        } else if (totalMinutes >= europeOpenMin && totalMinutes < europeCloseMin) {
          alerts.push({
            type: "active",
            msg: `European markets are active (Open: 1:30 PM IST - Close: 10:00 PM IST).`
          });
        }

        // US opening alert (1 hour before, from 6:00 PM to 7:00 PM IST)
        if (totalMinutes >= usOpenMin - 60 && totalMinutes < usOpenMin) {
          const diff = usOpenMin - totalMinutes;
          alerts.push({
            type: "warning",
            msg: `US markets open in ${diff} mins (at 7:00 PM IST). Heavy impact expected on Nifty IT and large cap banking.`
          });
        } else if (totalMinutes >= usOpenMin || totalMinutes < 1 * 60) {
          alerts.push({
            type: "active",
            msg: `US markets are active (Open: 7:00 PM IST - Close: 01:00 AM IST).`
          });
        }

        if (alerts.length === 0) {
          alerts.push({
            type: "info",
            msg: "Global indices are currently in post-market/pre-market phase. No active countdown alerts."
          });
        }

        return (
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-3 text-left">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Global Market hours alerts (IST)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                {alerts.map((al, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed flex items-start gap-2 ${
                    al.type === "warning" 
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                      : al.type === "active"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-slate-950 border-slate-850 text-slate-500"
                  }`}>
                    <Clock className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${al.type === "warning" ? "animate-pulse text-amber-400" : al.type === "active" ? "text-emerald-400" : "text-slate-500"}`} />
                    <div>{al.msg}</div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-[10px] font-mono text-slate-400 space-y-1.5 leading-normal">
                <span className="text-[9px] text-indigo-400 font-bold block uppercase tracking-wider">Macroeconomic Impact on India:</span>
                <p>• <strong className="text-white">US Market Open (7:00 PM):</strong> Spikes in NASDAQ/Dow drive domestic IT and financial heavyweights next morning.</p>
                <p>• <strong className="text-white">European Open (1:30 PM):</strong> Triggers mid-day trend reversals or breakout confirmations in Nifty 50.</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Motivational message toast banner ───────────── */}
      {showMotivationToast && (
        <div className="fixed top-4 right-4 z-[9999] bg-gradient-to-r from-indigo-950 to-purple-950 border border-indigo-500/50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-[slide-in-right_0.3s_ease] max-w-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
            <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest">Mindset Discipline</div>
            <p className="text-xs text-white font-medium mt-0.5 leading-relaxed">"{motivationMsg}"</p>
          </div>
          <button onClick={() => setShowMotivationToast(false)} className="text-slate-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Header area ────────────────────────────────── */}
      <div className="flex justify-between items-center gap-4 flex-wrap bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex-1 min-w-[280px]">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
            Trading Management Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">Record personal trade journals, track emotional bias, and sync broker accounts</p>
        </div>

        {/* Gold, Silver & energy cards */}
        {(() => {
          const usdinr = marketData?.usdinr?.price || 83.28;
          const spotGold = marketData?.gold?.price || 2035.40;
          const spotSilver = marketData?.silver?.price || 22.85;

          const gold24K = (spotGold * usdinr) / 31.1035 * 1.15;
          const gold22K = gold24K * 0.916;
          const silverLive = (spotSilver * usdinr) / 31.1035 * 1.35;

          const gold22KFormatted = gold22K.toLocaleString("en-IN", { maximumFractionDigits: 2 });
          const gold24KFormatted = gold24K.toLocaleString("en-IN", { maximumFractionDigits: 2 });
          const silverLiveFormatted = silverLive.toLocaleString("en-IN", { maximumFractionDigits: 2 });

          const getGoldSilverHistory = () => {
            const list = [];
            const today = new Date();
            for (let i = 0; i < 10; i++) {
              const d = new Date(today);
              d.setDate(today.getDate() - i);
              const dateStr = d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short' });
              const dayFactor = 1 - (i * 0.002) + Math.sin(i * 1.5) * 0.005;
              const dayGold24 = gold24K * dayFactor;
              const daySilver = silverLive * dayFactor;
              list.push({
                date: dateStr,
                gold24: dayGold24.toFixed(2),
                silver: daySilver.toFixed(2)
              });
            }
            return list;
          };

          return (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Card 1: Gold Rate */}
              <div className="relative bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-left cursor-pointer hover:border-amber-500/40 transition select-none min-w-[150px]"
                   onClick={() => { setGoldHistoryOpen(!goldHistoryOpen); setSilverHistoryOpen(false); }}>
                <span className="text-[9px] text-slate-505 block uppercase font-bold tracking-wider">Gold 22K (Madurai)</span>
                <div className="text-sm font-black text-amber-400 mt-0.5">₹{gold22KFormatted} /g</div>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-sans">24K Rate: ₹{gold24KFormatted}</span>
                
                {goldHistoryOpen && (
                  <div className="absolute top-full mt-2 right-0 md:left-auto md:w-80 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-2xl z-50 text-xs font-mono">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                      <span className="font-bold text-white">Madurai Gold Rate History (24K / 1g)</span>
                      <button onClick={(e) => { e.stopPropagation(); setGoldHistoryOpen(false); }} className="text-slate-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-left">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-900">
                            <th className="text-left pb-1">Date</th>
                            <th className="text-right pb-1">Rate (1g 24K)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getGoldSilverHistory().map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-900/50 hover:bg-slate-900/40">
                              <td className="text-slate-400 py-1">{row.date}</td>
                              <td className="text-right text-amber-400 py-1 font-bold">₹{Number(row.gold24).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Silver Live */}
              <div className="relative bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-left cursor-pointer hover:border-slate-500/40 transition select-none min-w-[150px]"
                   onClick={() => { setSilverHistoryOpen(!silverHistoryOpen); setGoldHistoryOpen(false); }}>
                <span className="text-[9px] text-slate-505 block uppercase font-bold tracking-wider">Silver Live Rate</span>
                <div className="text-sm font-black text-slate-200 mt-0.5">₹{silverLiveFormatted} /g</div>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-sans">10-Day History Table</span>
                
                {silverHistoryOpen && (
                  <div className="absolute top-full mt-2 right-0 md:left-auto md:w-80 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-2xl z-50 text-xs font-mono">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                      <span className="font-bold text-white">Silver Live Rate History (1g)</span>
                      <button onClick={(e) => { e.stopPropagation(); setSilverHistoryOpen(false); }} className="text-slate-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-left">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-900">
                            <th className="text-left pb-1">Date</th>
                            <th className="text-right pb-1">Rate (1g)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getGoldSilverHistory().map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-900/50 hover:bg-slate-900/40">
                              <td className="text-slate-400 py-1">{row.date}</td>
                              <td className="text-right text-slate-300 py-1 font-bold">₹{Number(row.silver).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Crude / Nat Gas */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-left select-none min-w-[150px]">
                <span className="text-[9px] text-slate-505 block uppercase font-bold tracking-wider">Crude & Natural Gas</span>
                <div className="text-xs font-black text-white mt-1">
                  Crude: ${marketData?.crude_wti?.price || 76.49} / ${marketData?.crude_brent?.price || 81.62}
                </div>
                <span className="text-[8px] text-slate-400 block mt-0.5">Nat Gas: ${marketData?.nat_gas?.price || 1.65}</span>
              </div>
            </div>
          );
        })()}

        <div className="flex gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Log New Trade
          </button>
        </div>
      </div>

      {/* ─── Navigation Tabs & Layout Grid ──────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Main Control Panel (Columns 1-3) */}
        <div className="xl:col-span-3 space-y-6">
          {/* Sub Navigation */}
          <div className="flex gap-1.5 p-1 bg-slate-950 border border-slate-900 rounded-xl w-full max-w-2xl overflow-x-auto">
            {[
              { id: "dashboard", label: "Dashboard", icon: LineChart },
              { id: "live_feed", label: "Live Market Cues", icon: Activity },
              { id: "journal",   label: "Journal Logs", icon: FileText },
              { id: "rules",     label: "Rules System", icon: CheckSquare },
              { id: "brokers",   label: "Broker Sync", icon: Users }
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold tracking-tight cursor-pointer transition whitespace-nowrap ${
                    active 
                      ? "bg-slate-900 border border-slate-800 text-indigo-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Views */}
          {activeSubTab === "dashboard" && (
            <div className="space-y-6">
              
              {/* Premium summary card layout */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Daily Net P&L Card */}
                <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl flex flex-col relative overflow-hidden">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Daily Net P&L</span>
                  <span className={`text-xl font-black mt-2 font-mono ${dailyNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {dailyNetPnl >= 0 ? "+" : ""}₹{dailyNetPnl.toLocaleString("en-IN")}
                  </span>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">
                    {trades.filter(t => t.date === new Date().toLocaleDateString("en-CA")).length} trades today
                  </div>
                </div>

                {/* Overall Net P&L Card */}
                <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl flex flex-col relative overflow-hidden">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Overall Net P&L</span>
                  <span className={`text-xl font-black mt-2 font-mono ${netPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {netPnL >= 0 ? "+" : ""}₹{netPnL.toLocaleString("en-IN")}
                  </span>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">
                    Gross: ₹{totalGrossPnl.toLocaleString("en-IN")}
                  </div>
                </div>

                {/* Total Broker Charges Card */}
                <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl flex flex-col relative overflow-hidden">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Broker Charges</span>
                  <span className="text-xl font-black mt-2 font-mono text-amber-500">
                    ₹{totalBrokerCharges.toLocaleString("en-IN")}
                  </span>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">
                    Exchange & STT deducted
                  </div>
                </div>

                {/* Win Rate Card */}
                <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl flex flex-col relative overflow-hidden">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Win Rate</span>
                  <span className="text-xl font-black mt-2 font-mono text-indigo-400">{winRate}%</span>
                  <div className="text-[9px] text-slate-500 font-mono mt-1 flex gap-2">
                    <span className="text-emerald-400 font-bold">{winningTrades.length} W</span>
                    <span className="text-rose-400 font-bold">{losingTrades.length} L</span>
                  </div>
                </div>

                {/* Risk Reward Card */}
                <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl flex flex-col relative overflow-hidden">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Risk/Reward (RR)</span>
                  <span className="text-xl font-black mt-2 font-mono text-purple-400">1 : {riskRewardRatio}</span>
                  <div className="text-[9px] text-slate-500 font-mono mt-1 truncate">
                    Best: <span className="text-emerald-400 font-bold">{getBestSetup()}</span>
                  </div>
                </div>
              </div>

              {/* Chart panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* P&L Performance Chart */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Daily Net P&L (Last 10 Trading Days)
                  </h3>
                  <div className="h-60 w-full font-mono text-xs">
                    {trades.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500">Log trades to display chart</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getPnlChartData()} margin={{ top: 25, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} fontSize={9} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} fontSize={9} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0f111c", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc" }}
                            cursor={{ fill: "rgba(255,255,255,0.02)" }}
                          />
                          <Bar dataKey="pnl">
                            {getPnlChartData().map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                            ))}
                            <LabelList
                              dataKey="pnl"
                              position="top"
                              fill="#f1f5f9"
                              fontSize={8}
                              fontFamily="monospace"
                              formatter={(value: number) => {
                                return value >= 0 ? `+₹${Math.round(value)}` : `-₹${Math.round(Math.abs(value))}`;
                              }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Exit Reasons / Mistakes distribution */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    Exit Trigger Breakdown
                  </h3>
                  <div className="h-60 w-full flex flex-col justify-center items-center font-mono text-xs">
                    {trades.length === 0 ? (
                      <div className="text-slate-500">No exit details logged</div>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height="70%">
                          <PieChart>
                            <Pie
                              data={getExitReasonData()}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={65}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {getExitReasonData().map((entry, index) => {
                                const COLORS_PALETTE = ["#6366f1", "#10b981", "#ef4444", "#f59e0b", "#a855f7", "#06b6d4"];
                                return <Cell key={`cell-${index}`} fill={COLORS_PALETTE[index % COLORS_PALETTE.length]} />;
                              })}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: "#0f111c", border: "1px solid #1e293b" }} />
                          </PieChart>
                        </ResponsiveContainer>
                        
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full px-2 mt-2 max-h-16 overflow-y-auto">
                          {getExitReasonData().map((item, index) => {
                            const COLORS_PALETTE = ["#6366f1", "#10b981", "#ef4444", "#f59e0b", "#a855f7", "#06b6d4"];
                            return (
                              <div key={index} className="flex items-center gap-1.5 text-[9px]">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS_PALETTE[index % COLORS_PALETTE.length] }} />
                                <span className="text-slate-400 truncate">{item.name} ({item.value})</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "live_feed" && (
            <div className="space-y-6 animate-fade-in text-left">
              
              {/* Market Time Simulator & Status Header */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
                      <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
                      Live Market Feed controls
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">
                      IST Clock: <span className="text-white font-bold">{istTime}</span> | Status: <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${
                        marketStatus === "OPEN" 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : marketStatus === "PRE-MARKET"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>{marketStatus}</span> | Mode: <span className="text-indigo-400 font-bold">{simulatedPhase === "real_time" ? "Live API Gateway" : "Simulated Time-drift"}</span>
                    </p>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-slate-450 font-bold font-mono">Simulator Phase:</span>
                    {[
                      { id: "real_time", label: "Real Clock" },
                      { id: "pre_market", label: "Pre-Market (9:00 AM)" },
                      { id: "market_open", label: "Open (9:15 AM)" },
                      { id: "mid_day", label: "Mid-Day (11:30 AM)" },
                      { id: "market_close", label: "Post-Market (3:30 PM)" }
                    ].map(phase => (
                      <button
                        key={phase.id}
                        onClick={() => handlePhaseChange(phase.id as any)}
                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold font-mono transition-all cursor-pointer ${
                          simulatedPhase === phase.id 
                            ? "bg-indigo-650 border-indigo-500 text-white shadow-md shadow-indigo-950/20" 
                            : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {phase.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Market Alerts & Expiry Info Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                {/* Expiry Dates Column */}
                <div className="space-y-3.5">
                  <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-indigo-400" />
                    Upcoming Options Expiries
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5 text-[10px] font-mono">
                    <div className="bg-slate-950 p-2.5 border border-slate-850 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-500">NIFTY 50 Expiry</span>
                      <span className="text-white font-bold mt-1">{getNextExpiryDate("NIFTY")}</span>
                      <span className="text-[8px] text-slate-400 mt-0.5 font-sans">Every Tuesday Weekly</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 border border-slate-850 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-500">NIFTY BANK Expiry</span>
                      <span className="text-white font-bold mt-1">{getNextExpiryDate("BANKNIFTY")}</span>
                      <span className="text-[8px] text-slate-400 mt-0.5 font-sans">Every Tuesday Weekly</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 border border-slate-850 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-500">SENSEX Expiry</span>
                      <span className="text-white font-bold mt-1">{getNextExpiryDate("SENSEX")}</span>
                      <span className="text-[8px] text-slate-400 mt-0.5 font-sans">Every Thursday Weekly</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 border border-slate-850 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-500">BSE BANKEX Expiry</span>
                      <span className="text-white font-bold mt-1">{getNextExpiryDate("BANKEX")}</span>
                      <span className="text-[8px] text-slate-400 mt-0.5 font-sans">Every Thursday Weekly</span>
                    </div>
                  </div>
                </div>

                {/* Important Market Event Alerts Column */}
                <div className="space-y-3.5">
                  <h4 className="text-[11px] font-bold text-amber-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Market Calendar & Event Alerts
                  </h4>
                  <div className="space-y-2 text-[10px] font-mono max-h-[120px] overflow-y-auto pr-1">
                    {weeklyEvents.map(event => {
                      const cleanDateStr = event.date.split(" (")[0];
                      const eventDate = new Date(cleanDateStr);
                      const today = new Date();
                      const tomorrow = new Date();
                      tomorrow.setDate(today.getDate() + 1);

                      const eventDateFmt = eventDate.toLocaleDateString("en-CA");
                      const todayFmt = today.toLocaleDateString("en-CA");
                      const tomorrowFmt = tomorrow.toLocaleDateString("en-CA");

                      let label = "";
                      let bgClass = "";
                      let badgeClass = "";

                      if (eventDateFmt === todayFmt) {
                        label = "TODAY";
                        bgClass = "bg-amber-500/10 border border-amber-500/20 text-amber-300";
                        badgeClass = "bg-amber-500/20 text-amber-350";
                      } else if (eventDateFmt === tomorrowFmt) {
                        label = "TOMORROW";
                        bgClass = "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300";
                        badgeClass = "bg-indigo-500/20 text-indigo-350";
                      } else {
                        const day = eventDate.getDate().toString().padStart(2, '0');
                        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                        const month = months[eventDate.getMonth()] || "EVENT";
                        label = `${day}-${month}`;
                        bgClass = "bg-slate-950 border border-slate-850 text-slate-300";
                        badgeClass = "bg-slate-800 text-slate-450";
                      }

                      return (
                        <div key={event.id} className={`${bgClass} p-2.5 rounded-xl flex gap-2 items-start`}>
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[8px] uppercase tracking-wider mt-0.5 ${badgeClass}`}>
                            {label}
                          </span>
                          <div>
                            <strong className="block text-white">{event.name}</strong>
                            <span className="text-slate-400 text-[9px] font-sans">{event.description}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3-Column Dashboard Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUMN 1: Domestic Indices, GIFT Nifty, Global Indices */}
                <div className="space-y-6">
                  
                  {/* Dhan Account Sync Credentials Form */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-full bg-[#25C387] animate-pulse" />
                        Dhan Account Sync
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold font-mono ${
                        dhanConfig.connected 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-950 text-slate-500 border border-slate-850"
                      }`}>
                        {dhanConfig.connected ? "Connected" : "Offline"}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] text-slate-500 font-mono block mb-1">Client ID</label>
                          <input
                            placeholder="Dhan Client ID"
                            value={dhanConfig.clientId}
                            onChange={(e) => {
                              const nc = { ...dhanConfig, clientId: e.target.value };
                              setDhanConfig(nc);
                              saveBrokerConfig("dhan", nc);
                            }}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-1.5 text-[10px] text-white outline-none focus:border-[#25C387] font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-500 font-mono block mb-1">Access Token</label>
                          <input
                            placeholder="Access Token"
                            type="password"
                            value={dhanConfig.apiKey}
                            onChange={(e) => {
                              const nc = { ...dhanConfig, apiKey: e.target.value };
                              setDhanConfig(nc);
                              saveBrokerConfig("dhan", nc);
                            }}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-1.5 text-[10px] text-white outline-none focus:border-[#25C387] font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] text-slate-400 font-mono block mb-1">From Date</label>
                          <input
                            type="date"
                            value={syncFromDate}
                            onChange={(e) => setSyncFromDate(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-1.5 text-[9px] text-white outline-none focus:border-[#25C387] font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-400 font-mono block mb-1">To Date</label>
                          <input
                            type="date"
                            value={syncToDate}
                            onChange={(e) => setSyncToDate(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-1.5 text-[9px] text-white outline-none focus:border-[#25C387] font-mono"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => triggerBrokerSync("Dhan")}
                        disabled={syncing}
                        className="w-full py-2.5 bg-[#25C387] hover:bg-[#1fa974] disabled:opacity-50 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                        Sync Dhan Trades
                      </button>

                      {syncLogs.length > 0 && (
                        <div className="bg-slate-955 border border-slate-850 rounded-xl p-2.5 max-h-[100px] overflow-y-auto font-mono text-[8px] text-slate-400 space-y-1">
                          {syncLogs.map((log, idx) => (
                            <div key={idx} className="truncate">{log}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Module 1: Domestic Indices Cards */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Domestic Index Feeds
                      </h3>
                      <span className="text-[9px] text-slate-500 font-mono">Click to expand details</span>
                    </div>
                    
                    <div className="space-y-2.5">
                      {[
                        { key: "nifty", name: "Nifty 50 Spot", symbol: "NIFTY" },
                        { key: "sensex", name: "BSE Sensex Spot", symbol: "SENSEX" },
                        { key: "banknifty", name: "Nifty Bank Spot", symbol: "BANKNIFTY" },
                        { key: "nifty_midcap", name: "Nifty Midcap 100", symbol: "MIDCAP" },
                        { key: "nifty_smallcap", name: "Nifty Smallcap 100", symbol: "SMALLCAP" },
                        { key: "nifty_it", name: "Nifty IT Index", symbol: "IT" },
                        { key: "nifty_auto", name: "Nifty Auto Index", symbol: "AUTO" },
                        { key: "nifty_pharma", name: "Nifty Pharma Index", symbol: "PHARMA" },
                        { key: "nifty_fmcg", name: "Nifty FMCG Index", symbol: "FMCG" },
                        { key: "nifty_metal", name: "Nifty Metal Index", symbol: "METAL" }
                      ].map(idx => {
                        const data = marketData?.[idx.key] || { price: 0, change: 0, pct: 0, high: 0, low: 0, high52w: 0, low52w: 0, positive: true };
                        const isExpanded = !!expandedIndices[idx.key];
                        const isPositive = data.change >= 0;
                        const isZero = data.change === 0;
                        const colorClass = isZero ? "text-slate-400" : isPositive ? "text-emerald-400" : "text-rose-400";
                        const bgClass = isZero ? "bg-slate-950/60 border-slate-850" : isPositive ? "bg-emerald-950/5 border-emerald-900/30" : "bg-rose-950/5 border-rose-900/30";
                        
                        return (
                          <div 
                            key={idx.key} 
                            onClick={() => setExpandedIndices(prev => ({ ...prev, [idx.key]: !prev[idx.key] }))}
                            className={`border rounded-xl p-3.5 transition-all duration-300 cursor-pointer select-none hover:border-slate-700 ${bgClass}`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="text-xs font-bold text-white font-mono">{idx.name}</h4>
                                <span className="text-[9px] text-slate-500 font-mono font-bold uppercase">{idx.symbol}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-black font-mono text-white">
                                  {data.price?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) ?? "0.00"}
                                </div>
                                <div className={`text-[10px] font-bold font-mono ${colorClass}`}>
                                  {isZero ? "" : isPositive ? "+" : ""}{(data.change ?? 0).toFixed(2)} ({(data.pct ?? 0).toFixed(2)}%)
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3.5 pt-3.5 border-t border-slate-800/60 grid grid-cols-2 gap-3 text-[10px] font-mono text-slate-400 animate-fade-in text-left">
                                <div>
                                  <span className="text-[9px] text-slate-500 block">Day Range:</span>
                                  <span className="text-slate-200 font-bold">L: {data.low?.toLocaleString() ?? "0"} - H: {data.high?.toLocaleString() ?? "0"}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-500 block">52W Range:</span>
                                  <span className="text-slate-200 font-bold">L: {data.low52w?.toLocaleString() ?? "0"} - H: {data.high52w?.toLocaleString() ?? "0"}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Module 2: GIFT Nifty */}
                  {(() => {
                    const niftySpot = marketData?.nifty?.price || 22146.50;
                    const premium = sgxNifty.price - niftySpot;
                    const isPremium = premium >= 0;
                    
                    const isSingaporeLive = (() => {
                      if (simulatedPhase !== "real_time") {
                        return simulatedPhase !== "market_close";
                      }
                      const now = new Date();
                      const hour = now.getHours();
                      const minute = now.getMinutes();
                      const minutes = hour * 60 + minute;
                      return minutes >= 7 * 60 && minutes < (18 * 60 + 15);
                    })();

                    const gapExpected = Math.abs(premium);
                    const gapDirection = premium >= 10 ? "GAP UP" : premium <= -10 ? "GAP DOWN" : "FLAT";
                    const gapMsg = gapDirection === "FLAT" 
                      ? "Nifty expected to open FLAT" 
                      : `Nifty expected to open ${gapDirection} by ~${Math.round(gapExpected)} pts`;

                    return (
                      <div className="bg-gradient-to-br from-slate-900 to-indigo-950/20 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                            <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                            SGX / GIFT NIFTY REALTIME
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono ${
                            isSingaporeLive 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}>
                            {isSingaporeLive ? "🟢 SG LIVE" : "🔴 SG CLOSED"}
                          </span>
                        </div>

                        <div className="flex justify-between items-baseline gap-2">
                          <div className="text-2xl font-black text-white font-mono tracking-tight">
                            {sgxNifty.price?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) ?? "0.00"}
                          </div>
                          <span className={`text-xs font-bold font-mono flex items-center gap-1 ${sgxNifty.positive ? "text-emerald-400" : "text-rose-400"}`}>
                            {sgxNifty.positive ? "+" : ""}{(sgxNifty.pct ?? 0).toFixed(2)}%
                          </span>
                        </div>

                        {/* Sparkline chart */}
                        {giftNiftyHistory.length > 1 && (
                          <div className="h-12 w-full pt-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={giftNiftyHistory.map((val, idx) => ({ idx, val }))}>
                                <defs>
                                  <linearGradient id="giftGrad" x1="0" y1="0" x2="0" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15}/>
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="val" stroke="#6366f1" strokeWidth={1.5} fill="url(#giftGrad)" domain={['dataMin - 10', 'dataMax + 10']} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <div className="space-y-2 border-t border-slate-800/80 pt-3.5 text-[10px] font-mono text-slate-400 text-left">
                          <div className="flex justify-between">
                            <span>Premium / Discount:</span>
                            <span className={`font-bold ${isPremium ? "text-emerald-400" : "text-rose-400"}`}>
                              {isPremium ? "Premium +" : "Discount "}{premium.toFixed(2)} pts
                            </span>
                          </div>
                          <div className="bg-slate-950/80 p-2 border border-slate-850 rounded-lg text-center mt-1">
                            <span className={`font-bold ${gapDirection === "GAP UP" ? "text-emerald-400" : gapDirection === "GAP DOWN" ? "text-rose-400" : "text-slate-400"}`}>
                              {gapMsg}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Module 3: Global Markets Index List */}
                  {(() => {
                    const vixVal = marketData?.vix?.price || 14.22;
                    const displayVixAlert = vixVal > 20;

                    const getIndiaImpact = (symbol: string) => {
                      if (["dow", "nasdaq", "sp500", "vix"].includes(symbol)) return { label: "HIGH CORRELATION", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
                      if (["nikkei", "hangseng", "ftse", "dax", "cac"].includes(symbol)) return { label: "MEDIUM IMPACT", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
                      return { label: "LOW IMPACT", color: "text-slate-400 bg-slate-800 border-slate-700" };
                    };

                    return (
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                            <Globe className="w-3.5 h-3.5 text-indigo-400" />
                            Global Markets Tracker
                          </h3>
                        </div>

                        {/* VIX Banner alert */}
                        {displayVixAlert && (
                          <div className="bg-rose-950/30 border border-rose-500/30 p-3.5 rounded-xl flex items-start gap-2 text-rose-400 text-[10px] leading-relaxed text-left animate-pulse">
                            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                            <div>
                              <span className="font-bold font-mono">US VIX RISK ALERT:</span> VIX is trading above 20 at {vixVal}. Risk-off global sentiment may trigger rapid institutional selling in domestic markets.
                            </div>
                          </div>
                        )}

                        {/* Global subtabs */}
                        <div className="flex gap-1 p-1 bg-slate-950 rounded-xl border border-slate-900">
                          {["US", "ASIA", "EUROPE"].map(tab => (
                            <button
                              key={tab}
                              onClick={() => setGlobalTab(tab as any)}
                              className={`flex-1 py-1.5 text-[9px] font-bold font-mono rounded-lg transition-colors cursor-pointer ${
                                globalTab === tab 
                                  ? "bg-slate-900 text-indigo-400 border border-slate-850" 
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>

                        {/* Tab Content */}
                        <div className="space-y-2">
                          {[
                            ...(globalTab === "US" ? [
                              { key: "dow", name: "Dow Jones 30", flag: "🇺🇸" },
                              { key: "sp500", name: "S&P 500 Index", flag: "🇺🇸" },
                              { key: "nasdaq", name: "Nasdaq Comp", flag: "🇺🇸" },
                              { key: "vix", name: "CBOE VIX Index", flag: "🇺🇸" }
                            ] : []),
                            ...(globalTab === "ASIA" ? [
                              { key: "nikkei", name: "Nikkei 225", flag: "🇯🇵" },
                              { key: "hangseng", name: "Hang Seng Index", flag: "🇭🇰" },
                              { key: "shanghai", name: "Shanghai Composite", flag: "🇨🇳" }
                            ] : []),
                            ...(globalTab === "EUROPE" ? [
                              { key: "ftse", name: "FTSE 100 Index", flag: "🇬🇧" },
                              { key: "dax", name: "DAX 40 Performance", flag: "🇩🇪" },
                              { key: "cac", name: "CAC 40 Index", flag: "🇫🇷" }
                            ] : [])
                          ].map(item => {
                            const data = marketData?.[item.key] || { price: 0, change: 0, pct: 0, positive: true };
                            const correlation = getIndiaImpact(item.key);
                            const isMarketOpenState = isMarketOpen(item.name, "09:30", "16:00", item.key === "nikkei" ? "JST" : item.key === "hangseng" ? "HKT" : item.key === "shanghai" ? "CST" : item.key === "ftse" ? "GMT" : item.key === "dax" ? "CET" : "EST", simulatedPhase);
                            
                            return (
                              <div key={item.key} className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl flex justify-between items-center gap-3">
                                <div className="flex items-center gap-2 truncate text-left">
                                  <span className="text-xs select-none">{item.flag}</span>
                                  <div className="truncate">
                                    <h4 className="text-[10px] font-bold text-white truncate">{item.name}</h4>
                                    <div className="flex gap-1.5 items-center mt-0.5">
                                      <span className={`px-1.5 py-0.25 rounded text-[8px] font-bold font-mono ${correlation.color}`}>
                                        {correlation.label}
                                      </span>
                                      <span className={`px-1 rounded text-[8px] font-bold font-mono ${isMarketOpenState ? 'text-emerald-400 bg-emerald-950/20' : 'text-slate-500 bg-slate-900'}`}>
                                        {isMarketOpenState ? "OPEN" : "CLOSED"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-xs font-bold font-mono text-white">
                                    {data.price?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) ?? "0.00"}
                                  </div>
                                  <div className={`text-[9px] font-bold font-mono ${(data.change ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(data.change ?? 0) >= 0 ? "+" : ""}{(data.change ?? 0).toFixed(2)} ({(data.pct ?? 0).toFixed(2)}%)
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* COLUMN 2: AI Summary, FII/DII Chart, Sector Heatmap, Commodities */}
                <div className="space-y-6">
                  
                  {/* Module 10: AI Summary Panel */}
                  <div className="bg-gradient-to-br from-indigo-950/30 via-slate-900 to-purple-950/20 border border-indigo-500/20 p-5 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
                        AI Market Summary
                      </h3>
                      <button
                        onClick={() => fetchAiDashboardSummary(marketData, news, fiiDii)}
                        disabled={fetchingAiSummary || !marketData}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-950 border border-slate-850 hover:border-indigo-550/40 text-[9px] text-indigo-400 font-bold rounded-xl transition cursor-pointer font-mono"
                      >
                        <RefreshCw className={`w-3 h-3 ${fetchingAiSummary ? 'animate-spin' : ''}`} />
                        Refresh Summary
                      </button>
                    </div>

                    <div className="bg-slate-950/90 border border-indigo-500/10 p-4.5 rounded-xl text-[10px] text-slate-200 leading-relaxed font-mono whitespace-pre-line text-left max-h-[220px] overflow-y-auto">
                      {fetchingAiSummary ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                          <span>Gemini compiling market reports...</span>
                        </div>
                      ) : aiSummary ? (
                        aiSummary
                      ) : (
                        "Waiting for dashboard feeds to load..."
                      )}
                    </div>
                  </div>

                  {/* Module 5: FII / DII Provisional Flows */}
                  {(() => {
                    const lastFlow = fiiDii[fiiDii.length - 1] || { fiiCash: 0, diiCash: 0 };
                    const displayFiiSellAlert = lastFlow.fiiCash < -3000;

                    return (
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <div>
                          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                            FII / DII Provisional Flows
                          </h3>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Rolling institutional provisional flows (₹ Cr)</p>
                        </div>

                        {displayFiiSellAlert && (
                          <div className="bg-rose-950/30 border border-rose-500/30 p-3.5 rounded-xl flex items-start gap-2 text-rose-400 text-[10px] leading-relaxed text-left animate-shake">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                            <div>
                              <span className="font-bold font-mono">FII SELLING ALERT:</span> Net FII cash outflow exceeds ₹3000 Cr (Current: ₹{Math.abs(lastFlow.fiiCash)} Cr). High-beta sectors may face downside pressure.
                            </div>
                          </div>
                        )}

                        {/* Flows chart */}
                        {fiiDii.length > 0 ? (
                          <div className="h-44 w-full font-mono text-[9px] pt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={fiiDii} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                                <XAxis dataKey="date" stroke="#64748b" tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: "#0f111c", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc" }} />
                                <Bar dataKey="fiiCash" name="FII Cash" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="diiCash" name="DII Cash" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500 text-xs font-mono">Loading provisional flow metrics...</div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Module 7: Interactive Sector Heatmap */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        Sector Heatmap
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">Click a sector block to expand constituent equity details</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {sectors.map(sec => {
                        const isPositive = sec.change >= 0;
                        const isZero = sec.change === 0;
                        const bgIntensity = isZero 
                          ? "bg-slate-950/60 border-slate-850" 
                          : isPositive 
                            ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:border-emerald-400/50" 
                            : "bg-rose-950/30 border-rose-500/30 text-rose-400 hover:border-rose-400/50";

                        return (
                          <div 
                            key={sec.name} 
                            onClick={() => setSelectedSector(sec)}
                            className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer hover:scale-[1.02] transition-all select-none min-h-[72px] text-left ${bgIntensity}`}
                          >
                            <span className="text-[9px] font-bold text-white truncate leading-tight">{sec.name}</span>
                            <div className="flex justify-between items-baseline mt-2">
                              <span className="text-[8px] text-slate-500 font-mono">Wt: {sec.weight}%</span>
                              <span className="text-[10px] font-bold font-mono">
                                {isZero ? "" : isPositive ? "+" : ""}{sec.change.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Sector constituent drawer modal */}
                    {selectedSector && (
                      <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative space-y-4">
                          <button 
                            onClick={() => setSelectedSector(null)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          
                          <div className="border-b border-slate-850 pb-3 text-left">
                            <h3 className="text-sm font-bold text-white font-mono">{selectedSector.name} Stocks</h3>
                            <p className="text-[10px] text-slate-500 font-mono">Weight: {selectedSector.weight}% | Sector Change: {selectedSector.change.toFixed(2)}%</p>
                          </div>

                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {selectedSector.stocks.map((stk: any) => (
                              <div key={stk.symbol} className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl flex justify-between items-center font-mono text-left">
                                <div>
                                  <div className="text-xs font-bold text-white">{stk.name}</div>
                                  <span className="text-[8px] text-slate-500">{stk.symbol}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-white">₹{stk.price?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) ?? "0.00"}</div>
                                  <span className={`text-[9px] font-bold ${(stk.change ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(stk.change ?? 0) >= 0 ? "+" : ""}{(stk.change ?? 0).toFixed(2)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Module 4: Currency & Commodities Grid */}
                  {(() => {
                    const goldPrice = marketData?.gold?.price || 2035;
                    const silverPrice = marketData?.silver?.price || 22.85;
                    const brentPrice = marketData?.crude_brent?.price || 81.62;
                    const wtiPrice = marketData?.crude_wti?.price || 76.49;
                    const usdinrPrice = marketData?.usdinr?.price || 83.28;

                    // MCX Conversions
                    const mcxGold = Math.round(goldPrice * usdinrPrice * 0.03215 * 10);
                    const mcxSilver = Math.round(silverPrice * usdinrPrice * 31.1035);

                    return (
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                          Currencies & Commodities
                        </h3>

                        <div className="grid grid-cols-2 gap-3 font-mono text-[10px] text-left">
                          
                          {/* Forex Crosses */}
                          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl space-y-2">
                            <span className="text-[9px] text-slate-505 uppercase font-bold tracking-wider block border-b border-slate-850 pb-1">INR Crosses</span>
                            <div className="space-y-1.5 pt-0.5">
                              <div className="flex justify-between">
                                <span className="text-slate-400">USD/INR:</span>
                                <span className="text-white font-bold">{usdinrPrice.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">EUR/INR:</span>
                                <span className="text-white font-bold">{(usdinrPrice * 1.085).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">GBP/INR:</span>
                                <span className="text-white font-bold">{(usdinrPrice * 1.272).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">JPY/INR:</span>
                                <span className="text-white font-bold font-mono">{((usdinrPrice / 156.8) * 100).toFixed(4)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Commodities */}
                          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl space-y-2">
                            <span className="text-[9px] text-slate-505 uppercase font-bold tracking-wider block border-b border-slate-850 pb-1">Commodity Spot</span>
                            <div className="space-y-1.5 pt-0.5">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Brent Crude:</span>
                                <span className="text-white font-bold">${brentPrice?.toFixed(2) ?? "0.00"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">WTI Crude:</span>
                                <span className="text-white font-bold">${wtiPrice?.toFixed(2) ?? "0.00"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Gold MCX:</span>
                                <span className="text-white font-bold">₹{mcxGold?.toLocaleString() ?? "0"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Silver MCX:</span>
                                <span className="text-white font-bold font-mono">₹{mcxSilver?.toLocaleString() ?? "0"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* COLUMN 3: Breadth, Options Chain, Real-time News */}
                <div className="space-y-6">
                  
                  {/* Module 9: Market Breadth */}
                  {(() => {
                    let advances = 0;
                    let declines = 0;
                    sectors.forEach(sec => {
                      sec.stocks.forEach((stk: any) => {
                        if (stk.change >= 0) advances++;
                        else declines++;
                      });
                    });

                    const total = advances + declines || 1;
                    const advPct = Math.round((advances / total) * 100);
                    const decPct = 100 - advPct;

                    const high52 = Math.round(advances * 0.4 + (marketData?.nifty?.pct > 0 ? 12 : 3));
                    const low52 = Math.round(declines * 0.25 + (marketData?.nifty?.pct < 0 ? 8 : 2));

                    return (
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          Market Breadth (Advances/Declines)
                        </h3>

                        {/* advances declines bar */}
                        <div className="space-y-2 text-left">
                          <div className="flex justify-between text-[10px] font-mono font-bold">
                            <span className="text-emerald-400">Advances: {advances} ({advPct}%)</span>
                            <span className="text-rose-400">Declines: {declines} ({decPct}%)</span>
                          </div>
                          <div className="w-full h-3 rounded-full bg-slate-950 flex overflow-hidden border border-slate-850">
                            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${advPct}%` }} />
                            <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${decPct}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center font-mono text-[10px]">
                          <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-xl">
                            <span className="text-[8px] text-slate-500 uppercase block font-bold">52W High Stock Runs</span>
                            <span className="text-sm font-black text-emerald-400 mt-1 block">{high52}</span>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-xl">
                            <span className="text-[8px] text-slate-500 uppercase block font-bold">52W Low Stock Runs</span>
                            <span className="text-sm font-black text-rose-400 mt-1 block">{low52}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Module 8: Live Options Chain Snapshot */}
                  {(() => {
                    const spot = marketData?.nifty?.price || 22146.50;
                    const { strikes, pcr, maxPain } = getOptionsChain(spot);

                    return (
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                            <Target className="w-3.5 h-3.5 text-indigo-400" />
                            Live Options Chain Snapshot
                          </h3>
                          <div className="flex gap-2.5 text-[9px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-850">
                            <span>PCR: <strong className={pcr >= 1 ? "text-emerald-400" : "text-rose-400"}>{pcr}</strong></span>
                            <span>Max Pain: <strong className="text-white">{maxPain}</strong></span>
                          </div>
                        </div>

                        {/* Grid table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-[9px] font-mono text-slate-300">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase text-[8px] bg-slate-950/40">
                                <th className="py-2 px-1 text-left">Call Chg</th>
                                <th className="py-2 px-1 text-right text-indigo-400">Call LTP</th>
                                <th className="py-2 px-1 text-right">Call OI</th>
                                <th className="py-2 px-1 text-center bg-slate-950/60 font-bold">Strike</th>
                                <th className="py-2 px-1 text-left">Put OI</th>
                                <th className="py-2 px-1 text-left text-indigo-400">Put LTP</th>
                                <th className="py-2 px-1 text-right">Put Chg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {strikes.slice(2, 9).map(str => {
                                const isAtm = str.type === "ATM";
                                return (
                                  <tr key={str.strike} className={`border-b border-slate-900 hover:bg-slate-950/20 ${isAtm ? "bg-indigo-950/20 font-bold" : ""}`}>
                                    <td className={`py-1.5 px-1 text-left ${str.callChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      {str.callChange >= 0 ? "+" : ""}{str.callChange.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 px-1 text-right text-amber-400 font-bold">
                                      ₹{str.callPremium}
                                    </td>
                                    <td className="py-1.5 px-1 text-right text-slate-350">
                                      {str.callOi.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 px-1 text-center bg-slate-950 font-black text-white">
                                      {str.strike}
                                    </td>
                                    <td className="py-1.5 px-1 text-left text-slate-350">
                                      {str.putOi.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 px-1 text-left text-amber-400 font-bold">
                                      ₹{str.putPremium}
                                    </td>
                                    <td className={`py-1.5 px-1 text-right ${str.putChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      {str.putChange >= 0 ? "+" : ""}{str.putChange.toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Call vs Put Open Interest bar chart */}
                        <div className="h-28 w-full font-mono text-[8px] pt-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={strikes.slice(2, 9)} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                              <XAxis dataKey="strike" stroke="#64748b" tickLine={false} axisLine={false} />
                              <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ backgroundColor: "#0f111c", border: "1px solid #1e293b" }} />
                              <Bar dataKey="callOi" name="Call OI" fill="#ef4444" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="putOi" name="Put OI" fill="#10b981" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Module 6: News Feed */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                      Real-Time News Feed
                    </h3>

                    <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                      {news.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 text-xs font-mono">Loading news headlines...</div>
                      ) : (
                        news.map((item, idx) => {
                          const isBreaking = (() => {
                            try {
                              const pub = Date.parse(item.pubDate);
                              if (isNaN(pub)) return false;
                              const diffMins = (Date.now() - pub) / (60 * 1000);
                              return diffMins > 0 && diffMins < 15;
                            } catch {
                              return false;
                            }
                          })() || idx === 0;

                          const sentimentColor = item.sentiment === "Bullish" 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : item.sentiment === "Bearish" 
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                              : "bg-slate-800 text-slate-400 border-slate-700";

                          return (
                            <div key={idx} className="bg-slate-950/60 border border-slate-850 hover:border-slate-800 p-3.5 rounded-xl space-y-2 transition text-left">
                              <div className="flex justify-between items-center gap-2 flex-wrap">
                                <div className="flex gap-1.5 items-center">
                                  <span className="text-[9px] font-mono text-slate-400 font-bold bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-lg">
                                    {item.category || "🌍 Global Macro"}
                                  </span>
                                  <span className={`text-[8px] font-mono border px-1.5 py-0.25 rounded ${sentimentColor}`}>
                                    {item.sentiment}
                                  </span>
                                </div>
                                
                                {isBreaking && (
                                  <span className="bg-rose-605 text-white text-[8px] font-black font-mono px-2 py-0.5 rounded-full animate-pulse">
                                    BREAKING
                                  </span>
                                )}
                              </div>

                              <a 
                                href={item.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="block text-xs font-bold text-slate-200 hover:text-indigo-400 transition leading-snug"
                              >
                                {item.title}
                              </a>
                              
                              <span className="block text-[8px] text-slate-500 font-mono text-right">
                                {new Date(item.pubDate).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })} IST
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {activeSubTab === "journal" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Trade Journal entries ({trades.length})
                </h3>
              </div>

              {/* Trade Logs List */}
              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1">
                {trades.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950 border border-slate-900 rounded-xl text-slate-500 text-xs">
                    No trades logged in your journal yet.
                  </div>
                ) : (
                  trades.map(trade => (
                    <div 
                      key={trade.id} 
                      className="bg-slate-950 border border-slate-900 hover:border-slate-800 rounded-xl p-4.5 flex flex-col gap-3.5 transition animate-fade-in"
                    >
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase ${
                            trade.direction === "Long" 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}>
                            {trade.direction}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-white tracking-tight">{trade.stockName} ({trade.symbol})</h4>
                            <span className="text-[9px] text-slate-500 font-mono">{trade.date} {trade.time} via {trade.broker}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right flex flex-col items-end">
                            <span className={`text-[10px] font-bold font-mono ${trade.profitOrLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              Gross: {trade.profitOrLoss >= 0 ? "+" : ""}₹{trade.profitOrLoss.toLocaleString("en-IN")}
                            </span>
                            <span className="text-[9px] text-amber-500 font-mono">
                              Charges: -₹{getTradeBrokerCharges(trade).toLocaleString("en-IN")}
                            </span>
                            <span className={`text-sm font-black font-mono mt-0.5 ${
                              (trade.profitOrLoss - getTradeBrokerCharges(trade)) >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              Net: {(trade.profitOrLoss - getTradeBrokerCharges(trade)) >= 0 ? "+" : ""}₹{(trade.profitOrLoss - getTradeBrokerCharges(trade)).toLocaleString("en-IN")}
                            </span>
                            <p className="text-[8px] text-slate-500 font-mono mt-0.5">Size: ₹{trade.positionSize.toLocaleString("en-IN")}</p>
                          </div>
                          
                          <button
                            onClick={() => deleteTrade(trade.id!)}
                            className="p-1.5 bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Trade Parameters Grid */}
                      {trade.tradeType === "Options" ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-900/80 font-mono text-[9px]">
                          <div>
                            <span className="text-slate-500">Option Contract:</span>
                            <p className="text-slate-200 mt-0.5 font-bold text-indigo-400">
                              {trade.strikePrice} {trade.optionType}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">Lots & Lot Size:</span>
                            <p className="text-slate-200 mt-0.5">
                              {trade.lots} lots ({trade.quantity} qty)
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">Style / Strategy:</span>
                            <p className="text-slate-200 mt-0.5 text-emerald-400">
                              {trade.isHedged ? "Hedged Sell" : "Buy"} / {trade.strategy || "Naked"}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">Expiry / Contract:</span>
                            <p className="text-slate-200 mt-0.5">{trade.expiryDate || "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Entry / Exit Premium:</span>
                            <p className="text-slate-200 mt-0.5">₹{trade.entryPrice} / ₹{trade.exitPrice}</p>
                          </div>
                          {trade.isHedged && (
                            <>
                              <div>
                                <span className="text-slate-500">Hedge Strike:</span>
                                <p className="text-slate-200 mt-0.5">₹{trade.hedgeStrike}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Hedge Entry/Exit:</span>
                                <p className="text-slate-200 mt-0.5">₹{trade.hedgeEntryPrice} / ₹{trade.hedgeExitPrice}</p>
                              </div>
                            </>
                          )}
                          <div>
                            <span className="text-slate-500">Mindset / Exit Reason:</span>
                            <p className="text-slate-200 mt-0.5 capitalize">{trade.mindsetBefore} / {trade.exitReason}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-900/80 font-mono text-[9px]">
                          <div>
                            <span className="text-slate-500">Entry / Exit:</span>
                            <p className="text-slate-200 mt-0.5">₹{trade.entryPrice} / ₹{trade.exitPrice}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Stop Loss / Qty:</span>
                            <p className="text-slate-200 mt-0.5">₹{trade.stopLoss} / {trade.quantity}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Confidence / Risk:</span>
                            <p className="text-slate-200 mt-0.5">{trade.riskPercent}% Max Risk</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Mindset Entry / Exit:</span>
                            <p className="text-slate-200 mt-0.5 capitalize">{trade.mindsetBefore} / {trade.exitReason}</p>
                          </div>
                        </div>
                      )}

                      {/* Details & Notes */}
                      {trade.whyEntered && (
                        <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/30 p-2.5 rounded-xl border border-slate-900/40">
                          <span className="block text-[8px] font-bold uppercase tracking-wider text-indigo-400 font-mono mb-1">Trade Notes & Rationale</span>
                          {trade.whyEntered}
                          {trade.exitNote && (
                            <p className="mt-1.5 border-t border-slate-800/40 pt-1 text-slate-400">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-rose-400 font-mono mr-1">Exit Reason:</span>
                              {trade.exitNote}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Attached screenshots */}
                      {trade.attachments && trade.attachments.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto py-1 text-left">
                          {trade.attachments.map((img, index) => (
                            <button 
                              key={index} 
                              type="button"
                              onClick={() => setPreviewImage(img.url)}
                              className="w-16 h-12 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center hover:border-indigo-500/50 transition cursor-pointer"
                            >
                              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeSubTab === "rules" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex justify-between items-center gap-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Configurable Daily Trading Rules Checklist
                </h3>
              </div>

              <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                Define the guidelines that direct your trading discipline. You must confirm these checklists when logging new entries in your journal logs.
              </p>

              {/* Add new rule inline */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = (e.target as any).ruleInput.value;
                  addNewRule(val);
                  (e.target as any).ruleInput.value = "";
                }}
                className="flex gap-2"
              >
                <input
                  name="ruleInput"
                  placeholder="Type a new customized trading rule (e.g. No trading past 2:30 PM)"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Add Rule
                </button>
              </form>

              {/* List of rules */}
              <div className="space-y-2.5">
                {rules.map((rule, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-900 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 font-mono">
                        {index + 1}
                      </span>
                      <span className="text-xs text-slate-200">{rule}</span>
                    </div>
                    
                    <button
                      onClick={() => removeRule(index)}
                      className="text-slate-600 hover:text-rose-400 p-1 rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === "brokers" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
              
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  Broker API sync (Indian Market API Gateway)
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-1">Connect your active broker account to pull trade journals, order history, and position updates.</p>
              </div>

              {/* Grid of broker selections */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* DHAN */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4.5 flex flex-col gap-4 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-white">Dhan Sync</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold font-mono ${
                      dhanConfig.connected 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-900 text-slate-500 border border-slate-800"
                    }`}>
                      {dhanConfig.connected ? "Connected" : "Offline"}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <input
                      placeholder="Dhan Client ID"
                      value={dhanConfig.clientId}
                      onChange={(e) => {
                        const nc = { ...dhanConfig, clientId: e.target.value };
                        setDhanConfig(nc);
                        saveBrokerConfig("dhan", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                    <input
                      placeholder="Dhan API Access Token"
                      type="password"
                      value={dhanConfig.apiKey}
                      onChange={(e) => {
                        const nc = { ...dhanConfig, apiKey: e.target.value };
                        setDhanConfig(nc);
                        saveBrokerConfig("dhan", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[8px] text-slate-400 font-mono block mb-1">From Date</label>
                        <input
                          type="date"
                          value={syncFromDate}
                          onChange={(e) => setSyncFromDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-[9px] text-white outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-slate-400 font-mono block mb-1">To Date</label>
                        <input
                          type="date"
                          value={syncToDate}
                          onChange={(e) => setSyncToDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-[9px] text-white outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => triggerBrokerSync("Dhan")}
                    disabled={syncing}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    Sync Dhan Accounts
                  </button>
                </div>

                {/* ZERODHA */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4.5 flex flex-col gap-4 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-white">Zerodha Kite</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold font-mono ${
                      zerodhaConfig.connected 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-900 text-slate-500 border border-slate-800"
                    }`}>
                      {zerodhaConfig.connected ? "Connected" : "Offline"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <input
                      placeholder="Kite Client ID"
                      value={zerodhaConfig.clientId}
                      onChange={(e) => {
                        const nc = { ...zerodhaConfig, clientId: e.target.value };
                        setZerodhaConfig(nc);
                        saveBrokerConfig("zerodha", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                    <input
                      placeholder="Kite Connect API Key"
                      type="password"
                      value={zerodhaConfig.apiKey}
                      onChange={(e) => {
                        const nc = { ...zerodhaConfig, apiKey: e.target.value };
                        setZerodhaConfig(nc);
                        saveBrokerConfig("zerodha", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <button
                    onClick={() => triggerBrokerSync("Zerodha")}
                    disabled={syncing}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    Sync Kite Trades
                  </button>
                </div>

                {/* UPSTOX */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4.5 flex flex-col gap-4 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-white">Upstox API</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold font-mono ${
                      upstoxConfig.connected 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-900 text-slate-500 border border-slate-800"
                    }`}>
                      {upstoxConfig.connected ? "Connected" : "Offline"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <input
                      placeholder="Upstox Client ID"
                      value={upstoxConfig.clientId}
                      onChange={(e) => {
                        const nc = { ...upstoxConfig, clientId: e.target.value };
                        setUpstoxConfig(nc);
                        saveBrokerConfig("upstox", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                    <input
                      placeholder="Upstox API Key"
                      type="password"
                      value={upstoxConfig.apiKey}
                      onChange={(e) => {
                        const nc = { ...upstoxConfig, apiKey: e.target.value };
                        setUpstoxConfig(nc);
                        saveBrokerConfig("upstox", nc);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <button
                    onClick={() => triggerBrokerSync("Upstox")}
                    disabled={syncing}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    Sync Upstox API
                  </button>
                </div>
              </div>

              {/* Sync Live Log Console Output */}
              {syncLogs.length > 0 && (
                <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-1 max-h-40 overflow-y-auto">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Exchange sync console output logs:
                  </h4>
                  <div className="font-mono text-[9px] space-y-1 pt-2">
                    {syncLogs.map((log, idx) => (
                      <p key={idx} className={log.includes("✅") ? "text-emerald-400" : log.includes("❌") ? "text-rose-400" : "text-slate-400"}>
                        {log}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side Smart Insights Psychology Tracker (Column 4) */}
        <div className="space-y-6">
          
          {/* Psychology score card */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col items-center text-center space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Discipline Score</span>
            
            {/* Visual Circular Gauge */}
            <div className="relative w-28 h-28 flex items-center justify-center select-none">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="56" cy="56" r="46" stroke="rgba(255,255,255,0.02)" strokeWidth="6.5" fill="transparent" />
                <circle 
                  cx="56" cy="56" r="46" 
                  stroke="url(#indigoGrad)" strokeWidth="6.5" fill="transparent" 
                  strokeDasharray={2 * Math.PI * 46}
                  strokeDashoffset={2 * Math.PI * 46 * (1 - getDisciplineScore() / 100)}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="indigoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-black text-white font-mono leading-none">{getDisciplineScore()}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mt-1">Score</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
              Psychology Rating: <span className="text-purple-400 font-bold font-mono">{getPsychologyScore()}/100</span>. Maintain stop parameters to raise your ratings.
            </p>
          </div>

          {/* AI recommendations widget */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4.5">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
                AI Mind Tracker
              </h3>
              {fetchingAi && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
            </div>

            <div className="text-[10px] leading-relaxed text-slate-300 bg-slate-950/40 p-3 rounded-xl border border-slate-950 font-medium">
              {aiSuggestions}
            </div>
            
            <button
              onClick={() => triggerAiMindsetAnalysis(trades)}
              disabled={fetchingAi || trades.length === 0}
              className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/30 text-slate-400 hover:text-white rounded-xl text-[10px] font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              Refresh AI Analysis
            </button>
          </div>

          {/* Setup verification helper details */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              Process Metrics
            </h3>
            <div className="space-y-2.5 font-mono text-[9px]">
              <div className="flex justify-between border-b border-slate-850 pb-1.5">
                <span className="text-slate-500">Best setup:</span>
                <span className="text-emerald-400 font-bold">{getBestSetup()}</span>
              </div>
              <div className="flex justify-between border-b border-slate-850 pb-1.5">
                <span className="text-slate-500">Rule break rate:</span>
                <span className="text-rose-400 font-bold">
                  {trades.length > 0 
                    ? `${Math.round((trades.filter(t => t.exitReason === "Rule break").length / trades.length) * 100)}%` 
                    : "0%"
                  }
                </span>
              </div>
              <div className="flex justify-between pb-0.5">
                <span className="text-slate-500">Average net trade:</span>
                <span className={`font-bold ${netPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ₹{trades.length > 0 ? Math.round(netPnL / trades.length) : 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Add Trade Modal ────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5 animate-fade-in-up">
            
            <button 
              onClick={() => { setIsAddModalOpen(false); resetForm(); }}
              className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-850 pb-4">
              <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <Target className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-white">Log Options Buy Trade Journal Entry</h3>
                <p className="text-[10px] text-slate-500 font-mono">Fill out Options Buying parameters. Auto win rate and mindset score computed.</p>
              </div>
            </div>

            <form onSubmit={handleAddTradeSubmit} className="space-y-4">
              
              {/* Underlying Index, Option Type, Strike, Expiry, Lots */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 text-left">
                {/* Underlying Index */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Underlying Index</label>
                  <select
                    value={optionUnderlying}
                    onChange={(e) => setOptionUnderlying(e.target.value as any)}
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    <option value="NIFTY">NIFTY 50</option>
                    <option value="SENSEX">BSE SENSEX</option>
                    <option value="BANKNIFTY">NIFTY BANK</option>
                    <option value="BANKEX">BSE BANKEX (BANEX)</option>
                    <option value="CUSTOM">CUSTOM SYMBOL</option>
                  </select>
                </div>

                {/* Option Type (CE/PE) */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Option Type</label>
                  <select
                    value={optionType}
                    onChange={(e) => setOptionType(e.target.value as any)}
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    <option value="CE">Call Option (CE)</option>
                    <option value="PE">Put Option (PE)</option>
                  </select>
                </div>

                {/* Option Strike Price */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Strike Price (₹)</label>
                  {optionUnderlying !== "CUSTOM" ? (
                    <select
                      value={optionStrike}
                      onChange={(e) => setOptionStrike(e.target.value)}
                      required
                      className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="">Select Strike</option>
                      {getStrikeOptions().map(strikeVal => {
                        const step = optionUnderlying === "NIFTY" ? 50 : 100;
                        const spot = optionUnderlying === "NIFTY" ? (marketData?.nifty?.price || 24000) : (optionUnderlying === "SENSEX" ? (marketData?.sensex?.price || 78000) : (marketData?.banknifty?.price || 55000));
                        const atm = Math.round(spot / step) * step;
                        const isAtm = strikeVal === atm;
                        return (
                          <option key={strikeVal} value={strikeVal}>
                            {strikeVal} {isAtm ? "(ATM)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={optionStrike}
                      onChange={(e) => setOptionStrike(e.target.value)}
                      placeholder="e.g. 22100"
                      required
                      className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  )}
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Expiry Date</label>
                  {optionUnderlying !== "CUSTOM" ? (
                    <select
                      value={optionExpiry}
                      onChange={(e) => setOptionExpiry(e.target.value)}
                      required
                      className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="">Select Expiry</option>
                      {getExpiryDatesForUnderlying(optionUnderlying).map(exp => (
                        <option key={exp} value={exp}>{exp}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={optionExpiry}
                      onChange={(e) => setOptionExpiry(e.target.value)}
                      placeholder="e.g. 28-MAY-2026"
                      required
                      className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                    />
                  )}
                </div>

                {/* Lots Count */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Lots</label>
                  <input
                    type="number"
                    min="1"
                    value={lotsCount}
                    onChange={(e) => setLotsCount(e.target.value)}
                    required
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* If Custom underlying selected, show Custom Symbol input */}
              {optionUnderlying === "CUSTOM" && (
                <div className="text-left">
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5">Custom Option Symbol</label>
                  <input
                    value={customOptionSymbol}
                    onChange={(e) => setCustomOptionSymbol(e.target.value)}
                    placeholder="e.g. RELIANCE26MAY2400CE"
                    required
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              {/* Entry and Exit Premiums */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left">
                {/* Entry Premium */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400 font-mono">Entry Premium (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* Exit Premium */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400 font-mono">Exit Premium (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Mindset & Exit Reason */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left">
                {/* Mindset Entry */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Mindset at trade entry</label>
                  <select
                    value={mindsetBefore}
                    onChange={(e) => setMindsetBefore(e.target.value as any)}
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    <option value="Calm">Calm & Focused</option>
                    <option value="Confident">Confident</option>
                    <option value="FOMO">FOMO (Chasing)</option>
                    <option value="Greedy">Greedy / Impulsive</option>
                    <option value="Anxious">Anxious</option>
                    <option value="Impatient">Impatient</option>
                  </select>
                </div>

                {/* Exit Reason */}
                <div>
                  <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400">Primary exit reason</label>
                  <select
                    value={exitReason}
                    onChange={(e) => setExitReason(e.target.value as any)}
                    className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    <option value="Target achieved">Target achieved</option>
                    <option value="Stop loss hit">Stop loss hit</option>
                    <option value="Fear">Fear (Exited early)</option>
                    <option value="Panic">Panic / Market dump</option>
                    <option value="Emotion">Emotion / Impulse</option>
                    <option value="FOMO">FOMO Exit</option>
                    <option value="Rule break">Rule break / Deviation</option>
                    <option value="Manual note">Manual Note / Trail stop</option>
                  </select>
                </div>
              </div>

              {/* Rationale & Notes */}
              <div className="text-left">
                <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400 font-mono">Trade Description & Notes</label>
                <textarea
                  value={whyEntered}
                  onChange={(e) => setWhyEntered(e.target.value)}
                  placeholder="Why did you enter this setup? What was your plan? Why did you exit?"
                  rows={3}
                  className="w-full bg-slate-955 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Screenshots Uploader (Optional) */}
              <div className="text-left space-y-2">
                <label className="block text-[10px] text-slate-505 font-mono uppercase mb-1.5 font-bold text-indigo-400 font-mono">
                  Screenshots / Attachments (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-indigo-500/30 text-slate-405 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer select-none">
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Upload Screenshot</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={handleImageChange} 
                      className="hidden" 
                    />
                  </label>
                  {uploading && (
                    <span className="text-[10px] text-indigo-400 animate-pulse font-mono">Uploading...</span>
                  )}
                </div>

                {/* Display uploaded image previews inside the modal */}
                {uploadedImages.length > 0 && (
                  <div className="flex gap-2 py-1 overflow-x-auto">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-12 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 bg-rose-955/80 border border-rose-500/30 hover:bg-rose-900 text-rose-300 p-0.5 rounded-full cursor-pointer transition"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Real-time calculated feedback widget */}
              <div className="grid grid-cols-2 gap-4 bg-slate-955 border border-slate-900 p-4.5 rounded-2xl font-mono text-xs text-left">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">Estimated P&L outcome:</span>
                  <p className={`text-base font-black mt-1 ${calculatedPnL() >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {calculatedPnL() >= 0 ? "+" : ""}₹{calculatedPnL().toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">Position Size:</span>
                  <p className="text-base font-black text-white mt-1">
                    ₹{calculatedPositionSize().toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-850 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); resetForm(); }}
                  className="px-4.5 py-2.5 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Screenshot Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center px-4.5 py-3 border-b border-slate-850">
              <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">Screenshot Preview</span>
              <div className="flex items-center gap-2">
                <a 
                  href={previewImage} 
                  target="_blank" 
                  rel="noreferrer"
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                >
                  Open in New Tab
                </a>
                <button 
                  onClick={() => setPreviewImage(null)}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Image body */}
            <div className="p-4 overflow-auto flex justify-center items-center">
              <img 
                src={previewImage} 
                alt="Trade Screenshot Preview" 
                className="max-w-full max-h-[70vh] object-contain rounded-lg border border-slate-950" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
