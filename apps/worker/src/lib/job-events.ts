import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null
});

type JobEventPayload = {
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

export async function publishJobEvent(payload: JobEventPayload) {
  await redis.publish(getJobChannel(payload.id), JSON.stringify(payload));
}
