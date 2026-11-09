"use strict";

const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const adminEmail = "ppomberl@gmail.com";
const database = getFirestore();

exports.createCustomerAccount = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "Inicia sesión como administrador.");
  }
  if (caller.token.email !== adminEmail || caller.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Solo el administrador verificado puede crear al cliente.");
  }

  const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
  const password = typeof request.data?.password === "string" ? request.data.password : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Escribe un correo válido para el cliente.");
  }
  if (email === adminEmail || password.length < 8 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Usa un correo distinto al del administrador y una contraseña de 8 a 128 caracteres.");
  }

  const accessRef = database.doc("configuracion/acceso");
  const reservation = randomUUID();
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accessRef);
    if (snapshot.data()?.customerUid || snapshot.data()?.creatingToken) {
      throw new HttpsError("already-exists", "Ya existe una cuenta de cliente o está en proceso de creación.");
    }
    transaction.set(accessRef, {
      creatingToken: reservation,
      adminEmail,
    }, { merge: true });
  });

  let createdUser;
  try {
    createdUser = await getAuth().createUser({ email, password });
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(accessRef);
      if (snapshot.data()?.creatingToken !== reservation) {
        throw new HttpsError("aborted", "La reserva de creación de cliente cambió. Inténtalo de nuevo.");
      }
      transaction.update(accessRef, {
        customerUid: createdUser.uid,
        customerEmail: email,
        createdAt: FieldValue.serverTimestamp(),
        creatingToken: FieldValue.delete(),
      });
    });
    return { uid: createdUser.uid, email };
  } catch (error) {
    if (createdUser) {
      await getAuth().deleteUser(createdUser.uid);
    }
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(accessRef);
      if (snapshot.data()?.creatingToken === reservation) {
        transaction.update(accessRef, { creatingToken: FieldValue.delete() });
      }
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "No se pudo crear la cuenta de cliente.");
  }
});
