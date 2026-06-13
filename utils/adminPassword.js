import crypto from "crypto";

const ITERATIONS = 210000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export const validateAdminPassword = (password) => {
  if (typeof password !== "string" || password.length < 12) {
    return "Password must be at least 12 characters";
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password must include upper and lower case letters";
  }
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a number and special character";
  }
  return "";
};

export const hashAdminPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  passwordHash: crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex"),
});

export const verifyAdminPassword = (password, salt, expectedHash) => {
  const compare = (iterations) => {
    const actual = crypto
      .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
      .toString("hex");
    const actualBuffer = Buffer.from(actual, "hex");
    const expectedBuffer = Buffer.from(expectedHash || "", "hex");
    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  };
  return compare(ITERATIONS) || compare(10000);
};

export const needsAdminPasswordRehash = (password, salt, expectedHash) => {
  const actual = hashAdminPassword(password, salt).passwordHash;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expectedHash || "", "hex");
  return !(
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};
