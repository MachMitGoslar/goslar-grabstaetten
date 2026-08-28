import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { GeoTourPage } from './pages/GeoTour.tsx'
import { GraveSearchPage } from './pages/GraveSearch.tsx'
import { HomePage } from './pages/Home.tsx'
import { AdminPage } from './pages/Admin.tsx'
import { AdminPasswordPage } from './pages/AdminPassword.tsx'
import { AdminPasswordResetPage } from './pages/AdminPasswordReset.tsx'
import { AdminSetupPage } from './pages/AdminSetup.tsx'
import { AnalyticsPage } from './pages/Analytics.tsx'
import { AnalyticsProfilesPage } from './pages/AnalyticsProfiles.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'
import { PageViewTracker } from './analytics/PageViewTracker.tsx'

const GraveDetailPage = lazy(() =>
  import('./pages/GraveDetail.tsx').then((module) => ({ default: module.GraveDetailPage })),
)
const RouteFallback = () => {
  const { pathname } = useLocation()
  let decodedPathname

  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    decodedPathname = pathname
  }

  const isAdminPath = decodedPathname.startsWith('/admin')

  useEffect(() => {
    if (isAdminPath && pathname !== '/admin') {
      window.history.replaceState(null, '', '/admin')
    }
  }, [isAdminPath, pathname])

  if (isAdminPath) {
    return <AdminPage />
  }

  return <Navigate to="/" replace />
}

export const App = () => (
  <ThemeProvider>
    <PageViewTracker />
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/grabstellensuche" element={<GraveSearchPage />} />
        <Route path="/grabstellensuche/:graveId" element={<GraveDetailPage />} />
        <Route path="/geotour" element={<GeoTourPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/passwort" element={<AdminPasswordPage />} />
        <Route path="/admin/passwort-zuruecksetzen" element={<AdminPasswordResetPage />} />
        <Route path="/admin/setup" element={<AdminSetupPage />} />
        <Route path="/admin/statistik" element={<AnalyticsPage />} />
        <Route path="/admin/profile" element={<AnalyticsProfilesPage />} />
        <Route path="*" element={<RouteFallback />} />
      </Routes>
    </Suspense>
  </ThemeProvider>
)

export default App
