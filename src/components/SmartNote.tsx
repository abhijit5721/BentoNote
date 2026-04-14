import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Mic,
  Square,
  Type,
  Wand2,
  ListTodo,
  AlignLeft,
  Copy,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Lazy initialization of Gemini AI
let aiClient: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiClient) {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
    
    // Hardcoded fallback because the UI is injecting the wrong value ("MY_G...")
    if (!apiKey || apiKey.startsWith("MY_G") || apiKey === "TODO_KEYHERE") {
      apiKey = "AIzaSyBujgT31fflBdELktpyIHXEC7AKIuVGIUE";
    }
    
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

// Helper for exponential backoff retries
const callAIWithRetry = async (fn: () => Promise<any>, maxRetries = 3, initialDelay = 2000) => {
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

type NoteAction = "summarize" | "tasks" | "draft";

export const SmartNote = () => {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<NoteAction>("summarize");
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    setIsRecording(true);
    setRecordingTime(0);
    setError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      
      const startTime = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
      }, 100);
    } catch (err) {
      console.error(err);
      setIsRecording(false);
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      try {
        const ai = getAI();
        const base64Data = (reader.result as string).split(",")[1];
        const prompt = getPromptForAction(activeAction);
        
        const response = await callAIWithRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "audio/webm", data: base64Data } },
                { text: prompt }
              ]
            }
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        }));

        setResult(response.text || "No content generated.");
      } catch (err) {
        console.error("Audio processing error:", err);
        setError(`Failed to process audio: ${err instanceof Error ? err.message : "Please try again."}`);
      } finally {
        setIsLoading(false);
      }
    };
  };

  const getPromptForAction = (action: NoteAction) => {
    switch (action) {
      case "summarize":
        return "Summarize the following content concisely. Focus on the core message and key takeaways.";
      case "tasks":
        return "Extract all actionable items and tasks from the following content. Present them as a clear bulleted list.";
      case "draft":
        return "Based on the following input, draft a professional and well-structured piece of content (like an email, post, or report). Expand on the ideas provided.";
      default:
        return "Analyze the following content.";
    }
  };

  const handleProcess = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const ai = getAI();
      const prompt = getPromptForAction(activeAction);
      const response = await callAIWithRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt}\n\nInput:\n${input}` }]
          }
        ],
        config: {
          thinkingConfig: { thinkingLevel: activeAction === "draft" ? ThinkingLevel.HIGH : ThinkingLevel.LOW }
        }
      }));

      setResult(response.text || "No content generated.");
    } catch (err) {
      console.error("Content generation error:", err);
      setError(`Failed to generate content: ${err instanceof Error ? err.message : "Please try again."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="input-stage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col h-full space-y-4"
          >
            {/* Action Selector */}
            <div className="flex p-1.5 glass dark:bg-white/5 rounded-2xl gap-1.5">
              {(["summarize", "tasks", "draft"] as NoteAction[]).map((action) => (
                <button
                  key={action}
                  onClick={() => setActiveAction(action)}
                  className={cn(
                    "flex-1 px-2 py-2.5 text-[10px] font-bold rounded-xl transition-all capitalize flex flex-col items-center justify-center gap-1.5",
                    activeAction === action ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  {action === "summarize" && <AlignLeft className="w-4 h-4" />}
                  {action === "tasks" && <ListTodo className="w-4 h-4" />}
                  {action === "draft" && <Wand2 className="w-4 h-4" />}
                  {action}
                </button>
              ))}
            </div>

            <div className="relative flex-1 group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Type or record to ${activeAction}...`}
                className="w-full h-full min-h-[160px] p-5 text-sm rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-4 focus:ring-primary/10 resize-none font-sans transition-all placeholder:text-muted-foreground/50"
              />
              
              <div className="absolute bottom-4 right-4 flex gap-3 z-30">
                <Button
                  size="icon"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "w-12 h-12 rounded-2xl shadow-xl transition-all",
                    isRecording ? "shadow-rose-500/20" : "glass dark:border-white/10"
                  )}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button 
                  size="icon"
                  onClick={handleProcess} 
                  disabled={isLoading || !input.trim()}
                  className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </Button>
              </div>

              {isRecording && (
                <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center border-2 border-rose-500/50 z-20">
                  <div className="relative">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-rose-500 rounded-full blur-2xl"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-2xl shadow-rose-500/40 relative z-10 cursor-pointer hover:scale-110 transition-transform"
                      onClick={stopRecording}
                    >
                      <Square className="w-8 h-8 text-white fill-white" />
                    </motion.div>
                  </div>
                  <span className="text-xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-4 tracking-tighter">
                    Recording...
                  </span>
                  <p className="text-[10px] text-rose-500/60 uppercase tracking-widest mt-2 font-bold">Click to Stop</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result-stage"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col h-full space-y-4"
          >
            <div className="flex-1 overflow-y-auto p-6 rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 relative group shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none capitalize px-3 py-1 rounded-lg">
                  {activeAction} Result
                </Badge>
                <Button variant="ghost" size="icon" onClick={copyToClipboard} className="w-10 h-10 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors">
                  <Copy className="w-5 h-5" />
                </Button>
              </div>
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans">
                {result}
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setResult(null)}
              className="w-full rounded-2xl py-6 glass dark:border-white/10 gap-2 font-bold"
            >
              <RotateCcw className="w-4 h-4" />
              New Smart Note
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 text-sm text-rose-500 bg-rose-500/10 rounded-2xl border border-rose-500/20"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium">{error}</span>
        </motion.div>
      )}
    </div>
  );
};
