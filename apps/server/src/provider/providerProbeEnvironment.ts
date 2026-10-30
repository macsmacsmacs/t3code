/**
 * Marks a provider spawn that only inspects local state and never sends a model request.
 * Binary-path wrappers that mint a credential per launch can skip minting when it is set.
 */
export const withProviderProbeMarker = (
  environment: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv => ({
  ...(environment ?? process.env),
  T3CODE_PROVIDER_PROBE: "1",
});
