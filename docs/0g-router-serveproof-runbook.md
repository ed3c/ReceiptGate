# ReceiptGate — sealed DSH + OpenRouter 操作紀錄

更新：2026-09-10。保留原檔名以免既有連結失效；本文件是可選操作材料，不增加第四個必讀 hop。產品邊界由 `contracts/system-v1.md` §12 定義，執行結果以腳本、測試和當次 runtime receipt 為準。

## 已驗證範圍與剩餘工作

2026-09-10 本機操作成功部署 DSH，Agent ID `401`，模型 `z-ai/glm-5.2`，provider `openrouter`，framework package `0.1.1-rc.2`，官方 TypeScript SDK `0.1.2`。這是當次成功組合，不代表模型永久可用或所有版本都相容。

- `/hello` 官方 SDK proof 驗證成功。
- Owner chat 讓 DSH 在 sealed sandbox 內自行實作並用 native `seal_register_service` 註冊 `POST /api/receiptgate`，保留 `/hello`。
- 固定候選 $247：HTTP 200、SDK verification、expected Agent ID、response binding、transcript binding 均通過，demo callback 執行一次。
- 同一原始 hash 搭配竄改金額 $2470：HTTP 409；拒絕回應本身的簽章與 transcript 仍有效，但 candidate binding 不通過，callback 為零。
- 當次本機 acceptance：42 pass / 0 fail；不是此輪新 commit 的 GitHub CI 證據。

**2026-09-10 18:31 Asia/Taipei 重跑結果：目前 sealed service 不可用。** 正反例皆收到 HTTP 400、無 `X-Agent-Proof`，callback 皆為零；公開 `/hello` 回應 `Sandbox with ID c4341f9a-0e7a-4778-84f5-649162c41e24 not found`。這證明原 URL 此刻無法取得 runner，不足以推斷 sandbox 消失的原因。先以 owner deployment readback 確認狀態並評估官方恢復方式，不要盲目充值、重建身份或改 gate。前述成功是較早的歷史驗證，不是目前 LIVE 宣告。

**完整 Vercel NORMAL／ATTACK 尚未 LIVE。** 上述使用固定 candidate / Risk review，沒有真實 Procurement/Risk 模型呼叫、瀏覽器錢包流程或付款。Sealed 服務證明也不等於外部 OpenRouter 模型推論是 sealed。

上次診斷尚待重新驗收：production multi-agent function 的 `@noble/hashes/crypto` 打包問題，以及既有多 Agent 推論路由改用外部模型。不得以此次 sealed service 成功推定這些問題已消失，也不得放寬 gate。

## 環境變數與權限邊界

| 參數 | 用途與位置 |
| --- | --- |
| `OPENROUTER_API_KEY` | Repo 本機 `.env`，由執行程序載入並透過 SDK 的 `sandbox.apiKey` 傳入 sealed runtime；不寫進 iData、文件或 receipt |
| `AGENT_MODEL` | Repo 本機 `.env`；當次成功值為 `z-ai/glm-5.2` |
| `PRIVATE_KEY` | 只在本機 provisioning / owner 操作程序的環境中短暫使用，由 Keychain 取得；不寫入 `.env`、Vercel 或 GitHub Actions |
| `ZERO_G_ATTESTOR_URL` | `https://agenticid.0g.ai`；Galileo testnet chain ID `16602` |
| `AGENT_IDEMPOTENCY_KEY` | 部署預設 `receiptgate-dsh-openrouter-v1`；恢復同一次操作時不要任意換值以免建立重複身份 |
| `RECEIPTGATE_AGENT_URL` | 從當次已驗證的 public deployment receipt 取得；不要假定歷史 URL 永遠存活 |
| `RECEIPTGATE_AGENT_SERVICE_PATH` | 必須是 `/api/receiptgate` |
| `RECEIPTGATE_AGENT_ID` | 必須是預期身份的十進位字串；此次為 `401` |

`ZG_*` / Private Computer / 0G Compute 不是此部署路徑的必要資源。舊 production code 仍存在不代表遷移完成。配置旗標為 true 也不代表真實路徑已通。

使用者已授權 runtime 載入 repo `.env` 並引用參數，**未授權讀出或展示檔案內容**。不要 `cat .env`、列印環境或將 secret 放在命令列。保持 `.env` mode 600 且 Git ignored。

## 本機 Keychain 成功方式

Canonical demo EOA：`0x5688FE84cf3f3B7E37e31F6205C619EE06B6925A`。

登入鑰匙圈 generic-password 項目：service `com.receiptgate.demo-eoa`，account 為上述地址。此 Mac 的存取清單已允許 Python。`security find-generic-password ... -w` 曾反覆提示且拒絕密碼；不能因此判定 key 不存在或密碼錯誤。

成功做法是由已授權的 Python 直接呼叫 macOS Security.framework 的 `SecKeychainFindGenericPassword`，不是由 Python 再啟動 `security` CLI。先設定 `SecKeychainSetUserInteractionAllowed(False)`；若回傳非零 OSStatus 就停止並報告代碼，不自動更改 ACL。取值後釋放 native buffer，在本機子程序使用，輸出限於公開地址和驗證布林值。

成功驗收包括 derive address 與固定無害訊息 sign/recover。沒有更改鑰匙圈權限，沒有把 wallet key 傳入 sandbox。不要將 Python 的此項允許推廣成允許所有應用程式，也不要未經使用者確認修改 ACL 或重設鑰匙圈。

本機 `.tmp/deploy-dsh-keychain.py` 是此次使用的 launcher，未納入 Git；新 checkout 不保證存在。接手者必須先檢查 launcher 程式碼是否保持以上邊界，不能盲目執行同名檔。文件不保存任何私鑰或鑰匙圈密碼。

## 部署與服務註冊

1. 先執行模型工具呼叫 preflight：

   ```bash
   bun --env-file=.env scripts/dsh-runtime.ts
   ```

   不只讀模型目錄：必須收到真正的 `receiptgate_probe` 工具呼叫與 `ok: true`。preflight 成功不證明 sealed runtime 已可用。

2. 由已檢查的本機 Keychain launcher 注入 `PRIVATE_KEY`，執行 `scripts/provision-agentic-id.ts`。腳本先驗 trust roots 與 sandbox balance，再部署等待 `running`、驗證 `/hello`、寫入公開 receipt。

   腳本會把 sandbox balance 補到 0.2 testnet OG（最低檢查 0.1 OG）。這是 Agentic ID sandbox 餘額，與 OpenRouter credit、EOA native balance 及舊 Compute credit 各自獨立。

3. 若 SDK 報 transaction receipt 尚未找到，先用原 tx hash 查 Galileo receipt 與 sandbox balance；不要立即再充值。此次約 0.068 OG 的 deposit 已成功，SDK 查詢太早才報錯；鏈上確認成功後重跑，餘額讀為 0.2 OG，沒有重送該筆充值。歷史 0.2 OG 不是目前餘額保證。

4. 用 owner-authenticated SDK `agent.authenticate(url)` / `client.chat()` 請 DSH 在 sealed sandbox 內自行建立服務。使用 native `seal_register_service`，保留既有服務。**不要採用舊 shell bootstrap 存取簽署 socket 的路徑。** 已存在服務先做 readback，不要重複 bootstrap 或部署新身份。

   服務要求：接收 `{purpose: "receiptgate-candidate-binding", candidateHash, candidate}`；依 `api/live/multi-agent.ts` 的 `canonicalCandidate()` 欄位順序構造 JSON、獨立算 SHA-256；驗必填欄位、正有限數值、USD、purchase 與 bounded body size。金額是 total USD，units 是數量，不得混用。匹配回應 HTTP 200 `{accepted: true, candidateHash, service: "receiptgate-candidate-binding-v1"}`；不匹配 HTTP 409、`accepted: false` 與重算 hash。服務不付款、不製造 proof，由 sealed proxy 加上 `X-Agent-Proof`。

5. 再用 signed `/hello` 確認服務清單含 `POST /api/receiptgate`，執行下列真實 canary。不能只相信 Agent 回覆「完成」。

## 可重跑的驗證與證據

```bash
bun run acceptance
bun scripts/verify-dsh-service.ts
```

第二個命令讀本機公開 `artifacts/agentic-id-provision.json` 選定 agent，使用真實服務與官方 proof verifier，不需要 wallet key 或模型 API key。它會寫出新的公開測試 receipt（帶時間戳的存檔及 latest 檔）；這不是正常產品流程，也不執行真實付款。缺少 receipt 時先恢復經核對的公開部署資料，不要為取得 receipt 重建 Agent。

本機證據位置（Git ignored；新 checkout 不會自動取得）：

- `artifacts/agentic-id-provision.json`：當次部署、身份、URL 與 `/hello` 驗證；初始服務清單可能早於後續註冊。
- `artifacts/dsh-service-verification.json`：最近一次真實服務正反例、proof checks、callback 次數、`fullPathLive: false`；目前內容為上述失敗。新版腳本另存 `artifacts/dsh-service-verification-<timestamp>.json`，避免後續覆蓋歷史。

錯誤案例的完整合约由 `tests/0g-router-serveproof.test.ts` 驗收，包含 missing service/proof、wrong identity、transcript、candidate、expiry、signature 與 verifier failure。所有失敗必須保持 `sideEffectCalls = 0`。發布前另外取得 exact-commit CI 與 production 完整 NORMAL／ATTACK receipts，不能沿用過期 proof 當現時驗證。
