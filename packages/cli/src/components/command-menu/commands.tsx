import type { Command } from "./types";
import {
  AgentsDialogContent,
  ThemeDialogContent,
  SessionsDialogContent,
  ModelsDialogContent,
  McpDialogContent,
  CodexaLensDialogContent,
  GitDialogContent,
} from "../dialogs";
import { AddApiKeyDialogContent } from "../dialogs/add-api-key-dialog";
import { SUPPORTED_CHAT_MODELS } from "@codexa/shared";
import { performLogin } from "../../lib/oauth";
import { clearAuth } from "../../lib/auth";
import { openBillingPortal, openUpgradeCheckout } from "../../lib/upgrade";
import { detectProject } from "../../lib/project-detector";
import { undoLastSnapshotSet } from "../../lib/snapshot-manager";
import { apiClient } from "../../lib/api-client";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
    action: (ctx) => {
      ctx.navigate("/");
    }
  },
  {
    name: "agents",
    description: "Switch agents",
    value: "/agents",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Agent",
        children: <AgentsDialogContent currentMode={ctx.mode} onSelectMode={ctx.setMode} />,
      });
    },
  },
  {
    name: "models",
    description: "Select AI model for generation",
    value: "/models",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Model",
        children: (
          <ModelsDialogContent
            models={SUPPORTED_CHAT_MODELS.map((model) => model.id)}
            onSelectModel={ctx.setModel}
          />
        ),
      });
    },
  },
  {
    name: "sessions",
    description: "Browse past sessions",
    value: "/sessions",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Sessions",
        children: <SessionsDialogContent />,
      });
    },
  },
  {
    name: "lens",
    description: "Explore local code and replay agent activity",
    value: "/lens",
    action: (ctx) => {
      ctx.dialog.open({
        title: "CodexaLens",
        size: "fullscreen",
        children: <CodexaLensDialogContent />,
      });
    },
  },
  {
    name: "neolens",
    description: "Explore local code and replay agent activity",
    value: "/neolens",
    action: (ctx) => {
      ctx.dialog.open({
        title: "CodexaLens",
        size: "fullscreen",
        children: <CodexaLensDialogContent />,
      });
    },
  },
  {
    name: "apikey",
    description: "Add or update an AI provider API key",
    value: "/apikey",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Add API Key",
        children: <AddApiKeyDialogContent />,
      });
    },
  },
  {
    name: "mcp",
    description: "Inspect configured MCP servers and tools",
    value: "/mcp",
    action: (ctx) => {
      ctx.dialog.open({
        title: "MCP Control Center",
        children: <McpDialogContent />,
      });
    },
  },
  {
    name: "theme",
    description: "Change color theme",
    value: "/theme",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Theme",
        children: <ThemeDialogContent />,
      });
    },
  },
  {
    name: "login",
    description: "Sign in with your browser",
    value: "/login",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening browser to sign in..." });
      try {
        await performLogin();
        ctx.toast.show({ variant: "success", message: "Signed in successfully!" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sign in failed or timed out";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "logout",
    description: "Sign out of your account",
    value: "/logout",
    action: (ctx) => {
      clearAuth();
      ctx.toast.show({ variant: "success", message: "Signed out" });
    },
  },
  {
    name: "upgrade",
    description: "Buy more credits",
    value: "/upgrade",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening credits checkout..." });
      try {
        await openUpgradeCheckout();
        ctx.toast.show({ variant: "success", message: "Checkout opened in browser" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open checkout";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "usage",
    description: "Open billing portal in your browser",
    value: "/usage",
    action: async (ctx) => {
      ctx.toast.show({ message: "Opening billing portal..." });
      try {
        await openBillingPortal();
        ctx.toast.show({ variant: "success", message: "Billing portal opened in browser" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open billing portal";
        ctx.toast.show({ variant: "error", message });
      }
    },
  },
  {
    name: "git",
    description: "Open Git status dialog",
    value: "/git",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Git Status",
        children: <GitDialogContent initialTab="status" />,
      });
    },
  },
  {
    name: "diff",
    description: "Show current Git changes diff",
    value: "/diff",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Git Diff",
        size: "fullscreen",
        children: <GitDialogContent initialTab="diff" />,
      });
    },
  },
  {
    name: "status",
    description: "Show current project info status",
    value: "/status",
    action: (ctx) => {
      const info = detectProject();
      ctx.toast.show({
        message: `Project: ${info.name} | PM: ${info.packageManager} | Git: ${info.gitStatus}`,
      });
    },
  },
  {
    name: "undo",
    description: "Undo the last changes made by Codexa",
    value: "/undo",
    action: (ctx) => {
      if (!ctx.sessionId) {
        ctx.toast.show({ variant: "error", message: "No active session for undo" });
        return;
      }
      const reverted = undoLastSnapshotSet(ctx.sessionId);
      if (reverted.length > 0) {
        ctx.toast.show({
          variant: "success",
          message: `Reverted changes in: ${reverted.join(", ")}`,
        });
      } else {
        ctx.toast.show({ message: "No changes to revert" });
      }
    },
  },
  {
    name: "plan",
    description: "Switch to PLAN mode",
    value: "/plan",
    action: (ctx) => {
      ctx.setMode("PLAN");
      ctx.toast.show({ message: "Switched to PLAN mode" });
    },
  },
  {
    name: "build",
    description: "Switch to BUILD mode",
    value: "/build",
    action: (ctx) => {
      ctx.setMode("BUILD");
      ctx.toast.show({ message: "Switched to BUILD mode" });
    },
  },
  {
    name: "test",
    description: "Submit testing request to the agent",
    value: "/test",
    action: (ctx) => {
      if (ctx.submit) {
        ctx.submit("run the tests and fix whatever fails");
      }
    },
  },
  {
    name: "lint",
    description: "Submit linting request to the agent",
    value: "/lint",
    action: (ctx) => {
      if (ctx.submit) {
        ctx.submit("run the linter and fix all issues");
      }
    },
  },
  {
    name: "review",
    description: "Submit code review request for your changes",
    value: "/review",
    action: (ctx) => {
      if (ctx.submit) {
        ctx.submit("review my current git diff and identify issues");
      }
    },
  },
  {
    name: "scan",
    description: "Submit security and bug scan request",
    value: "/scan",
    action: (ctx) => {
      if (ctx.submit) {
        ctx.submit("scan for security issues and potential bugs");
      }
    },
  },
  {
    name: "clear",
    description: "Clear history messages of this session",
    value: "/clear",
    action: async (ctx) => {
      if (!ctx.sessionId) {
        ctx.toast.show({ variant: "error", message: "No active session to clear" });
        return;
      }
      try {
        const res = await apiClient.sessions[":id"].clear.$post({
          param: { id: ctx.sessionId }
        });
        if (res.ok) {
          ctx.toast.show({ variant: "success", message: "Conversation history cleared" });
          ctx.navigate("/");
        } else {
          ctx.toast.show({ variant: "error", message: "Failed to clear session" });
        }
      } catch {
        ctx.toast.show({ variant: "error", message: "Failed to clear session" });
      }
    },
  },
  {
    name: "exit",
    description: "Quit the application",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
