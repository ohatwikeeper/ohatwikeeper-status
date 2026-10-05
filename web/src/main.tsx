import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Shell } from './ui'
import Overview from './pages/Overview'
import ServicePage from './pages/ServicePage'
import DayPage from './pages/DayPage'
import { IncidentList, IncidentDetail } from './pages/Incidents'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/s/:id" element={<ServicePage />} />
          <Route path="/s/:id/d/:date" element={<DayPage />} />
          <Route path="/s/:id/:sub" element={<ServicePage />} />
          <Route path="/incidents" element={<IncidentList />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="*" element={<p className="py-24 text-center text-muted">ページが見つかりません</p>} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
)
