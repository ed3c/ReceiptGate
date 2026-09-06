import { mkdir } from "node:fs/promises";
import { AgenticID } from "@0gfoundation/0g-agenticid-sdk";
import { computeZeroGTaskHash } from "./taskHash";

const attestorUrl = process.env.ZERO_G_ATTESTOR_URL ?? "https://agenticid.0g.ai";
const explicitAgentUrl = process.env.ZERO_G_AGENT_URL?.trim() || undefined;
const targetSha = process.env.TARGET_SHA ?? process.env.GITHUB_SHA ?? "local";

const ag = await AgenticID.fromAttestor(attestorUrl);
const [models, deployments] = await Promise.all([
  ag.agent.listModels(),
  ag.agent.listDeployments(),
]);

const phaseCounts = deployments.reduce<Record<string, number>>((counts, deployment) => {
  const phase = deployment.phase ?? "unknown";
  counts[phase] = (counts[phase] ?? 0) + 1;
  return counts;
}, {});

const urlBearing = deployments.filter(
  (deployment) => typeof deployment.url === "string" && deployment.url.length > 0,
);
const running = urlBearing.filter((deployment) => deployment.phase === "running");

type ProbeCandidate = {
  agentId: string;
  url: string;
  phase: string;
};

const discovered: ProbeCandidate[] = [
  ...running,
  ...urlBearing.filter((deployment) => deployment.phase !== "running"),
].map((deployment) => ({
  agentId: deployment.agentId == null ? "unknown" : String(deployment.agentId),
  url: deployment.url as string,
  phase: deployment.phase ?? "unknown",
}));

// An explicit URL from workflow_dispatch is always attempted first. This is the
// shortest Hackathon path after provisioning our own running agent. Public
// inventory discovery remains the zero-input fallback.
const candidates: ProbeCandidate[] = [
  ...(explicitAgentUrl
    ? [{ agentId: "from-proof", url: explicitAgentUrl, phase: "explicit-url" }]
    : []),
  ...discovered.filter((deployment) => deployment.url !== explicitAgentUrl),
].slice(0, 20);

const attempts: string[] = [];
let verified:
  | {
      agentId: string;
      agentUrl: string;
      inventoryPhase: string;
      statusCode: number;
      taskHash: string;
      computedTaskHash: string;
      frameworkHash: string;
      dataHashes: string[];
      signerMatches: boolean;
      notExpired: boolean;
      dataOnChain: boolean;
      serviceCount: number | null;
    }
  | undefined;

for (const candidate of candidates) {
  let agentId = candidate.agentId;
  const inventoryPhase = candidate.phase;
  try {
    const helloUrl = new URL("/hello", candidate.url);
    const requestUri = `${helloUrl.pathname}${helloUrl.search}`;

    const { response, proof } = await ag.reputation.capture(() =>
      fetch(helloUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      }),
    );
    const responseBody = await response.text();

    if (!response.ok) {
      attempts.push(`${agentId}:${inventoryPhase}:http-${response.status}`);
      continue;
    }
    if (!proof) {
      attempts.push(`${agentId}:${inventoryPhase}:missing-proof`);
      continue;
    }

    agentId = String(proof.agentId);
    const verification = await ag.reputation.verifyProof(proof);
    const computedTaskHash = computeZeroGTaskHash({
      method: "GET",
      requestUri,
      requestBody: "",
      responseBody,
      statusCode: response.status,
    });
    const taskHashMatches =
      computedTaskHash.toLowerCase() === proof.taskHash.toLowerCase();

    if (!verification.ok || !taskHashMatches) {
      attempts.push(
        `${agentId}:${inventoryPhase}:${verification.ok ? "sdk-pass" : "sdk-fail"}:${taskHashMatches ? "task-pass" : "task-fail"}`,
      );
      continue;
    }

    let serviceCount: number | null = null;
    try {
      const parsed = JSON.parse(responseBody) as { services?: unknown[] };
      serviceCount = Array.isArray(parsed.services) ? parsed.services.length : null;
    } catch {
      serviceCount = null;
    }

    verified = {
      agentId,
      agentUrl: candidate.url,
      inventoryPhase,
      statusCode: response.status,
      taskHash: proof.taskHash,
      computedTaskHash,
      frameworkHash: proof.frameworkHash,
      dataHashes: [...proof.dataHashes],
      signerMatches: verification.signerMatches,
      notExpired: verification.notExpired,
      dataOnChain: verification.dataOnChain,
      serviceCount,
    };
    break;
  } catch (error) {
    attempts.push(
      `${agentId}:${inventoryPhase}:${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`,
    );
  }
}

const receipt = {
  schema: "receiptgate-0g-live-proof-v1",
  accepted: Boolean(verified),
  commit: targetSha,
  runner: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  attestorUrl,
  explicitAgentUrlProvided: Boolean(explicitAgentUrl),
  modelCount: models.length,
  deploymentCount: deployments.length,
  phaseCounts,
  runningDeploymentCount: running.length,
  urlBearingDeploymentCount: urlBearing.length,
  probedDeploymentCount: candidates.length,
  attempts: attempts.slice(0, 20),
  proof: verified ?? null,
  generatedAt: new Date().toISOString(),
};

await mkdir("artifacts", { recursive: true });
await Bun.write(
  "artifacts/0g-live-proof.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));

if (!verified) {
  throw new Error(
    `no 0G Agentic ID produced a verified signed /hello; running=${running.length}; urlBearing=${urlBearing.length}; phases=${JSON.stringify(phaseCounts)}; attempts=${attempts.slice(0, 8).join(" | ")}`,
  );
}
