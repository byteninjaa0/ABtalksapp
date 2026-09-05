"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { redeemItemAction } from "@/app/actions/marketplace-actions";
import { CityCombobox } from "@/components/marketplace/city-combobox";
import { useSynergy } from "@/components/shared/synergy-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INDIA_STATE_NAMES,
  citiesForState,
  statesForCity,
} from "@/data/india-locations";
import {
  SHIPPING_COUNTRY,
  SHIPPING_SUPPORT_EMAIL,
} from "@/lib/validations/marketplace";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  costSP: number;
  itemTitle: string;
  balance: number;
  defaultPhone: string;
  defaultName: string;
};

// The dialog portals out of the page's `dark` wrapper, so every field states
// its own colours rather than inheriting them. `dark:bg-` is repeated because
// the primitives carry their own `dark:` background, which outranks a bare one.
const FIELD_CLASS =
  "h-10 w-full min-w-0 rounded-xl border border-[#1C283D] bg-[#050C1D] px-3 py-2 text-base text-white transition-colors outline-none placeholder:text-zinc-500 focus-visible:border-[#7166F0] focus-visible:ring-2 focus-visible:ring-[#7166F0]/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-[#050C1D]";

// SelectTrigger sets its height through `data-[size=default]:h-8`, which
// tailwind-merge cannot dedupe against a plain `h-10` — so match the variant,
// or the two dropdowns sit shorter than the inputs beside them.
const SELECT_TRIGGER_CLASS = `${FIELD_CLASS} justify-between data-[size=default]:h-10 dark:hover:bg-[#050C1D]`;

const POPUP_CLASS = "border border-[#1C283D] bg-[#0B1124] text-white";

const LABEL_CLASS = "text-sm font-medium text-zinc-200";

export function RedeemDialog({
  open,
  onOpenChange,
  itemId,
  costSP,
  itemTitle,
  balance,
  defaultPhone,
  defaultName,
}: Props) {
  const router = useRouter();
  const { setPoints } = useSynergy();
  const [pending, startTransition] = useTransition();
  const [recipientName, setRecipientName] = useState(defaultName);
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [recipientPhone, setRecipientPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      setRecipientName(defaultName);
      setRecipientPhone(defaultPhone);
      setError(null);
    }
    onOpenChange(next);
  }

  function handleStateChange(next: string) {
    setState(next);
    // A city from the previous state would silently ship to the wrong place.
    const stillValid = citiesForState(next).some(
      (name) => name.toLowerCase() === city.trim().toLowerCase(),
    );
    if (city && !stillValid) setCity("");
  }

  function handleCityChange(nextCity: string, impliedState: string | null) {
    setCity(nextCity);

    // Picking "Lucknow" fills Uttar Pradesh for them.
    if (impliedState) {
      setState(impliedState);
      return;
    }

    // Typed rather than picked: only safe to infer when a single state claims
    // the name. Aurangabad (Maharashtra and Bihar) stays for them to resolve,
    // and an already-chosen state is never overwritten.
    if (!state) {
      const owners = statesForCity(nextCity);
      if (owners.length === 1) setState(owners[0]);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("recipientName", recipientName);
    formData.set("addressLine1", addressLine1);
    formData.set("addressLine2", addressLine2);
    formData.set("city", city);
    formData.set("state", state);
    formData.set("pincode", pincode);
    formData.set("country", SHIPPING_COUNTRY);
    formData.set("recipientPhone", recipientPhone);

    startTransition(async () => {
      const result = await redeemItemAction(formData);
      if (result.ok) {
        setPoints(result.newBalance);
        handleOpenChange(false);
        toast.success("Redeemed! Admin will reach out for fulfillment.");
        router.refresh();
        return;
      }

      if ("reason" in result && result.reason === "validation") {
        setError(result.message);
        return;
      }

      if ("reason" in result && result.reason === "insufficient") {
        setError(result.message);
        return;
      }

      if (
        "reason" in result &&
        (result.reason === "inactive" || result.reason === "not_found")
      ) {
        handleOpenChange(false);
        toast.error(result.message);
        router.refresh();
        return;
      }

      setError(result.message ?? "Something went wrong");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border border-[#1C283D] bg-[#0B1124] text-white ring-1 ring-white/10 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">{itemTitle}</DialogTitle>
          <DialogDescription className="text-[#BCBCBC]">
            This will deduct {costSP} SP from your {balance} SP balance. Address
            and phone are used only for fulfillment (admins only — not public).
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-[#1C283D] bg-[#050C1D] px-3 py-2 text-xs text-[#BCBCBC]">
          We currently deliver only within India. For delivery to any other
          country, write to{" "}
          <a
            href={`mailto:${SHIPPING_SUPPORT_EMAIL}`}
            className="font-medium text-[#9C93F5] underline underline-offset-2"
          >
            {SHIPPING_SUPPORT_EMAIL}
          </a>
          .
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="recipientName" className={LABEL_CLASS}>
              Recipient name
            </label>
            <Input
              id="recipientName"
              name="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Who should the parcel be addressed to?"
              autoComplete="name"
              disabled={pending}
              className={FIELD_CLASS}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="addressLine1" className={LABEL_CLASS}>
              Address line 1
            </label>
            <Input
              id="addressLine1"
              name="addressLine1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="House / flat number, building, street"
              autoComplete="address-line1"
              disabled={pending}
              className={FIELD_CLASS}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="addressLine2" className={LABEL_CLASS}>
              Address line 2{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <Input
              id="addressLine2"
              name="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Area, landmark, locality"
              autoComplete="address-line2"
              disabled={pending}
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="state" className={LABEL_CLASS}>
                State
              </label>
              <Select
                value={state || null}
                onValueChange={(next) => {
                  if (typeof next === "string") handleStateChange(next);
                }}
                disabled={pending}
              >
                <SelectTrigger
                  id="state"
                  className={`${SELECT_TRIGGER_CLASS} data-placeholder:text-zinc-500`}
                >
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className={POPUP_CLASS}>
                  {INDIA_STATE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="city" className={LABEL_CLASS}>
                City
              </label>
              <CityCombobox
                id="city"
                value={city}
                state={state}
                onChange={handleCityChange}
                disabled={pending}
                placeholder={state ? "Search cities" : "Search any city"}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="pincode" className={LABEL_CLASS}>
                Pincode
              </label>
              <Input
                id="pincode"
                name="pincode"
                // Numbers only: `type="number"` would allow "e", "+" and a
                // spinner, so the value is filtered on the way in instead.
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pincode}
                onChange={(e) =>
                  setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit pincode"
                autoComplete="postal-code"
                disabled={pending}
                className={FIELD_CLASS}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="country" className={LABEL_CLASS}>
                Country
              </label>
              <Select value={SHIPPING_COUNTRY} disabled={pending}>
                <SelectTrigger id="country" className={SELECT_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={POPUP_CLASS}>
                  <SelectItem value={SHIPPING_COUNTRY}>
                    {SHIPPING_COUNTRY}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="recipientPhone" className={LABEL_CLASS}>
              Recipient phone
            </label>
            <Input
              id="recipientPhone"
              name="recipientPhone"
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              autoComplete="tel"
              disabled={pending}
              className={FIELD_CLASS}
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="border-[#1C283D] bg-transparent sm:justify-stretch">
            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-gradient-to-t from-[#2B1D8C] to-[#7166F0] text-white shadow-[inset_0_4px_4px_rgba(0,0,0,0.25)] hover:opacity-95"
            >
              {pending ? "Processing…" : "Confirm Redemption"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
