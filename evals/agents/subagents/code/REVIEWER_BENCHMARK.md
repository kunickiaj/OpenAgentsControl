# Reviewer Benchmark

## Provisional Decision

- Keep **CodeReviewer at medium** as the default general-purpose quality gate.
- Use **AdversarialReviewer at medium** for targeted escalation on high-risk behavior, state transitions, retries, authorization, and isolation boundaries.
- Reserve **high** effort for unusually ambiguous or high-impact reviews. This run observed no additional detections and measured 19-49% higher mean latency.
- Keep **Gordon at medium** as an explicitly requested human-facing review style, not as an automatic quality gate. It matched the other reviewers on this suite, which is too small to rank reviewer quality.

## Method

On 2026-08-06, each reviewer ran against the same four TypeScript fixtures using `anthropic/claude-opus-5` at medium and high effort:

1. stale token digest after refresh;
2. positional cache key collision;
3. reset recovery bypass;
4. safe token rotation control.

Each defect case required the expected decision and defect-specific evidence. The control required `SHIP` and rejected `REQUEST CHANGES`. Response checks inspect assistant output only, preventing phrases in the user prompt from contaminating scores.

Example command:

```sh
npm run eval:sdk -- --subagent=reviewer --pattern="benchmark/*.yaml" --model=anthropic/claude-opus-5 --variant=medium --timeout=240000
```

## Results

| Reviewer | Effort | Passed | Total time | Mean time | High-effort latency change |
|---|---:|---:|---:|---:|---:|
| CodeReviewer | medium | 4/4 | 93.4s | 23.4s | - |
| CodeReviewer | high | 4/4 | 135.1s | 33.8s | +44.6% |
| AdversarialReviewer | medium | 4/4 | 100.9s | 25.2s | - |
| AdversarialReviewer | high | 4/4 | 150.3s | 37.6s | +49.0% |
| Gordon | medium | 4/4 | 105.5s | 26.4s | - |
| Gordon | high | 4/4 | 125.4s | 31.3s | +18.9% |

## Variant Verification

The runner now sends `variant` in the SDK prompt request instead of relying only on copied agent frontmatter. Retained debug probes confirmed the server persisted distinct values:

| Probe | Persisted variant |
|---|---|
| AdversarialReviewer control | `medium` |
| CodeReviewer control | `high` |

This fixes the earlier invalid run where the report label said medium but the persisted session variant remained `default`.

## Limitations

- Standalone subagent tests run the selected prompt in `primary` mode. They test review behavior directly, not parent-to-subagent delegation quality.
- Four fixtures produced a saturated score and establish parity only on these known patterns. They cannot rank reviewer quality or prove parity across large or unfamiliar diffs.
- Non-debug sessions are deleted after collection, and current result JSON does not retain aggregate token or cost data. Latency is therefore the available efficiency measure for this run.
- The benchmark checks required findings and verdicts, not prose quality or reviewer tone.
- Latency totals combine the three unchanged defect-case runs with corrected clean-control reruns after review found and removed an unintended revocation-state change in the original control fixture.
