export default {
  async fetch(request: Request) {
    const mod = await import("../demo/vercel.ts");
    return mod.configHandler(request);
  },
};
