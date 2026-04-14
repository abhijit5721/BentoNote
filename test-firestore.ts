import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

const adminApp = admin.initializeApp();

async function test() {
  try {
    const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    const collections = await db.listCollections();
    console.log("Success! Collections:", collections.length);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
