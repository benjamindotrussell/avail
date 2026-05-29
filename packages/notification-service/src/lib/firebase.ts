import admin from 'firebase-admin';

let initialised = false;

export function getFirebaseApp(): admin.app.App {
  if (!initialised) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    initialised = true;
  }
  return admin.app();
}

export function getMessaging(): admin.messaging.Messaging {
  return getFirebaseApp().messaging();
}
