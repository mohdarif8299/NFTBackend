import dotenv from 'dotenv';
import express from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from 'fs/promises';
import pidusage from 'pidusage';
import { MongoClient } from 'mongodb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const { RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS, MONGO_URI } = process.env;
if (![RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS, MONGO_URI].every(Boolean)) {
  console.error('Missing required environment variables');
  process.exit(1);
}

let contractABI;
try {
  contractABI = JSON.parse(
    await fs.readFile(new URL('./MetaverseObjectsABI.json', import.meta.url), 'utf-8')
  );
} catch (error) {
  console.error('Failed to load contract ABI:', error);
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

let mintedObjectsCollection;
const mongoClient = new MongoClient(MONGO_URI);
try {
  await mongoClient.connect();
  const db = mongoClient.db('metaverse-objects');
  mintedObjectsCollection = db.collection('mintedObjects');
  console.log('Connected to MongoDB Atlas');
} catch (error) {
  console.error('Failed to connect to MongoDB Atlas:', error);
  process.exit(1);
}

// KPI Tracking Variables
let totalTransactions = 0;
let successfulTransactions = 0;
let failedTransactions = 0;
let totalRequestDuration = 0; 
let totalCpuUsage = 0; 
let totalMemoryUsage = 0;

app.use(express.json());

async function trackMetrics(start, end, success, action) {
  totalTransactions++;
  const requestDuration = end - start;
  totalRequestDuration += requestDuration;

  const stats = await pidusage(process.pid);
  const cpuUsage = stats.cpu;
  const memoryUsage = stats.memory / 1024 / 1024; 
  totalCpuUsage += cpuUsage;
  totalMemoryUsage += memoryUsage;

  if (success) {
    successfulTransactions++;
    console.log(`[SUCCESS] Action: ${action}`);
  } else {
    failedTransactions++;
    console.log(`[FAILED] Action: ${action}`);
  }

  console.log(`Request Duration: ${requestDuration} ms`);
  console.log(`CPU Usage: ${cpuUsage}%`);
  console.log(`Memory Usage: ${memoryUsage} MB`);
}

app.use(async (req, res, next) => {
  const start = Date.now();
  res.on('finish', async () => {
    const end = Date.now();
    const success = res.statusCode < 400; 
    await trackMetrics(start, end, success, req.url); 
  });
  next();
});

const generateSimpleDID = () => {
  const did = `did:mynft:${crypto.randomBytes(16).toString('hex')}`;
  return { did, didDocument: { id: did, '@context': 'https://www.w3.org/ns/did/v1' } };
};

// Mint NFT Endpoint
app.post('/mint', async (req, res) => {
  const { recipient, tokenURI } = req.body;
  if (!recipient || !tokenURI) {
    return res.status(400).json({ error: 'Recipient and tokenURI are required' });
  }

  try {
    console.log(`[ACTION] Minting a single NFT for recipient: ${recipient} with tokenURI: ${tokenURI}`);
    
    const existingMint = await mintedObjectsCollection.findOne({ tokenURI });
    if (existingMint) {
      const owner = await contract.ownerOf(existingMint.tokenId);
      console.log(`[INFO] Object already minted with tokenId: ${existingMint.tokenId} owned by: ${owner}`);
      return res.status(200).json({
        message: 'Object already minted',
        tokenId: existingMint.tokenId,
        owner,
      });
    }

    const did = generateSimpleDID();
    const tx = await contract.mintObject(recipient, tokenURI, did.did);
    const receipt = await tx.wait();

    const mintEvent = receipt.logs.find(log => log.eventName === 'Transfer');
    const tokenId = mintEvent.args[2].toString();
    const owner = await contract.ownerOf(tokenId);

    await mintedObjectsCollection.insertOne({ tokenURI, tokenId, did: did.did });

    console.log(`[SUCCESS] Minted NFT with tokenId: ${tokenId} for recipient: ${recipient}`);
    res.status(200).json({
      message: 'Object minted successfully',
      txHash: tx.hash,
      did: did.did,
      tokenId,
      owner,
    });
  } catch (error) {
    console.error(`[ERROR] Minting single NFT failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to mint object' });
  }
});

// Mint Batch NFTs 
app.post('/mintBatch', async (req, res) => {
  const { recipient, tokenURIs } = req.body;
  if (!recipient || !Array.isArray(tokenURIs)) {
    return res.status(400).json({ error: 'Recipient and tokenURIs are required' });
  }

  try {
    console.log(`[ACTION] Minting batch NFTs for recipient: ${recipient} with ${tokenURIs.length} tokenURIs`);

    // Check for already minted tokenURIs
    const alreadyMintedURIs = await mintedObjectsCollection
      .find({ tokenURI: { $in: tokenURIs } })
      .toArray();

    const alreadyMintedMap = new Map();
    alreadyMintedURIs.forEach((obj) => {
      alreadyMintedMap.set(obj.tokenURI, obj.tokenId);
    });

    // Filter out tokenURIs that are not minted yet
    const tokenURIsToMint = tokenURIs.filter(uri => !alreadyMintedMap.has(uri));

    if (tokenURIsToMint.length === 0) {
      console.log(`[INFO] All provided tokenURIs are already minted.`);
      return res.status(200).json({
        message: 'All tokenURIs are already minted',
        alreadyMinted: alreadyMintedMap
      });
    }

    // Generate DIDs for the tokenURIs to mint
    const didsToMint = tokenURIsToMint.map(() => generateSimpleDID().did);

    // Perform batch minting for only the new tokenURIs
    const tx = await contract.mintBatch(recipient, tokenURIsToMint, didsToMint);
    const receipt = await tx.wait();

    const mintEvents = receipt.logs.filter(log => log.eventName === 'Transfer');
    const tokenIdsToMint = mintEvents.map(event => event.args[2].toString());

    // Insert new minted objects into MongoDB
    const mintObjects = tokenURIsToMint.map((uri, index) => ({
      tokenURI: uri,
      tokenId: tokenIdsToMint[index],
      did: didsToMint[index]
    }));
    await mintedObjectsCollection.insertMany(mintObjects);

    console.log(`[SUCCESS] Batch minting completed with ${tokenIdsToMint.length} NFTs minted`);

    res.status(200).json({
      message: 'Batch minting successful',
      txHash: tx.hash,
      minted: mintObjects,
      alreadyMinted: alreadyMintedMap
    });
  } catch (error) {
    console.error(`[ERROR] Batch minting failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to mint batch objects' });
  }
});

// Transfer NFT
app.post('/transfer', async (req, res) => {
  const { from, to, tokenId } = req.body;
  if (!from || !to || !tokenId) {
    return res.status(400).json({ error: 'From, to, and tokenId are required' });
  }

  try {
    console.log(`[ACTION] Transferring NFT tokenId: ${tokenId} from: ${from} to: ${to}`);
    
    const tx = await contract.transferFrom(from, to, tokenId);
    const receipt = await tx.wait();

    console.log(`[SUCCESS] NFT tokenId: ${tokenId} transferred from ${from} to ${to}`);
    res.status(200).json({ message: 'Transfer successful', txHash: receipt.transactionHash });
  } catch (error) {
    console.error(`[ERROR] Transfer failed: ${error.message}`);
    res.status(500).json({ error: 'Transfer failed', details: error.message });
  }
});

// Get Owner of a Token
app.get('/owner/:tokenId', async (req, res) => {
  const { tokenId } = req.params;

  try {
    console.log(`[ACTION] Fetching owner of tokenId: ${tokenId}`);
    
    const owner = await contract.ownerOf(tokenId);
    console.log(`[SUCCESS] Owner of tokenId: ${tokenId} is: ${owner}`);
    res.status(200).json({ owner });
  } catch (error) {
    console.error(`[ERROR] Fetching owner failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch owner', details: error.message });
  }
});

// Validate Owner of a Token
app.get('/validateOwner', async (req, res) => {
  const { claimant, tokenId } = req.query;
  if (!claimant || !tokenId) {
    return res.status(400).json({ error: 'Claimant and tokenId are required' });
  }
  try {
    const isOwner = await contract.isOwner(claimant, tokenId);
    res.status(200).json({ isOwner });
  } catch (error) {
    console.error('Error validating owner:', error);
    res.status(500).json({ error: 'Failed to validate owner', details: error.message });
  }
});

// Get All Minted NFTs
app.get('/nfts', async (req, res) => {
  try {
    const nfts = await mintedObjectsCollection.find().toArray();
    res.status(200).json(nfts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', err);
  failedTransactions++;
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});