import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {

  // Only POST request is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {

    // Get customer data from website form
    const {
      name,
      phone,
      email,
      plan,
      message
    } = req.body;

    // Check required fields
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone number are required"
      });
    }

    // Connect to MongoDB
    await client.connect();

    // Select database
    const db = client.db("axzen_pos");

    // Select enquiries collection
    const enquiries = db.collection("enquiries");

    // Create enquiry data
    const enquiry = {

      name: name.trim(),

      phone: phone.trim(),

      email: email ? email.trim() : "",

      plan: plan || "",

      message: message || "",

      status: "New",

      createdAt: new Date()

    };

    // Save enquiry in MongoDB
    const result = await enquiries.insertOne(enquiry);

    // Send success response
    return res.status(200).json({

      success: true,

      message: "Enquiry submitted successfully",

      enquiryId: result.insertedId

    });

  } catch (error) {

    console.error("Enquiry Error:", error);

    return res.status(500).json({

      success: false,

      message: "Something went wrong. Please try again."

    });

  }

}
