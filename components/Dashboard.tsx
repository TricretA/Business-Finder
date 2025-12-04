
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionCreator from './SessionCreator';
import { Session, Business } from '../types';
import { enrichBusinessData } from '../services/gemini';
import { updateBusinessInDb } from '../services/supabase';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentSession, setCurrentSession] = useState<Partial<Session> | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const handleSessionStart = (sessionData: Partial<Session>, results: Business[]) => {
    setCurrentSession(sessionData);
    setBusinesses(results);
  };

  const handleReset = () => {
    setCurrentSession(null);
    setBusinesses([]);
  };

  const handleProcessBusiness = (business: Business) => {
    // Navigate to the processor with the business object in state
    navigate('/process', { state: { business } });
  };

  const handleEnrichBusiness = async (e: React.MouseEvent, business: Business) => {
      e.stopPropagation(); // Prevent card click
      setEnrichingId(business.id);
      try {
          // 1. Fetch AI details
          const extra = await enrichBusinessData(business);
          
          // 2. Persist to DB
          // We map enriched data to columns where possible, or store as needed.
          // Since DB has specific columns, we'll try to update those.
          // Media assets -> media column (jsonb)
          // Phones -> phone column (using primary)
          // We can also stringify everything else into 'notes' for safekeeping if needed, 
          // or just rely on 'media' and 'phone'.
          const updates: any = {};
          if (extra.enriched_data) {
              if (extra.enriched_data.phones && extra.enriched_data.phones.length > 0) {
                  updates.phone = extra.enriched_data.phones[0];
              }
              if (extra.enriched_data.media_assets) {
                  updates.media = extra.enriched_data.media_assets; // JSONB array
              }
              // Ideally we'd have an 'enriched_data' column, but we stick to schema provided.
              // We'll update the 'notes' with the extra info just in case
              updates.notes = `Services: ${extra.enriched_data.services?.join(', ')}. Socials: ${extra.enriched_data.social_links?.join(', ')}`;
          }
          
          await updateBusinessInDb(business.id, updates);

          // 3. Update local state
          setBusinesses(prev => prev.map(b => 
              b.id === business.id 
              ? { ...b, ...extra, enriched_data: { ...b.enriched_data, ...extra.enriched_data } }
              : b
          ));
      } catch (err) {
          console.error("Failed to enrich card", err);
      } finally {
          setEnrichingId(null);
      }
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 p-6 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold tracking-wider text-white">BUSINESS HUNTER <span className="text-xs text-primary font-sans font-normal px-2 py-0.5 rounded-full bg-primary/10 ml-2">BETA</span></h1>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 font-mono hidden md:block">
                DB_STATUS: <span className="text-green-400">CONNECTED</span>
            </div>
            {currentSession && (
                <button 
                    onClick={handleReset}
                    className="text-xs text-slate-400 hover:text-white transition-colors uppercase tracking-widest px-3 py-1 rounded-full border border-transparent hover:border-white/10"
                >
                    Cancel Session
                </button>
            )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full">
        {!currentSession ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh]">
             <SessionCreator onSessionStart={handleSessionStart} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-fade-in">
            {/* Left Column: Session Info */}
            <div className="col-span-1 space-y-6">
                <div className="glass p-6 rounded-3xl border border-white/5 sticky top-6">
                    <h3 className="text-sm uppercase tracking-widest text-slate-500 mb-4 font-bold">Target Paramaters</h3>
                    <div className="space-y-6">
                        <div>
                            <div className="text-xs text-slate-400 mb-1">Category</div>
                            <div className="text-lg font-display text-white font-medium">{currentSession.category}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-400 mb-1">Region</div>
                            <div className="text-lg font-display text-white font-medium">{currentSession.location}</div>
                        </div>
                        <div className="flex gap-4">
                            <div>
                                <div className="text-xs text-slate-400 mb-1">Min Rating</div>
                                <div className="text-base text-primary font-mono font-bold">{currentSession.rating_min}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 mb-1">Filter</div>
                                <div className="text-base text-secondary font-mono font-bold">{currentSession.website_filter}</div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 pt-4 border-t border-white/5">
                        <p className="text-xs text-slate-500 mb-2">Targets Found: {businesses.length}</p>
                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-full animate-pulse"></div>
                        </div>
                        <p className="text-[10px] text-green-500 mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Synced to Supabase
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Column: Grid Results */}
            <div className="col-span-1 lg:col-span-3">
                 <h2 className="text-2xl font-display text-white mb-6 flex items-center gap-3">
                    <span>Identified Targets</span>
                    <span className="text-xs font-sans font-normal text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/5">{businesses.length} Results</span>
                 </h2>

                 {businesses.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                        No businesses found matching criteria. Try broadening search to adjacent regions.
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {businesses.map((biz, idx) => (
                            <div 
                                key={idx} 
                                className="glass p-8 rounded-3xl border border-white/5 hover:border-primary/30 transition-all hover:-translate-y-1 group flex flex-col md:flex-row gap-6 items-start"
                            >
                                <div className="flex-1 w-full">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-2xl font-bold text-white group-hover:text-primary transition-colors tracking-tight">{biz.name}</h3>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ml-4
                                            ${biz.website_status === 'NONE' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                                            {biz.website_status === 'NONE' ? 'No Website' : 'Review Needed'}
                                        </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm text-slate-400 mb-4 font-medium">
                                        <div className="flex items-center gap-1.5 text-yellow-500">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                            <span className="text-white font-bold">{biz.rating}</span>
                                        </div>
                                        <span className="text-slate-600">•</span>
                                        <div>{biz.review_count} Reviews</div>
                                        <span className="text-slate-600">•</span>
                                        <div className="truncate max-w-[200px]">{biz.address}</div>
                                    </div>

                                    <p className="text-base text-slate-300 mb-6 leading-relaxed font-light">{biz.description || "No description available."}</p>
                                    
                                    {/* Enriched Data Section */}
                                    {biz.enriched_data && (
                                        <div className="mb-4 p-4 bg-white/5 rounded-2xl border border-white/5 animate-fade-in">
                                            <div className="flex items-center gap-2 mb-3">
                                                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                <div className="text-xs text-primary uppercase font-bold tracking-wider">Deep Intelligence Collected</div>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Services */}
                                                {biz.enriched_data.services && biz.enriched_data.services.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 uppercase mb-1">Services</div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {biz.enriched_data.services.slice(0, 4).map((s, i) => (
                                                                <span key={i} className="text-[10px] px-2 py-1 bg-white/5 rounded text-slate-300">{s}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Contacts */}
                                                <div className="space-y-1">
                                                     <div className="text-[10px] text-slate-500 uppercase mb-1">Contact Vectors</div>
                                                     {biz.enriched_data.emails && biz.enriched_data.emails.map((e, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-300 truncate">
                                                            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                            {e}
                                                        </div>
                                                     ))}
                                                     {biz.enriched_data.phones && biz.enriched_data.phones.map((p, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-300 truncate">
                                                             <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                            {p}
                                                        </div>
                                                     ))}
                                                </div>
                                            </div>
                                            
                                            {/* Media */}
                                            {biz.enriched_data.media_assets && biz.enriched_data.media_assets.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-white/5">
                                                     <div className="text-[10px] text-slate-500 uppercase mb-1">Assets Found</div>
                                                     <div className="text-xs text-slate-400 italic">
                                                        {biz.enriched_data.media_assets.length} images/videos identified on web.
                                                     </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3 min-w-[160px]">
                                     <button 
                                        onClick={(e) => handleEnrichBusiness(e, biz)}
                                        disabled={enrichingId === biz.id}
                                        className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold text-xs transition-all border border-white/5 flex items-center justify-center gap-2"
                                    >
                                        {enrichingId === biz.id ? (
                                             <>
                                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                <span>Researching...</span>
                                             </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                More Info
                                            </>
                                        )}
                                    </button>
                                    <button 
                                        onClick={() => handleProcessBusiness(biz)}
                                        className="py-4 px-4 rounded-xl bg-white/5 hover:bg-primary text-white hover:text-slate-900 font-bold text-sm transition-all flex items-center justify-center gap-2 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                                    >
                                        <span>Process Target</span>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
