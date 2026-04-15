import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Mic,
  Square,
  History,
  Type,
  ListChecks,
  MessageSquare,
  ChevronLeft,
  Calendar,
  Trash2,
  Save,
  Wand2,
  Download,
  AlignLeft,
  Zap,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MindMap } from "./MindMap";
import { auth, db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { diagnoseEnv } from "@/src/lib/diagnostics";
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";

import { 
  getAI, 
  getModel, 
  getFastModel, 
  callAIWithRetry, 
  callAIWithFallback,
  TEXT_MODELS,
  AUDIO_MODELS,
  parseJSONResponse, 
  translateText,
  extractActionItem
} from "@/src/lib/gemini";
import { LANGUAGE_NAME_MAP } from "@/src/lib/constants";

interface SentimentPoint {
  time: string;
  score: number;
  label: string;
}

interface MindMapData {
  nodes: { id: string; group: number; weight: number }[];
  links: { source: string; target: string; value: number }[];
}

interface MeetingData {
  id?: string;
  subject: string;
  keyTopics: string[];
  mom: string;
  actionPoints: string[];
  transcript: string;
  sentiment?: SentimentPoint[];
  mindMap?: MindMapData;
  createdAt: any;
  uid: string;
}


interface MeetingAssistantProps {
  userProfile?: any;
  onUpgrade?: () => void;
  summaryLevel?: 'concise' | 'detailed';
  language?: string;
  targetLanguage?: string;
}

export const MeetingAssistant: React.FC<MeetingAssistantProps> = ({ 
  userProfile, 
  onUpgrade,
  summaryLevel = 'concise',
  language: propsLanguage = 'en-US',
  targetLanguage: propsTargetLanguage = 'en'
}) => {
  const isPro = useMemo(() => {
    const pro = userProfile?.plan === 'pro';
    console.log("MeetingAssistant isPro calculation:", { plan: userProfile?.plan, result: pro });
    return pro;
  }, [userProfile?.plan]);

  useEffect(() => {
    setLanguage(propsLanguage);
  }, [propsLanguage]);

  useEffect(() => {
    setTargetLanguage(propsTargetLanguage);
  }, [propsTargetLanguage]);

  useEffect(() => {
    console.log("MeetingAssistant Status Update:", { plan: userProfile?.plan, isPro });
  }, [userProfile, isPro]);

  const [view, setView] = useState<"assistant" | "history">("assistant");
  const [summaryTab, setSummaryTab] = useState<"summary" | "transcript" | "chat">("summary");
  const [mode, setMode] = useState<"text" | "record">("text");
  const [language, setLanguage] = useState(propsLanguage);
  const [targetLanguage, setTargetLanguage] = useState(propsTargetLanguage);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<MeetingData | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCritiquing, setIsCritiquing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<MeetingData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const lowerQuery = searchQuery.toLowerCase();
    return history.filter(meeting => 
      (meeting.subject || "").toLowerCase().includes(lowerQuery) ||
      (meeting.mom || "").toLowerCase().includes(lowerQuery) ||
      (meeting.transcript || "").toLowerCase().includes(lowerQuery) ||
      (meeting.keyTopics || []).some(topic => topic.toLowerCase().includes(lowerQuery))
    );
  }, [history, searchQuery]);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const isRecordingRef = useRef(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const silentHeartbeatRef = useRef<OscillatorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const isAudioEnabledRef = useRef(false);
  useEffect(() => { isAudioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);
  const targetLanguageRef = useRef(targetLanguage);
  useEffect(() => { targetLanguageRef.current = targetLanguage; }, [targetLanguage]);
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [liveActionItems, setLiveActionItems] = useState<{id: string, task: string, owner: string | null}[]>([]);
  const liveActionItemsRef = useRef<{id: string, task: string, owner: string | null}[]>([]);
  
  const [interimTranscript, setInterimTranscript] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const detectedLanguageRef = useRef<string | null>(null);
  useEffect(() => { detectedLanguageRef.current = detectedLanguage; }, [detectedLanguage]);
  const liveTranscriptRef = useRef("");
  const translationQueueRef = useRef<Promise<void>>(Promise.resolve()); // kept for compat
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve()); // audio-only sequential queue
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const geminiLiveSessionRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const liveTranscriptScrollRef = useRef<HTMLDivElement>(null);

  const primeAudio = async () => {
    if (audioPlayerRef.current) {
      setIsAudioReady(false);
      try {
        // Generate a 0.1s silent WAV buffer programmatically to ensure it's valid
        const sampleRate = 44100;
        const numChannels = 1;
        const bitDepth = 16;
        const dataLength = sampleRate * 0.1 * (bitDepth / 8);
        
        const wavHeader = (sr: number, nc: number, bd: number, dl: number) => {
          const buffer = new ArrayBuffer(44);
          const view = new DataView(buffer);
          const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
              view.setUint8(offset + i, string.charCodeAt(i));
            }
          };
          writeString(0, 'RIFF');
          view.setUint32(4, 36 + dl, true);
          writeString(8, 'WAVE');
          writeString(12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, nc, true);
          view.setUint32(24, sr, true);
          view.setUint32(28, sr * nc * (bd / 8), true);
          view.setUint16(32, nc * (bd / 8), true);
          view.setUint16(34, bd, true);
          writeString(36, 'data');
          view.setUint32(40, dl, true);
          return buffer;
        };

        const header = wavHeader(sampleRate, numChannels, bitDepth, dataLength);
        const silence = new Uint8Array(dataLength).fill(0);
        const wavBlob = new Blob([header, silence], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);
        
        audioPlayerRef.current.src = audioUrl;
        await audioPlayerRef.current.play();
        setIsAudioReady(true);
      } catch (e) {
        console.warn("Audio priming failed:", e);
      }
    }
  };

  const testAudio = async () => {
    // Play a friendly beep to verify AirPods are working
    await playAudio("Test audio sync successful.");
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveTranscriptScrollRef.current) {
      liveTranscriptScrollRef.current.scrollTop = liveTranscriptScrollRef.current.scrollHeight;
    }
  }, [liveTranscript, interimTranscript]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, "meetings"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meetings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MeetingData[];
      setHistory(meetings);
    }, (err) => {
      // Only handle error if we are still signed in
      if (auth.currentUser) {
        setError("Failed to load meeting history.");
        handleFirestoreError(err, OperationType.LIST, "meetings");
      }
    });

    return () => unsubscribe();
  }, [user]);

  const analyzeVibeArc = async () => {
    if (!summary || !summary.transcript) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const model = getModel();
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `Analyze the sentiment of this meeting transcript and generate a "Vibe Arc". 
            
            Return an array of 5 objects with 'time' (string), 'score' (number from -1 to 1), and 'label' (short string like "Positive", "Tense", "Confused").
            
            Format the output as JSON with the key 'sentiment'. Do not include any other text or markdown formatting outside the JSON:\n\n${summary.transcript}` }]
          }
        ],
        generationConfig: { responseMimeType: "application/json" }
      });
      const responseText = result.response.text();

      if (!responseText) throw new Error("No response text from AI");

      const parsedResult = parseJSONResponse(responseText);
      const updatedSummary = { ...summary, sentiment: parsedResult.sentiment };
      setSummary(updatedSummary);
      
      if (summary.id && user) {
        const path = "meetings";
        try {
          const docRef = doc(db, path, summary.id);
          await updateDoc(docRef, { sentiment: parsedResult.sentiment });
        } catch (err) {
          console.error("Failed to update Firestore with vibe arc:", err);
          handleFirestoreError(err, OperationType.UPDATE, `${path}/${summary.id}`);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze vibe arc.");
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeMindMap = async () => {
    if (!summary || !summary.transcript) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const model = getModel();
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `Generate a Visual Topic Mind Map from this meeting transcript. 
            
            Return a JSON object with 'nodes' and 'links'. 
            - Nodes should have 'id' (topic name), 'group' (0 for main subject, 1 for subtopics), and 'weight' (1-10 based on discussion time).
            - Links should have 'source' and 'target' (referencing node IDs) and 'value' (strength of connection 1-5).
            
            Format the output as JSON with the key 'mindMap'. Do not include any other text or markdown formatting outside the JSON:\n\n${summary.transcript}` }]
          }
        ],
        generationConfig: { responseMimeType: "application/json" }
      });
      const responseText = result.response.text();

      if (!responseText) throw new Error("No response text from AI");

      const parsedResult = parseJSONResponse(responseText);
      const updatedSummary = { ...summary, mindMap: parsedResult.mindMap };
      setSummary(updatedSummary);

      if (summary.id && user) {
        const path = "meetings";
        try {
          const docRef = doc(db, path, summary.id);
          await updateDoc(docRef, { mindMap: parsedResult.mindMap });
        } catch (err) {
          console.error("Failed to update Firestore with mind map:", err);
          handleFirestoreError(err, OperationType.UPDATE, `${path}/${summary.id}`);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze mind map.");
    } finally {
      setIsLoading(false);
    }
  };

  const runPersonaCritique = async (persona: string, description: string) => {
    if (!summary) return;
    
    setIsCritiquing(true);
    setSummaryTab("chat");
    
    const prompt = `You are a ${persona} (${description}). Review the following meeting transcript and provide your expert critique. What are the risks? What was missed? What are your recommendations? Be sharp, insightful, and stay in character.
    
    TRANSCRIPT:
    ${summary.transcript}`;

    setChatMessages(prev => [...prev, { role: "user", content: `Get a critique from the ${persona}...` }]);

    try {
      const model = getModel();
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      setChatMessages(prev => [...prev, { role: "assistant", content: result.response.text() }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: "assistant", content: "Failed to get persona critique." }]);
    } finally {
      setIsCritiquing(false);
    }
  };

  const exportMOM = () => {
    if (!summary) return;

    const content = `
SUBJECT: ${summary.subject}
DATE: ${summary.createdAt?.toDate ? summary.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}

KEY TOPICS:
${summary.keyTopics.map(t => `- ${t}`).join('\n')}

MINUTES OF MEETING:
${summary.mom}

ACTION ITEMS:
${summary.actionPoints.map(a => `- ${a}`).join('\n')}

--------------------------------------------------
TRANSCRIPT:
${summary.transcript}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${summary.subject.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_mom.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const askAI = async () => {
    if (!question.trim() || !summary) return;

    const userMsg = question.trim();
    setQuestion("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsAsking(true);

    try {
      const model = getModel();
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `You are an expert meeting assistant. Based on the following meeting transcript, answer the user's question. Be concise and professional.
            
            TRANSCRIPT:
            ${summary.transcript}
            
            QUESTION:
            ${userMsg}` }]
          }
        ]
      });
      setChatMessages(prev => [...prev, { role: "assistant", content: result.response.text() }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error while processing your question." }]);
    } finally {
      setIsAsking(false);
    }
  };

  const playAudio = async (text: string) => {
    try {
      const player = audioPlayerRef.current;
      if (!player) {
        console.warn("Audio player ref not ready");
        return;
      }

      const ai = getAI();
      // Use a timeout to prevent TTS from hanging the translation queue
      const ttsPromise = callAIWithFallback(
        { contents: [{ role: "user", parts: [{ text }] }] },
        AUDIO_MODELS,
        {
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          } as any
        }
      );

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TTS Timeout")), 8000)
      );

      const result = await Promise.race([ttsPromise, timeoutPromise]) as any;
      
      const base64Audio = result.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || 
                         result.response?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = window.atob(base64Audio.replace(/\s/g, ''));
        const view = new DataView(new ArrayBuffer(binaryString.length));
        for (let i = 0; i < binaryString.length; i++) {
          view.setUint8(i, binaryString.charCodeAt(i));
        }
        
        // Upsample to 48kHz for better Bluetooth compatibility (AirPods Pro preference)
        const wavHeader = (sampleRate: number, numChannels: number, bitDepth: number, dataLength: number) => {
          const buffer = new ArrayBuffer(44);
          const view = new DataView(buffer);
          const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
              view.setUint8(offset + i, string.charCodeAt(i));
            }
          };
          writeString(0, 'RIFF');
          view.setUint32(4, 36 + dataLength, true);
          writeString(8, 'WAVE');
          writeString(12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, numChannels, true);
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
          view.setUint16(32, numChannels * (bitDepth / 8), true);
          view.setUint16(34, bitDepth, true);
          writeString(36, 'data');
          view.setUint32(40, dataLength, true);
          return buffer;
        };

        const upsampledBuffer = new Uint8Array(view.byteLength * 2);
        for (let i = 0; i < view.byteLength; i += 2) {
           if (i+1 >= view.byteLength) break;
           const low = view.getUint8(i);
           const high = view.getUint8(i+1);
           upsampledBuffer[i*2] = low;
           upsampledBuffer[i*2+1] = high;
           upsampledBuffer[i*2+2] = low;
           upsampledBuffer[i*2+3] = high;
        }

        const header = wavHeader(48000, 1, 16, upsampledBuffer.byteLength);
        const wavBlob = new Blob([header, upsampledBuffer], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);
        
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const target = devices.find(d => d.kind === 'audiooutput' && 
            (d.label.toLowerCase().includes('airpods') || d.label.toLowerCase().includes('communications') || d.label.toLowerCase().includes('hands-free')));
          if (target && (player as any).setSinkId) {
             await (player as any).setSinkId(target.deviceId);
          }
        } catch (e) {
          console.warn("Sink routing failed", e);
        }

        player.src = audioUrl;
        player.onended = () => URL.revokeObjectURL(audioUrl);
        await player.play();
      }
    } catch (err: any) {
      console.error("TTS error:", err);
      if (err.message?.includes("404")) {
         setError("AI Audio Engine Error (404). Falling back to basic synthesis...");
      }
    }
  };

  const detectLanguageWithGemini = async (blob: Blob) => {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            const parts = reader.result.split(",");
            if (parts.length > 1) {
              resolve(parts[1]);
            } else {
              resolve(reader.result);
            }
          } else {
            reject(new Error("Failed to read audio blob"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await callAIWithFallback(
        {
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: blob.type || "audio/webm", data: base64Data } },
                { text: "Identify the primary language being spoken by the person closest to the microphone. Ignore background noise, music, or television audio. Return strictly the BCP-47 language code (e.g. 'en-US', 'hi-IN', 'bn-IN', 'es-ES') and nothing else. If unsure, return 'en-US'." }
              ]
            }
          ]
        },
        TEXT_MODELS
      );
      const code = result.response?.text?.().trim();
      if (code && (code.match(/^[a-z]{2}-[A-Z]{2}$/) || code.length < 10)) {
        return code;
      }
      return "en-US";
    } catch (err) {
      console.error("Language detection error:", err);
      return "en-US"; // Resilient fallback
    }
  };



  // Setup browser native Speech API for ultra-fast sync
  const setupLiveTranscription = () => {
    console.log("Setting up Live Web Speech API with languageRef:", languageRef.current);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        // For 'auto' mode, use the browser/OS language as the best initial guess.
        // navigator.language is genuine auto-detect — reflects the user's actual locale.
        // Gemini text-detection then confirms/refines the label after the first phrase.
        const currentLang = languageRef.current;
        if (currentLang === 'auto') {
          recognition.lang = navigator.language || 'en-US';
        } else {
          recognition.lang = currentLang;
        }

        recognition.onstart = () => {
          console.log("Web Speech API started. Lang:", recognition.lang);
        };

        recognition.onresult = (event: any) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const prevContext = liveTranscriptRef.current;
              const newText = event.results[i][0].transcript + " ";
              console.log("Speech Result Final:", newText);
              setLiveTranscript(prev => prev + newText);
              liveTranscriptRef.current += newText;

              // --- Text-based Language Detection (fires once, after first sentence) ---
              // Much more reliable than audio sampling for TV/speaker sources.
              // Never restarts the recognizer — no sync breaks.
              if (languageRef.current === 'auto' && !detectedLanguageRef.current && liveTranscriptRef.current.trim().length > 15) {
                setIsDetecting(true);
                const sampleText = liveTranscriptRef.current.trim().slice(0, 200);
                callAIWithFallback(
                  { contents: [{ role: "user", parts: [{ text: `Identify the language of this text. Return ONLY the BCP-47 language code (e.g. 'en-US', 'hi-IN', 'es-ES'). Text: "${sampleText}"` }] }] },
                  TEXT_MODELS
                ).then(result => {
                  const translatedText = result.response?.text?.() || "";
                  const code = translatedText.trim().replace(/['"]/g, '');
                  if (code && isRecordingRef.current) {
                    console.log("Text-based language detected:", code);
                    setDetectedLanguage(code);
                    detectedLanguageRef.current = code;
                    // No recognition restart needed — left box already shows correct words.
                  }
                }).catch(e => console.error("Text lang detect error", e))
                  .finally(() => setIsDetecting(false));
              }

              // --- Translate (text) + Audio Playback ---
              // KEY: Text display is PARALLEL (instant captions).
              // Audio plays in its own sequential queue (no overlap).
              const targetLang = targetLanguageRef.current;
              const trimmed = newText.trim();
              if (targetLang !== 'none' && trimmed.length > 1) {
                // Fire-and-forget for text caption — appears as fast as Gemini replies (~1s)
                (async () => {
                  try {
                    const translated = await translateText(trimmed, targetLang, prevContext, detectedLanguageRef.current);
                    console.log(`Translation Result [${targetLang}]:`, translated);
                    if (translated) {
                      setTranslatedTranscript(prev => prev + translated + " ");
                      
                      // Queue audio separately — use a fire-and-forget IIFE for the queue 
                      // to ensure translations don't wait for audio to finish playing
                      (async () => {
                        if (isAudioEnabledRef.current) {
                          audioQueueRef.current = audioQueueRef.current
                            .then(() => playAudio(translated))
                            .catch(e => console.error("Audio queue error:", e));
                        }
                      })();
                    }

                    // --- Live Action Extraction (Parallel) ---
                    const action = await extractActionItem(trimmed);
                    if (action && action.task) {
                      const id = Math.random().toString(36).substring(7);
                      const newItem = { id, task: action.task, owner: action.owner };
                      setLiveActionItems(prev => [newItem, ...prev].slice(0, 5)); // Keep last 5
                      liveActionItemsRef.current = [newItem, ...liveActionItemsRef.current];
                    }
                  } catch (err) {
                    console.error("Translation error:", err);
                  }
                })();
              } else if (isAudioEnabledRef.current && trimmed.length > 1) {
                // No translation — queue original speech audio only
                audioQueueRef.current = audioQueueRef.current
                  .then(() => playAudio(trimmed))
                  .catch(e => console.error("Audio queue error (direct):", e));
              }
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setInterimTranscript(interim);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech Recognition Error:", event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError("Live transcription is blocked. Audio is still recording and will be processed when you stop. For live captions, open the app in a new tab.");
          } else if (event.error === 'network') {
            setError("Network error: Live transcription requires an internet connection.");
          } else if (event.error !== 'no-speech') {
            setError(`Live transcription error (${event.error}). Audio is still recording.`);
          }
        };

        recognition.onend = () => {
          console.log("Web Speech API session ended.");
          if (isRecordingRef.current) {
            // Wait slightly before restarting to avoid browser throttling
            setTimeout(() => {
              if (isRecordingRef.current) {
                console.log("Restarting Web Speech API with lang:", languageRef.current);
                setupLiveTranscription(); 
              }
            }, 200);
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch (e: any) {
          console.error("Failed to start SpeechRecognition:", e);
          // If already started, ignore. Otherwise show error.
          if (!e.message?.includes('already started')) {
            setError(`Failed to start live transcription: ${e.message || 'Unknown error'}. Audio is still recording.`);
          }
        }
      } catch (e: any) {
        console.error("Failed to initialize SpeechRecognition:", e);
        setError(`Speech recognition initialization failed: ${e.message || 'Unknown error'}. Audio is still recording.`);
      }
    } else {
      console.warn("SpeechRecognition not supported in this browser");
      setError("Live transcription is not supported in this browser. Please use Chrome or Edge for the best experience.");
    }
  };

  const startRecording = async () => {
    // Immediate UI feedback
    setIsRecording(true);
    isRecordingRef.current = true;
    setRecordingTime(0);
    setLiveTranscript("");
    setTranslatedTranscript("");
    setInterimTranscript("");
    setLiveActionItems([]);
    liveActionItemsRef.current = [];
    setDetectedLanguage(null);
    liveTranscriptRef.current = "";
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      audioContextRef.current = audioContext;
      
      // Warm up TTS Playback Engine for Bluetooth support
      const ttsCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ttsCtx.state === 'suspended') {
        await ttsCtx.resume();
      }
      ttsAudioContextRef.current = ttsCtx;

      // Prime the persistent audio player to "bless" the AirPods pipe
      await primeAudio();

      // Start Silent Heartbeat to keep Bluetooth earphones awake
      try {
        const oscillator = ttsCtx.createOscillator();
        const gainNode = ttsCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, ttsCtx.currentTime);
        gainNode.gain.setValueAtTime(0.0001, ttsCtx.currentTime); // Inaudible
        oscillator.connect(gainNode);
        gainNode.connect(ttsCtx.destination);
        oscillator.start();
        silentHeartbeatRef.current = oscillator;
      } catch (err) {
        console.warn("Silent heartbeat failed:", err);
      }
      
      const source = audioContext.createMediaStreamSource(stream);

      // Setup browser native Speech API for ultra-fast sync
      setupLiveTranscription();

      // Find supported mime type for MediaRecorder
      const getSupportedMimeType = () => {
        const types = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
          "audio/aac",
        ];
        for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return "";
      };

      const mimeType = getSupportedMimeType();

      // NOTE: Audio-based language detection removed.
      // We now detect language from transcribed TEXT after the first sentence.
      // Text-detection is faster, more accurate for TV/speaker audio, and avoids the 6-sec gap.

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mediaRecorder;

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        processAudio(audioBlob, liveTranscriptRef.current);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);

      // Setup Audio Meter
      const analyser = audioContext.createAnalyser();
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current = analyser;

      const updateAudioLevel = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(average);
        requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      // Precise timer sync
      const startTime = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
      }, 100);
    } catch (err: any) {
      console.error(err);
      setIsRecording(false);
      isRecordingRef.current = false;
      const errorDetails = err?.name ? `${err.name}: ${err.message}` : String(err);
      setError(`Microphone error (${errorDetails}). If on mobile, try opening the app in a new tab!`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isRecordingRef.current = false;
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (geminiLiveSessionRef.current) {
        geminiLiveSessionRef.current.then((session: any) => session.close());
        geminiLiveSessionRef.current = null;
      }
      if (deepgramWsRef.current) {
        deepgramWsRef.current.close();
        deepgramWsRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (ttsAudioContextRef.current) {
        ttsAudioContextRef.current.close();
        ttsAudioContextRef.current = null;
      }
      setAudioLevel(0);
      setIsRecording(false);
      isRecordingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (silentHeartbeatRef.current) {
        try { silentHeartbeatRef.current.stop(); } catch (e) {}
        silentHeartbeatRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const saveMeeting = async (data: Omit<MeetingData, "uid" | "createdAt"> & { id?: string }) => {
    console.log("[saveMeeting] User state:", user);
    console.log("[saveMeeting] auth.currentUser:", auth.currentUser);
    console.log("[saveMeeting] Data to save:", data);
    if (!user) {
      console.warn("[saveMeeting] No user found, aborting save.");
      return null;
    }
    setIsSaving(true);
    setError(null);
    const path = "meetings";
    try {
      if (data.id) {
        const { id, ...updateData } = data;
        const docRef = doc(db, path, id);
        await updateDoc(docRef, updateData);
        return id;
      } else {
        const docRef = await addDoc(collection(db, path), {
          ...data,
          uid: user.uid,
          createdAt: Timestamp.now()
        });
        return docRef.id;
      }
    } catch (err) {
      console.error("[saveMeeting] Error:", err);
      setError("Failed to save meeting to history.");
      handleFirestoreError(err, data.id ? OperationType.UPDATE : OperationType.WRITE, path);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMeeting = async (id: string) => {
    const path = `meetings/${id}`;
    setError(null);
    try {
      await deleteDoc(doc(db, "meetings", id));
      if (summary?.id === id) {
        setSummary(null);
      }
    } catch (err) {
      setError("Failed to delete meeting.");
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const processAudio = async (blob: Blob, hintTranscript?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            const parts = reader.result.split(",");
            if (parts.length > 1) {
              resolve(parts[1]);
            } else {
              resolve(reader.result);
            }
          } else {
            reject(new Error("Failed to read audio blob"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await callAIWithFallback(
        {
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: blob.type || "audio/webm", data: base64Data } },
                { text: `Transcribe this meeting with speaker diarization (e.g., Speaker A, Speaker B, etc.) and generate a professional Minutes of Meeting (MOM). 
            
            ${language === 'auto' 
              ? 'Detect the primary language spoken in the audio.'
              : `The input language is ${language}.`
            }

            ${targetLanguage !== 'none'
              ? `CRITICAL: The target language for ALL output (MOM, action points, key topics, and transcript) is ${targetLanguage}. You MUST translate everything into ${targetLanguage}.`
              : `CRITICAL: The output should be in the ${language === 'auto' ? 'detected' : language} language.`
            }
            
            ${hintTranscript ? `HINT: Here is a rough live transcript captured during the meeting to help you with accuracy and speaker context: "${hintTranscript}"` : ""}

            Include: 
            1. A concise subject/title for the meeting.
            2. A list of 3-5 key topics discussed.
            3. A detailed speaker-by-speaker transcript (Format: "Speaker A: [text]\nSpeaker B: [text]").
            4. A ${summaryLevel === 'detailed' ? 'detailed, comprehensive paragraph-based' : 'concise, bulleted'} summary of discussion points (MOM). 
            5. A clear list of action items with owners if mentioned. 
            6. A sentiment analysis "Vibe Arc" represented as an array of 5 objects with 'time' (string), 'score' (number from -1 to 1), and 'label' (short string like "Positive", "Tense", "Confused" - translated to ${language === 'auto' ? 'the detected language' : language}).
            7. A Visual Topic Mind Map represented as an object with 'nodes' (array of {id, group, weight}) and 'links' (array of {source, target, value}).
            
            Format the output as JSON with keys: 'subject', 'keyTopics' (array), 'transcript', 'mom', 'actionPoints' (array of strings), 'sentiment' (array of objects), 'mindMap' (object). Do not include any other text or markdown formatting outside the JSON.` }
            ]
          }
        ],
      },
      TEXT_MODELS,
        { generationConfig: { responseMimeType: "application/json" } }
      );

      const rawText = result.response?.text?.() || "";
      const transcriptionResult = parseJSONResponse(rawText);
      if (user) {
        const savedId = await saveMeeting(transcriptionResult);
        if (savedId) {
          setSummary({ ...transcriptionResult, id: savedId });
        } else {
          setSummary(transcriptionResult);
        }
      } else {
        setSummary(transcriptionResult);
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to process audio: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFromText = async () => {
    if (!transcript.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await callAIWithFallback(
        {
          contents: [
            {
              role: "user",
              parts: [{ text: `Generate a professional Minutes of Meeting (MOM) from this transcript. 
            
            ${language === 'auto'
              ? 'CRITICAL: Detect the primary language of the transcript. You MUST generate the MOM, the action points, the key topics, and all other text output entirely in that detected language.'
              : `CRITICAL: The target language for the output is ${language}. You MUST generate the transcript, the MOM, the action points, the key topics, and all other text output entirely in ${language}.`
            }

            Include: 
            1. A concise subject/title for the meeting.
            2. A list of 3-5 key topics discussed.
            3. A detailed speaker-by-speaker transcript (cleaned up and formatted as "Speaker A: [text]\nSpeaker B: [text]"). 
            4. A ${summaryLevel === 'detailed' ? 'detailed, comprehensive paragraph-based' : 'concise, bulleted'} summary of discussion points (MOM). 
            5. A clear list of action items. 
            6. A sentiment analysis "Vibe Arc" represented as an array of 5 objects with 'time' (string), 'score' (number from -1 to 1), and 'label' (short string like "Positive", "Tense", "Confused" - translated to ${language === 'auto' ? 'the detected language' : language}).
            7. A Visual Topic Mind Map represented as an object with 'nodes' (array of {id, group, weight}) and 'links' (array of {source, target, value}).
            
            Format the output as JSON with keys: 'subject', 'keyTopics' (array), 'transcript', 'mom', 'actionPoints' (array of strings), 'sentiment' (array of objects), 'mindMap' (object). Do not include any other text or markdown formatting outside the JSON:\n\n${transcript}` }]
            }
          ]
        },
        TEXT_MODELS,
        { generationConfig: { responseMimeType: "application/json" } }
      );

      const rawText = result.response?.text?.() || "";
      const notesResult = parseJSONResponse(rawText);
      if (user) {
        const savedId = await saveMeeting(notesResult);
        if (savedId) {
          setSummary({ ...notesResult, id: savedId });
        } else {
          setSummary(notesResult);
        }
      } else {
        setSummary(notesResult);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate notes. Please check your transcript.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex p-1.5 glass dark:bg-white/5 rounded-2xl">
          <button
            onClick={() => setView("assistant")}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
              view === "assistant" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Assistant
          </button>
          <button
            onClick={() => setView("history")}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
              view === "history" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
            )}
          >
            <History className="w-3.5 h-3.5" />
            History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary/10 text-primary border-none">
                {history.length}
              </Badge>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {view === "assistant" ? (
            !summary ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col flex-1 min-h-0 space-y-4 overflow-y-auto pr-2 custom-scrollbar"
              >
                <div className="flex p-1.5 glass dark:bg-white/5 rounded-2xl self-start shrink-0">
                <button
                  onClick={() => setMode("text")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                    mode === "text" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  <Type className="w-3.5 h-3.5" />
                  Transcript
                </button>
                <button
                  onClick={() => setMode("record")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                    mode === "record" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  <Mic className="w-3.5 h-3.5" />
                  Record
                </button>
              </div>

              {mode === "text" ? (
                <div className="relative flex-1 min-h-0 group">
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    onPaste={(e) => {
                      // Explicitly handle paste if needed, though standard textarea should work
                      console.log("Paste event triggered");
                    }}
                    placeholder="Paste your Zoom, Teams, or Google Meet transcript here..."
                    className="w-full h-full min-h-[200px] p-5 text-sm rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-4 focus:ring-primary/10 resize-none font-sans transition-all placeholder:text-muted-foreground/50 custom-scrollbar relative z-10"
                  />
                  <Button 
                    onClick={generateFromText} 
                    disabled={isLoading || !transcript.trim()}
                    className="absolute bottom-4 right-4 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                    size="sm"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {isLoading ? "Processing..." : "Generate MOM"}
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 dark:border-white/10 rounded-[2rem] p-6 md:p-8 bg-neutral-50/50 dark:bg-white/5 relative overflow-y-auto custom-scrollbar group">
                  {isRecording ? (
                    <div className="flex flex-col items-center space-y-6 md:space-y-8 relative z-10 w-full py-4">
                      <div className="flex flex-col items-center space-y-4">
                        <div className="text-5xl md:text-7xl font-mono font-black tracking-tighter tabular-nums text-foreground drop-shadow-sm">
                          {formatTime(recordingTime)}
                        </div>
                        <div className="flex items-center justify-center gap-1 h-12 md:h-16 w-full max-w-[240px]">
                          {Array.from({ length: 24 }).map((_, i) => {
                            const distance = Math.abs(i - 11.5);
                            const multiplier = Math.max(0.1, 1 - distance * 0.08);
                            const jitter = audioLevel > 10 ? Math.random() * 0.4 + 0.8 : 1;
                            const height = Math.max(4, (audioLevel / 255) * 64 * multiplier * jitter);
                            return (
                              <motion.div
                                key={i}
                                animate={{ height }}
                                transition={{ type: "tween", duration: 0.05 }}
                                className={cn(
                                  "w-1 md:w-1.5 rounded-full",
                                  audioLevel > 150 ? "bg-rose-500" : "bg-rose-400"
                                )}
                              />
                            );
                          })}
                        </div>
                      </div>
                      
                       {/* Live Transcript Preview — Two Boxes */}
                       <div className={cn(
                         "w-full max-w-2xl grid gap-3",
                         targetLanguage !== 'none' ? "grid-cols-2" : "grid-cols-1"
                       )}>

                         {/* Box 1 — Original / Detected Language */}
                         <div className="px-3 md:px-5 py-3 md:py-4 rounded-[1.5rem] bg-gradient-to-br from-emerald-500/10 via-background to-emerald-500/5 border border-emerald-500/20 shadow-xl backdrop-blur-xl relative overflow-hidden">
                           <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent animate-pulse" />

                           {/* Header */}
                           <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-1.5">
                               <div className="relative flex items-center justify-center">
                                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute" />
                                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 relative" />
                               </div>
                               <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                                 {isDetecting ? "Detecting…" : (detectedLanguage ? `${LANGUAGE_NAME_MAP[detectedLanguage] || detectedLanguage.toUpperCase()}` : "Original")}
                               </span>
                             </div>
                             <div className="flex items-center gap-1.5">
                               {/* Translate dropdown */}
                               <div className="flex items-center gap-1 bg-zinc-200 dark:bg-white/10 px-1.5 py-0.5 rounded-full">
                                 <span className="text-[7px] font-black uppercase text-zinc-500 dark:text-zinc-400">To:</span>
                                 <select
                                   value={targetLanguage}
                                   onChange={(e) => setTargetLanguage(e.target.value)}
                                   className="bg-transparent text-zinc-600 dark:text-zinc-300 text-[8px] font-bold focus:outline-none cursor-pointer"
                                 >
                                   <option value="none">Original</option>
                                   <option value="en">English</option>
                                   <option value="es">Spanish</option>
                                   <option value="fr">French</option>
                                   <option value="de">German</option>
                                   <option value="it">Italian</option>
                                   <option value="pt">Portuguese</option>
                                   <option value="ja">Japanese</option>
                                   <option value="ko">Korean</option>
                                   <option value="zh">Chinese</option>
                                   <option value="hi">Hindi</option>
                                 </select>
                               </div>
                               <Badge variant="outline" className="text-[8px] font-mono bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">Live</Badge>
                             </div>
                           </div>

                           {/* Text area */}
                           <div
                             ref={liveTranscriptScrollRef}
                             className="max-h-[90px] md:max-h-[130px] overflow-y-auto custom-scrollbar"
                           >
                             <div className="text-xs md:text-sm font-medium leading-relaxed text-foreground/90">
                               <span className="opacity-90">{liveTranscript}</span>
                               <span className="opacity-40 italic ml-1">{interimTranscript}</span>
                               {!liveTranscript && !interimTranscript && (
                                 <span className="text-muted-foreground/50 italic flex items-center gap-2 text-[11px]">
                                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                   Listening for speech…
                                 </span>
                               )}
                             </div>
                           </div>
                           <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-emerald-500/5 rounded-full blur-2xl" />
                         </div>

                         {/* Box 2 — Translation (only shown when a target language is selected) */}
                         {targetLanguage !== 'none' && (
                           <div className="px-3 md:px-5 py-3 md:py-4 rounded-[1.5rem] bg-gradient-to-br from-primary/10 via-background to-primary/5 border border-primary/20 shadow-xl backdrop-blur-xl relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-pulse" />

                             {/* Header */}
                             <div className="flex items-center justify-between mb-2">
                               <div className="flex items-center gap-1.5">
                                 <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
                                   {targetLanguage === 'en' ? 'English' : targetLanguage === 'es' ? 'Spanish' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'de' ? 'German' : targetLanguage === 'hi' ? 'Hindi' : targetLanguage === 'zh' ? 'Chinese' : targetLanguage === 'ja' ? 'Japanese' : targetLanguage === 'ko' ? 'Korean' : targetLanguage === 'pt' ? 'Portuguese' : targetLanguage === 'it' ? 'Italian' : targetLanguage.toUpperCase()}
                                 </span>
                               </div>
                               <div className="flex items-center gap-1.5">
                                 <button
                                   onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                                   className={cn(
                                     "text-[8px] font-bold px-2 py-0.5 rounded-full transition-colors",
                                     isAudioEnabled ? "bg-primary text-primary-foreground" : "bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"
                                   )}
                                 >
                                   {isAudioEnabled ? "🔊 ON" : "🔇 OFF"}
                                 </button>
                                 {isAudioReady && isAudioEnabled && (
                                   <button onClick={testAudio} className="text-[7px] font-bold text-primary hover:underline">(TEST)</button>
                                 )}
                                 {!isAudioReady && isAudioEnabled && isRecording && (
                                   <button onClick={primeAudio} className="text-[7px] font-bold text-rose-500 underline animate-pulse">FIX</button>
                                 )}
                               </div>
                             </div>

                             {/* Translated Text */}
                             <div className="max-h-[90px] md:max-h-[130px] overflow-y-auto custom-scrollbar">
                               <div className="text-xs md:text-sm font-medium leading-relaxed italic text-primary/80">
                                 {translatedTranscript || (
                                   <span className="text-muted-foreground/50 not-italic flex items-center gap-2 text-[11px]">
                                     <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse shrink-0" />
                                     Translation will appear here…
                                   </span>
                                 )}
                               </div>
                             </div>
                             <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-primary/5 rounded-full blur-2xl" />
                           </div>
                         )}
                          
                          {/* Box 3 — Live Actions (only shown if something is found) */}
                          <AnimatePresence>
                            {liveActionItems.length > 0 && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="px-3 md:px-5 py-3 md:py-4 rounded-[1.5rem] bg-zinc-900 border border-zinc-800 shadow-2xl relative overflow-hidden"
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Live Actions</span>
                                </div>
                                
                                <div className="space-y-2">
                                  {liveActionItems.map((item) => (
                                    <motion.div 
                                      key={item.id}
                                      initial={{ x: -10, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      className="flex items-start gap-2 bg-white/5 p-2 rounded-xl border border-white/5"
                                    >
                                      <div className="mt-1 w-3 h-3 rounded flex items-center justify-center bg-amber-500/20 text-amber-500">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-[11px] md:text-xs font-semibold text-zinc-100">{item.task}</p>
                                        {item.owner && (
                                          <p className="text-[9px] text-amber-500/80 font-bold uppercase mt-0.5">Assigned to: {item.owner}</p>
                                        )}
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-amber-500/5 rounded-full blur-2xl" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                       </div>

                      <Button variant="destructive" onClick={stopRecording} className="rounded-2xl px-6 md:px-8 py-5 md:py-6 text-sm md:text-base font-bold shadow-xl shadow-rose-500/20">
                        Stop Recording
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-4 md:space-y-6 text-center relative z-10 py-4 w-full">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] md:rounded-[2rem] bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shrink-0">
                        <Mic className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg md:text-xl font-bold tracking-tight">Live Recording</h3>
                        <p className="text-xs md:text-sm text-muted-foreground mt-1">Record your meeting audio directly</p>
                      </div>
                      
                      <div className="flex flex-col gap-3 w-full max-w-[240px]">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Spoken Language</label>
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="w-full p-2.5 md:p-3 text-xs rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-foreground"
                          >
                            <option value="auto">Auto-Detect</option>
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                            <option value="es-ES">Spanish</option>
                            <option value="fr-FR">French</option>
                            <option value="de-DE">German</option>
                            <option value="it-IT">Italian</option>
                            <option value="pt-BR">Portuguese (BR)</option>
                            <option value="ja-JP">Japanese</option>
                            <option value="ko-KR">Korean</option>
                            <option value="zh-CN">Chinese (Mandarin)</option>
                            <option value="hi-IN">Hindi</option>
                            <option value="bn-IN">Bengali</option>
                            <option value="te-IN">Telugu</option>
                            <option value="mr-IN">Marathi</option>
                            <option value="ta-IN">Tamil</option>
                            <option value="ur-IN">Urdu</option>
                            <option value="gu-IN">Gujarati</option>
                            <option value="kn-IN">Kannada</option>
                            <option value="or-IN">Odia</option>
                            <option value="ml-IN">Malayalam</option>
                            <option value="pa-IN">Punjabi</option>
                            <option value="as-IN">Assamese</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Translate To (Audio)</label>
                          <select
                            value={targetLanguage}
                            onChange={(e) => setTargetLanguage(e.target.value)}
                            className="w-full p-2.5 md:p-3 text-xs rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-foreground"
                          >
                            <option value="none">Original (No Translation)</option>
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                            <option value="it">Italian</option>
                            <option value="pt">Portuguese</option>
                            <option value="ja">Japanese</option>
                            <option value="ko">Korean</option>
                            <option value="zh">Chinese</option>
                            <option value="hi">Hindi</option>
                          </select>
                        </div>
                      </div>

                      <Button onClick={startRecording} className="rounded-2xl px-8 md:px-10 py-5 md:py-6 text-sm md:text-base font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-transform">
                        Start Recording
                      </Button>
                      
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 w-full max-w-[320px]">
                        <AlertCircle className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-[10px] text-primary/80 leading-tight text-left">
                          <b>Tip:</b> For virtual meetings with headphones, use <b>Transcript</b> mode for best results.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Background hardware details */}
                  <div className="absolute top-4 left-4 flex gap-1">
                    <div className="w-1 h-1 rounded-full bg-primary/30" />
                    <div className="w-1 h-1 rounded-full bg-primary/30" />
                    <div className="w-1 h-1 rounded-full bg-primary/30" />
                  </div>

                  {isLoading && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center rounded-[2rem] z-20">
                      <div className="relative">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <Sparkles className="w-6 h-6 text-primary absolute -top-2 -right-2 animate-pulse" />
                      </div>
                      <p className="text-lg font-bold mt-4 tracking-tight">Transcribing & Analyzing...</p>
                      <p className="text-xs text-muted-foreground mt-1">Gemini is crafting your meeting notes</p>
                    </div>
                  )}
                </div>
              )}
              {!user && (
                <p className="text-[10px] text-center text-muted-foreground italic">
                  Note: Sign in to save your meetings to history.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col flex-1 min-h-0 space-y-6 overflow-hidden"
            >
              <div className="flex p-1.5 glass dark:bg-white/5 rounded-2xl self-start shrink-0 mb-4">
                <button
                  onClick={() => setSummaryTab("summary")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                    summaryTab === "summary" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Summary
                </button>
                <button
                  onClick={() => setSummaryTab("transcript")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                    summaryTab === "transcript" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Transcript
                </button>
                <button
                  onClick={() => setSummaryTab("chat")}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2",
                    summaryTab === "chat" ? "bg-white dark:bg-zinc-800 shadow-lg text-primary" : "opacity-40 hover:opacity-70"
                  )}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Ask AI
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                {summaryTab === "summary" ? (
                  <>
                    {/* Subject & Topics Section */}
                    <div className="space-y-6">
                      <div className="p-6 rounded-[2.5rem] bg-primary/5 border border-primary/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Sparkles className="w-12 h-12 text-primary" />
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight text-primary mb-2">
                          {summary.subject || "Meeting Summary"}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(summary.keyTopics) && summary.keyTopics.map((topic, i) => (
                            <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-none rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Vibe Arc Section */}
                      {isPro ? (
                        summary.sentiment ? (
                          <section className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-500 px-2">
                              <div className="p-1.5 rounded-lg bg-amber-500/10">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Meeting Vibe Arc</h4>
                            </div>
                            <div className="p-6 rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 shadow-sm overflow-hidden">
                              <div className="h-24 w-full relative flex items-end justify-between px-2">
                                {/* Sentiment Line SVG */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <path
                                    d={`M ${summary.sentiment.map((p, i) => `${(i / (summary.sentiment!.length - 1)) * 100} ${50 - (p.score * 40)}`).join(' L ')}`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="text-amber-500/30"
                                  />
                                    {summary.sentiment.map((p, i) => (
                                      <circle
                                        key={i}
                                        cx={(i / (summary.sentiment!.length - 1)) * 100}
                                        cy={50 - (p.score * 40)}
                                        r="3"
                                        className="fill-amber-500"
                                      />
                                    ))}
                                </svg>
                                
                                {summary.sentiment.map((p, i) => (
                                  <div key={i} className="flex flex-col items-center z-10">
                                    <Badge variant="outline" className={cn(
                                      "text-[8px] px-1.5 py-0 mb-1 border-none font-bold",
                                      p.score > 0.3 ? "bg-emerald-500/10 text-emerald-600" : 
                                      p.score < -0.3 ? "bg-rose-500/10 text-rose-600" : 
                                      "bg-amber-500/10 text-amber-600"
                                    )}>
                                      {p.label}
                                    </Badge>
                                    <span className="text-[8px] uppercase tracking-tighter opacity-40 font-bold">{p.time}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-center mt-4 text-muted-foreground italic">
                                This arc represents the emotional flow of the conversation.
                              </p>
                            </div>
                          </section>
                        ) : (
                          <section className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-500 px-2">
                              <div className="p-1.5 rounded-lg bg-amber-500/10">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Meeting Vibe Arc</h4>
                            </div>
                            <div className="p-8 rounded-3xl bg-amber-500/5 border border-dashed border-amber-500/20 flex flex-col items-center justify-center text-center space-y-4">
                              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-amber-500" />
                              </div>
                              <div>
                                <p className="text-sm font-bold">No Vibe Arc Data</p>
                                <p className="text-xs text-muted-foreground mt-1">This meeting was saved before Vibe Arc was added.</p>
                              </div>
                              <Button 
                                onClick={analyzeVibeArc} 
                                disabled={isLoading}
                                className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Wand2 className="w-3 h-3 mr-2" />}
                                Analyze Vibe Arc Now
                              </Button>
                            </div>
                          </section>
                        )
                      ) : (
                        <section className="space-y-3 opacity-60 grayscale-[0.5]">
                          <div className="flex items-center gap-2 text-amber-500 px-2">
                            <div className="p-1.5 rounded-lg bg-amber-500/10">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Meeting Vibe Arc</h4>
                          </div>
                          <div className="p-8 rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
                              <Zap className="w-8 h-8 text-primary mb-2 fill-current" />
                              <p className="text-xs font-bold text-white mb-3">Bento Pro Feature</p>
                              <Button onClick={onUpgrade} size="sm" className="rounded-xl h-8 text-[10px] font-bold">Upgrade to Unlock</Button>
                            </div>
                            <div className="w-full h-12 bg-neutral-200 dark:bg-white/10 rounded-xl animate-pulse" />
                          </div>
                        </section>
                      )}

                      {/* Mind Map Section */}
                      {isPro ? (
                        summary.mindMap ? (
                          <section className="space-y-3">
                            <div className="flex items-center gap-2 text-indigo-500 px-2">
                              <div className="p-1.5 rounded-lg bg-indigo-500/10">
                                <AlignLeft className="w-4 h-4" />
                              </div>
                              <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Visual Topic Mind Map</h4>
                            </div>
                            <MindMap data={summary.mindMap} />
                            <p className="text-[10px] text-center mt-2 text-muted-foreground italic">
                              Drag nodes to explore connections. Node size represents discussion weight.
                            </p>
                          </section>
                        ) : (
                          <section className="space-y-3">
                            <div className="flex items-center gap-2 text-indigo-500 px-2">
                              <div className="p-1.5 rounded-lg bg-indigo-500/10">
                                <AlignLeft className="w-4 h-4" />
                              </div>
                              <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Visual Topic Mind Map</h4>
                            </div>
                            <div className="p-8 rounded-3xl bg-indigo-500/5 border border-dashed border-indigo-500/20 flex flex-col items-center justify-center text-center space-y-4">
                              <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                <AlignLeft className="w-6 h-6 text-indigo-500" />
                              </div>
                              <div>
                                <p className="text-sm font-bold">No Mind Map Data</p>
                                <p className="text-xs text-muted-foreground mt-1">Generate a mind map to visualize meeting connections.</p>
                              </div>
                              <Button 
                                onClick={analyzeMindMap} 
                                disabled={isLoading}
                                className="rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs"
                              >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Wand2 className="w-3 h-3 mr-2" />}
                                Generate Mind Map
                              </Button>
                            </div>
                          </section>
                        )
                      ) : (
                        <section className="space-y-3 opacity-60 grayscale-[0.5]">
                          <div className="flex items-center gap-2 text-indigo-500 px-2">
                            <div className="p-1.5 rounded-lg bg-indigo-500/10">
                              <AlignLeft className="w-4 h-4" />
                            </div>
                            <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Visual Topic Mind Map</h4>
                          </div>
                          <div className="p-8 rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
                              <Zap className="w-8 h-8 text-primary mb-2 fill-current" />
                              <p className="text-xs font-bold text-white mb-3">Bento Pro Feature</p>
                              <Button onClick={onUpgrade} size="sm" className="rounded-xl h-8 text-[10px] font-bold">Upgrade to Unlock</Button>
                            </div>
                            <div className="w-full h-24 bg-neutral-200 dark:bg-white/10 rounded-xl animate-pulse" />
                          </div>
                        </section>
                      )}

                      {/* MOM Section */}
                      <section className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2 text-primary">
                            <div className="p-1.5 rounded-lg bg-primary/10">
                              <FileText className="w-4 h-4" />
                            </div>
                            <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Minutes of Meeting</h4>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono opacity-50">AI Generated</Badge>
                        </div>
                        <div className="p-6 rounded-3xl bg-neutral-100/50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-sm leading-relaxed shadow-sm">
                          {summary.mom}
                        </div>
                      </section>

                      {/* Action Points */}
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-500 px-2">
                          <div className="p-1.5 rounded-lg bg-emerald-500/10">
                            <ListChecks className="w-4 h-4" />
                          </div>
                          <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Action Items</h4>
                        </div>
                        <div className="grid gap-2">
                          {Array.isArray(summary.actionPoints) && summary.actionPoints.map((point, i) => (
                            <motion.div 
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className="flex gap-3 p-4 text-sm rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors group"
                            >
                              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0 group-hover:scale-110 transition-transform">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              </div>
                              <span className="text-emerald-900 dark:text-emerald-100 font-medium">{point}</span>
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                ) : summaryTab === "transcript" ? (
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-muted-foreground px-2">
                      <div className="p-1.5 rounded-lg bg-muted/10">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Full Transcript</h4>
                    </div>
                    <div className="space-y-4">
                      {summary?.transcript?.split('\n').filter(line => line.trim()).map((line, i) => {
                        const speakerMatch = line.match(/^(Speaker [A-Z]|[^:]+):/);
                        const speaker = speakerMatch ? speakerMatch[1] : null;
                        const text = speaker ? line.replace(speakerMatch[0], '').trim() : line;
                        
                        return (
                          <div key={i} className="flex flex-col space-y-1">
                            {speaker && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary opacity-60 ml-1">
                                {speaker}
                              </span>
                            )}
                            <div className={cn(
                              "p-4 rounded-2xl text-sm leading-relaxed border",
                              speaker 
                                ? "bg-primary/5 border-primary/10 rounded-tl-none" 
                                : "bg-neutral-100/50 dark:bg-white/5 border-neutral-200 dark:border-white/10"
                            )}>
                              {text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <section className="flex flex-col h-full space-y-4">
                    <div className="flex items-center gap-2 text-primary px-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Wand2 className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em]">Ask about this meeting</h4>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-4 min-h-[200px] p-2 custom-scrollbar">
                      {chatMessages.length === 0 && (
                        <div className="space-y-6">
                          <div className="flex flex-col items-center justify-center text-center space-y-3 py-8 opacity-40">
                            <Sparkles className="w-8 h-8" />
                            <p className="text-xs font-medium">Ask me anything about what was discussed!</p>
                          </div>
                          
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary/60 px-2">Expert Personas</h5>
                            <div className="grid grid-cols-2 gap-2 relative">
                              {!isPro && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center z-20 p-4 text-center">
                                  <Zap className="w-6 h-6 text-primary mb-1 fill-current" />
                                  <p className="text-[10px] font-bold text-white mb-2">Bento Pro</p>
                                  <Button onClick={onUpgrade} size="sm" className="rounded-xl h-7 text-[8px] font-bold px-3">Upgrade</Button>
                                </div>
                              )}
                              {[
                                { name: "Skeptical CFO", desc: "Focuses on costs and risks", icon: "💰" },
                                { name: "Creative Visionary", desc: "Focuses on big ideas", icon: "🎨" },
                                { name: "Technical Architect", desc: "Focuses on feasibility", icon: "⚙️" },
                                { name: "Project Manager", desc: "Focuses on timelines", icon: "📅" }
                              ].map((persona) => (
                                <button
                                  key={persona.name}
                                  onClick={() => runPersonaCritique(persona.name, persona.desc)}
                                  disabled={isCritiquing || !isPro}
                                  className="flex flex-col items-start p-3 rounded-2xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-all text-left group"
                                >
                                  <span className="text-lg mb-1">{persona.icon}</span>
                                  <span className="text-[10px] font-bold text-primary">{persona.name}</span>
                                  <span className="text-[8px] text-muted-foreground line-clamp-1">{persona.desc}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex flex-col space-y-1 max-w-[85%]",
                            msg.role === "user" ? "ml-auto items-end" : "items-start"
                          )}
                        >
                          <span className="text-[8px] font-bold uppercase tracking-widest opacity-40 px-1">
                            {msg.role === "user" ? "You" : "Assistant"}
                          </span>
                          <div className={cn(
                            "p-3 rounded-2xl text-xs leading-relaxed",
                            msg.role === "user" 
                              ? "bg-primary text-primary-foreground rounded-tr-none" 
                              : "bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-tl-none"
                          )}>
                            {msg.content}
                          </div>
                        </motion.div>
                      ))}
                      {isAsking || isCritiquing ? (
                        <div className="flex items-start gap-2 opacity-50">
                          <Loader2 className="w-3 h-3 animate-spin mt-1" />
                          <span className="text-[10px] italic">
                            {isCritiquing ? "Expert is reviewing transcript..." : "Thinking..."}
                          </span>
                        </div>
                      ) : null}
                      <div ref={chatEndRef} />
                    </div>

                    <div className="relative mt-auto">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && askAI()}
                        placeholder="Ask a question..."
                        className="w-full p-4 pr-12 text-xs rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <button
                        onClick={askAI}
                        disabled={isAsking || !question.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-all hover:scale-105"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </section>
                )}
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-neutral-200 dark:border-white/10 shrink-0">
                <Button 
                  variant="outline" 
                  onClick={() => setSummary(null)}
                  className="flex-1 rounded-2xl py-6 glass dark:border-white/10 font-bold"
                >
                  New Meeting
                </Button>
                {user && !summary.id && (
                  <Button 
                    onClick={() => saveMeeting(summary)}
                    disabled={isSaving}
                    className="flex-1 rounded-2xl py-6 bg-emerald-500 text-white font-bold shadow-xl shadow-emerald-500/20"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save to History
                  </Button>
                )}
                <Button 
                  onClick={exportMOM}
                  className="flex-1 rounded-2xl py-6 bg-primary text-primary-foreground font-bold shadow-xl shadow-primary/20"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export MOM
                </Button>
              </div>
            </motion.div>
          )
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col flex-1 min-h-0 space-y-4 overflow-hidden"
          >
            {!user ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <History className="w-8 h-8 text-primary opacity-20" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Sign in Required</h3>
                  <p className="text-sm text-muted-foreground">Please sign in to view your meeting history.</p>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-primary opacity-20" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">No History Yet</h3>
                  <p className="text-sm text-muted-foreground">Your saved meetings will appear here.</p>
                </div>
                <Button variant="outline" onClick={() => setView("assistant")} className="rounded-xl">
                  Start a Meeting
                </Button>
              </div>
            ) : (
              <>
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search meetings by subject, topics, or content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                  />
                </div>
                
                {filteredHistory.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Search className="w-8 h-8 text-primary opacity-20" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">No matches found</h3>
                      <p className="text-sm text-muted-foreground">Try adjusting your search terms.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 custom-scrollbar">
                    {filteredHistory.map((meeting) => (
                      <motion.div
                        key={meeting.id}
                        layout
                        className="p-4 rounded-2xl glass dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:border-primary/30 transition-all group cursor-pointer"
                        onClick={() => {
                          setSummary(meeting);
                          setView("assistant");
                        }}
                      >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold line-clamp-1">{meeting.subject || "Untitled Meeting"}</h4>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-medium">
                            <Calendar className="w-3 h-3" />
                            <span>{meeting.createdAt?.toDate().toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{meeting.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (meeting.id) deleteMeeting(meeting.id);
                        }}
                        className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-rose-500 bg-rose-500/10 md:bg-transparent md:opacity-0 md:group-hover:opacity-100 hover:bg-rose-500/20 transition-all z-20"
                        title="Delete meeting"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            </>
            )}
            <Button 
              variant="ghost" 
              onClick={() => setView("assistant")}
              className="w-full rounded-xl gap-2 text-xs font-bold opacity-100 md:opacity-60 md:hover:opacity-100 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Assistant
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

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
      <audio ref={audioPlayerRef} className="hidden" />
    </div>
  );
};
