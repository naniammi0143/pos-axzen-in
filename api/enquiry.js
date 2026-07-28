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

await resend.emails.send({
  from: "AXZEN POS <onboarding@resend.dev>",
  to: "YOUR_GMAIL@gmail.com",
  subject: "🚀 New AXZEN POS Enquiry",
  html: `
    <h2>New Enquiry Received</h2>
    <p><b>Name:</b> ${enquiry.name}</p>
    <p><b>Phone:</b> ${enquiry.phone}</p>
    <p><b>Email:</b> ${enquiry.email}</p>
    <p><b>Plan:</b> ${enquiry.plan}</p>
    <p><b>Message:</b> ${enquiry.message}</p>
    <p><b>Date:</b> ${new Date().toLocaleString()}</p>
  `
});

if (enquiry.email) {
  await resend.emails.send({
    from: "AXZEN POS <onboarding@resend.dev>",
    to: enquiry.email,
    subject: "Thank you for contacting AXZEN POS",
    html: `
      <h2>Hello ${enquiry.name},</h2>
      <p>Thank you for contacting AXZEN POS.</p>
      <p>We have received your enquiry successfully.</p>
      <p>Our team will contact you shortly.</p>
      <br>
      <b>AXZEN POS Team</b>
    `
  });
}

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
