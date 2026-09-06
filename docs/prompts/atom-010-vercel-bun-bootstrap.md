# Atom 010 correction

Vercel Bun Functions must use:

```ts
export default { fetch: handler };
```

Do **not** use `Bun.serve({ port: 0, fetch })` in `api/**` — that pattern hangs locally and crashes on Vercel with `ResolveMessage {}` / `FUNCTION_INVOCATION_FAILED`.

`Bun.serve` remains correct only for the local `demo/server.ts`.

