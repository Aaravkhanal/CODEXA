import { useState, useMemo } from "react";
import { useTheme } from "../../providers/theme";
import { ProjectMemoryManager } from "@codexa/agent";
import { TextAttributes } from "@opentui/core";
import { useToast } from "../../providers/toast";

export function MemoryDialogContent() {
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<"show" | "import" | "export">("show");
  const [importPath, setImportPath] = useState("");
  const [exportPath, setExportPath] = useState("");

  const memoryManager = useMemo(() => new ProjectMemoryManager(process.cwd()), []);
  const memoryContent = useMemo(() => memoryManager.getOrInitMemory(), [memoryManager]);
  const resumeInfo = useMemo(() => memoryManager.getResumeInfo(), [memoryManager]);

  const handleExport = () => {
    try {
      const res = memoryManager.exportMemory(exportPath || undefined);
      toast.show({ variant: "success", message: `Memory exported to: ${res.path}` });
    } catch (err: any) {
      toast.show({ variant: "error", message: `Export failed: ${err.message}` });
    }
  };

  const handleImport = () => {
    if (!importPath) {
      toast.show({ variant: "error", message: "Please enter a file path to import" });
      return;
    }
    const res = memoryManager.importMemory(importPath);
    if (res.success) {
      toast.show({ variant: "success", message: res.message });
      setTab("show");
    } else {
      toast.show({ variant: "error", message: res.message });
    }
  };

  return (
    <box flexDirection="column" gap={1} width="100%">
      <box flexDirection="row" gap={2}>
        <box
          backgroundColor={tab === "show" ? colors.primary : colors.surface}
          paddingX={1}
          onMouseDown={() => setTab("show")}
        >
          <text fg={tab === "show" ? "black" : "white"} attributes={TextAttributes.BOLD}>
            🧠 Project Memory
          </text>
        </box>
        <box
          backgroundColor={tab === "import" ? colors.primary : colors.surface}
          paddingX={1}
          onMouseDown={() => setTab("import")}
        >
          <text fg={tab === "import" ? "black" : "white"} attributes={TextAttributes.BOLD}>
            📥 Import Notes
          </text>
        </box>
        <box
          backgroundColor={tab === "export" ? colors.primary : colors.surface}
          paddingX={1}
          onMouseDown={() => setTab("export")}
        >
          <text fg={tab === "export" ? "black" : "white"} attributes={TextAttributes.BOLD}>
            📤 Export Memory
          </text>
        </box>
      </box>

      {tab === "show" && (
        <box flexDirection="column" gap={1} borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingY={1}>
          <text fg={colors.info} attributes={TextAttributes.BOLD}>
            Project Memory (.codexa/memory.md)
          </text>
          {resumeInfo.lastSummary && (
            <box flexDirection="column" gap={1} backgroundColor={colors.surface} paddingX={1}>
              <text fg="yellow" attributes={TextAttributes.BOLD}>Last Session Summary:</text>
              <text fg="white">{resumeInfo.lastSummary}</text>
            </box>
          )}
          <text fg="white">
            {memoryContent.slice(0, 2000)}
            {memoryContent.length > 2000 ? "\n... (truncated for display)" : ""}
          </text>
        </box>
      )}

      {tab === "import" && (
        <box flexDirection="column" gap={1} borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingY={1}>
          <text fg={colors.info} attributes={TextAttributes.BOLD}>
            Import Markdown or JSON notes into .codexa/memory.md
          </text>
          <text fg="white">
            Specify a local path (e.g. ./docs/notes.md or notes.json)
          </text>
          <box flexDirection="row" gap={1} marginTop={1}>
            <box
              backgroundColor={colors.primary}
              paddingX={1}
              onMouseDown={handleImport}
            >
              <text fg="black" attributes={TextAttributes.BOLD}>Execute Import</text>
            </box>
          </box>
        </box>
      )}

      {tab === "export" && (
        <box flexDirection="column" gap={1} borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingY={1}>
          <text fg={colors.info} attributes={TextAttributes.BOLD}>
            Export Project Memory &amp; Session Archive
          </text>
          <text fg="white">
            Exports .codexa/memory.md and session summaries into codexa-memory-export.md
          </text>
          <box flexDirection="row" gap={1} marginTop={1}>
            <box
              backgroundColor={colors.primary}
              paddingX={1}
              onMouseDown={handleExport}
            >
              <text fg="black" attributes={TextAttributes.BOLD}>Export to File</text>
            </box>
          </box>
        </box>
      )}
    </box>
  );
}
