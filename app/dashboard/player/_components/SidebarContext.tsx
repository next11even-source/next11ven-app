'use client'

// Simple hook that fires a browser event to open/close the sidebar.
// PlayerShell listens for these events — no React context boundary issues.

export function useSidebar() {
  return {
    openSidebar: () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('player:sidebar:open'))
      }
    },
    closeSidebar: () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('player:sidebar:close'))
      }
    },
  }
}
