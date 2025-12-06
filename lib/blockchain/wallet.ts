// Wallet connection and management utilities

import { ethers } from 'ethers';

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
}

const BASE_CHAIN_ID = 8453; // Base Mainnet
const BASE_CHAIN_ID_TESTNET = 84532; // Base Sepolia (for testing)

// Base network configuration
const BASE_NETWORK = {
  chainId: `0x${BASE_CHAIN_ID.toString(16)}`, // 0x2105
  chainName: 'Base',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

export class WalletManager {
  private static instance: WalletManager;
  private walletState: WalletState = {
    connected: false,
    address: null,
    chainId: null,
    provider: null,
    signer: null,
  };

  private constructor() {}

  static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  // Check if MetaMask is installed
  static isMetaMaskInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).ethereum !== 'undefined';
  }

  // Get MetaMask provider
  private getProvider(): ethers.BrowserProvider | null {
    if (typeof window === 'undefined') return null;
    if (!WalletManager.isMetaMaskInstalled()) return null;
    
    try {
      return new ethers.BrowserProvider((window as any).ethereum);
    } catch (error) {
      console.error('Error creating provider:', error);
      return null;
    }
  }

  // Connect wallet
  async connect(): Promise<WalletState> {
    if (!WalletManager.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
    }

    const provider = this.getProvider();
    if (!provider) {
      throw new Error('Failed to connect to MetaMask');
    }

    try {
      // Request account access
      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      
      // Get signer
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Check if on Base network
      if (chainId !== BASE_CHAIN_ID && chainId !== BASE_CHAIN_ID_TESTNET) {
        // Try to switch to Base
        await this.switchToBase();
        // Get updated network
        const updatedNetwork = await provider.getNetwork();
        const updatedChainId = Number(updatedNetwork.chainId);
        
        this.walletState = {
          connected: true,
          address,
          chainId: updatedChainId,
          provider,
          signer,
        };
      } else {
        this.walletState = {
          connected: true,
          address,
          chainId,
          provider,
          signer,
        };
      }

      // Listen for account changes
      (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnect();
        } else {
          this.connect();
        }
      });

      // Listen for chain changes
      (window as any).ethereum.on('chainChanged', () => {
        this.connect();
      });

      return this.walletState;
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('User rejected the connection request');
      }
      throw new Error(`Failed to connect wallet: ${error.message}`);
    }
  }

  // Switch to Base network
  async switchToBase(): Promise<void> {
    if (!WalletManager.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_NETWORK.chainId }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BASE_NETWORK],
          });
        } catch (addError) {
          throw new Error('Failed to add Base network to MetaMask');
        }
      } else {
        throw new Error('Failed to switch to Base network');
      }
    }
  }

  // Disconnect wallet
  disconnect(): void {
    this.walletState = {
      connected: false,
      address: null,
      chainId: null,
      provider: null,
      signer: null,
    };
  }

  // Get current wallet state
  getState(): WalletState {
    return { ...this.walletState };
  }

  // Check if connected
  isConnected(): boolean {
    return this.walletState.connected && this.walletState.address !== null;
  }

  // Get signer (for contract interactions)
  getSigner(): ethers.JsonRpcSigner | null {
    return this.walletState.signer;
  }

  // Get provider
  getProviderInstance(): ethers.BrowserProvider | null {
    return this.walletState.provider;
  }

  // Sign a message
  async signMessage(message: string): Promise<string> {
    if (!this.walletState.signer) {
      throw new Error('Wallet not connected');
    }
    return await this.walletState.signer.signMessage(message);
  }
}

// Export singleton instance
export const walletManager = WalletManager.getInstance();

