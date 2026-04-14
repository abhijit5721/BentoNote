import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ 
  apiKey: "AIzaSyBujgT31fflBdELktpyIHXEC7AKIuVGIUE",
  httpOptions: { apiVersion: 'v1alpha' }
});
async function run() {
  try {
    const session = await ai.live.connect({ 
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onmessage: () => {}
      }
    });
    console.log("Connected to gemini-3.1-flash-live-preview with v1alpha");
    session.close();
  } catch (e) {
    console.error("Error with gemini-2.0-flash v1alpha:", e);
  }
}
run();
