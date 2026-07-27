import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not configured in Vercel Environment Variables");
}

let cachedClient = globalThis._mongoClient;
let cachedDb = globalThis._mongoDb;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri);

  await client.connect();

  const db = client.db("AXZEN_CANTEEN");

  globalThis._mongoClient = client;
  globalThis._mongoDb = db;

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const {
      name,
      phone,
      email,
      plan,
      message
    } = req.body || {};

    // Validate required fields
    if (!name || !phone || !plan) {
      return res.status(400).json({
        success: false,
        message: "Name, phone number and plan are required."
      });
    }

    const { db } = await connectToDatabase();

    const enquiry = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : "",
      plan: String(plan).trim(),
      message: message ? String(message).trim() : "",
      status: "new",
      createdAt: new Date(),
      source: "pos.axzen.in"
    };

    const result = await db
      .collection("enquiries")
      .insertOne(enquiry);

    return res.status(201).json({
      success: true,
      message: "Your enquiry has been submitted successfully.",
      enquiryId: result.insertedId
    });

  } catch (error) {
    console.error("Enquiry API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
}
