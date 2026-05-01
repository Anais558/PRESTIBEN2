import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Wrench, 
  Lightbulb, 
  Baby, 
  Home as CleaningBucket, 
  Shield, 
  MapPin, 
  Star, 
  Clock, 
  CheckCircle2, 
  Smartphone, 
  Search, 
  User, 
  Bell, 
  ArrowRight,
  Zap,
  Phone,
  MessageCircle,
  Menu,
  X,
  CreditCard,
  Map as MapIcon,
  Navigation
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { cn } from "./lib/utils";

// Types
type AppState = "splash" | "onboarding" | "auth" | "role_selection" | "main";

interface Service {
  id: string;
  name: string;
  icon: React.ElementType;
  category: string;
  basePrice: number;
}

interface Request {
  id: string;
  clientId: string;
  service: string;
  location: { lat: number; lng: number };
  status: "pending" | "matched" | "in_progress" | "completed";
}

const ONBOARDING_SLIDES = [
  {
    id: 1,
    title: "Rapidité Extrême",
    description: "Trouvez votre prestataire en moins de 60 secondes chrono.",
    icon: Zap,
    color: "bg-brand-green"
  },
  {
    id: 2,
    title: "Sécurité Garantie",
    description: "Tous nos artisans sont certifiés, vérifiés et notés par la communauté.",
    icon: Shield,
    color: "bg-brand-yellow"
  },
  {
    id: 3,
    title: "Paiement Facile",
    description: "Réglez vos prestations via MTN MoMo ou Moov Flooz en toute sécurité.",
    icon: CreditCard,
    color: "bg-blue-500"
  }
];

const SERVICES: Service[] = [
  { id: "plumber", name: "Plomberie", icon: Wrench, category: "Dépannage", basePrice: 5000 },
  { id: "electrician", name: "Électricité", icon: Lightbulb, category: "Dépannage", basePrice: 5000 },
  { id: "nanny", name: "Nounou", icon: Baby, category: "Services", basePrice: 15000 },
  { id: "cleaning", name: "Ménage", icon: CleaningBucket, category: "Services", basePrice: 7000 },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>("splash");
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [role, setRole] = useState<"client" | "provider" | null>(null);
  const [step, setStep] = useState<"selection" | "matching" | "active" | "provider_dashboard">("selection");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeRequest, setActiveRequest] = useState<Request | null>(null);
  const [availableRequests, setAvailableRequests] = useState<Request[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Splash logic
  useEffect(() => {
    if (appState === "splash") {
      const timer = setTimeout(() => {
        setAppState("onboarding");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  // Socket setup only when app starts
  useEffect(() => {
    const s = io();
    setSocket(s);
    // ... logic remains same
    s.on("new_request", (req: Request) => setAvailableRequests(prev => [...prev, req]));
    s.on("request_matched", (req: Request) => {
      setActiveRequest(req);
      setStep("active");
      setIsSearching(false);
    });
    s.on("match_confirmed", (req: Request) => {
      setActiveRequest(req);
      setStep("active");
    });
    return () => { s.disconnect(); };
  }, []);

  const handleNextOnboarding = () => {
    if (onboardingIndex < ONBOARDING_SLIDES.length - 1) {
      setOnboardingIndex(prev => prev + 1);
    } else {
      setAppState("auth");
    }
  };

  const handleSkipOnboarding = () => setAppState("auth");

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length >= 8) {
      setOtpMode(true);
      // Simulate SMS sending
      console.log("Sending OTP to", phoneNumber);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp === "123456") { // Pre-set code for testing
      setAppState("role_selection");
    }
  };

  const handleJoin = (selectedRole: "client" | "provider") => {
    setRole(selectedRole);
    socket?.emit("join", selectedRole);
    setAppState("main");
    if (selectedRole === "client") {
      setStep("selection");
    } else {
      setStep("provider_dashboard");
    }
  };

  const startRequest = (service: Service) => {
    setSelectedService(service);
    setIsSearching(true);
    setStep("matching");
    const location = { lat: 6.3654, lng: 2.4183 }; 
    socket?.emit("request_service", { service: service.name, location });
  };

  const acceptRequest = (requestId: string) => {
    socket?.emit("accept_request", { requestId });
  };

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-brand-green/20">
      <AnimatePresence mode="wait">
        
        {/* 1. SPLASH SCREEN */}
        {appState === "splash" && (
          <motion.div 
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.1, 1], opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="w-32 h-32 bg-brand-green rounded-3xl flex items-center justify-center shadow-2xl shadow-brand-green/20"
            >
              <Zap className="text-white w-16 h-16 fill-current" />
            </motion.div>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-8 space-y-2"
            >
              <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Prestiben</h1>
              <p className="text-slate-500 font-medium">Un service pro en moins de 60s</p>
            </motion.div>
          </motion.div>
        )}

        {/* 2. ONBOARDING CAROUSEL */}
        {appState === "onboarding" && (
          <motion.div 
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            className="min-h-screen flex flex-col"
          >
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={onboardingIndex}
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -50, opacity: 0 }}
                  className="space-y-8"
                >
                  <div className={cn(
                    "w-64 h-64 rounded-full mx-auto flex items-center justify-center",
                    ONBOARDING_SLIDES[onboardingIndex].color,
                    "bg-opacity-10"
                  )}>
                    <div className={cn(
                      "w-48 h-48 rounded-full flex items-center justify-center shadow-lg",
                      ONBOARDING_SLIDES[onboardingIndex].color,
                      "text-white"
                    )}>
                      {React.createElement(ONBOARDING_SLIDES[onboardingIndex].icon, { className: "w-24 h-24" })}
                    </div>
                  </div>
                  <div className="space-y-4 px-4">
                    <h2 className="text-3xl font-display font-bold text-slate-900">
                      {ONBOARDING_SLIDES[onboardingIndex].title}
                    </h2>
                    <p className="text-slate-500 text-lg leading-relaxed">
                      {ONBOARDING_SLIDES[onboardingIndex].description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex gap-2">
                {ONBOARDING_SLIDES.map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "h-2 rounded-full transition-all duration-300",
                      i === onboardingIndex ? "w-8 bg-brand-green" : "w-2 bg-slate-200"
                    )} 
                  />
                ))}
              </div>
            </div>

            <div className="p-8 flex items-center justify-between gap-4">
              <button 
                onClick={handleSkipOnboarding}
                className="text-slate-400 font-bold px-4 py-2 hover:text-slate-600 transition-colors"
              >
                Passer
              </button>
              <button 
                onClick={handleNextOnboarding}
                className="bg-brand-green text-white font-bold h-14 w-14 rounded-full flex items-center justify-center shadow-lg shadow-brand-green/30 hover:scale-105 transition-transform"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}

        {/* 3. AUTH SCREEN (PHONE + OTP) */}
        {appState === "auth" && (
          <motion.div 
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-screen p-8 flex flex-col"
          >
            <div className="flex-1 mt-12 space-y-10">
              <div className="space-y-4 text-center">
                <h2 className="text-3xl font-display font-bold text-slate-900">
                  {otpMode ? "Code de vérification" : "Bienvenue !"}
                </h2>
                <p className="text-slate-500">
                  {otpMode 
                    ? `Saisissez le code envoyé au +229 ${phoneNumber}`
                    : "Entrez votre numéro pour commencer l'aventure."}
                </p>
              </div>

              {!otpMode ? (
                <form onSubmit={handlePhoneSubmit} className="space-y-6">
                  <div className="flex gap-3 h-16">
                    <div className="w-24 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-900">
                      <img src="https://flagcdn.com/w40/bj.png" alt="BJ" className="w-6 rounded-sm" />
                      +229
                    </div>
                    <input 
                      type="tel" 
                      placeholder="Numéro de téléphone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-brand-green"
                    />
                  </div>
                  <button 
                    disabled={phoneNumber.length < 8}
                    className="w-full bg-brand-green text-white font-bold h-16 rounded-2xl shadow-lg shadow-brand-green/20 disabled:opacity-50 disabled:shadow-none transition-all"
                  >
                    Recevoir le code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleOtpSubmit} className="space-y-6">
                  <div className="flex justify-between gap-2 h-16">
                    {[0,1,2,3,4,5].map(i => (
                      <input 
                        key={i}
                        type="text"
                        maxLength={1}
                        className="w-12 h-16 bg-slate-50 border border-slate-200 rounded-xl text-center text-xl font-bold focus:ring-2 focus:ring-brand-green focus:outline-none"
                        onChange={(e) => {
                          if (e.target.value) {
                            setOtp(prev => prev + e.target.value);
                            (e.target.nextSibling as HTMLInputElement)?.focus();
                          }
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-center text-sm text-slate-400">
                    Vous n'avez pas reçu le code ? <span className="text-brand-green font-bold">Renvoyer</span>
                  </p>
                  <button className="w-full bg-brand-green text-white font-bold h-16 rounded-2xl shadow-xl shadow-brand-green/30">
                    S'inscrire
                  </button>
                </form>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold">ou</span></div>
              </div>

              <button 
                onClick={() => setAppState("role_selection")}
                className="w-full bg-white border-2 border-slate-100 text-slate-900 font-bold h-16 rounded-2xl hover:border-slate-200 transition-all flex items-center justify-center gap-3"
              >
                Explorer sans compte
                <ArrowRight className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400 leading-relaxed max-w-xs mx-auto">
              En continuant, vous acceptez nos <span className="underline">Conditions d'Utilisation</span> et notre <span className="underline">Politique de Confidentialité</span>.
            </p>
          </motion.div>
        )}

        {/* 4. ROLE SELECTION */}
        {appState === "role_selection" && (
          <motion.div 
            key="role_selection"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen p-8 flex flex-col"
          >
            <div className="flex-1 flex flex-col justify-center space-y-10">
              <div className="space-y-4">
                <h2 className="text-3xl font-display font-bold text-slate-900">
                  Comment souhaitez-vous utiliser <span className="text-brand-green">Prestiben</span> ?
                </h2>
                <p className="text-slate-500">Choisissez votre profil pour continuer l'expérience.</p>
              </div>

              <div className="grid gap-6">
                <button 
                  onClick={() => handleJoin("client")}
                  className="group relative bg-white border-2 border-slate-100 h-32 rounded-3xl p-6 flex items-center gap-6 hover:border-brand-green transition-all text-left overflow-hidden shadow-sm hover:shadow-xl"
                >
                  <div className="w-16 h-16 bg-brand-green/10 rounded-2xl flex items-center justify-center group-hover:bg-brand-green group-hover:text-white transition-colors">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Client</h3>
                    <p className="text-sm text-slate-400">Chercher un pro</p>
                  </div>
                  <div className="absolute right-[-20px] top-[-20px] w-24 h-24 bg-brand-green/5 rounded-full" />
                </button>

                <button 
                  onClick={() => handleJoin("provider")}
                  className="group relative bg-white border-2 border-slate-100 h-32 rounded-3xl p-6 flex items-center gap-6 hover:border-brand-green transition-all text-left overflow-hidden shadow-sm hover:shadow-xl"
                >
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-brand-green group-hover:text-white transition-colors">
                    <Shield className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Prestataire</h3>
                    <p className="text-sm text-slate-400">Gagner de l'argent</p>
                  </div>
                  <div className="absolute right-[-20px] top-[-20px] w-24 h-24 bg-slate-100/50 rounded-full" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 5. MAIN APPLICATION (Rest of the previous code filtered/integrated) */}
        {appState === "main" && (
          <motion.div 
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pb-24"
          >
            {/* Nav + Content logic from previous turn integrated here */}
            <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-100 z-50 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-green rounded-lg flex items-center justify-center">
                  <Zap className="text-white w-5 h-5 fill-current" />
                </div>
                <span className="font-display font-bold text-xl tracking-tight text-slate-900 leading-none">Prestiben</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </nav>

            <main className="pt-24 px-6 max-w-lg mx-auto">
                <AnimatePresence mode="wait">
                  {step === "selection" && (
                    <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                       <div className="bg-slate-900 rounded-3xl p-6 text-white space-y-4">
                          <h3 className="text-2xl font-bold">Besoin d'un dépannage ?</h3>
                          <div className="flex items-center gap-2 text-brand-yellow font-bold text-sm">
                            <Clock className="w-4 h-4" /> En moins de 60s
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                        {SERVICES.map(s => (
                          <button 
                            key={s.id} 
                            onClick={() => startRequest(s)}
                            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all text-left space-y-4 group"
                          >
                             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-brand-green group-hover:bg-brand-green group-hover:text-white transition-colors">
                                <s.icon className="w-6 h-6" />
                             </div>
                             <div>
                               <h4 className="font-bold text-slate-900">{s.name}</h4>
                               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.category}</p>
                             </div>
                          </button>
                        ))}
                       </div>
                    </motion.div>
                  )}

                  {step === "matching" && (
                    <motion.div key="matching" className="flex flex-col items-center justify-center py-20 space-y-12">
                       <div className="relative">
                          <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.1, 0.3] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-x-[-40px] inset-y-[-40px] bg-brand-green rounded-full blur-xl" />
                          <div className="relative z-10 w-32 h-32 bg-white rounded-3xl shadow-2xl flex items-center justify-center">
                            {selectedService && <selectedService.icon className="w-12 h-12 text-brand-green" />}
                          </div>
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute inset-[-20px] border-2 border-dashed border-brand-green/30 rounded-full" />
                       </div>
                       <div className="text-center space-y-3">
                          <h2 className="text-2xl font-bold tracking-tight">Recherche d'un Pro...</h2>
                          <p className="text-slate-500">Matching en cours pour <span className="font-bold text-slate-900">{selectedService?.name}</span></p>
                       </div>
                    </motion.div>
                  )}

                  {step === "active" && activeRequest && (
                    <motion.div key="active" className="space-y-6">
                      <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-50 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border-2 border-brand-green">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeRequest.providerId}`} alt="Pro" />
                          </div>
                          <div>
                            <h3 className="font-bold text-xl">Ibrahim D.</h3>
                            <div className="flex items-center gap-1 text-brand-yellow font-bold text-xs">
                              <Star className="w-3 h-3 fill-current" /> 4.9 • 1,200 Missions
                            </div>
                          </div>
                          <div className="ml-auto w-10 h-10 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                            <Phone className="w-5 h-5 fill-current" />
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Clock className="text-slate-400 w-5 h-5" />
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase">Arrivée prévue</p>
                               <p className="font-bold text-slate-900">12 Minutes</p>
                            </div>
                          </div>
                          <ArrowRight className="text-slate-300" />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === "provider_dashboard" && (
                    <motion.div key="provider_dashboard" className="space-y-8">
                       <div className="bg-brand-green p-8 rounded-[40px] text-white space-y-6 shadow-2xl shadow-brand-green/20">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium opacity-80">Portefeuille Prestiben</span>
                            <div className="bg-white/20 p-2 rounded-xl"><CreditCard className="w-5 h-5" /></div>
                          </div>
                          <h2 className="text-5xl font-bold leading-none">24,500 <small className="text-lg opacity-60">F</small></h2>
                          <div className="flex items-center gap-3 bg-white/10 w-fit px-4 py-2 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-wider">En ligne</span>
                          </div>
                       </div>

                       <div className="space-y-6">
                          <h3 className="font-bold text-xl px-2">Demandes à proximité</h3>
                          {availableRequests.map(req => (
                            <motion.div key={req.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm hover:border-brand-green flex flex-col gap-6">
                               <div className="flex justify-between items-start">
                                  <div className="flex gap-4">
                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-brand-green">
                                      <Wrench className="w-7 h-7" />
                                    </div>
                                    <div>
                                      <h4 className="font-bold text-lg">{req.service}</h4>
                                      <p className="text-xs text-slate-400">Cotonou, Fidjrossè • 2.4 km</p>
                                    </div>
                                  </div>
                                  <div className="font-bold text-brand-green text-lg">5,000 F</div>
                               </div>
                               <button onClick={() => acceptRequest(req.id)} className="w-full bg-brand-green text-white font-bold py-4 rounded-2xl shadow-lg shadow-brand-green/20">Accepter la mission</button>
                            </motion.div>
                          ))}
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </main>

            {/* Bottom Nav */}
            <div className="fixed bottom-6 left-6 right-6 h-20 bg-slate-900 rounded-[32px] shadow-2xl flex items-center justify-around px-4 z-50">
               <button className="text-brand-green"><Zap className="w-6 h-6 " /></button>
               <button className="text-slate-500"><MapIcon className="w-6 h-6" /></button>
               <button className="text-slate-500"><CreditCard className="w-6 h-6" /></button>
               <button className="text-slate-500"><User className="w-6 h-6" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

