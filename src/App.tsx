/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Brands } from './pages/Brands';
import { BrandSetup } from './pages/BrandSetup';
import { Profile } from './pages/Profile';
import { ContentGenerator } from './pages/ContentGenerator';
import { Scheduler } from './pages/Scheduler';
import { Analytics } from './pages/Analytics';

import { Integrations } from './pages/Integrations';
import { AgentStudio } from './pages/AgentStudio';
import { BrandStrategy } from './pages/BrandStrategy';
import { TrendsVault } from './pages/TrendsVault';
import { VideoStudio } from './pages/VideoStudio';
import { MediaLibrary } from './pages/MediaLibrary';
import { MetaAdsStudio } from './pages/MetaAdsStudio';
import { PosterStudio } from './pages/PosterStudio';
import { InstagramStudio } from './pages/InstagramStudio';
import { WhatsAppStudio } from './pages/WhatsAppStudio';
import { MCPConnectorStudio } from './pages/MCPConnectorStudio';
import { LeadManagementStudio } from './pages/LeadManagementStudio';
import { Login } from './pages/Login';

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<AgentStudio />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/brand-strategy" element={<BrandStrategy />} />
            <Route path="/brand-strategy/:brandId" element={<BrandStrategy />} />
            <Route path="/trends-vault" element={<TrendsVault />} />
            <Route path="/video-studio" element={<VideoStudio />} />
            <Route path="/media-library" element={<MediaLibrary />} />
            <Route path="/poster-studio" element={<PosterStudio />} />
            <Route path="/meta-ads" element={<MetaAdsStudio />} />
            <Route path="/leads" element={<LeadManagementStudio />} />
            <Route path="/instagram-marketing" element={<InstagramStudio />} />
            <Route path="/whatsapp-marketing" element={<WhatsAppStudio />} />
            <Route path="/mcp-connector" element={<MCPConnectorStudio />} />
            <Route path="/brand-setup" element={<BrandSetup />} />
            <Route path="/brand-setup/:brandId" element={<BrandSetup />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/generate" element={<ContentGenerator />} />
            <Route path="/schedule" element={<Scheduler />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/integrations" element={<Integrations />} />
          </Route>
        </Routes>
      </Router>
      <VercelAnalytics />
    </ErrorBoundary>
  );
}
