import {
  BarChart3,
  BookOpen,
  CalendarIcon,
  Clock,
  ListTodo,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LearningPath } from "../../domain/types";
import { signInWithGoogle, signOutUser, type User } from "../../firebase/auth";
import type { ViewId } from "../viewTypes";

interface Props {
  activeView: ViewId;
  onChangeView: (view: ViewId) => void;
  activePath: LearningPath | null;
  onOpenSettings: () => void;
  keyPresent: boolean;
  providerLabel: string;
  user: User | null;
}

/** Google's standard multi-color "G" mark, used on the sign-in button. */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.766 12.276c0-.818-.074-1.606-.212-2.364H12.24v4.478h6.482a5.54 5.54 0 0 1-2.401 3.635v3.02h3.887c2.274-2.093 3.558-5.176 3.558-8.769Z"
      />
      <path
        fill="#34A853"
        d="M12.24 24c3.24 0 5.956-1.075 7.943-2.908l-3.887-3.02c-1.076.72-2.456 1.147-4.056 1.147-3.12 0-5.762-2.107-6.705-4.938H1.53v3.114A11.997 11.997 0 0 0 12.24 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.535 14.281a7.21 7.21 0 0 1 0-4.562V6.605H1.53a12.01 12.01 0 0 0 0 10.79l4.005-3.114Z"
      />
      <path
        fill="#EA4335"
        d="M12.24 4.78c1.762 0 3.344.606 4.59 1.796l3.444-3.444C18.192 1.19 15.477 0 12.24 0A11.997 11.997 0 0 0 1.53 6.605l4.005 3.114C6.478 6.887 9.12 4.78 12.24 4.78Z"
      />
    </svg>
  );
}

async function handleGoogleSignIn() {
  try {
    await signInWithGoogle();
  } catch (err) {
    alert(err instanceof Error ? err.message : "Sign-in failed.");
  }
}

interface NavItemProps {
  id: string;
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
  onClick: () => void;
}

function NavItem({ id, active, disabled, icon, label, badge, onClick }: NavItemProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${
        active
          ? "bg-blue-600/90 text-white shadow-lg shadow-blue-600/15"
          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/40"
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge}
    </button>
  );
}

/** Left-hand workspace navigation: the 5 views plus provider status. */
export function Sidebar({
  activeView,
  onChangeView,
  activePath,
  onOpenSettings,
  keyPresent,
  providerLabel,
  user,
}: Props) {
  const doneSteps = activePath?.steps.filter((s) => s.status === "done").length ?? 0;

  return (
    <aside
      className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between"
      id="app_sidebar"
    >
      <div>
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 p-1.5">
            <img src="/icon.svg" alt="" width={36} height={36} className="h-full w-full" />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-none tracking-tight text-white">
              StepByLearn
            </h1>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">WORKSPACE</span>
          </div>
        </div>

        {activePath && (
          <div className="px-4 pt-4 pb-2">
            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 font-mono">
                Current Course
              </span>
              <p className="text-xs font-semibold text-slate-200 mt-1 line-clamp-1">
                {activePath.title}
              </p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{activePath.stepDuration} / step</span>
                </div>
                <span>
                  {doneSteps}/{activePath.steps.length} Steps
                </span>
              </div>
            </div>
          </div>
        )}

        <nav className="p-4 space-y-1.5" id="sidebar_nav">
          <NavItem
            id="nav_btn_dashboard"
            active={activeView === "dashboard"}
            icon={<Sparkles className="h-4 w-4" />}
            label="Workspace Planner"
            onClick={() => onChangeView("dashboard")}
          />
          <NavItem
            id="nav_btn_study"
            active={activeView === "study"}
            disabled={!activePath}
            icon={<BookOpen className="h-4 w-4" />}
            label="Active Study Desk"
            badge={
              activePath ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ) : undefined
            }
            onClick={() => onChangeView("study")}
          />
          <NavItem
            id="nav_btn_calendar"
            active={activeView === "calendar"}
            icon={<CalendarIcon className="h-4 w-4" />}
            label="Study Calendar"
            onClick={() => onChangeView("calendar")}
          />
          <NavItem
            id="nav_btn_manual"
            active={activeView === "manual"}
            icon={<ListTodo className="h-4 w-4" />}
            label="Manual Course Architect"
            onClick={() => onChangeView("manual")}
          />
          <NavItem
            id="nav_btn_analytics"
            active={activeView === "analytics"}
            icon={<BarChart3 className="h-4 w-4" />}
            label="My Analytics"
            onClick={() => onChangeView("analytics")}
          />
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 space-y-3">
        {user ? (
          <div className="flex items-center gap-2.5 px-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="h-7 w-7 rounded-full shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {user.displayName ?? "Signed in"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              id="google_sign_out_btn"
              onClick={() => signOutUser()}
              title="Sign out"
              className="text-slate-500 hover:text-rose-400 transition-colors shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            id="google_sign_in_btn"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all"
          >
            <GoogleGlyph className="h-3.5 w-3.5" />
            <span>Sign in with Google</span>
          </button>
        )}

        <button
          id="nav_btn_settings"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 transition-all"
        >
          <Settings className="h-4 w-4" />
          <span>Provider Settings</span>
          <span
            className={`ml-auto h-1.5 w-1.5 rounded-full ${keyPresent ? "bg-emerald-400" : "bg-slate-600"}`}
          ></span>
        </button>
        <div className="text-[11px] text-slate-500 space-y-2 px-1">
          <div className="flex items-center gap-2">
            <div
              className={`h-1.5 w-1.5 rounded-full ${user ? "bg-blue-400" : "bg-emerald-400"}`}
            ></div>
            <span>{user ? "Synced across devices" : "Offline mode fully supported"}</span>
          </div>
          <div className="text-[10px] font-mono">{keyPresent ? providerLabel : "No key set"}</div>
        </div>
      </div>
    </aside>
  );
}
