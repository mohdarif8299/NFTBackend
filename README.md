# Metaverse Objects NFT API

This API provides endpoints for minting, transferring, and managing NFTs (Non-Fungible Tokens) for metaverse objects. It uses the Ethereum blockchain and MongoDB for data storage.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the Server](#running-the-server)
5. [API Endpoints](#api-endpoints)
   - [Mint Single NFT](#mint-single-nft)
   - [Mint Batch NFTs](#mint-batch-nfts)
   - [Transfer NFT](#transfer-nft)
   - [Get Owner of Token](#get-owner-of-token)
   - [Validate Owner of Token](#validate-owner-of-token)
   - [Get All Minted NFTs](#get-all-minted-nfts)
6. [Error Handling](#error-handling)
7. [Metrics Tracking](#metrics-tracking)

## Prerequisites

- Node.js (v14 or higher recommended)
- MongoDB Atlas account
- Ethereum wallet with some ETH for gas fees
- Ethereum RPC endpoint (e.g., Infura, Alchemy)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
RPC_URL=<your-ethereum-rpc-url>
PRIVATE_KEY=<your-ethereum-wallet-private-key>
CONTRACT_ADDRESS=<your-nft-contract-address>
MONGO_URI=<your-mongodb-atlas-connection-string>
```

Ensure you have the `MetaverseObjectsABI.json` file in the same directory as your main script.

## Running the Server

Start the server with:

```
node <your-main-script-name>.js
```

The server will start on the specified PORT (default: 3000).

## API Endpoints

### Mint Single NFT

Mints a single NFT for the specified recipient.

- **URL**: `/mint`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "recipient": "0x1234...",
    "tokenURI": "https://example.com/metadata/1"
  }
  ```
- **cURL Example**:
  ```bash
  curl -X POST http://localhost:3000/mint \
    -H "Content-Type: application/json" \
    -d '{"recipient": "0x1234...", "tokenURI": "https://example.com/metadata/1"}'
  ```

### Mint Batch NFTs

Mints multiple NFTs for the specified recipient.

- **URL**: `/mintBatch`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "recipient": "0x1234...",
    "tokenURIs": [
      "https://example.com/metadata/1",
      "https://example.com/metadata/2"
    ]
  }
  ```
- **cURL Example**:
  ```bash
  curl -X POST http://localhost:3000/mintBatch \
    -H "Content-Type: application/json" \
    -d '{"recipient": "0x1234...", "tokenURIs": ["https://example.com/metadata/1", "https://example.com/metadata/2"]}'
  ```

### Transfer NFT

Transfers an NFT from one address to another.

- **URL**: `/transfer`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "from": "0x1234...",
    "to": "0x5678...",
    "tokenId": "1"
  }
  ```
- **cURL Example**:
  ```bash
  curl -X POST http://localhost:3000/transfer \
    -H "Content-Type: application/json" \
    -d '{"from": "0x1234...", "to": "0x5678...", "tokenId": "1"}'
  ```

### Get Owner of Token

Retrieves the current owner of a specific token.

- **URL**: `/owner/:tokenId`
- **Method**: `GET`
- **cURL Example**:
  ```bash
  curl http://localhost:3000/owner/1
  ```

### Validate Owner of Token

Checks if a given address is the owner of a specific token.

- **URL**: `/validateOwner`
- **Method**: `GET`
- **Query Parameters**: `claimant`, `tokenId`
- **cURL Example**:
  ```bash
  curl "http://localhost:3000/validateOwner?claimant=0x1234...&tokenId=1"
  ```

### Get All Minted NFTs

Retrieves a list of all minted NFTs.

- **URL**: `/nfts`
- **Method**: `GET`
- **cURL Example**:
  ```bash
  curl http://localhost:3000/nfts
  ```

## Error Handling

The API uses a global error handler to catch and respond to any unhandled errors. Errors are logged to the console and returned to the client with appropriate HTTP status codes.

## Metrics Tracking

The API tracks various metrics for performance monitoring:

- Total transactions
- Successful transactions
- Failed transactions
- Total request duration
- CPU usage
- Memory usage

These metrics are logged to the console for each request.
