import { expect, test } from 'bun:test';
import { hermesIData } from '../scripts/hermes-runtime';
test('Hermes pins the real testnet route and provider limits without embedding credentials', () => {
 const data=hermesIData('https://router-api-testnet.integratenetwork.work/v1','fixture-64k-model',{context:65536,output:2048});
 expect(data[0].plaintext).toEqual({name:'hermes',package_version:'v2026.7.20',schema_version:1});
 expect((data[1].plaintext as any).model.max_tokens).toBe(2048);
 expect((data[1].plaintext as any).model.provider).toBe('custom');
 expect(JSON.stringify(data)).not.toContain('api_key');
 expect(()=>hermesIData('https://router-api-testnet.integratenetwork.work/v1','qwen2.5-omni',{context:32768,output:2048})).toThrow('at least 64000');
 for(const url of ['http://router-api.0g.ai/v1','https://evil.example/v1','https://router-api.0g.ai/v1?x=1']) expect(()=>hermesIData(url,'model',{context:65536,output:2048})).toThrow();
 expect(()=>hermesIData('https://router-api.0g.ai/v1','model',{context:2048,output:2048})).toThrow();
});

test('Hermes preflight rejects a missing model or an answer without an actual tool call', async () => {
 const { preflightHermes }=await import('../scripts/hermes-runtime');
 const original=globalThis.fetch;
 const url='https://router-api-testnet.integratenetwork.work/v1';
 try {
  globalThis.fetch=(async()=>Response.json({data:[]})) as typeof fetch;
  await expect(preflightHermes(url,'qwen2.5-omni','test-secret')).rejects.toThrow('absent');
  globalThis.fetch=(async(input)=>String(input).endsWith('/models')?Response.json({data:[{id:'fixture-64k-model',context_length:65536,max_completion_tokens:2048}]}):Response.json({choices:[{message:{content:'I would call the tool'}}]})) as typeof fetch;
  await expect(preflightHermes(url,'fixture-64k-model','test-secret')).rejects.toThrow('required tool call');
 } finally { globalThis.fetch=original; }
});
