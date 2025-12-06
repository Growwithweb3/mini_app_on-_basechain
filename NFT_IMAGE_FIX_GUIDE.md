# NFT Image Not Showing - Verification & Fix Guide

## 🔍 How to Check What's Wrong

### Step 1: Get the Token URI from BaseScan

1. Go to your NFT on BaseScan:
   - Contract: `0x88CD19357220A23FBcE6bf66B477013b2A1E9f22`
   - Token ID: Check your minted NFT (e.g., Token ID: 2)

2. On BaseScan, click **"Read Contract"** tab

3. Find function: **`tokenURI`**
   - Enter your Token ID (e.g., `2`)
   - Click **"Query"**
   - Copy the result (should be `ipfs://Qm...` or `https://...`)

### Step 2: View the Metadata JSON

1. Convert IPFS URL to gateway URL:
   - If you got: `ipfs://QmHash123...`
   - Use: `https://gateway.pinata.cloud/ipfs/QmHash123...`
   - Or: `https://ipfs.io/ipfs/QmHash123...`

2. Open that URL in your browser
   - You should see JSON like:
   ```json
   {
     "name": "Combo Legend",
     "description": "Get a 10x combo",
     "image": "https://gateway.pinata.cloud/ipfs/QmImageHash...",
     "attributes": [...]
   }
   ```

### Step 3: Check the Image URL

1. Look at the `"image"` field in the JSON
2. Copy that URL and open it in a new browser tab
3. **Does the image load?**
   - ✅ **YES** → The image is fine, issue is with BaseScan/MetaMask
   - ❌ **NO** → The image URL is wrong or image wasn't uploaded

### Step 4: Common Issues & Fixes

#### Issue 1: Image URL is `ipfs://` format
**Problem:** `"image": "ipfs://QmHash..."`
**Fix:** Should be `"image": "https://gateway.pinata.cloud/ipfs/QmHash..."`

#### Issue 2: Image URL has placeholder
**Problem:** `"image": "https://gateway.pinata.cloud/ipfs/YOUR_IMAGE_HASH_HERE"`
**Fix:** Image upload failed. Check Pinata configuration.

#### Issue 3: Image URL returns 404
**Problem:** URL exists but image doesn't load
**Fix:** Image wasn't uploaded to IPFS properly

## 🛠️ What to Check

### Check 1: Pinata Configuration
1. Open `.env.local` file
2. Verify: `NEXT_PUBLIC_PINATA_JWT=eyJ...` (your JWT token)
3. Make sure there are no extra spaces or quotes

### Check 2: Image File Exists
1. File should be at: `public/images/I trust on base.png`
2. File should be a valid PNG image
3. File size should be reasonable (< 10MB)

### Check 3: Browser Console
1. Open browser console (F12)
2. When minting, look for:
   - `✅ Image uploaded and converted to gateway URL: https://...`
   - `📋 Metadata to upload: {...}`
   - `🖼️ Image URL in metadata: https://...`

### Check 4: Pinata Dashboard
1. Go to https://app.pinata.cloud/
2. Check **"Files"** section
3. You should see:
   - Your image file: `achievement-first_kill.png` (or similar)
   - Your metadata JSON files
4. Click on image file → Copy IPFS hash
5. Test: `https://gateway.pinata.cloud/ipfs/YOUR_HASH`

## 🔧 Quick Test

Run this in browser console after minting:

```javascript
// Replace with your contract address and token ID
const contractAddress = '0x88CD19357220A23FBcE6bf66B477013b2A1E9f22';
const tokenId = 2; // Your token ID

// Get tokenURI
const provider = new ethers.BrowserProvider(window.ethereum);
const contract = new ethers.Contract(
  contractAddress,
  ['function tokenURI(uint256) view returns (string)'],
  provider
);

const tokenURI = await contract.tokenURI(tokenId);
console.log('Token URI:', tokenURI);

// Convert to gateway URL
const metadataUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
console.log('Metadata URL:', metadataUrl);

// Fetch metadata
const metadata = await fetch(metadataUrl).then(r => r.json());
console.log('Metadata:', metadata);
console.log('Image URL:', metadata.image);

// Test image
const img = new Image();
img.onload = () => console.log('✅ Image loads!');
img.onerror = () => console.error('❌ Image failed to load');
img.src = metadata.image;
```

## 📝 What to Report

If image still doesn't show, provide:
1. Token ID of the broken NFT
2. The `tokenURI` value from BaseScan
3. The metadata JSON (from gateway URL)
4. Console logs from minting
5. Whether image URL works when opened directly in browser

