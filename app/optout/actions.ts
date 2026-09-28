"use server";

import { optOut } from "@/lib/data";

export interface OptOutState {
  status: "idle" | "done" | "error";
  message?: string;
  /** What was typed, so a rejected value stays in the field. */
  value?: string;
}

// GitHub logins: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export async function removeSubmission(_prev: OptOutState, form: FormData): Promise<OptOutState> {
  const raw = String(form.get("username") ?? "").trim();
  const username = raw.replace(/^@/, "").replace(/^https?:\/\/github\.com\//i, "").split("/")[0];
  if (!LOGIN.test(username)) {
    return { status: "error", message: "That doesn't look like a GitHub username.", value: raw };
  }
  try {
    await optOut(username);
  } catch {
    return { status: "error", message: "Something went wrong saving that. Try again in a minute.", value: raw };
  }
  // Same answer whether or not a fork was found, so the form can't be used to probe who applied.
  return { status: "done" };
}
