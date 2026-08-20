import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PauseProvider } from "@/stores/pauseStore";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import TrainerPublicProfile from "./pages/TrainerPublicProfile";
import TrainerListing from "./pages/TrainerListing";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Pause from "./pages/Pause";
import Plan from "./pages/Plan";
import Health from "./pages/Health";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/admin/Dashboard";
import Customers from "./pages/admin/Customers";
import CustomerDetail from "./pages/admin/CustomerDetail";
import AdminPlans from "./pages/admin/Plans";
import Trainers from "./pages/admin/Trainers";
import Societies from "./pages/admin/Societies";
import Marketing from "./pages/admin/Marketing";
import AdminReferrals from "./pages/admin/Referrals";
import SuperAdmin from "./pages/admin/SuperAdmin";
import AdminProfile from "./pages/admin/AdminProfile";
import SuperAdminRequests from "./pages/admin/SuperAdminRequests";
import ModeRequests from "./pages/admin/ModeRequests";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import Corporate from "./pages/Corporate";
import FaqsPage from "./pages/FaqsPage";
import TrainerDashboard from "./pages/TrainerDashboard";
import TrainerReferrals from "./pages/TrainerReferrals";
import NotFound from "./pages/NotFound";
import GeoLandingPage from "./pages/GeoLandingPage";
import BlogLanding from "./pages/blog/BlogLanding";
import ArticleDetailPage from "./pages/blog/ArticleDetailPage";
import RecipeDetailPage from "./pages/blog/RecipeDetailPage";
import ComparisonPage from "./pages/blog/ComparisonPage";
import LocationSEOPage from "./pages/blog/LocationSEOPage";
import TopicHubPage from "./pages/blog/TopicHubPage";
import CalculatorsPage from "./pages/blog/CalculatorsPage";
import StaticCategoryPage from "./pages/blog/StaticCategoryPage";

const StaticPageRedirect = ({ file }: { file: string }) => {
  useEffect(() => {
    window.location.replace(file);
  }, [file]);
  return null;
};

// Cached-first data: pages render instantly from the last fetch while a
// background refresh runs. Mutations still update immediately — every write
// in the app calls invalidateQueries, which bypasses staleTime.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // reuse results for 30s instead of refetching on every mount
      gcTime: 10 * 60_000, // keep unused page data cached for 10 min of navigation
      refetchOnWindowFocus: false, // don't hammer the DB on every tab switch
      retry: 1,
    },
  },
});

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <PauseProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Login />} />
              {/* Dedicated, shareable trainer auth URLs (open the Trainers tab). */}
              <Route path="/trainer/login" element={<Login />} />
              <Route path="/trainer/signin" element={<Login />} />
              <Route path="/trainer/signup" element={<Login />} />
              {/* Hidden Super Admin login — unlinked, direct URL only. */}
              <Route path="/super-admin/login" element={<SuperAdminLogin />} />
              {/* Firebase email-link lands on /__/auth/action — redirect to
                  /signup so the existing isSignInWithEmailLink handler picks it up.
                  Query params (apiKey, oobCode, mode, continueUrl) are preserved. */}
              <Route path="/__/auth/action" element={<Navigate to={`/signup${window.location.search}`} replace />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Clean Static Marketing Page Routes */}
              <Route path="/personal-training" element={<StaticPageRedirect file="/personal-training.html" />} />
              <Route path="/weight-loss-program-bangalore" element={<StaticPageRedirect file="/weight-loss-program-bangalore.html" />} />
              <Route path="/strength-training-bangalore" element={<StaticPageRedirect file="/strength-training-bangalore.html" />} />
              <Route path="/yoga-classes-bangalore" element={<StaticPageRedirect file="/yoga-classes-bangalore.html" />} />
              <Route path="/prenatal-postnatal-yoga" element={<StaticPageRedirect file="/prenatal-postnatal-yoga-bangalore.html" />} />
              <Route path="/womens-fitness-bangalore" element={<StaticPageRedirect file="/womens-fitness-bangalore.html" />} />
              <Route path="/senior-fitness-bangalore" element={<StaticPageRedirect file="/senior-fitness-bangalore.html" />} />
              <Route path="/clinical-fitness-bangalore" element={<StaticPageRedirect file="/clinical-fitness-bangalore.html" />} />
              <Route path="/diet-coaching-bangalore" element={<StaticPageRedirect file="/diet-coaching-bangalore.html" />} />
              <Route path="/online-training" element={<StaticPageRedirect file="/online-training.html" />} />
              <Route path="/service-areas" element={<StaticPageRedirect file="/service-areas.html" />} />

              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                {/* Client pages — trainers are redirected to /trainer */}
                <Route path="/dashboard" element={<ProtectedRoute allow={["client", "admin"]}><Dashboard /></ProtectedRoute>} />
                <Route path="/pause" element={<ProtectedRoute allow={["client", "admin"]}><Pause /></ProtectedRoute>} />
                <Route path="/plan" element={<ProtectedRoute allow={["client", "admin"]}><Plan /></ProtectedRoute>} />
                <Route path="/health" element={<ProtectedRoute allow={["client", "admin"]}><Health /></ProtectedRoute>} />

                {/* Shared */}
                <Route path="/profile" element={<Profile />} />

                {/* Trainer pages — clients are redirected to /dashboard */}
                <Route path="/trainer" element={<ProtectedRoute allow={["trainer", "admin"]}><TrainerDashboard /></ProtectedRoute>} />
                <Route path="/trainer/referrals" element={<ProtectedRoute allow={["trainer", "admin"]}><TrainerReferrals /></ProtectedRoute>} />

                {/* Admin pages */}
                <Route path="/admin" element={<ProtectedRoute allow={["admin"]}><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin/customers" element={<ProtectedRoute allow={["admin"]}><Customers /></ProtectedRoute>} />
                <Route path="/admin/customers/:id" element={<ProtectedRoute allow={["admin"]}><CustomerDetail /></ProtectedRoute>} />
                <Route path="/admin/plans" element={<ProtectedRoute allow={["admin"]}><AdminPlans /></ProtectedRoute>} />
                <Route path="/admin/trainers" element={<ProtectedRoute allow={["admin"]}><Trainers /></ProtectedRoute>} />
                <Route path="/admin/societies" element={<ProtectedRoute allow={["admin"]}><Societies /></ProtectedRoute>} />
                <Route path="/admin/marketing" element={<ProtectedRoute allow={["admin"]}><Marketing /></ProtectedRoute>} />
                <Route path="/admin/referrals" element={<ProtectedRoute allow={["admin"]}><AdminReferrals /></ProtectedRoute>} />
                <Route path="/admin/mode-requests" element={<ProtectedRoute allow={["admin"]}><ModeRequests /></ProtectedRoute>} />

                {/* Super Admin */}
                <Route path="/super-admin" element={<ProtectedRoute allow={["super_admin"]}><SuperAdmin /></ProtectedRoute>} />
                <Route path="/super-admin/requests" element={<ProtectedRoute allow={["super_admin"]}><SuperAdminRequests /></ProtectedRoute>} />
                <Route path="/super-admin/admins/:id" element={<ProtectedRoute allow={["super_admin"]}><AdminProfile /></ProtectedRoute>} />
              </Route>
              <Route path="/index" element={<Navigate to="/dashboard" replace />} />
              <Route path="/corporate" element={<Corporate />} />
              <Route path="/faqs" element={<FaqsPage />} />
              <Route path="/trainers" element={<TrainerListing />} />
              <Route path="/trainers/:slug" element={<TrainerPublicProfile />} />

              {/* Canonical Blog / Journal routes */}
              <Route path="/blog" element={<BlogLanding />} />
              <Route path="/journal" element={<Navigate to="/blog" replace />} />
              <Route path="/blog/article/:slug" element={<ArticleDetailPage />} />
              <Route path="/blog/recipe/:slug" element={<RecipeDetailPage />} />
              <Route path="/blog/compare/:slug" element={<ComparisonPage />} />
              <Route path="/blog/location/:city/:slug" element={<LocationSEOPage />} />
              <Route path="/blog/topic/:slug" element={<TopicHubPage />} />
              <Route path="/blog/category/:category" element={<StaticCategoryPage />} />
              <Route path="/blog/calculators" element={<CalculatorsPage />} />

              <Route path="/faqs.html" element={<FaqsPage />} />

              {/* Geo SEO landing pages — all handled by one data-driven component */}
              <Route path="/personal-trainer/*" element={<GeoLandingPage />} />
              <Route path="/online-personal-trainer/*" element={<GeoLandingPage />} />
              <Route path="/female-personal-trainer/*" element={<GeoLandingPage />} />
              <Route path="/strength-training/*" element={<GeoLandingPage />} />
              <Route path="/vegetarian-muscle-building/*" element={<GeoLandingPage />} />
              <Route path="/yoga/*" element={<GeoLandingPage />} />
              <Route path="/yoga-trainer/*" element={<GeoLandingPage />} />
              <Route path="/online-yoga/*" element={<GeoLandingPage />} />
              <Route path="/prenatal-yoga/*" element={<GeoLandingPage />} />
              <Route path="/pilates-trainer/*" element={<GeoLandingPage />} />
              <Route path="/weight-loss-coach/*" element={<GeoLandingPage />} />
              <Route path="/fat-loss-trainer/*" element={<GeoLandingPage />} />
              <Route path="/powerlifting-coach/*" element={<GeoLandingPage />} />
              <Route path="/pcos-fitness-coach/*" element={<GeoLandingPage />} />
              <Route path="/diabetes-fitness-coach/*" element={<GeoLandingPage />} />
              <Route path="/thyroid-fitness-coach/*" element={<GeoLandingPage />} />
              <Route path="/diabetes-reversal-coach/*" element={<GeoLandingPage />} />
              <Route path="/glp1-mounjaro-coach/*" element={<GeoLandingPage />} />
              <Route path="/postpartum-weight-loss/*" element={<GeoLandingPage />} />
              <Route path="/diastasis-recti-recovery/*" element={<GeoLandingPage />} />
              <Route path="/post-pregnancy-weight-loss-coach/*" element={<GeoLandingPage />} />
              <Route path="/lactation-safe-weight-loss/*" element={<GeoLandingPage />} />
              <Route path="/corporate-wellness/*" element={<GeoLandingPage />} />
              <Route path="/compare/*" element={<GeoLandingPage />} />
              <Route path="/bmi-calculator" element={<GeoLandingPage />} />
              <Route path="/calorie-calculator" element={<GeoLandingPage />} />
              <Route path="/macro-calculator" element={<GeoLandingPage />} />
              <Route path="/ideal-weight-calculator" element={<GeoLandingPage />} />
              <Route path="/tdee-calculator" element={<GeoLandingPage />} />
              <Route path="/daily-calorie-burn-calculator" element={<GeoLandingPage />} />
              <Route path="/indian-fat-loss-guide" element={<GeoLandingPage />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </PauseProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
