'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Globe, Mic, Sparkles, Video, Mail, Archive, Download,
  Key, Eye, EyeOff, Loader2, Save, Check, ListChecks, X, Settings2, Plug, MessageSquare, GitBranch, Webhook, Trash2, Plus,
} from 'lucide-react';
import { Toggle, FieldWrapper } from '../components/shared';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { RadioGroup } from '@/components/ui/choice';
import { LinearIcon, ClickUpIcon, DeepgramIcon, LiveKitIcon, PostgresIcon, S3Icon, GoogleIcon, HubSpotIcon } from '../components/BrandIcons';
import css from './IntegrationsTab.module.css';

// Which connectors open a config modal (the rest are read-only status cards).
const MANAGEABLE = new Set(['Deepgram', 'AI model', 'SMTP Email', 'S3 Storage', 'ClickUp', 'Linear', 'Google OAuth', 'Chat', 'Webhooks', 'CRM']);

export function IntegrationsTab() {
  const t = useTranslations();
  const locale = useLocale();
  const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
    LiveKit: <LiveKitIcon />,
    Deepgram: <DeepgramIcon />,
    'AI model': <Sparkles size={20} />,
    'SMTP Email': <Mail size={20} />,
    'Google OAuth': <GoogleIcon />,
    PostgreSQL: <PostgresIcon />,
    'S3 Storage': <S3Icon />,
    ClickUp: <ClickUpIcon />,
    Linear: <LinearIcon />,
    Chat: <MessageSquare size={20} />,
    Webhooks: <Webhook size={20} />,
    CRM: <HubSpotIcon />,
  };
  const [integrations, setIntegrations] = useState<{ name: string; desc: string; status: string; metric?: string }[]>([]);
  // The connector whose config modal is open (by name), or null.
  const [manage, setManage] = useState<string | null>(null);

  // API Keys management
  const [keys, setKeys] = useState<Record<string, { value: string; masked: string; updatedAt: string }>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [keysLoading, setKeysLoading] = useState(true);

  // SMTP / email config
  const [smtp, setSmtp] = useState({ host: '', port: '587', secure: false, user: '', from: '', fromName: '', passSet: false });
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // S3 / object storage config
  const [s3, setS3] = useState({ endpoint: '', region: '', bucket: '', accessKeyId: '', forcePathStyle: false, secretSet: false });
  const [s3Secret, setS3Secret] = useState('');
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Saved, setS3Saved] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);
  const [s3Test, setS3Test] = useState<{ ok: boolean; msg: string } | null>(null);

  // ClickUp integration config (paste token → it works)
  const [clickup, setClickup] = useState<{ enabled: boolean; tokenSet: boolean; routingMode: 'department' | 'inbox'; teamId: string; personalRouting: boolean; fallbackListId: string; migration?: { state?: string; total?: number; migrated?: number } | null }>({ enabled: false, tokenSet: false, routingMode: 'department', teamId: '', personalRouting: false, fallbackListId: '' });
  const [clickupLists, setClickupLists] = useState<{ listId: string; label: string }[]>([]);
  const [clickupListsStale, setClickupListsStale] = useState(false);
  const [clickupToken, setClickupToken] = useState('');
  const [clickupSaving, setClickupSaving] = useState(false);
  const [clickupSaved, setClickupSaved] = useState(false);
  const [clickupTesting, setClickupTesting] = useState(false);
  const [clickupTest, setClickupTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [clickupFallback, setClickupFallback] = useState<{ listName: string; last30d: number; total: number } | null>(null);
  const [clickupFallbackLoading, setClickupFallbackLoading] = useState(false);

  // Linear two-way sync config (mirrors ClickUp)
  const [linear, setLinear] = useState<{ enabled: boolean; tokenSet: boolean; routingMode: 'department' | 'inbox'; migration?: { state?: string; total?: number; migrated?: number } | null }>({ enabled: false, tokenSet: false, routingMode: 'department' });
  const [linearToken, setLinearToken] = useState('');
  const [linearSaving, setLinearSaving] = useState(false);
  const [linearSaved, setLinearSaved] = useState(false);
  const [linearTesting, setLinearTesting] = useState(false);
  const [linearTest, setLinearTest] = useState<{ ok: boolean; msg: string } | null>(null);

  // Chat notifications config (Telegram / Slack / Mattermost / Discord)
  const [chat, setChat] = useState<{ enabled: boolean; provider: string; chatId: string; botTokenSet: boolean; webhookSet: boolean }>({ enabled: false, provider: 'telegram', chatId: '', botTokenSet: false, webhookSet: false });
  const [chatBotToken, setChatBotToken] = useState('');
  const [chatWebhook, setChatWebhook] = useState('');
  const [chatSaving, setChatSaving] = useState(false);
  const [chatSaved, setChatSaved] = useState(false);
  const [chatTesting, setChatTesting] = useState(false);
  const [chatTestRes, setChatTestRes] = useState<{ ok: boolean; msg: string } | null>(null);

  // AI model provider config (DeepSeek / OpenRouter / OpenAI / Anthropic / Ollama / Custom)
  const [ai, setAi] = useState<{ provider: string; baseUrl: string; model: string; maxTokens: string; apiKeySet: boolean }>({ provider: 'deepseek', baseUrl: '', model: '', maxTokens: '', apiKeySet: false });
  const [aiKey, setAiKey] = useState('');
  const [aiPresets, setAiPresets] = useState<Record<string, { label: string; baseUrl: string; model: string; keyless?: boolean }>>({});
  const [aiModels, setAiModels] = useState<{ id: string; maxOutput: number | null; contextLength: number | null }[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiModelsErr, setAiModelsErr] = useState('');
  const [aiCustom, setAiCustom] = useState(false); // manual model-id entry (vs. the fetched dropdown)
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestRes, setAiTestRes] = useState<{ ok: boolean; msg: string } | null>(null);

  // Webhooks: a list of outbound endpoints. `key` is a client-only React key; `id`
  // is the server id ('' for a not-yet-saved endpoint); `secret` is a freshly typed
  // value ('' = leave the stored secret untouched).
  type WhRow = { key: string; id: string; url: string; enabled: boolean; events: string[]; secretSet: boolean; secret: string };
  const [webhooks, setWebhooks] = useState<WhRow[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhooksSaving, setWebhooksSaving] = useState(false);
  const [webhooksSaved, setWebhooksSaved] = useState(false);
  const [webhookTestingId, setWebhookTestingId] = useState<string | null>(null);
  const [webhookTestRes, setWebhookTestRes] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  // CRM (HubSpot) — log finished meetings to the matching contact.
  const [crm, setCrm] = useState<{ enabled: boolean; provider: string; tokenSet: boolean; createContact: boolean }>({ enabled: false, provider: 'hubspot', tokenSet: false, createContact: false });
  const [crmToken, setCrmToken] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmSaved, setCrmSaved] = useState(false);
  const [crmTesting, setCrmTesting] = useState(false);
  const [crmTest, setCrmTest] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/keys')
      .then(r => r.json())
      .then(data => { if (!data.error) setKeys(data); })
      .catch(console.error)
      .finally(() => setKeysLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/email')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setSmtp({
          host: d.host || '', port: String(d.port || '587'), secure: !!d.secure,
          user: d.user || '', from: d.from || '', fromName: d.fromName || '', passSet: !!d.passSet,
        });
      })
      .catch(() => {})
      .finally(() => setSmtpLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.integrations)) setIntegrations(d.integrations); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/s3')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setS3({
          endpoint: d.endpoint || '', region: d.region || '', bucket: d.bucket || '',
          accessKeyId: d.accessKeyId || '', forcePathStyle: !!d.forcePathStyle, secretSet: !!d.secretSet,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/clickup')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setClickup({
          enabled: !!d.enabled, tokenSet: !!d.tokenSet,
          routingMode: d.routingMode === 'inbox' ? 'inbox' : 'department', teamId: d.teamId || '',
          personalRouting: !!d.personalRouting,
          fallbackListId: d.fallbackListId || '',
          migration: d.migration ?? null,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/linear')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setLinear({
          enabled: !!d.enabled, tokenSet: !!d.tokenSet,
          routingMode: d.routingMode === 'inbox' ? 'inbox' : 'department',
          migration: d.migration ?? null,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/chat')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setChat({
          enabled: !!d.enabled, provider: d.provider || 'telegram', chatId: d.chatId || '',
          botTokenSet: !!d.botTokenSet, webhookSet: !!d.webhookSet,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setAi({ provider: d.provider || 'deepseek', baseUrl: d.baseUrl || '', model: d.model || '', maxTokens: d.maxTokens ? String(d.maxTokens) : '', apiKeySet: !!d.apiKeySet });
          if (d.presets) setAiPresets(d.presets);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/webhooks')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.endpoints)) setWebhooks(d.endpoints.map((e: any) => ({ key: e.id, id: e.id, url: e.url || '', enabled: !!e.enabled, events: Array.isArray(e.events) ? e.events : [], secretSet: !!e.secretSet, secret: '' })));
        if (Array.isArray(d.events)) setWebhookEvents(d.events);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/crm')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setCrm({ enabled: !!d.enabled, provider: d.provider || 'hubspot', tokenSet: !!d.tokenSet, createContact: !!d.createContact });
      })
      .catch(() => {});
  }, []);

  // Auto-load the provider's model list the first time the AI modal opens (when a
  // key is already saved, or the provider is keyless), so the dropdown is ready.
  useEffect(() => {
    if (manage === 'AI model' && aiModels.length === 0 && !aiModelsLoading && (ai.apiKeySet || aiPresets[ai.provider]?.keyless)) {
      loadAiModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manage]);

  // Lazily load how much the fallback (Call Inbox) list is catching when the ClickUp
  // modal opens (it hits the ClickUp API, so it's not on the main settings GET).
  useEffect(() => {
    if (manage === 'ClickUp' && clickup.enabled && clickup.tokenSet && clickupFallback === null && !clickupFallbackLoading) {
      setClickupFallbackLoading(true);
      fetch('/api/settings/clickup/fallback-stats')
        .then(r => r.json())
        .then(d => { if (d.stats) setClickupFallback(d.stats); })
        .catch(() => {})
        .finally(() => setClickupFallbackLoading(false));
    }
    // Same deal for the list picker: several ClickUp calls, so only on modal open.
    if (manage === 'ClickUp' && clickup.enabled && clickup.tokenSet && clickupLists.length === 0) {
      fetch('/api/settings/clickup/lists')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (Array.isArray(d?.lists)) setClickupLists(d.lists); setClickupListsStale(!d || !!d.stale); })
        .catch(() => setClickupListsStale(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manage]);

  // Close the modal on Escape.
  useEffect(() => {
    if (!manage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setManage(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manage]);

  const refreshIntegrations = () => {
    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.integrations)) setIntegrations(d.integrations); })
      .catch(() => {});
  };

  const saveClickup = async () => {
    setClickupSaving(true); setClickupSaved(false);
    try {
      const payload: any = { enabled: clickup.enabled, routingMode: clickup.routingMode, personalRouting: clickup.personalRouting, fallbackListId: clickup.fallbackListId };
      if (clickupToken.trim()) payload.token = clickupToken.trim();
      const res = await fetch('/api/settings/clickup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setClickupSaved(true);
        if (clickupToken.trim()) { setClickup(c => ({ ...c, tokenSet: true })); setClickupToken(''); }
        setTimeout(() => setClickupSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setClickupSaving(false); }
  };

  const testClickup = async () => {
    setClickupTesting(true); setClickupTest(null);
    try {
      // If a fresh token was typed, persist it first so the test hits the new one.
      if (clickupToken.trim()) {
        const saveRes = await fetch('/api/settings/clickup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: clickupToken.trim() }) });
        if (!saveRes.ok) { setClickupTest({ ok: false, msg: t('settings.networkError') }); return; }
        setClickup(c => ({ ...c, tokenSet: true })); setClickupToken('');
      }
      const res = await fetch('/api/settings/clickup/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setClickupTest(res.ok
        ? { ok: true, msg: d.team ? `${t('settings.connectionSuccess')} · ${d.team}` : t('settings.connectionSuccess') }
        : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setClickupTest({ ok: false, msg: t('settings.networkError') }); }
    finally { setClickupTesting(false); }
  };

  const saveLinear = async () => {
    setLinearSaving(true); setLinearSaved(false);
    try {
      const payload: any = { enabled: linear.enabled, routingMode: linear.routingMode };
      if (linearToken.trim()) payload.token = linearToken.trim();
      const res = await fetch('/api/settings/linear', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setLinearSaved(true);
        if (linearToken.trim()) { setLinear(c => ({ ...c, tokenSet: true })); setLinearToken(''); }
        setTimeout(() => setLinearSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setLinearSaving(false); }
  };

  const testLinear = async () => {
    setLinearTesting(true); setLinearTest(null);
    try {
      if (linearToken.trim()) {
        const saveRes = await fetch('/api/settings/linear', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: linearToken.trim() }) });
        if (!saveRes.ok) { setLinearTest({ ok: false, msg: t('settings.networkError') }); return; }
        setLinear(c => ({ ...c, tokenSet: true })); setLinearToken('');
      }
      const res = await fetch('/api/settings/linear/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setLinearTest(res.ok
        ? { ok: true, msg: d.team ? `${t('settings.connectionSuccess')} · ${d.team}` : t('settings.connectionSuccess') }
        : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setLinearTest({ ok: false, msg: t('settings.networkError') }); }
    finally { setLinearTesting(false); }
  };

  const saveChat = async () => {
    setChatSaving(true); setChatSaved(false);
    try {
      const payload: any = { enabled: chat.enabled, provider: chat.provider, chatId: chat.chatId };
      if (chatBotToken.trim()) payload.botToken = chatBotToken.trim();
      if (chatWebhook.trim()) payload.webhookUrl = chatWebhook.trim();
      const res = await fetch('/api/settings/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setChatSaved(true);
        if (chatBotToken.trim()) { setChat(c => ({ ...c, botTokenSet: true })); setChatBotToken(''); }
        if (chatWebhook.trim()) { setChat(c => ({ ...c, webhookSet: true })); setChatWebhook(''); }
        setTimeout(() => setChatSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setChatSaving(false); }
  };

  const testChat = async () => {
    setChatTesting(true); setChatTestRes(null);
    try {
      // Persist the current form first so the test message uses it (no need to enable yet).
      const payload: any = { provider: chat.provider, chatId: chat.chatId };
      if (chatBotToken.trim()) payload.botToken = chatBotToken.trim();
      if (chatWebhook.trim()) payload.webhookUrl = chatWebhook.trim();
      const saveRes = await fetch('/api/settings/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!saveRes.ok) { setChatTestRes({ ok: false, msg: t('settings.networkError') }); return; }
      if (chatBotToken.trim()) { setChat(c => ({ ...c, botTokenSet: true })); setChatBotToken(''); }
      if (chatWebhook.trim()) { setChat(c => ({ ...c, webhookSet: true })); setChatWebhook(''); }
      const res = await fetch('/api/settings/chat/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setChatTestRes(res.ok ? { ok: true, msg: t('settings.testSent') } : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setChatTestRes({ ok: false, msg: t('settings.networkError') }); }
    finally { setChatTesting(false); }
  };

  const loadAiModels = async () => {
    setAiModelsLoading(true); setAiModelsErr('');
    try {
      const payload: any = { provider: ai.provider, baseUrl: ai.baseUrl };
      if (aiKey.trim()) payload.apiKey = aiKey.trim();
      const res = await fetch('/api/settings/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.models)) {
        setAiModels(d.models);
        if (!d.models.length) setAiModelsErr(t('settings.aiModelsEmpty'));
      } else {
        setAiModels([]); setAiModelsErr(d.error || t('settings.networkError'));
      }
    } catch { setAiModels([]); setAiModelsErr(t('settings.networkError')); }
    finally { setAiModelsLoading(false); }
  };

  const saveAi = async () => {
    setAiSaving(true); setAiSaved(false);
    try {
      const payload: any = { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, maxTokens: ai.maxTokens.trim() ? Number(ai.maxTokens) : 0 };
      if (aiKey.trim()) payload.apiKey = aiKey.trim();
      const res = await fetch('/api/settings/ai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setAiSaved(true);
        if (aiKey.trim()) { setAi(a => ({ ...a, apiKeySet: true })); setAiKey(''); }
        setTimeout(() => setAiSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setAiSaving(false); }
  };

  const testAi = async () => {
    setAiTesting(true); setAiTestRes(null);
    try {
      // Persist the current form first so the probe uses it.
      const payload: any = { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, maxTokens: ai.maxTokens.trim() ? Number(ai.maxTokens) : 0 };
      if (aiKey.trim()) payload.apiKey = aiKey.trim();
      const saveRes = await fetch('/api/settings/ai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!saveRes.ok) { setAiTestRes({ ok: false, msg: t('settings.networkError') }); return; }
      if (aiKey.trim()) { setAi(a => ({ ...a, apiKeySet: true })); setAiKey(''); }
      const res = await fetch('/api/settings/ai/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setAiTestRes(res.ok
        ? { ok: true, msg: d.model ? `${t('settings.connectionSuccess')} · ${d.model}` : t('settings.connectionSuccess') }
        : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setAiTestRes({ ok: false, msg: t('settings.networkError') }); }
    finally { setAiTesting(false); }
  };

  // ── Webhooks row editing ──
  const newKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const addWebhook = () => setWebhooks(w => [...w, { key: newKey(), id: '', url: '', enabled: true, events: [], secretSet: false, secret: '' }]);
  const removeWebhook = (key: string) => setWebhooks(w => w.filter(e => e.key !== key));
  const patchWebhook = (key: string, patch: Partial<WhRow>) => setWebhooks(w => w.map(e => e.key === key ? { ...e, ...patch } : e));
  const toggleWebhookEvent = (key: string, ev: string) => setWebhooks(w => w.map(e => e.key === key ? { ...e, events: e.events.includes(ev) ? e.events.filter(x => x !== ev) : [...e.events, ev] } : e));

  const saveWebhooks = async () => {
    setWebhooksSaving(true); setWebhooksSaved(false);
    try {
      const payload = {
        endpoints: webhooks
          .filter(e => e.url.trim())
          .map(e => ({ id: e.id || undefined, url: e.url.trim(), enabled: e.enabled, events: e.events, secret: e.secret.trim() || undefined })),
      };
      const res = await fetch('/api/settings/webhooks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.endpoints)) {
        setWebhooks(d.endpoints.map((e: any) => ({ key: e.id, id: e.id, url: e.url || '', enabled: !!e.enabled, events: Array.isArray(e.events) ? e.events : [], secretSet: !!e.secretSet, secret: '' })));
        setWebhooksSaved(true);
        setTimeout(() => setWebhooksSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setWebhooksSaving(false); }
  };

  const testWebhook = async (row: WhRow) => {
    if (!row.id) { setWebhookTestRes({ id: row.key, ok: false, msg: t('settings.webhookSaveFirst') }); return; }
    setWebhookTestingId(row.id); setWebhookTestRes(null);
    try {
      const res = await fetch('/api/settings/webhooks/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
      const d = await res.json().catch(() => ({}));
      setWebhookTestRes({ id: row.key, ...(res.ok ? { ok: true, msg: t('settings.webhookTestSent') } : { ok: false, msg: d.error || t('settings.networkError') }) });
    } catch { setWebhookTestRes({ id: row.key, ok: false, msg: t('settings.networkError') }); }
    finally { setWebhookTestingId(null); }
  };

  const saveCrm = async () => {
    setCrmSaving(true); setCrmSaved(false);
    try {
      const payload: any = { enabled: crm.enabled, provider: crm.provider, createContact: crm.createContact };
      if (crmToken.trim()) payload.token = crmToken.trim();
      const res = await fetch('/api/settings/crm', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setCrmSaved(true);
        if (crmToken.trim()) { setCrm(c => ({ ...c, tokenSet: true })); setCrmToken(''); }
        setTimeout(() => setCrmSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setCrmSaving(false); }
  };

  const testCrm = async () => {
    setCrmTesting(true); setCrmTest(null);
    try {
      // Persist a freshly typed token first so the probe uses it.
      if (crmToken.trim()) {
        const saveRes = await fetch('/api/settings/crm', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: crmToken.trim() }) });
        if (!saveRes.ok) { setCrmTest({ ok: false, msg: t('settings.networkError') }); return; }
        setCrm(c => ({ ...c, tokenSet: true })); setCrmToken('');
      }
      const res = await fetch('/api/settings/crm/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setCrmTest(res.ok ? { ok: true, msg: t('settings.connectionSuccess') } : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setCrmTest({ ok: false, msg: t('settings.networkError') }); }
    finally { setCrmTesting(false); }
  };

  const saveS3 = async () => {
    setS3Saving(true); setS3Saved(false);
    try {
      const payload: any = { endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket, accessKeyId: s3.accessKeyId, forcePathStyle: s3.forcePathStyle };
      if (s3Secret) payload.secretAccessKey = s3Secret;
      const res = await fetch('/api/settings/s3', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setS3Saved(true);
        if (s3Secret) { setS3((s) => ({ ...s, secretSet: true })); setS3Secret(''); }
        setTimeout(() => setS3Saved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setS3Saving(false); }
  };

  const testS3Conn = async () => {
    setS3Testing(true); setS3Test(null);
    try {
      const res = await fetch('/api/settings/s3/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setS3Test(res.ok ? { ok: true, msg: t('settings.connectionSuccess') } : { ok: false, msg: d.error || t('settings.networkError') });
    } catch { setS3Test({ ok: false, msg: t('settings.networkError') }); }
    finally { setS3Testing(false); }
  };

  const saveKey = async (keyName: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [keyName]: editValue.trim() }),
      });
      if (res.ok) {
        const data = await fetch('/api/settings/keys').then(r => r.json());
        if (!data.error) setKeys(data);
        setEditingKey(null);
        setEditValue('');
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const saveSmtp = async () => {
    setSmtpSaving(true); setSmtpSaved(false);
    try {
      const payload: any = { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from, fromName: smtp.fromName };
      if (smtpPass) payload.pass = smtpPass;
      const res = await fetch('/api/settings/email', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSmtpSaved(true);
        if (smtpPass) { setSmtp(s => ({ ...s, passSet: true })); setSmtpPass(''); }
        setTimeout(() => setSmtpSaved(false), 2500);
        refreshIntegrations();
      }
    } catch (e) { console.error(e); }
    finally { setSmtpSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      setTestResult(res.ok ? { ok: true, msg: t('settings.testEmailSent') } : { ok: false, msg: d.error || t('settings.sendFailed') });
    } catch { setTestResult({ ok: false, msg: t('settings.networkError') }); }
    finally { setTesting(false); }
  };

  const API_KEYS_CONFIG = [
    { key: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key', service: 'Deepgram' },
    { key: 'DEEPGRAM_MODEL', label: 'Deepgram Model', service: 'Deepgram' },
    { key: 'DEEPGRAM_LANGUAGE', label: 'Deepgram Language', service: 'Deepgram' },
    { key: 'GOOGLE_CLIENT_ID', label: 'Client ID', service: 'Google OAuth' },
    { key: 'GOOGLE_CLIENT_SECRET', label: 'Client secret', service: 'Google OAuth' },
  ];

  // ─────────────────────────── status pill ───────────────────────────
  const statusPill = (status: string) => {
    if (status === 'connected') return (
      <span className={`chip ${css.pillOk}`}>
        <span className={`${css.dot} ${css.dotGreen}`} /> {t('settings.statusConnected')}
      </span>
    );
    if (status === 'error') return (
      <span className={`chip ${css.pillErr}`}>
        <span className={`${css.dot} ${css.dotRed}`} /> {t('settings.statusError')}
      </span>
    );
    return <span className={`chip ${css.pillIdle}`}><span className={`${css.dot} ${css.dotIdle}`} /> {t('settings.notConfigured')}</span>;
  };

  // ─────────────────────────── per-key editor row (reused in Deepgram/DeepSeek modals) ───────────────────────────
  const keyRow = (keyName: string, label: string) => {
    const keyData = keys[keyName];
    const isEditing = editingKey === keyName;
    const isVisible = showKey[keyName];
    return (
      <div key={keyName} className={css.keyCard}>
        <div className={css.keyHead} style={{ marginBottom: isEditing ? 10 : 0 }}>
          <div>
            <div className={css.keyLabel}>{label}</div>
            {!isEditing && (
              <div className={`mono ${css.keyValue}`}>
                {isVisible ? keyData?.value : keyData?.masked || t('settings.notConfigured')}
              </div>
            )}
          </div>
          {!isEditing && (
            <div className={css.rowGap6}>
              {keyData?.value && (
                <button className={`btn btn-ghost btn-icon ${css.iconBtn30}`}
                  onClick={() => setShowKey(p => ({ ...p, [keyName]: !p[keyName] }))}>
                  {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              )}
              <button className="btn btn-sm" onClick={() => { setEditingKey(keyName); setEditValue(''); }}>{t('common.edit')}</button>
            </div>
          )}
        </div>
        {isEditing && (
          <div className={css.rowGap8}>
            <input className={`field ${css.keyInput}`} value={editValue} onChange={e => setEditValue(e.target.value)}
              placeholder={
                keyName === 'DEEPGRAM_MODEL' ? 'nova-3'
                : keyName === 'DEEPGRAM_LANGUAGE' ? 'multi'
                : keyName === 'GOOGLE_CLIENT_ID' ? '….apps.googleusercontent.com'
                : keyName === 'GOOGLE_CLIENT_SECRET' ? 'GOCSPX-…'
                : t('settings.pasteNewKey')
              }
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveKey(keyName); if (e.key === 'Escape') setEditingKey(null); }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => saveKey(keyName)} disabled={saving || !editValue.trim()}><Save size={13} /></button>
            <button className="btn btn-sm" onClick={() => setEditingKey(null)}>{t('common.cancel')}</button>
          </div>
        )}
        {keyData?.updatedAt && !isEditing && (
          <div className={css.keyUpdated}>
            {t('settings.updated')} {new Date(keyData.updatedAt).toLocaleDateString(locale)}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────── modal body per connector ───────────────────────────
  const renderKeysModal = (service: string) => (
    keysLoading
      ? <div className={css.loadingBox}>{t('common.loading')}</div>
      : <div className={css.stack12}>
          {API_KEYS_CONFIG.filter(k => k.service === service).map(({ key, label }) => keyRow(key, label))}
        </div>
  );

  const renderGoogleModal = () => {
    const redirect = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback/google` : '/api/auth/callback/google';
    return (
      <div className={css.stack12}>
        <div className={css.hint}>
          {t('settings.googleRedirectHint')}
          <code className={`mono ${css.codeBlock}`}>{redirect}</code>
        </div>
        {renderKeysModal('Google OAuth')}
      </div>
    );
  };

  const renderSmtpModal = () => (
    smtpLoading
      ? <div className={css.loadingBox}>{t('common.loading')}</div>
      : <div className={css.stack14}>
          <div className={css.grid21}>
            <FieldWrapper label={t('settings.smtpServer')}>
              <input className="field" value={smtp.host} placeholder="smtp.gmail.com" onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label={t('settings.port')}>
              <input className="field" value={smtp.port} placeholder="587" inputMode="numeric" onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} />
            </FieldWrapper>
          </div>
          <div className={css.grid2}>
            <FieldWrapper label={t('settings.smtpUser')}>
              <input className="field" value={smtp.user} placeholder="admin@example.com" onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label={smtp.passSet ? t('settings.smtpPasswordSet') : t('settings.smtpPassword')}>
              <input className="field" type="password" value={smtpPass} placeholder={smtp.passSet ? '••••••••••••' : 'App Password'} onChange={e => setSmtpPass(e.target.value)} />
            </FieldWrapper>
          </div>
          <div className={css.grid2}>
            <FieldWrapper label={t('settings.smtpFrom')}>
              <input className="field" value={smtp.from} placeholder="admin@example.com" onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label={t('settings.smtpFromName')}>
              <input className="field" value={smtp.fromName} placeholder="Garely" onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))} />
            </FieldWrapper>
          </div>
          <Toggle label={t('settings.smtpSsl')} value={smtp.secure} onChange={v => setSmtp(s => ({ ...s, secure: v }))} />
          <div className={css.actions}>
            <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveSmtp} disabled={smtpSaving}>
              {smtpSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
            </button>
            {smtpSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
          </div>
          <div className={css.testSection}>
            <div className={css.hintSm}>{t('settings.testEmail')}</div>
            <div className={css.rowWrap8}>
              <input className={`field ${css.testInput}`} value={testEmail} placeholder={t('settings.testEmailPlaceholder')} onChange={e => setTestEmail(e.target.value)} />
              <button className={`btn btn-sm ${css.btnIco}`} onClick={sendTest} disabled={testing}>
                {testing ? <Loader2 size={13} className={css.spin} /> : <Mail size={13} />} {t('settings.sendTest')}
              </button>
            </div>
            {testResult && <div className={css.resultMsg} style={{ color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>{testResult.msg}</div>}
          </div>
        </div>
  );

  const renderS3Modal = () => (
    <div className={css.stack14}>
      <div className={css.grid2}>
        <FieldWrapper label="Bucket">
          <input className="field" value={s3.bucket} placeholder="eam-recordings" onChange={e => setS3(s => ({ ...s, bucket: e.target.value }))} />
        </FieldWrapper>
        <FieldWrapper label="Region">
          <input className="field" value={s3.region} placeholder="us-east-1" onChange={e => setS3(s => ({ ...s, region: e.target.value }))} />
        </FieldWrapper>
      </div>
      <FieldWrapper label={t('settings.s3Endpoint')}>
        <input className="field" value={s3.endpoint} placeholder="https://s3.eu-central-1.wasabisys.com" onChange={e => setS3(s => ({ ...s, endpoint: e.target.value }))} />
      </FieldWrapper>
      <div className={css.grid2}>
        <FieldWrapper label="Access Key ID">
          <input className="field" value={s3.accessKeyId} placeholder="AKIA..." onChange={e => setS3(s => ({ ...s, accessKeyId: e.target.value }))} />
        </FieldWrapper>
        <FieldWrapper label={s3.secretSet ? t('settings.s3SecretSet') : 'Secret Access Key'}>
          <input className="field" type="password" value={s3Secret} placeholder={s3.secretSet ? '••••••••••••' : 'Secret'} onChange={e => setS3Secret(e.target.value)} />
        </FieldWrapper>
      </div>
      <Toggle label={t('settings.s3ForcePathStyle')} value={s3.forcePathStyle} onChange={v => setS3(s => ({ ...s, forcePathStyle: v }))} />
      <div className={css.actions}>
        <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveS3} disabled={s3Saving}>
          {s3Saving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
        </button>
        <button className={`btn btn-sm ${css.btnIco}`} onClick={testS3Conn} disabled={s3Testing}>
          {s3Testing ? <Loader2 size={13} className={css.spin} /> : <Check size={13} />} {t('settings.testConnection')}
        </button>
        {s3Saved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
        {s3Test && <span className={css.resultMsg} style={{ color: s3Test.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{s3Test.msg}</span>}
      </div>
    </div>
  );

  const renderClickupModal = () => (
    <div className={css.stack14}>
      <Toggle label={t('settings.clickupEnabled')} value={clickup.enabled} onChange={v => setClickup(c => ({ ...c, enabled: v }))} />
      <FieldWrapper label={clickup.tokenSet ? t('settings.clickupTokenSet') : t('settings.clickupToken')}>
        <input className={`field ${css.monoField}`} type="password" value={clickupToken} placeholder={clickup.tokenSet ? '••••••••••••' : 'pk_...'}
          onChange={e => setClickupToken(e.target.value)} />
      </FieldWrapper>
      <FieldWrapper label={t('settings.clickupRouting')}>
        {/* Two answers, so both are shown. A dropdown here hid the entire choice
            behind a click and gave no hint that only one could be picked. */}
        <RadioGroup
          value={clickup.routingMode}
          onChange={(v) => setClickup(c => ({ ...c, routingMode: v === 'inbox' ? 'inbox' : 'department' }))}
          options={[
            { value: 'department', label: t('settings.clickupRoutingDepartment') },
            { value: 'inbox', label: t('settings.clickupRoutingInbox') },
          ]}
          label={t('settings.clickupRouting')}
        />
      </FieldWrapper>
      {clickupListsStale && (
        <div className={css.listsWarn} role="status">{t('departments.clickupListsLimited')}</div>
      )}
      <FieldWrapper label={t('settings.clickupFallbackList')}>
        <Select
          value={clickup.fallbackListId}
          placeholder={t('departments.clickupPick')}
          options={[
            { value: '', label: t('departments.clickupNoList') },
            ...clickupLists.map(l => ({ value: l.listId, label: l.label })),
          ]}
          onChange={v => setClickup(c => ({ ...c, fallbackListId: v }))}
        />
      </FieldWrapper>
      <div className={css.hint}>{t('settings.clickupFallbackListHint')}</div>
      <Toggle label={t('settings.clickupPersonalRouting')} value={clickup.personalRouting} onChange={v => setClickup(c => ({ ...c, personalRouting: v }))} />
      <div className={css.hint}>{t('settings.clickupPersonalHint')}</div>
      <div className={css.hint}>{t('settings.clickupHint')}</div>
      {clickup.enabled && clickup.tokenSet && (
        <div className={css.fallbackBox} style={{
          color: clickupFallback && clickupFallback.last30d > 0 ? 'var(--amber, #d99a2b)' : 'var(--muted)',
        }}>
          {clickupFallbackLoading
            ? <><Loader2 size={13} className={css.spin} /> {t('settings.clickupFallbackChecking')}</>
            : clickupFallback
              ? (clickupFallback.last30d > 0
                ? t('settings.clickupFallbackActive', { count: clickupFallback.last30d, name: clickupFallback.listName })
                : t('settings.clickupFallbackEmpty', { name: clickupFallback.listName, total: clickupFallback.total }))
              : null}
        </div>
      )}
      {clickup.migration?.state && (
        <div className={css.msg12} style={{ color: clickup.migration.state === 'error' ? 'var(--danger-fg)' : 'var(--muted)' }}>
          {clickup.migration.state === 'running'
            ? t('settings.clickupMigrating', { done: clickup.migration.migrated ?? 0, total: clickup.migration.total ?? 0 })
            : clickup.migration.state === 'done'
              ? t('settings.clickupMigrated', { count: clickup.migration.migrated ?? 0 })
              : t('settings.clickupMigrationError')}
        </div>
      )}
      <div className={css.actions}>
        <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveClickup} disabled={clickupSaving}>
          {clickupSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
        </button>
        <button className={`btn btn-sm ${css.btnIco}`} onClick={testClickup} disabled={clickupTesting || (!clickup.tokenSet && !clickupToken.trim())}>
          {clickupTesting ? <Loader2 size={13} className={css.spin} /> : <Check size={13} />} {t('settings.testConnection')}
        </button>
        {clickupSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
        {clickupTest && <span className={css.resultMsg} style={{ color: clickupTest.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{clickupTest.msg}</span>}
      </div>
    </div>
  );

  const renderLinearModal = () => (
    <div className={css.stack14}>
      <Toggle label={t('settings.linearEnabled')} value={linear.enabled} onChange={v => setLinear(c => ({ ...c, enabled: v }))} />
      <FieldWrapper label={linear.tokenSet ? t('settings.linearTokenSet') : t('settings.linearToken')}>
        <input className={`field ${css.monoField}`} type="password" value={linearToken} placeholder={linear.tokenSet ? '••••••••••••' : 'lin_api_...'}
          onChange={e => setLinearToken(e.target.value)} />
      </FieldWrapper>
      <FieldWrapper label={t('settings.linearRouting')}>
        {/* Two answers, so both are shown. A dropdown here hid the entire choice
            behind a click and gave no hint that only one could be picked. */}
        <RadioGroup
          value={linear.routingMode}
          onChange={(v) => setLinear(c => ({ ...c, routingMode: v === 'inbox' ? 'inbox' : 'department' }))}
          options={[
            { value: 'department', label: t('settings.linearRoutingDepartment') },
            { value: 'inbox', label: t('settings.linearRoutingInbox') },
          ]}
          label={t('settings.linearRouting')}
        />
      </FieldWrapper>
      <div className={css.hint}>{t('settings.linearHint')}</div>
      {linear.migration?.state && (
        <div className={css.msg12} style={{ color: linear.migration.state === 'error' ? 'var(--danger-fg)' : 'var(--muted)' }}>
          {linear.migration.state === 'running'
            ? t('settings.clickupMigrating', { done: linear.migration.migrated ?? 0, total: linear.migration.total ?? 0 })
            : linear.migration.state === 'done'
              ? t('settings.clickupMigrated', { count: linear.migration.migrated ?? 0 })
              : t('settings.clickupMigrationError')}
        </div>
      )}
      <div className={css.actions}>
        <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveLinear} disabled={linearSaving}>
          {linearSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
        </button>
        <button className={`btn btn-sm ${css.btnIco}`} onClick={testLinear} disabled={linearTesting || (!linear.tokenSet && !linearToken.trim())}>
          {linearTesting ? <Loader2 size={13} className={css.spin} /> : <Check size={13} />} {t('settings.testConnection')}
        </button>
        {linearSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
        {linearTest && <span className={css.resultMsg} style={{ color: linearTest.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{linearTest.msg}</span>}
      </div>
    </div>
  );

  const renderChatModal = () => {
    const isTelegram = chat.provider === 'telegram';
    return (
      <div className={css.stack14}>
        <Toggle label={t('settings.chatEnabled')} value={chat.enabled} onChange={v => setChat(c => ({ ...c, enabled: v }))} />
        <FieldWrapper label={t('settings.chatProvider')}>
          <Select
            value={chat.provider}
            onChange={(v) => setChat(c => ({ ...c, provider: v }))}
            options={[
              { value: 'telegram', label: 'Telegram' },
              { value: 'slack', label: 'Slack' },
              { value: 'mattermost', label: 'Mattermost' },
              { value: 'discord', label: 'Discord' },
            ]}
          />
        </FieldWrapper>
        {isTelegram ? (
          <>
            <FieldWrapper label={chat.botTokenSet ? t('settings.chatBotTokenSet') : t('settings.chatBotToken')}>
              <input className={`field ${css.monoField}`} type="password" value={chatBotToken} placeholder={chat.botTokenSet ? '••••••••••••' : '123456:ABC-…'}
                onChange={e => setChatBotToken(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label={t('settings.chatChatId')}>
              <input className={`field ${css.monoField}`} value={chat.chatId} placeholder="-1001234567890"
                onChange={e => setChat(c => ({ ...c, chatId: e.target.value }))} />
            </FieldWrapper>
          </>
        ) : (
          <FieldWrapper label={chat.webhookSet ? t('settings.chatWebhookSet') : t('settings.chatWebhook')}>
            <input className={`field ${css.monoField}`} type="password" value={chatWebhook} placeholder={chat.webhookSet ? '••••••••••••' : 'https://…'}
              onChange={e => setChatWebhook(e.target.value)} />
          </FieldWrapper>
        )}
        <div className={css.hint}>{t('settings.chatHint')}</div>
        <div className={css.actions}>
          <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveChat} disabled={chatSaving}>
            {chatSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
          </button>
          <button className={`btn btn-sm ${css.btnIco}`} onClick={testChat} disabled={chatTesting || (isTelegram ? (!chat.botTokenSet && !chatBotToken.trim()) : (!chat.webhookSet && !chatWebhook.trim()))}>
            {chatTesting ? <Loader2 size={13} className={css.spin} /> : <MessageSquare size={13} />} {t('settings.sendTest')}
          </button>
          {chatSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
          {chatTestRes && <span className={css.resultMsg} style={{ color: chatTestRes.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{chatTestRes.msg}</span>}
        </div>
      </div>
    );
  };

  const renderAiModal = () => {
    const keyless = !!aiPresets[ai.provider]?.keyless;
    const selModel = aiModels.find(m => m.id === ai.model);
    const modelMax = selModel?.maxOutput || null;
    const showSelect = aiModels.length > 0 && !aiCustom;
    // A saved/custom model id not present in the fetched list still needs an option.
    const extraModel = ai.model && !aiModels.some(m => m.id === ai.model) ? ai.model : '';
    const fmtTok = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
    return (
      <div className={css.stack14}>
        <FieldWrapper label={t('settings.aiProvider')}>
          <Select
            value={ai.provider}
            onChange={(p) => { const pr = aiPresets[p]; setAi(a => ({ ...a, provider: p, baseUrl: pr?.baseUrl || '', model: pr?.model || '' })); setAiTestRes(null); setAiModels([]); setAiModelsErr(''); setAiCustom(false); }}
            options={Object.entries(aiPresets).map(([k, v]) => ({ value: k, label: v.label }))}
          />
        </FieldWrapper>
        {!keyless && (
          <FieldWrapper label={ai.apiKeySet ? t('settings.aiKeySet') : t('settings.aiKey')}>
            <input className={`field ${css.monoField}`} type="password" value={aiKey} placeholder={ai.apiKeySet ? '••••••••••••' : 'sk-…'}
              onChange={e => setAiKey(e.target.value)} />
          </FieldWrapper>
        )}
        <FieldWrapper label={t('settings.aiBaseUrl')}>
          <input className={`field ${css.monoField}`} value={ai.baseUrl} placeholder="https://api.deepseek.com"
            onChange={e => setAi(a => ({ ...a, baseUrl: e.target.value }))} />
        </FieldWrapper>
        <FieldWrapper label={t('settings.aiModel')}>
          <div className={css.rowGap8}>
            {showSelect ? (
              /* OpenRouter alone returns hundreds of models, which a plain dropdown
                 makes searchable only by scrolling. Typing filters the list. */
              <div className={css.grow1}>
                <Combobox
                  value={ai.model}
                  onChange={(v) => { if (v === '__custom') { setAiCustom(true); } else { setAi(a => ({ ...a, model: v })); } }}
                  placeholder={t('settings.aiModelPick')}
                  className="mono"
                  options={[
                    ...(extraModel ? [{ value: extraModel, label: extraModel }] : []),
                    ...aiModels.map(m => ({
                      value: m.id,
                      label: `${m.id}${m.maxOutput ? ` — ${fmtTok(m.maxOutput)} max` : m.contextLength ? ` — ${fmtTok(m.contextLength)} ctx` : ''}`,
                    })),
                    { value: '__custom', label: t('settings.aiModelCustom') },
                  ]}
                />
              </div>
            ) : (
              <input className={`field ${css.monoFieldFlex}`} value={ai.model} placeholder="deepseek-chat"
                onChange={e => setAi(a => ({ ...a, model: e.target.value }))} />
            )}
            <button className={`btn btn-sm ${css.btnIcoFixed}`} onClick={loadAiModels} disabled={aiModelsLoading || (!keyless && !ai.apiKeySet && !aiKey.trim())} title={t('settings.aiLoadModels')}>
              {aiModelsLoading ? <Loader2 size={13} className={css.spin} /> : <Download size={13} />} {t('settings.aiLoadModels')}
            </button>
          </div>
          {aiModels.length > 0 && !aiCustom && <div className={css.noteSm}>{t('settings.aiModelsLoaded', { count: aiModels.length })}</div>}
          {aiModels.length > 0 && aiCustom && <button className={`btn btn-ghost ${css.linkBtn}`} onClick={() => setAiCustom(false)}>{t('settings.aiModelFromList')}</button>}
          {aiModelsErr && <div className={css.errSm}>{aiModelsErr}</div>}
        </FieldWrapper>
        <FieldWrapper label={t('settings.aiMaxTokens')}>
          <input className={`field ${css.monoField}`} type="number" min={0} value={ai.maxTokens} placeholder={t('settings.aiMaxTokensAuto')}
            onChange={e => setAi(a => ({ ...a, maxTokens: e.target.value }))} />
          {modelMax && (
            <div className={css.noteSmRow}>
              {t('settings.aiModelMax', { n: modelMax.toLocaleString() })}
              <button className={`btn btn-ghost ${css.linkBtnInline}`} onClick={() => setAi(a => ({ ...a, maxTokens: String(modelMax) }))}>{t('settings.aiUseMax')}</button>
            </div>
          )}
        </FieldWrapper>
        <div className={css.hint}>{t('settings.aiHint')}</div>
        <div className={css.actions}>
          <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveAi} disabled={aiSaving}>
            {aiSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
          </button>
          <button className={`btn btn-sm ${css.btnIco}`} onClick={testAi} disabled={aiTesting || (!keyless && !ai.apiKeySet && !aiKey.trim())}>
            {aiTesting ? <Loader2 size={13} className={css.spin} /> : <Check size={13} />} {t('settings.testConnection')}
          </button>
          {aiSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
          {aiTestRes && <span className={css.resultMsg} style={{ color: aiTestRes.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{aiTestRes.msg}</span>}
        </div>
      </div>
    );
  };

  const renderWebhooksModal = () => (
    <div className={css.stack14}>
      <div className={css.hint}>{t('settings.webhooksHint')}</div>

      {webhooks.length === 0 && (
        <div className={css.emptyNote}>{t('settings.webhookNoEndpoints')}</div>
      )}

      {webhooks.map(row => (
        <div key={row.key} className={css.whRow}>
          <div className={css.rowGap8Center}>
            <input className={`field ${css.monoFieldFlex}`} value={row.url} placeholder="https://hooks.zapier.com/…"
              onChange={e => patchWebhook(row.key, { url: e.target.value })} />
            <button className={`btn btn-ghost btn-icon ${css.iconBtn32} ${css.noShrink}`} onClick={() => removeWebhook(row.key)} aria-label={t('common.delete')} title={t('common.delete')}><Trash2 size={15} /></button>
          </div>
          <FieldWrapper label={row.secretSet ? t('settings.webhookSecretSet') : t('settings.webhookSecret')}>
            <input className={`field ${css.monoField}`} type="password" value={row.secret} placeholder={row.secretSet ? '••••••••••••' : 'whsec_…'}
              onChange={e => patchWebhook(row.key, { secret: e.target.value })} />
          </FieldWrapper>
          <div>
            <div className={css.whLabel}>{t('settings.webhookEvents')}</div>
            <div className={css.chipWrap}>
              {webhookEvents.map(ev => {
                const on = row.events.includes(ev);
                return (
                  <button key={ev} type="button" onClick={() => toggleWebhookEvent(row.key, ev)} className={`mono ${css.evChip}`}
                    style={{
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                      color: on ? 'var(--accent-2)' : 'var(--muted)',
                    }}>{ev}</button>
                );
              })}
            </div>
            {row.events.length === 0 && <div className={css.noteXs}>{t('settings.webhookAllEvents')}</div>}
          </div>
          <div className={css.rowBetweenWrap}>
            <Toggle label={t('settings.webhookEnabled')} value={row.enabled} onChange={v => patchWebhook(row.key, { enabled: v })} />
            <div className={css.inlineRow10}>
              {webhookTestRes && webhookTestRes.id === row.key && <span className={css.msg12} style={{ color: webhookTestRes.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{webhookTestRes.msg}</span>}
              <button className={`btn btn-sm ${css.btnIco}`} onClick={() => testWebhook(row)} disabled={webhookTestingId === row.id || !row.url.trim()}>
                {webhookTestingId === row.id ? <Loader2 size={13} className={css.spin} /> : <Webhook size={13} />} {t('settings.sendTest')}
              </button>
            </div>
          </div>
        </div>
      ))}

      <button className={`btn btn-sm ${css.btnIcoStart}`} onClick={addWebhook}>
        <Plus size={14} /> {t('settings.webhookAddEndpoint')}
      </button>

      <div className={css.actionsTop}>
        <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveWebhooks} disabled={webhooksSaving}>
          {webhooksSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
        </button>
        {webhooksSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
      </div>
    </div>
  );

  const renderCrmModal = () => (
    <div className={css.stack14}>
      <Toggle label={t('settings.crmEnabled')} value={crm.enabled} onChange={v => setCrm(c => ({ ...c, enabled: v }))} />
      <FieldWrapper label={t('settings.crmProvider')}>
        <Select
          value={crm.provider}
          onChange={(v) => setCrm(c => ({ ...c, provider: v }))}
          options={[{ value: 'hubspot', label: 'HubSpot' }]}
        />
      </FieldWrapper>
      <FieldWrapper label={crm.tokenSet ? t('settings.crmTokenSet') : t('settings.crmToken')}>
        <input className={`field ${css.monoField}`} type="password" value={crmToken} placeholder={crm.tokenSet ? '••••••••••••' : 'pat-…'}
          onChange={e => setCrmToken(e.target.value)} />
      </FieldWrapper>
      <Toggle label={t('settings.crmCreateContact')} value={crm.createContact} onChange={v => setCrm(c => ({ ...c, createContact: v }))} />
      <div className={css.hint}>{t('settings.crmHint')}</div>
      <div className={css.actions}>
        <button className={`btn btn-primary btn-sm ${css.btnIco}`} onClick={saveCrm} disabled={crmSaving}>
          {crmSaving ? <Loader2 size={13} className={css.spin} /> : <Save size={13} />} {t('common.save')}
        </button>
        <button className={`btn btn-sm ${css.btnIco}`} onClick={testCrm} disabled={crmTesting || (!crm.tokenSet && !crmToken.trim())}>
          {crmTesting ? <Loader2 size={13} className={css.spin} /> : <Check size={13} />} {t('settings.testConnection')}
        </button>
        {crmSaved && <span className={css.savedNote}><Check size={13} /> {t('common.saved')}</span>}
        {crmTest && <span className={css.resultMsg} style={{ color: crmTest.ok ? 'var(--green)' : 'var(--danger-fg)' }}>{crmTest.msg}</span>}
      </div>
    </div>
  );

  const renderModalBody = (name: string) => {
    switch (name) {
      case 'Deepgram': return renderKeysModal('Deepgram');
      case 'AI model': return renderAiModal();
      case 'SMTP Email': return renderSmtpModal();
      case 'S3 Storage': return renderS3Modal();
      case 'ClickUp': return renderClickupModal();
      case 'Linear': return renderLinearModal();
      case 'Google OAuth': return renderGoogleModal();
      case 'Chat': return renderChatModal();
      case 'Webhooks': return renderWebhooksModal();
      case 'CRM': return renderCrmModal();
      default: return null;
    }
  };

  const current = manage ? integrations.find(i => i.name === manage) : null;

  return (
    <div className={css.wrap}>
      <div className={css.subtitle}>{t('settings.connectorsSubtitle')}</div>

      {/* Connector grid */}
      {integrations.length === 0 ? (
        <div className={css.checking}>{t('settings.checkingIntegrations')}</div>
      ) : (
        <div className={css.grid}>
          {integrations.map((it) => {
            const connected = it.status === 'connected';
            const manageable = MANAGEABLE.has(it.name);
            const open = manageable ? () => setManage(it.name) : undefined;
            return (
              <div key={it.name} className={`card ${css.connCard}`}
                onClick={open}
                role={manageable ? 'button' : undefined}
                tabIndex={manageable ? 0 : undefined}
                onKeyDown={manageable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setManage(it.name); } } : undefined}
                style={{ cursor: manageable ? 'pointer' : 'default' }}
                onMouseEnter={manageable ? (e) => { e.currentTarget.style.borderColor = 'var(--border-2, #3f3f46)'; e.currentTarget.style.transform = 'translateY(-1px)'; } : undefined}
                onMouseLeave={manageable ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; } : undefined}
              >
                <div className={css.connHead}>
                  <div className={css.connIcon} style={{
                    background: connected ? 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))' : 'var(--surface-2)',
                    color: connected ? 'var(--accent-2)' : 'var(--muted)',
                  }}>{INTEGRATION_ICONS[it.name] ?? <Plug size={20} />}</div>
                  <div className={css.grow}>
                    <div className={css.connName}>{it.name}</div>
                    <div className={css.connDesc}>{it.desc}</div>
                  </div>
                </div>
                <div className={css.connFoot}>
                  {statusPill(it.status)}
                  {manageable ? (
                    <button className={`btn btn-sm ${css.btnIco5}`} onClick={(e) => { e.stopPropagation(); setManage(it.name); }}>
                      {connected ? <><Settings2 size={12} /> {t('settings.manage')}</> : <><Plug size={12} /> {t('settings.connect')}</>}
                    </button>
                  ) : (
                    it.metric && <span className={`mono ${css.metric}`}>{it.metric}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config modal */}
      {manage && current && (
        <div onClick={() => setManage(null)}
          className={css.overlay} style={{ background: 'rgba(3,5,8,.6)' }}>
          <div onClick={(e) => e.stopPropagation()} className={`card ${css.modal}`}>
            <div className={css.modalHead}>
              <div className={css.modalIcon} style={{
                background: current.status === 'connected' ? 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))' : 'var(--surface-2)',
                color: current.status === 'connected' ? 'var(--accent-2)' : 'var(--muted)',
              }}>{INTEGRATION_ICONS[current.name]}</div>
              <div className={css.grow}>
                <div className={css.modalName}>{current.name}</div>
                <div className={css.modalDesc}>{current.desc}</div>
              </div>
              <button className={`btn btn-ghost btn-icon ${css.iconBtn32}`} onClick={() => setManage(null)} aria-label={t('common.close')}><X size={16} /></button>
            </div>
            <div className={css.modalBody}>{renderModalBody(current.name)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
