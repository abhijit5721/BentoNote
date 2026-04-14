import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };
import { WebSocketServer } from "ws";
import { DeepgramClient } from "@deepgram/sdk";

// Set environment variables for Firebase SDK
process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;

dotenv.config({ override: true });

// Initialize Firebase Admin
let adminApp: admin.app.App;
try {
  if (admin.apps.length === 0) {
    console.log("[Firebase] Initializing Admin SDK with Project ID:", firebaseConfig.projectId);
    adminApp = admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log("[Firebase] Admin SDK initialized. Project ID:", adminApp.options.projectId);
  } else {
    adminApp = admin.app();
  }
} catch (error) {
  console.error("[Firebase] Admin initialization error:", error);
  adminApp = admin.app(); // Fallback to existing app
}

// Get Firestore instance
function getFirestoreInstance(dbId?: string) {
  try {
    console.log(`[Firebase] Initializing Firestore. Named DB: ${dbId || 'none'}`);
    // Use the modular getFirestore method which is more consistent in v13
    const db = dbId && dbId !== "(default)" 
      ? getFirestore(adminApp, dbId) 
      : getFirestore(adminApp);
    return db;
  } catch (e: any) {
    console.error(`[Firebase] Error initializing firestore:`, e.message);
    return getFirestore(adminApp);
  }
}

const firestore = getFirestoreInstance(firebaseConfig.firestoreDatabaseId);

// Firestore Health Check removed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let stripeInstance: Stripe | null = null;

function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not configured in environment variables.");
    }
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe Webhook (needs raw body)
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(
        req.body,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const customerId = session.customer as string;

      console.log(`Payment successful for session: ${session.id}, User: ${userId}, Customer: ${customerId}`);

      if (userId && customerId) {
        try {
          await firestore.collection("users").doc(userId).update({
            plan: "pro",
            stripeCustomerId: customerId,
            updatedAt: new Date().toISOString(),
          });
          console.log(`Updated user ${userId} to pro plan with customer ${customerId}`);
        } catch (error) {
          console.error(`Error updating user ${userId} in Firestore:`, error);
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // API Routes
  app.post("/api/create-checkout-session", async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[Stripe][${requestId}] Request received`);
    
    try {
      const { userId, userEmail } = req.body;
      if (!userId || !userEmail) throw new Error("Missing userId or userEmail");

      const stripe = getStripe();
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) throw new Error("STRIPE_PRICE_ID not configured");

      // Global timeout for the entire Stripe operation
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Stripe operation timed out (15s)")), 15000)
      );

      const stripeOperation = (async () => {
        let mode = process.env.STRIPE_MODE as any;
        if (!mode) {
          console.log(`[Stripe][${requestId}] Mode not set, fetching price: ${priceId}`);
          const price = await stripe.prices.retrieve(priceId);
          mode = price.type === 'recurring' ? 'subscription' : 'payment';
          console.log(`[Stripe][${requestId}] Auto-detected mode: ${mode}`);
        }

        const origin = req.headers.origin || req.headers.referer || `${req.protocol}://${req.get('host')}`;
        console.log(`[Stripe][${requestId}] Using origin for redirect: ${origin}`);

        return await stripe.checkout.sessions.create({
          line_items: [{ price: priceId, quantity: 1 }],
          mode,
          success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/`,
          customer_email: userEmail,
          metadata: { userId },
        });
      })();

      const session = await Promise.race([stripeOperation, timeoutPromise]) as Stripe.Checkout.Session;
      console.log(`[Stripe][${requestId}] Success: ${session.id}`);
      res.json({ id: session.id, url: session.url });

    } catch (error: any) {
      console.error(`[Stripe][${requestId}] Error:`, error.message);
      
      let clientMessage = error.message;
      if (error.message.includes("No such price")) {
        const isTestKey = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
        clientMessage = `Stripe cannot find the price ID "${process.env.STRIPE_PRICE_ID}". ${
          isTestKey 
          ? "You are using a TEST Secret Key, so please ensure this Price ID was created in Stripe's TEST MODE." 
          : "Please ensure this Price ID exists in your Stripe account and matches your Secret Key (Live vs Test mode)."
        }`;
      }
      
      res.status(500).json({ error: clientMessage });
    }
  });

  app.post("/api/verify-session", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Session ID is required" });

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === 'paid' || session.status === 'complete') {
        res.json({ 
          success: true, 
          customerId: session.customer 
        });
      } else {
        res.json({ success: false });
      }
    } catch (error: any) {
      console.error("Error verifying session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-portal-session", async (req, res) => {
    try {
      const { userId, stripeCustomerId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      if (!stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found for this user. Please upgrade first." });
      }

      console.log(`[Portal] Creating session for user: ${userId}, customer: ${stripeCustomerId}`);

      const stripe = getStripe();
      const origin = req.headers.origin || `http://${req.headers.host}`;
      
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${origin}/`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    // WebSocket upgrade handling (Optional)
  });

  wss.on("connection", (ws) => {
    ws.close();
  });
}

startServer();
