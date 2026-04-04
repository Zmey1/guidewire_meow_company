const admin = require('firebase-admin');
require('dotenv').config();

let db;

function initFirebase() {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
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
