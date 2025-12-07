
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchWebsiteCode } from '../services/supabase';

const WebsiteViewer: React.FC = () => {
  const { businessId } = useParams<{ businessId: string }>();
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadSite = async () => {
      if (!businessId) return;
      try {
        const code = await fetchWebsiteCode(businessId);
        if (code) {
          setHtml(code);
        } else {
          setError(true);
        }
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    loadSite();
  }, [businessId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
        <svg className="animate-spin h-10 w-10 text-cyan-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-sm font-mono tracking-widest">LOADING SITE ASSETS...</span>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-slate-400">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p>Website not found or access denied.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-white">
      <iframe 
        srcDoc={html}
        title="Website Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
};

export default WebsiteViewer;
