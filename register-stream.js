// register-stream.js
import Moralis from "moralis";
import dotenv from "dotenv";
dotenv.config();

async function setupFullCaptureStream() {
  await Moralis.start({ apiKey: process.env.MORALIS_API_KEY });

  // 1) Create the stream
  const { id: streamId } = (await Moralis.Streams.add({
    webhookUrl:       `${process.env.WEBHOOK_BASE_URL}/webhook/evm`,
    description:      `Full activity for ${process.env.MONITORED_ADDRESS}`,
    tag:              "full_address_activity",
    chains:           ["0xaa36a7"],            // Ethereum Mainnet; use ["0xaa36a7"] for Sepolia
    includeNativeTxs:   true,            // ETH transfers
    includeInternalTxs: true,            // internal TXs
    includeContractLogs: true,           // all event logs
  })).toJSON();
  console.log("✅ Stream created:", streamId);

  // 2) Add your address
  const addRes = await Moralis.Streams.addAddress({
    id:      streamId,
    address: [process.env.MONITORED_ADDRESS],
  });
  console.log("✅ Address added:", process.env.MONITORED_ADDRESS);
}

setupFullCaptureStream().catch(err => {
  console.error("❌ Failed to set up stream:", err);
  process.exit(1);
});
