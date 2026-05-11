import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import { getPtyEventHub } from '@app/renderer/shell/utils/ptyEventHub'
import type { GetSessionFinalMessageResult } from '@shared/contracts/dto'
import type { RoleRunRecord, RoleWorkflowLink, TerminalNodeData } from '../../../types'
import { toErrorMessage } from '../helpers'
import type { ShowWorkspaceCanvasMessage } from '../types'
import type { WorkspaceCanvasActionRefs } from './useActionRefs'

type UpdateRoleRunRecord = (
  nodeId: string,
  runId: string,
  update: (record: RoleRunRecord) => RoleRunRecord,
) => void

interface PendingRoleRun {
  roleNode: Node<TerminalNodeData>
  run: RoleRunRecord
  isLatestRun: boolean
  agentNode: Node<TerminalNodeData> | null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function resolvePendingRoleRunForSession(
  nodes: Node<TerminalNodeData>[],
  sessionId: string,
): PendingRoleRun | null {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  for (const roleNode of nodes) {
    if (roleNode.data.kind !== 'role' || !roleNode.data.role) {
      continue
    }

    const run = roleNode.data.role.runHistory.find(
      candidate => candidate.sessionId === sessionId && candidate.status === 'running',
    )
    if (!run) {
      continue
    }

    const agentNode = run.agentNodeId ? (nodeById.get(run.agentNodeId) ?? null) : null
    return {
      roleNode,
      run,
      isLatestRun: roleNode.data.role.runHistory[0]?.id === run.id,
      agentNode: agentNode?.data.kind === 'agent' ? agentNode : null,
    }
  }

  return null
}

async function readRoleRunFinalMessage({
  run,
  agentNode,
}: {
  run: RoleRunRecord
  agentNode: Node<TerminalNodeData> | null
}): Promise<string | null> {
  if (run.sessionId) {
    try {
      const result = await window.opencoveApi.controlSurface.invoke<GetSessionFinalMessageResult>({
        kind: 'query',
        id: 'session.finalMessage',
        payload: { sessionId: run.sessionId },
      })
      if (typeof result.message === 'string') {
        return result.message
      }
    } catch {
      // Fall back to the provider-specific reader below.
    }
  }

  if (!agentNode?.data.agent || !agentNode.data.startedAt) {
    return null
  }

  const result = await window.opencoveApi.agent.readLastMessage({
    provider: agentNode.data.agent.provider,
    cwd: agentNode.data.agent.executionDirectory,
    startedAt: agentNode.data.startedAt,
    resumeSessionId: agentNode.data.agent.resumeSessionId,
  })
  return result.message
}

async function readRoleRunFinalMessageWithRetry(pending: PendingRoleRun): Promise<string | null> {
  const firstMessage = await readRoleRunFinalMessage({
    run: pending.run,
    agentNode: pending.agentNode,
  })
  if (firstMessage !== null) {
    return firstMessage
  }

  await sleep(500)
  const secondMessage = await readRoleRunFinalMessage({
    run: pending.run,
    agentNode: pending.agentNode,
  })
  if (secondMessage !== null) {
    return secondMessage
  }

  await sleep(1000)
  return readRoleRunFinalMessage({
    run: pending.run,
    agentNode: pending.agentNode,
  })
}

function completeRoleRun({
  nodeId,
  runId,
  output,
  status,
  updateRoleRunRecord,
}: {
  nodeId: string
  runId: string
  output: string | null
  status: RoleRunRecord['status']
  updateRoleRunRecord: UpdateRoleRunRecord
}): void {
  const now = new Date().toISOString()
  updateRoleRunRecord(nodeId, runId, record => ({
    ...record,
    status,
    output,
    outputCapturedAt: output === null ? record.outputCapturedAt : now,
    completedAt: now,
  }))
}

function markRoleRunDownstreamTriggered({
  nodeId,
  runId,
  updateRoleRunRecord,
}: {
  nodeId: string
  runId: string
  updateRoleRunRecord: UpdateRoleRunRecord
}): void {
  const now = new Date().toISOString()
  updateRoleRunRecord(nodeId, runId, record => ({
    ...record,
    downstreamTriggeredAt: now,
  }))
}

export function useWorkspaceCanvasRoleWorkflowRuntime({
  roleWorkflowLinks,
  nodesRef,
  actionRefs,
  updateRoleRunRecord,
  onShowMessage,
}: {
  roleWorkflowLinks: RoleWorkflowLink[]
  nodesRef: MutableRefObject<Node<TerminalNodeData>[]>
  actionRefs: WorkspaceCanvasActionRefs
  updateRoleRunRecord: UpdateRoleRunRecord
  onShowMessage?: ShowWorkspaceCanvasMessage
}): void {
  const { t } = useTranslation()
  const linksRef = useRef(roleWorkflowLinks)
  const processingRunIdsRef = useRef<Set<string>>(new Set())

  useLayoutEffect(() => {
    linksRef.current = roleWorkflowLinks
  }, [roleWorkflowLinks])

  useEffect(() => {
    const ptyEventHub = getPtyEventHub()

    const handleStandby = async (sessionId: string): Promise<void> => {
      const pending = resolvePendingRoleRunForSession(nodesRef.current, sessionId)
      if (!pending || processingRunIdsRef.current.has(pending.run.id)) {
        return
      }

      processingRunIdsRef.current.add(pending.run.id)

      try {
        const output = await readRoleRunFinalMessageWithRetry(pending)
        const latest = resolvePendingRoleRunForSession(nodesRef.current, sessionId)
        if (!latest || latest.run.id !== pending.run.id) {
          return
        }

        completeRoleRun({
          nodeId: latest.roleNode.id,
          runId: latest.run.id,
          output,
          status: 'completed',
          updateRoleRunRecord,
        })

        const trimmedOutput = output?.trim() ?? ''
        if (!latest.isLatestRun || trimmedOutput.length === 0) {
          if (
            latest.isLatestRun &&
            linksRef.current.some(link => link.sourceRoleNodeId === latest.roleNode.id)
          ) {
            onShowMessage?.(t('messages.roleWorkflowOutputEmpty'), 'warning')
          }
          return
        }

        const downstreamLinks = linksRef.current.filter(
          link => link.sourceRoleNodeId === latest.roleNode.id,
        )
        if (downstreamLinks.length > 0) {
          markRoleRunDownstreamTriggered({
            nodeId: latest.roleNode.id,
            runId: latest.run.id,
            updateRoleRunRecord,
          })
        }

        const workflowRunId = latest.run.workflowRunId ?? crypto.randomUUID()
        await Promise.all(
          downstreamLinks.map(link =>
            actionRefs.runRoleRef.current(link.targetRoleNodeId, output ?? '', {
              workflowRunId,
              triggeredByRunId: latest.run.id,
            }),
          ),
        )
      } catch (error) {
        completeRoleRun({
          nodeId: pending.roleNode.id,
          runId: pending.run.id,
          output: null,
          status: 'failed',
          updateRoleRunRecord,
        })
        onShowMessage?.(
          t('messages.roleWorkflowOutputReadFailed', { message: toErrorMessage(error) }),
          'error',
        )
      } finally {
        processingRunIdsRef.current.delete(pending.run.id)
      }
    }

    const unsubscribeState = ptyEventHub.onState(event => {
      if (event.state !== 'standby') {
        return
      }

      void handleStandby(event.sessionId)
    })

    return () => {
      unsubscribeState()
    }
  }, [actionRefs.runRoleRef, nodesRef, onShowMessage, t, updateRoleRunRecord])
}
