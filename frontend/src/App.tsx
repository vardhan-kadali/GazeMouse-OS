import React, { useState, useEffect } from 'react'
import type { PageId } from './types/navigation'
import { SettingsProvider } from './context/SettingsContext'
import { TrackingProvider } from './context/TrackingContext'
import { Sidebar } from './components/layout/Sidebar'
import { HeaderBar } from './components/layout/HeaderBar'
import { Footer } from './components/layout/Footer'

import { HomePage } from './pages/HomePage'
import { GamesPage } from './pages/GamesPage'
import { CameraSetupPage } from './pages/CameraSetupPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { SettingsPage } from './pages/SettingsPage'
import { AccessibilityPage } from './pages/AccessibilityPage'
import { HelpSupportPage } from './pages/HelpSupportPage'

import './App.css'

export const AppContent: React.FC = () => {
  // Navigation State with hash/path sync
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const hash = window.location.hash.replace('#', '')
    if (['home', 'games', 'setup', 'how-it-works', 'settings', 'accessibility', 'help'].includes(hash)) {
      return hash as PageId
    }
    return 'home'
  })

  // Responsive Sidebar States
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Sync hash on navigation
  const handleNavigate = (page: PageId) => {
    setCurrentPage(page)
    window.location.hash = page === 'home' ? '' : page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Listen for browser back/forward buttons
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (['home', 'games', 'setup', 'how-it-works', 'settings', 'accessibility', 'help'].includes(hash)) {
        setCurrentPage(hash as PageId)
      } else {
        setCurrentPage('home')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Render the appropriate page component
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />
      case 'games':
        return <GamesPage onNavigate={handleNavigate} />
      case 'setup':
        return <CameraSetupPage />
      case 'how-it-works':
        return <HowItWorksPage />
      case 'settings':
        return <SettingsPage />
      case 'accessibility':
        return <AccessibilityPage />
      case 'help':
        return <HelpSupportPage />
      default:
        return <HomePage onNavigate={handleNavigate} />
    }
  }

  return (
    <div className="app-root">
      {/* Accessible skip link for keyboard navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Persistent Left Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className={`content-wrapper ${isCollapsed ? 'collapsed' : ''}`}>
        <HeaderBar
          currentPage={currentPage}
          onToggleMobileMenu={() => setIsMobileOpen(true)}
        />

        <main id="main-content" className="page-container" tabIndex={-1}>
          {renderPage()}
        </main>

        <Footer onNavigate={handleNavigate} />
      </div>
    </div>
  )
}

export const App: React.FC = () => {
  return (
    <SettingsProvider>
      <TrackingProvider>
        <AppContent />
      </TrackingProvider>
    </SettingsProvider>
  )
}

export default App
