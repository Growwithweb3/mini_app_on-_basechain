// Wallet connection button component

'use client';

import React, { useState, useEffect } from 'react';
import { walletManager, WalletManager } from '@/lib/blockchain/wallet';

interface WalletButtonProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
}

export const WalletButton: React.FC<WalletButtonProps> = ({ onConnect, onDisconnect }) => {
  const [walletState, setWalletState] = useState({
    connected: false,
    address: null as string | null,
    chainId: null as number | null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check wallet connection on mount
  useEffect(() => {
    checkConnection();
    
    // Listen for wallet changes
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, []);

  const checkConnection = async () => {
    if (!WalletManager.isMetaMaskInstalled()) {
      return;
    }

    try {
      const provider = walletManager.getProviderInstance();
      if (!provider) return;

      const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const state = walletManager.getState();
        setWalletState({
          connected: state.connected,
          address: state.address,
          chainId: state.chainId,
        });
        if (state.address && onConnect) {
          onConnect(state.address);
        }
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      handleDisconnect();
    } else {
      checkConnection();
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!WalletManager.isMetaMaskInstalled()) {
        setError('MetaMask is not installed. Please install MetaMask to continue.');
        setIsConnecting(false);
        return;
      }

      const state = await walletManager.connect();
      setWalletState({
        connected: state.connected,
        address: state.address,
        chainId: state.chainId,
      });

      if (state.address && onConnect) {
        onConnect(state.address);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    walletManager.disconnect();
    setWalletState({
      connected: false,
      address: null,
      chainId: null,
    });
    if (onDisconnect) {
      onDisconnect();
    }
  };

  const formatAddress = (address: string | null): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!WalletManager.isMetaMaskInstalled()) {
    return (
      <div className="text-center">
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-colors"
        >
          Install MetaMask
        </a>
      </div>
    );
  }

  if (walletState.connected && walletState.address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-green-900/50 border border-green-500 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-green-200 font-mono text-sm">
              {formatAddress(walletState.address)}
            </span>
          </div>
          {walletState.chainId !== 8453 && walletState.chainId !== 84532 && (
            <div className="text-yellow-400 text-xs mt-1">
              Switch to Base network
            </div>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center gap-2"
      >
        {isConnecting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Connect Wallet
          </>
        )}
      </button>
      {error && (
        <div className="mt-2 text-red-400 text-sm">{error}</div>
      )}
    </div>
  );
};

