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
import { format } from "date-fns";

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
  "User1@org1.example.com",
  "msp",
  "keystore"
);

// Path to user certificate.
const certDirectoryPath = path.resolve(
  cryptoPath,
  "users",
  "User1@org1.example.com",
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
): Promise<CloseableAsyncIterable<ChaincodeEvent> | void> {
  console.log("\n*** Start chaincode event listening");

  const events = await network.getChaincodeEvents(chaincodeName);
  const stamp = Date.now();

  try {
    for await (const event of events) {
      const payload = parseJson(event.payload) as any;

      // console.log(
      //   "event received:",
      //   event.eventName,
      //   payload.id,
      //   format(payload.updatedAt, "yyyy-MM-dd HH:mm:ss")
      // );
      console.log(event);
    }
  } finally {
    events.close();
  }

  // readEvents(events);

  return events;
}

export async function readEvents(events: CloseableAsyncIterable<ChaincodeEvent>): Promise<void> {
  try {
    console.log("Read event");

    for await (const event of events) {
      console.log("🚀 ~ forawait ~ event:", event);
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
    id: "a97cd43f-f0fb-44b0-a65b-194d2aecccc0",
    orderId: "14713373-0e98-4022-9a65-8a596073cada",
    farmerId: "23",
    forecastWeight: 555,
    actualWeight: 500,
    isPackerSaved: true,
    savedTime: "2024-05-02 16:20:08",
    isApproved: true,
    approvedDate: "2024-05-02 17:42:57",
    approvedType: "manual",
    finalWeight: 123,
    remark: "ทดสอบโน้ต",
    packerId: "21",
    gmp: "DOA 50000 99 010546",
    updatedAt: "2024-05-02T10:42:57Z",
    createdAt: "2024-05-02T08:23:34Z",
  };

  await contract.submitTransaction("UpdateAsset", JSON.stringify(payload));

  console.log("\n*** UpdateAsset committed successfully");
}
