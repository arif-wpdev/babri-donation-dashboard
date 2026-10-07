export const employeePasskeySetupCookieName = process.env.NODE_ENV === "production"
  ? "__Host-employee-passkey-setup"
  : "employee-passkey-setup";
