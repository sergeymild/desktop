import * as React from 'react'
import moment from 'moment'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'

interface IProps {
  readonly name: string
  readonly isCurrentBranch: boolean
  readonly lastCommitDate: Date | null
  readonly matches: IMatches
  readonly onContextMenu?: (event: React.MouseEvent<any>) => void
}

export const BranchListItem: React.FC<IProps> = (
  {
    lastCommitDate,
    isCurrentBranch,
    name,
    matches: {title},
    onContextMenu
  }) => {

  const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
  const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
  const infoTitle = isCurrentBranch
    ? 'Current branch'
    : lastCommitDate
      ? lastCommitDate.toString()
      : ''
  return (
    <div className="branches-list-item" onContextMenu={onContextMenu}>
      <Octicon className="icon" symbol={icon}/>
      <div className="name" title={name}>
        <HighlightText text={name} highlight={title}/>
      </div>
      <div className="description" title={infoTitle}>
        {date}
      </div>
    </div>
  )
}
