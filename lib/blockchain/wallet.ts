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
  private eventListenersAttached: boolean = false;
  private isConnecting: boolean = false;

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

  // Get the preferred provider (MetaMask first, then Coinbase, then first available)
  private getEthereumProvider(): any {
    if (typeof window === 'undefined') return null;
    const ethereum = (window as any).ethereum;
    if (!ethereum) return null;

    // If ethereum is an array (multiple providers), prefer MetaMask
    if (Array.isArray(ethereum)) {
      // Try to find MetaMask first
      const metaMask = ethereum.find((provider: any) => provider.isMetaMask);
      if (metaMask) return metaMask;
      // Try Coinbase Wallet
      const coinbase = ethereum.find((provider: any) => provider.isCoinbaseWallet);
      if (coinbase) return coinbase;
      // Otherwise use the first provider
      return ethereum[0];
    }

    // If ethereum has providers array (EIP-6963)
    if (ethereum.providers && Array.isArray(ethereum.providers)) {
      const metaMask = ethereum.providers.find((provider: any) => provider.isMetaMask);
      if (metaMask) return metaMask;
      const coinbase = ethereum.providers.find((provider: any) => provider.isCoinbaseWallet);
      if (coinbase) return coinbase;
      return ethereum.providers[0];
    }

    // Single provider - check if it's actually an array wrapped
    if (ethereum.isMetaMask) return ethereum;
    if (ethereum.isCoinbaseWallet) return ethereum;

    // Single provider
    return ethereum;
  }

  // Get MetaMask provider
  private getProvider(): ethers.BrowserProvider | null {
    if (typeof window === 'undefined') return null;
    if (!WalletManager.isMetaMaskInstalled()) return null;
    
    try {
      const ethereumProvider = this.getEthereumProvider();
      if (!ethereumProvider) return null;
      return new ethers.BrowserProvider(ethereumProvider);
    } catch (error) {
      console.error('Error creating provider:', error);
      return null;
    }
  }

  // Connect wallet
  async connect(): Promise<WalletState> {
    // Prevent infinite recursion
    if (this.isConnecting) {
      return this.walletState;
    }

    if (!WalletManager.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
    }

    const provider = this.getProvider();
    if (!provider) {
      throw new Error('Failed to connect to MetaMask');
    }

    this.isConnecting = true;

    try {
      const ethereumProvider = this.getEthereumProvider();
      if (!ethereumProvider) {
        throw new Error('No wallet provider found');
      }

      // Request account access
      await ethereumProvider.request({ method: 'eth_requestAccounts' });
      
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

      // Attach event listeners only once
      if (!this.eventListenersAttached) {
        this.attachEventListeners(ethereumProvider);
        this.eventListenersAttached = true;
      }

      return this.walletState;
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('User rejected the connection request');
      }
      throw new Error(`Failed to connect wallet: ${error.message}`);
    } finally {
      this.isConnecting = false;
    }
  }

  // Attach event listeners with guards to prevent recursion
  private attachEventListeners(ethereumProvider: any): void {
    // Remove any existing listeners first to prevent duplicates
    try {
      ethereumProvider.removeAllListeners('accountsChanged');
      ethereumProvider.removeAllListeners('chainChanged');
    } catch (e) {
      // Some providers don't support removeAllListeners
    }

    let accountsChangedTimeout: NodeJS.Timeout | null = null;
    let chainChangedTimeout: NodeJS.Timeout | null = null;

    // Listen for account changes
    ethereumProvider.on('accountsChanged', (accounts: string[]) => {
      if (this.isConnecting) return; // Prevent recursion
      
      // Clear any pending timeout
      if (accountsChangedTimeout) {
        clearTimeout(accountsChangedTimeout);
      }
      
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        // Use setTimeout to break the call stack and debounce
        accountsChangedTimeout = setTimeout(() => {
          if (!this.isConnecting) {
            this.isConnecting = true;
            this.connect()
              .catch(console.error)
              .finally(() => {
                setTimeout(() => {
                  this.isConnecting = false;
                }, 500);
              });
          }
        }, 300);
      }
    });

    // Listen for chain changes
    ethereumProvider.on('chainChanged', () => {
      if (this.isConnecting) return; // Prevent recursion
      
      // Clear any pending timeout
      if (chainChangedTimeout) {
        clearTimeout(chainChangedTimeout);
      }
      
      // Use setTimeout to break the call stack and debounce
      chainChangedTimeout = setTimeout(() => {
        if (!this.isConnecting) {
          this.isConnecting = true;
          this.connect()
            .catch(console.error)
            .finally(() => {
              setTimeout(() => {
                this.isConnecting = false;
              }, 500);
            });
        }
      }, 300);
    });
  }

  // Switch to Base network
  async switchToBase(): Promise<void> {
    if (!WalletManager.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    const ethereumProvider = this.getEthereumProvider();
    if (!ethereumProvider) {
      throw new Error('No wallet provider found');
    }

    try {
      await ethereumProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_NETWORK.chainId }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await ethereumProvider.request({
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
    this.isConnecting = false;
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

