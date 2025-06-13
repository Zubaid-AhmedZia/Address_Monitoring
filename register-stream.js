// register-stream.js
import Moralis from "moralis";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const {
  MORALIS_API_KEY,
  WEBHOOK_BASE_URL,
  MONITORED_ADDRESS,
  STREAM_ID,
  SUBSCRIBE_URL,
  TEST_USER_EMAIL,
} = process.env;

async function setupFullCaptureStream() {
  await Moralis.start({ apiKey: MORALIS_API_KEY });

  let streamId = STREAM_ID;
  if (!streamId) {
    // 1) Create the stream if you don't already have one
    const { id } = (
      await Moralis.Streams.add({
        webhookUrl:        `${WEBHOOK_BASE_URL}/webhook/evm`,
        description:       `Full activity for ${MONITORED_ADDRESS}`,
        tag:               "full_address_activity",
        chains:            ["0xaa36a7"],    // Sepolia
        includeNativeTxs:   true,           // ETH transfers
        includeInternalTxs: true,           // internal TXs
        includeContractLogs: true,          // all event logs
      })
    ).toJSON();
    streamId = id;
    console.log("✅ Stream created:", streamId);
  }

  // 2) Add your address
  await Moralis.Streams.addAddress({
    id:      streamId,
    address: [MONITORED_ADDRESS],
  });
  console.log("✅ Address added:", MONITORED_ADDRESS);

  // 3) For testing: hit your /subscribe endpoint so you get a confirmation email
  if (SUBSCRIBE_URL && TEST_USER_EMAIL) {
    try {
      const resp = await fetch(SUBSCRIBE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          address: MONITORED_ADDRESS,
          email:   TEST_USER_EMAIL,
        }),
      });
      const json = await resp.json();
      console.log("📬 /subscribe response:", json);
    } catch (err) {
      console.error("❌ Failed to call /subscribe:", err);
    }
  }
}

setupFullCaptureStream().catch(err => {
  console.error("❌ Error in register-stream:", err);
  process.exit(1);
});
