"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { submitDataRightsRequestAction } from "@/app/actions/legal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TYPES = [
  { value: "ACCESS", label: "Access my data" },
  { value: "CORRECTION", label: "Correct my data" },
  { value: "ERASURE", label: "Delete my account / data" },
  { value: "OTHER", label: "Other request" },
] as const;

type Props = {
  defaultEmail?: string;
};

export function DataRightsRequestForm({ defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("ACCESS");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitDataRightsRequestAction({
        email,
        type,
        message,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setDone(true);
      toast.success("Request submitted. We’ll email you from team@klymb.ai.");
    });
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-5 text-sm">
        <p className="font-medium text-foreground">Request received</p>
        <p className="text-muted-foreground">
          We aim to respond within 30 days. You can also email{" "}
          <a href="mailto:team@klymb.ai" className="text-primary hover:underline">
            team@klymb.ai
          </a>
          .
        </p>
        <Link href="/privacy" className="text-primary hover:underline">
          Back to Privacy Policy
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label>Request type</Label>
        <Select
          value={type}
          onValueChange={(v) => {
            if (v === "ACCESS" || v === "CORRECTION" || v === "ERASURE" || v === "OTHER") {
              setType(v);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Details (optional)</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Tell us what you need…"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
