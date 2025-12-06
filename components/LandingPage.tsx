import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background text-white overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/10 blur-[120px] animate-pulse-slow delay-1000"></div>
        <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] rounded-full bg-accent/10 blur-[100px] animate-pulse-slow delay-2000"></div>
      </div>

      {/* Grid Overlay */}
      <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl px-6 animate-fade-in">
        <div className="mb-6 inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-secondary mr-2 animate-pulse"></span>
            <span className="text-xs tracking-widest uppercase text-slate-400 font-display">System Online</span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500">
          HUNT. BUILD.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">DOMINATE.</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 font-light leading-relaxed">
          The unseen opportunity. Identify high-value businesses with zero digital footprint. 
          Generate their future. Secure the deal.
        </p>

        <button
          onClick={() => navigate('/dashboard')}
          className="group relative px-8 py-4 bg-transparent overflow-hidden rounded-full border border-white/20 transition-all hover:border-primary/50"
        >
            <div className="absolute inset-0 w-0 bg-white/5 transition-all duration-[250ms] ease-out group-hover:w-full"></div>
            <span className="relative flex items-center justify-center gap-3 font-display tracking-widest text-sm uppercase">
                Initialize Session
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                </svg>
            </span>
        </button>
      </div>
      
      {/* Decorative Lines */}
      <div className="absolute bottom-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
    </div>
  );
};

export default LandingPage;