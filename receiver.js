// receiver.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import sgMail from "@sendgrid/mail";
import Moralis from "moralis";

dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const STREAM_ID = process.env.STREAM_ID;
const subscriptions = new Map(); 
// key: lowercased address, value: subscriber email

const app = express();
app.use(bodyParser.json());

// Initialize Moralis once, before handling subscribe or webhooks
await Moralis.start({ apiKey: process.env.MORALIS_API_KEY });

/**
 * POST /subscribe
 * { address: string, email: string }
 * → adds the address to your existing stream & emails a confirmation
 */
app.post("/subscribe", async (req, res) => {
  const { address, email } = req.body;
  if (!address || !email) {
    return res.status(400).json({ error: "address and email required" });
  }

  try {
    await Moralis.Streams.addAddress({
      id:      STREAM_ID,
      address: [address],
    });
    subscriptions.set(address.toLowerCase(), email);

    // send confirmation
    await sgMail.send({
      to:   email,
      from: process.env.EMAIL_FROM,
      subject: `✅ Subscribed to on-chain alerts for ${address}`,
      html: `
        <h2>Subscription Confirmed!</h2>
        <p>You will now receive email alerts whenever <strong>${address}</strong> does any on-chain activity.</p>
        <p>Thank you for using our service.</p>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

/**
 * POST /webhook/evm
 * Receives Moralis test ping + real events.
 * Filters to only confirmed events with actual data, then
 * sends a pretty HTML email to each subscriber.
 */
app.post("/webhook/evm", async (req, res) => {
  const p = req.body;
  res.sendStatus(200); // ack immediately

  const hasData = ["txs","txsInternal","logs","erc20Transfers","nftTransfers"]
    .some(k => Array.isArray(p[k]) && p[k].length > 0);

  if (!hasData || !p.confirmed) {
    console.log("Ignored test or unconfirmed:", p.retries, p.confirmed);
    return;
  }

  // Build a list of all subscriber emails for this event
  const emails = new Set();
  for (const tx of p.txs) {
    (tx.triggered_by || []).forEach(addr =>
      subscriptions.has(addr.toLowerCase()) &&
      emails.add(subscriptions.get(addr.toLowerCase()))
    );
  }
  if (emails.size === 0) {
    console.log("No subscribers for this address, skipping email.");
    return;
  }

  // Convert wei to ETH and format date
  const ethValue = tx =>
    (Number(tx.value) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 4 });
  const time   = new Date(Number(p.block.timestamp) * 1000).toUTCString();

  // HTML email template
  const html = `
    <h2>🔔 On-chain Activity Detected</h2>
    <p><strong>Address:</strong> ${p.tag}</p>
    <p><strong>Time:</strong> ${time}</p>
    <p><strong>Block:</strong> ${p.block.number} (<code>${p.block.hash}</code>)</p>

    <h3>Native Transaction</h3>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;">
      <tr><th>Hash</th><td><a href="https://etherscan.io/tx/${p.txs[0].hash}" target="_blank">${p.txs[0].hash}</a></td></tr>
      <tr><th>From</th><td>${p.txs[0].fromAddress}</td></tr>
      <tr><th>To</th><td>${p.txs[0].toAddress}</td></tr>
      <tr><th>Value</th><td>${ethValue(p.txs[0])} ETH</td></tr>
      <tr><th>Gas Used</th><td>${p.txs[0].receiptGasUsed}</td></tr>
    </table>

    ${
      p.erc20Transfers.length
        ? `<h3>ERC-20 Transfers</h3>
           ${p.erc20Transfers.map(t =>
             `<p>${t.from} → ${t.to}, ${Number(t.value)/1e18} tokens<br>
               <a href="https://etherscan.io/tx/${t.transactionHash}">${t.transactionHash}</a>
             </p>`
           ).join("")}`
        : ``
    }

    ${
      p.nftTransfers.length
        ? `<h3>NFT Transfers</h3>
           ${p.nftTransfers.map(n =>
             `<p>${n.from} → ${n.to}, TokenID: ${n.tokenId}
              <br><a href="https://etherscan.io/tx/${n.transactionHash}">${n.transactionHash}</a>
             </p>`
           ).join("")}`
        : ``
    }
  `;

  // Fire off one email per subscriber
  await Promise.all(
    Array.from(emails).map(email =>
      sgMail.send({
        to:   email,
        from: process.env.EMAIL_FROM,
        subject: `🔔 Activity on ${p.tag}`,
        html,
      })
    )
  );
  console.log("Emails sent to:", [...emails].join(", "));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Receiver & API listening on http://localhost:${PORT}`)
);
