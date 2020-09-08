import * as React from 'react'

import { Branch } from '../../models/branch'

import { IBranchListItem } from './group-branches'
import { BranchListItem } from './branch-list-item'
import { IMatches } from '../../lib/fuzzy-find'

export function renderDefaultBranch(
  item: IBranchListItem,
  matches: IMatches,
  currentBranch: Branch | null,
  onContextMenu?: (branch: Branch) => void
): JSX.Element {
  const branch = item.branch
  const commit = branch.tip
  const currentBranchName = currentBranch ? currentBranch.name : null

  const handleContextMenu = (event: React.MouseEvent<any>) => {
    if (onContextMenu !== undefined) {
      event.preventDefault()
      onContextMenu(branch)
    }
  }

  return (
    <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      lastCommitDate={commit ? commit.author.date : null}
      matches={matches}
      onContextMenu={handleContextMenu}
    />
  )
}
