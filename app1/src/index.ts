// src/index.ts
import express from "express";
import packingRoutes from "./routes/packing";
import {
  chaincodeName,
  channelName,
  createAsset,
  getConnection,
  startEventListening,
  updateAsset,
} from "./utils/connect";
import { ChaincodeEvent, CloseableAsyncIterable } from "@hyperledger/fabric-gateway";

const app = express();
const port = 3500;

app.use("/packing", packingRoutes);

app.get("/", (req, res) => {
  res.send("Hello, TypeScript with Express!");
});

app.listen(port, async () => {
  console.log(`Server is running on http://localhost:${port}`);

  const { client, gateway } = await getConnection();

  let events: CloseableAsyncIterable<ChaincodeEvent> | undefined;

  try {
    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    await startEventListening(network);

    // const firstBlockNumber = await createAsset(contract);
    // await updateAsset(contract);
  } finally {
    events?.close();
    gateway.close();
    client.close();
  }
});
