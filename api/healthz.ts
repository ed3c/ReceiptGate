export default {
  async fetch() {
    return Response.json(
      {
        ok: true,
        service: "receiptgate-vercel-bun",
        gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
};
