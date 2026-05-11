import { useWorkspaceCanvasAgentLastMessageCopy } from './useAgentLastMessageToNote'
import { useWorkspaceCanvasSyncActionRefs, type WorkspaceCanvasActionRefs } from './useActionRefs'
import { useWorkspaceCanvasPtyTaskCompletion } from './usePtyTaskCompletion'
import { useWorkspaceCanvasRoleWorkflowRuntime } from './useRoleWorkflowRuntime'

export function useWorkspaceCanvasRuntimeBindings({
  setNodes,
  roleWorkflowLinks,
  onRequestPersistFlush,
  actionRefs,
  clearNodeSelection,
  closeNode,
  resizeNode,
  noteMutations,
  updateWebsiteUrl,
  setWebsitePinned,
  setWebsiteSession,
  updateNodeScrollback,
  updateTerminalTitle,
  renameTerminalTitle,
  reloadAgentSession,
  listAgentSessions,
  switchAgentSession,
  focusNodeOnClick,
  focusNodeTargetZoom,
  nodesRef,
  updateRoleRunRecord,
  reactFlow,
  onShowMessage,
}: {
  setNodes: Parameters<typeof useWorkspaceCanvasPtyTaskCompletion>[0]['setNodes']
  roleWorkflowLinks: Parameters<
    typeof useWorkspaceCanvasRoleWorkflowRuntime
  >[0]['roleWorkflowLinks']
  onRequestPersistFlush?: Parameters<
    typeof useWorkspaceCanvasPtyTaskCompletion
  >[0]['onRequestPersistFlush']
  actionRefs: WorkspaceCanvasActionRefs
  clearNodeSelection: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['clearNodeSelection']
  closeNode: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['closeNode']
  resizeNode: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['resizeNode']
  noteMutations: Pick<
    Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0],
    'updateNoteText' | 'renameNoteTitle'
  >
  updateWebsiteUrl: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['updateWebsiteUrl']
  setWebsitePinned: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['setWebsitePinned']
  setWebsiteSession: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['setWebsiteSession']
  updateNodeScrollback: Parameters<
    typeof useWorkspaceCanvasSyncActionRefs
  >[0]['updateNodeScrollback']
  updateTerminalTitle: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['updateTerminalTitle']
  renameTerminalTitle: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['renameTerminalTitle']
  reloadAgentSession: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['reloadAgentSession']
  listAgentSessions: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['listAgentSessions']
  switchAgentSession: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['switchAgentSession']
  focusNodeOnClick: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['focusNodeOnClick']
  focusNodeTargetZoom: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['focusNodeTargetZoom']
  nodesRef: Parameters<typeof useWorkspaceCanvasAgentLastMessageCopy>[0]['nodesRef']
  updateRoleRunRecord: Parameters<
    typeof useWorkspaceCanvasRoleWorkflowRuntime
  >[0]['updateRoleRunRecord']
  reactFlow: Parameters<typeof useWorkspaceCanvasSyncActionRefs>[0]['reactFlow']
  onShowMessage?: Parameters<typeof useWorkspaceCanvasAgentLastMessageCopy>[0]['onShowMessage']
}): void {
  useWorkspaceCanvasPtyTaskCompletion({ setNodes, onRequestPersistFlush })

  useWorkspaceCanvasRoleWorkflowRuntime({
    roleWorkflowLinks,
    nodesRef,
    actionRefs,
    updateRoleRunRecord,
    onShowMessage,
  })

  const copyAgentLastMessage = useWorkspaceCanvasAgentLastMessageCopy({
    nodesRef,
    onShowMessage,
  })

  useWorkspaceCanvasSyncActionRefs({
    actionRefs,
    clearNodeSelection,
    closeNode,
    resizeNode,
    copyAgentLastMessage,
    reloadAgentSession,
    listAgentSessions,
    switchAgentSession,
    updateNoteText: noteMutations.updateNoteText,
    renameNoteTitle: noteMutations.renameNoteTitle,
    updateWebsiteUrl,
    setWebsitePinned,
    setWebsiteSession,
    updateNodeScrollback,
    updateTerminalTitle,
    renameTerminalTitle,
    focusNodeOnClick,
    focusNodeTargetZoom,
    nodesRef,
    reactFlow,
  })
}
