import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
// Using a model with good knowledge base (GPT-4o or similar recommended, but Grok works)
const MODEL = process.env.MODEL_ID || "x-ai/grok-4.1-fast:free"; 

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("TruthBuy Backend OK");
});

app.post("/analyze", async (req, res) => {
  try {
    const product = req.body?.productData;
    if (!product) {
      return res.status(400).json({ error: "Missing productData" });
    }

    // --- 1. CONSTRUCT THE ENHANCED PROMPT ---
    // We explicitly ask for the "external_signals" JSON structure here.
    const prompt = `
You are TruthBuy, an expert product analyst. 
Your goal is to analyze the provided Amazon product data AND cross-reference it with your internal knowledge of Reddit discussions and Tech News reviews.

Return ONLY valid JSON in this exact format:
{
  "reliability_score": number (0-10),
  "verdict": "BUY" | "CONSIDER" | "AVOID" | "CAUTION",
  "red_flags": [string],
  "pros": [string],
  "cons": [string],
  "suitability": {
    "best": [string],
    "not": [string]
  },
  "score_breakdown": {
    "Reliability": number,
    "Satisfaction": number,
    "Value": number
  },
  "external_signals": {
    "reddit": [
      { "title": string, "link": string, "sentiment": "Positive" | "Negative" | "Neutral" }
    ],
    "news": [
      { "title": string, "source": string, "link": string }
    ]
  },
  "competitors": [string],
  "summary": string,
  "detailed_analysis": string
}

INSTRUCTIONS:
1. **Amazon Analysis**: Use the provided title, price, and reviews to detect detailed risks (e.g., fake reviews, safety issues).
2. **External Context (Crucial)**: 
   - Recall general sentiment from Reddit (r/gadgets, r/buildapc, etc.) regarding this brand/model.
   - If you know specific threads, cite them. If not, generate a valid search link (e.g., "https://www.reddit.com/search/?q=Product+Name").
   - Populate "external_signals" with 2 Reddit points and 2 News/Review points.
3. **Verdict Logic**: 
   - If Reddit hates it but Amazon loves it -> Verdict: "CAUTION" (Score < 6).
   - If both love it -> Verdict: "BUY".
   - If it's a "Generic" unknown brand, assume Reddit sentiment is skeptical.

PRODUCT DATA:
${JSON.stringify(product)}
`;

    // --- 2. CALL THE API ---
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a JSON-only API. Never output markdown blocks. Output raw JSON." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(500).json({ error: "Model API error", details: txt });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // --- 3. ROBUST JSON PARSING ---
    // Cleans up markdown like ```json ... ``` if the model adds it
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    
    if (start === -1 || end === -1) {
      console.error("Invalid Response:", raw);
      return res.status(500).json({ error: "Invalid JSON returned", raw });
    }

    const jsonString = raw.slice(start, end + 1);
    
    try {
      const json = JSON.parse(jsonString);
      res.json({ success: true, analysis: json });
    } catch (parseErr) {
      console.error("JSON Parse Error:", parseErr);
      return res.status(500).json({ error: "JSON Parse Error", raw });
    }

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TruthBuy backend running on port ${PORT}`);
});