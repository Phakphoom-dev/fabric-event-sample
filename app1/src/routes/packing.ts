import { Router } from "express";
import {
  chaincodeName,
  channelName,
  createAsset,
  getConnection,
  updateAsset,
} from "../utils/connect";

const express = require("express");
const router: Router = express.Router();

router.post("/", async (req, res) => {
  const { gateway } = await getConnection();

  const network = gateway.getNetwork(channelName);
  const contract = network.getContract(chaincodeName);

  const firstBlockNumber = await createAsset(contract);
  await updateAsset(contract);

  res.send("Create a new Packing");
});

router.patch("/", async (req, res) => {
  const { gateway } = await getConnection();

  const network = gateway.getNetwork(channelName);
  const contract = network.getContract(chaincodeName);

  await updateAsset(contract);

  res.send("Update Packing");
});

export default router;
