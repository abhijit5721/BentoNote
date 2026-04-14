import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ArrowRight, Sparkles, Zap, ShieldCheck, Rocket, LayoutDashboard, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SuccessPageProps {
  sessionId: string;
  onBackToDashboard: () => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ sessionId, onBackToDashboard }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    // Clean up URL after a delay
    const timeout = setTimeout(() => {
      window.history.replaceState({}, document.title, "/");
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  const nextSteps = [
    {
      icon: <Rocket className="w-5 h-5 text-primary" />,
      title: "Explore Pro Features",
      description: "Unlock unlimited AI transcriptions and neural drafting tools."
    },
    {
      icon: <LayoutDashboard className="w-5 h-5 text-emerald-500" />,
      title: "Set Up Your Workspace",
      description: "Customize your Bento grid and organize your intelligence hub."
    },
    {
      icon: <Mail className="w-5 h-5 text-amber-500" />,
      title: "Check Your Email",
      description: "We've sent a detailed receipt and a welcome guide to your inbox."
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-background relative overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-2xl w-full glass dark:bg-white/5 border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative z-10 text-center"
      >
        {/* Success Icon Animation */}
        <div className="relative inline-block mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
            className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>
          
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 0, 0.5]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 bg-emerald-500 rounded-full -z-10"
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4 font-heading">
            Payment Successful!
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
            Welcome to <span className="text-primary font-bold">BentoNote Pro</span>. Your account has been upgraded and all premium features are now active.
          </p>

          <div className="flex items-center justify-center gap-3 mb-12">
            <div className="px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Secure Payment Verified
            </div>
            <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-500 text-[10px] font-mono">
              ID: {sessionId.substring(0, 12)}...
            </div>
          </div>
        </motion.div>

        {/* Next Steps Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 text-left">
          {nextSteps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + (idx * 0.1) }}
              className="p-5 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {step.icon}
              </div>
              <h3 className="text-sm font-bold mb-2">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <Button 
            onClick={onBackToDashboard}
            size="lg"
            className="w-full md:w-auto px-12 py-7 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all group"
          >
            Go to My Dashboard
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
          
          <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
            Thank you for choosing BentoNote
          </p>
        </motion.div>
      </motion.div>

      {/* Confetti-like Sparkles */}
      <AnimatePresence>
        {isLoaded && Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              x: Math.random() * window.innerWidth, 
              y: Math.random() * window.innerHeight,
              scale: 0
            }}
            animate={{ 
              opacity: [0, 1, 0],
              y: "-=100",
              scale: [0, 1, 0]
            }}
            transition={{ 
              duration: 2 + Math.random() * 2, 
              repeat: Infinity,
              delay: Math.random() * 2
            }}
            className="absolute pointer-events-none"
          >
            <Sparkles className="w-4 h-4 text-primary opacity-30" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
