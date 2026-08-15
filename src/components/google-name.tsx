"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Sign in with Google" purely in the browser (Google Identity Services) —
 * used only to prefill a caregiver's name. The site is static: the ID token
 * never leaves the device; we decode its name claim locally and discard it.
 *
 * Renders nothing until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set at build time
 * (create an OAuth client in Google Cloud Console and allow the site origin).
 */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

/** The given name (fallback: full name) from a Google ID token, or null. */
function nameFromCredential(credential: string): string | null {
  try {
    const payload = credential.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { given_name?: string; name?: string };
    const name = (json.given_name || json.name || "").trim();
    return name || null;
  } catch {
    return null;
  }
}

export function GoogleNameButton({
  onName,
}: {
  /** Called with the Google account's name after a successful sign-in. */
  onName: (name: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // Keep the latest callback in a ref so the GIS init (once) never goes stale.
  const onNameRef = useRef(onName);
  useEffect(() => {
    onNameRef.current = onName;
  });

  useEffect(() => {
    if (!CLIENT_ID || !slot.current) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          const name = response.credential
            ? nameFromCredential(response.credential)
            : null;
          if (name) {
            setSignedInAs(name);
            onNameRef.current(name);
          }
        },
      });
      window.google.accounts.id.renderButton(slot.current, {
        type: "standard",
        theme: "outline",
        size: "medium",
        text: "continue_with",
        shape: "pill",
      });
    };

    if (window.google) {
      init();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GSI_SRC}"]`,
      );
      const script = existing ?? document.createElement("script");
      script.addEventListener("load", init);
      if (!existing) {
        script.src = GSI_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      return () => {
        cancelled = true;
        script.removeEventListener("load", init);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-1">
      <div ref={slot} />
      <p className="text-muted-foreground text-xs">
        {signedInAs
          ? `Inloggad som ${signedInAs}.`
          : "Hämtar bara namnet från ditt Google-konto — inget sparas utanför din webbläsare."}
      </p>
    </div>
  );
}
