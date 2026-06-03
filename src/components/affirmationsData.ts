export interface AffirmationTemplate {
  tamil: string;
  english: string;
}

export const AFFIRMATION_PREFIXES: AffirmationTemplate[] = [
  { tamil: "இன்று, ", english: "Today, " },
  { tamil: "நான் முழுமையாக நம்புகிறேன், ", english: "I completely believe that " },
  { tamil: "என் வாழ்க்கையில், ", english: "In my life, " },
  { tamil: "ஒவ்வொரு நொடியும், ", english: "Every single moment, " },
  { tamil: "அமைதியுடன், ", english: "With deep peace, " },
  { tamil: "நம்பிக்கையோடு, ", english: "With absolute confidence, " },
  { tamil: "பிரபஞ்சத்தின் அருளால், ", english: "By the grace of the universe, " },
  { tamil: "நன்றியுணர்வுடன், ", english: "With a grateful heart, " },
  { tamil: "இப்போது, ", english: "Right now, " },
  { tamil: "என் உள்மனதில், ", english: "In my inner soul, " },
  { tamil: "மகிழ்ச்சியுடன், ", english: "With pure joy, " },
  { tamil: "வெற்றியின் பாதையில், ", english: "On the path to success, " }
];

export const AFFIRMATION_CORES: AffirmationTemplate[] = [
  { tamil: "என் மனம் நேர்மறை எண்ணங்களால் நிரம்பியுள்ளது", english: "my mind is filled with positive thoughts" },
  { tamil: "என் உடல் ஆரோக்கியத்துடனும் ஆற்றலுடனும் திகழ்கிறது", english: "my body is vibrant with health and energy" },
  { tamil: "செல்வமும் நல்வாழ்வும் என்னை நோக்கி ஈர்க்கப்படுகின்றன", english: "wealth and abundance flow naturally to me" },
  { tamil: "என் செயல்கள் அனைத்தும் எனக்கு நன்மையையே தருகின்றன", english: "all my actions lead to positive outcomes" },
  { tamil: "நான் எடுக்கின்ற முயற்சிகள் அனைத்தும் வெற்றியை அடைகின்றன", english: "every effort I make leads to success" },
  { tamil: "என் குடும்பம் அன்பினாலும் அமைதியினாலும் சூழப்பட்டுள்ளது", english: "my family is surrounded by love and peace" },
  { tamil: "நான் புதிய வாய்ப்புகளை எளிதாக ஈர்க்கிறேன்", english: "I attract wonderful new opportunities effortlessly" },
  { tamil: "என்னை சுற்றியுள்ளவர்களுக்கு நான் அன்பைப் பரப்புகிறேன்", english: "I radiate warmth and love to everyone around me" },
  { tamil: "என் வாழ்க்கை நாளுக்கு நாள் சிறந்து விளங்குகிறது", english: "my life is becoming better and brighter every day" },
  { tamil: "நான் கவலைகளை மறந்து இந்த நொடிக் கணத்தில் வாழ்கிறேன்", english: "I release all worries and live fully in the present" },
  { tamil: "நான் நினைத்த காரியங்களை சாதிக்கும் வலிமை கொண்டுள்ளேன்", english: "I possess the inner strength to achieve my dreams" },
  { tamil: "என் நிதி நிலைமை தொடர்ந்து வளர்ந்து கொண்டே இருக்கிறது", english: "my financial situation is constantly growing and improving" }
];

export const AFFIRMATION_SUFFIXES: AffirmationTemplate[] = [
  { tamil: " மற்றும் நான் மகிழ்ச்சியாக இருக்கிறேன்.", english: " and I am truly happy." },
  { tamil: " மற்றும் நான் பேரமைதியை உணர்கிறேன்.", english: " and I feel a profound sense of peace." },
  { tamil: " மற்றும் என் வாழ்வு வளமாகிறது.", english: " and my life becomes prosperous." },
  { tamil: " மற்றும் நான் பாதுகாப்பாக உணர்கிறேன்.", english: " and I feel safe and secure." },
  { tamil: " மற்றும் எனது இலக்குகளை நான் அடைகிறேன்.", english: " and I am reaching my goals." },
  { tamil: " மற்றும் நான் இறைவனுக்கு நன்றி கூறுகிறேன்.", english: " and I express my gratitude to the Divine." },
  { tamil: " மற்றும் எனது நல்வாழ்வு பெருகுகிறது.", english: " and my well-being is expanding." },
  { tamil: " மற்றும் எனது எதிர்காலம் பிரகாசமாக உள்ளது.", english: " and my future is incredibly bright." },
  { tamil: " மற்றும் எனது ஆற்றல் அதிகரிக்கிறது.", english: " and my energy levels are soaring." },
  { tamil: " மற்றும் நான் பிரபஞ்சத்திற்கு நன்றி செலுத்துகிறேன்.", english: " and I thank the universe for its guidance." },
  { tamil: " மற்றும் நான் சுதந்திரமாக வாழ்கிறேன்.", english: " and I live with complete freedom." },
  { tamil: " மற்றும் எனது கனவுகள் நனவாகின்றன.", english: " and my dreams are turning into reality." }
];

export function generateRandomAffirmations(count: number = 10): { id: number; text: string }[] {
  const result: { id: number; text: string }[] = [];
  const generatedKeys = new Set<string>();

  // Maximum combinations: 12 * 12 * 12 = 1728
  // Generate distinct items
  let safetyCounter = 0;
  while (result.length < count && safetyCounter < 1000) {
    safetyCounter++;
    const pIdx = Math.floor(Math.random() * AFFIRMATION_PREFIXES.length);
    const cIdx = Math.floor(Math.random() * AFFIRMATION_CORES.length);
    const sIdx = Math.floor(Math.random() * AFFIRMATION_SUFFIXES.length);
    
    const key = `${pIdx}-${cIdx}-${sIdx}`;
    if (generatedKeys.has(key)) continue;
    generatedKeys.add(key);

    const prefix = AFFIRMATION_PREFIXES[pIdx];
    const core = AFFIRMATION_CORES[cIdx];
    const suffix = AFFIRMATION_SUFFIXES[sIdx];

    const tamilText = `${prefix.tamil}${core.tamil}${suffix.tamil}`;
    const englishText = `${prefix.english}${core.english}${suffix.english}`;

    result.push({
      id: result.length + 1,
      text: `${tamilText} / ${englishText}`
    });
  }

  return result;
}
