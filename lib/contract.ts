'use client'

import { abi as genlayerAbi, createClient, isSuccessful } from 'genlayer-js'
import { studionet, testnetAsimov, testnetBradbury } from 'genlayer-js/chains'
import { TransactionHashVariant } from 'genlayer-js/types'
import { fromHex, zeroAddress } from 'viem'

export const METHODS = {
  createAgreement: 'create_agreement', addRequirement: 'add_requirement', freezeAgreement: 'freeze_agreement',
  submitEvidence: 'submit_evidence', adjudicate: 'adjudicate', getAgreement: 'get_agreement',
  getRequirement: 'get_requirement', getRequirements: 'get_requirements', getEvidence: 'get_evidence',
  getEvidenceIds: 'get_evidence_ids', getAdjudication: 'get_adjudication',
  getAdjudicationForEvidence: 'get_adjudication_for_evidence', getAgreementIds: 'get_agreement_ids',
  getStatus: 'get_status', contractInfo: 'contract_info',
} as const

const chains: Record<string, any> = { studionet, testnetBradbury, testnetAsimov }
export type NetworkConfig = { rpcUrl: string; chainKey: string; chainId: number; contractAddress: `0x${string}`; explorerUrl: string }

export function getNetworkConfig(): NetworkConfig | null {
  const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim()
  const contractAddress = process.env.NEXT_PUBLIC_TERMSGUARD_ADDRESS?.trim()
  const chainKey = process.env.NEXT_PUBLIC_GENLAYER_NETWORK?.trim() || 'studionet'
  const chainId = Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID)
  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() || ''
  if (!rpcUrl || !contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress) || !Number.isInteger(chainId) || chainId <= 0 || !chains[chainKey]) return null
  try { const rpc = new URL(rpcUrl); if (!['http:', 'https:'].includes(rpc.protocol) || rpc.username || rpc.password) return null } catch { return null }
  const expectedId = Number(chains[chainKey].id)
  if (expectedId && expectedId !== chainId) return null
  return { rpcUrl, chainKey, chainId, contractAddress: contractAddress as `0x${string}`, explorerUrl }
}

function chainFor(config: NetworkConfig) {
  const original = chains[config.chainKey]
  return { ...original, id: config.chainId, rpcUrls: { ...original.rpcUrls, default: { http: [config.rpcUrl] } } }
}

export function readClient(config = getNetworkConfig()) {
  if (!config) throw new Error('GenLayer network is not configured. Set the public RPC, supported network, chain ID, and contract address.')
  return createClient({ chain: chainFor(config) })
}

export async function walletClient(config: NetworkConfig, provider: any, address: `0x${string}`) {
  // Providers and chain selection are already handled by the EIP-1193 flow.
  // GenLayerJS `connect()` additionally requests the MetaMask GenLayer Snap,
  // which is not needed for ordinary wallet signing and fails on other wallets.
  return createClient({ chain: chainFor(config), account: address, provider })
}

export async function readMethod<T>(method: string, args: unknown[] = [], config = getNetworkConfig()): Promise<T> {
  if (!config) throw new Error('Network is not configured')
  const client = readClient(config) as any
  // The current Studionet node still expects the legacy `method` calldata key.
  // genlayer-js 2.0.0-rc.1 encodes it as the empty-string key, which reaches
  // GenVM as a missing method and returns "Missing or invalid parameters".
  const encodedCall = genlayerAbi.calldata.encode({ method, ...(args.length ? { args } : {}) } as any)
  const data = genlayerAbi.transactions.serialize([encodedCall, false])
  const result = await client.request({
    method: 'gen_call',
    params: [{
      type: 'read',
      to: config.contractAddress,
      from: zeroAddress,
      data,
      transaction_hash_variant: TransactionHashVariant.LATEST_FINAL,
    }],
  })
  const resultHex = typeof result === 'string' ? result : result?.data
  if (typeof resultHex !== 'string') throw new Error('GenLayer RPC returned no contract result data')
  const prefixedResult = (resultHex.startsWith('0x') ? resultHex : `0x${resultHex}`) as `0x${string}`
  const decoded = genlayerAbi.calldata.decode(fromHex(prefixedResult, 'bytes'))
  return toJsonSafe(decoded) as T
}

function toJsonSafe(value: any): any {
  if (value instanceof Map) return Object.fromEntries(Array.from(value.entries(), ([key, item]) => [key, toJsonSafe(item)]))
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (typeof value === 'bigint') return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString()
  if (value instanceof Uint8Array) return `0x${Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')}`
  if (value && typeof value === 'object' && value.bytes instanceof Uint8Array) return toJsonSafe(value.bytes)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]))
  return value
}

export async function writeMethod(method: string, args: unknown[], account: any, config: NetworkConfig, onSubmitted?: (hash: string) => void) {
  const client = account.client as any
  const estimate = await client.estimateTransactionFeesForWrite({ address: config.contractAddress, functionName: method, args })
  const hash = await client.writeContract({ address: config.contractAddress, functionName: method, args, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } }) as string
  onSubmitted?.(hash)
  const receipt = await client.waitForFinalization({ hash, fullTransaction: true })
  if (!isSuccessful(receipt)) {
    const detail = `${receipt?.statusName || 'unknown status'} / ${receipt?.txExecutionResultName || 'unknown execution result'}`
    throw Object.assign(new Error(`Transaction finalized unsuccessfully: ${detail}`), { txHash: hash, receipt })
  }
  return { hash, receipt }
}

export function explorerTxUrl(config: NetworkConfig | null, hash: string) { return config?.explorerUrl ? `${config.explorerUrl.replace(/\/$/, '')}/tx/${hash}` : '' }
export function explorerAddressUrl(config: NetworkConfig | null, address: string) { return config?.explorerUrl ? `${config.explorerUrl.replace(/\/$/, '')}/address/${address}` : '' }
