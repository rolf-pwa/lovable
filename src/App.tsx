import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthCallback from "./pages/AuthCallback";
import Login from "./pages/Login";
import AccessDenied from "./pages/AccessDenied";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import ContactForm from "./pages/ContactForm";
import NotFound from "./pages/NotFound";
import GoogleCallback from "./pages/GoogleCallback";
import Portal from "./pages/Portal";
import Families from "./pages/Families";
import FamilyDetail from "./pages/FamilyDetail";
import Discovery from "./pages/Discovery";
import DiscoveryEmbed from "./pages/DiscoveryEmbed";
import VfoOnboardingEmbed from "./pages/VfoOnboardingEmbed";
import Leads from "./pages/Leads";
import ReviewQueue from "./pages/ReviewQueue";
import Requests from "./pages/Requests";
import Households from "./pages/Households";
import HouseholdDetail from "./pages/HouseholdDetail";
import Corporations from "./pages/Corporations";
import CorporationDetail from "./pages/CorporationDetail";
import MarketingUpdates from "./pages/MarketingUpdates";
import Workbench from "./pages/Workbench";
import Pipeline from "./pages/Pipeline";

import Vault from "./pages/Vault";
import VaultGuest from "./pages/VaultGuest";
import KnowledgeBase from "./pages/KnowledgeBase";
import HoldingTankPage from "./pages/HoldingTankPage";
import Onboarding from "./pages/Onboarding";
import BulkOnboarding from "./pages/BulkOnboarding";
import Analytics from "./pages/Analytics";
import StabilizationMap from "./pages/StabilizationMap";
import StabilizationMapResolver from "./pages/StabilizationMapResolver";
import QuarterlySystemReview from "./pages/QuarterlySystemReview";
import QuarterlySystemReviewResolver from "./pages/QuarterlySystemReviewResolver";
import QuarterlyReview from "./pages/QuarterlyReview";
import GovernanceReview from "./pages/GovernanceReview";
import SovereigntyCharter from "./pages/SovereigntyCharter";
import Inbox from "./pages/Inbox";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthCallback />} />
            <Route path="/login" element={<Login />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/discovery/embed" element={<DiscoveryEmbed />} />
            <Route path="/discovery-embed" element={<DiscoveryEmbed />} />
            <Route path="/vfo-onboarding" element={<VfoOnboardingEmbed />} />
            <Route path="/vfo-onboarding/embed" element={<VfoOnboardingEmbed />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/portal/:token" element={<Portal />} />
            <Route path="/google-callback" element={<ProtectedRoute><GoogleCallback /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
            <Route path="/holding-tank" element={<ProtectedRoute><HoldingTankPage /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/onboarding/bulk" element={<ProtectedRoute><BulkOnboarding /></ProtectedRoute>} />
            
            <Route path="/families" element={<ProtectedRoute><Families /></ProtectedRoute>} />
            <Route path="/families/:id" element={<ProtectedRoute><FamilyDetail /></ProtectedRoute>} />
            <Route path="/households" element={<ProtectedRoute><Households /></ProtectedRoute>} />
            <Route path="/households/:id" element={<ProtectedRoute><HouseholdDetail /></ProtectedRoute>} />
            <Route path="/corporations" element={<ProtectedRoute><Corporations /></ProtectedRoute>} />
            <Route path="/corporations/:id" element={<ProtectedRoute><CorporationDetail /></ProtectedRoute>} />
            <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
            <Route path="/review-queue" element={<ProtectedRoute><ReviewQueue /></ProtectedRoute>} />
            <Route path="/marketing-updates" element={<ProtectedRoute><MarketingUpdates /></ProtectedRoute>} />
            <Route path="/workbench" element={<ProtectedRoute><Workbench /></ProtectedRoute>} />
            <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
            <Route path="/contacts/new" element={<ProtectedRoute><ContactForm /></ProtectedRoute>} />
            <Route path="/contacts/:id" element={<ProtectedRoute><ContactDetail /></ProtectedRoute>} />
            <Route path="/contacts/:id/edit" element={<ProtectedRoute><ContactForm /></ProtectedRoute>} />
            
            <Route path="/vault" element={<ProtectedRoute><Vault /></ProtectedRoute>} />
            <Route path="/vault/household/:householdId" element={<ProtectedRoute><Vault /></ProtectedRoute>} />
            <Route path="/vault/:contactId" element={<ProtectedRoute><Vault /></ProtectedRoute>} />
            <Route path="/vault/guest/:token" element={<VaultGuest />} />
            <Route path="/vault/share/:token" element={<VaultGuest />} />
            <Route path="/knowledge-base" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/stabilization-map/lead/:leadId" element={<ProtectedRoute><StabilizationMapResolver /></ProtectedRoute>} />
            <Route path="/stabilization-map/contact/:contactId" element={<ProtectedRoute><StabilizationMapResolver /></ProtectedRoute>} />
            <Route path="/stabilization-map/:id" element={<ProtectedRoute><StabilizationMap /></ProtectedRoute>} />
            <Route path="/quarterly-system-review/contact/:contactId" element={<ProtectedRoute><QuarterlySystemReviewResolver /></ProtectedRoute>} />
            <Route path="/quarterly-system-review/:id" element={<ProtectedRoute><QuarterlySystemReview /></ProtectedRoute>} />
            <Route path="/workbench/quarterly-review" element={<ProtectedRoute><QuarterlyReview /></ProtectedRoute>} />
            <Route path="/quarterly-account-sync" element={<ProtectedRoute><QuarterlyReview /></ProtectedRoute>} />
            <Route path="/sovereignty-charter/contact/:contactId" element={<ProtectedRoute><SovereigntyCharter /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
