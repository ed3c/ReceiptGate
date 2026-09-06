type Mode = "fixture" | "live-compute" | "live-agent" | "live";

function modeFromArgs(): Mode {
  const raw = process.argv[2] ?? process.env.DEMO_MODE ?? "fixture";
  if (raw === "fixture" || raw === "live-compute" || raw === "live-agent" || raw === "live") return raw;
  throw new Error(`unknown demo mode: ${raw}`);
}

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function secretShape(name: string, prefix?: string): { present: boolean; shapeOk: boolean } {
  const value = process.env[name]?.trim() ?? "";
  return { present: value.length > 0, shapeOk: value.length > 0 && (!prefix || value.startsWith(prefix)) };
}

const mode = modeFromArgs();
const underActions = process.env.GITHUB_ACTIONS === "true";
const privateKey = secretShape("PRIVATE_KEY", "0x");
const computeSecret = secretShape("ZG_API_SECRET", "app-sk-");

if (underActions && privateKey.present && process.env.ALLOW_GHA_PRIVATE_KEY_PROVISION !== "true") {
  throw new Error("PRIVATE_KEY must not be present in normal GitHub Actions runtime");
}

const required: string[] = [];
if (mode === "live-compute" || mode === "live") required.push("ZG_SERVICE_URL", "ZG_MODEL", "ZG_API_SECRET");
if (mode === "live-agent" || mode === "live") required.push("RECEIPTGATE_AGENT_URL");
const missing = required.filter((name) => !present(name));

const report = {
  schema: "receiptgate-demo-doctor-v1",
  mode,
  ready: missing.length === 0 && (!(mode === "live-compute" || mode === "live") || computeSecret.shapeOk),
  githubActions: underActions,
  runtime: {
    computeServiceUrl: present("ZG_SERVICE_URL"),
    computeModel: present("ZG_MODEL"),
    computeSecretPresent: computeSecret.present,
    computeSecretShapeOk: computeSecret.shapeOk,
    agentUrl: present("RECEIPTGATE_AGENT_URL"),
  },
  localProvisioning: {
    privateKeyPresent: privateKey.present,
    privateKeyShapeOk: privateKey.present ? /^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY!.trim()) : false,
    agentApiKeyPresent: present("AGENT_API_KEY") || computeSecret.present,
  },
  missing,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ready) throw new Error(`demo mode ${mode} is not ready: ${missing.join(", ") || "credential shape invalid"}`);
