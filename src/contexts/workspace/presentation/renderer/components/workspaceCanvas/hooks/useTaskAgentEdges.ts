import { useMemo } from 'react'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import type { RoleWorkflowLink, TerminalNodeData } from '../../../types'
import {
  ROLE_WORKFLOW_INPUT_HANDLE_ID,
  ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
} from '../../../utils/roleWorkflow'
import { isAgentWorking } from '../helpers'

export function resolveWorkspaceCanvasAgentEdges({
  nodes,
  formatRoleEdgeLabel,
}: {
  nodes: Node<TerminalNodeData>[]
  formatRoleEdgeLabel: (roleName: string) => string
}): Edge[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const taskEdges = nodes
    .filter(node => node.data.kind === 'task' && node.data.task?.linkedAgentNodeId)
    .flatMap(taskNode => {
      const linkedAgentNodeId = taskNode.data.task?.linkedAgentNodeId
      if (!linkedAgentNodeId) {
        return []
      }

      const linkedAgentNode = nodeById.get(linkedAgentNodeId)
      if (!linkedAgentNode || linkedAgentNode.data.kind !== 'agent') {
        return []
      }

      const isActive = isAgentWorking(linkedAgentNode.data.status)
      const edgeClassName = isActive
        ? 'workspace-task-agent-edge workspace-task-agent-edge--active'
        : 'workspace-task-agent-edge workspace-task-agent-edge--idle'
      const markerColor = isActive ? 'rgba(121, 197, 255, 0.95)' : 'rgba(130, 168, 214, 0.78)'

      return [
        {
          id: `task-link-${taskNode.id}-${linkedAgentNode.id}`,
          source: taskNode.id,
          target: linkedAgentNode.id,
          type: 'default',
          animated: isActive,
          className: edgeClassName,
          selectable: false,
          focusable: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: markerColor,
            width: 22,
            height: 22,
          },
        },
      ]
    })

  const roleEdges = nodes
    .filter(node => node.data.kind === 'role' && node.data.role)
    .flatMap(roleNode => {
      const linkedAgentNodeId =
        roleNode.data.role?.linkedAgentNodeId ??
        roleNode.data.role?.runHistory.find(record => record.agentNodeId)?.agentNodeId ??
        null
      if (!linkedAgentNodeId) {
        return []
      }

      const linkedAgentNode = nodeById.get(linkedAgentNodeId)
      if (!linkedAgentNode || linkedAgentNode.data.kind !== 'agent') {
        return []
      }

      const isActive = isAgentWorking(linkedAgentNode.data.status)
      const edgeClassName = isActive
        ? 'workspace-role-agent-edge workspace-role-agent-edge--active'
        : 'workspace-role-agent-edge workspace-role-agent-edge--idle'
      const markerColor = isActive ? 'rgba(110, 216, 177, 0.95)' : 'rgba(120, 180, 160, 0.78)'
      const roleName = roleNode.data.role?.roleName ?? roleNode.data.title

      return [
        {
          id: `role-link-${roleNode.id}-${linkedAgentNode.id}`,
          source: roleNode.id,
          target: linkedAgentNode.id,
          type: 'default',
          animated: isActive,
          className: edgeClassName,
          selectable: false,
          focusable: false,
          label: formatRoleEdgeLabel(roleName),
          labelStyle: {
            fill: 'var(--cove-text)',
            fontSize: 11,
            fontWeight: 600,
          },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 5,
          labelBgStyle: {
            fill: 'var(--cove-surface-strong)',
            fillOpacity: 0.92,
            stroke: 'rgba(120, 180, 160, 0.35)',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: markerColor,
            width: 22,
            height: 22,
          },
        },
      ]
    })

  return [...taskEdges, ...roleEdges]
}

export function resolveWorkspaceCanvasRoleWorkflowEdges({
  nodes,
  roleWorkflowLinks,
  onDeleteRoleWorkflowLink,
  deleteLabel,
}: {
  nodes: Node<TerminalNodeData>[]
  roleWorkflowLinks: RoleWorkflowLink[]
  onDeleteRoleWorkflowLink: (linkId: string) => void
  deleteLabel: string
}): Edge[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]))

  return roleWorkflowLinks.flatMap(link => {
    const sourceNode = nodeById.get(link.sourceRoleNodeId)
    const targetNode = nodeById.get(link.targetRoleNodeId)
    if (
      !sourceNode ||
      !targetNode ||
      sourceNode.data.kind !== 'role' ||
      targetNode.data.kind !== 'role'
    ) {
      return []
    }

    return [
      {
        id: link.id,
        source: link.sourceRoleNodeId,
        target: link.targetRoleNodeId,
        sourceHandle: ROLE_WORKFLOW_OUTPUT_HANDLE_ID,
        targetHandle: ROLE_WORKFLOW_INPUT_HANDLE_ID,
        type: 'roleWorkflow',
        className: 'workspace-role-workflow-edge',
        selectable: false,
        focusable: false,
        data: {
          onDelete: onDeleteRoleWorkflowLink,
          deleteLabel,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'rgba(218, 164, 84, 0.9)',
          width: 22,
          height: 22,
        },
      },
    ]
  })
}

export function useWorkspaceCanvasEdges({
  nodes,
  roleWorkflowLinks,
  onDeleteRoleWorkflowLink,
}: {
  nodes: Node<TerminalNodeData>[]
  roleWorkflowLinks: RoleWorkflowLink[]
  onDeleteRoleWorkflowLink: (linkId: string) => void
}): Edge[] {
  const { t } = useTranslation()

  return useMemo(() => {
    const agentEdges = resolveWorkspaceCanvasAgentEdges({
      nodes,
      formatRoleEdgeLabel: roleName => t('roleNode.edgeLabel', { role: roleName }),
    })
    const roleWorkflowEdges = resolveWorkspaceCanvasRoleWorkflowEdges({
      nodes,
      roleWorkflowLinks,
      onDeleteRoleWorkflowLink,
      deleteLabel: t('roleNode.deleteWorkflowLink'),
    })
    return [...roleWorkflowEdges, ...agentEdges]
  }, [nodes, onDeleteRoleWorkflowLink, roleWorkflowLinks, t])
}
