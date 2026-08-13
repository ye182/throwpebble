import { useEffect, useRef, useState } from "react";
import { DiaryApp } from "./DiaryApp";
import { LoginPanel } from "./entry/LoginPanel";
import { StoneSplash } from "./entry/StoneSplash";
import { fetchMe, getToken, setToken, type PublicUser } from "./lib/api";
import { bindMoodStorageToUser } from "./lib/calendarMood";
import { bindProfileStorageToUser } from "./lib/profileStore";
import { bindReplyStorageToUser } from "./lib/replyLocalStore";
import { bindUserLlmStorageToUser } from "./lib/userLlmConfig";

function bindUserLocalStores(userId: string | null) {
  bindMoodStorageToUser(userId);
  bindReplyStorageToUser(userId);
  bindProfileStorageToUser(userId);
  bindUserLlmStorageToUser(userId);
}

type Phase = "boot" | "intro" | "auth" | "diary";

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootError, setBootError] = useState("");
  const userRef = useRef<PublicUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    bindUserLocalStores(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const token = getToken();

      if (token) {
        try {
          const { user: me } = await fetchMe();
          if (cancelled) return;
          userRef.current = me;
          bindUserLocalStores(me.id);
          setUser(me);
          setPhase("diary");
          return;
        } catch {
          setToken(null);
          userRef.current = null;
          bindUserLocalStores(null);
          if (!cancelled) setBootError("");
        }
      }

      if (!cancelled) {
        setPhase("intro");
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "boot") {
    return (
      <div className="boot">
        <p>加载中…</p>
        {bootError && <p className="login-error">{bootError}</p>}
      </div>
    );
  }

  if (phase === "diary") {
    return (
      <DiaryApp
        onLoggedOut={() => {
          userRef.current = null;
          bindUserLocalStores(null);
          setUser(null);
          setPhase("intro");
        }}
      />
    );
  }

  return (
    <div className="entry-app">
      <StoneSplash
        visible={phase === "intro"}
        onReadyForAuth={() => {
          setPhase("auth");
        }}
      />
      {phase === "auth" && (
        <LoginPanel
          onSuccess={(u) => {
            userRef.current = u;
            bindUserLocalStores(u.id);
            setUser(u);
            setPhase("diary");
          }}
        />
      )}
    </div>
  );
}
