import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = async (path) => readFile(new URL(path, root), 'utf8')

test('frontend method registry matches contract method names', async () => {
  const [registry, contract] = await Promise.all([read('lib/contract.ts'), read('contracts/TermsGuard.py')])
  const methodBlock = registry.slice(registry.indexOf('export const METHODS'), registry.indexOf('} as const'))
  const names = [...methodBlock.matchAll(/:\s*'([a-z_]+)'/g)].map((m) => m[1])
  for (const method of names) assert.match(contract, new RegExp(`def ${method}\\(`), `missing contract method: ${method}`)
  assert.ok(names.includes('get_adjudication_for_evidence'))
})

test('frontend reads use the GenLayer legacy method-key calldata expected by the live RPC', async () => {
  const source = await read('lib/contract.ts')
  assert.match(source, /genlayerAbi\.calldata\.encode\(\{ method, /)
  assert.match(source, /genlayerAbi\.transactions\.serialize\(\[encodedCall, false\]\)/)
  assert.match(source, /transaction_hash_variant: TransactionHashVariant\.LATEST_FINAL/)
  assert.doesNotMatch(source, /client\.readContract\(/)
})

test('wallet setup uses the EIP-1193 provider without requiring the MetaMask GenLayer Snap', async () => {
  const source = await read('lib/contract.ts')
  assert.match(source, /createClient\(\{ chain: chainFor\(config\), account: address, provider \}\)/)
  assert.doesNotMatch(source, /\.connect\(config\.chainKey\)/)
})

test('writes wait for finalization and inspect execution success', async () => {
  const source = await read('lib/contract.ts')
  assert.match(source, /waitForFinalization/)
  assert.match(source, /isSuccessful\(receipt\)/)
  assert.match(source, /estimateTransactionFeesForWrite/)
})

test('evidence workflow submits only the URL and bounded label', async () => {
  const [page, contract] = await Promise.all([read('app/evidence/new/page.tsx'), read('contracts/TermsGuard.py')])
  assert.match(page, /METHODS\.submitEvidence,\[agreementId,url\.trim\(\),label\.trim\(\)\]/)
  assert.match(contract, /submit_evidence/)
  assert.doesNotMatch(contract, /def submit_evidence\([^)]*content/)
})

test('environment config contains no wallet secret fields', async () => {
  const env = await read('.env.example')
  assert.match(env, /NEXT_PUBLIC_GENLAYER_RPC_URL/)
  assert.match(env, /NEXT_PUBLIC_TERMSGUARD_ADDRESS/)
  assert.doesNotMatch(env, /PRIVATE_KEY|MNEMONIC|SECRET/i)
})
