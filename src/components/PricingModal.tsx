import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Sparkles, Zap, X, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
}

export const PricingModal: React.FC<PricingModalProps> = ({ 
  isOpen, 
  onClose, 
  userId, 
  userEmail
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const handleUpgrade = async () => {
    if (!userId || !userEmail) {
      setError("Please sign in to upgrade your account.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setCheckoutUrl(null);
    
    console.log("[Checkout] Starting upgrade process...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn("[Checkout] Client-side timeout reached");
      controller.abort();
    }, 30000); 

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userEmail,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = "Failed to create checkout session";
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const session = await response.json();
      if (session.url) {
        console.log("[Checkout] Session URL received:", session.url);
        setCheckoutUrl(session.url);
        
        // Attempt redirect but don't rely on it
        try {
          // Try top-level first
          if (window.top && window.top !== window) {
            window.top.location.href = session.url;
          } else {
            window.location.href = session.url;
          }
        } catch (e) {
          console.warn("[Checkout] Redirect failed, user must click link:", e);
        }
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (err: any) {
      console.error('[Checkout] Error caught:', err);
      if (err.name === 'AbortError') {
        setError("The request is taking longer than expected. Please check your internet connection and try again.");
      } else {
        setError(err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex justify-center items-start sm:items-center py-8 sm:py-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[2.5rem] shadow-2xl my-auto overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-primary/20 blur-[100px] pointer-events-none" />
            
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-8 md:p-12 flex flex-col items-center text-center relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 mb-6">
                <Zap className="w-8 h-8 text-primary-foreground fill-current" />
              </div>

              <h2 className="text-3xl font-bold tracking-tight mb-2">Upgrade to Bento Pro</h2>
              <p className="text-zinc-400 text-sm mb-8 max-w-xs">
                Unlock the full potential of AI-driven meeting intelligence.
              </p>

              <div className="w-full space-y-4 mb-10">
                {[
                  "Unlimited Meeting Analysis",
                  "Interactive Topic Mind Maps",
                  "Emotional Vibe Arc Tracking",
                  "4x Expert Persona Critiques",
                  "Priority AI Processing",
                  "Advanced Export Options"
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-left">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-500" />
                    </div>
                    <span className="text-sm text-zinc-300">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 mb-8">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">€49</span>
                  <span className="text-zinc-500 font-medium">/month</span>
                </div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-primary mt-2">Best Value for Professionals</p>
              </div>

              {!checkoutUrl ? (
                <Button 
                  onClick={handleUpgrade}
                  disabled={isLoading}
                  className={cn(
                    "w-full py-7 rounded-2xl font-bold text-lg shadow-xl transition-all",
                    "bg-primary text-primary-foreground shadow-primary/20 hover:scale-[1.02]",
                    isLoading && "opacity-80 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Preparing Checkout...</span>
                    </div>
                  ) : (
                    "Get Started Now"
                  )}
                </Button>
              ) : (
                <div className="w-full space-y-4">
                  <a 
                    href={checkoutUrl} 
                    target="_top"
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "w-full py-7 h-auto rounded-2xl font-bold text-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 flex items-center justify-center transition-all hover:scale-[1.02]"
                    )}
                  >
                    Open Secure Checkout
                  </a>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                    Redirect blocked? Click the button above to continue.
                  </p>
                </div>
              )}

              {error && (
                <motion.p 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-xs text-rose-500 font-medium bg-rose-500/10 px-4 py-2 rounded-xl border border-rose-500/20"
                >
                  {error}
                </motion.p>
              )}
              
              <p className="text-[10px] text-zinc-500 mt-6 uppercase tracking-widest font-bold">
                Secure payment via Stripe &bull; Cancel anytime
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
