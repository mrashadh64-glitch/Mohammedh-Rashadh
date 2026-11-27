/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/PlatformWidgets';
import { PublicPage, PublicWebsite } from './components/public/PublicWebsite';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './hooks/usePlatform';
import { testFirestoreConnection } from './lib/firebase';
import { parsePublicPathname } from './lib/publicRoutes';

// Lazy-load the authenticated LMS Portal so public visitors never download recharts, xlsx, or portal modules
const PortalShell = lazy(() =>
  import('./components/portal/PortalShell').then((m) => ({ default: m.PortalShell }))
);

const PortalLoadingSkeleton: React.FC = () => (
  <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#0A1324] flex flex-col">
    <div className="h-16 bg-white dark:bg-[#101D35] border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between">
      <div className="h-5 w-44 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="h-8 w-28 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
    </div>
    <div className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-8 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-5 animate-pulse"
          />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 animate-pulse" />
    </div>
  </div>
);

const TechmanAppContent: React.FC = () => {
  const { firebaseUser, studentSessionToken, profile, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const urlContext = useMemo(() => {
    const parsed = parsePublicPathname(window.location.pathname, window.location.search);
    const params = new URLSearchParams(window.location.search);
    const hasActivationToken = Boolean(params.get('activate'));
    return {
      initialPage: hasActivationToken ? ('student-login' as PublicPage) : parsed.page,
      initialParam: parsed.param || '',
      verify: parsed.page === 'verify' ? parsed.param || params.get('verify') || '' : '',
    };
  }, []);

  const [surface, setSurface] = useState<'public' | 'portal'>('public');
  const [requestedPublicPage, setRequestedPublicPage] = useState<PublicPage>(urlContext.initialPage);
  const [requestedParam, setRequestedParam] = useState<string>(urlContext.initialParam);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Listen for Google Maps Platform Demo Key quota/auth events at top level so banner persists across views
  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Run connectivity check lazily after initial paint (never blocking FCP/LCP)
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(() => void testFirestoreConnection(), { timeout: 2500 });
      return () => win.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => void testFirestoreConnection(), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  // Automatically return to Public Website if user signs out while inside portal
  const isAuthenticated = Boolean((firebaseUser || studentSessionToken) && profile);
  useEffect(() => {
    if (!loading && !isAuthenticated && surface === 'portal') {
      setSurface('public');
    }
  }, [loading, isAuthenticated, surface]);

  const showPortal = surface === 'portal' && isAuthenticated;

  return (
    <>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {showPortal ? (
        <Suspense fallback={<PortalLoadingSkeleton />}>
          <PortalShell
            theme={theme}
            toggleTheme={toggleTheme}
            onBackToPublic={(targetPage?: PublicPage) => {
              if (targetPage) {
                setRequestedPublicPage(targetPage);
                setRequestedParam('');
              }
              setSurface('public');
            }}
          />
        </Suspense>
      ) : (
        <PublicWebsite
          initialPage={requestedPublicPage}
          initialParam={requestedParam}
          initialVerifyCert={urlContext.verify}
          theme={theme}
          toggleTheme={toggleTheme}
          onEnterPortal={() => setSurface('portal')}
        />
      )}
      <OfflineIndicator />
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TechmanAppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
