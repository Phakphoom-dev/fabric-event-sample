import * as crypto from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import {
  ChaincodeEvent,
  CloseableAsyncIterable,
  Gateway,
  GatewayError,
  Network,
  connect,
  Identity,
  Signer,
  signers,
  Contract,
} from "@hyperledger/fabric-gateway";
import { Client } from "@grpc/grpc-js";
import * as grpc from "@grpc/grpc-js";

export const mspId = "Org1MSP";
export const channelName = "mychannel";
export const chaincodeName = "packing";

export const utf8Decoder = new TextDecoder();
export const now = Date.now();
export const assetId = `asset${now}`;

// Path to crypto materials.
const cryptoPath = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "fabric-samples",
  "test-network",
  "organizations",
  "peerOrganizations",
  "org1.example.com"
);

// Path to user private key directory.
const keyDirectoryPath = path.resolve(
  cryptoPath,
  "users",
  "Admin@org1.example.com",
  "msp",
  "keystore"
);

// Path to user certificate.
const certDirectoryPath = path.resolve(
  cryptoPath,
  "users",
  "Admin@org1.example.com",
  "msp",
  "signcerts"
);

// Path to peer tls certificate.
const tlsCertPath = path.resolve(cryptoPath, "peers", "peer0.org1.example.com", "tls", "ca.crt");

// Gateway peer endpoint.
const peerEndpoint = "localhost:7051";

export async function newGrpcConnection(): Promise<grpc.Client> {
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    "grpc.ssl_target_name_override": "peer0.org1.example.com",
  });
}

export async function newIdentity(): Promise<Identity> {
  const certPath = await getFirstDirFileName(certDirectoryPath);
  const credentials = await fs.readFile(certPath);
  return { mspId, credentials };
}

export async function newSigner(): Promise<Signer> {
  const keyPath = await getFirstDirFileName(keyDirectoryPath);
  const privateKeyPem = await fs.readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

async function getFirstDirFileName(dirPath: string): Promise<string> {
  const files = await fs.readdir(dirPath);
  return path.join(dirPath, files[0]);
}

export async function getConnection(): Promise<{ client: Client; gateway: Gateway }> {
  const client = await newGrpcConnection();
  const gateway = connect({
    client,
    identity: await newIdentity(),
    signer: await newSigner(),
    evaluateOptions: () => {
      return { deadline: Date.now() + 5000 }; // 5 seconds
    },
    endorseOptions: () => {
      return { deadline: Date.now() + 15000 }; // 15 seconds
    },
    submitOptions: () => {
      return { deadline: Date.now() + 5000 }; // 5 seconds
    },
    commitStatusOptions: () => {
      return { deadline: Date.now() + 60000 }; // 1 minute
    },
  });

  return { client, gateway };
}

export async function startEventListening(
  network: Network
): Promise<CloseableAsyncIterable<ChaincodeEvent>> {
  console.log("\n*** Start chaincode event listening");

  const events = await network.getChaincodeEvents(chaincodeName);

  void readEvents(events); // Don't await - run asynchronously
  return events;
}

export async function readEvents(events: CloseableAsyncIterable<ChaincodeEvent>): Promise<void> {
  try {
    for await (const event of events) {
      const payload = parseJson(event.payload);
      console.log(`\n<-- Chaincode event received: ${event.eventName} -`, payload);
    }
  } catch (error: unknown) {
    // Ignore the read error when events.close() is called explicitly
    if (!(error instanceof GatewayError) || error.code !== grpc.status.CANCELLED.valueOf()) {
      throw error;
    }
  }
}

export function parseJson(jsonBytes: Uint8Array): unknown {
  const json = utf8Decoder.decode(jsonBytes);
  return JSON.parse(json);
}

export async function createAsset(contract: Contract): Promise<bigint> {
  console.log(
    `\n--> Submit Transaction: CreateAsset, ${assetId} owned by Sam with appraised value 100`
  );

  const result = await contract.submitAsync("CreateAsset", {
    arguments: [assetId, "blue", "10", "Sam", "100"],
  });

  const status = await result.getStatus();
  if (!status.successful) {
    throw new Error(
      `failed to commit transaction ${status.transactionId} with status code ${status.code}`
    );
  }

  console.log("\n*** CreateAsset committed successfully");

  return status.blockNumber;
}

export async function updateAsset(contract: Contract): Promise<void> {
  console.log(`\n--> Submit transaction: UpdateAsset, ${assetId} update appraised value to 200`);

  const payload = {
    id: "42eb95a8-0627-4628-9b6c-69a89ad2eac5",
    orderId: "34fe70ad-a732-4fbc-a31f-1494c961ac80",
    farmerId: "4",
    packerId: "2",
    gmp: "DOA 50000 99 010546",
    forecastWeight: 555,
    actualWeight: 0,
    isPackerSaved: false,
    savedTime: "",
    isApproved: false,
    approvedDate: "",
    approvedType: "",
    finalWeight: 0,
    remark: "",
  };

  await contract.submitTransaction("UpdateAsset", JSON.stringify(payload));

  console.log("\n*** UpdateAsset committed successfully");
}
