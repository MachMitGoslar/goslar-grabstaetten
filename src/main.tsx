import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { GeoTourPage } from './pages/GeoTour.tsx'
import {HomePage} from "./pages/Home.tsx";
import { GraveSearchPage } from './pages/GraveSearch.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/grabstellensuche" element={<GraveSearchPage />} />
          <Route path="/geotour" element={<GeoTourPage />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
