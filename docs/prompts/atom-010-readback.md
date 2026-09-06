# P-class prompt — production readback

After the hotfix merges, deploy current `main` to Vercel production and verify the public origin.

Required physical checks:

- `/` returns 200;
- `/api/healthz` returns 200 JSON;
- `/healthz` returns the same 200 JSON through the rewrite;
- `/api/config` returns 200 without leaking secrets;
- `/api/demo` normal/tamper behavior remains intact;
- anonymous `/api/live/compute` is rejected before provider execution;
- inspect production runtime logs for bootstrap crashes.

Do not close the production issue from build success alone; require HTTPS readback.
