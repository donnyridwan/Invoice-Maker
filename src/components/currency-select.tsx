"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_CODES } from "@/lib/currencies";

export function CurrencySelect({
  id,
  value,
  onValueChange,
  name,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} name={name}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
