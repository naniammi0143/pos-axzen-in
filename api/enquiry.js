const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "AXZEN_CANTEEN";

let cachedClient = globalThis._axzenMongoClient;
let cachedDb = globalThis._axzenMongoDb;

async function connectToDatabase() {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured in Vercel Environment Variables");
  }
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  globalThis._axzenMongoClient = client;
  globalThis._axzenMongoDb = db;
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

async function sendOptionalMail(enquiry) {
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_NOTIFY_EMAIL) return;
  try {
    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.ENQUIRY_FROM_EMAIL || "AXZEN POS <onboarding@resend.dev>",
      to: process.env.ENQUIRY_NOTIFY_EMAIL,
      subject: "New AXZEN POS Enquiry",
      html: `
        <h2>New Enquiry Received</h2>
        <p><b>Name:</b> ${enquiry.name}</p>
        <p><b>Phone:</b> ${enquiry.phone}</p>
        <p><b>Email:</b> ${enquiry.email || "-"}</p>
        <p><b>Plan:</b> ${enquiry.plan}</p>
        <p><b>Message:</b> ${enquiry.message || "-"}</p>
      `
    });
  } catch (error) {
    console.error("Optional enquiry email failed:", error.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const plan = String(req.body?.plan || "").trim();
    if (!name || !phone || !plan) {
      return res.status(400).json({ success: false, message: "Name, phone number and plan are required." });
    }

    const enquiry = {
      id: Date.now(),
      name,
      phone,
      email: String(req.body?.email || "").trim(),
      plan,
      message: String(req.body?.message || "").trim(),
      status: "New",
      source: "pos.axzen.in",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const { db } = await connectToDatabase();
    const result = await db.collection("enquiries").insertOne(enquiry);
    await sendOptionalMail(enquiry);

    return res.status(201).json({
      success: true,
      message: "Your enquiry has been submitted successfully.",
      enquiryId: result.insertedId
    });
  } catch (error) {
    console.error("Enquiry API Error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
  }
};
