import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const session = await ai.live.connect({ 
      model: "gemini-2.0-flash",
      callbacks: {
        onmessage: () => {}
      }
    });
    console.log("Connected to gemini-2.0-flash");
    session.close();
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
