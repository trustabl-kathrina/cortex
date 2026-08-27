# Atlassian Data Center integration

`ctx.atlassian` is the host service behind the Atlassian work panel: connection
settings and status for Jira, Confluence, and Bitbucket Data Center, the probe
and reconnect lifecycle for the two vendored MCP servers under `third_party/`,
pinning, pull-request listing, and the PR review flow (diff context, findings,
dismissal, cancellation).

The authoritative surface documentation — settings schema, credential
resolution through `ctx.credentials`, mount lifecycle, request/result types
(`AtlassianSettings`, `AtlassianStatus`, `Probe*`, `Open*`, `Pin*`,
`ListPullRequests*`, `PostFinding*`, `DismissFinding*`, `CancelReview*`,
`DiffContext*`), and the panel contract — lives in the package README:
[`packages/atlassian/atlassian/README.md`](../../packages/atlassian/atlassian/README.md).
The client panel is [`packages/client/ui-atlassian`](../../packages/client/ui-atlassian/).

Source: [`packages/atlassian/atlassian/src/index.ts`](../../packages/atlassian/atlassian/src/index.ts)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxatlassian--atlassianservice"></a>

### `ctx.atlassian` — `AtlassianService`

`ctx.atlassian`: the whole Jira/Confluence/Bitbucket seam.

```ts cordis-catalog
/**
 * Current settings (schema defaults until a provider is composed).
 * @returns the resolved section.
 */
settings(): AtlassianSettings

/**
 * Recompute both mount plans and bring the children in line.
 * @returns completion once the mounts settled.
 */
async reconcile(): Promise<void>

/**
 * Whole integration status.
 * @returns mount phases, tool counts, and REST readiness.
 */
@Remote('status') status(): AtlassianStatus

/**
 * Retry failed mounts and recompute plans after a settings/credential change.
 * @returns status after the retry settled.
 */
@Remote('reconnect') async reconnect(): Promise<AtlassianStatus>

/**
 * Probe one service with the stored URL and token.
 * @param request - which service.
 * @returns the probe outcome.
 */
@Remote('probe') async probe(request: ProbeRequest): Promise<ProbeResult>

/**
 * Fetch one entity, record it, and focus the panel on it.
 * @param agent - owning live agent.
 * @param request - which entity.
 * @returns the entity reference or a failure.
 */
@Remote('open') open(agent: Agent, request: OpenRequest): Promise<OpenResult>

/**
 * Pin (or clear) the session's ticket.
 * @param agent - owning live agent.
 * @param request - key or `null`.
 * @returns acknowledgement.
 */
@Remote('pin') async pin(agent: Agent, request: PinRequest): Promise<AckResult>

/**
 * List pull requests for the picker.
 * @param request - inbox or one repository.
 * @returns picker rows.
 */
@Remote('listPullRequests') async listPullRequests(request: ListPullRequestsRequest): Promise<ListPullRequestsResult>

/**
 * Post one review finding to Bitbucket, inline on its diff line when the
 * line is part of the diff, as a general comment otherwise.
 * @param agent - owning live agent.
 * @param request - review, finding, optional comment override.
 * @returns the posted comment.
 */
@Remote('postFinding') async postFinding(agent: Agent, request: PostFindingRequest): Promise<PostFindingResult>

/**
 * Dismiss one finding (never posted).
 * @param agent - owning live agent.
 * @param request - review and finding.
 * @returns acknowledgement.
 */
@Remote('dismissFinding') dismissFinding(agent: Agent, request: DismissFindingRequest): AckResult

/**
 * Cancel the running review of a session.
 * @param agent - owning live agent.
 * @param request - review to cancel.
 * @returns acknowledgement.
 */
@Remote('cancelReview') cancelReview(agent: Agent, request: CancelReviewRequest): AckResult

/**
 * Diff lines around one finding for the evidence view.
 * @param request - PR, file, line, side.
 * @returns the window.
 */
@Remote('diffContext') async diffContext(request: DiffContextRequest): Promise<DiffContextResult>
```

Types: [Agent](core.md)

Source: [`packages/atlassian/atlassian/src/index.ts:128`](../../packages/atlassian/atlassian/src/index.ts)
<!-- END GENERATED cordis-surface -->
