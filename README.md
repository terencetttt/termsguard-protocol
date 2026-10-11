# TermsGuard

TermsGuard registers bounded commercial requirements, freezes them on a GenLayer Intelligent Contract, and records validator consensus over evidence fetched independently from HTTPS sources. It gives parties an immutable audit record for narrow fact-finding. It does not replace legal advice or decide remedies.

## Product architecture

- **Contract authority:** contracts/TermsGuard.py owns agreement, requirement, evidence-reference, and adjudication state. The browser never treats local drafts or transaction submission as chain state.
- **Frontend:** Next.js 14, React, TypeScript, and Tailwind utilities render landing, dashboard/agreement list, create wizard, detail/editor, freeze review, evidence submission/detail, adjudication workspace/result, audit timeline, and network/settings screens.
- **GenLayer client:** lib/contract.ts centralizes the v2 SDK network/client setup and exact contract method registry. Reads request latest finalized state. Writes estimate fees, submit through the connected EIP-1193 wallet, wait for finalization, validate the execution result, then refresh state from the contract.
- **Network config:** public NEXT_PUBLIC_* variables are in .env.example and point to the verified Studio deployment. Override them in the hosting platform when targeting another network. Do not put private signing material in the frontend.

## Trust and evidence model

Submitters provide only an HTTPS URL and a label. The contract does not accept source text, caller summaries, or caller verdicts. During adjudicate, the leader fetches the referenced URL within gl.vm.run_nondet_unsafe. Each validator independently fetches the same URL and performs the same bounded comparison against frozen terms. Consensus compares the substantive verdict. The response must be HTTP 200; the normalized source is capped at 12,000 characters, whitespace is collapsed, text is lowercased, and SHA-256 of that normalized text is stored with the outcome.

Source content is untrusted input. The prompt directs validators to ignore embedded instructions, consider only factual evidence relevant to frozen criteria, and return exactly COMPLIANT, BREACH, or INCONCLUSIVE. Empty, inaccessible, ambiguous, or unreadable material resolves to INCONCLUSIVE. The stored reasoning comes from the leader's analysis after validators agree on the verdict; validators independently verify the verdict, not identical prose.

## Lifecycle and immutability

DRAFT → FROZEN → EVIDENCE_SUBMITTED → ADJUDICATED.

The draft creator can append requirements, then freeze. There is no contract method to edit or remove an existing requirement; append is allowed only while status is DRAFT. Freeze locks the complete criteria set. Evidence references may be submitted while frozen or awaiting adjudication. Each evidence reference is adjudicated at most once. An adjudication and its evidence association cannot be edited or deleted. Deterministic IDs are SHA-256 hashes of sender, transaction datetime, sequence index, and record inputs as relevant, so repeated inputs create separate records without overwrite.

## Public contract methods

**Writes:** create_agreement(title, description, counterparty), add_requirement(agreement_id, statement, evaluation_guide), freeze_agreement(agreement_id), submit_evidence(agreement_id, url, label), adjudicate(evidence_id).

**Views:** get_agreement, get_requirement, get_requirements, get_evidence, get_evidence_ids, get_adjudication, get_adjudication_for_evidence, get_agreement_ids, get_status, and contract_info.

Limits: URL 2,048 characters; title 120; description 2,000; counterparty 160; requirement statement and guide 500 each; evidence label 160; fetched source 12,000 characters; 16 requirements per agreement. contract_info exposes version, purpose, verdicts, limits, evidence policy, and immutability model.

## Threat model and limitations

- Frozen requirements cannot be rewritten; there is no administrator or privileged verdict setter.
- HTTPS and hostname syntax checks do not guarantee source authenticity or prevent DNS rebinding, redirects to private networks, SSRF, or a source changing between validator fetches. Production deployments need appropriate network egress controls.
- The response body is truncated after the web runtime delivers it; deployment-specific maximum response handling should be checked against the target runtime.
- External sources can be unavailable, mutable, or incomplete. Validators can disagree and consensus can require rotations or fail.
- Semantic judgments can be wrong, especially when criteria are subjective or the public page is ambiguous. Write objective requirements and guides.
- Source bytes are not stored, only a normalized-content hash and result. Independent reproduction later requires the source to remain available.
- No appeals UX, escrow, payment, legal remedy, or off-chain indexing service is included.

## Local qualification

Install dependencies with npm install, then run:

~~~sh
npm run typecheck
npm run lint
npm run test:frontend
npm run test:contract
npm run build
python -m py_compile contracts/TermsGuard.py
python -m pytest tests/direct -v
genvm-lint check contracts/TermsGuard.py
~~~

Frontend tests assert method parity, finalization checks, URL-only evidence submission, and public-only env configuration. Static Python regressions cover trust boundaries. GenLayer direct-mode tests execute state transitions, validation, duplicate handling, mocked external evidence adjudication, and immutable result lookup. Direct mode does not exercise multi-validator consensus; perform Studio-mode lifecycle qualification before production use.

## Deployment and live qualification

The contract source pins the GenVM runner. The production public configuration targets GenLayer Studio and the frontend must be rebuilt when those public variables change. The deployed contract was validated with GenVM lint, live schema and contract_info reads, and a finalized multi-transaction lifecycle. Frontend writes stay disabled if network configuration does not match a supported SDK chain.

### Live qualification evidence

- Frontend production URL: [TermsGuard on Vercel](https://termsguard-genlayer-live-20261011.vercel.app) — deployment ID dpl_FYyWG2BbcDbwszE1U2uk28zutXXA, status READY, production target; [deployment inspection](https://vercel.com/terencetttts-projects/termsguard-genlayer-live-20261011/FYyWG2BbcDbwszE1U2uk28zutXXA). Production environment stores the live RPC, chain ID, contract address, and explorer settings.
- Network / chain ID: **GenLayer Studio / 61999**
- Contract address: **0x7f29F85F9bFBc23dEE7b53d7782785aFe9471CEB**
- Explorer base: [GenLayer Explorer](https://genlayer-explorer.vercel.app)
- Finalized deployment transaction: [0xf637602a503b15a77b6650df5dd6a58b89eb1c8383235d3543e4ccec4ba053c6](https://genlayer-explorer.vercel.app/tx/0xf637602a503b15a77b6650df5dd6a58b89eb1c8383235d3543e4ccec4ba053c6) — FINALIZED, `execution_result: SUCCESS`.
- Finalized lifecycle transactions (each receipt finalized successfully): create agreement `0xa0df3f9e95a56b763966e47351b79406b7d54def405690705a61a99b152e9e39`; add requirement `0xac9e61658325c76456799e1a8997bcb310102e0a7b536678396963e22dccd155`; freeze `0x396aec08de01af5fa34b9cabe31e1479fab9c108e729d3752029b04ba682b30d`; submit HTTPS evidence `0xc6d3346f9ae73f700474ba20b65d39307c6eaad22798fb5a9b04f0a3bdf01cc5`; adjudicate `0x0ed0eafe5febb6aa336241ca3918b7fde67a4d857f5c7d1d015e6bdcf555c9a8`.
- Agreement: `tg_ag_09ef37243236eadf05888cd197f70c1d0e200356b019d3b1c804fb403e27cd20`; requirement: `tg_req_d9740badd9d84cb8b69d99daf981c240427064fd04c83008f10f57156ee69754`; evidence: `tg_ev_9071027409fc7f7ec8ca919998f166c64c0665d10f0c56d0419081e397c61b8d`; adjudication: `tg_adj_2e534e8624b0136192724f781336520d1854a0da5a1d98321be11a94b2aece3f`.
- The final persisted verdict was **INCONCLUSIVE**. Validators independently fetched `https://example.com/`; the saved reasoning says the requirement was not clearly met by visible page text. SHA-256 of normalized fetched content: `e73f0047361989a67fcc2b3712206a19eeb0db3744b7f740100a019f8a78c897`. Agreement read-back showed `FROZEN` after freeze, then `EVIDENCE_SUBMITTED`, and finally `ADJUDICATED`.
- Live `contract_info` reported TermsGuard 1.0.0, HTTPS-only validator fetching, caller content rejection, bounds, immutable adjudications, and no privileged verdict override. Deployed schema contained all 15 public methods (10 views, 5 writes).
- Local GenVM lint/validation, Python and direct-mode contract tests, frontend tests, TypeScript, ESLint, and production builds passed. The public Vercel production deployment is READY, uses the verified Studio contract settings, and returned HTTP 200 for the landing, dashboard, agreements list/create/detail/freeze, evidence create/detail, adjudication result, and settings routes. Vercel reported no recent production error logs.
