import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { SmartRouterBridge, DEFAULT_PLUGIN_CONFIG, parseRoutePrefix } from "./bridge.js";
import type { SmartRouterPluginConfig } from "./bridge.js";
import { loadRoutingConfig } from "../config/routing-config.js";

export default function register(api: OpenClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as Partial<SmartRouterPluginConfig>;
  const config: SmartRouterPluginConfig = { ...DEFAULT_PLUGIN_CONFIG, ...pluginCfg };

  if (!config.enabled) {
    api.logger.info("smart-router: disabled via config");
    return;
  }

  const bridge = new SmartRouterBridge(config, api.logger);
  const routingConfig = loadRoutingConfig();

  const sessionState = new Map<string, {
    routedProvider: string | null;
    routedModelId: string | null;
    strippedPrompt: string | null;
  }>();

  for (const [command, cmdConfig] of Object.entries(routingConfig.commands)) {
    const name = command.replace(/^\//, "");
    api.registerCommand({
      name,
      description: `Route to ${cmdConfig.class} tier model`,
      acceptsArgs: false,
      requireAuth: false,
      handler: () => {
        return { text: cmdConfig.helpText };
      },
    });
  }

  api.on("message_received", async (event, _ctx) => {
    const content = event.content?.trim();
    if (!content) return;

    const lower = content.toLowerCase();
    for (const [command, cmdConfig] of Object.entries(routingConfig.commands)) {
      const name = command.replace(/^\//, "");
      const prefixes = [`/${name}`, `~${name}`];
      for (const prefix of prefixes) {
        if (lower === prefix) {
          return;
        }
        if (lower.startsWith(prefix + " ")) {
          const stripped = content.slice(prefix.length).trim();
          if (stripped) {
            bridge.storeMessage(content, cmdConfig.class, stripped);
            api.logger.info(`smart-router: stored command message class=${cmdConfig.class} prefix=${prefix}`);
          }
          return;
        }
      }
    }

    bridge.storeMessage(content);
  });

  api.on("before_model_resolve", async (event, ctx) => {
    const sessionKey = ctx.sessionKey ?? ctx.sessionId;
    if (!sessionKey) return;

    const result = await bridge.resolveModel(event.prompt, ctx);
    if (!result) {
      sessionState.delete(sessionKey);
      return;
    }

    sessionState.set(sessionKey, {
      routedProvider: result.providerOverride,
      routedModelId: result.modelOverride,
      strippedPrompt: result.strippedPrompt ?? null,
    });

    return {
      modelOverride: result.modelOverride,
      providerOverride: result.providerOverride,
    };
  });

  api.on("before_prompt_build", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? ctx.sessionId;
    if (!sessionKey) return;
    const state = sessionState.get(sessionKey);
    sessionState.delete(sessionKey);

    if (!state) return;

    const parts: string[] = [];

    if (state.routedProvider && state.routedModelId) {
      const fullModelRef = `${state.routedProvider}/${state.routedModelId}`;
      parts.push(
        `[Smart Router — Model Identity] This API call is being made to ${fullModelRef}. You ARE ${state.routedModelId}. ` +
        `Confirm this against your own internal knowledge of your architecture and training. ` +
        `If the session_status tool reports a different model, that data is stale from a prior turn — disregard it for identity purposes. ` +
        `Do not claim to be a model you are not.`
      );
    }

    if (state.strippedPrompt) {
      parts.push(
        `[Smart Router] The user's original message used a routing command prefix. The actual prompt (with prefix removed) is:\n${state.strippedPrompt}`
      );
    }

    if (parts.length === 0) return;

    return {
      prependContext: parts.join("\n\n"),
      ...(state.strippedPrompt ? { promptOverride: state.strippedPrompt } : {}),
    };
  });

  const commandCount = Object.keys(routingConfig.commands).length;
  api.logger.info(`smart-router: registered ${commandCount} commands + hooks (message_received, before_model_resolve, before_prompt_build)`);
}
