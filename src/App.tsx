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
  Navigation,
  Mail,
  LogOut
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { cn } from "./lib/utils";
import { auth, db, signInWithGoogle, setupRecaptcha, sendOtp } from "./lib/firebase";
import { onAuthStateChanged, signOut, User as FirebaseUser, ConfirmationResult } from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy
} from "firebase/firestore";

// Types
type AppState = "splash" | "onboarding" | "auth" | "role_selection" | "kyc" | "main";

interface Service {
  id: string;
  name: string;
  icon: React.ElementType;
  category: string;
  basePrice: number;
  description: string;
}

interface Request {
  id: string;
  clientId: string;
  service: string;
  serviceDescription?: string;
  location: { lat: number; lng: number; address?: string };
  status: "pending" | "matched" | "in_progress" | "completed";
  providerId?: string;
  price: number;
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
  { id: "plumber", name: "Plomberie", icon: Wrench, category: "Dépannage", basePrice: 5000, description: "Réparation fuites, installation robinetterie, débouchage." },
  { id: "electrician", name: "Électricité", icon: Lightbulb, category: "Dépannage", basePrice: 5000, description: "Court-circuit, installation prises, ventilateurs, climatisation." },
  { id: "nanny", name: "Nounou", icon: Baby, category: "Services", basePrice: 15000, description: "Garde d'enfants à domicile (journée ou soirée)." },
  { id: "cleaning", name: "Ménage", icon: CleaningBucket, category: "Services", basePrice: 7000, description: "Nettoyage complet, repassage, entretien régulier." },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>("splash");
  const [isInitializing, setIsInitializing] = useState(true);
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isVerifyingGoogle, setIsVerifyingGoogle] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<"client" | "provider" | null>(null);
  const [step, setStep] = useState<"selection" | "details" | "matching" | "active" | "provider_dashboard">("selection");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceDetails, setServiceDetails] = useState("");
  const [activeRequest, setActiveRequest] = useState<Request | null>(null);
  const [availableRequests, setAvailableRequests] = useState<Request[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // KYC State
  const [kycStep, setKycStep] = useState(1);
  const [providerSkill, setProviderSkill] = useState("");
  const [providerCity, setProviderCity] = useState("Cotonou");

  // Auth & Initialization Listener
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("prestiben_onboarding_seen");
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRole(userData.role);
            
            if (userData.status === "pending_kyc" && userData.role === "provider") {
              setAppState("kyc");
            } else {
              setAppState("main");
              if (userData.role === "client") setStep("selection");
              else setStep("provider_dashboard");
            }
          } else {
            setAppState("role_selection");
          }
        } catch (error) {
          console.error("Error fetching user doc:", error);
          setAppState("role_selection");
        }
      } else {
        if (hasSeenOnboarding) setAppState("auth");
        else setAppState("onboarding");
      }
      
      setTimeout(() => setIsInitializing(false), 2000);
    });

    return () => unsubscribe();
  }, []);

  // Client: Active Request Listener
  useEffect(() => {
    if (role === "client" && user && (step === "matching" || step === "active")) {
      const q = query(
        collection(db, "requests"),
        where("clientId", "==", user.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        // Find the most recent matched request in memory
        const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Request));
        const matched = requests.find(r => r.status === "matched");
        
        if (matched) {
          setActiveRequest(matched);
          setStep("active");
          setIsSearching(false);
        }
      }, (error) => console.error("Client listener error:", error));

      return () => unsubscribe();
    }
  }, [role, user, step]);

  // Provider: Real-time Missions Listener
  useEffect(() => {
    if (role === "provider" && appState === "main") {
      const q = query(
        collection(db, "requests"),
        where("status", "==", "pending")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Request[];
        setAvailableRequests(requests);
      }, (error) => console.error("Provider listener error:", error));

      return () => unsubscribe();
    }
  }, [role, appState]);

  // Provider Location Tracker
  useEffect(() => {
    if (role === "provider" && appState === "main" && user) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const loc = { 
            lat: position.coords.latitude, 
            lng: position.coords.longitude, 
            address: "Position actuelle" 
          };
          setUserLocation(loc);
          // Optional: Update provider position in Firestore for clients to see on map
          setDoc(doc(db, "users", user.uid), {
            location: loc,
            lastSeen: serverTimestamp()
          }, { merge: true });
        },
        (error) => console.warn("Provider location tracking failed:", error),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [role, appState, user]);

  const completeOnboarding = () => {
    localStorage.setItem("prestiben_onboarding_seen", "true");
    setAppState("auth");
  };

  const handleNextOnboarding = () => {
    if (onboardingIndex < ONBOARDING_SLIDES.length - 1) setOnboardingIndex(prev => prev + 1);
    else completeOnboarding();
  };

  const handleSkipOnboarding = () => completeOnboarding();

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length >= 8 && !isVerifyingPhone) {
      setIsVerifyingPhone(true);
      try {
        const fullPhone = `+229${phoneNumber}`;
        const verifier = setupRecaptcha("recaptcha-container");
        const result = await sendOtp(fullPhone, verifier);
        setConfirmationResult(result);
        setOtpMode(true);
      } catch (error: any) {
        console.error("OTP Error:", error);
        alert(`Erreur d'envoi SMS: ${error.message}`);
        const container = document.getElementById("recaptcha-container");
        if (container) container.innerHTML = "";
      } finally {
        setIsVerifyingPhone(false);
      }
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length === 6 && confirmationResult) {
      try {
        await confirmationResult.confirm(otp);
      } catch (error: any) {
        console.error("OTP Verify Error:", error);
        alert("Code incorrect.");
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (isVerifyingGoogle) return;
    setIsVerifyingGoogle(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login failed", error);
      alert(`Erreur Google Auth: ${error.message}`);
    } finally {
      setIsVerifyingGoogle(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setAppState("auth");
    setRole(null);
  };

  const handleJoin = async (selectedRole: "client" | "provider") => {
    setRole(selectedRole);
    if (user) {
      try {
        const status = selectedRole === "provider" ? "pending_kyc" : "active";
        await setDoc(doc(db, "users", user.uid), {
          userId: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: selectedRole,
          status,
          createdAt: serverTimestamp()
        }, { merge: true });
        
        if (selectedRole === "provider") setAppState("kyc");
        else setAppState("main");
      } catch (error) {
        console.error("Error saving user:", error);
      }
    }
  };

  // CLIENT ACTIONS
  const startRequestProcess = (service: Service) => {
    setSelectedService(service);
    setStep("details");
  };

  const confirmAndMatch = async () => {
    if (!selectedService || !user) return;
    
    setIsSearching(true);
    setStep("matching");

    let location = { lat: 6.3654, lng: 2.4183, address: "Fidjrossè, Cotonou" };

    // Attempt real geolocation
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });
      location = { 
        lat: position.coords.latitude, 
        lng: position.coords.longitude, 
        address: "Position actuelle" 
      };
      setUserLocation(location);
    } catch (error) {
      console.warn("Geolocation failed, using fallback:", error);
      // Fallback is already set to 'location'
    }
    
    const requestId = `REQ_${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    const newRequest: Request = {
      id: requestId,
      clientId: user.uid,
      service: selectedService.name,
      serviceDescription: serviceDetails,
      location,
      status: "pending",
      price: selectedService.basePrice
    };

    try {
      // Save to Firestore
      await setDoc(doc(db, "requests", requestId), {
        ...newRequest,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error matching:", error);
      setStep("selection");
    }
  };

  // PROVIDER ACTIONS
  const submitKYC = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        status: "active", // Simplified for demo, should be pending_admin
        providerSkill,
        providerCity,
        kycSubmittedAt: serverTimestamp()
      }, { merge: true });
      
      setAppState("main");
      setStep("provider_dashboard");
    } catch (error) {
      console.error("KYC Error:", error);
    }
  };

  const acceptRequest = async (request: Request) => {
    if (!user) return;
    try {
      // Update Firestore
      await setDoc(doc(db, "requests", request.id), {
        status: "matched",
        providerId: user.uid,
        matchedAt: serverTimestamp()
      }, { merge: true });
      
      setActiveRequest(request);
      setStep("active");
    } catch (error) {
       console.error("Accept error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-brand-green/20">
      <AnimatePresence mode="wait">
        
        {/* 1. SPLASH SCREEN (Now controlled by isInitializing) */}
        {isInitializing && (
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
        {!isInitializing && appState === "onboarding" && (
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

        {/* 3. AUTH SCREEN */}
        {!isInitializing && appState === "auth" && (
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
                    : "Connectez-vous pour commencer l'aventure."}
                </p>
              </div>

              {!otpMode ? (
                <div className="space-y-6">
                  <form onSubmit={handlePhoneSubmit} className="space-y-4">
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
                        type="submit"
                        disabled={phoneNumber.length < 8 || isVerifyingPhone}
                        className="w-full bg-slate-900 text-white font-bold h-16 rounded-2xl shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                      >
                        {isVerifyingPhone ? (
                          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Phone className="w-5 h-5" />
                            Recevoir le code SMS
                          </>
                        )}
                      </button>
                    </form>

                    <div id="recaptcha-container" className="hidden"></div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold">ou via</span></div>
                  </div>

                  <button 
                    onClick={handleGoogleSignIn}
                    disabled={isVerifyingGoogle}
                    className="w-full bg-white border-2 border-slate-100 text-slate-900 font-bold h-16 rounded-2xl hover:border-slate-200 disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                  >
                    {isVerifyingGoogle ? (
                      <div className="w-6 h-6 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Continuer avec Google
                      </>
                    )}
                  </button>
                </div>
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
                          const val = e.target.value;
                          if (val) {
                            setOtp(prev => prev + val);
                            (e.target.nextSibling as HTMLInputElement)?.focus();
                          }
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-center text-sm text-slate-400">
                    Vous n'avez pas reçu le code ? <span className="text-brand-green font-bold cursor-pointer">Renvoyer</span>
                  </p>
                  <button className="w-full bg-brand-green text-white font-bold h-16 rounded-2xl shadow-xl shadow-brand-green/30">
                    Vérifier le code
                  </button>
                  <button 
                    onClick={() => setOtpMode(false)}
                    className="w-full text-slate-400 font-bold"
                  >
                    Changer de numéro
                  </button>
                </form>
              )}

              <button 
                onClick={() => setAppState("role_selection")}
                className="w-full text-slate-500 font-bold h-16 flex items-center justify-center gap-3"
              >
                Explorer sans compte (Mode démo)
                <ArrowRight className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400 leading-relaxed max-w-xs mx-auto mb-4">
              En continuant, vous acceptez nos <span className="underline">Conditions d'Utilisation</span> et notre <span className="underline">Politique de Confidentialité</span>.
            </p>
          </motion.div>
        )}

        {/* 4. ROLE SELECTION */}
        {!isInitializing && appState === "role_selection" && (
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
                    <p className="text-sm text-slate-400">Pour commander un service</p>
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
                    <p className="text-sm text-slate-400">Gagner de l'argent avec mes compétences</p>
                  </div>
                  <div className="absolute right-[-20px] top-[-20px] w-24 h-24 bg-slate-100/50 rounded-full" />
                </button>
              </div>
            </div>
            {user && (
              <button 
                onClick={handleLogout}
                className="mt-4 text-red-500 font-bold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Se déconnecter
              </button>
            )}
          </motion.div>
        )}

        {/* 4.5 KYC SCREEN */}
        {!isInitializing && appState === "kyc" && (
          <motion.div 
            key="kyc"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="min-h-screen p-8 flex flex-col"
          >
             <div className="flex-1 space-y-10 mt-8">
               <div className="space-y-4">
                  <span className="text-brand-green font-bold text-sm tracking-widest uppercase">Étape {kycStep}/2</span>
                  <h2 className="text-3xl font-display font-bold">Vérification de Profil</h2>
                  <p className="text-slate-500">Pour garantir la sécurité de la communauté Prestiben, tous les prestataires doivent être certifiés.</p>
               </div>

               {kycStep === 1 && (
                 <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-400 ml-1">Votre domaine d'expertise</label>
                       <select 
                        value={providerSkill}
                        onChange={(e) => setProviderSkill(e.target.value)}
                        className="w-full h-16 bg-slate-50 border border-slate-200 rounded-2xl px-6 font-bold focus:outline-none focus:ring-2 focus:ring-brand-green"
                       >
                         <option value="">Choisir un métier...</option>
                         {SERVICES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                       </select>
                    </div>

                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-400 ml-1">Ville de résidence</label>
                       <select 
                        value={providerCity}
                        onChange={(e) => setProviderCity(e.target.value)}
                        className="w-full h-16 bg-slate-50 border border-slate-200 rounded-2xl px-6 font-bold"
                       >
                         <option value="Cotonou">Cotonou</option>
                         <option value="Abomey-Calavi">Abomey-Calavi</option>
                         <option value="Porto-Novo">Porto-Novo</option>
                       </select>
                    </div>

                    <button 
                      onClick={() => providerSkill && setKycStep(2)}
                      disabled={!providerSkill}
                      className="w-full bg-slate-900 text-white font-bold h-16 rounded-2xl disabled:opacity-50 transition-all"
                    >
                      Suivant
                    </button>
                 </div>
               )}

               {kycStep === 2 && (
                 <div className="space-y-8">
                    <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-4 hover:border-brand-green transition-colors cursor-pointer bg-slate-50/50">
                       <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                          <Smartphone className="w-8 h-8 text-slate-400" />
                       </div>
                       <div>
                         <p className="font-bold">Photo de votre Carte d'Identité / CIP</p>
                         <p className="text-xs text-slate-400">Assurez-vous que les informations sont lisibles.</p>
                       </div>
                    </div>

                    <button 
                      onClick={submitKYC}
                      className="w-full bg-brand-green text-white font-bold h-16 rounded-2xl shadow-xl shadow-brand-green/30"
                    >
                      Finaliser l'inscription
                    </button>
                    <button onClick={() => setKycStep(1)} className="w-full text-slate-400 font-bold">Retour</button>
                 </div>
               )}
             </div>
          </motion.div>
        )}

        {/* 5. MAIN APPLICATION */}
        {!isInitializing && appState === "main" && (
          <motion.div 
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pb-32"
          >
            <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-100 z-50 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-green rounded-lg flex items-center justify-center">
                  <Zap className="text-white w-5 h-5 fill-current" />
                </div>
                <span className="font-display font-bold text-xl tracking-tight text-slate-900 leading-none">Prestiben</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    if (window.confirm("Voulez-vous vous déconnecter ?")) {
                      handleLogout();
                    }
                  }}
                  className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden border border-slate-200"
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </button>
              </div>
            </nav>

            <main className="pt-24 px-6 max-w-lg mx-auto">
                <AnimatePresence mode="wait">
                  {step === "selection" && (
                    <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                       <div className="bg-slate-900 rounded-3xl p-8 text-white space-y-4 relative overflow-hidden">
                          <div className="relative z-10 space-y-2">
                            <h3 className="text-3xl font-bold">Besoin d'un pro ?</h3>
                            <p className="text-slate-400 text-sm">On s'occupe de tout en un clic.</p>
                          </div>
                          <div className="flex items-center gap-2 text-brand-yellow font-bold text-sm bg-brand-yellow/10 w-fit px-3 py-1 rounded-full border border-brand-yellow/20">
                            <Clock className="w-4 h-4" /> En moins de 60s
                          </div>
                          <div className="absolute right-[-30px] bottom-[-30px] w-48 h-48 bg-brand-green/20 rounded-full blur-3xl" />
                       </div>

                       <div className="flex items-center justify-between px-2">
                          <h4 className="font-bold text-lg">Services Populaires</h4>
                          <span className="text-brand-green text-sm font-bold">Voir tout</span>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                        {SERVICES.map(s => (
                          <button 
                            key={s.id} 
                            onClick={() => startRequestProcess(s)}
                            className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all text-left space-y-4 group active:scale-95"
                          >
                             <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-brand-green group-hover:bg-brand-green group-hover:text-white transition-colors">
                                <s.icon className="w-7 h-7" />
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

                  {step === "details" && selectedService && (
                    <motion.div key="details" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                       <button onClick={() => setStep("selection")} className="flex items-center gap-2 text-slate-400 font-bold">
                          <ArrowRight className="w-4 h-4 rotate-180" /> Retour
                       </button>

                       <div className="bg-slate-50 border border-slate-200 rounded-[32px] p-8 space-y-6">
                          <div className="flex items-center gap-4">
                             <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-brand-green shadow-sm">
                                <selectedService.icon className="w-8 h-8" />
                             </div>
                             <div>
                               <h2 className="text-2xl font-bold">{selectedService.name}</h2>
                               <p className="text-sm text-slate-400">{selectedService.category}</p>
                             </div>
                          </div>
                          
                          <p className="text-slate-600 text-sm italic">"{selectedService.description}"</p>
                       </div>

                       <div className="space-y-4">
                          <label className="font-bold text-slate-900 ml-1">Décrivez votre besoin</label>
                          <textarea 
                            value={serviceDetails}
                            onChange={(e) => setServiceDetails(e.target.value)}
                            placeholder="Ex: Mon robinet de cuisine fuit depuis ce matin..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-6 h-32 focus:ring-2 focus:ring-brand-green focus:outline-none font-medium"
                          />
                       </div>

                       <div className="bg-white border-2 border-brand-green/20 rounded-3xl p-6 flex justify-between items-center shadow-lg shadow-brand-green/5">
                          <div>
                             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Estimation</p>
                             <p className="text-2xl font-bold text-slate-900">{selectedService.basePrice} <small className="text-xs">FCFA</small></p>
                          </div>
                          <div className="flex items-center gap-2 text-brand-green font-bold text-sm bg-brand-green/10 px-3 py-1 rounded-full">
                            <Clock className="w-4 h-4" /> 60s max
                          </div>
                       </div>

                       <button 
                        onClick={confirmAndMatch}
                        className="w-full bg-slate-900 text-white font-bold h-16 rounded-2xl flex items-center justify-center gap-3 shadow-xl"
                       >
                         Lancer la recherche
                         <ArrowRight className="w-5 h-5" />
                       </button>
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
                          <p className="text-slate-500 leading-relaxed">Nous contactons les prestataires certifiés pour votre demande de <span className="font-bold text-slate-900 underline decoration-brand-yellow">{selectedService?.name}</span>.</p>
                       </div>
                       <button 
                        onClick={() => setStep("selection")}
                        className="text-slate-400 font-bold hover:text-red-500 transition-colors"
                      >
                        Annuler la recherche
                      </button>
                    </motion.div>
                  )}

                  {step === "active" && activeRequest && (
                    <motion.div key="active" className="space-y-6">
                      <div className="bg-white rounded-[40px] p-8 shadow-2xl border border-slate-50 space-y-8">
                        <div className="flex items-center gap-5">
                          <div className="w-20 h-20 rounded-3xl bg-slate-100 overflow-hidden border-2 border-brand-green shadow-inner">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeRequest.providerId}`} alt="Pro" className="w-full h-full" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-2xl">Ibrahim D.</h3>
                            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                              <div className="flex items-center text-brand-yellow">
                                <Star className="w-4 h-4 fill-current" /> 
                                <span className="ml-1 text-slate-900">4.9</span>
                              </div>
                              <span>•</span>
                              <span>1,200 Missions</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl flex items-center justify-between border border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-green shadow-sm">
                              <Clock className="w-6 h-6" />
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Arrivée prévue</p>
                               <p className="text-xl font-bold text-slate-900">12 Minutes</p>
                            </div>
                          </div>
                          <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                            <ArrowRight className="text-slate-300 w-6 h-6" />
                          </motion.div>
                        </div>

                        <div className="flex gap-4">
                          <button className="flex-1 h-16 bg-brand-green text-white font-bold rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-brand-green/20">
                            <Phone className="w-6 h-6 fill-current" />
                            Appeler
                          </button>
                          <button className="flex-1 h-16 bg-slate-900 text-white font-bold rounded-2xl flex items-center justify-center gap-3">
                            <MessageCircle className="w-6 h-6" />
                            Chat
                          </button>
                        </div>
                      </div>

                      <div className="h-48 bg-slate-100 rounded-3xl border border-slate-200 relative overflow-hidden flex items-center justify-center">
                        <MapIcon className="w-12 h-12 text-slate-300" />
                        <div className="absolute inset-x-4 bottom-4 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex items-center gap-3 border border-white">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          <span className="text-xs font-bold text-slate-600 truncate">En mouvement près de Fidjrossè</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === "provider_dashboard" && (
                    <motion.div key="provider_dashboard" className="space-y-8">
                       <div className="bg-brand-green p-8 rounded-[40px] text-white space-y-6 shadow-2xl shadow-brand-green/20 relative overflow-hidden">
                          <div className="relative z-10 flex justify-between items-center">
                            <span className="text-sm font-medium opacity-80 uppercase tracking-widest">Solde Actuel</span>
                            <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-md"><CreditCard className="w-5 h-5" /></div>
                          </div>
                          <div className="relative z-10">
                            <h2 className="text-5xl font-bold leading-none tracking-tighter">24,500 <small className="text-xl opacity-60">FCFA</small></h2>
                          </div>
                          <div className="relative z-10 flex items-center gap-3 bg-white/10 w-fit px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md">
                            <div className="w-2.5 h-2.5 rounded-full bg-brand-yellow animate-pulse shadow-[0_0_10px_#FFD700]" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Disponible pour mission</span>
                          </div>
                          <div className="absolute right-[-20px] top-[-20px] w-48 h-48 bg-white/5 rounded-full blur-2xl" />
                       </div>

                       <div className="space-y-6">
                          <div className="flex items-center justify-between px-2">
                            <h3 className="font-bold text-xl">Missions à proximité</h3>
                            <div className="bg-slate-100 px-3 py-1 rounded-full text-xs font-bold text-slate-500">Filtré: 5km</div>
                          </div>

                          {availableRequests.length === 0 ? (
                            <div className="py-20 text-center space-y-4">
                              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                <Search className="w-10 h-10 text-slate-200" />
                              </div>
                              <p className="text-slate-400 font-medium">Recherche de nouvelles opportunités...</p>
                            </div>
                          ) : (
                            availableRequests.map(req => (
                              <motion.div key={req.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-2 border-slate-100 p-6 rounded-[32px] shadow-sm hover:border-brand-green/50 transition-all flex flex-col gap-6 group">
                                 <div className="flex justify-between items-start">
                                    <div className="flex gap-4">
                                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-brand-green group-hover:scale-110 transition-transform">
                                        <Wrench className="w-8 h-8" />
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-xl">{req.service}</h4>
                                        <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
                                          <MapPin className="w-3 h-3" /> 
                                          {req.location.address || "Cotonou"} • 
                                          {userLocation ? (
                                            ` ${calculateDistance(userLocation.lat, userLocation.lng, req.location.lat, req.location.lng).toFixed(1)} km`
                                          ) : (
                                            " Calcul..."
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="font-bold text-slate-900 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                                      {req.price} <small className="text-[10px]">F</small>
                                    </div>
                                 </div>
                                 {req.serviceDescription && (
                                   <p className="text-sm text-slate-500 line-clamp-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 italic">
                                     "{req.serviceDescription}"
                                   </p>
                                 )}
                                 <button onClick={() => acceptRequest(req)} className="w-full bg-slate-900 text-white font-bold py-5 rounded-[20px] shadow-xl hover:bg-brand-green transition-colors active:scale-95">Accepter la mission</button>
                              </motion.div>
                            ))
                          )}
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </main>

            {/* Bottom Nav */}
            <div className="fixed bottom-8 left-8 right-8 h-20 bg-slate-900 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-around px-8 z-50 border border-white/5">
               <button onClick={() => setStep(role === "client" ? "selection" : "provider_dashboard")} className={cn("transition-colors", (step === "selection" || step === "provider_dashboard") ? "text-brand-green" : "text-slate-500")}>
                  <Zap className="w-6 h-6 fill-current" />
               </button>
               <button className="text-slate-500 hover:text-white transition-colors"><MapIcon className="w-6 h-6" /></button>
               <button className="text-slate-500 hover:text-white transition-colors"><CreditCard className="w-6 h-6" /></button>
               <button className="text-slate-500 hover:text-white transition-colors"><User className="w-6 h-6" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
