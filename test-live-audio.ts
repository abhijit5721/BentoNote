import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const ai = new GoogleGenAI({ 
  apiKey: "AIzaSyBujgT31fflBdELktpyIHXEC7AKIuVGIUE",
  httpOptions: { apiVersion: 'v1alpha' }
});

async function run() {
  try {
    const session = await ai.live.connect({ 
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction: "You are a transcriber. Transcribe the audio.",
      },
      callbacks: {
        onmessage: (msg) => {
          if (msg.serverContent?.modelTurn?.parts) {
            console.log("Received text:", msg.serverContent.modelTurn.parts[0].text);
          }
        },
        onerror: (err) => console.error("Live API Error:", err),
        onclose: () => console.log("Live API Closed")
      }
    });
    console.log("Connected");
    
    // Send 1 second of silence
    const dummyAudio = new Uint8Array(16000 * 2);
    const base64Audio = Buffer.from(dummyAudio).toString("base64");
    
    await session.sendRealtimeInput({
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Audio
      }
    });
    
    await session.sendClientContent({ turnComplete: true });
    
    setTimeout(() => {
      session.close();
    }, 3000);
    
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
