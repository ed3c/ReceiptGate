import { describe, expect, test } from "bun:test";

const directorHtml = await Bun.file("public/director.html").text();
const demoHtml = await Bun.file("public/index.html").text();

function contractFromHtml() {
  const match = directorHtml.match(/<script id="receiptgate-demo-contract" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match) throw new Error("director machine-readable contract missing");
  return JSON.parse(match[1]) as any;
}

function selectorExists(selector: string) {
  if (selector.startsWith("#")) return demoHtml.includes(`id="${selector.slice(1)}"`);
  if (selector.startsWith(".")) return demoHtml.includes(selector.slice(1));
  return false;
}

describe("deterministic demo director", () => {
  test("keeps the existing demo as the rendered source of truth", () => {
    expect(directorHtml).toContain('src="/?director=1"');
    expect(directorHtml).toContain("same"); // same-origin behavior is intentional in the implementation comments/contract surface
    expect(demoHtml).toContain('id="multiRun"');
    expect(demoHtml).toContain('id="multiTamper"');
    expect(demoHtml).toContain('id="liveAgent"');
  });

  test("publishes a machine-readable ordered product contract", () => {
    const c = contractFromHtml();
    expect(c.schema).toBe("receiptgate-demo-director-v1");
    expect(c.invariant).toContain("verify(proof,candidate)==PASS");
    expect(c.invariant).toContain("policy(candidate)==ALLOW");
    expect(c.authority).toBe("Agent A proposes; Agent B advises; ReceiptGate authorizes.");
    expect(c.orderedLiveStory).toEqual([
      "explain-invariant",
      "preflight-runtime",
      "authorize-wallet",
      "run-live-normal",
      "inspect-normal-receipt",
      "run-live-tamper",
      "inspect-tamper-receipt",
      "verify-agentic-id-if-configured",
      "close-on-invariant",
    ]);
  });

  test("all action selectors resolve against the unchanged static demo", () => {
    const c = contractFromHtml();
    for (const [name, action] of Object.entries<any>(c.actions)) {
      expect(selectorExists(action.selector), `${name} selector ${action.selector}`).toBe(true);
    }
  });

  test("does not automate consent or launder fixture/live proof boundaries", () => {
    const c = contractFromHtml();
    expect(c.actions["run-live-normal"].requiresHumanConsent).toBe(true);
    expect(c.actions["run-live-tamper"].requiresHumanConsent).toBe(true);
    expect(c.actions["connect-wallet"].requiresHumanConsent).toBe(true);
    expect(c.actions["sign-wallet"].requiresHumanConsent).toBe(true);
    expect(c.actions["anchor-wallet"].requiresHumanConsent).toBe(true);
    expect(c.actions["anchor-wallet"].optional).toBe(true);
    expect(c.actions["run-fixture-normal"].effect).toBe("fixture-only");
    expect(c.actions["run-fixture-tamper"].effect).toBe("fixture-only");
    expect(c.proofBoundaries.multiAgent).toContain("no candidate-bound Agentic ID proof is claimed");
    expect(JSON.stringify(c.stateRules)).toContain("never fall back silently");
  });

  test("exposes deterministic browser-agent operations", () => {
    expect(directorHtml).toContain("window.ReceiptGateDemoDirector");
    expect(directorHtml).toContain("getState,");
    expect(directorHtml).toContain("recommend,");
    expect(directorHtml).toContain("next:");
    expect(directorHtml).toContain("run: actionId");
    expect(directorHtml).toContain("receiptgate:demo-stage");
  });
});
