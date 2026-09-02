import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sunk">
      <div className="max-w-md w-full p-6 bg-surface rounded-xl shadow-sm border border-line">
        <h2 className="text-xl font-semibold text-ink mb-2">Something went wrong</h2>
        <p className="text-sm text-ink-3 mb-4">
          We're sorry, but an unexpected error occurred.
        </p>
        <div className="bg-sunk p-4 rounded-lg text-xs font-mono text-danger overflow-auto max-h-48 mb-4">
          {error.message}
        </div>
        <button
          onClick={resetErrorBoundary}
          className="w-full py-2 px-4 bg-ink text-white rounded-lg font-medium hover:bg-ink-2 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      {children}
    </ReactErrorBoundary>
  );
}
