import React, { useState } from 'react';
import { CheckCircle, Loader2, Shield, ToggleLeft, ToggleRight, XCircle } from 'lucide-react';
import { sitePages, SitePageKey } from '../config/sitePages';
import { useAuth } from '../context/useAuth';
import { usePageVisibility } from '../context/usePageVisibility';

const AdminPage: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { error, isLoading, settingsByKey, setPageEnabled } = usePageVisibility();
  const [savingPageKey, setSavingPageKey] = useState<SitePageKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);

  const handleTogglePage = async (pageKey: SitePageKey) => {
    if (!user?.id || savingPageKey) return;

    const currentSetting = settingsByKey[pageKey];
    const nextEnabled = !(currentSetting?.isEnabled ?? true);
    setSavingPageKey(pageKey);
    setMessage(null);
    setSaveError(null);

    try {
      await setPageEnabled(pageKey, nextEnabled, user.id);
      setMessage(`${sitePages.find(page => page.key === pageKey)?.name || 'Page'} is now ${nextEnabled ? 'public' : 'hidden from public navigation'}.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update page visibility.');
    } finally {
      setSavingPageKey(null);
    }
  };

  if (isAuthLoading || isLoading) {
    return (
      <AdminShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
        </div>
      </AdminShell>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <AdminShell>
        <AccessPanel title="Admin access required" body="Please log in with an administrator account to manage page visibility." />
      </AdminShell>
    );
  }

  if (!isAdmin) {
    return (
      <AdminShell>
        <AccessPanel title="Admins only" body="Your account does not have permission to manage site pages." />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="mb-8 rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <Shield className="h-8 w-8 text-yellow-400" />
              <h1 className="font-fantasy text-4xl font-bold text-white">Admin</h1>
            </div>
            <p className="max-w-3xl text-gray-300">
              Choose which public pages appear in navigation and remain accessible to non-admin visitors.
            </p>
          </div>
        </div>
      </section>

      {(error || saveError || message) && (
        <div className={`mb-6 rounded-lg border p-4 text-sm ${
          saveError || error
            ? 'border-red-400/40 bg-red-950/30 text-red-200'
            : 'border-emerald-400/40 bg-emerald-950/30 text-emerald-200'
        }`}>
          {saveError || error || message}
        </div>
      )}

      <section className="grid gap-4">
        {sitePages.map(page => {
          const setting = settingsByKey[page.key];
          const isEnabled = setting?.isEnabled ?? true;
          const Icon = page.icon;
          const isSaving = savingPageKey === page.key;

          return (
            <article key={page.key} className="rounded-xl border border-fantasy-700/30 bg-midnight-900/50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${
                    isEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                  }`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold text-white">{page.name}</h2>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        isEnabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'
                      }`}>
                        {isEnabled ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {isEnabled ? 'Public' : 'Hidden'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{page.description}</p>
                    <p className="mt-2 text-xs font-semibold text-gray-500">{page.href}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleTogglePage(page.key)}
                  disabled={Boolean(savingPageKey)}
                  className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isEnabled
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-yellow-500 text-midnight-900 hover:bg-yellow-400'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isEnabled ? (
                    <ToggleLeft className="h-5 w-5" />
                  ) : (
                    <ToggleRight className="h-5 w-5" />
                  )}
                  <span>{isSaving ? 'Saving' : isEnabled ? 'Hide' : 'Show'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </AdminShell>
  );
};

const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">{children}</div>
  </div>
);

const AccessPanel: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-8 text-center">
    <Shield className="mx-auto mb-5 h-14 w-14 text-yellow-400" />
    <h1 className="font-fantasy text-3xl font-bold text-white">{title}</h1>
    <p className="mt-3 text-gray-300">{body}</p>
  </div>
);

export default AdminPage;
