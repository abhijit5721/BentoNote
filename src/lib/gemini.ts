import { GoogleGenAI } from "@google/genai";

export const getAI = () => {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey.startsWith("MY_G") || apiKey === "TODO_KEYHERE") {
    // Only used as a local fallback for demonstration / fast testing
    apiKey = "AIzaSyBujgT31fflBdELktpyIHXEC7AKIuVGIUE"; 
  }
  
  return new GoogleGenAI({ apiKey });
};

// Convenience wrapper — returns a pre-bound model that uses ai.models.generateContent
export const getModel = (modelName = "gemini-flash-latest") => {
  const ai = getAI();
  return {
    generateContent: (req: any) => ai.models.generateContent({ model: modelName, ...req })
  };
};

// Fast model for real-time translation (lighter, lower latency)
export const getFastModel = () => getModel("gemini-2.0-flash-lite");

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
    // We look for the first '{' and then try to find the matching '}' by trying substrings
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
