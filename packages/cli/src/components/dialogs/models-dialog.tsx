import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { DialogSearchList } from "../dialog-search-list";
import type { SupportedChatModelId } from "@codexa/shared";
import { AddApiKeyDialogContent } from "./add-api-key-dialog";
import { hasApiKey } from "../../lib/api-keys";
import { getProviderForModel } from "../../lib/model-utils";

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
                toast.show({ variant: "info", message: `Selected AI model ${modelId}` });
                dialog.close();
            }
        },
        [onSelectModel, dialog, toast],
    );

    const openAddApiKey = useCallback(() => {
        dialog.open({
            title: "Setup AI Model & API Key",
            children: <AddApiKeyDialogContent />,
        });
    }, [dialog]);

    return (
        <box flexDirection="column" gap={0}>
            <DialogSearchList
                items={models}
                onSelect={handleSelect}
                filterFn={(modelId, query) => modelId.toLowerCase().includes(query.toLowerCase())}
                renderItem={(modelId, isSelected) => {
                    const provider = getProviderForModel(modelId);
                    const hasKey = hasApiKey(provider);
                    return (
                        <box flexDirection="row" gap={1}>
                            <text fg={isSelected ? "black" : "white"}>{modelId}</text>
                            <text fg="yellow">[{provider}]</text>
                            {hasKey ? <text fg="green">✓ key set</text> : null}
                        </box>
                    );
                }}
                getKey={(modelId) => modelId}
                placeholder="Search models"
                emptyText="No matching models"
            />
            <box
                flexDirection="row"
                height={1}
                marginTop={1}
                onMouseDown={openAddApiKey}
            >
                <text fg="cyan">+ Add / Update API Key</text>
            </box>
        </box>
    );
};
