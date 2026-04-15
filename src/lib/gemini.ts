import { GoogleGenerativeAI } from "@google/generative-ai";

export const getAI = () => {
  let apiKey = 
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY) || 
    (typeof process !== 'undefined' && process.env && (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY));
  
  if (!apiKey || apiKey.startsWith("MY_G") || apiKey === "TODO_KEYHERE") {
    throw new Error("Missing Gemini API Key. Please add VITE_GEMINI_API_KEY to your .env or .env.local file.");
  }
  
  return new GoogleGenerativeAI(apiKey);
};

// Convenience wrapper — returns a pre-bound model that uses model.generateContent
export const getModel = (modelName = "gemini-1.5-flash") => {
  const ai = getAI();
  return ai.getGenerativeModel({ model: modelName });
};

// Fast model for real-time translation (solid balance of speed/reliability)
export const getFastModel = () => getModel("gemini-1.5-flash");

// Helper for exponential backoff retries
export const callAIWithRetry = async (fn: () => Promise<any>, maxRetries = 3, initialDelay = 2000) => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || String(error);
      const isRetryable = errorMsg.includes("503") || 
                          errorMsg.includes("429") || 
                          errorMsg.includes("high demand") ||
                          errorMsg.includes("overloaded") ||
                          errorMsg.includes("UNAVAILABLE");
      
      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`AI model busy, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export const parseJSONResponse = (text: string) => {
  if (typeof text !== "string") return text;
  
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch (e) {
    // If it fails, try to extract the first valid JSON object
    let start = text.indexOf("{");
    if (start === -1) throw e;
    
    let end = text.lastIndexOf("}");
    while (end > start) {
      const candidate = text.substring(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch (inner) {
        // Find the previous '}' and try again
        end = text.lastIndexOf("}", end - 1);
      }
    }
    throw e;
  }
};

/**
 * Fast translation with rolling context support.
 */
export const translateText = async (text: string, targetLang: string, context: string = "", detectedLang: string | null = null) => {
  if (!text || text.trim().length < 2) return "";
  try {
    // Fast path — if spoken language already matches target, skip translation.
    if (detectedLang && (
      detectedLang.toLowerCase().startsWith(targetLang.toLowerCase()) ||
      targetLang.toLowerCase().startsWith(detectedLang.toLowerCase().slice(0, 2))
    )) {
      return text; // no translation needed
    }

    const resolveLangName = (code: string) => {
      const names: Record<string, string> = {
        'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 
        'it': 'Italian', 'pt': 'Portuguese', 'ja': 'Japanese', 'ko': 'Korean', 
        'zh': 'Chinese', 'hi': 'Hindi', 'bn': 'Bengali', 'ru': 'Russian'
      };
      return names[code.toLowerCase()] || code;
    };
    const targetName = resolveLangName(targetLang);

    const model = getFastModel();
    
    const contextStr = context.trim();
    const systemPrompt = `You are a professional real-time translator.
Translate the NEW SENTENCE into ${targetName}.
${contextStr ? `PREVIOUS CONTEXT for better accuracy: "${contextStr.slice(-400)}"` : ""}

NEW SENTENCE TO TRANSLATE: "${text}"

Reply ONLY with the translated text. No quotes, no intro, no notes.`;

    const result = await model.generateContent(systemPrompt);
    const translated = result.response.text() || "";
    
    // Clean up common AI speech patterns or refusals
    if (translated.toLowerCase().includes("please provide") || translated.toLowerCase().includes("can't translate")) {
      return "";
    }
    
    // Remove edge-case surrounding quotes
    return translated.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.error("Translation error:", err);
    return ""; 
  }
};

/**
 * Detects if a sentence contains an action item or "to-do".
 */
export const extractActionItem = async (text: string) => {
  if (!text || text.trim().length < 5) return null;
  
  try {
    const model = getFastModel();
    const prompt = `Analyze this spoken sentence from a meeting: "${text}"
If it contains a specific action item, task, or request for someone to do something, extract it.

Return ONLY a JSON object: {"task": "The action", "owner": "Name or 'Me' or null"}
If NO action item is found, return ONLY the word: null
No quotes, no code blocks, no intro.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim() || "";
    
    if (response === "null" || !response.includes("{")) return null;
    
    return parseJSONResponse(response);
  } catch (err) {
    console.error("Action extraction error:", err);
    return null;
  }
};
