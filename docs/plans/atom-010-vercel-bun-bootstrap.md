# N-class plan — Atom 010 Vercel Bun bootstrap hotfix

Production symptom: static `/` is 200 while all `api/*` endpoints fail with Vercel `FUNCTION_INVOCATION_FAILED` and `/healthz` is 404.

Expected correction:

1. keep Vercel-native `export default { fetch: handler }` (do not use Bun.serve in api/**);
2. keep all business/wallet handlers in `demo/vercel.ts` unchanged;
3. expose `/healthz` through a rewrite to `/api/healthz`;
4. cloud-check every Bun bootstrap, wallet planted controls, and anonymous Compute 401;
5. merge only after exact-head checks pass;
6. deploy `main` to production and verify public HTTPS readback.

This document is descriptive only; GitHub Actions and production Vercel readback are the evidence authorities.
