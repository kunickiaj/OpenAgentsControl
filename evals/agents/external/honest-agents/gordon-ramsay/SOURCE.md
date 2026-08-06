# Honest Agents Gordon Ramsay

These tests load the external prompt at runtime with `--agent-file`; this repository does not define or register Gordon Ramsay.

- Repository: `https://github.com/kunickiaj/honest-agents`
- Source: `agents/gordon-ramsay.md`
- Evaluated commit: `f678bfcb1567f67b999de371e14141b8e74c2b99`
- Evaluated SHA-256: `0d5c4d93967a4b5bb4ba75fd229e77ba0e2f2ca8a36b61ecbd44bd1e13aeec71`

Run from `evals/framework`:

```sh
npm run eval:sdk -- --subagent=gordon-ramsay --agent-file="$HOME/.config/opencode/agents/gordon-ramsay.md" --agent-file-sha256=0d5c4d93967a4b5bb4ba75fd229e77ba0e2f2ca8a36b61ecbd44bd1e13aeec71 --pattern="benchmark/*.yaml" --model=anthropic/claude-opus-5 --variant=medium --timeout=240000
```
