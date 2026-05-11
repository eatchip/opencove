import { useCallback, type MutableRefObject } from 'react'
import type { Connection, Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import type { RoleWorkflowLink, TerminalNodeData } from '../../../types'
import type { ShowWorkspaceCanvasMessage } from '../types'
import {
  createRoleWorkflowLinkId,
  resolveRoleWorkflowConnection,
  type RoleWorkflowValidationFailure,
  validateRoleWorkflowConnection,
} from '../../../utils/roleWorkflow'

function resolveRoleWorkflowValidationMessage(
  reason: RoleWorkflowValidationFailure,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (reason) {
    case 'same-node':
      return t('messages.roleWorkflowSelfLink')
    case 'non-role-node':
    case 'missing-endpoint':
      return t('messages.roleWorkflowRoleOnly')
    case 'duplicate-link':
      return t('messages.roleWorkflowDuplicate')
    case 'target-already-linked':
      return t('messages.roleWorkflowSingleInput')
    case 'cycle':
      return t('messages.roleWorkflowCycle')
  }
}

export function useWorkspaceCanvasRoleWorkflowLinks({
  roleWorkflowLinks,
  onRoleWorkflowLinksChange,
  nodesRef,
  onShowMessage,
}: {
  roleWorkflowLinks: RoleWorkflowLink[]
  onRoleWorkflowLinksChange: (links: RoleWorkflowLink[]) => void
  nodesRef: MutableRefObject<Node<TerminalNodeData>[]>
  onShowMessage?: ShowWorkspaceCanvasMessage
}): {
  handleRoleWorkflowConnect: (connection: Connection) => void
  deleteRoleWorkflowLink: (linkId: string) => void
} {
  const { t } = useTranslation()

  const handleRoleWorkflowConnect = useCallback(
    (connection: Connection): void => {
      const resolvedConnection = resolveRoleWorkflowConnection(connection)
      const validation = validateRoleWorkflowConnection({
        sourceRoleNodeId: resolvedConnection.sourceRoleNodeId,
        targetRoleNodeId: resolvedConnection.targetRoleNodeId,
        nodes: nodesRef.current,
        links: roleWorkflowLinks,
      })

      if (!validation.ok) {
        onShowMessage?.(resolveRoleWorkflowValidationMessage(validation.reason, t), 'warning')
        return
      }

      const sourceRoleNodeId = resolvedConnection.sourceRoleNodeId ?? ''
      const targetRoleNodeId = resolvedConnection.targetRoleNodeId ?? ''
      const now = new Date().toISOString()
      onRoleWorkflowLinksChange([
        ...roleWorkflowLinks,
        {
          id: createRoleWorkflowLinkId({ sourceRoleNodeId, targetRoleNodeId }),
          sourceRoleNodeId,
          targetRoleNodeId,
          mode: 'auto',
          createdAt: now,
          updatedAt: now,
        },
      ])
    },
    [nodesRef, onRoleWorkflowLinksChange, onShowMessage, roleWorkflowLinks, t],
  )

  const deleteRoleWorkflowLink = useCallback(
    (linkId: string): void => {
      const nextLinks = roleWorkflowLinks.filter(link => link.id !== linkId)
      if (nextLinks.length === roleWorkflowLinks.length) {
        return
      }

      onRoleWorkflowLinksChange(nextLinks)
    },
    [onRoleWorkflowLinksChange, roleWorkflowLinks],
  )

  return {
    handleRoleWorkflowConnect,
    deleteRoleWorkflowLink,
  }
}
