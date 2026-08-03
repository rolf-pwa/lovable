import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { OnboardingMemberInput, OnboardingState } from "../../hooks/useOnboarding";

const RELATIONSHIPS: { value: OnboardingMemberInput["relationship"]; label: string }[] = [
  { value: "spouse", label: "Spouse / partner" },
  { value: "child", label: "Child" },
  { value: "dependant", label: "Other dependant" },
  { value: "other", label: "Other member" },
];

interface Props {
  state: OnboardingState;
  saving: boolean;
  onSave: (input: {
    householdName: string;
    primaryName: string;
    address: string;
    phone?: string;
    email?: string;
    members: OnboardingMemberInput[];
  }) => void;
}

const PLACEHOLDER_NAMES = ["new client", "client", ""];

/** Step 2 — household details and members (each becomes a contact record). */
export const StepHouseholdProfile = ({ state, saving, onSave }: Props) => {
  const knownName = PLACEHOLDER_NAMES.includes(state.contact.fullName.trim().toLowerCase())
    ? ""
    : state.contact.fullName;

  const derivedName =
    state.household.label ||
    (state.contact.lastName ? `${state.contact.lastName} Household` : knownName);

  const [primaryName, setPrimaryName] = useState(knownName);
  const [householdName, setHouseholdName] = useState(derivedName);
  const [address, setAddress] = useState(state.household.address);
  const [phone, setPhone] = useState(state.contact.phone);
  const [email, setEmail] = useState(state.contact.email);
  const [members, setMembers] = useState<OnboardingMemberInput[]>([]);

  const updateMember = (index: number, patch: Partial<OnboardingMemberInput>) =>
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const canSubmit =
    primaryName.trim().length > 1 &&
    householdName.trim().length > 0 &&
    address.trim().length > 0 &&
    !saving;


  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-1.5">
          <h2 className="font-serif text-lg font-semibold text-foreground">Your household</h2>
          <p className="text-sm text-muted-foreground">
            This is how we'll refer to your household across your Sanctuary. Only the people you
            list here will ever be part of it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-primary-name">Your full name</Label>
            <Input
              id="ob-primary-name"
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              placeholder="e.g. Jane Smith"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-household">Household name</Label>
            <Input
              id="ob-household"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g. The Smith Household"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-address">Home address</Label>
            <Textarea
              id="ob-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city, province, postal code"
              rows={2}
              maxLength={400}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-phone">Phone</Label>
            <Input
              id="ob-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-email">Email</Label>
            <Input
              id="ob-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground font-serif">
                Household members
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setMembers((prev) => [...prev, { fullName: "", email: "", relationship: "spouse" }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add member
            </Button>
          </div>

          {state.members.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Already on file: {state.members.map((m) => m.fullName).join(", ")}
            </div>
          )}

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add your spouse, children or other dependants. You can always add more later.
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                >
                  <Input
                    value={member.fullName}
                    onChange={(e) => updateMember(index, { fullName: e.target.value })}
                    placeholder="Full name"
                    maxLength={120}
                  />
                  <Input
                    value={member.email ?? ""}
                    onChange={(e) => updateMember(index, { email: e.target.value })}
                    placeholder="Email (optional)"
                    type="email"
                    maxLength={200}
                  />
                  <Select
                    value={member.relationship}
                    onValueChange={(v) =>
                      updateMember(index, {
                        relationship: v as OnboardingMemberInput["relationship"],
                      })
                    }
                  >
                    <SelectTrigger className="sm:w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIPS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          disabled={!canSubmit}
          onClick={() =>
            onSave({
              householdName: householdName.trim(),
              primaryName: primaryName.trim(),

              phone: phone.trim(),
              email: email.trim(),
              members: members.filter((m) => m.fullName.trim().length > 0),
            })
          }
        >
          Save and continue
        </Button>
      </CardContent>
    </Card>
  );
};
