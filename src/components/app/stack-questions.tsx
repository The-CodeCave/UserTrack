"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AUTH_METHOD_OPTIONS, stackQuestions, type Option, type Platform, type StackChoices } from "@/lib/stack-recommendation";
import { cn } from "@/lib/utils";

// One question per screen; answers live in the parent (sessionStorage) so a refresh resumes at the first unanswered one.
export function StackQuestions({ platform, value, onChange, onDone }: { platform: Platform; value: StackChoices; onChange: (v: StackChoices) => void; onDone: () => void }) {
  const questions = stackQuestions(platform);
  const [i, setI] = useState(() => Math.max(0, questions.findIndex((q) => !value[q.key])));
  const q = questions[i];
  const selected = value[q.key];
  const last = i === questions.length - 1;
  const methods = value.authMethods ?? [];

  return (
    <>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{q.title}</h1>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{i + 1} / {questions.length}</span>
      </div>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Used only to recommend the right sources. Nothing here is stored except your sign-in methods.</p>
      <Chips options={q.options} isOn={(v) => selected === v} onPick={(v) => onChange({ ...value, [q.key]: v })} />
      {q.key === "identity" && platform !== "web" && (
        <div className="mt-6">
          <div className="text-label">Sign-in methods (optional)</div>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Sign in with Apple / Google are authentication methods, never the user count.</p>
          <Chips options={AUTH_METHOD_OPTIONS} isOn={(v) => methods.includes(v)} onPick={(v) => onChange({ ...value, authMethods: methods.includes(v) ? methods.filter((m) => m !== v) : [...methods, v] })} />
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button className="h-11" disabled={!selected} onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Show recommendations" : "Continue"}</Button>
        {i > 0 && <Button variant="ghost" className="h-11" onClick={() => setI(i - 1)}>Back</Button>}
      </div>
    </>
  );
}

function Chips({ options, isOn, onPick }: { options: Option[]; isOn: (v: string) => boolean; onPick: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onPick(o.value)} aria-pressed={isOn(o.value)} className={cn("min-h-11 border px-3 py-2 text-left text-sm transition-colors", isOn(o.value) ? "border-pink bg-pink/5" : "border-line hover:border-line-strong")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
