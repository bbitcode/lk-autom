import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { WebClient } from "@slack/web-api";
import { processSlackMessage } from "@/lib/slack-bot";

export const maxDuration = 60;

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET!;

function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (body.type === "event_callback") {
    const event = body.event as Record<string, unknown>;

    if (event.bot_id || event.subtype === "bot_message") {
      return NextResponse.json({ ok: true });
    }

    // Only process app_mention events (not message events) to avoid duplicates.
    // When someone @mentions the bot, Slack sends both app_mention and message events.
    // DMs are handled via app_mention when the bot is mentioned directly.
    if (event.type === "app_mention") {
      after(async () => {
        await processAndReply(event as unknown as SlackEvent);
      });
    }
  }

  return NextResponse.json({ ok: true });
}

interface SlackEvent {
  text: string;
  channel: string;
  ts: string;
  thread_ts?: string;
}

async function processAndReply(event: SlackEvent) {
  try {
    await slackClient.reactions.add({
      channel: event.channel,
      name: "hourglass_flowing_sand",
      timestamp: event.ts,
    }).catch(() => {});

    const result = await processSlackMessage(event.text, event.channel);

    await slackClient.chat.postMessage({
      channel: event.channel,
      text: result.text,
      thread_ts: event.thread_ts || event.ts,
    });

    await slackClient.reactions.remove({
      channel: event.channel,
      name: "hourglass_flowing_sand",
      timestamp: event.ts,
    }).catch(() => {});
  } catch (error) {
    console.error("Error replying to Slack:", error);
    await slackClient.chat.postMessage({
      channel: event.channel,
      text: "Hubo un error procesando tu mensaje. Intenta de nuevo.",
      thread_ts: event.thread_ts || event.ts,
    }).catch(() => {});
  }
}
