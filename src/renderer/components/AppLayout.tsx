import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  /** Sidebar content (playlist selector, categories) */
  sidebar: ReactNode
  /** Second sidebar content (channel list) */
  secondSidebar?: ReactNode
  /** Main content area (player view, idle view, loading view, error view) */
  children: ReactNode
  /** Player control bar at the bottom */
  controlBar?: ReactNode
  /** Additional className for the root container */
  className?: string
}

/**
 * Top-level application layout.
 *
 * Structure:
 * ┌──────────┬─────────────────────────┐
 * │          │                          │
 * │ Sidebar  │      Main Content        │
 * │ (280px)  │      (flex-1)            │
 * │          │                          │
 * ├──────────┴─────────────────────────┤
 * │         Control Bar                 │
 * └─────────────────────────────────────┘
 */
export function AppLayout({ sidebar, secondSidebar, children, controlBar, className }: AppLayoutProps) {
  return (
    <div className={cn('flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-white', className)}>
      {/* Upper section: sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - fixed width */}
        <aside className="w-[240px] flex-shrink-0 flex flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900/50">
          {sidebar}
        </aside>

        {secondSidebar && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden border-r border-zinc-800 bg-zinc-950">
            {secondSidebar}
          </aside>
        )}

        {/* Main content - fills remaining space */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {/* Control bar - fixed at bottom, full width */}
      {controlBar && (
        <footer className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900">
          {controlBar}
        </footer>
      )}
    </div>
  )
}
