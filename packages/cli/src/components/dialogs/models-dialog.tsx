import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { DialogSearchList } from "../dialog-search-list";
import type { SupportedChatModelId } from "@codexa/shared";
import { AddApiKeyDialogContent } from "./add-api-key-dialog";
import { hasApiKey } from "../../lib/api-keys";
import { getProviderForModel } from "../../lib/model-utils";
import { useTheme } from "../../providers/theme";
import { TextAttributes } from "@opentui/core";

type ModelsDialogContentProps = {
    models: SupportedChatModelId[];
    onSelectModel: (modelId: SupportedChatModelId) => void;
};

export const ModelsDialogContent = ({
    models,
    onSelectModel,
}: ModelsDialogContentProps) => {
    const dialog = useDialog();
    const toast = useToast();
    const { colors } = useTheme();

    const handleSelect = useCallback(
        (modelId: SupportedChatModelId) => {
            onSelectModel(modelId);
            const provider = getProviderForModel(modelId);
            if (!hasApiKey(provider)) {
                dialog.open({
                    title: `Configure API Key for ${modelId}`,
                    children: (
                        <AddApiKeyDialogContent
                            initialModelId={modelId}
                            onSaved={() => dialog.close()}
                        />
                    ),
                });
            } else {
                toast.show({ variant: "info", message: `Selected AI model: ${modelId}` });
                dialog.close();
            }
        },
        [onSelectModel, dialog, toast],
    );

    const openAddApiKey = useCallback(() => {
        dialog.open({
            title: "Setup AI Model & API Key",
            children: <AddApiKeyDialogContent onSaved={() => dialog.close()} />,
        });
    }, [dialog]);

    const openAddKeyForModel = useCallback((modelId: SupportedChatModelId, e?: { stopPropagation?: () => void }) => {
        e?.stopPropagation?.();
        onSelectModel(modelId);
        dialog.open({
            title: `Configure API Key for ${modelId}`,
            children: (
                <AddApiKeyDialogContent
                    initialModelId={modelId}
                    onSaved={() => dialog.close()}
                />
            ),
        });
    }, [onSelectModel, dialog]);

    return (
        <box flexDirection="column" gap={1}>
            <DialogSearchList
                items={models}
                onSelect={handleSelect}
                filterFn={(modelId, query) => modelId.toLowerCase().includes(query.toLowerCase())}
                renderItem={(modelId, isSelected) => {
                    const provider = getProviderForModel(modelId);
                    const hasKey = hasApiKey(provider);
                    return (
                        <box flexDirection="row" justifyContent="space-between" width="100%" alignItems="center">
                            <box flexDirection="row" gap={1}>
                                <text fg={isSelected ? "black" : "white"} attributes={isSelected ? TextAttributes.BOLD : undefined}>
                                    {modelId}
                                </text>
                                <text fg={isSelected ? "black" : "yellow"}>[{provider}]</text>
                            </box>
                            {hasKey ? (
                                <text fg={isSelected ? "black" : "green"}>✓ Key active</text>
                            ) : (
                                <box
                                    onMouseDown={(e) => openAddKeyForModel(modelId, e)}
                                    paddingX={1}
                                    backgroundColor={isSelected ? "black" : colors.surface}
                                >
                                    <text fg={isSelected ? "yellow" : "cyan"} attributes={TextAttributes.BOLD}>
                                        + Add API Key
                                    </text>
                                </box>
                            )}
                        </box>
                    );
                }}
                getKey={(modelId) => modelId}
                placeholder="Search AI models..."
                emptyText="No matching models"
            />

            <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                marginTop={1}
                paddingX={1}
                paddingY={1}
                backgroundColor={colors.surface}
                borderStyle="single"
                borderColor={colors.primary}
                onMouseDown={openAddApiKey}
            >
                <text fg={colors.primary} attributes={TextAttributes.BOLD}>
                    🔑 + Add / Update API Key for Providers
                </text>
                <text fg="cyan" attributes={TextAttributes.UNDERLINE}>[ Click to Configure ]</text>
            </box>
            <text attributes={TextAttributes.DIM} fg="gray">
                Press Enter on any model to select it. Missing API keys will automatically prompt key setup.
            </text>
        </box>
    );
};

