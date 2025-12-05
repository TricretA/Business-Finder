
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Business, ProcessingStage, OutreachPackage, WebsiteReview } from '../types';
import { 
    generateWebsitePrompt, 
    reviewWebsiteContent, 
    generateOutreachMaterials, 
    enrichBusinessData,
    simulateWebsiteDraft,
    refineOutreach,
    generateWebsiteCode,
    refineWebsitePrompt,
    refineWebsiteCode
} from '../services/gemini';
import { 
    savePromptToDb, 
    saveWebsiteToDb, 
    saveReviewToDb, 
    saveOutreachToDb,
    updateBusinessInDb 
} from '../services/supabase';

const BusinessProcessor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Initialize business from router state, but allow fallback if loaded from localstorage later
  const [business, setBusiness] = useState<Business | null>(location.state?.business as Business || null);

  // State
  const [stage, setStage] = useState<ProcessingStage>('PROMPT');
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [prompt, setPrompt] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null); // Base64
  const [review, setReview] = useState<WebsiteReview | null>(null);
  const [outreach, setOutreach] = useState<OutreachPackage | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(''); // Internal Builder State

  // Refinement State
  const [refinementText, setRefinementText] = useState('');
  const [refinementTarget, setRefinementTarget] = useState<'EMAIL' | 'WHATSAPP' | 'SCRIPT' | null>(null);
  const [promptFeedback, setPromptFeedback] = useState('');
  const [showPromptRefine, setShowPromptRefine] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState('');
  
  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // --- PERSISTENCE ---

  useEffect(() => {
    // If we have a business ID, try to load saved state
    if (business?.id) {
        const savedData = localStorage.getItem(`proc_${business.id}`);
        if (savedData) {
            const parsed = JSON.parse(savedData);
            setStage(parsed.stage || 'PROMPT');
            setPrompt(parsed.prompt || '');
            setWebsiteUrl(parsed.websiteUrl || '');
            setScreenshot(parsed.screenshot || null);
            setReview(parsed.review || null);
            setOutreach(parsed.outreach || null);
            setGeneratedCode(parsed.generatedCode || '');
            // Merge enriched data if saved
            if (parsed.business) {
                setBusiness(prev => prev ? ({ ...prev, ...parsed.business }) : parsed.business);
            }
        }
    }
  }, [business?.id]);

  useEffect(() => {
    // Save state whenever it changes
    if (business?.id) {
        localStorage.setItem(`proc_${business.id}`, JSON.stringify({
            stage, prompt, websiteUrl, screenshot, review, outreach, business, generatedCode
        }));
    }
  }, [business, stage, prompt, websiteUrl, screenshot, review, outreach, generatedCode]);

  const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
  };

  const handleManualSave = async () => {
    if (business?.id) {
        // Save local
        localStorage.setItem(`proc_${business.id}`, JSON.stringify({
            stage, prompt, websiteUrl, screenshot, review, outreach, business, generatedCode
        }));
        
        // Save to Supabase (only current relevant data)
        try {
            if (outreach) await saveOutreachToDb(business.id, outreach);
            if (review) await saveReviewToDb(business.id, review);
            if (websiteUrl) await saveWebsiteToDb(business.id, websiteUrl, generatedCode, screenshot || '');
            if (prompt) await savePromptToDb(business.id, prompt);
            
            showToast("Session Saved to Supabase");
        } catch (e) {
            console.error(e);
            showToast("Saved Locally (DB Error)");
        }
    }
  };


  // --- HANDLERS ---
  
  const handleEnrich = async () => {
    if (!business) return;
    setIsEnriching(true);
    try {
        const extra = await enrichBusinessData(business);
        
        // Save to DB
        const updates: any = {};
        if (extra.enriched_data) {
             if (extra.enriched_data.phones && extra.enriched_data.phones.length > 0) updates.phone = extra.enriched_data.phones[0];
             updates.notes = `Extra: ${extra.enriched_data.services?.join(', ')}`;
             await updateBusinessInDb(business.id, updates);
        }

        setBusiness(prev => prev ? ({ ...prev, ...extra, enriched_data: { ...prev.enriched_data, ...extra.enriched_data } }) : null);
        showToast("Deep Research Completed");
    } catch (e) {
        alert("Enrichment failed");
    } finally {
        setIsEnriching(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!business) return;
    setLoading(true);
    try {
        const result = await generateWebsitePrompt(business);
        setPrompt(result);
        // DB Save
        await savePromptToDb(business.id, result);
    } catch (e) {
        alert("Generation failed");
    } finally {
        setLoading(false);
    }
  };

  const handleRefinePrompt = async () => {
      if (!prompt || !promptFeedback) return;
      setLoading(true);
      try {
          const newPrompt = await refineWebsitePrompt(prompt, promptFeedback);
          setPrompt(newPrompt);
          setPromptFeedback('');
          setShowPromptRefine(false);
          // DB Save
          if (business?.id) await savePromptToDb(business.id, newPrompt);
          showToast("Prompt Updated");
      } catch (e) {
          alert("Prompt Refinement Failed");
      } finally {
          setLoading(false);
      }
  };

  const handleSimulateDraft = async () => {
    if (!business) return;
    setLoading(true);
    try {
        const result = await simulateWebsiteDraft(business.name);
        setWebsiteUrl(result.url);
        const shot = "https://placehold.co/1200x800/1e293b/06b6d4?text=AI+Generated+Website+Preview";
        setScreenshot(shot); 
        // DB Save
        await saveWebsiteToDb(business.id, result.url, '', shot);
    } catch (e) {
        alert("Simulation failed");
    } finally {
        setLoading(false);
    }
  };
  
  const handleInternalBuild = async () => {
      if (!business || !prompt) return alert("Generate and approve a prompt first.");
      setLoading(true);
      try {
          const code = await generateWebsiteCode(business, prompt);
          setGeneratedCode(code);
          const url = `${business.name.replace(/\s/g, '').toLowerCase()}.internal-preview.com`;
          setWebsiteUrl(url);
          const shot = "https://placehold.co/1200x800/1e293b/14b8a6?text=Internal+Build+Generated.+Reviewing+Code+Structure.";
          setScreenshot(shot);
          
          // DB Save
          await saveWebsiteToDb(business.id, url, code, shot);
      } catch (e) {
          alert("Internal build failed");
      } finally {
          setLoading(false);
      }
  };

  const handleRefineCode = async () => {
      if (!generatedCode || !codeFeedback) return;
      setLoading(true);
      try {
          const newCode = await refineWebsiteCode(generatedCode, codeFeedback);
          setGeneratedCode(newCode);
          setCodeFeedback('');
          
          // DB Save
          if(business?.id) await saveWebsiteToDb(business.id, websiteUrl, newCode, screenshot || '');
          
          showToast("Code Updated");
      } catch (e) {
          alert("Code Refinement Failed");
      } finally {
          setLoading(false);
      }
  };

  const handleCopyCode = () => {
      if(generatedCode) {
          navigator.clipboard.writeText(generatedCode);
          showToast("Code Copied to Clipboard");
      }
  };

  const handleOpenPreview = () => {
      if (generatedCode) {
          const blob = new Blob([generatedCode], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
      }
  };

  const handleApplyFixes = async () => {
      if (!review || !generatedCode) return;
      setLoading(true);
      try {
          // Construct explicit instructions from both critique points and improvements
          const instructions = `
            CRITICAL ISSUES TO FIX:
            ${review.critique.map(c => `- ${c.point}`).join('\n')}

            RECOMMENDED IMPROVEMENTS:
            ${review.improvements.join('\n')}

            Apply these changes to the code immediately.
          `;
          
          const newCode = await refineWebsiteCode(generatedCode, instructions);
          
          if (newCode && newCode !== generatedCode) {
            setGeneratedCode(newCode);
            setStage('BUILD');
            
            // DB Save
            if(business?.id) await saveWebsiteToDb(business.id, websiteUrl, newCode, screenshot || '');
            showToast("Fixes Applied Automatically");
          } else {
            showToast("AI made no significant changes. Try manual refinement.");
          }

      } catch (e) {
          alert("Failed to apply fixes");
      } finally {
          setLoading(false);
      }
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshot(reader.result as string); // base64
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReview = async () => {
    if ((!screenshot && !generatedCode) || !websiteUrl) return alert("Please provide URL and Screenshot (or Generate Code)");
    
    // Check if it's the placeholder URL which cannot be analyzed by Vision API
    if (screenshot?.startsWith("http") && !generatedCode) {
        alert("The current screenshot is a placeholder. Please capture a real screenshot of the website (or the internal preview) and upload it for AI analysis.");
        return;
    }

    setStage('REVIEW');
    setLoading(true);
    try {
        let result: WebsiteReview;
        
        if (generatedCode) {
             // Code-based review
             result = await reviewWebsiteContent(websiteUrl, undefined, generatedCode);
        } else {
             // Visual review
             const base64Data = screenshot ? screenshot.split(',')[1] : '';
             result = await reviewWebsiteContent(websiteUrl, base64Data);
        }
        setReview(result);
        
        // DB Save
        if (business?.id) await saveReviewToDb(business.id, result);

    } catch (e) {
        alert("Review failed");
    } finally {
        setLoading(false);
    }
  };

  const handleGenerateOutreach = async () => {
    if (!business) return;
    setStage('OUTREACH');
    setLoading(true);
    try {
        const result = await generateOutreachMaterials(business, websiteUrl);
        setOutreach(result);
        
        // DB Save
        await saveOutreachToDb(business.id, result);
    } catch (e) {
        alert("Outreach generation failed");
    } finally {
        setLoading(false);
    }
  };

  const handleRefineOutreach = async () => {
    if (!outreach || !refinementTarget || !refinementText) return;
    setLoading(true);
    try {
        const update = await refineOutreach(outreach, refinementText, refinementTarget);
        setOutreach((prev: OutreachPackage | null) => prev ? ({ ...prev, ...update }) : null);
        
        if (business?.id && outreach) {
             const merged = { ...outreach, ...update };
             await saveOutreachToDb(business.id, merged as OutreachPackage);
        }

        setRefinementText('');
        setRefinementTarget(null);
        showToast("Content Refined");
    } catch (e) {
        alert("Refinement failed");
    } finally {
        setLoading(false);
    }
  };
  
  // --- HELPERS FOR OUTREACH ACTIONS ---
  
  const getContactEmail = () => {
      if (business?.enriched_data?.emails && business.enriched_data.emails.length > 0) {
          return business.enriched_data.emails[0];
      }
      return "";
  };
  
  const getContactPhone = () => {
      if (business?.enriched_data?.phones && business.enriched_data.phones.length > 0) {
          return business.enriched_data.phones[0];
      }
      if (business?.phone) return business.phone;
      return "";
  };

  const handleSendEmail = () => {
      if (!outreach) return;
      const email = getContactEmail();
      const subject = encodeURIComponent(outreach.cold_email.subject);
      const body = encodeURIComponent(outreach.cold_email.body);
      
      if (!email) {
          alert("No business email found. Opening empty draft.");
      }
      
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  };
  
  const handleSendWhatsApp = () => {
      if (!outreach) return;
      let phone = getContactPhone();
      // Simple cleaning of phone number
      phone = phone.replace(/\D/g, ''); 
      const text = encodeURIComponent(outreach.whatsapp);
      
      if (!phone) {
          alert("No business phone number found. Opening WhatsApp web.");
          window.open(`https://wa.me/?text=${text}`, '_blank');
      } else {
          window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
      }
  };
  
  const handleCall = () => {
      const phone = getContactPhone();
      if (!phone) return alert("No phone number available to call.");
      window.open(`tel:${phone}`, '_self');
  };
  
  // --- SUB-COMPONENTS ---
  
  const ProgressBar = () => {
      const steps = [
          { id: 'PROMPT', label: '1. Blueprint' },
          { id: 'BUILD', label: '2. Build' },
          { id: 'REVIEW', label: '3. Review' },
          { id: 'OUTREACH', label: '4. Outreach' },
      ];
      
      const currentIdx = steps.findIndex(s => s.id === stage);
      
      return (
          <div className="w-full mb-8 px-4">
              <div className="relative flex items-center justify-between max-w-4xl mx-auto">
                  {/* Line Background */}
                  <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -z-10 rounded-full"></div>
                  {/* Active Line */}
                  <div 
                    className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-primary to-secondary -z-10 rounded-full transition-all duration-500"
                    style={{ width: `${(currentIdx / (steps.length - 1)) * 100}%` }}
                  ></div>
                  
                  {steps.map((s, idx) => {
                      const isActive = s.id === stage;
                      const isCompleted = idx < currentIdx;
                      
                      return (
                        <div key={s.id} className="flex flex-col items-center cursor-pointer group" onClick={() => (isCompleted || isActive) && setStage(s.id as ProcessingStage)}>
                            <div className={`
                                w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10
                                ${isActive ? 'bg-primary border-primary text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-110' : ''}
                                ${isCompleted ? 'bg-secondary border-secondary text-slate-900' : ''}
                                ${!isActive && !isCompleted ? 'bg-slate-900 border-slate-700 text-slate-500' : ''}
                            `}>
                                {isCompleted ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                    <span className="font-bold text-xs">{idx + 1}</span>
                                )}
                            </div>
                            <span className={`mt-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-white' : 'text-slate-500'}`}>
                                {s.label}
                            </span>
                        </div>
                      );
                  })}
              </div>
          </div>
      )
  };

  // --- RENDERERS ---

  if (!business) return <div className="p-10 text-white">No business selected. Return to Dashboard.</div>;

  return (
    <div className="min-h-screen bg-background text-slate-200 p-6 flex flex-col relative overflow-hidden">
       {/* Background Elements */}
       <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
       <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none"></div>

       {/* Toast */}
       {toast && (
           <div className="fixed top-6 right-6 z-50 bg-green-500/10 border border-green-500/20 text-green-400 px-6 py-3 rounded-full backdrop-blur-md animate-fade-in flex items-center gap-2">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               <span className="text-sm font-bold">{toast}</span>
           </div>
       )}

       {/* Nav / Header */}
       <div className="flex items-center justify-between mb-8 max-w-7xl mx-auto w-full z-10 relative">
            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm uppercase tracking-wider group">
                <div className="p-1.5 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </div>
                Mission Control
            </button>
            <div className="text-xs text-slate-600 font-mono">
                STORE: <span className="text-green-500">ACTIVE</span>
            </div>
       </div>
       
       {/* Progress Bar */}
       <ProgressBar />

       <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 z-10 relative">
            
            {/* LEFT: Business Context (3 Cols) */}
            <div className="col-span-1 lg:col-span-4 space-y-6">
                <div className="glass p-6 rounded-3xl border border-white/5 sticky top-6">
                    <h1 className="text-2xl font-display font-bold text-white mb-2">{business.name}</h1>
                    <p className="text-sm text-slate-400 mb-6 flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {business.address}
                    </p>
                    
                    <div className="space-y-4">
                        <div className="flex gap-4">
                             <div className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5">
                                <span className="text-xs uppercase text-slate-500 block mb-1">Status</span>
                                <span className={`font-bold ${business.website_status === 'NONE' ? 'text-red-400' : 'text-yellow-400'}`}>{business.website_status}</span>
                            </div>
                            <div className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/5">
                                <span className="text-xs uppercase text-slate-500 block mb-1">Rating</span>
                                <span className="text-white font-bold flex items-center gap-1">
                                    {business.rating} <span className="text-[10px] text-slate-500">({business.review_count})</span>
                                </span>
                            </div>
                        </div>

                        {business.enriched_data ? (
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 animate-fade-in">
                                <h3 className="text-xs font-bold text-primary uppercase mb-3 flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    Intelligence Gathered
                                </h3>
                                {business.enriched_data.social_links && (
                                    <div className="mb-2">
                                        <span className="text-[10px] text-slate-400 uppercase">Socials</span>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {business.enriched_data.social_links.map((link, i) => (
                                                <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline truncate max-w-full block">{new URL(link).hostname}</a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {business.enriched_data.phones && business.enriched_data.phones.length > 0 && (
                                    <div className="mb-2">
                                         <span className="text-[10px] text-slate-400 uppercase">Contact</span>
                                         <div className="text-xs text-slate-300">{business.enriched_data.phones[0]}</div>
                                    </div>
                                )}
                                {business.enriched_data.services && (
                                     <div className="mb-2">
                                        <span className="text-[10px] text-slate-400 uppercase">Services</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {business.enriched_data.services.slice(0, 3).map((s, i) => (
                                                <span key={i} className="text-[10px] px-2 py-1 bg-white/10 rounded">{s}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                 <div className="text-xs text-slate-400 italic mt-2">
                                    "{business.enriched_data.extra_details?.slice(0, 100)}..."
                                </div>
                            </div>
                        ) : (
                             <button 
                                onClick={handleEnrich} 
                                disabled={isEnriching}
                                className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
                             >
                                {isEnriching ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Scouring Web...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                        Do Deep Research
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT: Workflow Area (8 Cols) */}
            <div className="col-span-1 lg:col-span-8">
                <div className="glass p-8 rounded-3xl border border-white/5 min-h-[600px] relative">
                    
                    {/* STAGE 1: PROMPT */}
                    {stage === 'PROMPT' && (
                        <div className="animate-fade-in space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-display text-white">AI Architect Protocol</h2>
                                {prompt && (
                                     <button onClick={handleGeneratePrompt} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Regenerate Full
                                     </button>
                                )}
                            </div>
                            
                            {!prompt ? (
                                <div className="text-center py-24 border border-dashed border-white/10 rounded-3xl">
                                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                    </div>
                                    <p className="text-slate-400 mb-8 max-w-md mx-auto">Initialize the creative sequence. This will analyze the business category and location to construct a perfect website architecture.</p>
                                    <button onClick={handleGeneratePrompt} disabled={loading} className="px-8 py-4 bg-primary text-slate-900 font-bold rounded-full hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
                                        {loading ? 'Designing...' : 'Generate Website Prompt'}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <textarea 
                                        className="w-full h-[400px] bg-black/30 border border-white/10 rounded-2xl p-6 text-sm text-slate-300 font-mono focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none custom-scrollbar leading-relaxed"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                    />
                                    
                                    {/* Prompt Refinement UI - Enhanced Visibility */}
                                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-white/10 animate-fade-in space-y-3">
                                        <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
                                            <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            Refine with AI
                                        </div>
                                        <div className="flex gap-3">
                                            <input 
                                                type="text" 
                                                value={promptFeedback}
                                                onChange={(e) => setPromptFeedback(e.target.value)}
                                                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-primary outline-none focus:ring-1 focus:ring-primary/50 transition-all placeholder-slate-600"
                                                placeholder="Instructions: e.g. 'Add a pricing section' or 'Make the tone more luxury'"
                                            />
                                            <button 
                                                onClick={handleRefinePrompt} 
                                                disabled={loading || !promptFeedback} 
                                                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                                            >
                                                {loading ? 'Refining...' : 'Refine'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button onClick={() => setStage('BUILD')} className="px-8 py-3 bg-white text-slate-900 font-bold rounded-full hover:bg-slate-200 transition-all shadow-lg">
                                            Approve Prompt & Proceed
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* STAGE 2: BUILD */}
                    {stage === 'BUILD' && (
                        <div className="animate-fade-in space-y-8">
                            <h2 className="text-xl font-display text-white flex justify-between items-center">
                                <span>Construction Phase</span>
                                <span className="text-xs font-sans font-normal text-slate-500 bg-white/5 px-2 py-1 rounded">Select Method</span>
                            </h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                
                                {/* OPTION A: AI BUILDER (NEW) */}
                                <div className="col-span-1 md:col-span-2 space-y-4">
                                     <div className={`p-1 rounded-3xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 ${loading ? 'animate-pulse' : ''}`}>
                                        <div className="bg-slate-900 rounded-[22px] p-6">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                        Instant AI Builder
                                                    </h3>
                                                    <p className="text-xs text-slate-400 mt-1">Generate a full single-page site code instantly.</p>
                                                </div>
                                                <button 
                                                    onClick={handleInternalBuild}
                                                    disabled={loading}
                                                    className="px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-slate-900 text-xs font-bold uppercase rounded-lg transition-colors border border-primary/20"
                                                >
                                                    {loading && !generatedCode ? 'Building...' : (generatedCode ? 'Regenerate Code' : 'Generate Code')}
                                                </button>
                                            </div>

                                            {generatedCode && (
                                                <div className="space-y-4 animate-fade-in">
                                                    <div className="w-full h-96 bg-white rounded-xl overflow-hidden border border-white/10 relative group">
                                                         <iframe 
                                                            srcDoc={generatedCode}
                                                            className="w-full h-full"
                                                            title="Preview"
                                                         />
                                                         <div className="absolute inset-0 pointer-events-none border-[6px] border-slate-900 rounded-xl"></div>
                                                    </div>
                                                    
                                                    {/* Internal Build Controls */}
                                                    <div className="flex flex-col gap-4">
                                                        <div className="flex gap-2">
                                                            <button onClick={handleOpenPreview} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-white/5 flex items-center justify-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                                Open in New Tab
                                                            </button>
                                                            <button onClick={handleCopyCode} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-white/5 flex items-center justify-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                                Copy Code
                                                            </button>
                                                        </div>

                                                        {/* Code Refinement */}
                                                        <div className="flex gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
                                                            <input 
                                                                type="text" 
                                                                value={codeFeedback}
                                                                onChange={(e) => setCodeFeedback(e.target.value)}
                                                                className="flex-1 bg-transparent text-xs text-white outline-none px-2 w-full min-w-0"
                                                                placeholder="E.g. Change the header background to navy blue..."
                                                            />
                                                            <button onClick={handleRefineCode} disabled={loading} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-xs text-white rounded whitespace-nowrap">
                                                                Edit with AI
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                     </div>
                                </div>

                                {/* OPTIONS B & C: MANUAL (Hide if AI Generated) */}
                                {!generatedCode && (
                                    <>
                                        <div className="col-span-1 space-y-4">
                                            <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/10 h-full">
                                                <h3 className="text-sm font-bold text-white mb-2">Manual Link</h3>
                                                <p className="text-xs text-slate-400 mb-4">Paste URL from external builder (Wix, Framer, etc.)</p>
                                                
                                                <input 
                                                    type="text" 
                                                    placeholder="https://..." 
                                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-primary outline-none"
                                                    value={websiteUrl}
                                                    onChange={(e) => setWebsiteUrl(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="col-span-1 space-y-4">
                                            <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/10 h-full">
                                                <h3 className="text-sm font-bold text-white mb-2">Evidence Upload</h3>
                                                <p className="text-xs text-slate-400 mb-4">Upload screenshot for AI Vision analysis.</p>
                                                
                                                <label className="flex items-center justify-center w-full h-24 border border-dashed border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all relative overflow-hidden group">
                                                    {screenshot ? (
                                                        <img src={screenshot} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-40 transition-opacity" />
                                                    ) : null}
                                                    <div className="relative z-10 flex flex-col items-center">
                                                        <svg className="w-5 h-5 text-slate-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                        <span className="text-[10px] uppercase text-slate-400 font-bold">Upload Image</span>
                                                    </div>
                                                    <input type="file" className="hidden" accept="image/*" onChange={handleScreenshotUpload} />
                                                </label>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            {/* Actions */}
                            <div className="flex justify-end pt-4 gap-4 items-center">
                                {generatedCode ? (
                                    <div className="flex items-center gap-2 mr-4 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                                         <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                         <span className="text-xs font-bold text-green-400 uppercase tracking-wide">Digital Twin Ready for Inspection</span>
                                    </div>
                                ) : (
                                    <button onClick={handleSimulateDraft} disabled={loading} className="text-xs text-slate-500 hover:text-white underline underline-offset-4">
                                        Simulate Draft (Testing)
                                    </button>
                                )}
                                
                                <button onClick={handleReview} disabled={(!websiteUrl && !generatedCode) || (!screenshot && !generatedCode) || loading} className="px-8 py-3 bg-secondary text-slate-900 font-bold rounded-full hover:bg-secondary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                                    {loading ? 'Analyzing...' : 'Submit for AI Review'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STAGE 3: REVIEW */}
                    {stage === 'REVIEW' && (
                        <div className="animate-fade-in space-y-8">
                            <h2 className="text-xl font-display text-white">Quality Assurance Analysis</h2>
                            
                            {review ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left: Scores & Issues */}
                                    <div className="space-y-6">
                                        <div className="flex gap-4">
                                            <div className="flex-1 p-6 bg-slate-900/50 rounded-2xl border border-white/5 text-center">
                                                <div className="text-4xl font-display font-bold text-white mb-1">{review.design_score}</div>
                                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Design</div>
                                            </div>
                                            <div className="flex-1 p-6 bg-slate-900/50 rounded-2xl border border-white/5 text-center">
                                                <div className="text-4xl font-display font-bold text-primary mb-1">{review.conversion_score}</div>
                                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Conversion</div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                                                <h3 className="text-xs font-bold text-red-400 uppercase mb-3">Critique Points</h3>
                                                <ul className="space-y-2">
                                                    {review.critique.map((c, i) => (
                                                        <li key={i} className="text-xs text-slate-300 flex gap-2">
                                                            <span className="text-red-500">•</span>
                                                            {c.point}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-2xl relative">
                                                <h3 className="text-xs font-bold text-green-400 uppercase mb-3">Recommended Fixes</h3>
                                                <ul className="space-y-2 mb-4">
                                                    {review.improvements.map((c, i) => (
                                                        <li key={i} className="text-xs text-slate-300 flex gap-2">
                                                            <span className="text-green-500">✓</span>
                                                            {c}
                                                        </li>
                                                    ))}
                                                </ul>
                                                {generatedCode && (
                                                    <button 
                                                        onClick={handleApplyFixes}
                                                        disabled={loading}
                                                        className="w-full py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all"
                                                    >
                                                        {loading ? 'Applying Fixes...' : 'Auto-Apply All Fixes'}
                                                        {loading ? (
                                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        ) : (
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Annotated Preview */}
                                    <div className="relative rounded-2xl overflow-hidden border border-white/10 group bg-white/5">
                                        {generatedCode ? (
                                            <>
                                                <iframe 
                                                    srcDoc={generatedCode}
                                                    className="w-full h-full min-h-[400px]"
                                                    title="Preview"
                                                />
                                                <div className="absolute inset-0 pointer-events-none border-[6px] border-slate-900 rounded-xl"></div>
                                                <div className="absolute top-2 right-2 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-white pointer-events-none">
                                                    AI Visual Simulation
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <img src={screenshot || ''} alt="Analyzed" className="w-full h-full object-cover" />
                                                {/* Overlays */}
                                                {review.critique.map((c, i) => {
                                                    if (!c.box_2d || (c.box_2d[0] === 0 && c.box_2d[2] === 0)) return null;
                                                    const [ymin, xmin, ymax, xmax] = c.box_2d;
                                                    return (
                                                        <div 
                                                            key={i}
                                                            className="absolute border-2 border-red-500 bg-red-500/10 hover:bg-red-500/30 transition-colors cursor-help group-hover:opacity-100 opacity-60"
                                                            style={{
                                                                top: `${ymin}%`,
                                                                left: `${xmin}%`,
                                                                height: `${ymax - ymin}%`,
                                                                width: `${xmax - xmin}%`
                                                            }}
                                                            title={c.point}
                                                        >
                                                            <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                                                                {c.point.slice(0, 30)}...
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </div>

                                    <div className="col-span-1 md:col-span-2 flex justify-end pt-4">
                                        <button onClick={handleGenerateOutreach} disabled={loading} className="px-8 py-3 bg-primary text-slate-900 font-bold rounded-full hover:bg-primary/90 transition-all shadow-lg">
                                            {loading ? 'Generating Copy...' : 'Approve & Generate Outreach'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                                    <svg className="animate-spin w-8 h-8 text-secondary mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Analyzing visual structure and conversion elements...
                                </div>
                            )}
                        </div>
                    )}

                    {/* STAGE 4: OUTREACH */}
                    {stage === 'OUTREACH' && (
                        <div className="animate-fade-in space-y-8">
                            <h2 className="text-xl font-display text-white">Outreach Deployment Package</h2>
                            
                            {outreach ? (
                                <div className="space-y-8">
                                    {/* Email */}
                                    <div className="space-y-2 group relative">
                                        <div className="flex justify-between items-end">
                                             <h3 className="text-sm font-bold text-slate-400 uppercase">Cold Email</h3>
                                             <div className="flex gap-2">
                                                 <button onClick={() => { setRefinementTarget('EMAIL'); setRefinementText(''); }} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">Refine This</button>
                                                 <button 
                                                    onClick={handleSendEmail} 
                                                    className="px-3 py-1 bg-white/10 hover:bg-primary text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1"
                                                 >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                    Send Email
                                                 </button>
                                             </div>
                                        </div>
                                        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
                                            <div className="mb-4 pb-4 border-b border-white/5">
                                                <span className="text-slate-500 text-xs mr-2 font-bold tracking-wider">SUBJECT:</span>
                                                <span className="text-white text-sm font-medium">{outreach.cold_email.subject}</span>
                                            </div>
                                            <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed font-light">{outreach.cold_email.body}</p>
                                        </div>
                                    </div>

                                    {/* Grid for WA and Script */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2 group relative">
                                            <div className="flex justify-between items-end">
                                                <h3 className="text-sm font-bold text-slate-400 uppercase">WhatsApp Pitch</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setRefinementTarget('WHATSAPP'); setRefinementText(''); }} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">Refine This</button>
                                                    <button 
                                                        onClick={handleSendWhatsApp}
                                                        className="px-3 py-1 bg-[#25D366]/20 hover:bg-[#25D366] text-[#25D366] hover:text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1"
                                                    >
                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                        Open WhatsApp
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-[#25D366]/5 p-6 rounded-2xl border border-[#25D366]/10 hover:border-[#25D366]/30 transition-all h-full">
                                                <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{outreach.whatsapp}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2 group relative">
                                             <div className="flex justify-between items-end">
                                                <h3 className="text-sm font-bold text-slate-400 uppercase">Call Script</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setRefinementTarget('SCRIPT'); setRefinementText(''); }} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">Refine This</button>
                                                    <button 
                                                        onClick={handleCall}
                                                        className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                        Call Now
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-all h-full">
                                                <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{outreach.call_script}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Refinement Modal / Area */}
                                    {refinementTarget && (
                                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                                            <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full">
                                                <h3 className="text-lg font-display text-white mb-4">Refine {refinementTarget}</h3>
                                                <textarea 
                                                    className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-primary outline-none mb-4"
                                                    placeholder="E.g. Make it more casual, mention the specific offer..."
                                                    value={refinementText}
                                                    onChange={(e) => setRefinementText(e.target.value)}
                                                />
                                                <div className="flex justify-end gap-3">
                                                    <button onClick={() => setRefinementTarget(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                                                    <button onClick={handleRefineOutreach} disabled={loading} className="px-6 py-2 bg-primary text-slate-900 rounded-full font-bold text-sm">
                                                        {loading ? 'Refining...' : 'Apply Changes'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-center gap-4 pt-8">
                                        <button onClick={handleManualSave} className="px-8 py-3 bg-white/5 text-slate-300 hover:text-white border border-white/10 rounded-full font-bold hover:bg-white/10 transition-all flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                            Save Draft
                                        </button>
                                        <button onClick={() => navigate('/dashboard')} className="px-8 py-3 bg-white/10 text-white font-bold rounded-full hover:bg-white/20 transition-all flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Finalize & Close
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-slate-500">Synthesizing persuasive assets...</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
       </div>
    </div>
  );
};

export default BusinessProcessor;
