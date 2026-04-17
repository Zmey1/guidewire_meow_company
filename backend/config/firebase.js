const admin = require('firebase-admin');
require('dotenv').config();

let db;

function initFirebase() {
  if (admin.apps.length === 0) {
    let credential;

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      // Render / cloud: service account JSON passed as env var
      const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      credential = admin.credential.cert(serviceAccount);
    } else {
      // Local dev: uses GOOGLE_APPLICATION_CREDENTIALS file path
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  db = admin.firestore();
  return db;
}

function getDb() {
  if (!db) initFirebase();
  return db;
}

function getAuth() {
  return admin.auth();
}

module.exports = { initFirebase, getDb, getAuth };
