import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Palette, Bot, User, Moon, Sun, Monitor, ChevronRight, CreditCard, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  userProfile: any;
  onManageSubscription: () => void;
  onSignOut: () => void;
  summaryLevel: 'concise' | 'detailed';
  setSummaryLevel: (level: 'concise' | 'detailed') => void;
  language: string;
  setLanguage: (lang: string) => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  setIsDarkMode,
  userProfile,
  onManageSubscription,
  onSignOut,
  summaryLevel,
  setSummaryLevel,
  language,
  setLanguage,
  targetLanguage,
  setTargetLanguage
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'ai' | 'account'>('appearance');

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'ai', label: 'AI Preferences', icon: Bot },
    { id: 'account', label: 'Account', icon: User },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-3xl bg-zinc-50 dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-white/10 flex flex-col md:flex-row h-[80vh] md:h-[600px]"
          >
            {/* Sidebar */}
            <div className="w-full md:w-64 bg-zinc-100 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-white/5 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold tracking-tight">Settings</h2>
                <button onClick={onClose} className="md:hidden p-2 bg-zinc-200 dark:bg-white/10 rounded-full">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap text-sm font-medium",
                        isActive 
                          ? "bg-white dark:bg-white/10 text-primary shadow-sm" 
                          : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-300"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-zinc-400")} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 md:p-10 overflow-y-auto">
              <div className="max-w-md">
                {/* Close Button (Desktop) */}
                <button 
                  onClick={onClose}
                  className="hidden md:flex absolute top-6 right-6 w-8 h-8 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-500" />
                </button>

                <AnimatePresence mode="wait">
                  {activeTab === 'appearance' && (
                    <motion.div
                      key="appearance"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-lg font-bold mb-1">Theme</h3>
                        <p className="text-sm text-zinc-500 mb-6">Customize the visual appearance of BentoNote.</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div 
                            role="button"
                            tabIndex={0}
                            onClick={() => setIsDarkMode(false)}
                            className={cn(
                              "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                              !isDarkMode ? "border-primary bg-primary/5" : "border-zinc-200 dark:border-white/5 hover:border-primary/30"
                            )}
                          >
                            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center pointer-events-none">
                              <Sun className="w-6 h-6 text-amber-500" />
                            </div>
                            <span className="text-sm font-bold pointer-events-none">Light Mode</span>
                          </div>
                          
                          <div 
                            role="button"
                            tabIndex={0}
                            onClick={() => setIsDarkMode(true)}
                            className={cn(
                              "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                              isDarkMode ? "border-primary bg-primary/5" : "border-zinc-200 dark:border-white/5 hover:border-primary/30"
                            )}
                          >
                            <div className="w-12 h-12 rounded-full bg-zinc-900 shadow-sm flex items-center justify-center pointer-events-none">
                              <Moon className="w-6 h-6 text-indigo-400" />
                            </div>
                            <span className="text-sm font-bold pointer-events-none">Dark Mode</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'ai' && (
                    <motion.div
                      key="ai"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-lg font-bold mb-1">AI Assistant Preferences</h3>
                        <p className="text-sm text-zinc-500 mb-6">Configure how the Meeting Intelligence and Neural Notes behave.</p>
                        
                        <div className="space-y-6">
                          <div className="space-y-3">
                            <label className="text-sm font-bold">Default Transcription Language</label>
                            <select 
                              value={language}
                              onChange={(e) => setLanguage(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                              <option value="auto">Auto-Detect</option>
                              <option value="en-US">English (US)</option>
                              <option value="en-GB">English (UK)</option>
                              <option value="es-ES">Spanish</option>
                              <option value="fr-FR">French</option>
                              <option value="de-DE">German</option>
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

                          <div className="space-y-3">
                            <label className="text-sm font-bold">Target Translation Language</label>
                            <select 
                              value={targetLanguage}
                              onChange={(e) => setTargetLanguage(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                              <option value="none">Original (No Translation)</option>
                              <option value="en">English</option>
                              <option value="es">Spanish</option>
                              <option value="fr">French</option>
                              <option value="de">German</option>
                              <option value="hi">Hindi</option>
                              <option value="bn">Bengali</option>
                              <option value="te">Telugu</option>
                              <option value="mr">Marathi</option>
                              <option value="ta">Tamil</option>
                              <option value="ur">Urdu</option>
                              <option value="gu">Gujarati</option>
                              <option value="kn">Kannada</option>
                              <option value="or">Odia</option>
                              <option value="ml">Malayalam</option>
                              <option value="pa">Punjabi</option>
                              <option value="as">Assamese</option>
                            </select>
                          </div>

                          <div className="space-y-3">
                            <label className="text-sm font-bold">Summary Detail Level</label>
                            <div className="grid grid-cols-2 gap-3">
                              <div 
                                role="button"
                                tabIndex={0}
                                onClick={() => setSummaryLevel('concise')}
                                className={cn(
                                  "px-4 py-3 rounded-xl border-2 text-sm font-bold text-left transition-all cursor-pointer",
                                  summaryLevel === 'concise' 
                                    ? "border-primary bg-primary/5" 
                                    : "border-zinc-200 dark:border-white/5 hover:border-primary/30"
                                )}
                              >
                                Concise
                                <p className="text-[10px] text-zinc-500 font-normal mt-1 pointer-events-none">Bullet points, action items only</p>
                              </div>
                              <div 
                                role="button"
                                tabIndex={0}
                                onClick={() => setSummaryLevel('detailed')}
                                className={cn(
                                  "px-4 py-3 rounded-xl border-2 text-sm font-bold text-left transition-all cursor-pointer",
                                  summaryLevel === 'detailed' 
                                    ? "border-primary bg-primary/5" 
                                    : "border-zinc-200 dark:border-white/5 hover:border-primary/30"
                                )}
                              >
                                Detailed
                                <p className="text-[10px] text-zinc-500 font-normal mt-1 pointer-events-none">Full paragraphs, rich context</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'account' && (
                    <motion.div
                      key="account"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-lg font-bold mb-1">Account Details</h3>
                        <p className="text-sm text-zinc-500 mb-6">Manage your subscription and profile.</p>
                        
                        {userProfile ? (
                          <div className="space-y-6">
                            <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                                {userProfile.email?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <p className="font-bold">{userProfile.email}</p>
                                <p className="text-xs text-zinc-500">
                                  Plan: <span className={cn("font-bold uppercase", userProfile.plan === 'pro' ? "text-primary" : "")}>{userProfile.plan || 'Free'}</span>
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <Button 
                                onClick={onManageSubscription}
                                className="w-full justify-between py-6 rounded-xl"
                                variant={userProfile.plan === 'pro' ? "outline" : "default"}
                              >
                                <div className="flex items-center gap-3">
                                  <CreditCard className="w-4 h-4" />
                                  {userProfile.plan === 'pro' ? "Manage Subscription" : "Upgrade to Pro"}
                                </div>
                                <ChevronRight className="w-4 h-4 opacity-50" />
                              </Button>
                              
                              <Button 
                                onClick={onSignOut}
                                variant="destructive"
                                className="w-full justify-between py-6 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 hover:text-rose-600 border-none"
                              >
                                <div className="flex items-center gap-3">
                                  <LogOut className="w-4 h-4" />
                                  Sign Out
                                </div>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-sm text-zinc-500">Please sign in to view account details.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
