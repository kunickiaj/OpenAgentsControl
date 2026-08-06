# Reviewer Benchmark

## Provisional Decision

- Keep **CodeReviewer at medium** as the default general-purpose quality gate.
- Use **AdversarialReviewer at medium** for targeted escalation on high-risk behavior, state transitions, retries, authorization, and isolation boundaries.
- Use the external **Honest Agents Gordon Ramsay at medium** only when explicitly requested. The evaluated prompt is not defined or registered by this repository.
- Reserve **high** effort for unusually ambiguous or high-impact reviews. This run observed no additional detections and measured 20.1-28.2% higher mean latency.

## Method

On 2026-08-06, each reviewer ran against the same four TypeScript fixtures using `anthropic/claude-opus-5` at medium and high effort:

1. stale token digest after refresh;
2. positional cache key collision;
3. reset recovery bypass;
4. safe token rotation control.

Each defect case required defect-specific evidence and an exact final line of `REQUEST CHANGES`. The control required an exact final line of `SHIP`. Response checks inspect assistant output only, preventing phrases in the user prompt from contaminating scores or an opposite verdict elsewhere in the response from satisfying the evaluator.

Example command:

```sh
npm run eval:sdk -- --subagent=reviewer --pattern="benchmark/*.yaml" --model=anthropic/claude-opus-5 --variant=medium --timeout=240000
```

## Results

| Reviewer | Effort | Passed | Total time | Mean time | High-effort latency change |
|---|---:|---:|---:|---:|---:|
| CodeReviewer | medium | 4/4 | 88.5s | 22.1s | - |
| CodeReviewer | high | 4/4 | 113.4s | 28.3s | +28.2% |
| AdversarialReviewer | medium | 4/4 | 89.6s | 22.4s | - |
| AdversarialReviewer | high | 4/4 | 107.6s | 26.9s | +20.1% |
| Honest Agents Gordon | medium | 4/4 | 90.6s | 22.6s | - |
| Honest Agents Gordon | high | 4/4 | 109.7s | 27.4s | +21.2% |

Across all three prompts, medium reduced aggregate mean latency by 18.8% relative to high while preserving the observed 4/4 score in every cell (24/24 total cases).

## External Gordon Source

Gordon was loaded at runtime with `--agent-file` and an enforced `--agent-file-sha256`; no Gordon prompt or agent registration is committed here. The evaluated installed prompt matched:

- `kunickiaj/honest-agents` commit `f678bfcb1567f67b999de371e14141b8e74c2b99`;
- source `agents/gordon-ramsay.md`;
- SHA-256 `0d5c4d93967a4b5bb4ba75fd229e77ba0e2f2ca8a36b61ecbd44bd1e13aeec71`.

## Routing and Variant Verification

The runner sends `variant` in the SDK prompt request instead of relying only on copied agent frontmatter. It also explicitly routes standalone tests through the temporary `Eval Runner` agent so the selected prompt is executed instead of the default `OpenAgent`. A retained debug probe confirmed both values in the server database:

| Probe | Persisted agent | Persisted variant |
|---|---|---|
| Corrected standalone run | `Eval Runner` | `medium` |

The six result cells above were rerun after both routing and terminal-verdict validation were corrected. They replace earlier invalid runs that executed `OpenAgent` or persisted the default variant.

## Limitations

- Standalone subagent tests run the selected prompt in `primary` mode. They test review behavior directly, not parent-to-subagent delegation quality.
- Four fixtures produced a saturated score and establish parity only on these known patterns. They cannot rank reviewer quality or prove parity across large or unfamiliar diffs.
- The three defect patterns were simplified from real review failures, so they represent narrow correctness review better than synthetic trivia. They do not preserve full PR size, surrounding context, or cross-file ambiguity.
- Non-debug sessions are deleted after collection, and current result JSON does not retain aggregate token or cost data. Latency is therefore the available efficiency measure for this run.
- The benchmark checks required findings and verdicts, not prose quality or reviewer tone.
- Each cell ran once. The latency result is directional until repeated runs establish variance.
