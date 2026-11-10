"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Waves } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/auth-token";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/shared";
import { ThemeToggle } from "@/components/theme-toggle";

type Mode = "signin" | "signup";
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, status, signIn, signUp } = useAuth();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  useEffect(() => {
    if (status === "signed-in" && user) router.replace(next);
  }, [status, user, next, router]);

  const problems = {
    name: signup && !name.trim() ? "Enter your name." : "",
    email: emailPattern.test(email.trim())
      ? ""
      : "Enter a valid email address.",
    password: password.length >= 8 ? "" : "Use at least 8 characters.",
  };
  const invalid = Object.values(problems).some(Boolean);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setError("");
    if (invalid) return;
    setPending(true);
    try {
      if (signup)
        await signUp({ name: name.trim(), email: email.trim(), password });
      else await signIn({ email: email.trim(), password });
      router.replace(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry.",
      );
      setPending(false);
    }
  }
  const field = (
    id: keyof typeof problems,
    label: string,
    type: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
  ) => (
    <div className="form-field">
      <label htmlFor={`auth-${id}`}>{label}</label>
      <input
        id={`auth-${id}`}
        className="field"
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => set(e.target.value)}
        aria-invalid={touched && !!problems[id]}
        aria-describedby={
          touched && problems[id] ? `auth-${id}-error` : undefined
        }
        disabled={pending}
      />
      {touched && problems[id] && (
        <small id={`auth-${id}-error`} className="auth-field-error">
          {problems[id]}
        </small>
      )}
    </div>
  );
  return (
    <div className="auth-card">
      <div role="tablist" aria-label="Account" className="auth-tabs">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={mode === m}
            aria-controls="auth-panel"
            tabIndex={mode === m ? 0 : -1}
            onClick={() => {
              setMode(m);
              setError("");
              setTouched(false);
            }}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form
        id="auth-panel"
        role="tabpanel"
        aria-labelledby={`tab-${mode}`}
        onSubmit={submit}
        noValidate
      >
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-lede">
          {signup
            ? "Join RiverMind to claim cleanup quests and support the river."
            : "Sign in to claim quests, submit proof, and donate."}
        </p>
        {signup && field("name", "Your name", "text", name, setName, "name")}
        {field("email", "Email", "email", email, setEmail, "email")}
        {field(
          "password",
          "Password",
          "password",
          password,
          setPassword,
          signup ? "new-password" : "current-password",
        )}
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending
            ? signup
              ? "Creating account…"
              : "Signing in…"
            : signup
              ? "Create account"
              : "Sign in"}
        </button>
        {api.mode === "fixture" && (
          <p className="auth-demo">
            Demo mode: accounts live only in this browser tab (sessionStorage)
            and are not real security.
            <br />
            Demo council: council@demo.rivermind / council-demo
          </p>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main-content" className="auth-main">
        <span className="auth-mark" aria-hidden="true">
          <Waves size={28} strokeWidth={1.4} />
        </span>
        <Suspense fallback={<div className="auth-card">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
