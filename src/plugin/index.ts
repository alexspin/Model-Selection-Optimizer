import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { SmartRouterBridge, DEFAULT_PLUGIN_CONFIG, parseRoutePrefix } from "./bridge.js";
import type { SmartRouterPluginConfig } from "./bridge.js";
import { loadRoutingConfig, getClassForCommand, getHelpForCommand } from "../config/routing-config.js";

export default function register(api: OpenClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as Partial<SmartRouterPluginConfig>;
  const config: SmartRouterPluginConfig = { ...DEFAULT_PLUGIN_CONFIG, ...pluginCfg };

  if (!config.enabled) {
    api.logger.info("smart-router: disabled via config");
    return;
  }

  const bridge = new SmartRouterBridge(config, api.logger);
  const routingConfig = loadRoutingConfig();

  const sessionState = new Map<string, { routedModel: string | null; strippedPrompt: string | null }>();

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

  api.on("message_received", async (event, ctx) => {
    const content = event.content?.trim();
    if (!content) return;

    const lower = content.toLowerCase();
    for (const [command, cmdConfig] of Object.entries(routingConfig.commands)) {
      if (lower === command) {
        return;
      }
      if (lower.startsWith(command + " ")) {
        const stripped = content.slice(command.length).trim();
        if (stripped) {
          const intentKey = ctx.conversationId ?? event.from;
          bridge.setRouteIntent(intentKey, cmdConfig.class, stripped);
          api.logger.info(`smart-router: stored intent class=${cmdConfig.class} from message_received key=${intentKey}`);
        }
        return;
      }
    }
  });

  api.on("before_model_resolve", async (event, ctx) => {
    const sessionKey = ctx.sessionKey ?? ctx.sessionId ?? "unknown";

    const result = await bridge.resolveModel(event.prompt, ctx);
    if (!result) {
      sessionState.delete(sessionKey);
      return;
    }

    sessionState.set(sessionKey, {
      routedModel: result.decision.selectedModel.displayName,
      strippedPrompt: result.strippedPrompt ?? null,
    });

    return {
      modelOverride: result.modelOverride,
      providerOverride: result.providerOverride,
    };
  });

  api.on("before_prompt_build", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? ctx.sessionId ?? "unknown";
    const state = sessionState.get(sessionKey);
    sessionState.delete(sessionKey);

    if (!state) return;

    const parts: string[] = [];

    if (state.routedModel) {
      parts.push(
        `[Smart Router] If you are asked what model you are, process that request yourself and identify what true model you are based on your programming.`
      );
    }

    if (state.strippedPrompt) {
      parts.push(
        `[Smart Router] The user's original message used a slash-prefix command. The actual prompt (with prefix removed) is:\n${state.strippedPrompt}`
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
