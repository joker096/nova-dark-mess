/**
 * Local plugin system for Phase 8 self-hosted add-ons.
 *
 * Plugins are local-only: they run in the same process as the app and can
 * observe/app events through a typed event bus. A plugin may optionally send
 * webhooks to a user-configured local URL. Nothing is ever sent to a remote
 * server unless the user explicitly configures a webhook endpoint.
 *
 * The plugin host is intentionally minimal: register plugins, emit events,
 * and plugins react. No sandboxing, no code download, no remote execution.
 * This is a building block for user-run signaling/relay gateways and local
 * automation, documented but never required by the app.
 */

export type PluginEvent =
  | { type: 'message:send'; chatId: string; messageId: string; timestamp: number }
  | { type: 'message:receive'; chatId: string; messageId: string; timestamp: number }
  | { type: 'contact:add'; contactId: string; timestamp: number }
  | { type: 'contact:remove'; contactId: string; timestamp: number }
  | { type: 'call:start'; callId: string; peerId: string; timestamp: number }
  | { type: 'call:end'; callId: string; durationMs: number; timestamp: number }
  | { type: 'file:transfer'; transferId: string; fileName: string; bytes: number; timestamp: number }
  | { type: 'backup:create'; backupId: string; timestamp: number }
  | { type: 'backup:restore'; backupId: string; timestamp: number }
  | { type: 'pin:set'; timestamp: number }
  | { type: 'pin:remove'; timestamp: number }
  | { type: 'session:lock'; timestamp: number }
  | { type: 'session:unlock'; timestamp: number };

export interface PluginContext {
  /** Send a webhook POST to a user-configured local URL. Returns false if no
   * webhook URL is configured or the fetch fails. */
  webhook: (path: string, body: unknown) => Promise<boolean>;
  /** Read a plugin-specific config value from local storage. */
  getConfig: (key: string) => string | null;
  /** Write a plugin-specific config value to local storage. */
  setConfig: (key: string, value: string) => void;
}

export interface Plugin {
  /** Human-readable plugin name. */
  name: string;
  /** Optional version string. */
  version?: string;
  /** Called once when the plugin is registered. Receives the plugin context. */
  onRegister?: (ctx: PluginContext) => void | Promise<void>;
  /** Called when any tracked event occurs. */
  onEvent?: (event: PluginEvent) => void | Promise<void>;
  /** Called when the plugin is unregistered. */
  onUnregister?: () => void | Promise<void>;
}

/** Result of registering a plugin. */
export interface PluginHandle {
  /** Plugin name. */
  name: string;
  /** Unregister the plugin and clean up its state. */
  unregister: () => void;
}

/**
 * Creates a plugin host. The host manages plugin lifecycle and event dispatch.
 * Webhook delivery is delegated to a caller-supplied fetch function so the
 * host stays transport-agnostic (fetch in the browser, Tauri invoke, etc.).
 */
export function createPluginHost(options: {
  /** Fetch function used for webhook delivery. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Base URL prepended to webhook paths. Defaults to empty (path used as-is). */
  webhookBaseUrl?: string;
} = {}): {
  register: (plugin: Plugin) => PluginHandle;
  /** Get all registered plugin names. */
  list: () => string[];
  /** Emit an event to all registered plugins. */
  emit: (event: PluginEvent) => Promise<void>;
  /** Get the plugin context for a specific plugin (for config access). */
  context: (pluginName: string) => PluginContext | null;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const webhookBaseUrl = options.webhookBaseUrl ?? '';

  const plugins = new Map<string, Plugin>();
  const pluginConfigs = new Map<string, Map<string, string>>();

  async function deliverWebhook(path: string, body: unknown): Promise<boolean> {
    const url = webhookBaseUrl ? `${webhookBaseUrl}${path}` : path;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function contextFor(pluginName: string): PluginContext | null {
    const plugin = plugins.get(pluginName);
    if (!plugin) return null;
    let cfg = pluginConfigs.get(pluginName);
    if (!cfg) {
      cfg = new Map();
      pluginConfigs.set(pluginName, cfg);
    }
    return {
      webhook: (path, body) => deliverWebhook(path, body),
      getConfig: (key) => cfg.get(key) ?? null,
      setConfig: (key, value) => cfg.set(key, value),
    };
  }

  async function emit(event: PluginEvent): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const plugin of plugins.values()) {
      if (plugin.onEvent) {
        // Individual plugin errors are swallowed so one misbehaving plugin
        // cannot break event delivery to the others.
        promises.push(
          Promise.resolve()
            .then(() => plugin.onEvent!(event))
            .catch(() => undefined),
        );
      }
    }
    await Promise.all(promises);
  }

  function register(plugin: Plugin): PluginHandle {
    if (plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }
    plugins.set(plugin.name, plugin);

    const ctx = contextFor(plugin.name);
    if (plugin.onRegister && ctx) {
      plugin.onRegister(ctx);
    }

    return {
      name: plugin.name,
      unregister: () => {
        if (plugin.onUnregister) {
          plugin.onUnregister();
        }
        plugins.delete(plugin.name);
        pluginConfigs.delete(plugin.name);
      },
    };
  }

  return { register, list: () => Array.from(plugins.keys()), emit, context: contextFor };
}

export type PluginHost = ReturnType<typeof createPluginHost>;
