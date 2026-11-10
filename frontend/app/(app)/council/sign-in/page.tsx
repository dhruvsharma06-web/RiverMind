"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, KeyRound, ShieldCheck } from "lucide-react";
import { useCouncilSession } from "@/components/session";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, PageHeading, Panel } from "@/components/ui/shared";
export default function CouncilSignIn() {
  const session = useCouncilSession(),
    router = useRouter();
  const [key, setKey] = useState("");
  return (
    <>
      <PageHeading
        chapter="Council access / A responsibility to the river"
        title="A little oversight. A lot of trust."
        description="Enter a council key to review payment decisions. The backend authorizes every action."
      />
      <div className="council-gateway">
        <Panel>
          <span className="gateway-symbol">
            <ShieldCheck size={33} strokeWidth={1.2} />
          </span>
          <h2>Enter the council workspace.</h2>
          <p>
            Keys stay in memory for this visit. Refreshing or leaving the
            application clears access; nothing is stored in a URL or browser
            storage.
          </p>
          {api.mode === "fixture" && (
            <Notice>
              Interactive demo: any non-empty demo key opens simulated controls.
              This is not real authentication.
            </Notice>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              session.setKey(key.trim());
              setKey("");
              router.push("/council");
            }}
          >
            <div className="form-field">
              <label htmlFor="council-key">
                {api.mode === "fixture"
                  ? "Demo council key"
                  : "Council API key"}
              </label>
              <input
                id="council-key"
                type="password"
                className="field"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                required
              />
              <small>
                Entering a key does not validate it. Permission is checked when
                an action reaches the backend.
              </small>
            </div>
            <Button type="submit" disabled={!key.trim()}>
              Enter workspace
              <KeyRound size={15} />
            </Button>
          </form>
          {session.key && (
            <Link className="text-link" href="/council">
              Return to your current workspace
              <ArrowUpRight size={14} />
            </Link>
          )}
        </Panel>
      </div>
    </>
  );
}
