"use client";

import { useState } from "react";
import { EmployeePhoneSetup } from "@/app/login/employee-phone-setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function InviteSetupEntry() {
  const [phone, setPhone] = useState("");
  const [started, setStarted] = useState(false);

  if (started) return <EmployeePhoneSetup initialPhone={phone} />;

  return (
    <Card>
      <CardHeader><CardTitle>Find your invitation</CardTitle><CardDescription>Enter the phone number your administrator registered. We will only send a verification code if it matches an eligible pending invitation.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(event) => { event.preventDefault(); setStarted(true); }} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="invite-phone">Registered mobile number</Label><Input id="invite-phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="015XXXXXXXX" /></div>
          <Button type="submit" className="w-full">Continue setup</Button>
        </form>
      </CardContent>
    </Card>
  );
}
