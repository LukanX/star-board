# OpenRouter Image Generation Incident Handoff

**Updated:** 2026-09-26

**Status:** The reported failures are local to Windows development with the VPN enabled; the user reports the affected generators worked with the VPN disabled. Using the app with the VPN off is the accepted workaround. The exact network component that closed the connection is unknown. No paid diagnostic reproduction or deployment has been performed.

**Worktree:** Related implementation changes were committed on branch `improve-notes`; this handoff is currently untracked. No deployment was performed.

## User Impact

- Campaign GMs initially could not see image-model pricing. The art UI also offered pixel dimensions that some OpenRouter models reject; the implementation changes below address these issues.
- In local Windows development, Grok Imagine Image 2.0 and Seedream 5.0 Pro calls were reported failing after roughly 60 seconds with `UND_ERR_SOCKET` while the VPN was enabled. The user reports the affected generators worked after switching the VPN off. No deployed Netlify failure has been reported.
- The user initially suspected a Seedream 5.0 Pro attempt charged about $0.05. A later OpenRouter Activity check found no matching failed-attempt charge; the amount is unconfirmed.
- GPT Image 2.5 Sunburst, MAI Image 2.6, Qwen Image 3 Pro, and Seedream 5.0 Lite were reported working in the latest comparison. An earlier local log did capture a Qwen 3 Pro socket failure, so the symptoms may be intermittent rather than strictly model-specific.

## Findings

### Image Model Requests

- The initial Grok error was explicit: xAI rejected an exact pixel `size` alongside `resolution` and `aspect_ratio`. The request builder was changed to send model-supported fields only. Grok and Seedream now use `aspect_ratio` plus a 1K resolution tier; exact pixel labels and selection were removed from the art UI.
- GPT Image 2.5 Flare advertises aspect ratio but not exact size or output format. It receives aspect ratio only; Star Board cannot guarantee its output dimensions.
- OpenRouter's current endpoint records list Grok Image 2.0 and Seedream 5.0 Pro, their supported resolution/aspect-ratio values, and `supports_streaming: false`.
- Requests for the remaining working image models succeeded locally, so campaign access and the shared art workflow can work. The user's VPN-on/VPN-off comparison makes the VPN-dependent network path the current practical trigger, but does not identify the specific component or mechanism.

### Socket and Billing Evidence

- Local dev logs report `POST /api/ai/image` taking about 60 seconds for the affected calls. The user reports that the affected generators worked after disabling the VPN; this observation is limited to local Windows development.
- The observed Undici error was `UND_ERR_SOCKET`: Grok reported 4,247 bytes sent/7,523 received; Seedream Pro reported 4,255 sent/7,552 received. Neither had a completed HTTP status nor an OpenRouter request ID. Byte counts do not establish that the generation completed or that those bytes contained a usable image.
- A non-billable GET to OpenRouter model endpoint metadata returned HTTP 200 from local Node 24.11.0. A POST to `/images` with an invalid diagnostic token returned HTTP 401. These checks confirm basic outbound connectivity and that the image endpoint is reachable; they do not reproduce a long-running authenticated generation.
- After the initial suspected-charge report, the user checked OpenRouter Activity and found no matching failed Seedream charge. The user separately identified a successful Star Board generation at 8:45am before API debugging, with Star Board run ID `gen-img-1790343938-Cya2mLGFILwX2drFMne0`. Its date and timezone were not provided. This successful run is not the failed attempt's request ID and does not establish whether the failed attempt was billed.
- Treat the earlier ~$0.05 report as unconfirmed, not as a verified charge. The absence of a matching Activity entry does not prove the outcome of every failed request.
- After the user reported the charge, the route behavior was clarified: an upstream response status is passed through; a socket failure with no HTTP status is returned as HTTP 502, not mislabeled as an OpenRouter 503.
- A fixed `outcomeUnknown` signal is set when `UND_ERR_SOCKET` occurs after bytes were written. The failed generation run stores a bounded warning to check OpenRouter activity. The art studio requires explicit confirmation before another attempt. Sync and Netlify background paths now share this behavior.
- No automatic retry is implemented. A retry could create another charge.
- OpenRouter's documented `GET /generation?id=...` endpoint returns usage/request metadata, not generated image bytes. This incident has no generation/request ID because the socket closed before an HTTP response. There is no documented way in the app to recover the missing image from that failed response.
- OpenRouter's image guide says models without `supports_streaming` cannot use native image SSE. Grok Image 2.0 and Seedream 5.0 Pro currently advertise streaming as false.

## Changes Already Made

- Added a GM-only image endpoint pricing lookup using OpenRouter `/images/models/{provider}/{model}/endpoints`; prices preserve provider, billable category, unit, and tier variant. The picker and GM settings load price details lazily.
- Preserved image parameter enums from model discovery and shaped requests for Grok, Flare, Seedream, and other models. The studio now offers supported aspect ratios and no longer asks for pixel dimensions.
- Kept older size-bearing art drafts, browser sessions, and signed background jobs readable.
- Added transport diagnostics that retain allowlisted socket codes and byte counts but omit remote addresses, prompts, credentials, and raw provider bodies.
- Mapped provider transport errors with no upstream HTTP status to 502. Real provider HTTP statuses remain unchanged.
- Added uncertain-billing state and explicit retry confirmation for both direct and background generation. The custom error-class `instanceof` check that once threw in the browser was replaced with the standard error `name` field.

## Validation

- Latest full Vitest run: **548 passed, 17 skipped**.
- Latest TypeScript check: passed.
- Latest full lint: zero errors; 13 existing warnings remain (navigation, raw `<img>`, and unused symbols in other code).
- Art-studio Playwright suite: **4 passed** with mocked image responses. After the final `Error.name` browser-runtime fix, the targeted background retry-guard test was rerun and passed (including auth setup).
- Webpack production build succeeded in the isolated `.next-playwright` directory before the small client `instanceof` follow-up. The live `.next` development output was intentionally left alone during that build.
- No live authenticated image generation was used to verify the fix.

## Next Session Checklist

1. **Use the accepted local workaround.** Run local image generation with the VPN disconnected. The observed VPN-on/VPN-off difference is local to Windows development; there is no reported Netlify reproduction.
2. **Keep the billing record precise.** The latest OpenRouter Activity check found no matching failed Seedream charge. The 8:45am successful Star Board run is separate and cannot be correlated to the failed call; its date and timezone are unknown. If a matching charge later appears, record its timestamp, timezone, model, provider, amount, and any request ID. Do not send an API key or raw prompt to support.
3. **If a failure recurs with the VPN off during normal use, check Activity before retrying.** Record only the timestamp/timezone, model, Star Board status and `Failure stage`, socket code and byte counts, runtime version, execution path, Activity result, and any actual request ID. Do not make another paid request solely for diagnostics.
4. **Investigate the local runtime/network only if failures recur with the VPN off.** Check the Next process runtime and non-secret proxy/network configuration. Do not log or paste secret environment values. If the VPN must later remain on, identify its client and use its documented support/bypass options rather than changing application timeouts.
5. **Do not raise timeouts as a presumed fix.** The sync client has a 2-minute timeout and the Netlify worker gets 12 minutes, while the reported local socket closure was around 60 seconds. The user-observed VPN-off workaround is the current actionable fix; the exact closer remains unknown.
6. **Do not enable native image streaming for these models.** Grok Image 2.0 and Seedream 5.0 Pro advertise `supports_streaming: false`. Keep the existing uncertain-outcome warning and explicit retry confirmation; do not add automatic retries.
7. **Escalate conditionally.** If a matching charge appears or failures continue with the VPN off, use the recorded non-sensitive diagnostics to decide whether to contact OpenRouter or investigate the local network path. Do not claim a completed-but-undelivered generation without provider evidence.

## Relevant Files

- [lib/ai/client.ts](../lib/ai/client.ts): model-shaped request body, HTTP parsing, and socket diagnostics.
- [lib/ai/errors.ts](../lib/ai/errors.ts): provider status mapping and the fixed uncertain-outcome message.
- [app/api/ai/image/route.ts](../app/api/ai/image/route.ts): sync generation error logging, failed-run audit write, and response status.
- [netlify/functions/generate-image-background.ts](../netlify/functions/generate-image-background.ts): background generation and uncertain-outcome persistence.
- [app/api/ai/image/[generationRunId]/route.ts](../app/api/ai/image/%5BgenerationRunId%5D/route.ts): background job failure status and uncertainty flag.
- [lib/ai/image-job-polling.ts](../lib/ai/image-job-polling.ts): background outcome propagation to the browser.
- [components/archive/AiArtStudio.tsx](../components/archive/AiArtStudio.tsx): visible error details, retry confirmation, and aspect-only art controls.
- [lib/ai/model-discovery.ts](../lib/ai/model-discovery.ts): model capabilities and parameter values.
- [lib/ai/image-pricing.ts](../lib/ai/image-pricing.ts): endpoint pricing lookup/cache.
- [tests/image-route.test.ts](../tests/image-route.test.ts), [tests/ai-client.test.ts](../tests/ai-client.test.ts), [tests/image-background-function.test.ts](../tests/image-background-function.test.ts), [tests/image-status-route.test.ts](../tests/image-status-route.test.ts), [tests/image-job-polling.test.ts](../tests/image-job-polling.test.ts), [tests/e2e/art-studio-session.spec.ts](../tests/e2e/art-studio-session.spec.ts): regressions and mocked workflows.

## References

- [OpenRouter image generation guide](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter generation metadata endpoint](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
- [Grok Image 2.0 endpoint records](https://openrouter.ai/api/v1/images/models/x-ai/grok-imagine-image-2.0/endpoints)
- [Seedream 5.0 Pro endpoint records](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-pro/endpoints).
