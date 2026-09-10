export type NotificationPriority = "important" | "low";

export type EventTypeConfig = {
  key: string;
  label: string;
  priority: NotificationPriority;
  suppressionExempt: boolean;
  emailExempt: boolean;
  defaultEmailEnabled: boolean;
};

export const EVENT_TYPE_REGISTRY: Record<string, EventTypeConfig> = {
  "application.received": {
    key: "application.received",
    label: "New application received",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "application.status_changed": {
    key: "application.status_changed",
    label: "Application status updated",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "job.closed": {
    key: "job.closed",
    label: "Job listing closed",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "job.reopened": {
    key: "job.reopened",
    label: "Job listing reopened",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "profile.viewed": {
    key: "profile.viewed",
    label: "Profile viewed by a recruiter",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "assessment.assigned": {
    key: "assessment.assigned",
    label: "Assessment assigned",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "outreach.reply_received": {
    key: "outreach.reply_received",
    label: "Outreach reply received",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "auth.password_reset": {
    key: "auth.password_reset",
    label: "Password reset",
    priority: "important",
    suppressionExempt: true,
    emailExempt: true,
    defaultEmailEnabled: true,
  },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_REGISTRY);

export function isValidEventType(
  type: string,
): type is keyof typeof EVENT_TYPE_REGISTRY {
  return type in EVENT_TYPE_REGISTRY;
}
