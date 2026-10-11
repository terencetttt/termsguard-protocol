'use client'

import { createClient, isSuccessful } from 'genlayer-js'
import { studionet, testnetAsimov, testnetBradbury } from 'genlayer-js/chains'
import { TransactionHashVariant } from 'genlayer-js/types'

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
  const client = createClient({ chain: chainFor(config), account: address, provider })
  await (client as any).connect(config.chainKey)
  return client as any
}

export async function readMethod<T>(method: string, args: unknown[] = [], config = getNetworkConfig()): Promise<T> {
  if (!config) throw new Error('Network is not configured')
  const client = readClient(config) as any
  return client.readContract({ address: config.contractAddress, functionName: method, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL }) as Promise<T>
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
