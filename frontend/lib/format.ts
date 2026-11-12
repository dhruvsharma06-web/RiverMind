import { INR_REFERENCE_RATE } from "./currency";
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
export const usdMoney = (cents: number) => usd.format(cents / 100);
export const money = (cents: number) =>
  inr.format((cents * INR_REFERENCE_RATE) / 100);
export function dateTime(value: string) {
  return (
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value)) + " IST"
  );
}
export function elapsed(value: string) {
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return dateTime(value);
}
export const statusLabels: Record<string, string> = {
  OPEN: "Open quest",
  CLAIMED: "Claimed",
  PROOF_SUBMITTED: "Checking evidence",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  PAYOUT_PENDING_APPROVAL: "Council review",
  PAID: "Paid",
  PAYOUT_FAILED: "Payment failed",
  PENDING_APPROVAL: "Awaiting approval",
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent · awaiting confirmation",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  VETOED: "Vetoed",
};
export function parseDonation(value: string) {
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a USD amount with at most two decimal places.");
  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < 100 || cents > 100000)
    throw new Error("Choose an amount between $1 and $1,000 USD.");
  return cents;
}
