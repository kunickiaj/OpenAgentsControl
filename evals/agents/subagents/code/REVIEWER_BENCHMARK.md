# Reviewer Benchmark

## Provisional Decision

- Keep **CodeReviewer at medium** as the default general-purpose quality gate.
- Use **AdversarialReviewer at medium** for targeted escalation on high-risk behavior, state transitions, retries, authorization, and isolation boundaries.
- Use the external **Honest Agents Gordon Ramsay at medium** only when explicitly requested. The evaluated prompt is not defined or registered by this repository.
- Reserve **high** effort for unusually ambiguous or high-impact reviews. This run observed no additional detections and measured 19.9-55.1% higher mean latency.

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
| CodeReviewer | medium | 4/4 | 95.1s | 23.8s | - |
| CodeReviewer | high | 4/4 | 114.0s | 28.5s | +19.9% |
| AdversarialReviewer | medium | 4/4 | 100.9s | 25.2s | - |
| AdversarialReviewer | high | 4/4 | 150.3s | 37.6s | +49.0% |
| Honest Agents Gordon | medium | 4/4 | 88.2s | 22.0s | - |
| Honest Agents Gordon | high | 4/4 | 136.7s | 34.2s | +55.1% |

Across all three prompts, medium reduced aggregate mean latency by 29% relative to high while preserving the observed 4/4 score in every cell.

## External Gordon Source

Gordon was loaded at runtime with `--agent-file` and an enforced `--agent-file-sha256`; no Gordon prompt or agent registration is committed here. The evaluated installed prompt matched:

- `kunickiaj/honest-agents` commit `f678bfcb1567f67b999de371e14141b8e74c2b99`;
- source `agents/gordon-ramsay.md`;
- SHA-256 `0d5c4d93967a4b5bb4ba75fd229e77ba0e2f2ca8a36b61ecbd44bd1e13aeec71`.

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
- The three defect patterns were simplified from real review failures, so they represent narrow correctness review better than synthetic trivia. They do not preserve full PR size, surrounding context, or cross-file ambiguity.
- Non-debug sessions are deleted after collection, and current result JSON does not retain aggregate token or cost data. Latency is therefore the available efficiency measure for this run.
- The benchmark checks required findings and verdicts, not prose quality or reviewer tone.
- CodeReviewer and Gordon totals are complete four-case reruns under the aligned no-delegation rubric. AdversarialReviewer totals combine unchanged defect-case runs with the corrected clean-control rerun.
- Each cell ran once. The latency result is directional until repeated runs establish variance.
