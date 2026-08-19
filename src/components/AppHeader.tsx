import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useIsAdmin, useSession } from "@/hooks/useSession";

export function AppHeader() {
  const { user } = useSession();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" className="font-display text-lg tracking-tight">
          Atelier<span className="text-accent">·</span>Partners
        </Link>

        {user ? (
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <Link to="/dashboard" activeProps={{ className: "text-foreground font-medium" }}>
              Items
            </Link>
            <Link to="/upload" activeProps={{ className: "text-foreground font-medium" }}>
              Upload
            </Link>
            {isAdmin ? (
              <Link to="/admin" activeProps={{ className: "text-foreground font-medium" }}>
                Review queue
              </Link>
            ) : null}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link to="/auth">Partner sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
