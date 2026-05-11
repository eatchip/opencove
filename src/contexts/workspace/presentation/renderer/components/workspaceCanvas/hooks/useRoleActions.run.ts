import type { MutableRefObject } from 'react'
import type { Node } from '@xyflow/react'
import type { TranslateFn } from '@app/renderer/i18n'
import { toFileUri } from '@contexts/filesystem/domain/fileUri'
import { resolveSpaceWorkingDirectory } from '@contexts/space/application/resolveSpaceWorkingDirectory'
import {
  resolveAgentExecutablePathOverride,
  resolveAgentLaunchEnv,
  resolveAgentModel,
  type AgentProvider,
  type AgentSettings,
  type ProjectRoleDefinition,
} from '@contexts/settings/domain/agentSettings'
import type {
  LaunchAgentSessionResult,
  ListMountsResult,
  TerminalRuntimeKind,
} from '@shared/contracts/dto'
import type { RoleNodeData, TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import { clearResumeSessionBinding } from '../../../utils/agentResumeBinding'
import { toErrorMessage } from '../helpers'
import type { CreateNodeInput, ShowWorkspaceCanvasMessage } from '../types'
import { resolveDefaultAgentLaunchGeometry } from './agentLaunchGeometry'
import { assignNodeToSpaceAndExpand } from './useInteractions.spaceAssignment'
import { composeProjectRolePrompt } from './useRolePrompt'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

export interface RoleRunActionContext {
  workspaceId: string
  workspacePath: string
  environmentVariables?: Record<string, string>
  agentSettings: AgentSettings
  projectRoles: ProjectRoleDefinition[]
  nodesRef: MutableRefObject<Node<TerminalNodeData>[]>
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  setNodes: SetNodes
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  onRequestPersistFlush?: () => void
  onShowMessage?: ShowWorkspaceCanvasMessage
  createNodeForSession: (input: CreateNodeInput) => Promise<Node<TerminalNodeData> | null>
  updateRoleInput: (nodeId: string, input: string) => void
  appendRoleRunRecord: (
    nodeId: string,
    next: {
      linkedAgentNodeId: string | null
      record: RoleNodeData['runHistory'][number]
    },
  ) => void
  buildAgentNodeTitle: (provider: AgentProvider, label: string | null) => string
  t: TranslateFn
}

export interface RoleRunWorkflowOptions {
  workflowRunId?: string | null
  triggeredByRunId?: string | null
}

export function resolveNodeRoleDefinition(
  roleNode: Node<TerminalNodeData>,
  roles: ProjectRoleDefinition[],
): ProjectRoleDefinition | null {
  if (roleNode.data.kind !== 'role' || !roleNode.data.role) {
    return null
  }

  const fromProject = roles.find(role => role.id === roleNode.data.role?.roleId)
  if (fromProject) {
    return { ...fromProject }
  }

  return {
    id: roleNode.data.role.roleId,
    name: roleNode.data.role.roleName,
    description: roleNode.data.role.roleDescription,
    promptTemplate: roleNode.data.role.promptTemplate,
    inputHint: roleNode.data.role.inputHint,
    outputFormat: roleNode.data.role.outputFormat,
    createdAt: roleNode.data.role.createdAt ?? '',
    updatedAt: roleNode.data.role.updatedAt ?? '',
  }
}

function setRoleNodeLastError({
  nodeId,
  message,
  setNodes,
}: {
  nodeId: string
  message: string
  setNodes: SetNodes
}): void {
  setNodes(
    prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                lastError: message,
              },
            }
          : node,
      ),
    { syncLayout: false },
  )
}

async function resolveRoleRunMountId({
  workspaceId,
  owningSpace,
}: {
  workspaceId: string
  owningSpace: WorkspaceSpaceState | null
}): Promise<string | null> {
  let mountId = owningSpace?.targetMountId ?? null
  if (mountId || owningSpace || workspaceId.trim().length === 0) {
    return mountId
  }

  const controlSurfaceInvoke = (
    window as unknown as { opencoveApi?: { controlSurface?: { invoke?: unknown } } }
  ).opencoveApi?.controlSurface?.invoke
  if (typeof controlSurfaceInvoke !== 'function') {
    return null
  }

  const mountResult = await window.opencoveApi.controlSurface.invoke<ListMountsResult>({
    kind: 'query',
    id: 'mount.list',
    payload: { projectId: workspaceId },
  })
  mountId = mountResult.mounts[0]?.mountId ?? null
  return mountId
}

export async function runRoleNodeAction(
  nodeId: string,
  inputOverride: string | undefined,
  context: RoleRunActionContext,
  options: RoleRunWorkflowOptions = {},
): Promise<void> {
  const roleNode = context.nodesRef.current.find(node => node.id === nodeId)
  if (!roleNode || roleNode.data.kind !== 'role' || !roleNode.data.role) {
    return
  }

  const input = typeof inputOverride === 'string' ? inputOverride : roleNode.data.role.input
  if (input !== roleNode.data.role.input) {
    context.updateRoleInput(nodeId, input)
  }

  const role = resolveNodeRoleDefinition(roleNode, context.projectRoles)
  if (!role || role.promptTemplate.trim().length === 0) {
    setRoleNodeLastError({
      nodeId,
      message: context.t('roleNode.missingRoleDefinition'),
      setNodes: context.setNodes,
    })
    context.onRequestPersistFlush?.()
    return
  }

  const provider = roleNode.data.role.selectedProvider ?? context.agentSettings.defaultProvider
  const model = resolveAgentModel(context.agentSettings, provider)
  const executablePathOverride = resolveAgentExecutablePathOverride(context.agentSettings, provider)
  const env = resolveAgentLaunchEnv(context.agentSettings, provider)
  const mergedEnv =
    context.environmentVariables && Object.keys(context.environmentVariables).length > 0
      ? { ...env, ...context.environmentVariables }
      : env
  const prompt = composeProjectRolePrompt({ role, input })
  const owningSpace =
    context.spacesRef.current.find(space => space.nodeIds.includes(nodeId)) ?? null
  const executionDirectory = resolveSpaceWorkingDirectory(owningSpace, context.workspacePath)
  const launchGeometry = resolveDefaultAgentLaunchGeometry({
    bucket: context.agentSettings.standardWindowSizeBucket,
    provider,
    terminalFontSize: context.agentSettings.terminalFontSize,
  })

  try {
    const mountId = await resolveRoleRunMountId({ workspaceId: context.workspaceId, owningSpace })
    let launchedSessionId = ''
    let launchedProfileId: string | null = null
    let launchedRuntimeKind: TerminalRuntimeKind | undefined = undefined
    let launchedEffectiveModel: string | null = null
    let agentDirectory = executionDirectory

    if (mountId) {
      const cwdUri =
        owningSpace?.targetMountId && owningSpace.directoryPath.trim().length > 0
          ? toFileUri(owningSpace.directoryPath.trim())
          : null
      const launched = await window.opencoveApi.controlSurface.invoke<LaunchAgentSessionResult>({
        kind: 'command',
        id: 'session.launchAgentInMount',
        payload: {
          mountId,
          cwdUri,
          prompt,
          provider,
          mode: 'new',
          model,
          ...(executablePathOverride ? { executablePathOverride } : {}),
          ...(Object.keys(mergedEnv).length > 0 ? { env: mergedEnv } : {}),
          agentFullAccess: context.agentSettings.agentFullAccess,
          cols: launchGeometry.terminalGeometry.cols,
          rows: launchGeometry.terminalGeometry.rows,
        },
      })
      launchedSessionId = launched.sessionId
      launchedProfileId = launched.profileId
      launchedRuntimeKind = launched.runtimeKind ?? undefined
      launchedEffectiveModel = launched.effectiveModel
      agentDirectory = launched.executionContext.workingDirectory
    } else {
      const launched = await window.opencoveApi.agent.launch({
        provider,
        cwd: executionDirectory,
        profileId: context.agentSettings.defaultTerminalProfileId,
        prompt,
        mode: 'new',
        model,
        ...(executablePathOverride ? { executablePathOverride } : {}),
        ...(Object.keys(mergedEnv).length > 0 ? { env: mergedEnv } : {}),
        agentFullAccess: context.agentSettings.agentFullAccess,
        cols: launchGeometry.terminalGeometry.cols,
        rows: launchGeometry.terminalGeometry.rows,
      })
      launchedSessionId = launched.sessionId
      launchedProfileId = launched.profileId ?? null
      launchedRuntimeKind = launched.runtimeKind
      launchedEffectiveModel = launched.effectiveModel
    }

    const createdAgentNode = await context.createNodeForSession({
      sessionId: launchedSessionId,
      profileId: launchedProfileId,
      runtimeKind: launchedRuntimeKind,
      terminalGeometry: launchGeometry.terminalGeometry,
      title: context.buildAgentNodeTitle(provider, role.name),
      anchor: {
        x: roleNode.position.x + roleNode.data.width + 48,
        y: roleNode.position.y,
      },
      kind: 'agent',
      placement: {
        targetSpaceRect: owningSpace?.rect ?? null,
        preferredDirection: 'right',
      },
      agent: {
        provider,
        prompt,
        model,
        effectiveModel: launchedEffectiveModel,
        launchMode: 'new',
        ...clearResumeSessionBinding(),
        executionDirectory: agentDirectory,
        expectedDirectory: agentDirectory,
        directoryMode: 'workspace',
        customDirectory: null,
        shouldCreateDirectory: false,
        taskId: null,
      },
    })

    if (!createdAgentNode) {
      return
    }

    if (owningSpace) {
      assignNodeToSpaceAndExpand({
        createdNodeId: createdAgentNode.id,
        targetSpaceId: owningSpace.id,
        spacesRef: context.spacesRef,
        nodesRef: context.nodesRef,
        setNodes: context.setNodes,
        onSpacesChange: context.onSpacesChange,
      })
    }

    const now = new Date().toISOString()
    context.appendRoleRunRecord(nodeId, {
      linkedAgentNodeId: createdAgentNode.id,
      record: {
        id: crypto.randomUUID(),
        input,
        prompt,
        outputFormat: role.outputFormat,
        provider,
        agentNodeId: createdAgentNode.id,
        sessionId: launchedSessionId,
        status: 'running',
        output: null,
        outputCapturedAt: null,
        completedAt: null,
        workflowRunId: options.workflowRunId ?? crypto.randomUUID(),
        triggeredByRunId: options.triggeredByRunId ?? null,
        downstreamTriggeredAt: null,
        createdAt: now,
      },
    })
    context.setNodes(
      prevNodes =>
        prevNodes.map(node =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  title: role.name,
                  lastError: null,
                  role:
                    node.data.kind === 'role' && node.data.role
                      ? {
                          ...node.data.role,
                          roleName: role.name,
                          roleDescription: role.description,
                          promptTemplate: role.promptTemplate,
                          inputHint: role.inputHint,
                          outputFormat: role.outputFormat,
                          selectedProvider: provider,
                          input,
                          updatedAt: now,
                        }
                      : node.data.role,
                },
              }
            : node,
        ),
      { syncLayout: false },
    )
    context.onRequestPersistFlush?.()
  } catch (error) {
    const message = context.t('messages.agentLaunchFailed', {
      message: toErrorMessage(error),
    })
    setRoleNodeLastError({ nodeId, message, setNodes: context.setNodes })
    context.onRequestPersistFlush?.()
    context.onShowMessage?.(message, 'error')
  }
}
