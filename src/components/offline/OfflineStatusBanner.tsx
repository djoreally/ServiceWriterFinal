import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, RefreshCw, DownloadCloud } from 'lucide-react';
import { isOfflineEligibleForCurrentUser } from '@/offline/rollout';
import { toast } from '@/components/ui/sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function getInitialOnlineState(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function OfflineStatusBanner() {
  const [isOnline, setIsOnline] = useState(getInitialOnlineState);
  const [eligible, setEligible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const refreshPendingCount = useCallback(async () => {
    if (!eligible) return;
    const { getPendingOutboxCount } = await import('@/offline/outbox');
    setPendingCount(await getPendingOutboxCount());
  }, [eligible]);

  const syncNow = useCallback(async () => {
    if (!eligible || syncing) return;

    setSyncing(true);
    const [{ processOfflineOutbox }, { runOfflinePullSync }] = await Promise.all([
      import('@/offline/outbox'),
      import('@/offline/database/syncPull'),
    ]);
    try {
      await processOfflineOutbox();
      await runOfflinePullSync();
      await refreshPendingCount();
      toast.success('Offline changes synced');
    } catch (error) {
      console.error('[offline] manual sync failed', error);
      toast.error("Offline sync failed. We'll retry automatically.");
    } finally {
      setSyncing(false);
    }
  }, [eligible, refreshPendingCount, syncing]);

  useEffect(() => {
    let active = true;
    void isOfflineEligibleForCurrentUser().then((value) => {
      if (active) setEligible(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online — syncing queued work');
      void syncNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline. Eligible work will be saved and synced later.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow]);

  useEffect(() => {
    if (!eligible) return;
    void Promise.resolve().then(() => refreshPendingCount());
    const interval = window.setInterval((): void => { void refreshPendingCount(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [eligible, refreshPendingCount]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      toast.success('Service Writer installed for offline access');
      setInstallPrompt(null);
    }
  };

  if (!eligible && isOnline && !installPrompt) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex min-h-11 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? 'outline' : 'destructive'} className="gap-1">
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline mode'}
          </Badge>
          {eligible && pendingCount > 0 && (
            <span className="text-muted-foreground">
              {pendingCount} queued {pendingCount === 1 ? 'change' : 'changes'} waiting to sync.
            </span>
          )}
          {!isOnline && eligible && (
            <span className="text-muted-foreground">
              Keep working — changes sync when service returns.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {installPrompt && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => void installApp()}
            >
              <DownloadCloud className="h-3.5 w-3.5" />
              Install app
            </Button>
          )}
          {eligible && isOnline && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => void syncNow()}
              disabled={syncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Sync now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
