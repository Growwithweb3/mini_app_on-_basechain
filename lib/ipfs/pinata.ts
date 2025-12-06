// Pinata IPFS integration for NFT metadata storage

const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY || '';
const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY || '';
const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || '';

export interface PinataMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export class PinataManager {
  // Upload JSON metadata to IPFS
  static async uploadMetadata(metadata: PinataMetadata): Promise<string> {
    try {
      // Option 1: Using JWT (recommended)
      if (PINATA_JWT) {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PINATA_JWT}`,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: metadata.name,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Pinata API error: ${response.statusText}`);
        }

        const data = await response.json();
        return `ipfs://${data.IpfsHash}`;
      }

      // Option 2: Using API Key and Secret
      if (PINATA_API_KEY && PINATA_SECRET_KEY) {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: metadata.name,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Pinata API error: ${response.statusText}`);
        }

        const data = await response.json();
        return `ipfs://${data.IpfsHash}`;
      }

      throw new Error('Pinata credentials not configured');
    } catch (error: any) {
      console.error('Error uploading to Pinata:', error);
      throw new Error(`Failed to upload metadata: ${error.message}`);
    }
  }

  // Upload image to IPFS
  static async uploadImage(imageFile: File | Blob, fileName: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', imageFile, fileName);

      const metadata = JSON.stringify({
        name: fileName,
      });
      formData.append('pinataMetadata', metadata);

      const options = JSON.stringify({
        cidVersion: 0,
      });
      formData.append('pinataOptions', options);

      // Option 1: Using JWT
      if (PINATA_JWT) {
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PINATA_JWT}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Pinata API error: ${response.statusText}`);
        }

        const data = await response.json();
        return `ipfs://${data.IpfsHash}`;
      }

      // Option 2: Using API Key and Secret
      if (PINATA_API_KEY && PINATA_SECRET_KEY) {
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Pinata API error: ${response.statusText}`);
        }

        const data = await response.json();
        return `ipfs://${data.IpfsHash}`;
      }

      throw new Error('Pinata credentials not configured');
    } catch (error: any) {
      console.error('Error uploading image to Pinata:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  }

  // Create NFT metadata for achievement
  static createAchievementMetadata(
    achievementName: string,
    achievementDescription: string,
    imageIpfsHash: string,
    level?: number,
    score?: number
  ): PinataMetadata {
    const attributes: Array<{ trait_type: string; value: string | number }> = [];
    
    if (level) {
      attributes.push({ trait_type: 'Level', value: level });
    }
    if (score) {
      attributes.push({ trait_type: 'Score', value: score });
    }
    attributes.push({ trait_type: 'Type', value: 'Achievement' });
    attributes.push({ trait_type: 'Game', value: 'Base the Shooter' });

    return {
      name: achievementName,
      description: achievementDescription,
      image: imageIpfsHash,
      attributes,
    };
  }
}

