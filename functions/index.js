"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const adminEmail = "ppomberl@gmail.com";
const customerAuthDomain = "clientes.precios-c2e83.firebaseapp.com";
const database = getFirestore();

exports.createCustomerAccount = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError("unauthenticated", "Inicia sesión como administrador.");
  }
  if (caller.token.email !== adminEmail || caller.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Solo el administrador verificado puede crear al cliente.");
  }

  const username = typeof request.data?.username === "string"
    ? request.data.username.trim().toLowerCase()
    : "";
  const password = typeof request.data?.password === "string" ? request.data.password : "";
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new HttpsError("invalid-argument", "El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.");
  }
  if (username.toUpperCase() === "CSC" || password.length < 8 || password.length > 128) {
    throw new HttpsError("invalid-argument", "El usuario no puede ser CSC y la contraseña debe tener de 8 a 128 caracteres.");
  }

  const email = `${username}@${customerAuthDomain}`;
  let createdUser;
  try {
    createdUser = await getAuth().createUser({ email, password });
    await database.doc(`clientes/${createdUser.uid}`).create({
      username,
      email,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (createdUser) {
      await getAuth().deleteUser(createdUser.uid);
    }
    if (error instanceof HttpsError) throw error;
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Ese nombre de usuario ya está registrado.");
    }
    throw new HttpsError("internal", error.message || "No se pudo crear la cuenta de cliente.");
  }
  return { uid: createdUser.uid, username };
});
