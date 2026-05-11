import type { MutableRefObject } from 'react'
import type { EdgeTypes, Node } from '@xyflow/react'
import type { RoleWorkflowLink, TerminalNodeData } from '../../../types'
import { RoleWorkflowEdge } from '../edges/RoleWorkflowEdge'
import type { ShowWorkspaceCanvasMessage } from '../types'
import { useWorkspaceCanvasRoleWorkflowLinks } from './useRoleWorkflowLinks'

const WORKSPACE_ROLE_WORKFLOW_EDGE_TYPES: EdgeTypes = {
  roleWorkflow: RoleWorkflowEdge,
}

export function useWorkspaceCanvasRoleWorkflow({
  roleWorkflowLinks,
  onRoleWorkflowLinksChange,
  nodesRef,
  onShowMessage,
}: {
  roleWorkflowLinks: RoleWorkflowLink[]
  onRoleWorkflowLinksChange: (links: RoleWorkflowLink[]) => void
  nodesRef: MutableRefObject<Node<TerminalNodeData>[]>
  onShowMessage?: ShowWorkspaceCanvasMessage
}) {
  const { handleRoleWorkflowConnect, deleteRoleWorkflowLink } = useWorkspaceCanvasRoleWorkflowLinks(
    {
      roleWorkflowLinks,
      onRoleWorkflowLinksChange,
      nodesRef,
      onShowMessage,
    },
  )

  return {
    viewModelProps: {
      roleWorkflowLinks,
      onDeleteRoleWorkflowLink: deleteRoleWorkflowLink,
    },
    viewProps: {
      edgeTypes: WORKSPACE_ROLE_WORKFLOW_EDGE_TYPES,
      onConnect: handleRoleWorkflowConnect,
    },
  }
}
