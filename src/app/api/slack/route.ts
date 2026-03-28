import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { WebClient } from "@slack/web-api";
import { processSlackMessage } from "@/lib/slack-bot";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET!;

// Track processed events to avoid duplicates
const processedEvents = new Set<string>();

function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";

  // Verify Slack signature
  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Handle events
  if (body.type === "event_callback") {
    const event = body.event;

    // Ignore bot messages to avoid loops
    if (event.bot_id || event.subtype === "bot_message") {
      return NextResponse.json({ ok: true });
    }

    // Deduplicate events (Slack may retry)
    const eventId = body.event_id || `${event.ts}-${event.channel}`;
    if (processedEvents.has(eventId)) {
      return NextResponse.json({ ok: true });
    }
    processedEvents.add(eventId);
    // Clean up old events to prevent memory leak
    if (processedEvents.size > 1000) {
      const entries = Array.from(processedEvents);
      entries.slice(0, 500).forEach((e) => processedEvents.delete(e));
    }

    // Only respond to app_mention or direct messages
    if (event.type === "app_mention" || event.type === "message") {
      // Respond immediately to Slack (3 second timeout requirement)
      // Process in background
      processAndReply(event).catch((err) =>
        console.error("Slack processing error:", err)
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function processAndReply(event: {
  text: string;
  channel: string;
  ts: string;
  thread_ts?: string;
}) {
  try {
    // Send "thinking" indicator
    await slackClient.reactions.add({
      channel: event.channel,
      name: "hourglass_flowing_sand",
      timestamp: event.ts,
    });

    const response = await processSlackMessage(event.text);

    // Reply in thread if it was a threaded message, otherwise create a new thread
    await slackClient.chat.postMessage({
      channel: event.channel,
      text: response,
      thread_ts: event.thread_ts || event.ts,
    });

    // Remove thinking indicator
    await slackClient.reactions.remove({
      channel: event.channel,
      name: "hourglass_flowing_sand",
      timestamp: event.ts,
    });
  } catch (error) {
    console.error("Error replying to Slack:", error);

    await slackClient.chat.postMessage({
      channel: event.channel,
      text: "Hubo un error procesando tu mensaje. Intenta de nuevo.",
      thread_ts: event.thread_ts || event.ts,
    }).catch(() => {});
  }
}
