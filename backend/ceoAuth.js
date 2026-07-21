"use strict";

const crypto = require("crypto");

function validSecret(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 32;
}

function resolveCeoSessionSecret(env = process.env) {
  if (validSecret(env.CEO_SECRET)) {
    return { secret: env.CEO_SECRET, source: "CEO_SECRET" };
  }
  if (validSecret(env.JWT_SECRET)) {
    const secret = crypto
      .createHmac("sha256", env.JWT_SECRET)
      .update("los10000:ceo-session:v1")
      .digest("hex");
    return { secret, source: "JWT_SECRET_DERIVED" };
  }
  return { secret: null, source: "MISSING" };
}

module.exports = { validSecret, resolveCeoSessionSecret };
