// NFT minting utilities for achievements

import { ethers } from 'ethers';
import { walletManager } from './wallet';
import { PinataManager } from '../ipfs/pinata';

export interface NFTConfig {
  contractAddress: string;
  contractABI: any[];
}

// Note: ABI is imported from config.ts

// Achievement NFT Contract ABI (minimal for minting)
// Note: The full ABI is imported from config.ts and used via this.config.contractABI
// This is kept for reference only
const ACHIEVEMENT_NFT_ABI = [
  "function mintAchievement(address to, string memory achievementId, string memory metadataURI) public",
  "function isAchievementMinted(string memory achievementId, address user) public view returns (bool)",
  "function tokenURI(uint256 tokenId) public view returns (string memory)",
  "event AchievementMinted(address indexed to, uint256 indexed tokenId, string indexed achievementId)"
];

export class NFTManager {
  private config: NFTConfig | null = null;

  // Set contract configuration
  setConfig(config: NFTConfig): void {
    this.config = config;
  }

  // Get contract instance
  private async getContract(): Promise<ethers.Contract> {
    if (!this.config) {
      throw new Error('NFT contract not configured. Please set contract address and ABI.');
    }

    const signer = walletManager.getSigner();
    if (!signer) {
      throw new Error('Wallet not connected');
    }

    return new ethers.Contract(
      this.config.contractAddress,
      this.config.contractABI,
      signer
    );
  }

  // Check if achievement is already minted
  async isAchievementMinted(achievementId: string, userAddress: string): Promise<boolean> {
    if (!this.config) return false;

    try {
      const provider = walletManager.getProviderInstance();
      if (!provider) return false;

      const contract = new ethers.Contract(
        this.config.contractAddress,
        this.config.contractABI,
        provider
      );

      return await contract.isAchievementMinted(achievementId, userAddress);
    } catch (error) {
      console.error('Error checking achievement mint status:', error);
      return false;
    }
  }

  // Mint achievement NFT
  async mintAchievement(
    achievementId: string,
    achievementName: string,
    achievementDescription: string,
    imageUrl: string, // Can be IPFS hash or direct URL
    level?: number,
    score?: number
  ): Promise<{ txHash: string; tokenId?: number }> {
    if (!this.config) {
      throw new Error('NFT contract not configured');
    }

    if (!walletManager.isConnected()) {
      throw new Error('Wallet not connected');
    }

    const address = walletManager.getState().address;
    if (!address) {
      throw new Error('Wallet address not found');
    }

    try {
      // Check if already minted
      const alreadyMinted = await this.isAchievementMinted(achievementId, address);
      if (alreadyMinted) {
        throw new Error('Achievement already minted');
      }

      // Upload metadata to IPFS
      let imageIpfsHash = imageUrl;
      
      // If imageUrl is a local path, we need to upload it first
      // For now, we'll use the direct URL or IPFS hash
      // You can enhance this to upload images to IPFS if needed
      
      const metadata = PinataManager.createAchievementMetadata(
        achievementName,
        achievementDescription,
        imageIpfsHash,
        level,
        score
      );

      // Log metadata before uploading (for debugging)
      console.log('📋 Metadata to upload:', JSON.stringify(metadata, null, 2));
      console.log('🖼️  Image URL in metadata:', metadata.image);
      
      // Verify image URL is accessible before minting
      if (metadata.image.startsWith('https://')) {
        try {
          const imageTest = await fetch(metadata.image, { method: 'HEAD' });
          if (!imageTest.ok) {
            console.warn('⚠️  Warning: Image URL returned status', imageTest.status);
          } else {
            console.log('✅ Image URL is accessible:', metadata.image);
          }
        } catch (error) {
          console.warn('⚠️  Warning: Could not verify image URL:', error);
        }
      }

      // Upload metadata to IPFS
      const metadataIpfsHash = await PinataManager.uploadMetadata(metadata);
      console.log('📤 Metadata uploaded to IPFS:', metadataIpfsHash);
      
      // Convert metadata IPFS hash to gateway URL for verification
      let metadataGatewayUrl = '';
      if (metadataIpfsHash.startsWith('ipfs://')) {
        const hash = metadataIpfsHash.replace('ipfs://', '');
        metadataGatewayUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
        console.log('🔗 Metadata gateway URL:', metadataGatewayUrl);
        console.log('💡 You can open this URL in browser to verify metadata JSON');
      }

      // Get contract and mint
      const contract = await this.getContract();
      
      // Estimate gas
      const gasEstimate = await contract.mintAchievement.estimateGas(
        address,
        achievementId,
        metadataIpfsHash
      );

      // Mint NFT
      const tx = await contract.mintAchievement(
        address,
        achievementId,
        metadataIpfsHash,
        {
          gasLimit: gasEstimate * BigInt(120) / BigInt(100), // Add 20% buffer
        }
      );

      console.log('Transaction sent:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (!receipt) {
        throw new Error('Transaction failed');
      }

      // Get token ID from event
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed && parsed.name === 'AchievementMinted';
        } catch {
          return false;
        }
      });

      let tokenId: number | undefined;
      if (event) {
        const parsed = contract.interface.parseLog(event);
        if (parsed) {
          tokenId = Number(parsed.args.tokenId);
        }
      }

      return {
        txHash: tx.hash,
        tokenId,
      };
    } catch (error: any) {
      console.error('Error minting NFT:', error);
      if (error.code === 4001) {
        throw new Error('User rejected the transaction');
      }
      if (error.message?.includes('already minted')) {
        throw new Error('This achievement has already been minted');
      }
      throw new Error(`Failed to mint NFT: ${error.message || 'Unknown error'}`);
    }
  }
}

// Singleton instance
export const nftManager = new NFTManager();

