import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Moon,
  Sun,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePlatform';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={() => void install()}
        className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition font-medium whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Install TECHMAN COLLEGE LMS
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Close guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.<br />
                3. Launch TECHMAN COLLEGE LMS directly from your home screen with offline note access.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#0F172A] dark:bg-violet-600 py-2 text-sm font-medium text-white hover:opacity-90 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline Mode — Viewing cached materials. Progress queues automatically.</span>
    </div>
  );
};

export const ThemeToggleButton: React.FC<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}> = ({ theme, toggleTheme }) => (
  <button
    onClick={toggleTheme}
    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
  >
    {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
  </button>
);

export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  const isGood = ['verified', 'issued', 'reissued', 'enrolled', 'approved', 'published', 'active', 'present', 'completed', 'evaluated', 'accepted'].includes(normalized);
  const isBad = ['rejected', 'revoked', 'absent', 'suspended', 'hidden', 'refunded'].includes(normalized);

  if (isGood) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }
  if (isBad) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel = 'Confirm', destructive = false, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className={`w-5 h-5 mt-0.5 shrink-0 ${destructive ? 'text-red-600' : 'text-violet-600'}`} />
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition cursor-pointer ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-violet-700 hover:bg-violet-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
      {description}
    </p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium transition cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
