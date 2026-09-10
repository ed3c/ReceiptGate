import {candidateHash,verifyCandidateServeProof,evaluateHandoff,executeVerifiedHandoff} from '../api/live/multi-agent';
// Real sealed service, fixed inference fixtures: this does not certify production.
const receiptFile = Bun.file('artifacts/agentic-id-provision.json');
if (!await receiptFile.exists()) throw new Error('Missing public deployment receipt: artifacts/agentic-id-provision.json');
const deployment = await receiptFile.json();
if (deployment.framework !== 'dsh' || !/^[1-9][0-9]*$/.test(String(deployment.agentId))) {
  throw new Error('Expected a DSH deployment receipt with a positive Agent ID');
}
if (new URL(deployment.url).protocol !== 'https:') throw new Error('Expected an HTTPS sealed service URL');
process.env.RECEIPTGATE_AGENT_URL=deployment.url;
process.env.RECEIPTGATE_AGENT_ID=String(deployment.agentId);
process.env.RECEIPTGATE_AGENT_SERVICE_PATH='/api/receiptgate';
const candidate={id:'sealed-service-control',kind:'purchase' as const,target:'credits',amount:247,currency:'USD' as const,payload:{product:'GPU inference credits',units:10000,quotedPrice:247,sourceRisk:'low' as const,sourceReason:'Fixed verification fixture; no real procurement inference',computeModel:'fixture'}};
const hash=await candidateHash(candidate);
const outcomes=[];
for(const tampered of [false,true]){
 const received=tampered?{...candidate,amount:2470}:candidate;
 const receivedHash=await candidateHash(received);
 const proof=await verifyCandidateServeProof(received,hash);
 const decision=evaluateHandoff({candidate:received,originalHash:hash,transmittedHash:receivedHash,review:{candidateHash:receivedHash,verdict:'ALLOW',risk:'low',reason:'Verification fixture'}});
 const execution=await executeVerifiedHandoff(received,decision,proof);
 outcomes.push({tampered,proof,execution:execution.execution});
 console.log(JSON.stringify(outcomes.at(-1)));
}
const passed=outcomes[0].proof.verified&&outcomes[0].execution.sideEffectCalls===1&&!outcomes[1].proof.verified&&outcomes[1].proof.responseStatus===409&&outcomes[1].execution.sideEffectCalls===0;
const timestamp = new Date().toISOString();
const report = JSON.stringify({timestamp, agentId: deployment.agentId,
  scope: 'Real sealed service proof with fixed candidates; no real multi-agent inference',
  fullPathLive: false, passed, outcomes}, null, 2) + '\n';
await Bun.write(`artifacts/dsh-service-verification-${timestamp.replace(/[:.]/g, '-')}.json`, report);
await Bun.write('artifacts/dsh-service-verification.json', report);
process.exit(passed?0:1);
