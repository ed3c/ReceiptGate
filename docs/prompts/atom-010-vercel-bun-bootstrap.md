# P-class prompt — Atom 010 Vercel Bun bootstrap hotfix

Repair production `FUNCTION_INVOCATION_FAILED` without changing ReceiptGate domain semantics.

- Keep static public UX and wallet authorization unchanged.
- Use Vercel's native Bun Function shape: `Bun.serve({ fetch })` in each `api/*.ts` entrypoint.
- Use `port: 0` so GitHub Actions can import every entrypoint without local port collisions; Vercel ignores the local port in production.
- Add `/healthz -> /api/healthz` rewrite.
- Preserve anonymous live Compute rejection and all wallet security controls.
- Require exact-head GitHub Actions before merge.
- After merge, deploy production and physically verify HTTPS endpoints.
