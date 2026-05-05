const DEFAULT_TIMEOUT_MS = 5000;

export async function sendNotificationWebhook({
  template,
  eventType,
  entityType,
  entityId,
  recipient,
  data = {},
  metadata = {},
}) {
  const webhookUrl = process.env.N8N_NOTIFICATION_WEBHOOK_URL /*|| process.env.PAID_EVENT_NOTIFICATION_WEBHOOK_URL;*/
  if (!webhookUrl) {
    console.warn('📬 Notification webhook URL is not configured; skipping notification', { template, entityType, entityId });
    return { skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template,
        eventType,
        entityType,
        entityId,
        recipient,
        data,
        metadata,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Notification webhook failed with ${res.status}`);
    }

    return { sent: true };
  } catch (err) {
    console.warn('📬 Notification webhook failed:', err.message);
    return { sent: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}
