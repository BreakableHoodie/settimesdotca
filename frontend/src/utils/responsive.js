/**
 * Responsive Design Utilities - Design System v1.0
 *
 * Breakpoint definitions and responsive utilities following mobile-first design.
 * All breakpoints use min-width for progressive enhancement.
 */

import { useState, useEffect } from 'react'

// Breakpoint definitions (matches Tailwind config)
export const breakpoints = {
  sm: 640, // Mobile landscape
  md: 768, // Tablet
  lg: 1024, // Desktop
  xl: 1280, // Large desktop
  '2xl': 1536, // Extra large desktop
}

// Media query hooks for JavaScript
export const useMediaQuery = query => {
  const isClient = typeof window !== 'undefined'
  const mediaQuery = isClient ? window.matchMedia(query) : null
  const [matches, setMatches] = useState(mediaQuery?.matches || false)

  useEffect(() => {
    if (!mediaQuery) return

    const handler = e => setMatches(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [mediaQuery])

  return matches
}

// Breakpoint hooks
export const useBreakpoint = () => {
  const isSm = useMediaQuery(`(min-width: ${breakpoints.sm}px)`)
  const isMd = useMediaQuery(`(min-width: ${breakpoints.md}px)`)
  const isLg = useMediaQuery(`(min-width: ${breakpoints.lg}px)`)
  const isXl = useMediaQuery(`(min-width: ${breakpoints.xl}px)`)
  const is2Xl = useMediaQuery(`(min-width: ${breakpoints['2xl']}px)`)

  return {
    isMobile: !isSm,
    isTablet: isSm && !isLg,
    isDesktop: isLg,
    breakpoints: { isSm, isMd, isLg, isXl, is2Xl },
  }
}

// Touch device detection
export const isTouchDevice = () => {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// Responsive container classes generator
export const getResponsiveContainer = (padding = true) => {
  const base = 'mx-auto w-full'
  const maxWidth = 'max-w-7xl'
  const paddingClasses = padding ? 'px-4 sm:px-6 lg:px-8' : ''

  return `${base} ${maxWidth} ${paddingClasses}`.trim()
}

// Responsive grid classes generator
export const getResponsiveGrid = (cols = { mobile: 1, tablet: 2, desktop: 3 }) => {
  const { mobile = 1, tablet = 2, desktop = 3, wide = desktop } = cols

  return `grid grid-cols-${mobile} md:grid-cols-${tablet} lg:grid-cols-${desktop} xl:grid-cols-${wide} gap-4 md:gap-6 lg:gap-8`
}

// Responsive spacing scale
export const spacing = {
  mobile: {
    xs: 'p-2',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  },
  desktop: {
    xs: 'sm:p-3',
    sm: 'sm:p-6',
    md: 'sm:p-8',
    lg: 'sm:p-12',
    xl: 'sm:p-16',
  },
}

// Responsive typography scale
export const typography = {
  mobile: {
    h1: 'text-3xl',
    h2: 'text-2xl',
    h3: 'text-xl',
    h4: 'text-lg',
    body: 'text-base',
    small: 'text-sm',
  },
  desktop: {
    h1: 'lg:text-5xl',
    h2: 'lg:text-4xl',
    h3: 'lg:text-3xl',
    h4: 'lg:text-2xl',
    body: 'lg:text-lg',
    small: 'lg:text-base',
  },
}
