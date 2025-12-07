
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import BusinessProcessor from './components/BusinessProcessor';
import WebsiteViewer from './components/WebsiteViewer';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/process" element={<BusinessProcessor />} />
        <Route path="/view/:businessId" element={<WebsiteViewer />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
