import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../App'

describe('Navigation and Page Hierarchy', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
  })

  it('renders all 7 navigation items in the exact required order', () => {
    render(<App />)

    const expectedLabels = [
      'Home',
      'Games',
      'Camera Setup',
      'How It Works',
      'Settings',
      'Accessibility',
      'Help & Support',
    ]

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const navButtons = sidebar.querySelectorAll('.nav-item-btn')

    expect(navButtons.length).toBe(7)
    expectedLabels.forEach((label, index) => {
      expect(navButtons[index]).toHaveTextContent(label)
    })
  })

  it('ensures camera is disabled by default on startup', () => {
    render(<App />)

    // Check sidebar and header badge indicates camera is Off / Standby
    expect(screen.getByText(/Camera: Off/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Standby/i).length).toBeGreaterThanOrEqual(1)
  })

  it('includes an accessible skip link for keyboard users', () => {
    render(<App />)

    const skipLink = screen.getByRole('link', { name: /skip to main content/i })
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('navigates to Games page when clicking Games navigation item', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const gamesNavBtn = within(sidebar).getByRole('button', { name: /^games$/i })
    fireEvent.click(gamesNavBtn)

    expect(screen.getByRole('heading', { name: /accessible games catalog/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^gaze runner$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^gaze match$/i })).toBeInTheDocument()
  })

  it('navigates to Camera Setup and confirms webcam is disabled by default', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const setupNavBtn = within(sidebar).getByRole('button', { name: /^camera setup$/i })
    fireEvent.click(setupNavBtn)

    expect(screen.getByRole('heading', { name: /camera setup & neutral calibration/i })).toBeInTheDocument()
    expect(screen.getByText(/webcam is inactive/i)).toBeInTheDocument()
    const enableBtn = screen.getByRole('button', { name: /^enable camera$/i })
    expect(enableBtn).toBeInTheDocument()
  })

  it('navigates to How It Works and displays the 5-step pipeline', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const howNavBtn = within(sidebar).getByRole('button', { name: /^how it works$/i })
    fireEvent.click(howNavBtn)

    expect(screen.getByRole('heading', { name: /how gazemouse-os works/i })).toBeInTheDocument()
    expect(screen.getByText(/the 5-stage interaction pipeline/i)).toBeInTheDocument()
    expect(screen.getByText(/Local Video Capture \(WebRTC\)/i)).toBeInTheDocument()
    expect(screen.getByText(/MediaPipe Face Landmark Inference/i)).toBeInTheDocument()
  })

  it('navigates to Settings and displays working sliders', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const settingsNavBtn = within(sidebar).getByRole('button', { name: /^settings$/i })
    fireEvent.click(settingsNavBtn)

    expect(screen.getByRole('heading', { name: /preferences & controls/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/sensitivity multiplier/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/jitter smoothing/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/resting dead-zone radius/i)).toBeInTheDocument()
  })

  it('navigates to Accessibility page and displays keyboard mapping table', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const a11yNavBtn = within(sidebar).getByRole('button', { name: /^accessibility$/i })
    fireEvent.click(a11yNavBtn)

    expect(screen.getByRole('heading', { name: /accessibility statement & controls guide/i })).toBeInTheDocument()
    expect(screen.getByText(/Universal Keyboard Mapping Reference/i)).toBeInTheDocument()
    expect(screen.getByText(/What GazeMouse-OS Cannot Do/i)).toBeInTheDocument()
  })

  it('navigates to Help & Support page and displays troubleshooting FAQs', () => {
    render(<App />)

    const sidebar = screen.getByRole('navigation', { name: /main navigation/i })
    const helpNavBtn = within(sidebar).getByRole('button', { name: /^help & support$/i })
    fireEvent.click(helpNavBtn)

    expect(screen.getByRole('heading', { name: /help & troubleshooting/i })).toBeInTheDocument()
    expect(screen.getByText(/Quick Setup Checklist/i)).toBeInTheDocument()
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument()
  })
})
