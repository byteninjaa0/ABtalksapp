import { readFileSync } from "node:fs";
import { join } from "node:path";

type TemplateVars = {
  title: string;
  body: string;
  href: string;
  baseUrl: string;
  recipientName: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function interpolate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{title\}\}/g, vars.title)
    .replace(/\{\{body\}\}/g, vars.body)
    .replace(/\{\{href\}\}/g, vars.href)
    .replace(/\{\{baseUrl\}\}/g, vars.baseUrl)
    .replace(/\{\{recipientName\}\}/g, vars.recipientName);
}

const GENERIC_HTML = `<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <p style="color: #333;">Hi {{recipientName}},</p>
  <h2 style="color: #1a1a1a; margin: 16px 0 8px;">{{title}}</h2>
  <p style="color: #333;">{{body}}</p>
  <p><a href="{{baseUrl}}{{href}}" style="color: #2563eb;">View details on ABTalks &rarr;</a></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #9ca3af; font-size: 12px;">
    You received this because of your notification settings on ABTalks.
    You can update your preferences at {{baseUrl}}/settings/notifications.
  </p>
</div>`;

const GENERIC_TEXT = `Hi {{recipientName}},

{{title}}

{{body}}

View details: {{baseUrl}}{{href}}

---
You received this because of your notification settings on ABTalks.
Update preferences: {{baseUrl}}/settings/notifications`;

const templateCache = new Map<string, { html: string; text: string }>();

function loadTemplate(eventType: string): { html: string; text: string } {
  const cached = templateCache.get(eventType);
  if (cached) return cached;

  const dir = join(process.cwd(), "src", "features", "notification", "templates");

  try {
    const html = readFileSync(join(dir, `${eventType}.html`), "utf-8");
    const text = readFileSync(join(dir, `${eventType}.txt`), "utf-8");
    const result = { html, text };
    templateCache.set(eventType, result);
    return result;
  } catch {
    const result = { html: GENERIC_HTML, text: GENERIC_TEXT };
    templateCache.set(eventType, result);
    return result;
  }
}

export function renderTemplate(
  eventType: string,
  vars: TemplateVars,
): RenderedEmail {
  const { html, text } = loadTemplate(eventType);
  return {
    subject: vars.title,
    html: interpolate(html, vars),
    text: interpolate(text, vars),
  };
}
