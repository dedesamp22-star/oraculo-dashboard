import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCheck, ExternalLink, Send, ShieldAlert, Smartphone, X } from 'lucide-react';

import {
  createTelegramLinkCode,
  deletePushSubscription,
  disconnectTelegram,
  getTelegramStatus,
  getNotificationPreferences,
  getNotifications,
  getPushPublicKey,
  listPushSubscriptions,
  markAllNotificationsRead,
  markNotificationRead,
  putNotificationPreferences,
  sendTestNotification,
  sendTelegramTest,
  subscribePush,
  type NotificationDto,
  type NotificationPreferences,
  type NotificationSource,
  type PushSubscriptionDto,
  type TelegramLinkCodeDto,
  type TelegramStatusDto,
} from '../lib/demoApi';

function severityColor(severity: NotificationDto['severity']): string {
  if (severity === 'critical') return '#ff4444';
  if (severity === 'warning') return '#ffaa00';
  if (severity === 'success') return '#00ff66';
  return '#00f0ff';
}

function fmtDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer;
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<NotificationSource | undefined>(undefined);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionDto[]>([]);
  const [telegram, setTelegram] = useState<TelegramStatusDto | null>(null);
  const [telegramCode, setTelegramCode] = useState<TelegramLinkCodeDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [notifications, preferences, pushSubs, telegramStatus] = await Promise.all([
        getNotifications(30, source),
        getNotificationPreferences(),
        listPushSubscriptions(),
        getTelegramStatus(),
      ]);
      setItems(notifications.items);
      setUnread(notifications.unreadCount);
      setPrefs(preferences);
      setSubscriptions(pushSubs);
      setTelegram(telegramStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar alertas.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await load();
    };
    void run();
    const timer = window.setInterval(() => void run(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [source]);

  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Push nao e suportado neste navegador.');
      }
      const key = await getPushPublicKey();
      if (!key.publicKey) throw new Error('Push preparado, mas ORACULO_VAPID_PUBLIC_KEY nao esta configurada neste ambiente.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissao de notificacao negada.');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(key.publicKey),
      });
      await subscribePush(subscription.toJSON());
      await putNotificationPreferences({ push: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ativar Push.');
    }
  };

  const togglePref = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = await putNotificationPreferences({ [key]: value });
    setPrefs(next);
  };

  const connectTelegram = async () => {
    try {
      const code = await createTelegramLinkCode();
      setTelegramCode(code);
      await putNotificationPreferences({ telegram: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar Telegram.');
    }
  };

  const testTelegram = async () => {
    try {
      await sendTelegramTest();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao testar Telegram.');
    }
  };

  const revokeTelegram = async () => {
    try {
      await disconnectTelegram();
      setTelegramCode(null);
      await putNotificationPreferences({ telegram: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar Telegram.');
    }
  };

  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="relative">
            <Bell className="w-4 h-4 text-primary" />
            {unread > 0 && <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-[#ff4444] px-1 text-[9px] font-mono text-white">{unread}</span>}
          </span>
          <span className="text-xs font-mono font-bold uppercase tracking-[0.18em]">Alertas</span>
        </span>
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{open ? 'fechar' : 'abrir'}</span>
      </button>

      {open && (
        <div className="border-t border-border/50 p-4 flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1">
            {([undefined, 'DEMO', 'HOMOLOGATION', 'SYSTEM'] as Array<NotificationSource | undefined>).map((item) => (
              <button
                key={item ?? 'ALL'}
                onClick={() => setSource(item)}
                className={`min-h-10 border px-2 text-[9px] font-mono uppercase tracking-[0.12em] ${source === item ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
              >
                {item ?? 'Todos'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void markAllNotificationsRead().then(load)} className="min-h-10 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em]">
              <CheckCheck className="inline w-3.5 h-3.5 mr-1" />
              Ler todos
            </button>
            <button type="button" onClick={() => void sendTestNotification().then(load)} className="min-h-10 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em]">
              <Send className="inline w-3.5 h-3.5 mr-1" />
              Teste
            </button>
            <button type="button" onClick={() => void enablePush()} className="min-h-10 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em]">
              <Smartphone className="inline w-3.5 h-3.5 mr-1" />
              Ativar Push
            </button>
          </div>

          {prefs && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
              <label className="flex items-center gap-2 border border-border/50 p-2"><input type="checkbox" checked={prefs.internal} onChange={(event) => void togglePref('internal', event.target.checked)} /> Internos</label>
              <label className="flex items-center gap-2 border border-border/50 p-2"><input type="checkbox" checked={prefs.push} onChange={(event) => void togglePref('push', event.target.checked)} /> Push</label>
              <label className="flex items-center gap-2 border border-border/50 p-2"><input type="checkbox" checked={prefs.telegram} onChange={(event) => void togglePref('telegram', event.target.checked)} /> Telegram</label>
              <label className="flex items-center gap-2 border border-border/50 p-2"><input type="checkbox" checked={prefs.includeBlockedEntries} onChange={(event) => void togglePref('includeBlockedEntries', event.target.checked)} /> Bloqueios</label>
              <label className="flex items-center gap-2 border border-border/50 p-2"><input type="checkbox" checked={prefs.includeSimulation} onChange={(event) => void togglePref('includeSimulation', event.target.checked)} /> Homologacao</label>
            </div>
          )}

          <div className="border border-border/50 bg-background/20 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-primary">Telegram</p>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  {!telegram?.configured ? 'Bot nao configurado neste ambiente.' : telegram.connected ? `Conectado${telegram.telegramUsername ? ` a @${telegram.telegramUsername}` : ''}.` : 'Desconectado.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!telegram?.connected && (
                  <button type="button" onClick={() => void connectTelegram()} className="min-h-11 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em]">
                    Conectar Telegram
                  </button>
                )}
                {telegram?.connected && (
                  <>
                    <button type="button" onClick={() => void testTelegram()} className="min-h-11 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em]">
                      Testar
                    </button>
                    <button type="button" onClick={() => void revokeTelegram()} className="min-h-11 border border-border px-3 text-[10px] font-mono uppercase tracking-[0.12em] text-[#ffaa00]">
                      Desconectar
                    </button>
                  </>
                )}
              </div>
            </div>
            {telegramCode && (
              <div className="mt-3 border border-primary/40 bg-primary/5 p-3 text-[11px] font-mono">
                <p className="uppercase tracking-[0.12em] text-primary">Codigo temporario</p>
                <p className="mt-1 text-lg font-bold tracking-[0.18em]">{telegramCode.code}</p>
                <p className="mt-1 text-muted-foreground">No Telegram, envie /start {telegramCode.code}. Expira em {fmtDate(telegramCode.expiresAt)}.</p>
                {telegramCode.deepLink && (
                  <a href={telegramCode.deepLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-2 border border-border px-3 text-[10px] uppercase tracking-[0.12em]">
                    Abrir bot <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {subscriptions.length > 0 && (
            <div className="grid grid-cols-1 gap-1">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="flex items-center justify-between gap-2 border border-border/40 px-3 py-2 text-[10px] font-mono text-muted-foreground">
                  <span>Dispositivo {subscription.endpointHash.slice(0, 8)}</span>
                  <button onClick={() => void deletePushSubscription(subscription.id).then(load)} className="text-[#ffaa00]"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="flex items-center gap-2 text-[11px] font-mono text-[#ff4444]"><ShieldAlert className="w-3.5 h-3.5" />{error}</p>}

          <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {items.length === 0 && <p className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground"><BellOff className="w-3.5 h-3.5" />Nenhum alerta encontrado.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void markNotificationRead(item.id).then(load)}
                className="border border-border/50 bg-background/20 p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.12em]" style={{ color: severityColor(item.severity) }}>{item.title}</span>
                  <span className="text-[9px] font-mono text-muted-foreground">{fmtDate(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground leading-relaxed">{item.message}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                  <span>{item.source}</span>
                  {item.symbol && <span>{item.symbol}</span>}
                  {!item.readAt && <span className="text-primary">novo</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
