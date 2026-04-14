import { GoogleGenAI } from "@google/genai";

export const diagnoseEnv = () => {
  const keys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    API_KEY: process.env.API_KEY,
    VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY,
  };
  
  const report = Object.entries(keys).map(([name, value]) => {
    if (!value) return `${name}: missing`;
    if (value === "none") return `${name}: "none"`;
    return `${name}: starts with "${value.substring(0, 4)}", length: ${value.length}`;
  }).join(", ");
  
  return report;
};
