import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import './App.css'
import { GeoTourPage } from './pages/GeoTour.tsx'
import { GraveSearchPage } from './pages/GraveSearch.tsx'
import { HomePage } from './pages/Home.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'
import { PageViewTracker } from './analytics/PageViewTracker.tsx'

const GraveDetailPage = lazy(() =>
  import('./pages/GraveDetail.tsx').then((module) => ({ default: module.GraveDetailPage })),
)
const AnalyticsPage = lazy(() =>
  import('./pages/Analytics.tsx').then((module) => ({ default: module.AnalyticsPage })),
)

export const App = () => (
  <ThemeProvider>
    <PageViewTracker />
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/grabstellensuche" element={<GraveSearchPage />} />
        <Route path="/grabstellensuche/:graveId" element={<GraveDetailPage />} />
        <Route path="/geotour" element={<GeoTourPage />} />
        <Route path="/admin/statistik" element={<AnalyticsPage />} />
      </Routes>
    </Suspense>
  </ThemeProvider>
)

export default App
