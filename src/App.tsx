import { lazy, Suspense } from "react";
import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/shared/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Eager: tiny entry/exit routes needed on first paint.
import AuthCallback from "@/pages/AuthCallback";
import Login from "@/pages/Login";
import AccessDenied from "@/pages/AccessDenied";
import NotFound from "@/pages/NotFound";

// Lazy: everything else is fetched on demand.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactDetail = lazy(() => import("@/pages/ContactDetail"));
const ContactForm = lazy(() => import("@/pages/ContactForm"));
const GoogleCallback = lazy(() => import("@/pages/GoogleCallback"));
const Portal = lazy(() => import("@/pages/Portal"));
const VfoPortal = lazy(() => import("@/pages/VfoPortal"));
const AdminVfo = lazy(() => import("@/pages/AdminVfo"));
const Families = lazy(() => import("@/pages/Families"));
const FamilyDetail = lazy(() => import("@/pages/FamilyDetail"));
const Discovery = lazy(() => import("@/modules/intake/pages/Discovery"));
const DiscoveryEmbed = lazy(() => import("@/modules/intake/pages/DiscoveryEmbed"));
const DiscoveryV2 = lazy(() => import("@/modules/intake/pages/DiscoveryV2"));
const DiscoveryV2Embed = lazy(() => import("@/modules/intake/pages/DiscoveryV2Embed"));
const VfoOnboardingEmbed = lazy(() => import("@/modules/intake/pages/VfoOnboardingEmbed"));
const ProPortalLogin = lazy(() => import("@/modules/pro/pages/ProPortalLogin"));
const ProPortal = lazy(() => import("@/modules/pro/pages/ProPortal"));
const ProPortalFamily = lazy(() => import("@/modules/pro/pages/ProPortalFamily"));
const ProPortalHousehold = lazy(() => import("@/modules/pro/pages/ProPortalHousehold"));
const ProPortalContact = lazy(() => import("@/modules/pro/pages/ProPortalContact"));
const Leads = lazy(() => import("@/pages/Leads"));
const ReviewQueue = lazy(() => import("@/modules/audit/pages/ReviewQueue"));
const Requests = lazy(() => import("@/pages/Requests"));
const Households = lazy(() => import("@/pages/Households"));
const HouseholdDetail = lazy(() => import("@/pages/HouseholdDetail"));
const Corporations = lazy(() => import("@/pages/Corporations"));
const CorporationDetail = lazy(() => import("@/pages/CorporationDetail"));
const MarketingUpdates = lazy(() => import("@/pages/MarketingUpdates"));
const Workbench = lazy(() => import("@/modules/audit/pages/Workbench"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Vault = lazy(() => import("@/pages/Vault"));
const VaultGuest = lazy(() => import("@/pages/VaultGuest"));
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
const HoldingTankPage = lazy(() => import("@/pages/HoldingTankPage"));
const Onboarding = lazy(() => import("@/modules/intake/pages/Onboarding"));
const BulkOnboarding = lazy(() => import("@/modules/intake/pages/BulkOnboarding"));
const BulkImporters = lazy(() => import("@/modules/intake/pages/BulkImporters"));
const IntakeTest = lazy(() => import("@/modules/intake/pages/IntakeTest"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const StabilizationMap = lazy(() => import("@/modules/audit/pages/StabilizationMap"));
const StabilizationMapResolver = lazy(() => import("@/modules/audit/pages/StabilizationMapResolver"));
const QuarterlySystemReview = lazy(() => import("@/modules/audit/pages/QuarterlySystemReview"));
const QuarterlySystemReviewResolver = lazy(() => import("@/modules/audit/pages/QuarterlySystemReviewResolver"));
const QuarterlyReview = lazy(() => import("@/modules/audit/pages/QuarterlyReview"));
const GovernanceReview = lazy(() => import("@/modules/audit/pages/GovernanceReview"));
const SovereigntyCharter = lazy(() => import("@/modules/audit/pages/SovereigntyCharter"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Mail = lazy(() => import("@/pages/Mail"));
const Professionals = lazy(() => import("@/pages/Professionals"));
const ProfessionalDetail = lazy(() => import("@/pages/ProfessionalDetail"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<AuthCallback />} />
              <Route path="/login" element={<Login />} />
              <Route path="/access-denied" element={<AccessDenied />} />
              <Route path="/discovery" element={<Discovery />} />
              <Route path="/discovery/embed" element={<DiscoveryEmbed />} />
              <Route path="/discovery-embed" element={<DiscoveryEmbed />} />
              <Route path="/discovery-v2" element={<DiscoveryV2 />} />
              <Route path="/discovery-v2/embed" element={<DiscoveryV2Embed />} />
              <Route path="/discovery-v2-embed" element={<DiscoveryV2Embed />} />
              <Route path="/vfo-onboarding" element={<VfoOnboardingEmbed />} />
              <Route path="/vfo-onboarding/embed" element={<VfoOnboardingEmbed />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/portal/intake" element={<Portal intakeRoute />} />
              <Route path="/portal/:token" element={<Portal />} />
              <Route path="/portal/:token/intake" element={<Portal intakeRoute />} />
              <Route path="/vfo/:token" element={<VfoPortal />} />
              <Route path="/pro-portal/login" element={<ProPortalLogin />} />
              <Route path="/pro-portal" element={<ProPortal />} />
              <Route path="/pro-portal/family/:id" element={<ProPortalFamily />} />
              <Route path="/pro-portal/household/:id" element={<ProPortalHousehold />} />
              <Route path="/pro-portal/contact/:id" element={<ProPortalContact />} />
              <Route path="/admin/vfo" element={<ProtectedRoute><AdminVfo /></ProtectedRoute>} />
              <Route path="/google-callback" element={<ProtectedRoute><GoogleCallback /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
              <Route path="/mail" element={<ProtectedRoute><Mail /></ProtectedRoute>} />
              <Route path="/holding-tank" element={<ProtectedRoute><HoldingTankPage /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/onboarding/bulk" element={<ProtectedRoute><BulkOnboarding /></ProtectedRoute>} />
              <Route path="/importers" element={<ProtectedRoute><BulkImporters /></ProtectedRoute>} />
              <Route path="/intake-test" element={<ProtectedRoute><IntakeTest /></ProtectedRoute>} />

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
              <Route path="/professionals" element={<ProtectedRoute><Professionals /></ProtectedRoute>} />
              <Route path="/professionals/:id" element={<ProtectedRoute><ProfessionalDetail /></ProtectedRoute>} />
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
              <Route path="/workbench/governance-review" element={<ProtectedRoute><GovernanceReview /></ProtectedRoute>} />
              <Route path="/quarterly-account-sync" element={<ProtectedRoute><QuarterlyReview /></ProtectedRoute>} />
              <Route path="/sovereignty-charter/contact/:contactId" element={<ProtectedRoute><SovereigntyCharter /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
