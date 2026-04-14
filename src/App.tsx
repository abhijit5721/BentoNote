import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Clock, 
  MapPin, 
  Sparkles,
  Moon,
  Sun,
  Heart,
  Mic,
  Wand2,
  LogOut,
  User,
  Zap
} from "lucide-react";
import { BentoGrid, BentoGridItem } from "@/src/components/BentoGrid";
import { MeetingAssistant } from "@/src/components/MeetingAssistant";
import { SmartNote } from "@/src/components/SmartNote";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { auth, signInWithGoogle, logout, db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { PricingModal } from "@/src/components/PricingModal";
import { SettingsModal } from "@/src/components/SettingsModal";
import { SuccessPage } from "@/src/components/SuccessPage";
import { CreditCard, Loader2, X, Settings, ChevronDown, ShieldCheck, Mail, ExternalLink } from "lucide-react";

export default function App() {
  const [time, setTime] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [summaryLevel, setSummaryLevel] = useState<'concise' | 'detailed'>('concise');
  const [language, setLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('none');
  const [isSignInLoading, setIsSignInLoading] = useState(false);

  useEffect(() => {
    console.log("App state updated - summaryLevel:", summaryLevel, "language:", language);
  }, [summaryLevel, language]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [successSessionId, setSuccessSessionId] = useState<string | null>(null);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      setSuccessSessionId(sessionId);
      
      // Workaround: Update plan to 'pro' on the client side since the server webhook
      // might fail due to AI Studio container permission issues.
      if (user) {
        const userRef = doc(db, "users", user.uid);
        
        // Fetch session details from server to get customer ID
        fetch('/api/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
        .then(res => res.json())
        .then(data => {
          const updateData: any = { plan: 'pro' };
          if (data.success && data.customerId) {
            updateData.stripeCustomerId = data.customerId;
          }
          return updateDoc(userRef, updateData);
        })
        .catch(err => {
          console.error("Failed to update plan client-side:", err);
        });
      }
    }
  }, [user]);

  const isPro = userProfile?.plan === 'pro';

  const handleManageSubscription = async () => {
    if (!user || !userProfile) return;
    if (!userProfile.stripeCustomerId) {
      setAuthError("No Stripe customer ID found. Your account may be in a legacy state. Please contact support.");
      return;
    }
    setIsPortalLoading(true);
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.uid,
          stripeCustomerId: userProfile.stripeCustomerId 
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create portal session');
      }
      
      const { url } = await response.json();
      window.location.href = url;
    } catch (error: any) {
      console.error("Portal error:", error);
      setAuthError(error.message);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsSignInLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Sign in error:", error);
      if (error.code === 'auth/popup-blocked') {
        setAuthError("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // This often happens if multiple clicks occur or the user closes it quickly
        // We don't necessarily need to show a big error for this, but we can log it
        console.log("Sign-in popup was closed or cancelled.");
      } else {
        setAuthError(error.message || "An unexpected error occurred during sign-in.");
      }
    } finally {
      setIsSignInLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (!user) {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const setupProfile = async () => {
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      
      try {
        // Check if user profile exists, if not create it
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            plan: 'free',
            usageCount: 0,
            createdAt: new Date().toISOString()
          });
        }

        // Listen for profile changes
        unsubProfile = onSnapshot(userRef, (doc) => {
          const data = doc.data();
          if (data) {
            setUserProfile(data);
          }
        }, (err) => {
          // Only handle error if we are still signed in
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }
        });
      } catch (err) {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }
      }
    };

    setupProfile();

    return () => {
      if (unsubProfile) unsubProfile();
    };
  }, [user]);

  useEffect(() => {
    console.log("App State Update:", { 
      isAuthReady, 
      hasUser: !!user, 
      plan: userProfile?.plan,
      isPro: userProfile?.plan === 'pro'
    });
  }, [isAuthReady, user, userProfile]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = timeZone.split('/').pop()?.replace('_', ' ') || "Unknown";
  const offset = -time.getTimezoneOffset() / 60;
  const gmtOffset = `GMT${offset >= 0 ? '+' : ''}${offset}`;

  if (successSessionId) {
    return (
      <SuccessPage 
        sessionId={successSessionId} 
        onBackToDashboard={() => setSuccessSessionId(null)} 
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen transition-colors duration-500 p-4 md:p-8 font-sans relative overflow-x-hidden">
        <div className="atmosphere" />
        
        {/* Header / Controls */}
        <div className="max-w-7xl mx-auto mb-8 md:mb-12 flex justify-between items-center relative z-50 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 md:gap-4 min-w-0"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/20 shrink-0">
              <Sparkles className="w-5 h-5 md:w-7 md:h-7 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-3xl font-bold tracking-tighter leading-none font-heading truncate">BentoNote</h1>
                {user && isPro ? (
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0 rounded-full border-none shadow-lg shadow-primary/20">PRO</Badge>
                ) : (
                  <Badge variant="outline" className="hidden xs:flex text-[10px] font-mono border-primary/20 text-primary bg-primary/5 px-2 py-0 rounded-full">v2.0</Badge>
                )}
              </div>
              <p className="hidden sm:block text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-bold mt-1.5 opacity-60 truncate">AI-Powered Intelligence Hub</p>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 md:gap-3 shrink-0"
          >
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full glass dark:bg-white/5 border border-white/10">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">System Online</span>
            </div>

            {isAuthReady && (
              user ? (
                <div className="relative">
                  <div 
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 rounded-2xl glass dark:bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || ""} className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-primary/20" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="hidden xl:block">
                        <p className="text-[10px] font-bold leading-none">{user.displayName}</p>
                        <p className="text-[8px] text-muted-foreground mt-0.5">{user.email}</p>
                      </div>
                    </div>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
                  </div>

                  <AnimatePresence>
                    {isProfileOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsProfileOpen(false)} 
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 mt-3 w-72 rounded-3xl glass dark:bg-zinc-900/90 border border-white/10 shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="p-5 border-bottom border-white/5">
                            <div className="flex items-center gap-3">
                              {user.photoURL ? (
                                <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-primary/20" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="w-5 h-5 text-primary" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-bold">{user.displayName}</p>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Mail className="w-3 h-3" />
                                  {user.email}
                                </div>
                              </div>
                            </div>
                            {isPro && (
                              <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-xl border border-primary/20">
                                <ShieldCheck className="w-4 h-4 text-primary" />
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Pro Member</span>
                              </div>
                            )}
                          </div>

                          <div className="p-2">
                            <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">Account</div>
                            
                            {isPro ? (
                              <button 
                                onClick={() => {
                                  setIsProfileOpen(false);
                                  handleManageSubscription();
                                }}
                                disabled={isPortalLoading}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                    {isPortalLoading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <CreditCard className="w-4 h-4 text-zinc-500 group-hover:text-primary" />}
                                  </div>
                                  <span className="text-xs font-medium">Manage Subscription</span>
                                </div>
                                <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            ) : (
                              <button 
                                onClick={() => {
                                  setIsProfileOpen(false);
                                  setIsPricingOpen(true);
                                }}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-primary fill-current" />
                                  </div>
                                  <span className="text-xs font-medium text-primary">Upgrade to Pro</span>
                                </div>
                                <ChevronDown className="w-3 h-3 text-primary -rotate-90" />
                              </button>
                            )}

                            <button 
                              onClick={() => {
                                setIsProfileOpen(false);
                                setIsSettingsOpen(true);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-zinc-200 dark:group-hover:bg-white/10 transition-colors">
                                <Settings className="w-4 h-4 text-zinc-500" />
                              </div>
                              <span className="text-xs font-medium">Settings</span>
                            </button>

                            <div className="my-2 h-px bg-white/5" />

                            <button 
                              onClick={() => {
                                logout();
                                setIsProfileOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rose-500/10 text-rose-500 transition-colors group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                <LogOut className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold">Sign Out</span>
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <Button 
                    onClick={handleSignIn} 
                    disabled={isSignInLoading}
                    className="rounded-2xl px-4 md:px-6 font-bold shadow-xl shadow-primary/20 h-10 md:h-12"
                  >
                    {isSignInLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </div>
              )
            )}

            <AnimatePresence>
              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full mt-2 right-0 bg-rose-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-2 z-50 max-w-[200px]"
                >
                  <span className="flex-1">{authError}</span>
                  <button onClick={() => setAuthError(null)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="rounded-2xl w-10 h-10 md:w-12 md:h-12 glass dark:border-white/10 hover:scale-110 transition-transform shadow-xl shrink-0"
            >
              {isDarkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
            </Button>
          </motion.div>
        </div>

        <BentoGrid className="max-w-7xl mx-auto relative z-10">
          {/* Clock Widget */}
          <BentoGridItem
            title="Chronos"
            description="Global synchronization & local time"
            icon={<Clock className="w-4 h-4 text-neutral-500" />}
            className="md:col-span-1"
            header={
              <div className="flex flex-col items-center justify-center h-full py-6">
                <span className="text-6xl font-mono font-bold tracking-tighter tabular-nums bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
                  {formattedTime}
                </span>
                <div className="flex items-center gap-2 mt-4 px-3 py-1 rounded-full bg-neutral-100 dark:bg-white/5 text-[10px] font-bold tracking-widest uppercase opacity-60">
                  <MapPin className="w-3 h-3" />
                  <span>{city} • {gmtOffset}</span>
                </div>
              </div>
            }
          />

          {/* Meeting Assistant Widget */}
          <BentoGridItem
            title="Meeting Intelligence"
            description="Autonomous transcription & MOM generation"
            icon={<Mic className="w-4 h-4 text-primary" />}
            className="md:col-span-2 md:row-span-2 p-4 md:p-6"
            header={<MeetingAssistant userProfile={userProfile} onUpgrade={() => setIsPricingOpen(true)} summaryLevel={summaryLevel} language={language} targetLanguage={targetLanguage} />}
          />

          {/* Smart Note Widget */}
          <BentoGridItem
            title="Neural Notes"
            description="AI-driven content synthesis & drafting"
            icon={<Wand2 className="w-4 h-4 text-primary" />}
            className="md:col-span-1 md:row-span-2"
            header={<SmartNote />}
          />

        </BentoGrid>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto mt-16 pb-8 text-center">
          <p className="text-xs text-neutral-500 uppercase tracking-[0.2em]">
            &copy; 2026 BentoNote &bull; Built with Passion
          </p>
        </footer>

        <PricingModal 
          isOpen={isPricingOpen} 
          onClose={() => setIsPricingOpen(false)} 
          userId={user?.uid || ""}
          userEmail={user?.email || ""}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          userProfile={userProfile}
          summaryLevel={summaryLevel}
          setSummaryLevel={setSummaryLevel}
          language={language}
          setLanguage={setLanguage}
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          onManageSubscription={() => {
            setIsSettingsOpen(false);
            if (userProfile?.plan === 'pro') {
              handleManageSubscription();
            } else {
              setIsPricingOpen(true);
            }
          }}
          onSignOut={() => {
            setIsSettingsOpen(false);
            logout();
          }}
        />
      </div>
    </TooltipProvider>
  );
}
