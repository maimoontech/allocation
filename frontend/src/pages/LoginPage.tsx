import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import type { Role } from "../types";
import { useLoginMutation } from "../features/auth/authApi";
import { useAppDispatch } from "../hooks/storeHooks";
import { setAuth } from "../features/auth/authSlice";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "zonal_head", label: "Zonal Head" },
  { value: "party", label: "Party" },
  { value: "coordinator", label: "Venue Coordinator" }
];

function defaultPathByRole(role: Role) {
  if (role === "party") return "/my-schedule";
  if (role === "coordinator") return "/assigned-parties";
  return "/dashboard";
}

export function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, loginState] = useLoginMutation();

  const [role, setRole] = useState<Role>("admin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isBusy = loginState.isLoading;

  const roleHelperText = useMemo(() => {
    if (role === "admin") return "Use your Admin username";
    if (role === "zonal_head") return "Use your Zone name or Zone ID";
    if (role === "party") return "Use your ITS No as User ID";
    return "Use your Venue name or Venue ID";
  }, [role]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 text-center">
          <div className="text-2xl font-bold text-primary">Anjuman-e-Zakereen Hussain A.S Karachi</div>
          <div className="text-sm text-textMuted">Zakereen Scheduling System</div>
        </div>
        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const result = await login({ identifier, password, role }).unwrap();
                dispatch(
                  setAuth({
                    token: result.token,
                    refreshToken: result.refresh_token,
                    user: result.user
                  })
                );
                navigate(defaultPathByRole(role), { replace: true });
              } catch (err: any) {
                const message =
                  err?.data?.message ||
                  err?.error ||
                  (typeof err?.message === "string" ? err.message : null) ||
                  "Login failed. Please check role, ID and password.";
                setError(String(message));
              }
            }}
          >
            <div className="text-lg font-bold">Login</div>
            {error ? <div className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger">{error}</div> : null}

            <Select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              options={roleOptions}
            />
            <Input
              label={role === "party" ? "ITS No" : "ID / Name"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              helperText={roleHelperText}
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button type="submit" disabled={isBusy} className="w-full">
              {isBusy ? "Logging in..." : "Login"}
            </Button>
          </form>
        </Card>
        <div className="mt-3 text-center text-xs text-textMuted">
          Forgot password? Contact Admin / Zonal Head.
        </div>
        {/* <div className="mt-3 text-center text-xs text-textMuted">
          Frontend v{__APP_VERSION__} | build {__APP_BUILD__}
        </div> */}
        {/* <div className="mt-1 text-center text-xs text-textMuted">{backendInfo}</div> */}
       {/* <div className="mt-1 text-center text-[11px] text-textMuted">API: {apiBaseUrl}</div> */}
      </div>
    </div>
  );
}
