import { createFileRoute, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AstraMark } from "@/components/astra/Mark";
import { AppShell } from "@/components/astra/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <AstraMark className="size-8" pulsing />
      </div>
    );
  if (!session) return <Navigate to="/auth" replace />;
  // The full-tab game player shows only the game (no sidebar or welcome prompts).
  if (pathname === "/play") return <Outlet />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
