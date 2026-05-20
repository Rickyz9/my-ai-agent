import { Redis } from "ioredis";

import { env } from "./config.js";

export type JobEventPayload = {
  id: string;
  workflow: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  previewPath: string | null;
  prompt: string;
};

function getJobChannel(jobId: string) {
  return `job-events:${jobId}`;
}

export async function subscribeToJobEvents(
  jobId: string,
  onEvent: (payload: JobEventPayload) => void
) {
  const subscriber = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null
  });
  const channel = getJobChannel(jobId);

  const handleMessage = (incomingChannel: string, message: string) => {
    if (incomingChannel !== channel) {
      return;
    }

    try {
      onEvent(JSON.parse(message) as JobEventPayload);
    } catch {
      // Ignore malformed messages and keep the stream alive.
    }
  };

  subscriber.on("message", handleMessage);
  await subscriber.subscribe(channel);

  return async () => {
    subscriber.off("message", handleMessage);
    await subscriber.unsubscribe(channel).catch(() => undefined);
    await subscriber.quit().catch(() => undefined);
  };
}
