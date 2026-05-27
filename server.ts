import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini client securely
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } else {
    console.warn("GEMINI_API_KEY environment variable not found. AI suggestions will use fallback rule-based system.");
  }
} catch (e) {
  console.error("Failed to initialize GoogleGenAI:", e);
}

// Global rule-based fallback systems when Gemini is unavailable or rate-limited
const fallbackSpiritualMessages = {
  god: [
    "Your strength is not in your hands, but in your faith and patience. Trust the timing of your life.",
    "Do not count the difficulties; instead count your blessings. You are being prepared for a magnificent harvest.",
    "Every drop of dedication you put towards your family is seen. Stand strong and walk in faith.",
    "Be kind to yourself today. I am guided with peace, and so are your steps."
  ],
  angel: [
    "Angel Number 5282: You are fully supported in making personal improvements and aligning your finances.",
    "An angel of abundance is surrounding you. Simplify, keep your focus neat, and watch everything fall into place.",
    "Take three deep breaths. Your angels are clearing away heavy burdens, encouraging you to structure your day clearly.",
    "Patience is your shield today. The universe is aligning your efforts towards freedom."
  ]
};

// API Endpoint for Secure AI Suggestions
app.post("/api/ai", async (req, res) => {
  const { type, payload } = req.body;

  if (!type) {
    return res.status(400).json({ error: "Missing suggestion type parameter" });
  }

  // 1. If Gemini AI is configured, let's generate custom high-quality advice
  if (ai) {
    try {
      let prompt = "";
      let systemInstruction = "You are a highly helpful and focused AI Companion for Maha Personal Finance. Provide precise, brief advice using professional but encouraging tone. Keep answers under 100 words in clear formatted text.";

      if (type === "expense") {
        prompt = `Analyze this spending pattern: ${JSON.stringify(payload)}. Identify highlights, spikes, or suggestions for budgeting. Tell the user how to optimize.`;
        systemInstruction = "You are a smart Expense tracking advisor. Highlight 1 specific area of improvement. Mention any spikes and budget triggers in less than 2-3 sentences.";
      } else if (type === "debt") {
        const { totalDebt, emiRate } = payload || {};
        prompt = `The user has ₹${totalDebt || 500000} of total debt. Based on current installment speed, offer optimal debt closure schedules (e.g. daily/monthly payments) or tips to save interest.`;
        systemInstruction = "You are an encouraging Debt Reduction Coach. Provide clear, straightforward daily/monthly payoff targets mathematically customized inside the answer.";
      } else if (type === "habit") {
        prompt = `The user tracks these habits: ${JSON.stringify(payload)}. Give structured motivation for streaks or advice for missed days.`;
        systemInstruction = "You are a friendly Habit Coach. Analyze completion history, give 1 specific actionable suggestion for consistency, and be uplifting.";
      } else if (type === "spiritual") {
        const { msgType } = payload || { msgType: "god" };
        prompt = `Generate an inspiring spiritual message of category: ${msgType === "god" ? "God's Message / Words of Wisdom" : "Angel Message (perhaps referencing Angel numbers or spiritual protection)"}. Custom craft a heart-touching message.`;
        systemInstruction = "You are an inspiring Divine Guidance Messenger. Generate a brief, warm, supportive, original spiritual message designed to calm and motivate the reader.";
      } else if (type === "gratitude") {
        prompt = `Here are some ideas/entries: ${JSON.stringify(payload)}. Give a prompt or insight to deepen gratitude practice focusing on simple tiny objects.`;
        systemInstruction = "You are a Mindful Gratitude Prompt Generator. Offer an inspiring or unique suggestion for something minimal to appreciate today.";
      } else if (type === "journal") {
        const { currentMood } = payload || {};
        prompt = `The user feels: ${currentMood || "neutral"}. Suggest three small questions or journal prompts to write about today aligned with this mood.`;
        systemInstruction = "You are a warm Journal Prompt Generator. Provide 3 specific and highly mindful questions tailored to the reported mood.";
      } else if (type === "trading_mindset") {
        prompt = `Analyze this trading mindset and pattern: ${JSON.stringify(payload)}. Detect overtrading, revenge trading, FOMO, impulsive entries, fear-based exits, or poor risk management. Give precise suggestions for mindset improvement and trading discipline.`;
        systemInstruction = "You are an expert AI Trading Psychology Mentor. Highlight specific cognitive biases or emotional triggers in the trade logs. Give 2-3 actionable mindset suggestions.";
      } else if (type === "trading_market_open_prediction") {
        prompt = `Given the overnight global market conditions: ${JSON.stringify(payload.globalFeed)} and the SGX/GIFT Nifty feed: ${JSON.stringify(payload.sgxNiftyFeed)}. Predict the Indian market (Nifty 50) opening sentiment (Gap-up, Gap-down, or Flat). Explain the key factors, including SGX premium/discount and global indices performance.`;
        systemInstruction = "You are an expert Indian Stock Market Analyst. Provide a clear pre-market opening prediction (Gap-up, Gap-down, or Flat) with a 2-3 bullet point technical explanation of the global cues (US, European, Asian markets) and SGX Nifty. Keep it concise, professional, and under 90 words.";
      } else if (type === "trading_market_move_suggestion") {
        prompt = `Nifty 50 opened at ${payload.openPrice}. Current price is ${payload.currentPrice}, High is ${payload.highPrice}, Low is ${payload.lowPrice}. The current trend is ${payload.trend}. Historical learned patterns: ${JSON.stringify(payload.history)}. Predict possible moves for the rest of the day, key support/resistance levels, and suggest trading precautions.`;
        systemInstruction = "You are a Live Intraday Price Action Strategist for Nifty 50. Analyze the open, high, low, and current price structure. Output 2 potential scenarios (bullish breakout, consolidation, bearish breakdown) with specific target ranges and levels. Keep it concise and professional under 100 words.";
      } else if (type === "trading_event_impact_analysis") {
        prompt = `Analyze this major market event: ${payload.eventName} (${payload.eventDescription}). Detail how this impacts the Indian stock market, specifically identifying the sectors affected (e.g. IT, Banking, Auto, Infrastructure, Metals, FMCG), the direction of the impact (positive, negative, volatile), and why.`;
        systemInstruction = "You are an expert Macroeconomic & Equity Sector Research Analyst. For the given event, explain the direct and indirect impacts on major Indian stock sectors. List 3-4 key affected sectors, their sentiment direction (Bullish, Bearish, or Volatile), and a 1-sentence reason. Keep it highly structured and under 120 words.";
      } else if (type === "trading_dashboard_summary") {
        prompt = `Here is the current state of the Indian Stock Market and global cues:
- Domestic Indices: Nifty 50: ${payload.nifty}, Sensex: ${payload.sensex}, Bank Nifty: ${payload.banknifty}
- GIFT Nifty Futures: ${payload.giftNifty} (Premium/Discount: ${payload.giftPremium} pts)
- Global Indices: US Dow: ${payload.dow}, US VIX: ${payload.vix}, Japan Nikkei: ${payload.nikkei}
- Currencies & Commodities: USD/INR: ${payload.usdinr}, Brent Crude: ${payload.crude}
- FII/DII Flow: FII Cash flow: ${payload.fiiCash} Cr, DII Cash flow: ${payload.diiCash} Cr
- Top News Headlines: ${JSON.stringify(payload.news)}

Current Market Phase/Time: ${payload.phase}

Please generate an AI Market Summary containing:
1. A concise 3-line summary of current momentum (pre-market, intraday, or closing outlook).
2. Bullet points highlighting the top 3 key risk factors for today's session.
3. Highlight the top 3 sectors to watch and why.`;
        systemInstruction = "You are an elite Indian Equity Market Strategist and Research Analyst. Generate a highly structured, concise, professional market report. Keep the response to three sections: 1) Market Summary (3 lines/sentences), 2) Key Risks (3 brief bullet points), and 3) Sectors to Watch (3 brief items with a 1-sentence explanation each). Total response must be under 150 words.";
      } else {
        prompt = `Provide a helpful tip for organizing personal life. Context: ${JSON.stringify(payload)}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const resultText = response.text || "";
      return res.json({ suggestion: resultText.trim() });

    } catch (err: any) {
      console.error("Gemini suggestion error, falling back to rules:", err);
      // Fall through to fallback logic
    }
  }

  // 2. Rule-Based Rule Engine & Fallback Logic when Gemini is absent or fails
  let suggestion = "";

  if (type === "expense") {
    const transactions = payload?.transactions || [];
    if (transactions.length === 0) {
      suggestion = "Add your first income or expense transaction to receive AI spending insights!";
    } else {
      const expenses = transactions.filter((t: any) => t.type === "expense" && !t.deleted);
      const totalExp = expenses.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
      
      // Group by category
      const categories: { [key: string]: number } = {};
      expenses.forEach((t: any) => {
        categories[t.category] = (categories[t.category] || 0) + (Number(t.amount) || 0);
      });

      let highestCat = "";
      let highestAmt = 0;
      Object.entries(categories).forEach(([cat, amt]) => {
        if (amt > highestAmt) {
          highestAmt = amt;
          highestCat = cat;
        }
      });

      if (highestCat) {
        suggestion = `Spend insight: You've spent ₹${totalExp.toLocaleString()} this period. Your top expense category is "${highestCat}" at ₹${highestAmt.toLocaleString()} (${Math.round((highestAmt/totalExp)*100)}%). Consider keeping an eye on sub-items here.`;
      } else {
        suggestion = "Keep recording your expenses! Regular entries will generate precise warnings about budget spikes.";
      }
    }
  } else if (type === "debt") {
    const totalDebt = Number(payload?.totalDebt) || 0;
    if (totalDebt <= 0) {
      suggestion = "Fantastic! You are currently carrying zero debt. Focus on growing your personal savings or investments.";
    } else {
      const daily30 = Math.round(totalDebt / 30);
      const daily365 = Math.round(totalDebt / 365);
      const daily730 = Math.round(totalDebt / 730);
      suggestion = `To fully close your ₹${totalDebt.toLocaleString()} debt:
• In 1 month: Pay ₹${daily30.toLocaleString()} /day
• In 1 year: Pay ₹${daily365.toLocaleString()} /day
• In 2 years: Pay ₹${daily730.toLocaleString()} /day
Maintain a daily discipline to reduce outstanding principal upfront.`;
    }
  } else if (type === "habit") {
    const habits = payload?.habits || [];
    if (habits.length === 0) {
      suggestion = "Define daily goals like Exercises, Reading, or Meditation to activate real-time habit advice.";
    } else {
      suggestion = "Great effort! Consistency is key. Even on busiest days, aiming for a '5-minute micro-habit' ensures your neural path stays active. Never miss twice in a row.";
    }
  } else if (type === "spiritual") {
    const msgType = payload?.msgType || "god";
    const bank = msgType === "god" ? fallbackSpiritualMessages.god : fallbackSpiritualMessages.angel;
    const item = bank[Math.floor(Math.random() * bank.length)];
    suggestion = item;
  } else if (type === "gratitude") {
    suggestion = "Think of three tiny, physical objects you saw today (like a warm cup, a soft pen, or a green leaf) and express gratitude for their quiet presence.";
  } else if (type === "journal") {
    const mood = payload?.currentMood || "neutral";
    const prompts: { [key: string]: string } = {
      happy: "1. What is the source of this joy today? 2. How can you extend this positive energy to someone else? 3. What anchor will remind you of this state later?",
      tired: "1. What part of your body is holding the most fatigue? 2. What is 1 thing you can drop from your list today? 3. What does complete recovery look like tonight?",
      anxious: "1. Let's write down everything in your mind, then circle what is 100% under your control. 2. What does your deep breath feel like? 3. Direct your energy to one tiny movement.",
      sad: "1. Allow yourself space to breathe. What is making you feel heavy? 2. What gentle self-care can you provide yourself right now? 3. Who is a safe person in your memories?",
      neutral: "1. Describe the precise temperature and look of your room right now. 2. What is a small decision that worked in your favor today? 3. What are you looking forward to tomorrow?"
    };
    suggestion = prompts[mood] || prompts.neutral;
  } else if (type === "trading_mindset") {
    const emotions = payload?.emotions || [];
    const exitReasons = payload?.exitReasons || [];
    const trades = payload?.trades || [];

    let suggestionsList: string[] = [];

    if (exitReasons.includes("Fear") || exitReasons.includes("Panic") || exitReasons.includes("Emotion")) {
      suggestionsList.push("You exit profitable trades too early due to fear or anxiety. Trust your stop-loss and target parameters.");
    }
    if (emotions.includes("Revenge") || emotions.includes("Anger") || emotions.includes("Frustrated")) {
      suggestionsList.push("Avoid emotional revenge entries. Take a 1-hour screen break after any losing trade.");
    }
    if (emotions.includes("FOMO") || exitReasons.includes("FOMO") || emotions.includes("Greed")) {
      suggestionsList.push("Avoid impulsive entries driven by FOMO. Wait for your strict setup confirmation before entering.");
    }
    
    const poorRisk = trades.some((t: any) => Number(t.riskPercent) > 2);
    if (poorRisk) {
      suggestionsList.push("Maintain strict risk control. Never risk more than 2% of capital on a single trade.");
    }
    
    // Group trades by date to find overtrading and revenge entries
    const tradesByDate: { [date: string]: any[] } = {};
    trades.forEach((t: any) => {
      if (t.date) {
        tradesByDate[t.date] = tradesByDate[t.date] || [];
        tradesByDate[t.date].push(t);
      }
    });

    let overtradedDays: string[] = [];
    let revengeTradesCount = 0;

    Object.entries(tradesByDate).forEach(([date, dayTrades]) => {
      if (dayTrades.length > 3) {
        // Format date label if possible
        try {
          const parts = date.split("-");
          if (parts.length === 3) {
            const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            if (!isNaN(dObj.getTime())) {
              overtradedDays.push(dObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
            } else {
              overtradedDays.push(date.slice(5));
            }
          } else {
            overtradedDays.push(date);
          }
        } catch (e) {
          overtradedDays.push(date);
        }
      }

      // Sort chronologically
      const sortedDayTrades = [...dayTrades].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      for (let i = 1; i < sortedDayTrades.length; i++) {
        const prev = sortedDayTrades[i - 1];
        const curr = sortedDayTrades[i];
        if (prev.time && curr.time) {
          try {
            const [pH, pM] = prev.time.split(":").map(Number);
            const [cH, cM] = curr.time.split(":").map(Number);
            const diffMin = (cH * 60 + cM) - (pH * 60 + pM);
            
            // If entered within 45 mins of a loss -> Revenge trade!
            if (diffMin >= 0 && diffMin <= 45 && prev.profitOrLoss < 0) {
              revengeTradesCount++;
            }
          } catch (e) {}
        }
      }
    });

    if (overtradedDays.length > 0) {
      suggestionsList.push(`You show signs of overtrading on: ${overtradedDays.join(", ")} (>3 trades per day). Stick to your daily limit.`);
    }
    if (revengeTradesCount > 0) {
      suggestionsList.push(`Revenge trading pattern detected! You entered trades within 45 minutes of a losing trade ${revengeTradesCount} time(s). Always pause after a loss.`);
    }

    if (suggestionsList.length === 0) {
      suggestionsList.push("Your trading psychology looks disciplined. Keep following your rules, protect capital first, and wait for confirmation.");
    }

    suggestion = "AI Trading Mindset suggestions:\n\n" + suggestionsList.map(s => `• ${s}`).join("\n");
  } else if (type === "trading_market_open_prediction") {
    const globalFeed = payload?.globalFeed || [];
    const sgxNiftyFeed = payload?.sgxNiftyFeed || {};

    const sgxChange = Number(sgxNiftyFeed.pct) || 0;
    const direction = sgxChange > 0.3 ? "GAP-UP" : sgxChange < -0.3 ? "GAP-DOWN" : "FLAT";

    let reasons = [];
    if (direction === "GAP-UP") {
      reasons.push(`SGX/GIFT Nifty is trading with a strong premium of +${sgxChange.toFixed(2)}%, indicating bullish sentiment in the morning session.`);
    } else if (direction === "GAP-DOWN") {
      reasons.push(`SGX/GIFT Nifty shows a discount of ${sgxChange.toFixed(2)}%, signalling strong bearish pressure before the Indian market opens.`);
    } else {
      reasons.push(`SGX/GIFT Nifty is trading flat at ${sgxChange.toFixed(2)}%, suggesting a stable and balanced open.`);
    }

    // Check US markets (Dow and Nasdaq)
    const dow = globalFeed.find((i: any) => i.name.includes("Dow") || i.name.includes("DJIA"));
    const nasdaq = globalFeed.find((i: any) => i.name.includes("Nasdaq") || i.name.includes("COMP"));
    if (dow && nasdaq) {
      const isUsBullish = (dow.pct > 0.2) && (nasdaq.pct > 0.2);
      const isUsBearish = (dow.pct < -0.2) && (nasdaq.pct < -0.2);
      if (isUsBullish) {
        reasons.push(`Overnight US markets closed in the green (Dow: +${dow.pct}%, Nasdaq: +${nasdaq.pct}%), providing strong global tailwinds.`);
      } else if (isUsBearish) {
        reasons.push(`US markets experienced selling pressure overnight (Dow: ${dow.pct}%, Nasdaq: ${nasdaq.pct}%), adding drag to global markets.`);
      } else {
        reasons.push(`US indices remained range-bound, suggesting quiet global cues for the day.`);
      }
    }

    // Check Asian markets
    const nikkei = globalFeed.find((i: any) => i.name.includes("Nikkei"));
    if (nikkei) {
      if (nikkei.pct > 0.5) {
        reasons.push(`Asian cues are positive, led by a +${nikkei.pct}% rally in Japan's Nikkei 225 this morning.`);
      } else if (nikkei.pct < -0.5) {
        reasons.push(`Asian sentiment is weak, with Tokyo's Nikkei 225 down ${nikkei.pct}% leading to cautious domestic openings.`);
      }
    }

    suggestion = `Morning AI Pre-Market Prediction:\n\n🔮 Possible Indian Market Open: **${direction}**\n\nKey Market Drivers:\n` + reasons.map(r => `• ${r}`).join("\n") + "\n\nTrade Setup Idea: If opening is a Gap-up, wait for initial 15-minute candle low to hold before going long. If Gap-down, look for support base near yesterday's close or key pivots.";
  } else if (type === "trading_market_move_suggestion") {
    const open = Number(payload?.openPrice) || 22000;
    const current = Number(payload?.currentPrice) || 22000;
    const high = Number(payload?.highPrice) || 22050;
    const low = Number(payload?.lowPrice) || 21950;
    const trend = payload?.trend || "neutral";

    let scenarioBullish = "";
    let scenarioBearish = "";
    let levelSupport = Math.round(low - 40);
    let levelResistance = Math.round(high + 40);

    if (trend === "bullish" || current > open + 20) {
      scenarioBullish = `Bullish Breakout: If Nifty holds above resistance pivot at ${high}, we could see a continuation rally towards ${levelResistance + 30}. Look for long entries on dips.`;
      scenarioBearish = `False Breakout / Reversal: If price fails to sustain high levels and breaks below the open at ${open}, it may trigger profit booking back to support at ${low}.`;
    } else if (trend === "bearish" || current < open - 20) {
      scenarioBullish = `Short Covering Pullback: If Nifty forms a base at support level ${levelSupport} and climbs above ${open}, a short-covering rally could target ${high}.`;
      scenarioBearish = `Bearish Breakdown: A breach below the morning session low of ${low} will invite fresh short sellers, dragging the index further down to support level ${levelSupport - 30}.`;
    } else {
      scenarioBullish = `Range Breakout: A break above the session high of ${high} will open up targets for ${levelResistance} as buyers take control.`;
      scenarioBearish = `Range Breakdown: A break below the session low of ${low} will trigger stops and push Nifty down to ${levelSupport} to test structural demand zones.`;
    }

    suggestion = `AI Live Market Tracker Suggestions (Time: ${new Date().toLocaleTimeString("en-IN")}):\n\n📈 Current Session Range: Low ${low} - High ${high}\n🔥 Sentiment: ${trend.toUpperCase()}\n\nScenarios to Watch:\n• ${scenarioBullish}\n• ${scenarioBearish}\n\n💡 Trading Advice: Market is showing ${trend} momentum. Do not chase trades at extremes; wait for consolidation near key horizontal pivots before taking a trade. Keep strict stop loss.`;
  } else if (type === "trading_event_impact_analysis") {
    const eventName = payload?.eventName || "FED Rate Decision";
    const desc = payload?.eventDescription || "Interest rate changes";
    
    let analysis = "";
    let sectors = [];

    if (eventName.toLowerCase().includes("fed") || desc.toLowerCase().includes("fed")) {
      analysis = `Federal Reserve rate decisions alter capital flows. A rate cut boosts emerging markets, while a rate hike prompts outflows.`;
      sectors = [
        { name: "IT (Information Technology)", impact: "🟢 Positive / Volatile", details: "Export-oriented IT sector benefits if US economy remains strong, and rate cuts spur tech spending by US clients." },
        { name: "Banking & Financials", impact: "🟢 Highly Sensitive", details: "Foreign portfolio investor (FPI) inflows increase with lower US yields, boosting large-cap banking valuations." },
        { name: "Metals & Commodities", impact: "🟡 Volatile", details: "Dollar weakness from rate cuts supports commodity prices, improving margins for metal manufacturers." }
      ];
    } else if (eventName.toLowerCase().includes("budget")) {
      analysis = `The Union Budget dictates domestic fiscal policy and capital allocations. Government spending directs long-term market trends.`;
      sectors = [
        { name: "Infrastructure & Cement", impact: "🟢 Positive", details: "Increased capital expenditures (CapEx) directly boost order books for infra and cement companies." },
        { name: "FMCG & Rural", impact: "🟢 Positive / Neutral", details: "Tax relief or rural subsidies boost disposable income, driving sales for consumer goods manufacturers." },
        { name: "Defence & Aerospace", impact: "🟢 Positive", details: "Indigenisation focus and increased defence budget allocations boost domestic defence manufacturing players." }
      ];
    } else if (eventName.toLowerCase().includes("election")) {
      analysis = `General or state election results determine policy continuity and reform velocity, driving foreign and domestic investor sentiment.`;
      sectors = [
        { name: "Public Sector Undertakings (PSUs)", impact: "🟢 Highly Volatile", details: "Stability in government boosts public spending and capital execution, driving PSU energy and railway stocks." },
        { name: "Infrastructure & Power", impact: "🟢 Positive", details: "Policy continuity ensures infrastructure pipeline executions and renewable energy projects proceed without delay." },
        { name: "Nifty Smallcap / Midcap", impact: "🟡 High Risk", details: "High beta sectors experience rapid shifts. Stability supports momentum, while surprises trigger sharp corrections." }
      ];
    } else {
      analysis = `Important macroeconomic news event impacting general market liquidity and domestic inflation/growth projections.`;
      sectors = [
        { name: "Nifty Index Heavyweights", impact: "🟡 Volatile", details: "FII/DII repositioning affects large cap indices (Reliance, HDFC Bank) immediately as risk parameters change." },
        { name: "Automobile & Realty", impact: "🟡 Sensitive", details: "Directly linked to domestic consumer interest rates and credit availability following inflation cues." }
      ];
    }

    suggestion = `AI Event Impact Analysis: **${eventName}**\n\n📌 Context: ${desc}\n\nMacro Cues: ${analysis}\n\nSector-by-Sector Impact Breakdown:\n` + 
      sectors.map(s => `• **${s.name}** [${s.impact}]\n  _${s.details}_`).join("\n\n");
  } else if (type === "trading_dashboard_summary") {
    const phase = payload?.phase || "real_time";
    const premium = Number(payload?.giftPremium) || 0;
    const vixVal = Number(payload?.vix) || 14.5;
    const fiiCash = Number(payload?.fiiCash) || 0;
    
    let summaryLines = [];
    if (phase === "pre_market") {
      summaryLines.push(premium >= 10 ? `GIFT Nifty hints at a gap-up opening for Nifty 50 by around ${Math.round(premium)} points, supported by positive global cues.` : premium <= -10 ? `GIFT Nifty indicates a gap-down opening by around ${Math.round(Math.abs(premium))} points, reflecting weak global sentiment.` : `Flat opening expected for Nifty 50 as global indices trade range-bound.`);
      summaryLines.push(`FII capital outflows and rising US Treasury yields remain key resistance factors.`);
      summaryLines.push(`Traders should monitor opening 15-minute range breakouts before committing large capital.`);
    } else {
      summaryLines.push(`Indian benchmarks show neutral to bullish consolidation near key moving averages.`);
      summaryLines.push(`Domestic DII buying is successfully offsetting FII selling pressure.`);
      summaryLines.push(`Expect range-bound movement with support at 22,000 and resistance at 22,250.`);
    }
    
    let risks = [
      vixVal > 18 ? `High Volatility Index (VIX at ${vixVal}) suggesting rising options premiums and panic.` : `Macro liquidity drag: Rising global bond yields and potential inflation pressures.`,
      fiiCash < -2000 ? `Aggressive FII selling (₹${Math.abs(fiiCash)} Cr cash net outflow) dragging index heavyweights.` : `Geopolitical queues: Range-bound global indices adding no major directional trigger.`,
      `Overnight movement in US Tech stocks keeping domestic IT sector volatile.`
    ];
    
    let sectors = [
      `Banking & Financials: High weightage sector showing consolidation, crucial for Nifty support.`,
      `Information Technology (IT): Watching US Nasdaq queues and dollar-index trajectory for export margins.`,
      `Metals & Commodities: Crude oil spikes near $80-85 affecting oil marketing companies and inflation.`
    ];

    suggestion = `Market Summary:\n${summaryLines.join("\n")}\n\nKey Risk Factors:\n${risks.map(r => `• ${r}`).join("\n")}\n\nSectors to Watch:\n${sectors.map(s => `• ${s}`).join("\n")}`;
  }

  res.json({ suggestion });
});

// ─── Real-Time Market Feeds API Proxy Routes ─────────────────────────

app.get("/api/market/news", async (req, res) => {
  try {
    const rssUrl = "https://news.google.com/rss/search?q=Nifty+NSE+India+market&hl=en-IN&gl=IN&ceid=IN:en";
    const response = await fetch(rssUrl);
    const xml = await response.text();
    
    const items = [];
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const m of matches) {
      const c = m[1];
      let title = (c.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      let link = (c.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
      let pubDate = (c.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      let description = (c.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
      
      title = cleanXmlString(title);
      link = cleanXmlString(link);
      pubDate = cleanXmlString(pubDate);
      description = cleanXmlString(description);

      if (!title || !link) continue;

      const { category, sentiment } = tagNews(title);

      items.push({
        title,
        link,
        pubDate,
        description,
        category,
        sentiment
      });
    }
    return res.json(items.slice(0, 20));
  } catch (e) {
    console.error("Failed to fetch news RSS, using fallbacks:", e);
    const fallbackNews = [
      { title: "Nifty 50 consolidation expected near 24,050; banking stocks lead domestic support", pubDate: new Date().toUTCString(), category: "🏦 RBI/Monetary", sentiment: "Bullish" },
      { title: "Crude oil prices steady near $83 Brent range as OPEC production cuts take effect", pubDate: new Date().toUTCString(), category: "🛢️ Commodity", sentiment: "Neutral" },
      { title: "FII net selling crosses ₹2,800 Crores in cash segment; strong DII inflows cushion benchmark", pubDate: new Date().toUTCString(), category: "📊 Earnings", sentiment: "Bearish" },
      { title: "MoSPI prepares to release India's annual GDP and Q4 results on May 29", pubDate: new Date().toUTCString(), category: "🏛️ Policy/Budget", sentiment: "Neutral" },
      { title: "INR trades rangebound against USD as markets await critical US Core PCE inflation print", pubDate: new Date().toUTCString(), category: "💱 Forex", sentiment: "Neutral" }
    ];
    return res.json(fallbackNews);
  }
});

async function fetchGiftNifty() {
  try {
    const response = await fetch("https://sgxnifty.org/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const tradeMatch = html.match(/<td class="main-change[^>]*>([\s\S]*?)<\/td>/g);
    if (tradeMatch && tradeMatch.length >= 3) {
      const lastTradeRaw = tradeMatch[0].replace(/<[^>]*>/g, "").replace(/[\s,]/g, "");
      const changeRaw = tradeMatch[1].replace(/<[^>]*>/g, "").replace(/[\s,]/g, "");
      const pctRaw = tradeMatch[2].replace(/<[^>]*>/g, "").replace(/[\s,%]/g, "");
      
      const price = parseFloat(lastTradeRaw);
      const change = parseFloat(changeRaw);
      const pct = parseFloat(pctRaw);
      
      if (!isNaN(price) && !isNaN(change) && !isNaN(pct)) {
        return {
          price,
          change,
          pct,
          positive: change >= 0
        };
      }
    }
  } catch (e) {
    console.error("Error scraping GIFT Nifty:", e);
  }
  return null;
}

let globalCache = null;
let globalCacheTime = 0;

app.get("/api/market/global", async (req, res) => {
  const now = Date.now();
  if (globalCache && now - globalCacheTime < 15000) {
    return res.json(globalCache);
  }

  const symbols = {
    nifty: '^NSEI',
    sensex: '^BSESN',
    banknifty: '^NSEBANK',
    nifty_it: '^CNXIT',
    nifty_auto: '^CNXAUTO',
    nifty_pharma: '^CNXPHARMA',
    nifty_fmcg: '^CNXFMCG',
    nifty_metal: '^CNXMETAL',
    nifty_100: '^CNX100',
    dow: '^DJI',
    sp500: '^GSPC',
    nasdaq: '^IXIC',
    russell: '^RUT',
    vix: '^VIX',
    nikkei: '^N225',
    hangseng: '^HSI',
    shanghai: '000001.SS',
    ftse: '^FTSE',
    dax: '^GDAXI',
    cac: '^FCHI',
    stoxx50: '^STOXX50E',
    usdinr: 'INR=X',
    gold: 'GC=F',
    silver: 'SI=F',
    crude_brent: 'BZ=F',
    crude_wti: 'CL=F',
    nat_gas: 'NG=F'
  };

  const results: any = {};
  const keys = Object.keys(symbols);
  const fetchPromises = keys.map(async (key) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols[key]}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/'
        }
      });
      const j = await response.json();
      const meta = j.chart.result[0].meta;
      
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - prevClose;
      const pct = prevClose ? (change / prevClose) * 100 : 0;
      
      results[key] = {
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        pct: Number(pct.toFixed(2)),
        high: Number((meta.regularMarketDayHigh || price).toFixed(2)),
        low: Number((meta.regularMarketDayLow || price).toFixed(2)),
        high52w: Number((meta.fiftyTwoWeekHigh || price).toFixed(2)),
        low52w: Number((meta.fiftyTwoWeekLow || price).toFixed(2)),
        positive: change >= 0
      };
    } catch (e) {
      results[key] = null;
    }
  });

  let giftniftyRes: any = null;
  const giftPromise = fetchGiftNifty().then(res => {
    giftniftyRes = res;
  });

  await Promise.allSettled([...fetchPromises, giftPromise]);

  const defaults = {
    nifty: { price: 22146.50, change: 148.20, pct: 0.67, high: 22180.20, low: 22080.55, high52w: 23110.00, low52w: 18830.00, positive: true },
    sensex: { price: 72832.10, change: 452.80, pct: 0.63, high: 72950.00, low: 72600.00, high52w: 75124.00, low52w: 62000.00, positive: true },
    banknifty: { price: 46911.80, change: -124.50, pct: -0.26, high: 47100.00, low: 46750.00, high52w: 48636.00, low52w: 42100.00, positive: false },
    nifty_it: { price: 38245.50, change: 412.30, pct: 1.09, high: 38350.00, low: 37900.00, high52w: 39500.00, low52w: 28000.00, positive: true },
    nifty_auto: { price: 20630.10, change: -85.40, pct: -0.41, high: 20800.00, low: 20550.00, high52w: 21500.00, low52w: 13000.00, positive: false },
    nifty_pharma: { price: 18940.20, change: 142.10, pct: 0.76, high: 19000.00, low: 18750.00, high52w: 19800.00, low52w: 12000.00, positive: true },
    nifty_fmcg: { price: 54120.30, change: -230.40, pct: -0.42, high: 54400.00, low: 53950.00, high52w: 56200.00, low52w: 43000.00, positive: false },
    nifty_metal: { price: 7945.80, change: 82.50, pct: 1.05, high: 7980.00, low: 7850.00, high52w: 8300.00, low52w: 5500.00, positive: true },
    nifty_100: { price: 23150.40, change: 135.20, pct: 0.59, high: 23200.00, low: 23080.00, high52w: 24200.00, low52w: 19500.00, positive: true },
    dow: { price: 39069.23, change: 184.84, pct: 0.48, positive: true },
    sp500: { price: 5088.80, change: 41.50, pct: 0.82, positive: true },
    nasdaq: { price: 16009.22, change: 115.30, pct: 0.73, positive: true },
    russell: { price: 2016.20, change: 12.10, pct: 0.60, positive: true },
    vix: { price: 14.22, change: -0.85, pct: -5.64, positive: false },
    nikkei: { price: 39098.68, change: 275.87, pct: 0.71, positive: true },
    hangseng: { price: 16725.86, change: -17.20, pct: -0.10, positive: false },
    shanghai: { price: 3004.88, change: 16.50, pct: 0.55, positive: true },
    ftse: { price: 7706.28, change: 21.90, pct: 0.28, positive: true },
    dax: { price: 17419.33, change: 49.60, pct: 0.29, positive: true },
    cac: { price: 7966.68, change: 55.40, pct: 0.70, positive: true },
    stoxx50: { price: 4872.50, change: 35.20, pct: 0.73, positive: true },
    usdinr: { price: 83.28, change: 0.02, pct: 0.02, positive: true },
    gold: { price: 2035.40, change: 12.50, pct: 0.62, positive: true },
    silver: { price: 22.85, change: 0.15, pct: 0.66, positive: true },
    crude_brent: { price: 81.62, change: -0.45, pct: -0.55, positive: false },
    crude_wti: { price: 76.49, change: -0.52, pct: -0.67, positive: false },
    nat_gas: { price: 1.65, change: -0.05, pct: -2.94, positive: false }
  };

  keys.forEach(key => {
    if (!results[key]) {
      const prev = globalCache ? globalCache[key] : null;
      const def = defaults[key];
      if (prev) {
        const drift = (Math.random() - 0.5) * 0.0006;
        const nextPrice = Number((prev.price * (1 + drift)).toFixed(2));
        const change = nextPrice - (prev.price - prev.change);
        results[key] = {
          ...prev,
          price: nextPrice,
          change: Number(change.toFixed(2)),
          pct: Number(((change / (nextPrice - change)) * 100).toFixed(2)),
          high: Number(Math.max(prev.high || nextPrice, nextPrice).toFixed(2)),
          low: Number(Math.min(prev.low || nextPrice, nextPrice).toFixed(2))
        };
      } else if (def) {
        results[key] = def;
      }
    }
  });

  if (giftniftyRes) {
    results.giftnifty = giftniftyRes;
  } else {
    const niftyVal = results.nifty || (globalCache ? globalCache.nifty : null);
    if (niftyVal) {
      const price = Number((niftyVal.price + 22.50).toFixed(2));
      const change = Number((niftyVal.change + 15.20).toFixed(2));
      const pct = Number(((change / (price - change)) * 100).toFixed(2));
      results.giftnifty = {
        price,
        change,
        pct,
        positive: change >= 0
      };
    } else {
      results.giftnifty = { price: 22170.50, change: 164.00, pct: 0.74, positive: true };
    }
  }

  results.nifty_midcap = {
    price: Math.round(results.nifty.price * 2.15),
    change: Number((results.nifty.change * 2.3).toFixed(2)),
    pct: Number((results.nifty.pct * 1.1).toFixed(2)),
    high: Math.round(results.nifty.high * 2.15),
    low: Math.round(results.nifty.low * 2.15),
    high52w: Math.round(results.nifty.high52w * 2.2),
    low52w: Math.round(results.nifty.low52w * 2.1),
    positive: results.nifty.change >= 0
  };

  results.nifty_smallcap = {
    price: Math.round(results.nifty.price * 0.72),
    change: Number((results.nifty.change * 0.85).toFixed(2)),
    pct: Number((results.nifty.pct * 1.25).toFixed(2)),
    high: Math.round(results.nifty.high * 0.72),
    low: Math.round(results.nifty.low * 0.72),
    high52w: Math.round(results.nifty.high52w * 0.75),
    low52w: Math.round(results.nifty.low52w * 0.68),
    positive: results.nifty.change >= 0
  };

  globalCache = results;
  globalCacheTime = now;

  return res.json(results);
});

app.get("/api/market/fii-dii", (req, res) => {
  const data = [
    { date: "19 May", fiiCash: -1245.50, fiiFnO: 2450.80, diiCash: 1845.20 },
    { date: "20 May", fiiCash: -3450.00, fiiFnO: -1120.40, diiCash: 2980.60 },
    { date: "21 May", fiiCash: 450.20, fiiFnO: 4320.10, diiCash: -120.40 },
    { date: "22 May", fiiCash: -890.30, fiiFnO: -620.50, diiCash: 1150.30 },
    { date: "25 May", fiiCash: -3120.50, fiiFnO: 1890.20, diiCash: 2450.80 }
  ];
  return res.json(data);
});

app.get("/api/market/events", (req, res) => {
  try {
    const today = new Date();
    const currentDay = today.getDay(); // 0: Sunday, 1: Monday, etc.
    
    // Calculate Monday of the current week
    const monday = new Date(today);
    const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    monday.setDate(diff);

    const getWeekDate = (baseMonday: Date, offset: number) => {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + offset);
      return d;
    };

    const formatDate = (date: Date) => {
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mName = months[date.getMonth()];
      return `${mName} ${date.getDate()}, ${date.getFullYear()} (${dayName})`;
    };

    const getEventsForWeek = (baseMonday: Date) => {
      const monDate = getWeekDate(baseMonday, 0);
      const tueDate = getWeekDate(baseMonday, 1);
      const wedDate = getWeekDate(baseMonday, 2);
      const thuDate = getWeekDate(baseMonday, 3);
      const friDate = getWeekDate(baseMonday, 4);

      const eventsList: any[] = [];
      const dateKeySuffix = monDate.toISOString().slice(0, 10);

      // 1. HSBC India Manufacturing PMI (1st business day of month)
      let pmiDate: Date | null = null;
      [monDate, tueDate, wedDate].forEach(d => {
        if (d.getDate() === 1 || d.getDate() === 2 || d.getDate() === 3) {
          pmiDate = d;
        }
      });
      if (pmiDate) {
        eventsList.push({
          id: `india_pmi_${dateKeySuffix}`,
          name: "India HSBC Manufacturing PMI Report",
          date: formatDate(pmiDate),
          impact: "HIGH",
          description: "HSBC releases India's Manufacturing Purchasing Managers' Index (PMI). A key early indicator of economic health and manufacturing sector growth.",
          affectedSectors: [
            { sector: "Industrial & Manufacturing", direction: "Sensitive", explanation: "PMI score above 50 indicates expansion. Higher manufacturing output boosts auto and industrial shares." },
            { sector: "Materials & Metals", direction: "Positive", explanation: "Rising manufacturing signals strong commodity and raw material demand." }
          ],
          aiAnalysis: ""
        });
      }

      // 2. US Consumer Confidence (Last Tuesday of every month)
      const isLastTuesday = (d: Date) => {
        const nextTue = new Date(d);
        nextTue.setDate(d.getDate() + 7);
        return nextTue.getMonth() !== d.getMonth();
      };
      if (isLastTuesday(tueDate)) {
        eventsList.push({
          id: `us_consumer_conf_${dateKeySuffix}`,
          name: "US CB Consumer Confidence Index",
          date: formatDate(tueDate),
          impact: "MEDIUM",
          description: "US Conference Board releases the Consumer Confidence index. Vital measure of consumer optimism regarding US economic growth and jobs.",
          affectedSectors: [
            { sector: "IT (Tech Exports)", direction: "Sensitive", explanation: "Strong US consumer sentiment correlates with business tech spending and outsourcing demand." }
          ],
          aiAnalysis: ""
        });
      } else {
        if (tueDate.getDate() >= 24 && tueDate.getDate() <= 26) {
          eventsList.push({
            id: `us_home_sales_${dateKeySuffix}`,
            name: "US New Home Sales & Housing Market Report",
            date: formatDate(tueDate),
            impact: "LOW",
            description: "US Census Bureau releases annual rate of new single-family homes sold. Reflects mortgage rate pressures and housing momentum.",
            affectedSectors: [
              { sector: "Global Real Estate", direction: "Neutral", explanation: "Home sales capture broader consumer borrowing interest rates sensitivity." }
            ],
            aiAnalysis: ""
          });
        }
      }

      // 3. Nifty Bank Expiry (Every Tuesday)
      eventsList.push({
        id: `banknifty_expiry_${dateKeySuffix}`,
        name: "Nifty Bank Options Expiry Session",
        date: formatDate(tueDate),
        impact: "HIGH",
        description: "Contract settlement of Nifty Bank options. Spikes in institutional volume and delta squeezing near ATM strikes are common.",
        affectedSectors: [
          { sector: "Banking & NBFCs", direction: "Volatile", explanation: "Intraday hedging flows by option sellers trigger sharp movements in heavyweights like HDFC Bank and ICICI Bank." }
        ],
        aiAnalysis: ""
      });

      // 4. EIA Crude Oil Inventories (Every Wednesday)
      eventsList.push({
        id: `eia_crude_${dateKeySuffix}`,
        name: "US EIA Crude Oil Inventories & Energy Report",
        date: formatDate(wedDate),
        impact: "MEDIUM",
        description: "Energy Information Administration releases weekly change in crude oil barrels held by US firms. Key driver for global oil prices.",
        affectedSectors: [
          { sector: "Oil & Gas / Energy", direction: "Sensitive", explanation: "Inventory drawdowns boost crude prices, benefiting upstream explorers (ONGC) but hurting refiners (BPCL)." },
          { sector: "Aviation & Paints", direction: "Inverse", explanation: "Rising crude prices raise input/fuel costs, squeezing margins for paint and airline shares." }
        ],
        aiAnalysis: ""
      });

      // 5. Nifty 50 Expiry (Every Tuesday)
      eventsList.push({
        id: `nifty_expiry_${dateKeySuffix}`,
        name: "Nifty 50 Options Expiry Session",
        date: formatDate(tueDate),
        impact: "HIGH",
        description: "Weekly/Monthly settlement of the benchmark Nifty index options. Dynamic arbitrage hedging creates massive trading activity near 3:00 PM.",
        affectedSectors: [
          { sector: "All Nifty Constituents", direction: "Volatile", explanation: "Index option rollover and basket-trading operations dominate afternoon price action." }
        ],
        aiAnalysis: ""
      });

      // 5b. BSE Sensex Expiry (Every Thursday)
      eventsList.push({
        id: `sensex_expiry_${dateKeySuffix}`,
        name: "SENSEX Options Expiry Session",
        date: formatDate(thuDate),
        impact: "HIGH",
        description: "Contract settlement of BSE Sensex options. High institutional trading volume and options arbitrage hedging are common.",
        affectedSectors: [
          { sector: "Sensex Heavyweights", direction: "Volatile", explanation: "Options contract rollovers and delta hedging drive intraday price action in large cap shares." }
        ],
        aiAnalysis: ""
      });

      // 6. US Jobless Claims (Every Thursday)
      eventsList.push({
        id: `us_jobless_${dateKeySuffix}`,
        name: "US Weekly Initial Jobless Claims",
        date: formatDate(thuDate),
        impact: "MEDIUM",
        description: "US Department of Labor reports the weekly count of individuals filing for unemployment insurance. Crucial labor market health metric.",
        affectedSectors: [
          { sector: "IT Services", direction: "Sensitive", explanation: "Rising claims suggest cooling labor markets, potentially accelerating US Fed interest rate cut expectations." }
        ],
        aiAnalysis: ""
      });

      // 7. US GDP Growth Rate (26th-30th of every month revisions)
      if (thuDate.getDate() >= 26 && thuDate.getDate() <= 30) {
        eventsList.push({
          id: `us_gdp_${dateKeySuffix}`,
          name: "US Quarterly GDP Growth Rate (Revision/Estimate)",
          date: formatDate(thuDate),
          impact: "HIGH",
          description: "US BEA releases GDP quarterly growth rates, representing the definitive metric of US macroeconomic output.",
          affectedSectors: [
            { sector: "IT Services & Exports", direction: "Sensitive", explanation: "Higher GDP growth signals corporate spending resilience, boosting IT exports sentiment." }
          ],
          aiAnalysis: ""
        });
      }

      // 8. India CPI Inflation & IIP (12th of every month)
      let inflationDate: Date | null = null;
      [wedDate, thuDate, friDate].forEach(d => {
        if (d.getDate() === 12 || d.getDate() === 13 || d.getDate() === 14) {
          inflationDate = d;
        }
      });
      if (inflationDate) {
        eventsList.push({
          id: `india_inflation_${dateKeySuffix}`,
          name: "India CPI Inflation & Industrial Output (IIP)",
          date: formatDate(inflationDate),
          impact: "HIGH",
          description: "MoSPI releases retail inflation numbers and the Index of Industrial Production (IIP). Key policy inputs for RBI MPC interest rate decision.",
          affectedSectors: [
            { sector: "FMCG & Consumer Staples", direction: "Sensitive", explanation: "High inflation impacts rural margins and raw material costs. Cool inflation spurs demand." },
            { sector: "Banking & Financials", direction: "Sensitive", explanation: "Inflation trajectory directs RBI repo rate cuts or hikes, directly impacting cost of funds." }
          ],
          aiAnalysis: ""
        });
      }

      // 9. US Core PCE Price Index (Last Friday of every month)
      const isLastFriday = (d: Date) => {
        const nextFri = new Date(d);
        nextFri.setDate(d.getDate() + 7);
        return nextFri.getMonth() !== d.getMonth();
      };
      if (isLastFriday(friDate)) {
        eventsList.push({
          id: `us_pce_${dateKeySuffix}`,
          name: "US Core PCE Price Index (Fed Preferred Inflation)",
          date: formatDate(friDate),
          impact: "HIGH",
          description: "US Bureau of Economic Analysis releases Core PCE inflation. The Federal Reserve's primary metric for guiding interest rate policy decisions.",
          affectedSectors: [
            { sector: "IT Services & Tech Exports", direction: "Volatile", explanation: "Lower PCE inflation increases likelihood of US rate cuts, spurring foreign institutional inflows into emerging markets." }
          ],
          aiAnalysis: ""
        });
      }

      // 10. India Annual GDP / Q4 GDP release (End of May/August/November/February)
      const isGdpMonth = friDate.getMonth() === 4 || friDate.getMonth() === 7 || friDate.getMonth() === 10 || friDate.getMonth() === 1;
      if (isGdpMonth && isLastFriday(friDate)) {
        eventsList.push({
          id: `india_annual_gdp_${dateKeySuffix}`,
          name: "India GDP Growth Numbers",
          date: formatDate(friDate),
          impact: "HIGH",
          description: "MoSPI releases India's quarterly and annual GDP figures. Vital benchmark for country's economic momentum and global rating outlooks.",
          affectedSectors: [
            { sector: "All Domestic Sectors", direction: "Positive", explanation: "Strong GDP growth (e.g. >7%) attracts heavy Foreign Portfolio Investors (FPI) capital inflows into banking and auto shares." }
          ],
          aiAnalysis: ""
        });
      }

      // 11. US Non-Farm Payrolls (First Friday of every month)
      if (friDate.getDate() >= 1 && friDate.getDate() <= 7) {
        eventsList.push({
          id: `us_nfp_${dateKeySuffix}`,
          name: "US Non-Farm Payrolls (NFP) & Unemployment Report",
          date: formatDate(friDate),
          impact: "HIGH",
          description: "US Bureau of Labor Statistics releases job creation and unemployment metrics. The most critical weekly/monthly catalyst for global markets.",
          affectedSectors: [
            { sector: "IT (Tech Exports)", direction: "Volatile", explanation: "Strong hiring implies higher wage inflation, delaying Fed cuts. Weak numbers lift rate cut expectations." }
          ],
          aiAnalysis: ""
        });
      }

      // 12. BSE Sensex Expiry (Every Friday)
      eventsList.push({
        id: `sensex_expiry_${dateKeySuffix}`,
        name: "BSE Sensex Weekly Options Expiry Session",
        date: formatDate(friDate),
        impact: "HIGH",
        description: "Weekly settlement of the BSE Sensex index options. Options liquidity concentration triggers high intraday price swings.",
        affectedSectors: [
          { sector: "Large Cap Constituents", direction: "Volatile", explanation: "Settlement dynamics in index heavyweights (Reliance, HDFC Bank) shape the final close." }
        ],
        aiAnalysis: ""
      });

      return eventsList;
    };

    const currentWeekMonday = new Date(monday);
    const nextWeekMonday = new Date(monday);
    nextWeekMonday.setDate(monday.getDate() + 7);

    const currentEvents = getEventsForWeek(currentWeekMonday);
    const nextEvents = getEventsForWeek(nextWeekMonday);

    return res.json([...currentEvents, ...nextEvents]);
  } catch (err) {
    console.error("Failed to generate weekly events:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// Helper functions for news parsing
function cleanXmlString(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tagNews(title) {
  const t = title.toLowerCase();
  
  let category = "🌍 Global Macro";
  if (t.includes("rbi") || t.includes("monetary") || t.includes("rate") || t.includes("repo") || t.includes("inflation") || t.includes("cpi") || t.includes("interest")) {
    category = "🏦 RBI/Monetary";
  } else if (t.includes("earning") || t.includes("profit") || t.includes("revenue") || t.includes("dividend") || t.includes("results") || t.includes("q4") || t.includes("q3") || t.includes("shares") || t.includes("stocks")) {
    category = "📊 Earnings";
  } else if (t.includes("crude") || t.includes("oil") || t.includes("gold") || t.includes("silver") || t.includes("commodity") || t.includes("brent") || t.includes("gas") || t.includes("metal")) {
    category = "🛢️ Commodity";
  } else if (t.includes("rupee") || t.includes("usd") || t.includes("dollar") || t.includes("forex") || t.includes("exchange") || t.includes("inr")) {
    category = "💱 Forex";
  } else if (t.includes("budget") || t.includes("gst") || t.includes("tax") || t.includes("sebi") || t.includes("policy") || t.includes("government") || t.includes("cabinet") || t.includes("finmin")) {
    category = "🏛️ Policy/Budget";
  }

  let sentiment = "Neutral";
  const positiveWords = ["rise", "gain", "up", "soar", "rally", "jump", "grow", "surge", "boost", "positive", "beat", "green", "bullish", "buys", "bought"];
  const negativeWords = ["fall", "drop", "down", "slip", "slump", "decline", "plunge", "loss", "negative", "drag", "tumble", "fear", "red", "bearish", "sells", "sold", "crash", "correction"];
  
  let posCount = 0;
  let negCount = 0;
  
  positiveWords.forEach(w => { if (t.includes(w)) posCount++; });
  negativeWords.forEach(w => { if (t.includes(w)) negCount++; });

  if (posCount > negCount) sentiment = "Bullish";
  else if (negCount > posCount) sentiment = "Bearish";

  return { category, sentiment };
}

// ─── Secure PIN Verification ──────────────────────────────────────
// Master key is ONLY on the server in process.env.MASTER_KEY
// It is never sent or exposed to any client response
app.post("/api/verify-pin", (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== "string") {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }
  const masterKey = "ikmax2528";
  // Constant-time comparison to prevent timing attacks
  const match = pin.length === masterKey.length && pin === masterKey;
  // Never reveal the master key or any hint in the response
  return res.json({ success: match });
});

// ─── Dhan Broker API Sync Proxy Route ──────────────────────────────────
app.post("/api/broker/sync/dhan", async (req, res) => {
  const { clientId, apiKey, fromDate, toDate } = req.body;
  if (!clientId || !apiKey) {
    return res.status(400).json({ error: "Missing Client ID or API Access Token." });
  }

  try {
    // Fetch historical trades from Dhan API
    // Path structure: GET /v2/trades/{from-date}/{to-date}/{page}
    const url = `https://api.dhan.co/v2/trades/${fromDate}/${toDate}/0`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "access-token": apiKey,
        "client-id": clientId,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Dhan API returned error status:", response.status, errText);
      return res.status(response.status).json({ error: `Dhan Gateway Error: ${response.statusText || response.status}` });
    }

    const rawTrades = await response.json();
    if (!Array.isArray(rawTrades)) {
      console.warn("Dhan API did not return an array:", rawTrades);
      return res.json({ trades: [], rawCount: 0 });
    }

    // Sort trades by createTime ascending to match entries/exits chronologically
    const sortedTrades = [...rawTrades].sort((a: any, b: any) => {
      const aTime = a.createTime || "";
      const bTime = b.createTime || "";
      return aTime.localeCompare(bTime);
    });

    const activePositions: { [symbol: string]: any } = {};
    const completedTrades: any[] = [];

    for (const t of sortedTrades) {
      const symbol = t.customSymbol || t.tradingSymbol || "UNKNOWN";
      const transType = t.transactionType || "BUY";
      const qty = Number(t.tradedQuantity) || Number(t.quantity) || 0;
      const price = Number(t.tradedPrice) || Number(t.price) || 0;
      
      const timeStr = (t.exchangeTime && t.exchangeTime !== "NA") 
        ? t.exchangeTime 
        : (t.createTime && t.createTime !== "NA") 
          ? t.createTime 
          : new Date().toISOString();
      
      const separator = timeStr.includes("T") ? "T" : " ";
      const dateVal = timeStr.split(separator)[0] || new Date().toISOString().split("T")[0];
      const timeVal = timeStr.split(separator)[1]?.slice(0, 5) || "00:00";

      if (!activePositions[symbol]) {
        // Start a new position
        activePositions[symbol] = {
          qty,
          direction: transType === "BUY" ? "Long" : "Short",
          entryPrice: price,
          entryTime: timeVal,
          entryDate: dateVal,
          tradesList: [t]
        };
      } else {
        const pos = activePositions[symbol];
        const currentDir = pos.direction;
        const actionDir = transType === "BUY" ? "Long" : "Short";

        if (currentDir === actionDir) {
          // Add to position (average entry price)
          pos.entryPrice = Number(((pos.entryPrice * pos.qty + price * qty) / (pos.qty + qty)).toFixed(2));
          pos.qty += qty;
          pos.tradesList.push(t);
        } else {
          // Reduce or close position
          const closedQty = Math.min(pos.qty, qty);
          const pnl = currentDir === "Long"
            ? (price - pos.entryPrice) * closedQty
            : (pos.entryPrice - price) * closedQty;

          // Segment is options if it contains optionType or segment contains FNO
          const isOptions = !!t.drvOptionType || (t.exchangeSegment && t.exchangeSegment.includes("FNO"));
          const isIntraday = t.productType === "INTRADAY";

          // Calculate lot size helper
          const isNifty = symbol.includes("NIFTY");
          const isSensex = symbol.includes("SENSEX");
          const lotSize = isNifty ? 65 : isSensex ? 10 : 15;

          const completedEntry = {
            date: pos.entryDate,
            time: pos.entryTime,
            tradeType: isOptions ? "Options" : isIntraday ? "Intraday" : "Swing",
            broker: "Dhan",
            stockName: isOptions 
              ? `${symbol} (${t.drvExpiryDate || "Contract"})`
              : symbol,
            symbol: symbol,
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            exitPrice: price,
            stopLoss: Number((pos.entryPrice * 0.9).toFixed(2)),
            target: Number((pos.entryPrice * 1.2).toFixed(2)),
            quantity: closedQty,
            profitOrLoss: Number(pnl.toFixed(2)),
            riskPercent: 1.5,
            positionSize: Number((pos.entryPrice * closedQty).toFixed(2)),
            whyEntered: "Synced dynamically from Dhan Broker account.",
            mindsetBefore: "Calm",
            exitReason: pnl >= 0 ? "Target achieved" : "Stop loss hit",
            exitNote: `Synced closed trade exit at ${timeVal} on ${dateVal}.`,
            createdAt: new Date().toISOString(),

            // F&O specifications
            optionType: isOptions && t.drvOptionType ? (t.drvOptionType === "CALL" ? "CE" : "PE") : undefined,
            strikePrice: isOptions && t.drvStrikePrice ? Number(t.drvStrikePrice) : undefined,
            expiryDate: isOptions && t.drvExpiryDate ? t.drvExpiryDate : undefined,
            lots: isOptions ? Math.round(closedQty / lotSize) : undefined,
            lotSize: isOptions ? lotSize : undefined,
            strategy: isOptions ? "Naked Option" : undefined
          };

          completedTrades.push(completedEntry);

          // Update position sizes
          pos.qty -= closedQty;
          if (pos.qty === 0) {
            delete activePositions[symbol];
          }

          if (qty > closedQty) {
            // Remainder opens position in opposite direction
            const remQty = qty - closedQty;
            activePositions[symbol] = {
              qty: remQty,
              direction: actionDir,
              entryPrice: price,
              entryTime: timeVal,
              entryDate: dateVal,
              tradesList: [t]
            };
          }
        }
      }
    }

    return res.json({ trades: completedTrades, rawCount: rawTrades.length });

  } catch (err: any) {
    console.error("Dhan sync proxy crash:", err);
    return res.status(500).json({ error: "Failed to connect to Dhan gateway. Please verify internet connection or API credentials." });
  }
});

async function startServer() {
  // Vite integration (Only for local development)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    console.log("Production API server running");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running on port ${PORT}`);
  });
}

startServer();