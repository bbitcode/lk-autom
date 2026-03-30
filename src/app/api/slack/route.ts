import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { WebClient } from "@slack/web-api";
import { processSlackMessage } from "@/lib/slack-bot";

export const maxDuration = 60;

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const signingSecret = process.env.SLACK_SIGNING_SECRET!;

const processedEvents = new Map<string, number>();

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

    // Deduplicate by message ts+channel (not event_id) to handle
    // both app_mention and message events for the same message
    const dedupeKey = `${event.ts}-${event.channel}`;
    const now = Date.now();
    if (processedEvents.has(dedupeKey)) {
      return NextResponse.json({ ok: true });
    }
    processedEvents.set(dedupeKey, now);
    // Clean entries older than 5 minutes
    if (processedEvents.size > 500) {
      for (const [key, timestamp] of processedEvents) {
        if (now - timestamp > 5 * 60 * 1000) processedEvents.delete(key);
      }
    }

    if (event.type === "app_mention" || event.type === "message") {
      after(async () => {
        await processAndReply(event as unknown as SlackEvent);
      });
    }
  }

  return NextResponse.json({ ok: true });
}

interface SlackFile {
  url_private_download?: string;
  url_private?: string;
  name: string;
  mimetype: string;
}

interface SlackEvent {
  text: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  files?: SlackFile[];
}

async function processAndReply(event: SlackEvent) {
  try {
    await slackClient.reactions.add({
      channel: event.channel,
      name: "hourglass_flowing_sand",
      timestamp: event.ts,
    }).catch(() => {});

    // Extract file info for reference image uploads
    const files = event.files
      ?.filter((f) => f.mimetype?.startsWith("image/"))
      .map((f) => ({
        url: f.url_private_download || f.url_private || "",
        name: f.name,
      }))
      .filter((f) => f.url) || [];

    const result = await processSlackMessage(event.text, event.channel, files.length > 0 ? files : undefined);

    // If there's an image buffer, upload it to Slack
    if (result.imageBuffer) {
      await slackClient.filesUploadV2({
        channel_id: event.channel,
        thread_ts: event.thread_ts || event.ts,
        file: result.imageBuffer,
        filename: "generated-image.png",
        initial_comment: result.text,
      });
    } else {
      await slackClient.chat.postMessage({
        channel: event.channel,
        text: result.text,
        thread_ts: event.thread_ts || event.ts,
      });
    }

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
