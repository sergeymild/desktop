import React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { RelativeTime } from '../relative-time'
import { IMatches } from '../../lib/fuzzy-find'
import { IFilterListItem } from '../lib/filter-list'
import { ITagItem } from '../../lib/git'

export interface ITagListItem extends IFilterListItem {
  readonly tag: ITagItem
  readonly id: string
}

interface IProps {
  readonly item: ITagListItem
  readonly matches: IMatches
  onContextMenu: (item: ITagListItem) => void
}

export const TagListItem: React.FC<IProps> = (
  {
    item,
    matches: { title },
    onContextMenu,
  }) => {

  const icon = item.tag.remote
    ? OcticonSymbol.server
    : OcticonSymbol.tag

  const handleContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    onContextMenu(item)
  }

  return (
    <div className="tag-list-item" onContextMenu={handleContextMenu}>
      <div className="info">
        <div className="summary" title={item.tag.name}>{item.tag.name}</div>
        <div className="description" title={item.tag.subject || ""}>
          <Octicon className="icon" symbol={icon}/>
          <span className="stash-sha">{item.tag.subject}</span>
          {<RelativeTime date={new Date(item.tag.date)} abbreviate={true}/>}
        </div>
      </div>
    </div>
  )
}