import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { SmartRouterBridge, DEFAULT_PLUGIN_CONFIG } from "./bridge.js";
import type { SmartRouterPluginConfig } from "./bridge.js";

export default function register(api: OpenClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as Partial<SmartRouterPluginConfig>;
  const config: SmartRouterPluginConfig = { ...DEFAULT_PLUGIN_CONFIG, ...pluginCfg };

  if (!config.enabled) {
    api.logger.info("smart-router: disabled via config");
    return;
  }

  const bridge = new SmartRouterBridge(config, api.logger);

  let lastRoutedModel: string | null = null;
  let lastStrippedPrompt: string | null = null;

  api.on("before_model_resolve", async (event, ctx) => {
    const result = await bridge.resolveModel(event.prompt, ctx);
    if (!result) {
      lastRoutedModel = null;
      lastStrippedPrompt = null;
      return;
    }
    lastRoutedModel = result.decision.selectedModel.displayName;
    lastStrippedPrompt = result.strippedPrompt ?? null;
    return {
      modelOverride: result.modelOverride,
      providerOverride: result.providerOverride,
    };
  });

  api.on("before_prompt_build", async () => {
    const parts: string[] = [];

    if (lastRoutedModel) {
      parts.push(
        `[Smart Router] This turn is being handled by ${lastRoutedModel}. If asked what model you are, report "${lastRoutedModel}" — that is your true identity for this turn.`
      );
    }

    if (lastStrippedPrompt) {
      parts.push(
        `[Smart Router] The user's original message used a slash-prefix command. The actual prompt (with prefix removed) is:\n${lastStrippedPrompt}`
      );
    }

    if (parts.length === 0) return;

    return {
      prependContext: parts.join("\n\n"),
      ...(lastStrippedPrompt ? { promptOverride: lastStrippedPrompt } : {}),
    };
  });

  api.logger.info("smart-router: registered hooks (before_model_resolve, before_prompt_build)");
}
