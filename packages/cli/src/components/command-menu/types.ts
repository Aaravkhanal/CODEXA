import type { ModeType, SupportedChatModelId } from "@codexa/shared";
import type { DialogContextValue } from "../../providers/dialog";
import type { ToastContextValue } from "../../providers/toast";

export type CommandContext = {
  exit: () => void;
  toast: ToastContextValue;
  dialog: DialogContextValue;
  navigate: (path: string) => void;
  mode: ModeType;
  setMode: (mode: ModeType) => void;
  setModel: (model: SupportedChatModelId) => void;
  setText?: (text: string) => void;
  submit?: (text: string) => void;
  clearSession?: () => void;
  sessionId?: string;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandContext) => void | Promise<void>;
};
