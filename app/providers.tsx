'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getNetworkConfig, NetworkConfig, walletClient, writeMethod } from '../lib/contract'

type TxState = { phase:'idle'|'estimating'|'wallet'|'pending'|'success'|'error'; hash?:string; message?:string }
type ContextValue = { config:NetworkConfig|null; account:string|null; walletAvailable:boolean; connect:()=>Promise<void>; disconnect:()=>void; tx:TxState; transact:(method:string,args:unknown[],after?:()=>Promise<void>)=>Promise<string> }
const Context=createContext<ContextValue|null>(null)
export function Providers({children}:{children:React.ReactNode}){
 const config=useMemo(()=>getNetworkConfig(),[]);const [account,setAccount]=useState<string|null>(null);const [walletAvailable,setWalletAvailable]=useState(false);const [client,setClient]=useState<any>(null);const [tx,setTx]=useState<TxState>({phase:'idle'})
 useEffect(()=>{const eth=(window as any).ethereum;setWalletAvailable(!!eth);if(!eth)return;const changed=()=>{setAccount(null);setClient(null)};eth.on?.('accountsChanged',changed);return()=>eth.removeListener?.('accountsChanged',changed)},[])
 const connect=useCallback(async()=>{if(!config)throw new Error('Network settings are incomplete.');const eth=(window as any).ethereum;if(!eth)throw new Error('No EIP-1193 wallet was detected. Install or unlock a compatible wallet.');const chainId='0x'+config.chainId.toString(16);try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId}]})}catch(e:any){if(e?.code!==4902)throw e;await eth.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:config.chainKey,nativeCurrency:{name:'GenLayer',symbol:'GEN',decimals:18},rpcUrls:[config.rpcUrl],...(config.explorerUrl?{blockExplorerUrls:[config.explorerUrl]}:{})}]});await eth.request({method:'wallet_switchEthereumChain',params:[{chainId}]})}const a=(await eth.request({method:'eth_requestAccounts'})) as string[];if(!a?.[0])throw new Error('Wallet did not return an account.');const next=await walletClient(config,eth,a[0] as `0x${string}`);setAccount(a[0]);setClient(next);setTx({phase:'idle'})},[config])
 const disconnect=useCallback(()=>{setAccount(null);setClient(null)},[])
 const transact=useCallback(async(method:string,args:unknown[],after?:()=>Promise<void>)=>{if(!config)throw new Error('Contract is not configured.');if(!client||!account)throw new Error('Connect a wallet before signing.');setTx({phase:'estimating',message:'Preparing transaction'});try{setTx({phase:'wallet',message:'Confirm the transaction in your wallet'});const {hash}=await writeMethod(method,args,{client},config,h=>setTx({phase:'pending',hash:h,message:'Submitted. Waiting for validator consensus and finalization.'}));setTx({phase:'success',hash,message:'Finalized successfully. Verifying persisted contract state.'});await after?.();return hash}catch(error:any){setTx({phase:'error',hash:error?.txHash,message:error?.message||'Transaction failed'});throw error}},[account,client,config])
 const value=useMemo(()=>({config,account,walletAvailable,connect,disconnect,tx,transact}),[config,account,walletAvailable,connect,disconnect,tx,transact])
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useTermsGuard(){const v=useContext(Context);if(!v)throw new Error('Providers missing');return v}
