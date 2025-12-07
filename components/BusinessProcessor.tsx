
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
import { sendEmail } from '../services/email';

// Declare Prism global to avoid TS errors as it's loaded via CDN
declare const Prism: any;

const WEBSITE_STYLES = [
    "Modern Professional", "Minimalist Clean", "Dark Mode High-Tech", 
    "Creative Vibrant", "Corporate Trustworthy", "Luxury Elegant", 
    "Brutalist Bold", "Startup SaaS", "Retro Vintage", "Playful Pop",
    "Neumorphism Soft", "Cyberpunk Neon", "Bento Grid Layout", 
    "Typographic Editorial", "Monochromatic Focus", "Nature/Eco Friendly",
    "Industrial Raw", "Glassmorphism Frost", "Material Design 3", "Apple-esque",
    "Pastel Dream", "Grunge Underground", "Art Deco Gold", "Swiss International",
    "Y2K Nostalgia", "Futuristic Sci-Fi", "Organic Boho", "Isometric 3D",
    "Abstract Geometric", "Hand-Drawn Doodle"
];

const WEBSITE_TYPES = [
    "Landing Page", "Multi-Page Site", "Portfolio/Showcase", "E-commerce/Store",
    "SaaS Dashboard", "Blog/News Magazine", "Restaurant/Menu", "Real Estate Listing",
    "Event/Conference", "Non-Profit/Charity", "Medical/Clinic", "Legal Firm",
    "Educational/Course", "Gym/Fitness", "Hotel/Booking", "Personal Resume",
    "Construction/Trades", "Beauty/Spa", "Automotive/Repair", "Photography Studio",
    "Digital Agency", "Architecture Firm", "Crypto/Web3", "Coming Soon Page"
];

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

  // Build Options
  const [designStyle, setDesignStyle] = useState('Modern Professional');
  const [websiteType, setWebsiteType] = useState('Landing Page');

  // Refinement State
  const [refinementText, setRefinementText] = useState('');
  const [refinementSnippet, setRefinementSnippet] = useState(''); // The selected text to refine
  const [refinementTarget, setRefinementTarget] = useState<string | null>(null); // Generic Key
  const [promptFeedback, setPromptFeedback] = useState('');
  const [showPromptRefine, setShowPromptRefine] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState('');
  
  // Review View State
  const [reviewViewMode, setReviewViewMode] = useState<'VISUAL' | 'CODE'>('VISUAL');
  const [activeCritiqueIndex, setActiveCritiqueIndex] = useState<number | null>(null);
  const codeViewRef = useRef<HTMLPreElement>(null);

  // Outreach Options & State
  const [includeCalendar, setIncludeCalendar] = useState(false);
  const [outreachTab, setOutreachTab] = useState<'INITIAL' | 'FOLLOWUP' | 'OBJECTIONS'>('INITIAL');
  
  // Summary Metrics
  const [projectScore, setProjectScore] = useState(0);
  
  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  // --- PERSISTENCE ---

  useEffect(() => {
    // If router state has full data (resume mode), load it
    if (location.state?.stage) {
        setStage(location.state.stage);
        setPrompt(location.state.prompt || '');
        setWebsiteUrl(location.state.websiteUrl || '');
        setGeneratedCode(location.state.generatedCode || '');
        setScreenshot(location.state.screenshot || null);
        setReview(location.state.review || null);
        setOutreach(location.state.outreach || null);
    } 
    // Otherwise fallback to localStorage if available
    else if (business?.id) {
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
  }, [business?.id, location.state]);

  // Auto-Save Effect (Local Only) on state change
  useEffect(() => {
    if (business?.id) {
        localStorage.setItem(`proc_${business.id}`, JSON.stringify({
            stage, prompt, websiteUrl, screenshot, review, outreach, business, generatedCode
        }));
    }
  }, [business, stage, prompt, websiteUrl, screenshot, review, outreach, generatedCode]);

  // Auto-Save Effect (DB Sync) every 60 seconds
  useEffect(() => {
      const interval = setInterval(() => {
          if (business?.id) {
              handleManualSave(true);
          }
      }, 60000); // 60 seconds

      return () => clearInterval(interval);
  }, [business, prompt, websiteUrl, generatedCode, review, outreach]);


  // Effect to scroll to code snippet when critique is hovered
  useEffect(() => {
      if (reviewViewMode === 'CODE' && activeCritiqueIndex !== null && review?.critique[activeCritiqueIndex]?.related_code_snippet) {
          const snippet = review.critique[activeCritiqueIndex].related_code_snippet;
          if (!snippet || !codeViewRef.current) return;
          
          // Find the mark element
          const targetMark = codeViewRef.current.querySelector(`mark[data-index="${activeCritiqueIndex}"]`);
          if (targetMark) {
              targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      }
  }, [activeCritiqueIndex, reviewViewMode, review]);
  
  // Effect to trigger Prism Highlight
  useEffect(() => {
      if ((stage === 'REVIEW' || stage === 'BUILD') && reviewViewMode === 'CODE' && generatedCode && typeof Prism !== 'undefined') {
          // Small timeout to ensure DOM is ready
          setTimeout(() => {
              Prism.highlightAll();
          }, 100);
      }
  }, [stage, reviewViewMode, generatedCode]);


  const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
  };

  const handleManualSave = async (silent = false) => {
    if (business?.id) {
        // Save local
        localStorage.setItem(`proc_${business.id}`, JSON.stringify({
            stage, prompt, websiteUrl, screenshot, review, outreach, business, generatedCode
        }));
        
        // Save to Supabase (only current relevant data)
        try {
            const promises = [];
            if (outreach) promises.push(saveOutreachToDb(business.id, outreach));
            if (review) promises.push(saveReviewToDb(business.id, review));
            if (websiteUrl) promises.push(saveWebsiteToDb(business.id, websiteUrl, generatedCode, screenshot || ''));
            if (prompt) promises.push(savePromptToDb(business.id, prompt));
            
            await Promise.all(promises);
            
            if (!silent) showToast("Session Saved to Supabase");
        } catch (e) {
            console.error(e);
            if (!silent) showToast("Saved Locally (DB Error)");
        }
    }
  };
  
  const calculateProjectScore = () => {
      let score = 0;
      if (business?.enriched_data) score += 20;
      if (prompt) score += 20;
      if (generatedCode || websiteUrl) score += 20;
      if (review) score += 20;
      if (outreach) score += 20;
      setProjectScore(score);
  };

  const handleFinalize = () => {
      // Calculate final metrics
      calculateProjectScore();
      
      // Move to Summary Stage instead of exiting
      setStage('SUMMARY');
      handleManualSave(); // Auto save
      setShowFinalizeConfirm(false);
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

        setBusiness(prev => prev ? ({ ...prev, ...extra, enriched_data: { ...prev.enriched_data, ...extra.enriched_data } } as Business) : null);
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
          // Now passing designStyle AND websiteType
          const code = await generateWebsiteCode(business, prompt, designStyle, websiteType);
          setGeneratedCode(code);
          
          // GENERATE PERMANENT LINK
          // This constructs a link to the viewer route
          // Ensure we are using the origin to create a full permalink if needed, or relative for app routing
          const permLink = `${window.location.origin}/#/view/${business.id}`;
          
          setWebsiteUrl(permLink);
          
          const shot = `https://placehold.co/1200x800/1e293b/14b8a6?text=Site+Ready:+${designStyle.replace(/\s/g, '+')}`;
          setScreenshot(shot);
          
          // DB Save - Code is saved to DB, so permLink will work when visited
          await saveWebsiteToDb(business.id, permLink, code, shot);
          showToast("Website Generated & Live Link Created");
      } catch (e) {
          alert("Internal build failed");
          console.error(e);
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
      // Prioritize opening the permanent link if available, otherwise blob
      if (websiteUrl && websiteUrl.includes('/view/')) {
          window.open(websiteUrl, '_blank');
      } else if (generatedCode) {
          const blob = new Blob([generatedCode], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
      }
  };

  const handleDownloadReport = () => {
      if (!business) return;
      
      const content = `
# AI Business Hunter Report
**Business:** ${business.name}
**Date:** ${new Date().toLocaleDateString()}

## 1. Business Intelligence
- Address: ${business.address}
- Rating: ${business.rating} (${business.review_count} reviews)
- Services: ${business.enriched_data?.services?.join(', ') || 'N/A'}

## 2. Website Strategy
**Live Demo URL:** ${websiteUrl}
**Design Score:** ${review?.design_score || 'N/A'}/10
**Conversion Score:** ${review?.conversion_score || 'N/A'}/10

### Website Blueprint (Prompt)
${prompt}

### Review Highlights
${review?.improvements.map(i => `- ${i}`).join('\n') || 'None'}

## 3. Outreach Materials

### Cold Email
**Subject:** ${outreach?.cold_email.subject}

${outreach?.cold_email.body}

### WhatsApp Pitch
${outreach?.whatsapp}

### Call Script
${outreach?.call_script}
      `;
      
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${business.name.replace(/\s+/g, '_')}_Report.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const handleApplyFixes = async () => {
      if (!review || !generatedCode) return;
      setLoading(true);
      try {
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
            // DO NOT switch to BUILD stage. Stay in REVIEW but update the code view.
            setReviewViewMode('VISUAL');
            
            // DB Save
            if(business?.id) await saveWebsiteToDb(business.id, websiteUrl, newCode, screenshot || '');
            showToast("Fixes Applied In-Place. Code Updated.");
          } else {
            showToast("AI made no significant changes.");
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
        const result = await generateOutreachMaterials(business, websiteUrl, { includeCalendar });
        setOutreach(result);
        
        // DB Save
        await saveOutreachToDb(business.id, result);
    } catch (e) {
        alert("Outreach generation failed");
    } finally {
        setLoading(false);
    }
  };

  // Improved refinement handler
  const handleRefineOutreach = async () => {
    if (!outreach || !refinementTarget || !refinementText) return;
    setLoading(true);
    try {
        // Prepare content context based on target
        let contentToRefine: any = "";
        
        if (refinementTarget === 'COLD_EMAIL') contentToRefine = outreach.cold_email;
        else if (refinementTarget === 'WHATSAPP') contentToRefine = outreach.whatsapp;
        else if (refinementTarget === 'CALL_SCRIPT') contentToRefine = outreach.call_script;
        else if (refinementTarget.startsWith('FOLLOWUP_')) {
            const idx = parseInt(refinementTarget.split('_')[1]);
            contentToRefine = outreach.follow_ups?.[idx];
        }

        const update = await refineOutreach(contentToRefine, refinementText, refinementTarget);
        
        // Merge update back into outreach object
        let newOutreach = { ...outreach };
        
        if (refinementTarget === 'COLD_EMAIL') newOutreach.cold_email = update;
        else if (refinementTarget === 'WHATSAPP') newOutreach.whatsapp = update;
        else if (refinementTarget === 'CALL_SCRIPT') newOutreach.call_script = update;
        else if (refinementTarget.startsWith('FOLLOWUP_')) {
            const idx = parseInt(refinementTarget.split('_')[1]);
            if (newOutreach.follow_ups) newOutreach.follow_ups[idx] = update;
        }

        setOutreach(newOutreach);
        
        if (business?.id) {
             await saveOutreachToDb(business.id, newOutreach);
        }

        setRefinementText('');
        setRefinementSnippet('');
        setRefinementTarget(null);
        showToast("Content Refined");
    } catch (e) {
        alert("Refinement failed");
    } finally {
        setLoading(false);
    }
  };

  const handleCaptureSelection = (targetKey: string) => {
      const selected = window.getSelection()?.toString();
      if (selected) {
          setRefinementSnippet(selected);
          setRefinementTarget(targetKey);
      } else {
          // Fallback if no text selected, still open modal
          setRefinementSnippet('');
          setRefinementTarget(targetKey);
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

  const handleSendEmail = async () => {
      if (!outreach) return;
      const email = getContactEmail();
      
      setLoading(true);
      try {
        // Mock Send
        const success = await sendEmail(
            email || 'test@example.com',
            outreach.cold_email.subject,
            outreach.cold_email.body
        );
        if (success) {
            showToast("Email Sent Successfully");
        } else {
            alert("Failed to send email.");
        }
      } catch(e) {
          alert("Email service error");
      } finally {
          setLoading(false);
      }
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
          { id: 'SUMMARY', label: '5. Summary' },
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

  const renderHighlightedCode = () => {
    if (!generatedCode || !review?.critique) {
        return <code className="language-html">{generatedCode}</code>;
    }
    
    // Naive split rendering with Prism Highlight logic
    
    let safeHtml = generatedCode
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // We iterate through critique points, identify unique snippets, and replace them in the render.
    const highlights = review.critique
        .map((c, idx) => ({ snippet: c.related_code_snippet, index: idx }))
        .filter(h => h.snippet && h.snippet.length > 5);

    highlights.forEach(h => {
        // Escape the snippet to match the safeHtml
        const safeSnippet = h.snippet!
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        const isActive = activeCritiqueIndex === h.index;
        const className = isActive 
            ? "bg-red-500/50 text-white px-1 rounded ring-2 ring-red-400" 
            : "bg-yellow-500/20 text-yellow-200 px-1 rounded";

        safeHtml = safeHtml.replace(
            safeSnippet, 
            `<mark class="${className}" data-index="${h.index}">${safeSnippet}</mark>`
        );
    });

    return <code className="language-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
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

       {/* Confirmation Modal */}
       {showFinalizeConfirm && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
               <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center">
                    <div className="w-12 h-12 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h3 className="text-xl font-display font-bold text-white mb-2">Finalize Mission?</h3>
                    <p className="text-sm text-slate-400 mb-6">This will complete the outreach stage and generate the final intelligence summary.</p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setShowFinalizeConfirm(false)} className="px-6 py-2 text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={handleFinalize} className="px-6 py-2 bg-primary text-slate-900 font-bold rounded-full hover:bg-primary/90">Confirm</button>
                    </div>
               </div>
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
            
            {/* LEFT: Business Context (3 Cols) - HIDE ON SUMMARY */}
            {stage !== 'SUMMARY' && (
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
            )}

            {/* RIGHT: Workflow Area */}
            <div className={`col-span-1 ${stage === 'SUMMARY' ? 'lg:col-span-12' : 'lg:col-span-8'}`}>
                <div className={`glass p-8 rounded-3xl border border-white/5 min-h-[600px] relative ${stage === 'SUMMARY' ? 'bg-slate-900/80' : ''}`}>
                    
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
                                <div className="col-span-1 md:col-span-2 space-y-4">
                                     <div className={`p-1 rounded-3xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 ${loading ? 'animate-pulse' : ''}`}>
                                        <div className="bg-slate-900 rounded-[22px] p-6">
                                            <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
                                                <div>
                                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                        Instant AI Builder
                                                    </h3>
                                                    <p className="text-xs text-slate-400 mt-1">Generate a full single-page site code instantly.</p>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {/* Style Selector */}
                                                    <select 
                                                        value={designStyle}
                                                        onChange={(e) => setDesignStyle(e.target.value)}
                                                        className="bg-black/30 border border-white/10 text-xs text-white rounded-lg px-3 py-2 outline-none focus:border-primary max-w-[150px]"
                                                    >
                                                        {WEBSITE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                    
                                                    {/* Type Selector */}
                                                    <select 
                                                        value={websiteType}
                                                        onChange={(e) => setWebsiteType(e.target.value)}
                                                        className="bg-black/30 border border-white/10 text-xs text-white rounded-lg px-3 py-2 outline-none focus:border-primary max-w-[150px]"
                                                    >
                                                        {WEBSITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>

                                                    <button onClick={handleInternalBuild} disabled={loading} className="px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-slate-900 text-xs font-bold uppercase rounded-lg transition-colors border border-primary/20">
                                                        {loading && !generatedCode ? 'Building...' : (generatedCode ? 'Regenerate Code' : 'Generate Code')}
                                                    </button>
                                                </div>
                                            </div>
                                            {generatedCode && (
                                                <div className="space-y-4 animate-fade-in">
                                                    <div className="w-full h-96 bg-white rounded-xl overflow-hidden border border-white/10 relative group">
                                                         <iframe srcDoc={generatedCode} className="w-full h-full" title="Preview" />
                                                         <div className="absolute inset-0 pointer-events-none border-[6px] border-slate-900 rounded-xl"></div>
                                                    </div>
                                                    <div className="flex flex-col gap-4">
                                                        <div className="flex gap-2">
                                                            <button onClick={handleOpenPreview} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-white/5 flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg> Open Permanent Link</button>
                                                            <button onClick={handleCopyCode} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-white/5 flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy Code</button>
                                                        </div>
                                                        <div className="flex gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
                                                            <input type="text" value={codeFeedback} onChange={(e) => setCodeFeedback(e.target.value)} className="flex-1 bg-transparent text-xs text-white outline-none px-2 w-full min-w-0" placeholder="E.g. Change the header background to navy blue..." />
                                                            <button onClick={handleRefineCode} disabled={loading} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-xs text-white rounded whitespace-nowrap">Edit with AI</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                     </div>
                                </div>
                                {!generatedCode && (
                                    <>
                                        <div className="col-span-1 space-y-4">
                                            <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/10 h-full">
                                                <h3 className="text-sm font-bold text-white mb-2">Manual Link</h3>
                                                <p className="text-xs text-slate-400 mb-4">Paste URL from external builder (Wix, Framer, etc.)</p>
                                                <input type="text" placeholder="https://..." className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-primary outline-none" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
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
                            <div className="flex justify-end pt-4 gap-4 items-center flex-col md:flex-row">
                                {generatedCode && websiteUrl && (
                                    <div className="flex items-center gap-2 md:mr-4 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                                         <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                         <span className="text-xs font-bold text-green-400 uppercase tracking-wide">Live at: {websiteUrl}</span>
                                    </div>
                                )}
                                {!generatedCode && (
                                    <button onClick={handleSimulateDraft} disabled={loading} className="text-xs text-slate-500 hover:text-white underline underline-offset-4">
                                        Simulate Draft (Testing)
                                    </button>
                                )}
                                <button onClick={handleReview} disabled={(!websiteUrl && !generatedCode) || (!screenshot && !generatedCode) || loading} className="w-full md:w-auto px-8 py-3 bg-secondary text-slate-900 font-bold rounded-full hover:bg-secondary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
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
                                                        <li key={i} className={`text-xs text-slate-300 flex gap-2 cursor-pointer transition-colors p-1 rounded ${activeCritiqueIndex === i ? 'bg-red-500/10 text-white' : 'hover:bg-white/5'}`} onMouseEnter={() => setActiveCritiqueIndex(i)} onMouseLeave={() => setActiveCritiqueIndex(null)}>
                                                            <span className="text-red-500 mt-0.5">•</span> <span>{c.point}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="p-4 bg-green-500/5 border border-green-500/10 rounded-2xl relative">
                                                <h3 className="text-xs font-bold text-green-400 uppercase mb-3">Recommended Fixes</h3>
                                                <ul className="space-y-2 mb-4">
                                                    {review.improvements.map((c, i) => (
                                                        <li key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-500">✓</span>{c}</li>
                                                    ))}
                                                </ul>
                                                {generatedCode && (
                                                    <button onClick={handleApplyFixes} disabled={loading} className="w-full py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all">
                                                        {loading ? 'Applying Fixes...' : 'Auto-Apply All Fixes'}
                                                        {loading ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5 self-end">
                                            <button onClick={() => setReviewViewMode('VISUAL')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${reviewViewMode === 'VISUAL' ? 'bg-primary text-slate-900' : 'text-slate-400 hover:text-white'}`}>Visual Preview</button>
                                            <button onClick={() => setReviewViewMode('CODE')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${reviewViewMode === 'CODE' ? 'bg-primary text-slate-900' : 'text-slate-400 hover:text-white'}`}>Code Inspector</button>
                                        </div>
                                        <div className="relative rounded-2xl overflow-hidden border border-white/10 group bg-white/5 h-[600px] flex flex-col">
                                            {generatedCode ? (
                                                reviewViewMode === 'VISUAL' ? (
                                                    <div className="relative w-full h-full">
                                                        <iframe srcDoc={generatedCode} className="w-full h-full" title="Preview" />
                                                        <div className="absolute inset-0 pointer-events-none border-[6px] border-slate-900 rounded-xl"></div>
                                                        <div className="absolute top-2 right-2 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-white pointer-events-none z-10">AI Visual Simulation</div>
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full bg-slate-950 overflow-auto p-4 custom-scrollbar">
                                                        <pre ref={codeViewRef} className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-all">{renderHighlightedCode()}</pre>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="relative w-full h-full">
                                                    <img src={screenshot || ''} alt="Analyzed" className="w-full h-full object-cover" />
                                                    {review.critique.map((c, i) => {
                                                        if (!c.box_2d || (c.box_2d[0] === 0 && c.box_2d[2] === 0)) return null;
                                                        const [ymin, xmin, ymax, xmax] = c.box_2d;
                                                        return (
                                                            <div key={i} className={`absolute border-2 ${activeCritiqueIndex === i ? 'border-red-400 bg-red-500/30' : 'border-red-500/50 bg-red-500/10'} hover:bg-red-500/30 transition-colors cursor-help group-hover:opacity-100 opacity-60`} style={{top: `${ymin}%`, left: `${xmin}%`, height: `${ymax - ymin}%`, width: `${xmax - xmin}%`}} title={c.point} onMouseEnter={() => setActiveCritiqueIndex(i)} onMouseLeave={() => setActiveCritiqueIndex(null)}>
                                                                {activeCritiqueIndex === i && <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">{c.point.slice(0, 30)}...</div>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
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
                    
                    {/* STAGE 4: OUTREACH [REDACTED FOR BREVITY - ALREADY IN FILE] */}
                    {stage === 'OUTREACH' && (/* ... OUTREACH UI ... */ 
                        // Note: Outreach UI implementation remains the same as previously defined, just ensuring context here
                        <div className="animate-fade-in space-y-8">
                            <h2 className="text-xl font-display text-white">Outreach Deployment Package</h2>
                            
                            {outreach ? (
                                <div className="space-y-6">
                                    {/* Tabs */}
                                    <div className="flex border-b border-white/10 mb-6">
                                        <button onClick={() => setOutreachTab('INITIAL')} className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${outreachTab === 'INITIAL' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-white'}`}>
                                            Initial Contact
                                        </button>
                                        <button onClick={() => setOutreachTab('FOLLOWUP')} className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${outreachTab === 'FOLLOWUP' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-white'}`}>
                                            Follow-Up Sequence
                                        </button>
                                        <button onClick={() => setOutreachTab('OBJECTIONS')} className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${outreachTab === 'OBJECTIONS' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-white'}`}>
                                            Objection Handling
                                        </button>
                                    </div>

                                    {/* INITIAL CONTACT TAB */}
                                    {outreachTab === 'INITIAL' && (
                                        <>
                                            <div className="space-y-2 group relative">
                                                <div className="flex justify-between items-end">
                                                     <h3 className="text-sm font-bold text-slate-400 uppercase">Cold Email</h3>
                                                     <div className="flex gap-2">
                                                         <label className="flex items-center gap-2 cursor-pointer mr-4">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={includeCalendar} 
                                                                onChange={(e) => setIncludeCalendar(e.target.checked)}
                                                                className="w-3 h-3 accent-primary rounded bg-slate-800 border-slate-600"
                                                            />
                                                            <span className="text-[10px] text-slate-400 uppercase font-bold">Include Calendar Link</span>
                                                         </label>
                                                         <button onClick={() => handleCaptureSelection('COLD_EMAIL')} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                            Refine Selection
                                                         </button>
                                                         <button onClick={handleSendEmail} className="px-3 py-1 bg-white/10 hover:bg-primary text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1">
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

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2 group relative">
                                                    <div className="flex justify-between items-end">
                                                        <h3 className="text-sm font-bold text-slate-400 uppercase">WhatsApp Pitch</h3>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleCaptureSelection('WHATSAPP')} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                Refine Selection
                                                            </button>
                                                            <button onClick={handleSendWhatsApp} className="px-3 py-1 bg-[#25D366]/20 hover:bg-[#25D366] text-[#25D366] hover:text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1">
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
                                                            <button onClick={() => handleCaptureSelection('CALL_SCRIPT')} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                Refine Selection
                                                            </button>
                                                            <button onClick={handleCall} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] rounded uppercase font-bold transition-colors flex items-center gap-1">
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
                                        </>
                                    )}

                                    {/* FOLLOW-UP TAB */}
                                    {outreachTab === 'FOLLOWUP' && (
                                        <div className="space-y-6">
                                            {outreach.follow_ups && outreach.follow_ups.map((followup, idx) => (
                                                <div key={idx} className="space-y-2 group relative animate-fade-in" style={{ animationDelay: `${idx * 150}ms` }}>
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-slate-800 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border border-white/10">
                                                                {idx + 1}
                                                            </div>
                                                            <h3 className="text-sm font-bold text-slate-400 uppercase">Follow-Up Email</h3>
                                                            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-primary">{followup.delay}</span>
                                                        </div>
                                                        <button onClick={() => handleCaptureSelection(`FOLLOWUP_${idx}`)} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                            Refine Selection
                                                        </button>
                                                    </div>
                                                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
                                                        <div className="mb-4 pb-4 border-b border-white/5">
                                                            <span className="text-slate-500 text-xs mr-2 font-bold tracking-wider">SUBJECT:</span>
                                                            <span className="text-white text-sm font-medium">{followup.subject}</span>
                                                        </div>
                                                        <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed font-light">{followup.body}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!outreach.follow_ups || outreach.follow_ups.length === 0) && (
                                                <div className="text-center text-slate-500 p-10">No follow-up sequence generated.</div>
                                            )}
                                        </div>
                                    )}

                                    {/* OBJECTIONS TAB */}
                                    {outreachTab === 'OBJECTIONS' && (
                                        <div className="grid grid-cols-1 gap-4">
                                            {outreach.objections && outreach.objections.map((obj, idx) => (
                                                <div key={idx} className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 hover:border-primary/30 transition-all animate-fade-in group relative" style={{ animationDelay: `${idx * 150}ms` }}>
                                                    <div className="absolute top-4 right-4">
                                                        <button onClick={() => handleCaptureSelection(`OBJECTION_${idx}`)} className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">Refine</button>
                                                    </div>
                                                    <div className="flex items-start gap-3 mb-3">
                                                        <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                        <div>
                                                            <h4 className="text-white font-bold text-sm">"{obj.objection}"</h4>
                                                        </div>
                                                    </div>
                                                    <div className="pl-8 border-l-2 border-primary/20">
                                                        <p className="text-slate-300 text-sm italic">"{obj.response}"</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!outreach.objections || outreach.objections.length === 0) && (
                                                <div className="text-center text-slate-500 p-10">No objections generated.</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Refinement Modal / Area */}
                                    {refinementTarget && (
                                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                                            <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-lg w-full">
                                                <h3 className="text-lg font-display text-white mb-4">Refine Content</h3>
                                                
                                                {/* Selection-based refinement UI */}
                                                {refinementSnippet && (
                                                    <div className="bg-white/5 p-3 rounded-xl mb-4 border-l-2 border-primary">
                                                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Targeting Selection:</div>
                                                        <div className="text-xs text-white italic line-clamp-3">"...{refinementSnippet}..."</div>
                                                    </div>
                                                )}

                                                <textarea 
                                                    className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-primary outline-none mb-4"
                                                    placeholder={refinementSnippet ? "How should this specific text be changed?" : "Enter instructions to rewrite this section..."}
                                                    value={refinementText}
                                                    onChange={(e) => setRefinementText(e.target.value)}
                                                />
                                                <div className="flex justify-end gap-3">
                                                    <button onClick={() => { setRefinementTarget(null); setRefinementSnippet(''); }} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                                                    <button onClick={handleRefineOutreach} disabled={loading} className="px-6 py-2 bg-primary text-slate-900 rounded-full font-bold text-sm">
                                                        {loading ? 'Refining...' : 'Apply Changes'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col items-center gap-6 pt-12 border-t border-white/5">
                                        <div className="text-center space-y-2">
                                            <h3 className="text-2xl font-display font-bold text-white">Project Complete</h3>
                                            <p className="text-slate-400 text-sm max-w-md">All assets have been generated and optimized. Proceed to the final summary to review the complete intelligence package.</p>
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <button onClick={() => handleManualSave(false)} className="px-8 py-4 bg-slate-800 text-slate-300 hover:text-white border border-white/10 rounded-full font-bold hover:bg-slate-700 transition-all flex items-center gap-2">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                                Save Draft
                                            </button>
                                            
                                            <button 
                                                onClick={() => setShowFinalizeConfirm(true)} 
                                                className="group relative px-10 py-4 bg-gradient-to-r from-primary to-secondary text-slate-900 font-bold rounded-full overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:shadow-[0_0_50px_rgba(6,182,212,0.5)] transition-all"
                                            >
                                                <div className="absolute inset-0 w-0 bg-white/20 transition-all duration-[250ms] ease-out group-hover:w-full"></div>
                                                <span className="relative flex items-center gap-3 font-display tracking-widest text-sm uppercase">
                                                    Generate Final Summary
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-slate-500">Synthesizing persuasive assets...</div>
                            )}
                        </div>
                    )}
                    
                    {/* STAGE 5: SUMMARY (Same as before) */}
                    {stage === 'SUMMARY' && (/* ... SUMMARY UI ... */ 
                        <div className="animate-fade-in space-y-8 pb-10">
                             {/* ... Header ... */}
                             <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-8 gap-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h1 className="text-4xl font-display font-bold text-white">Mission Report</h1>
                                        <span className="bg-primary/20 text-primary border border-primary/30 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Completed</span>
                                    </div>
                                    <p className="text-slate-400 text-sm">Full intelligence profile for <span className="text-white font-bold">{business.name}</span></p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                     <div className="text-right">
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Project Readiness</div>
                                        <div className="text-3xl font-display font-bold text-white flex items-center justify-end gap-2">
                                            {projectScore}% 
                                            <div className={`w-3 h-3 rounded-full ${projectScore === 100 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                                        </div>
                                     </div>
                                </div>
                            </div>
                            {/* ... Dashboard Grid ... */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* ... Asset Inventory ... */}
                                <div className="lg:col-span-3 bg-slate-900/50 p-6 rounded-3xl border border-white/10 flex flex-col md:flex-row gap-6 justify-between items-center">
                                    <div className="flex gap-8 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${business.enriched_data ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold">Research</div>
                                                <div className={`text-xs font-bold ${business.enriched_data ? 'text-white' : 'text-slate-600'}`}>{business.enriched_data ? 'Deep' : 'Basic'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${prompt ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold">Blueprint</div>
                                                <div className={`text-xs font-bold ${prompt ? 'text-white' : 'text-slate-600'}`}>{prompt ? 'Generated' : 'Pending'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${generatedCode ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold">Codebase</div>
                                                <div className={`text-xs font-bold ${generatedCode ? 'text-white' : 'text-slate-600'}`}>{generatedCode ? 'Compiled' : 'Pending'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${outreach ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-slate-500 font-bold">Outreach</div>
                                                <div className={`text-xs font-bold ${outreach ? 'text-white' : 'text-slate-600'}`}>{outreach ? 'Ready' : 'Pending'}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <button onClick={handleDownloadReport} className="flex-1 md:flex-none px-6 py-3 bg-white text-slate-900 rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-slate-200 transition-all shadow-lg flex items-center justify-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" /></svg>
                                            Export PDF
                                        </button>
                                        <button onClick={() => navigate('/dashboard')} className="flex-1 md:flex-none px-6 py-3 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs uppercase tracking-widest font-bold border border-white/5 hover:bg-slate-700 transition-all">
                                            Dashboard
                                        </button>
                                    </div>
                                </div>
                                {/* ... Tech Assets Column ... */}
                                <div className="space-y-6">
                                    <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/10 h-full">
                                        <h3 className="text-xs font-bold text-primary uppercase mb-4 tracking-widest border-b border-white/5 pb-2">Website Strategy</h3>
                                        <div className="aspect-video bg-black/40 rounded-xl overflow-hidden border border-white/5 relative group mb-4">
                                            {generatedCode ? (
                                                 <iframe 
                                                    srcDoc={generatedCode}
                                                    className="w-full h-full pointer-events-none opacity-80"
                                                    title="Final Preview"
                                                 />
                                            ) : (
                                                <img src={screenshot || ''} alt="Site" className="w-full h-full object-cover opacity-60" />
                                            )}
                                        </div>
                                        <div className="flex gap-2 mb-6">
                                            <a href={websiteUrl} target="_blank" rel="noreferrer" className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-center rounded-xl text-xs font-bold transition-all border border-white/5">Open Live Link</a>
                                            <button onClick={handleCopyCode} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-center rounded-xl text-xs font-bold transition-all border border-white/5">Copy Code</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                             <div className="p-4 bg-black/20 rounded-xl border border-white/5 text-center">
                                                 <div className="text-2xl font-display font-bold text-white">{review?.design_score || 'N/A'}</div>
                                                 <div className="text-[10px] text-slate-500 uppercase tracking-widest">Design</div>
                                             </div>
                                             <div className="p-4 bg-black/20 rounded-xl border border-white/5 text-center">
                                                 <div className="text-2xl font-display font-bold text-primary">{review?.conversion_score || 'N/A'}</div>
                                                 <div className="text-[10px] text-slate-500 uppercase tracking-widest">UX Score</div>
                                             </div>
                                        </div>
                                    </div>
                                </div>
                                {/* ... Intelligence Column ... */}
                                <div className="space-y-6">
                                     <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/10 h-full">
                                         <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-widest border-b border-white/5 pb-2">Business Profile</h3>
                                         <div className="space-y-4 text-sm">
                                             <div>
                                                 <div className="text-slate-400 text-xs mb-1">Business Name</div>
                                                 <div className="text-white font-medium text-lg">{business.name}</div>
                                             </div>
                                             <div>
                                                 <div className="text-slate-400 text-xs mb-1">Address</div>
                                                 <div className="text-white font-medium">{business.address}</div>
                                             </div>
                                             <div className="grid grid-cols-2 gap-4">
                                                 <div>
                                                     <div className="text-slate-400 text-xs mb-1">Contact</div>
                                                     <div className="text-white font-medium truncate">{getContactPhone() || 'N/A'}</div>
                                                 </div>
                                                 <div>
                                                     <div className="text-slate-400 text-xs mb-1">Initial Rating</div>
                                                     <div className="text-yellow-400 font-bold">{business.rating} ★</div>
                                                 </div>
                                             </div>
                                             <div className="pt-4 mt-2 border-t border-white/5">
                                                 <div className="text-slate-400 text-xs mb-2">Core Services</div>
                                                 <div className="flex flex-wrap gap-2">
                                                     {business.enriched_data?.services?.slice(0, 4).map((s,i) => (
                                                         <span key={i} className="text-[10px] px-2 py-1 bg-white/5 rounded text-slate-300">{s}</span>
                                                     )) || <span className="text-slate-600 text-xs">No specific services found.</span>}
                                                 </div>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                                {/* ... Outreach Column ... */}
                                <div className="space-y-6">
                                     <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/10 h-full">
                                        <h3 className="text-xs font-bold text-secondary uppercase mb-4 tracking-widest border-b border-white/5 pb-2">Outreach Strategy</h3>
                                        {outreach ? (
                                            <div className="space-y-4">
                                                <div className="p-4 bg-black/20 rounded-xl border border-white/5 hover:border-primary/30 transition-colors group cursor-pointer">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="text-[10px] text-slate-500 uppercase">Cold Email</div>
                                                        <svg className="w-3 h-3 text-slate-600 group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                    </div>
                                                    <div className="text-white text-xs font-medium truncate">{outreach.cold_email.subject}</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/20 rounded-xl border border-white/5 hover:border-[#25D366]/30 transition-colors group">
                                                        <div className="text-[10px] text-slate-500 uppercase mb-1 group-hover:text-[#25D366]">WhatsApp</div>
                                                        <div className="text-slate-300 text-xs italic">Script Ready</div>
                                                    </div>
                                                    <div className="p-4 bg-black/20 rounded-xl border border-white/5 hover:border-white/30 transition-colors group">
                                                        <div className="text-[10px] text-slate-500 uppercase mb-1 group-hover:text-white">Call Script</div>
                                                        <div className="text-slate-300 text-xs italic">Prepared</div>
                                                    </div>
                                                </div>
                                                {outreach.follow_ups && outreach.follow_ups.length > 0 && (
                                                     <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                                        <div className="text-[10px] text-slate-500 uppercase mb-1">Follow-Ups</div>
                                                        <div className="text-slate-300 text-xs">{outreach.follow_ups.length} Emails Scheduled</div>
                                                    </div>
                                                )}
                                                <div className="pt-4 mt-2">
                                                    <button onClick={handleSendEmail} className="w-full py-3 bg-secondary/10 hover:bg-secondary text-secondary hover:text-slate-900 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                        Launch Campaign
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-500 text-sm py-8">No outreach materials generated.</div>
                                        )}
                                     </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
       </div>
    </div>
  );
};

export default BusinessProcessor;
