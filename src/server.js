import dotenv from 'dotenv';
import express from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables
const { RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;

if (!RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Load the contract ABI
let contractABI;
try {
  contractABI = JSON.parse(
    await fs.readFile(new URL('./MetaverseObjectsABI.json', import.meta.url), 'utf-8')
  );
} catch (error) {
  console.error('Failed to load contract ABI:', error);
  process.exit(1);
}

// Configure the provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

app.use(express.json());

// In-memory storage for minted objects (replace with a database in production)
const mintedObjects = new Map();

// Function to generate a simple DID
function generateSimpleDID() {
  const randomBytes = crypto.randomBytes(16);
  const did = `did:example:${randomBytes.toString('hex')}`;
  return { did, didDocument: { id: did, '@context': 'https://www.w3.org/ns/did/v1' } };
}

// Middleware for error handling
const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    console.error('Route error:', error);
    next(error);
  }
};

// Helper function to safely convert BigInt to string
function bigIntToString(value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

// Modified mint function
app.post('/mint', asyncHandler(async (req, res) => {
  const { recipient, tokenURI } = req.body;
  if (!recipient || !tokenURI) {
    return res.status(400).json({ error: 'Recipient and tokenURI are required' });
  }

  // Check if the object has already been minted
  if (mintedObjects.has(tokenURI)) {
    const existingTokenId = mintedObjects.get(tokenURI);
    return res.status(200).json({
      message: 'Object already minted',
      tokenId: bigIntToString(existingTokenId),
      alreadyMinted: true
    });
  }

  // If not minted, proceed with minting
  const { did } = generateSimpleDID();
  const tx = await contract.mintObject(recipient, tokenURI, did);
  const receipt = await tx.wait();

  // Extract the tokenId from the event logs
  const mintEvent = receipt.logs.find(log => log.eventName === 'Transfer');
  const tokenId = mintEvent.args[2]; // Assuming the tokenId is the third argument in the Transfer event

  // Store the minted object information
  mintedObjects.set(tokenURI, tokenId);

  res.status(200).json({
    message: 'Object minted successfully',
    txHash: tx.hash,
    did,
    tokenId: bigIntToString(tokenId),
    alreadyMinted: false
  });
}));

// Other routes remain the same
app.post('/generateDID', asyncHandler(async (req, res) => {
  const { did, didDocument } = generateSimpleDID();
  res.status(200).json({ did, didDocument });
}));

app.post('/mintBatch', asyncHandler(async (req, res) => {
  const { recipient, tokenURIs } = req.body;
  if (!recipient || !Array.isArray(tokenURIs)) {
    return res.status(400).json({ error: 'Recipient and tokenURIs are required' });
  }
  const dids = tokenURIs.map(() => generateSimpleDID().did);
  const tx = await contract.mintBatch(recipient, tokenURIs, dids);
  const receipt = await tx.wait();
  
  // Extract tokenIds from the event logs (adjust this based on your contract's event structure)
  const mintEvents = receipt.logs.filter(log => log.eventName === 'Transfer');
  const tokenIds = mintEvents.map(event => bigIntToString(event.args[2]));

  res.status(200).json({ 
    message: 'Batch minting successful', 
    txHash: tx.hash, 
    dids,
    tokenIds
  });
}));

app.post('/transfer', asyncHandler(async (req, res) => {
  const { from, to, tokenId } = req.body;
  if (!from || !to || !tokenId) {
    return res.status(400).json({ error: 'From, to, and tokenId are required' });
  }
  const tx = await contract.transferObject(from, to, tokenId);
  await tx.wait();
  res.status(200).json({ message: 'Transfer successful', txHash: tx.hash });
}));

app.get('/owner/:tokenId', asyncHandler(async (req, res) => {
  const { tokenId } = req.params;
  const owner = await contract.ownerOf(tokenId);
  res.status(200).json({ owner });
}));

app.get('/validateOwner', asyncHandler(async (req, res) => {
  const { claimant, tokenId } = req.query;
  if (!claimant || !tokenId) {
    return res.status(400).json({ error: 'Claimant and tokenId are required' });
  }
  const isOwner = await contract.isOwner(claimant, tokenId);
  res.status(200).json({ isOwner });
}));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});