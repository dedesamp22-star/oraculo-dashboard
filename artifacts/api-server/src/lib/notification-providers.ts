import type { NotificationDto } from "./demo-store";

export interface NotificationDeliveryResult {
  provider: "internal" | "webpush" | "telegram";
  status: "delivered" | "queued" | "disabled" | "failed";
  failureReason?: string;
}

export interface NotificationProvider {
  readonly name: NotificationDeliveryResult["provider"];
  deliver(notification: NotificationDto): Promise<NotificationDeliveryResult>;
}

export class InternalProvider implements NotificationProvider {
  readonly name = "internal" as const;

  async deliver(): Promise<NotificationDeliveryResult> {
    return { provider: this.name, status: "delivered" };
  }
}

export class WebPushProvider implements NotificationProvider {
  readonly name = "webpush" as const;

  constructor(private readonly configured: boolean) {}

  async deliver(): Promise<NotificationDeliveryResult> {
    return { provider: this.name, status: this.configured ? "queued" : "disabled" };
  }
}

export class TelegramProvider implements NotificationProvider {
  readonly name = "telegram" as const;

  async deliver(): Promise<NotificationDeliveryResult> {
    return { provider: this.name, status: "disabled", failureReason: "Telegram provider is prepared but not configured." };
  }
}
