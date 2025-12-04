
import React, { useState, useRef, useEffect } from 'react';
import { findBusinessesWithGemini, fetchRegions } from '../services/gemini';
import { createSessionInDb, saveBusinessesToDb } from '../services/supabase';
import { Session, Business } from '../types';

// --- DATASETS ---

const CONTINENTS = [
  "North America", "Europe", "Asia", "South America", "Africa", "Oceania", "Antarctica"
];

const COUNTRIES: Record<string, string[]> = {
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
    "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
    "Congo (Republic)", "Congo (Democratic Republic)", "Djibouti", "Egypt",
    "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
    "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
    "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
    "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe",
    "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa",
    "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia",
    "Zimbabwe"
  ],

  "Asia": [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan",
    "Brunei", "Cambodia", "China", "Cyprus", "Georgia", "India", "Indonesia",
    "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait",
    "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives", "Mongolia",
    "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Philippines",
    "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria",
    "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey", "Turkmenistan",
    "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"
  ],

  "Europe": [
    "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus",
    "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Georgia",
    "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Kazakhstan",
    "Kosovo", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta",
    "Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway",
    "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia",
    "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey",
    "Ukraine", "United Kingdom", "Vatican City"
  ],

  "North America": [
    "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada", "Costa Rica",
    "Cuba", "Dominica", "Dominican Republic", "El Salvador", "Grenada",
    "Guatemala", "Haiti", "Honduras", "Jamaica", "Mexico", "Nicaragua",
    "Panama", "Saint Kitts and Nevis", "Saint Lucia",
    "Saint Vincent and the Grenadines", "Trinidad and Tobago",
    "United States"
  ],

  "South America": [
    "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador",
    "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"
  ],

  "Oceania": [
    "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia",
    "Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa",
    "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu"
  ],

  "Antarctica": [
    "Antarctica"
  ]
};


// --- TYPES ---

interface SessionCreatorProps {
  onSessionStart: (sessionData: Partial<Session>, results: Business[]) => void;
}

type LocationStep = 'CONTINENT' | 'COUNTRY' | 'REGION' | 'DONE';

// --- COMPONENT ---

const SessionCreator: React.FC<SessionCreatorProps> = ({ onSessionStart }) => {
  const [loading, setLoading] = useState(false);
  const [regionLoading, setRegionLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("ENGAGING SATELLITES...");
  
  // Form State
  const [formData, setFormData] = useState({
    category: '',
    ratingMin: 4.0,
    websiteFilter: 'NO_WEBSITE',
  });

  // Location State
  const [locationStep, setLocationStep] = useState<LocationStep>('CONTINENT');
  const [selectedContinent, setSelectedContinent] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [regions, setRegions] = useState<string[]>([]);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const locationWrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locationWrapperRef.current && !locationWrapperRef.current.contains(event.target as Node)) {
        setIsLocationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- HELPERS ---

  const getFilteredItems = (items: string[]) => {
    if (!searchQuery) return items;
    return items.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const handleContinentSelect = (continent: string) => {
    setSelectedContinent(continent);
    setLocationStep('COUNTRY');
    setSearchQuery('');
  };

  const handleCountrySelect = async (country: string) => {
    setSelectedCountry(country);
    setLocationStep('REGION');
    setSearchQuery('');
    setRegionLoading(true);
    setRegions([]); // Clear previous
    
    // Fetch real-time regions
    const fetchedRegions = await fetchRegions(country);
    setRegions(fetchedRegions);
    setRegionLoading(false);
  };

  const handleRegionSelect = (region: string) => {
    setSelectedRegion(region);
    setLocationStep('DONE');
    setIsLocationOpen(false);
    setSearchQuery('');
  };

  const resetLocation = () => {
    setSelectedContinent('');
    setSelectedCountry('');
    setSelectedRegion('');
    setRegions([]);
    setLocationStep('CONTINENT');
    setSearchQuery('');
    setIsLocationOpen(true);
  };

  const getFullLocationString = () => {
    if (selectedRegion && selectedCountry) return `${selectedRegion}, ${selectedCountry}`;
    if (selectedCountry) return selectedCountry;
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedRegion || !selectedCountry) {
        alert("Please complete the location selection.");
        setIsLocationOpen(true);
        return;
    }

    setLoading(true);
    setLoadingMessage("SCANNING SECTOR...");
    const fullLocation = `${selectedRegion}, ${selectedCountry}`;

    try {
      // 1. Fetch AI Results
      const results = await findBusinessesWithGemini(
        formData.category,
        fullLocation,
        formData.ratingMin
      );

      setLoadingMessage("SYNCING DATABASE...");

      // 2. Create Session in Supabase
      const sessionPayload: Partial<Session> = {
        category: formData.category,
        location: fullLocation,
        rating_min: formData.ratingMin,
        website_filter: formData.websiteFilter as any,
        created_at: new Date().toISOString(),
        status: 'active'
      };
      
      const session = await createSessionInDb(sessionPayload);
      
      if (session && results.length > 0) {
          // 3. Save Businesses linked to Session
          const savedBusinesses = await saveBusinessesToDb(session.id, results);
          
          // 4. Update App State with REAL DB IDs
          onSessionStart(session, savedBusinesses || []);
      } else {
          // Fallback if DB fails (shouldn't happen often)
          onSessionStart(sessionPayload, results);
      }
      
    } catch (error) {
      console.error(error);
      alert("Failed to initialize session. Check connections.");
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERERS ---

  const renderLocationDropdown = () => {
    if (!isLocationOpen) return null;

    let content;
    let title = "Select Region";

    if (locationStep === 'CONTINENT') {
        title = "Select Continent";
        content = (
            <div className="grid grid-cols-2 gap-2 animate-fade-in">
                {getFilteredItems(CONTINENTS).map(c => (
                    <button 
                        key={c}
                        type="button"
                        onClick={() => handleContinentSelect(c)}
                        className={`text-left px-4 py-3 rounded-xl text-sm border transition-all duration-200
                        ${selectedContinent === c 
                            ? 'bg-primary/20 border-primary text-white shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                            : 'bg-slate-800/50 border-white/5 text-slate-300 hover:bg-primary/10 hover:text-white hover:border-white/10'}`}
                    >
                        {c}
                    </button>
                ))}
            </div>
        );
    } else if (locationStep === 'COUNTRY') {
        title = `Select Country in ${selectedContinent}`;
        const countries = COUNTRIES[selectedContinent] || [];
        const filtered = getFilteredItems(countries);
        content = (
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar animate-fade-in">
                {filtered.map(c => (
                    <button 
                        key={c} 
                        type="button"
                        onClick={() => handleCountrySelect(c)}
                        className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm flex justify-between items-center group
                        ${selectedCountry === c ? 'bg-primary/20 text-white' : 'hover:bg-white/5 text-slate-300'}`}
                    >
                        <span>{c}</span>
                        <svg className={`w-4 h-4 transition-opacity text-primary ${selectedCountry === c ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}
                {filtered.length === 0 && <div className="text-slate-500 text-sm p-4 text-center">No countries found.</div>}
            </div>
        );
    } else if (locationStep === 'REGION') {
        title = `Select Region in ${selectedCountry}`;
        
        if (regionLoading) {
            content = (
                <div className="flex items-center justify-center py-8 text-primary animate-fade-in">
                    <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="ml-3 text-sm text-slate-400">Scanning Satellite Data...</span>
                </div>
            )
        } else {
            const filtered = getFilteredItems(regions);
            content = (
                <div className="space-y-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar animate-fade-in">
                    {filtered.map(r => (
                        <button 
                            key={r} 
                            type="button"
                            onClick={() => handleRegionSelect(r)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm flex justify-between items-center group
                            ${selectedRegion === r ? 'bg-primary/20 text-white' : 'hover:bg-white/5 text-slate-300'}`}
                        >
                            <span>{r}</span>
                            <svg className={`w-4 h-4 transition-opacity text-primary ${selectedRegion === r ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    ))}
                     {filtered.length === 0 && <div className="text-slate-500 text-sm p-4 text-center">No regions found.</div>}
                </div>
            );
        }
    }

    return (
        <div className="absolute top-full left-0 w-full mt-2 bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in ring-1 ring-white/5">
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {locationStep !== 'CONTINENT' && (
                        <button type="button" onClick={() => {
                            if (locationStep === 'REGION') setLocationStep('COUNTRY');
                            else if (locationStep === 'COUNTRY') setLocationStep('CONTINENT');
                        }} className="p-1 hover:text-white text-slate-400 transition-colors">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</span>
                </div>
                
                {/* Always Show Search if not Loading */}
                {!regionLoading && (
                     <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                            <svg className="h-3 w-3 text-slate-500 group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input 
                            type="text" 
                            autoFocus
                            placeholder="Filter..." 
                            className="bg-black/20 border border-transparent focus:border-primary/30 rounded-lg py-1 pl-7 pr-2 text-xs text-white focus:ring-1 focus:ring-primary/30 w-28 md:w-36 transition-all outline-none placeholder-slate-600"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </div>
            <div className="p-2 bg-slate-900/50 min-h-[100px]">
                {content}
            </div>
            <div className="p-2 border-t border-white/5 bg-slate-900/80">
                <button 
                    type="button" 
                    onClick={resetLocation} 
                    className="w-full py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors uppercase tracking-widest font-semibold flex items-center justify-center gap-2"
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    Clear Selection
                </button>
            </div>
        </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto glass p-8 rounded-3xl animate-fade-in border border-white/5 relative">
      <h2 className="text-2xl font-display text-white mb-8 border-b border-white/10 pb-4 flex items-center gap-3">
        <span className="w-2 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(6,182,212,0.5)]"></span>
        Target Vector Configuration
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ROW 1: Category & Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Category Input */}
          <div className="space-y-3">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold ml-1">Target Niche</label>
            <div className="relative group">
                <input
                type="text"
                required
                className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all shadow-inner"
                placeholder="e.g. Dental Clinic"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500"></div>
            </div>
          </div>

          {/* Custom Location Selector */}
          <div className="space-y-3 relative" ref={locationWrapperRef}>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold ml-1">Target Location</label>
            <div 
                className={`w-full bg-slate-900/50 border ${isLocationOpen ? 'border-primary/50 ring-1 ring-primary/50' : 'border-white/10'} rounded-2xl px-5 py-4 text-white cursor-pointer hover:bg-slate-900/70 transition-all shadow-inner flex justify-between items-center group`}
                onClick={() => {
                    if (!isLocationOpen) {
                        setIsLocationOpen(true);
                    } else {
                        setIsLocationOpen(false);
                    }
                }}
            >
                <span className={`transition-colors ${getFullLocationString() ? "text-white font-medium" : "text-slate-600"}`}>
                    {getFullLocationString() || "Select Region..."}
                </span>
                <div className={`p-1 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors`}>
                    <svg className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isLocationOpen ? 'rotate-180 text-primary' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            {renderLocationDropdown()}
          </div>
        </div>

        {/* ROW 2: Website Status & Rating */}
        <div className="grid grid-cols-1 gap-8">
            <div className="space-y-3">
                 <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold ml-1">Current Digital Footprint</label>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { id: 'NO_WEBSITE', label: 'No Website', desc: 'Highest Opportunity', color: 'from-red-500/20 to-orange-500/10 border-red-500/30' },
                        { id: 'POOR_WEBSITE', label: 'Poor Website', desc: 'Upgrade Potential', color: 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30' },
                        { id: 'ANY', label: 'Any Status', desc: 'Broad Search', color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30' }
                    ].map((option) => (
                        <div 
                            key={option.id}
                            onClick={() => setFormData({...formData, websiteFilter: option.id})}
                            className={`
                                relative cursor-pointer rounded-2xl p-4 border transition-all duration-300 overflow-hidden group
                                ${formData.websiteFilter === option.id 
                                    ? `bg-gradient-to-br ${option.color} ring-1 ring-white/20 scale-[1.02] shadow-lg` 
                                    : 'bg-slate-900/30 border-white/5 hover:border-white/10 hover:bg-slate-900/50'}
                            `}
                        >
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <span className={`font-display font-bold text-sm mb-1 ${formData.websiteFilter === option.id ? 'text-white' : 'text-slate-400'}`}>
                                    {option.label}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-slate-500">{option.desc}</span>
                            </div>
                            {/* Animated Glow for Active State */}
                            {formData.websiteFilter === option.id && (
                                <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                            )}
                        </div>
                    ))}
                 </div>
            </div>
        </div>

        {/* ROW 3: Min Rating Slider */}
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold ml-1">Minimum Business Rating</label>
                <span className="text-primary font-mono text-lg font-bold">{formData.ratingMin} <span className="text-sm text-slate-500 font-normal">/ 5.0</span></span>
            </div>
            <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={formData.ratingMin}
                onChange={(e) => setFormData({...formData, ratingMin: parseFloat(e.target.value)})}
                className="w-full h-2 bg-slate-900 rounded-full appearance-none cursor-pointer accent-primary hover:accent-secondary transition-all"
            />
             <div className="flex justify-between text-[10px] text-slate-600 px-1 font-mono">
                <span>0.0</span>
                <span>2.5</span>
                <span>5.0</span>
            </div>
        </div>

        {/* Action Button */}
        <div className="pt-6 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className={`
              relative overflow-hidden group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary/20 to-secondary/20 hover:from-primary/30 hover:to-secondary/30 text-white border border-primary/30 rounded-full transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)]
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {loading ? (
              <>
                 <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-display tracking-widest text-sm">{loadingMessage}</span>
              </>
            ) : (
              <>
                <span className="font-display tracking-widest text-sm font-bold">INITIATE SEARCH</span>
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                </svg>
              </>
            )}
             <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
          </button>
        </div>
      </form>
    </div>
  );
};

export default SessionCreator;
